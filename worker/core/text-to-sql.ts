import { REPRESENTATIVE_AREAS, type AggregateDatasetInput, type AggregateResult } from "../../shared/core";
import type { CatalogEntry } from "./catalog";
import type { CoreDeps } from "./llm";
import { findRepresentativeArea } from "./search-gaps";
import { ALLOWED_TABLES, guardSelect, MAX_LIMIT } from "./sql-guard";

/**
 * Text-to-SQL（[Issue #119](https://github.com/fffokazaki/tabi-concierge-tokyo/issues/119)）。
 *
 * LLM に SQL を書かせ、`sql-guard` を通してから D1 の `spots` を実照会する。
 *
 * ## LLM は行の中身に触れない
 *
 * LLM の仕事は **SQL を書くことだけ**で、返ってきた行から応答を組み立てるのは決定的な
 * テンプレート（`toResult`）である。出典強制（DOMAIN.md §8・ADR-011）は「事実の出所は
 * オープンデータであって LLM ではない」という要求なので、行の内容を LLM に要約させたら
 * その時点で崩れる。**この分担がこのファイルの設計の芯である。**
 *
 * ## 2枚の壁は独立している
 *
 * | 壁 | 何を見るか | 偽装できるか |
 * | --- | --- | --- |
 * | `sql-guard`（構文） | SELECT のみ・許可テーブルのみ・複文なし | 書き方の工夫で抜けうる。だから2枚目が要る |
 * | 行の検証（意味） | **返ってきた全行の `dataset_id` が入力と一致するか** | 生成 SQL からは偽装できない |
 *
 * ## 絞り込みを強くしすぎない
 *
 * **どのデータセットを使うかは `search_datasets` が既に決めている。** ここの仕事は
 * 「そのデータセットから1行選ぶ」ことで、関連性を審査し直す場ではない。
 *
 * プラン画面は興味を「、」で連結して `intent` に送る（「ラーメン、文化」）。これを全部
 * AND で満たそうとすると 0 行になり、**旅程の停留地が黙って減る**。実測（Issue #120 の
 * 画面確認）: 興味「ラーメン、文化」で停留地が4件から**1件**になった。プロンプトで
 * 「実在する値だけで絞る」「当てはまる category が無ければエリアだけで絞る」「部分一致は
 * 許す」を指示して 3〜4件に戻した。エリアの指定だけは緩めない（そこを緩めると
 * 「浅草の銭湯」に上野の銭湯を返す — 出典が本物であるぶん誤りが見つけにくい壊れ方になる）。
 *
 * `WHERE dataset_id = '...'` が SQL 文字列に含まれるかを見る、という検査は**しない**。
 * `WHERE dataset_id = 'X' OR 1=1` が通ってしまい、「守っているつもり」の分岐になるため
 * （Issue #118 で同じ型の誤りを1つ撤去した）。実際に返ってきた行を見るほうが、
 * 短く書けて偽装もできない。
 */

/** LLM が SQL を書き直せる回数。1回目 ＋ 再生成2回 = 最大3回の推論。 */
export const MAX_SQL_ATTEMPTS = 3;

/** SQL は短い。長く書かせる理由が無く、出力トークンは入力の約6.4倍の単価がかかる。 */
const SQL_MAX_TOKENS = 300;

/**
 * 検証に**必須**の列。ここが欠けたら書き直させる。
 *
 * `dataset_id` は行の検証（別データセット混入の検出）に、`name` は応答の組み立てに要る。
 */
const REQUIRED_COLUMNS = ["dataset_id", "name"] as const;

/**
 * 要約を豊かにするために**お願いする**列。欠けても書き直しは求めない。
 *
 * 実モデルは「必ず含める」と書いた列だけを選ぶ（実測 — `dataset_id, name` しか書かなかった）。
 * 要約から所在地が落ちるだけで応答としては成立するので、必須にはせずここで頼む。
 */
