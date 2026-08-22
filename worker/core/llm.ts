/**
 * LLM クライアントと D1 読み取りの縫い目（[ADR-002](../../docs/06-reference/DECISIONS.md)・ADR-013）。
 *
 * `worker/core/` は `/api/*` と `/mcp` の両方から呼ばれる（ADR-008）。外部資源への到達手段を
 * ここで interface として切り、実装は殻（`worker/index.ts` / `worker/mcp.ts`）が注入する。
 * `GapRecorder`（`gaps.ts`）と同じ形で、理由も同じ — **注入を optional にすると、片方の経路で
 * 渡し忘れても型が通り、その経路だけ黙って縮退する**。縮退しても応答は返るので誰も気づけない。
 *
 * ## throw しない
 *
 * `complete` も `select` も失敗を `ok: false` で返し、例外を投げない。呼び出し側は
 * 「失敗したときどうするか」を必ず書くことになり、握りつぶしが `try {} catch {}` の
 * 省略として紛れ込む余地が無くなる（`d1GapRecorder` と同じ設計）。
 */

/** LLM に何をさせるための呼び出しか。ログとダッシュボードで用途別に追えるようにする。 */
export type LlmPurpose = "search_interpret" | "sql_generate";

export type LlmRequest = {
  purpose: LlmPurpose;
  system: string;
  user: string;
  /** 出力トークンの上限。**出力は入力の約6.4倍の単価**なので、ここを絞ることが予算の主戦場になる */
  maxTokens: number;
};

export type LlmResult = { ok: true; text: string } | { ok: false; cause: unknown };

/**
 * 目的別のメソッドを生やさず、汎用の `complete` 1本にしてある。
 *
 * プロンプトの組み立てと出力のパース（一番壊れやすいところ）が `worker/core/` の純関数側に残り、
 * テストのモックは決め打ちの文字列を返すだけで済む。注入の縫い目が1つで済むのも同じ理由。
 */
export interface LlmClient {
  complete(request: LlmRequest): Promise<LlmResult>;
}

/**
 * 使うモデル。差し替えはこの1箇所（[LLM-MODEL-CANDIDATES.md](../../docs/06-reference/LLM-MODEL-CANDIDATES.md)）。
 *
 * 当初案の `@cf/meta/llama-3.1-8b-instruct-fp8-fast` から変更した。日本語が公式サポート外で、
 * 訪日観光客の質問を分解するという用途に合わなかったため（単価はほぼ同額）。
 */
export const LLM_MODEL = "@cf/qwen/qwen3-30b-a3b-fp8";

/**
 * 思考を止める指示。**プロンプトの末尾に必ず付ける。**
 *
 * `qwen3-30b-a3b-fp8` は reasoning モデルで、素で呼ぶと本文の前に思考トークンを大量に吐く。
 * 実測（2026-08-21・Issue #116）:
 *
 * | 条件 | finish_reason | ニューロン | 出力トークン | 本文 |
 * | --- | --- | --- | --- | --- |
 * | 素 | stop | 11.70 | 379 | 完全な JSON |
 * | `/no_think` | stop | **1.79** | **53** | 完全な JSON |
 * | `enable_thinking: false` | **length** | 15.76 | 512（上限） | **途中で切断** |
 * | `response_format` | **length** | 15.76 | 512（上限） | **途中で切断** |
 *
 * 効くのはこれだけで、`enable_thinking` も `response_format` も Cloudflare のエンドポイントでは
 * 思考を止めない。止めないと思考が `maxTokens` を食い尽くして **JSON が途中で切れる** —
 * 閉じ括弧が存在しないので、パーサをいくら寛容にしても復元できない。**入力側で止めるしかない。**
 *
 * モデル固有の癖なので、プロンプトを組み立てる `worker/core/` 側ではなく、
 * Workers AI のアダプタであるこのファイルが面倒をみる。
 */
const NO_THINK = "/no_think";

/** `env.AI.run` の応答のうち、ここが読む部分。SDK の型に寄りかからず必要な形だけを書く。 */
type ChatCompletion = {
  choices?: {
    finish_reason?: string;
    message?: { content?: string | null };
  }[];
};

/**
 * AI Gateway が受けるキャッシュ TTL の範囲（秒）。
 * [公式ドキュメント](https://developers.cloudflare.com/ai-gateway/features/caching/)の
 * 「The minimum TTL is 60 seconds and the maximum TTL is one month」より（2026-08-22 確認）。
 */
