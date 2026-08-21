import type { SearchDatasetsInput } from "../../shared/core";
import { CATALOG, findEntry } from "./catalog";
import type { CoreDeps } from "./llm";

/**
 * メタデータRAG（[Issue #120](https://github.com/fffokazaki/tabi-concierge-tokyo/issues/120)）。
 *
 * 自然文の質問を**構造化入力へ分解**し、あわせてカタログから関連しそうなデータセットを
 * 順位づけする。分解と選定を LLM 1回にまとめてあるのは、分ける理由が無いため
 * （呼び出し1回ぶんのニューロンと往復が減る）。
 *
 * ## 全カタログ・イン・プロンプト方式（Vectorize 不採用）
 *
 * 確定10件のメタデータはプロンプトに全件入る大きさで、10件の空間に埋め込み近傍検索を
 * 持ち込む意味が無い。Vectorize はバインディング・インデックス・埋め込み生成・取り込みの
 * 4つを運用対象として増やす。
 *
 * **9,600件へ拡張するときは、`buildCatalogSection` の「候補列挙」だけを Vectorize の
 * 前段（上位N件を引く）に差し替えればよい。** この関数の入出力は変わらないので、
 * 呼び出し側（`operations.ts` の殻）に手を入れずに済む。
 *
 * ## LLM に書かせないもの
 *
 * `matchReason`（なぜその候補なのか）は**カタログの実測文字列**を使う。LLM に書かせると、
 * 応答としてユーザーに出る文が実測の裏を持たなくなる（絶対ルール #1・#2）。
 * ここが返すのは「どのデータセットか」までで、「なぜか」はカタログが持つ。
 */

/** 分解の結果。すべて「LLM がそう読んだ」であって、事実の主張ではない。 */
export type Interpretation = {
  /** 目的地として訊かれた代表エリア（`SearchDatasetsInput.areas` へ渡す） */
  areas: string[];
  /** 訊かれた興味（`SearchDatasetsInput.interests` へ渡す） */
  interests: string[];
  /** 関連しそうな順のデータセットID。**実在確認済み**（ハルシネーションは除外済み） */
  rankedDatasetIds: string[];
};

/** 分解が使えなかったときは、キーワード実装へ縮退する。 */
export type InterpretOutcome =
  | { ok: true; interpretation: Interpretation }
  | { ok: false; cause: string };

/** 分解の出力は短い。長く書かせる理由が無く、出力トークンは入力の約6.4倍の単価がかかる。 */
const INTERPRET_MAX_TOKENS = 400;

/** 配列の要素数の上限。`parse.ts` の `MAX_LIST_ITEMS` と揃える（境界の規約を面ごとにずらさない）。 */
const MAX_ITEMS = 20;

/** 要素の文字数上限。`parse.ts` の `MAX_LIST_ITEM_LENGTH` と揃える。 */
const MAX_ITEM_LENGTH = 100;

const SYSTEM_PROMPT = [
  "あなたは日本の観光データカタログの司書です。",
  "利用者の質問を分解し、指定された JSON だけを出力してください。",
  "説明・コードフェンス・前置きを一切付けないでください。",
].join("\n");

/**
 * カタログ10件の要点をプロンプトへ入れる。
 *
 * **9,600件へ拡張するときに差し替えるのはここだけ**（Vectorize で上位N件を引いて同じ形に
 * 整形する）。`matchReason` を渡しているのは、LLM が「何が入っているデータか」を
 * 判断する材料であって、そのまま書き写させるためではない。
 */
const buildCatalogSection = (): string =>
  CATALOG.map(
    (entry) =>
      `- ${entry.datasetId}: 「${entry.title}」（${entry.provider}）${entry.areas.length > 0 ? `／収録エリア: ${entry.areas.join("・")}` : "／エリア別の地物なし"}／${entry.matchReason}`,
  ).join("\n");

/**
 * プロンプトを組み立てる。
 *
 * **可変要素（タイムスタンプ・乱数・実行回数）を入れないこと。** AI Gateway のキャッシュキーは
 * リクエストボディ全体なので、入れた瞬間に同じ質問でもキャッシュが効かなくなる（ADR-013 決定4）。
 */