const PREFERRED_COLUMNS = ["address", "note"] as const;

const SYSTEM_PROMPT = [
  "あなたは SQLite の SELECT 文だけを書くアシスタントです。",
  "出力は SQL 文のみ。説明・コードフェンス・前置きを一切付けないでください。",
].join("\n");

/**
 * スキーマと制約を渡すプロンプト。
 *
 * **可変要素（タイムスタンプ・乱数・実行回数など）を入れないこと。** AI Gateway の
 * キャッシュキーはリクエストボディ全体なので、入れた瞬間に同じ問いでもキャッシュが
 * 効かなくなる（ADR-013 決定4）。`intent` と `datasetId` は問いそのものなので可変でよい。
 */
function buildPrompt(
  input: AggregateDatasetInput,
  entry: CatalogEntry,
  facets: Facets,
  previousError?: string,
): string {
  const lines = [
    "## テーブル",
    "spots(id INTEGER, dataset_id TEXT, name TEXT, category TEXT, area TEXT, address TEXT, lat REAL, lon REAL, note TEXT, source_row INTEGER)",
    "datasets(id TEXT, no INTEGER, title TEXT, publisher TEXT, license TEXT, catalog_url TEXT, retrieved_at TEXT, update_frequency TEXT, row_count INTEGER, has_spots INTEGER)",
    "",
    "## この dataset_id の行に実際に入っている値",
    // **推測させない。** カタログのメタデータは category の具体値を持たないので、
    // D1 から実測して渡す。これが無いと LLM は「寺社」のような一般語で絞ろうとし、
    // 実際の値（「名所・史跡」）に当たらず0行になる（実モデルで確認・Issue #119）
    `- category: ${facets.categories.length > 0 ? `「${facets.categories.join("」「")}」` : "（不明）"}`,
    `- area: ${facets.areas.length > 0 ? `「${facets.areas.join("」「")}」` : "（該当なし）"}。対象エリア外の行は NULL`,
    "- note は空文字のことがある",
    "",
    "## 制約",
    `- ${ALLOWED_TABLES.join(" と ")} 以外のテーブルを参照しない`,
    "- SELECT 文を1つだけ書く（セミコロンで区切って複数書かない）",
    `- WHERE 句で dataset_id = '${entry.datasetId}' に必ず限定する`,
    `- SELECT する列に ${[...REQUIRED_COLUMNS, ...PREFERRED_COLUMNS].join(", ")} をすべて含める`,
    `- LIMIT は ${MAX_LIMIT} 以下にする`,
    "",
    "## 絞り込みの強さ",
    // **どのデータセットを使うかは `search_datasets` が決めた後である。** ここは
    // 「そのデータセットから1行選ぶ」のが仕事で、関連性を審査し直す場ではない。
    // intent に複数の関心が畳み込まれて渡ることがあり（プラン画面は興味を「、」で連結して
    // 送る）、全部を AND で満たそうとすると 0 行になる。実測（Issue #120）: 興味
    // 「ラーメン、文化」で `名所・史跡` に問い合わせると 0 行になり、旅程の停留地が
    // 4件から1件へ減った。上の「値について」に無い語では絞らせない
    "- 上の一覧に**実際に存在する値**だけで絞ること。intent に出てくる語でも、この一覧に無いものでは絞らない",
    "- エリアの指定（上野・浅草・渋谷）は必ず守る。ここだけは緩めない",
    "- 複数の関心が並んでいる場合、このデータセットに当てはまるものだけを使う。全部を満たそうとしない",
    // 実測（Issue #120）: 「文化」で `文化財一覧` を引くと、実値は「区民文化財」「区指定文化財」で
    // 完全一致しないため `category = '文化'` を書いて 0 行になった。部分一致か、絞らない
    "- intent の語が一覧の値の一部（例: 「文化」と「区民文化財」）なら LIKE で部分一致させてよい",
    "- intent に当てはまる category が一覧に1つも無ければ、**category では絞らずエリアだけで絞る**",
    "",
    "## 取り出したいもの",
    input.intent,
  ];
  if (previousError) {
    lines.push(
      "",
      "## 直前の試行は次の理由で拒否されました。直して書き直してください",
      previousError,
    );
  }
  return lines.join("\n");
}