const MIN_CACHE_TTL_SECONDS = 60;
const MAX_CACHE_TTL_SECONDS = 2_592_000;

/** 既定の TTL。ADR-013 決定4 の 3600 秒をそのまま既定として持つ。 */
export const DEFAULT_CACHE_TTL_SECONDS = 3600;

/**
 * キャッシュをどう扱うか。**数値1本にせず種別を持たせてある。**
 *
 * 「0 なら無効」を秒数の中に埋めると、`cacheTtl: 0` を素で渡す実装になりやすい。
 * AI Gateway でキャッシュを使わない指定は `skipCache` であって TTL 0 ではないので、
 * 呼び出し側が取り違えた瞬間に**キャッシュが効いたまま「引き直したつもり」になる**。
 */
export type GatewayCachePolicy = { kind: "cache"; ttlSeconds: number } | { kind: "skip" };

/**
 * `vars.AI_GATEWAY_CACHE_TTL` を解釈する（[Issue #143](https://github.com/fffokazaki/tabi-concierge-tokyo/issues/143)）。
 *
 * `"0"` はキャッシュを使わない指定、それ以外は秒数。収録リハーサルで同じ質問文を
 * 引き直すための入口で、既定は現行どおり 3600 秒なので何もしなければ挙動は変わらない。
 *
 * **不正値では throw しない。** ここで落とすと収録直前に Worker ごと死ぬ。既定へ倒して
 * `console.error` に出す — `npx wrangler tail` で拾える形にしておくのが唯一の気づく手段になる
 * （この判断はファイル冒頭の「縮退は静かに起きる」と同じ理由）。
 */
export function resolveCachePolicy(raw: string): GatewayCachePolicy {
  const trimmed = raw.trim();
  if (trimmed === "0") return { kind: "skip" };

  const seconds = Number(trimmed);
  if (
    trimmed !== "" &&
    Number.isInteger(seconds) &&
    seconds >= MIN_CACHE_TTL_SECONDS &&
    seconds <= MAX_CACHE_TTL_SECONDS
  ) {
    return { kind: "cache", ttlSeconds: seconds };
  }

  console.error(
    `AI_GATEWAY_CACHE_TTL が不正です（${JSON.stringify(raw)}）。` +
      `0（キャッシュを使わない）か ${MIN_CACHE_TTL_SECONDS}〜${MAX_CACHE_TTL_SECONDS} の整数を指定してください。` +
      `既定の ${DEFAULT_CACHE_TTL_SECONDS} 秒で続行します`,
  );
  return { kind: "cache", ttlSeconds: DEFAULT_CACHE_TTL_SECONDS };
}

/**
 * Workers AI の実装。**必ず AI Gateway を経由する**（ADR-013 決定1）。
 *
 * `gatewayId` は `env.AI_GATEWAY_ID` から渡すこと（ハードコード禁止・ADR-013 決定2）。
 * キャッシュキーはリクエストボディ全体なので、`system` / `user` にタイムスタンプ・乱数・
 * リクエストIDなどの可変要素を入れないこと（入れた瞬間にキャッシュが全件ミスになる）。
 */
export function workersAiLlm(ai: Ai, gatewayId: string, cache: GatewayCachePolicy): LlmClient {
  const gateway =
    cache.kind === "skip"
      ? { id: gatewayId, skipCache: true }
      : { id: gatewayId, cacheTtl: cache.ttlSeconds };

  return {
    async complete({ purpose, system, user, maxTokens }) {
      try {
        const response = (await ai.run(
          LLM_MODEL,
          {
            messages: [
              { role: "system", content: system },
              { role: "user", content: `${user}\n\n${NO_THINK}` },
            ],
            max_tokens: maxTokens,
          } as never,
          { gateway },
        )) as ChatCompletion;

        const choice = response.choices?.[0];
        const text = choice?.message?.content;

        // **`stop` 以外はすべて失敗として扱う。** 危ないのは `length`（出力が上限に達して
        // 途中で切れている。JSON なら閉じていないので、パースが偶然通っても中身は信用できない）
        // だが、`content_filter` のように本文が非空のまま打ち切られる終了理由も同じ性質を持つ。
        // 既知の危険値を列挙する形にすると、モデルや SDK が新しい終了理由を足したとき
        // **黙って成功側に倒れる**ので、許可する値のほうを列挙する
        if (choice?.finish_reason !== "stop") {
          return {
            ok: false,
            cause: new Error(
              `正常終了しませんでした（finish_reason=${String(choice?.finish_reason)}・max_tokens=${maxTokens}）`,
            ),
          };
        }
        // 思考モデルは本文を出さずに `content: null` を返す形を持つ（`reasoning_content` だけ埋まる）
        if (typeof text !== "string" || text.trim() === "") {
          return { ok: false, cause: new Error("応答に本文がありません（content が空）") };
        }
        return { ok: true, text: text.trim() };
      } catch (cause) {
        console.error("[llm] 推論の呼び出しに失敗しました", { purpose, model: LLM_MODEL, cause });
        return { ok: false, cause };
      }
    },
  };
}