const buildPrompt = (query: string): string =>
  [
    "## 利用できるデータセット",
    buildCatalogSection(),
    "",
    "## 対象エリア",
    "上野・浅草・渋谷の3つだけ。これ以外の地名が質問に出てきても areas には入れないこと。",
    "",
    "## 出力する JSON",
    '{"areas": ["訊かれた対象エリア"], "interests": ["訊かれた興味を短い日本語のラベルで"], "rankedDatasetIds": ["関連しそうな順のデータセットID"]}',
    "",
    "- areas は上野・浅草・渋谷のうち、目的地として訊かれたものだけ。出発地は入れない",
    "- interests は「寺社」「美術館」「トイレ」のような短いラベル。質問文をそのまま入れない",
    "- rankedDatasetIds は上の一覧にある ID だけ。無いものを作らない",
    "",
    "## 質問",
    query,
  ].join("\n");

/** `{...}` を1つ取り出す。前後に説明やコードフェンスが付いていても拾えるようにする。 */
function extractJsonObject(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return undefined;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return undefined;
  }
}

/** 文字列の配列として読めるものだけを、境界の規約（長さ・件数）に収めて返す。 */
function readStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== "string") continue;
    const trimmed = item.trim();
    if (trimmed === "" || trimmed.length > MAX_ITEM_LENGTH) continue;
    seen.add(trimmed);
    if (seen.size >= MAX_ITEMS) break;
  }
  return [...seen];
}

/**
 * 自然文を構造化入力へ分解する。
 *
 * 失敗したら `ok: false` を返すだけで、**縮退の判断は呼び出し側が持つ**
 * （どう縮退するかはコア操作の都合であって、この関数の都合ではない）。
 */
export async function interpretQuery(query: string, deps: CoreDeps): Promise<InterpretOutcome> {
  const completion = await deps.llm.complete({
    purpose: "search_interpret",
    system: SYSTEM_PROMPT,
    user: buildPrompt(query),
    maxTokens: INTERPRET_MAX_TOKENS,
  });
  if (!completion.ok) return { ok: false, cause: `LLM 呼び出しに失敗しました: ${String(completion.cause)}` };

  const parsed = extractJsonObject(completion.text);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { ok: false, cause: `JSON として読めませんでした: ${completion.text.slice(0, 200)}` };
  }
  const record = parsed as Record<string, unknown>;

  // 実在しない ID を落とす。**ただしこれは安全装置ではない。**
  //
  // 候補は `CATALOG` から作られるので、LLM が作った ID は**そもそも候補になれない**
  // （`rankedDatasetIds` は並び順にしか使わず、偽の ID が混ざっても実在 ID 同士の
  // 相対順序は変わらない）。ここを「存在しないデータセットを出典として名乗るのを防ぐ」
  // と読まないこと — コードが持っていない安全性を主張することになる。
  //
  // 実際の価値は `console.warn` の側にある。ハルシネーションが頻発するならプロンプトの
  // 問題なので、**見えるようにしておく**。`ranked` を実在するものだけに保つのは、
  // 将来この配列を選定に使うようになったときへの備えでもある
  const ranked: string[] = [];
  for (const id of readStrings(record["rankedDatasetIds"])) {
    if (findEntry(id)) ranked.push(id);
    else console.warn("[interpret] 実在しないデータセットIDを除外しました", { id, query });
  }

  return {
    ok: true,
    interpretation: {
      areas: readStrings(record["areas"]),
      interests: readStrings(record["interests"]),
      rankedDatasetIds: ranked,
    },
  };
}

/**
 * 分解の結果を、既存のコア判定が読める形（構造化入力）へ重ねる。
 *
 * **利用者が明示的に送った値は上書きしない。** 構造化入力は「呼び出し側がそう言った」
 * という一次情報で、LLM の読みより強い（ADR-011）。
 */
export const withInterpretation = (
  input: SearchDatasetsInput,
  interpretation: Interpretation,
): SearchDatasetsInput => ({
  ...input,
  areas: input.areas ?? (interpretation.areas.length > 0 ? interpretation.areas : undefined),
  interests: input.interests ?? (interpretation.interests.length > 0 ? interpretation.interests : undefined),
});