/** ```sql ... ``` で囲って返してくる場合があるので、素の SQL に戻す。 */
function unwrap(text: string): string {
  const fenced = /```(?:sql)?\s*([\s\S]*?)```/i.exec(text);
  return (fenced?.[1] ?? text).trim();
}

/** その dataset_id の行に実際に入っている値。プロンプトへ渡すために D1 から読む。 */
type Facets = { categories: string[]; areas: string[] };

/** `DISTINCT` の取り出しは1列につき最大この件数まで。プロンプトが膨らむと入力単価に効く。 */
const MAX_FACET_VALUES = 20;

/**
 * 生成 SQL が「この dataset_id の行に実際に入っている値」だけで絞っているかを検査する
 * （[Issue #148](https://github.com/fffokazaki/tabi-concierge-tokyo/issues/148)）。
 *
 * **プロンプトは前から同じことを頼んでいた。頼んでいるだけで検査していなかった。**
 * 本番（Version `c957fa38`・2026-08-22）で採取した2つの形は、どちらも一覧に無い語で絞って
 * 0行になり、45行・123行あるデータセットについて「当てはまる行は見つかりませんでした」という
 * **偽の未回答**を返していた:
 *
 * ```sql
 * -- 名所・史跡（45行）: 興味の語を name に当てにいった
 * ... AND (category IN ('名所・史跡') OR area IN ('上野','浅草'))
 *     AND (name LIKE '%ラーメン%' OR name LIKE '%自然%' OR name LIKE '%文化%' OR name LIKE '%家族向け%')
 * -- 都市公園・都立公園一覧（123行・category は「公園」だけ）: 無い値で絞った
 * ... AND category IN ('自然','文化') AND area = '渋谷'
 * ```
 *
 * 0行そのものは答えでありうる（DOMAIN.md §7）が、**それは問いが成立している場合の話**である。
 * 存在しない値で絞った結果の0行を「無い」と報告すると、確かめていないことを主張することになり
 * （CLAUDE.md 絶対ルール #1）、`gaps` に偽の欠損が記録される。
 *
 * ## リテラルだけを見ても足りない ―― 列と演算子まで見る
 *
 * 値の集合だけで照合すると、次の2つが素通りする（どちらも0行になる）:
 *
 * | 素通りする形 | なぜ0行か |
 * | --- | --- |
 * | `category = '上野'` | 「上野」は実在値だが **area の**実在値。category には無い |
 * | `category = '文化'`（実値は「区民文化財」） | 部分一致が成立するのは `LIKE` のときだけ。`=` では当たらない |
 *
 * なので列ごとの実在値と突き合わせ、**完全一致は `=` / `IN` に、部分一致は `LIKE` に**限る。
 *
 * ## 通すもの
 *
 * - `dataset_id = '<この ID>'`（必須なので当然通る。別の ID は拒否）
 * - 空文字（`note` は空のことがある。本番で `answered` を返していた SQL に含まれる形）
 * - `area` に対する**代表エリア名**（上野・浅草・渋谷）。訊かれたエリアをこのデータセットが
 *   収録していないときの0行は**正しい未回答**なので、ここを弾くと「別のエリアの行」を返す方へ
 *   誘導してしまう
 *
 * 絞ってよい列は `dataset_id` / `category` / `area` だけ。`name` や `note` に intent の語を
 * 当てにいく形（上の1つ目）は列の時点で拒否する。**どの列の条件か読み取れないものも拒否する**
 * （読み取れないまま通すと、検査したつもりの穴になる）。
 *
 * 直らなければ既存の縮退（キーワード実装）へ落ちるので、**偽の未回答が返ることはない**。
 *
 * 照合に使うのは `readFacets` が読んだ一覧＝**プロンプトで見せた一覧そのもの**である
 * （`MAX_FACET_VALUES` で切り詰めた分も同じ）。見せていない値で絞られても検査を通してしまうと、
 * 「見せた値だけで絞れ」という指示を検査で裏づけたことにならない。
 */