/**
 * 生成 SQL を D1 へ通す縫い目。
 *
 * ## ⚠️ この層は何も守らない
 *
 * 名前が `select` でも、**読み取り専用を強制しない**。渡した SQL はそのまま実行される。
 * 実測（2026-08-22・vitest-pool-workers の D1）:
 *
 * | 渡した SQL | 結果 |
 * | --- | --- |
 * | `DELETE FROM gaps` | **成功し、実際に削除された** |
 * | `SELECT 1; DELETE FROM gaps` | **成功し、複文の DELETE が実行された** |
 * | `UPDATE gaps SET ...` | 成功し、実行された |
 * | `PRAGMA table_list` | 成功し、スキーマが読めた |
 * | `SELECT name FROM sqlite_master` | 成功し、内部テーブル名（`_cf_METADATA` 等）が読めた |
 * | `SELECT ...; DROP TABLE gaps` | 失敗（DDL は D1 が拒否する） |
 *
 * **つまり「`prepare` は複文を受けないから安全」は成り立たない。** 封じ込めは
 * `sql-guard.ts`（[Issue #119](https://github.com/fffokazaki/tabi-concierge-tokyo/issues/119)）
 * の静的検証**だけ**が担う。ここを「2層目」と数えて sql-guard を緩めないこと。
 *
 * この層が実際に果たしている役割は2つだけ:
 *
 * 1. **読み取りと書き込みの interface を分ける。** 書き込み（`gaps` への記録）は
 *    `GapRecorder` が持つので、生成 SQL を通す経路のコードから書き込み API が見えない
 *    （見えないだけで、SQL 文字列としては到達できる — 上表のとおり）
 * 2. **失敗を `ok: false` に畳んで throw しない。** 呼び出し側に後始末を書かせる
 *
 * 挙動は `llm.test.ts` の「読み取り専用ではない」で固定してある。将来 D1 側が変わって
 * 本当に拒否するようになったら、そのテストが落ちて教えてくれる。
 */
export type SqlRows = Record<string, unknown>[];
export type SqlResult = { ok: true; rows: SqlRows } | { ok: false; cause: unknown };

export interface SqlExecutor {
  /**
   * SQL を実行して行を返す。
   *
   * **呼ぶ前に必ず `sql-guard` を通すこと。** ここは検査をしない（上の doc 参照）。
   */
  select(sql: string): Promise<SqlResult>;
}

/**
 * D1 の実装。`prepare().all()` を使う。
 *
 * `exec()` ではなく `prepare()` にしているのは、`exec()` が複数行の SQL をまとめて流す
 * ための API で用途が違うため。**複文を止める効果は期待できない**（実測で `prepare` も
 * 複文の DELETE を実行した。上の doc 参照）。
 */
export function d1SqlExecutor(db: D1Database): SqlExecutor {
  return {
    async select(sql) {
      try {
        const { results } = await db.prepare(sql).all<Record<string, unknown>>();
        return { ok: true, rows: results };
      } catch (cause) {
        console.error("[sql] 読み取りに失敗しました", { sql, cause });
        return { ok: false, cause };
      }
    },
  };
}

/**
 * コア操作が外部資源へ届くための一式。
 *
 * コア操作の**必須**引数として受け取る（optional 禁止）。`getProvenance` だけは LLM も D1 も
 * 使わないため受け取らない — 使わないものを受け取らせると、「渡してあるから使っているはず」と
 * 読み違える余地ができる。
 */
export type CoreDeps = {
  llm: LlmClient;
  sql: SqlExecutor;
};

/** 殻（`worker/index.ts` / `worker/mcp.ts`）が組み立てる一式。組み立てを1箇所にまとめる。 */
export const coreDeps = (env: Env): CoreDeps => ({
  llm: workersAiLlm(env.AI, env.AI_GATEWAY_ID, resolveCachePolicy(env.AI_GATEWAY_CACHE_TTL)),
  sql: d1SqlExecutor(env.DB),
});