function findFilterProblems(sql: string, entry: CatalogEntry, facets: Facets): string[] {
  const problems: string[] = [];
  const add = (problem: string) => {
    if (!problems.includes(problem)) problems.push(problem);
  };

  for (const use of literalUses(sql)) {
    if (use.value === "") continue; // 空文字との比較は値を作り出していない
    if (use.column === "dataset_id") {
      // `!=` は対象外のデータセット全部を指す。値が正しくても演算子が逆なら限定にならない
      if (use.op !== "=" || use.value !== entry.datasetId) {
        add(`dataset_id は = で '${entry.datasetId}' に限定してください（否定や部分一致は使わない）。`);
      }
      continue;
    }
    if (use.column === "category" || use.column === "area") {
      const actual = use.column === "area" ? [...facets.areas, ...REPRESENTATIVE_AREAS] : facets.categories;
      const problem = judgeAgainstActual(use, actual);
      if (problem) add(problem);
      continue;
    }
    if (use.column === undefined) {
      add(`「${use.value}」がどの列の条件なのか読み取れませんでした。列 = 値 の形で素直に書いてください。`);
      continue;
    }
    add(
      `「${use.value}」で ${use.column} を絞らないでください。` +
        "このデータセットを選んだのは検索側で、行の中身に intent の語が入っている必要はありません。" +
        "絞ってよい列は category と area だけです。",
    );
  }
  return problems;
}

/**
 * 列の実在値と突き合わせる。完全一致は `=` / `IN`、パターン一致は `LIKE` のときだけ許す。
 *
 * **否定は許さない。** `category NOT IN ('公園')` は実在値を使っていても「全部除外して0行」に
 * なりうる ―― 実在値かどうかだけを見ると素通りする（レビュー指摘・信頼度98）。
 *
 * **`LIKE` はワイルドカードの位置まで見る。** `LIKE '文化'` はワイルドカードが無いので
 * SQLite では完全一致であり、実値が「区民文化財」なら0行になる。`includes` で判定すると
 * これが通ってしまう（同・信頼度97）。SQL と同じ意味で照合する。
 */
function judgeAgainstActual(use: LiteralUse, actual: string[]): string | undefined {
  const listed = actual.length > 0 ? `「${actual.join("」「")}」` : "（1件もありません）";
  if (use.op === "LIKE") {
    if (actual.some((value) => likeMatches(use.value, value))) return undefined;
    return (
      `${use.column} に「${use.value}」に当たる値はありません（LIKE はワイルドカードの位置まで効きます）。` +
      `実際に入っているのは ${listed} です。`
    );
  }
  if (use.op !== "=" && use.op !== "IN") {
    return (
      `${use.column} を「${use.op}」で絞らないでください。除外の条件は全行を落として0行になりえます。` +
      "使ってよいのは =、IN、LIKE です。"
    );
  }
  if (actual.includes(use.value)) return undefined;
  return (
    `${use.column} の値は ${listed} です。「${use.value}」は完全一致しないので0行になります。` +
    "一覧の値をそのまま書くか、部分一致させたいなら LIKE を使ってください。"
  );
}

/**
 * SQLite の `LIKE` と同じ意味で照合する（`%` は0文字以上・`_` は1文字）。
 *
 * 位置を無視して「含むかどうか」で見ると、`LIKE '文化%'`（前方一致）が「区民文化財」に
 * 当たると誤判定する。**検査は実行される意味と同じでなければ、検査したことにならない**
 * （[ACE-137-1](../../docs/08-knowledge/playbook/architecture.md#ace-137-1) と同じ筋）。
 *
 * **正規表現に変換しない。** `%` を `[\s\S]*` へ写すと `%%%…X%%%` のようなパターンが
 * 破滅的バックトラックを起こす ―― 実測で `%` 40個 × 200文字の非一致に対し **2分でも終わらなかった**
 * （`likeMatches` は LLM が書いた文字列を毎回受け取るので、これは Worker の CPU を焼く経路になる）。
 * 貪欲マッチの位置を覚えて戻る、素直な線形の照合にしてある。
 */
function likeMatches(pattern: string, value: string): boolean {
  // SQLite の LIKE は ASCII の大小を区別しない。日本語は元から区別されないので影響しない
  const chars = [...pattern.toLowerCase()];
  const target = [...value.toLowerCase()];
  let p = 0;
  let v = 0;
  let star = -1;
  let resume = 0;
  while (v < target.length) {
    if (p < chars.length && (chars[p] === "_" || chars[p] === target[v])) {
      p++;
      v++;
      continue;
    }
    if (p < chars.length && chars[p] === "%") {
      star = p++;
      resume = v;
      continue;
    }
    if (star < 0) return false;
    // 直前の `%` が1文字多く飲み込んだ、として再開する（戻り先は1つだけなので指数爆発しない）
    p = star + 1;
    v = ++resume;
  }
  while (p < chars.length && chars[p] === "%") p++;
  return p === chars.length;
}

/** 文字列リテラルと、その直前に現れる「列 演算子」。 */
type LiteralUse = { value: string; column?: string; op?: string };

/**
 * SQL 中の文字列リテラルを、直前の「列 演算子」つきで取り出す。
 *
 * **検査するのは `guardSelect` を通ったあとの文字列**（＝実際に D1 へ渡すもの）である。
 * 生成された生テキストを見て別の文字列を実行すると、その差がそのまま迂回路になる
 * （[ACE-137-1](../../docs/08-knowledge/playbook/architecture.md#ace-137-1)）。
 *
 * **ダブルクォートも見る。** SQLite は `"自然"` を「その名前の列が無ければ文字列」として
 * 扱うため、`category = "自然"` は**エラーにならず0行を返す**（実測。D1 で確認したうえで
 * `text-to-sql.test.ts` に固定した）。シングルクォートだけ見ていると、この書き方が
 * そのまま偽の未回答になる。ただし `"name"` のような**識別子としての**引用もあるので、
 * 直前に「列 演算子」が読み取れたときだけ値として扱う。
 */
function literalUses(sql: string): LiteralUse[] {
  const uses: LiteralUse[] = [];
  let i = 0;
  while (i < sql.length) {
    const quote = sql[i];
    if (quote !== "'" && quote !== '"') {
      i++;
      continue;
    }
    const start = i;
    i++;
    let value = "";
    while (i < sql.length) {
      if (sql[i] === quote) {
        if (sql[i + 1] === quote) {
          value += quote;
          i += 2;
          continue;
        }
        i++;
        break;
      }
      value += sql[i];
      i++;
    }
    const context = contextOf(sql.slice(0, start));
    // ダブルクォートは「列 演算子」が読み取れたときだけ値とみなす（識別子の引用と区別する）
    if (quote === '"' && context.column === undefined) continue;
    uses.push({ value, ...context });
  }
  return uses;
}

/**
 * リテラルの直前から「列 演算子」を読む。`IN ('a','b')` の2つ目以降も同じ列に結びつける。
 * 読み取れなければ `undefined` を返し、呼び出し側が拒否する（読めないものは通さない）。
 */
const LITERAL_CONTEXT =
  /([A-Za-z_][A-Za-z0-9_]*)\s*(=|<>|!=|(?:not\s+)?like|(?:not\s+)?in)\s*\(?\s*(?:(?:'(?:[^']|'')*'|"(?:[^"]|"")*")\s*,\s*)*$/i;

function contextOf(before: string): { column?: string; op?: string } {
  const matched = LITERAL_CONTEXT.exec(before);
  if (!matched) return {};
  // **`NOT` を潰さない。** `NOT LIKE` を `LIKE` に正規化すると、除外の条件が
  // 「当たる LIKE」として通ってしまう（レビュー指摘）
  const op = matched[2]!.toUpperCase().replace(/\s+/g, " ");
  return { column: matched[1]!.toLowerCase(), op };
}

/**
 * 「絞り込みを全部外したら何行あるか」をデータに訊く（[Issue #148](https://github.com/fffokazaki/tabi-concierge-tokyo/issues/148)）。
 *
 * ## なぜ形の検査だけでは閉じないか
 *
 * 生成 SQL の書き方を並べて禁じる検査は、レビューのたびに新しい抜け道が出た ―― 数値比較
 * （`AND 1 = 0`）・`IS NULL`・外側の `NOT`・空文字との比較・定数式。**どれも「実在値だけで
 * 絞れ」を満たしたまま0行にできる。** 形の列挙では閉じない。
 *
 * 0行になった時点で「dataset_id（＋訊かれたエリア）だけ」で数え直せば、**絞り込みが強すぎたのか
 * 本当に無いのか**がデータで分かる。どんな書き方をされても効くのでここが最後の歯止めになる。
 * 推論は増えない（D1 を1回引くだけ）。
 *
 * **エリアは緩めない。** 「渋谷の…」と訊かれて渋谷の行が無いとき、エリアまで外して数えると
 * 上野の行が見つかり「絞りすぎ」と誤判定してしまう ―― 書き直しの果てに**別のエリアの行**を
 * 返す方へ誘導することになる（それは偽の未回答よりさらに悪い）。
 */
async function countRelaxed(
  input: AggregateDatasetInput,
  entry: CatalogEntry,
  deps: CoreDeps,
): Promise<number> {
  const area = findRepresentativeArea(input.intent);
  const escapedId = entry.datasetId.replace(/'/g, "''");
  const areaClause = area ? ` AND area = '${area.replace(/'/g, "''")}'` : "";
  const result = await deps.sql.select(
    `SELECT COUNT(*) AS n FROM spots WHERE dataset_id = '${escapedId}'${areaClause} LIMIT 1`,
  );
  if (!result.ok) return 0; // 数えられないなら「絞りすぎ」と主張しない（fail closed）
  const n = result.rows[0]?.["n"];
  return typeof n === "number" ? n : 0;
}

/** 書き直しの指示に使う一文。何件あるかまで見せないと、同じ SQL を書き直してくる。 */
function describeRelaxed(input: AggregateDatasetInput, count: number): string {
  const area = findRepresentativeArea(input.intent);
  return area
    ? `この dataset_id には「${area}」の行が ${count} 件あります`
    : `この dataset_id には ${count} 件の行があります`;
}

/**
 * `category` / `area` の実在値を D1 から読む。**LLM は使わない**（推論回数を増やさない）。
 *
 * SQL に埋める `dataset_id` は `entry.datasetId`（カタログの定数）であって、利用者入力の
 * `input.datasetId` ではない。`findEntry` が一致を確かめた後なので値は同じだが、
 * **SQL 文字列へ差し込む値は自分が持つ既知の定数から取る**という形にしておく。
 *
 * 読めなかったら空で続ける。ここが取れなくても SQL 生成そのものは成立する
 * （当たりにくくなるだけ）ので、回答経路を落とす理由にはしない。
 */
async function readFacets(entry: CatalogEntry, deps: CoreDeps): Promise<Facets> {
  const distinct = async (column: "category" | "area"): Promise<string[]> => {
    const result = await deps.sql.select(
      `SELECT DISTINCT ${column} AS value FROM spots WHERE dataset_id = '${entry.datasetId}' AND ${column} IS NOT NULL LIMIT ${MAX_FACET_VALUES}`,
    );
    if (!result.ok) return [];
    return result.rows
      .map((row) => row["value"])
      .filter((value): value is string => typeof value === "string" && value.trim() !== "");
  };
  const [categories, areas] = await Promise.all([distinct("category"), distinct("area")]);
  return { categories, areas };
}

export type TextToSqlOutcome =
  /** 実照会で行が取れた。`query` には**実際に実行した SQL** を入れる */
  | { kind: "answered"; result: AggregateResult; query: string }
  /** SQL は成功したが0行。これは障害ではなく、正当な「答えられない」（記録の対象） */
  | { kind: "empty"; sql: string }
  /** インフラ障害・出力不正。**縮退してキーワード実装に戻る**（記録の対象にしない） */
  | { kind: "failed"; cause: string };

/**
 * 行から応答を決定的に組み立てる。
 *
 * **足りない材料は書かない。** `address` が NULL のときに「所在地は不明」のような一文を
 * 足すと、データに無いことを述べたことになる（絶対ルール #1）。短い要約になるだけでよい。
 */
function toResult(row: Record<string, unknown>, entry: CatalogEntry): AggregateResult | undefined {
  const name = typeof row["name"] === "string" ? row["name"].trim() : "";
  if (name === "") return undefined;

  const address = typeof row["address"] === "string" ? row["address"].trim() : "";
  const note = typeof row["note"] === "string" ? row["note"].trim() : "";

  const parts = [
    address === "" ? undefined : `所在地は${address}。`,
    note === "" ? undefined : `${note.replace(/。$/, "")}。`,
    `${entry.provider}が${entry.title}として公開している${entry.rowCount}件のうちの1件。`,
  ].filter((part): part is string => part !== undefined);

  return { name, summary: parts.join("") };
}

/**
 * 実照会を1回試みる。
 *
 * 失敗の分類（Issue #119）:
 * - `failed` … (a) LLM やD1 のインフラ障害 / (b) 出力不正。**縮退する。記録はしない**
 *   （答えられなかったのではなく、答えを取りに行けなかった）
 * - `empty` … (c) SQL は通ったが0行。**正当な未回答として記録する**
 */
export async function aggregateViaTextToSql(
  input: AggregateDatasetInput,
  entry: CatalogEntry,
  deps: CoreDeps,
): Promise<TextToSqlOutcome> {
  try {
    return await attemptTextToSql(input, entry, deps);
  } catch (cause) {
    // `LlmClient` / `SqlExecutor` は「throw しない」という約束だが、**約束は強制ではない**。
    // 注入される実装は差し替え可能で、ここで例外が抜けると `app.onError` の 500 になり、
    // 設計した縮退（キーワード実装へ戻る）が働かないまま利用者にエラーが返る。
    // 縮退できる場所で 500 を出さない
    console.error("[text-to-sql] 想定外の例外が発生しました", { datasetId: entry.datasetId, cause });
    return { kind: "failed", cause: `想定外の例外: ${String(cause)}` };
  }
}

async function attemptTextToSql(
  input: AggregateDatasetInput,
  entry: CatalogEntry,
  deps: CoreDeps,
): Promise<TextToSqlOutcome> {
  let previousError: string | undefined;
  const facets = await readFacets(entry, deps);

  for (let attempt = 1; attempt <= MAX_SQL_ATTEMPTS; attempt++) {
    const completion = await deps.llm.complete({
      purpose: "sql_generate",
      system: SYSTEM_PROMPT,
      user: buildPrompt(input, entry, facets, previousError),
      maxTokens: SQL_MAX_TOKENS,
    });
    if (!completion.ok) {
      // インフラ障害はリトライしても同じなので、ここで打ち切って縮退する
      return { kind: "failed", cause: `LLM 呼び出しに失敗しました: ${String(completion.cause)}` };
    }

    const guarded = guardSelect(unwrap(completion.text));
    if (!guarded.ok) {
      previousError = guarded.reason;
      console.warn("[text-to-sql] 生成 SQL を拒否しました", {
        attempt,
        datasetId: input.datasetId,
        reason: guarded.reason,
      });
      continue;
    }

    // 実在しない値で絞っていないか（Issue #148）。**実行する前に**見る ―― 実行してしまうと
    // 0行が返り、それが「探したが無かった」という答えとして利用者にも gaps にも流れる
    const problems = findFilterProblems(guarded.sql, entry, facets);
    if (problems.length > 0) {
      previousError = problems.join("\n");
      console.warn("[text-to-sql] 実在しない値で絞る SQL を拒否しました", {
        attempt,
        datasetId: input.datasetId,
        problems,
        sql: guarded.sql,
      });
      continue;
    }

    const executed = await deps.sql.select(guarded.sql);
    if (!executed.ok) {
      previousError = `SQL の実行に失敗しました: ${String(executed.cause)}`;
      console.warn("[text-to-sql] 生成 SQL の実行に失敗しました", { attempt, sql: guarded.sql });
      continue;
    }

    // ── 2枚目の壁（意味）。生成 SQL の書き方では偽装できない ────────────────
    // 別データセットの行が混ざったまま返すと、出典として別のデータセットを名乗ることになる。
    // それは「出典が本物であるぶん誤りが見つけにくい」最悪の壊れ方である（絶対ルール #2）
    const foreign = executed.rows.find((row) => row["dataset_id"] !== entry.datasetId);
    if (foreign) {
      console.error("[text-to-sql] 指定外のデータセットの行が返りました", {
        datasetId: entry.datasetId,
        returned: foreign["dataset_id"],
        sql: guarded.sql,
      });
      return { kind: "failed", cause: "指定したデータセット以外の行が返りました" };
    }

    if (executed.rows.length === 0) {
      // **「無かった」と言う前に、緩めた問いでも0行かをデータに訊く**（Issue #148）。
      // 絞り込みが強すぎただけなら、それは答えではなく書き直すべき SQL である
      const relaxed = await countRelaxed(input, entry, deps);
      if (relaxed > 0) {
        previousError =
          `この SQL は0行でした。ただし ${describeRelaxed(input, relaxed)}。絞り込みが強すぎます。` +
          "category の条件を外し、エリア（訊かれている場合）だけで絞って書き直してください。";
        console.warn("[text-to-sql] 0行だが緩めれば行がある SQL を拒否しました", {
          attempt,
          datasetId: input.datasetId,
          relaxed,
          sql: guarded.sql,
        });
        continue;
      }
      // (c) 障害ではない。「探したが無かった」という答えである ―― 緩めても0行なので earned
      return { kind: "empty", sql: guarded.sql };
    }

    const result = toResult(executed.rows[0]!, entry);
    if (!result) {
      previousError = `SELECT する列に ${REQUIRED_COLUMNS.join(" と ")} を含めてください`;
      console.warn("[text-to-sql] 返った行から応答を組み立てられませんでした", { attempt, sql: guarded.sql });
      continue;
    }

    if (attempt > 1) {
      // リトライ回数は無料枠の消費に直結する（プラン1本 = aggregate 4回 × 最大3回）。
      // ダッシュボードで気づく前に、ログで頻度が見えるようにしておく
      console.warn("[text-to-sql] リトライ後に成功しました", { attempt, datasetId: input.datasetId });
    }
    return {
      kind: "answered",
      result,
      query: `D1 実照会: ${guarded.sql}（${entry.retrievedAt} 取得のスナップショット・全${entry.rowCount}行）`,
    };
  }

  return { kind: "failed", cause: `${MAX_SQL_ATTEMPTS} 回試行しましたが有効な SQL を生成できませんでした` };
}
