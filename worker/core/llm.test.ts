import { env } from "cloudflare:workers";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { applyMigrations, clearGaps } from "../test-support";
import { coreDeps, d1SqlExecutor, LLM_MODEL, resolveCachePolicy, workersAiLlm } from "./llm";

/**
 * `workersAiLlm` は Workers AI の癖をここ1箇所に閉じ込めるアダプタである。
 * その癖は [Issue #116](https://github.com/fffokazaki/tabi-concierge-tokyo/issues/116) で
 * 実測したもので（[LLM-MODEL-CANDIDATES.md](../../docs/06-reference/LLM-MODEL-CANDIDATES.md) §4）、
 * ここで固定しておかないと**上流で JSON が壊れる形でしか症状が出ない**。
 */

type RunCall = { model: string; input: Record<string, unknown>; options: Record<string, unknown> };

/** `env.AI` の代わり。呼ばれた引数を記録し、決め打ちの応答を返す。 */
function fakeAi(response: unknown): { ai: Ai; calls: RunCall[] } {
  const calls: RunCall[] = [];
  const ai = {
    run: async (model: string, input: Record<string, unknown>, options: Record<string, unknown>) => {
      calls.push({ model, input, options });
      if (response instanceof Error) throw response;
      return response;
    },
  } as unknown as Ai;
  return { ai, calls };
}

const completion = (content: string | null, finishReason = "stop") => ({
  choices: [{ finish_reason: finishReason, message: { content } }],
});

const REQUEST = { purpose: "search_interpret", system: "システム指示", user: "質問文", maxTokens: 256 } as const;

/** 既定のキャッシュ設定。TTL の中身に関心が無いテストはこれを使う。 */
const CACHE_1H = { kind: "cache", ttlSeconds: 3600 } as const;

describe("workersAiLlm", () => {
  it("プロンプトの末尾に /no_think を付ける", async () => {
    // これが無いと思考トークンが max_tokens を食い尽くし、JSON が閉じ括弧の無い状態で
    // 切れる（実測: 素だと出力379トークン・思考1,308字 / `/no_think` なら53トークン）。
    // パーサ側では復元できない壊れ方なので、入力側で止めるしかない
    const { ai, calls } = fakeAi(completion('{"areas":[]}'));
    await workersAiLlm(ai, "default", CACHE_1H).complete(REQUEST);

    const messages = calls[0]!.input["messages"] as { role: string; content: string }[];
    expect(messages.at(-1)!.content.endsWith("/no_think")).toBe(true);
    expect(messages.at(-1)!.content).toContain("質問文");
  });

  it("AI Gateway を経由して呼ぶ（ADR-013 決定1）", async () => {
    // gateway オプション無しで呼ぶと、消費量が見えずキャッシュも効かない。
    // ダッシュボードにログが積まれないことでしか気づけないので、ここで固定する
    const { ai, calls } = fakeAi(completion("{}"));
    await workersAiLlm(ai, "tabi-concierge-tokyo", CACHE_1H).complete(REQUEST);

    expect(calls[0]!.model).toBe(LLM_MODEL);
    expect(calls[0]!.options).toEqual({ gateway: { id: "tabi-concierge-tokyo", cacheTtl: 3600 } });
  });

  it("キャッシュ設定が gateway 引数に載る（設定しても届かない、が起きない）", async () => {
    const { ai, calls } = fakeAi(completion("{}"));
    await workersAiLlm(ai, "default", { kind: "cache", ttlSeconds: 60 }).complete(REQUEST);

    expect(calls[0]!.options).toEqual({ gateway: { id: "default", cacheTtl: 60 } });
  });

  it("skip は skipCache で渡す（cacheTtl: 0 に化けさせない）", async () => {
    // AI Gateway でキャッシュを使わない指定は `skipCache` であって TTL 0 ではない。
    // `cacheTtl: 0` を渡すと**キャッシュが効いたまま「引き直したつもり」**になる（Issue #143）
    const { ai, calls } = fakeAi(completion("{}"));
    await workersAiLlm(ai, "default", { kind: "skip" }).complete(REQUEST);

    expect(calls[0]!.options).toEqual({ gateway: { id: "default", skipCache: true } });
  });

  it("成功したら本文を前後の空白を落として返す", async () => {
    const { ai } = fakeAi(completion('\n\n{"areas":["上野"]}\n'));
    expect(await workersAiLlm(ai, "default", CACHE_1H).complete(REQUEST)).toEqual({
      ok: true,
      text: '{"areas":["上野"]}',
    });
  });

  it("finish_reason が stop 以外なら失敗として扱う", async () => {
    // 許可する値のほうを列挙してある。危険値（length / content_filter …）を列挙する形だと、
    // モデルや SDK が新しい終了理由を足したとき**黙って成功側に倒れる**
    for (const reason of ["content_filter", "tool_calls", "error", "unknown_future_reason"]) {
      const { ai } = fakeAi(completion('{"areas":["上野"]}', reason));
      const result = await workersAiLlm(ai, "default", CACHE_1H).complete(REQUEST);
      expect(result.ok, `finish_reason=${reason} を成功にしてはいけない`).toBe(false);
    }
  });

  it("choices が空・欠落でも失敗として扱う（落ちない）", async () => {
    for (const response of [{ choices: [] }, {}, { choices: [{ finish_reason: "stop" }] }]) {
      expect((await workersAiLlm(fakeAi(response).ai, "default", CACHE_1H).complete(REQUEST)).ok).toBe(false);
    }
  });

  it("system と user と max_tokens をそのまま渡す", async () => {
    // `/no_think` の追加以外は改変しないこと。system が落ちると出力の形の指示が消え、
    // maxTokens が落ちると費用と切断リスクの両方が跳ねる
    const { ai, calls } = fakeAi(completion("{}"));
    await workersAiLlm(ai, "default", CACHE_1H).complete(REQUEST);

    expect(calls[0]!.input["max_tokens"]).toBe(REQUEST.maxTokens);
    expect(calls[0]!.input["messages"]).toEqual([
      { role: "system", content: "システム指示" },
      { role: "user", content: "質問文\n\n/no_think" },
    ]);
  });

  it("finish_reason が length なら失敗として扱う（途中で切れているため）", async () => {
    // ここを成功にすると、閉じていない JSON がパーサへ渡る。運が悪いと途中まででパースが
    // 通り、**欠けた結果を正しい結果として使ってしまう**
    const { ai } = fakeAi(completion('{"areas":["上', "length"));
    const result = await workersAiLlm(ai, "default", CACHE_1H).complete(REQUEST);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(String(result.cause)).toContain("max_tokens");
  });

  it("content が null なら失敗として扱う（思考モデルはこの形を返す）", async () => {
    // reasoning_content だけが埋まり content が null、という応答が実在する
    const { ai } = fakeAi(completion(null));
    expect((await workersAiLlm(ai, "default", CACHE_1H).complete(REQUEST)).ok).toBe(false);
  });

  it("content が空白だけでも失敗として扱う", async () => {
    const { ai } = fakeAi(completion("   \n  "));
    expect((await workersAiLlm(ai, "default", CACHE_1H).complete(REQUEST)).ok).toBe(false);
  });

  it("例外は throw せず ok:false で返し、握りつぶさずログに残す", async () => {
    // throw しない設計にしてあるのは、呼び出し側に「失敗したらどうするか」を必ず
    // 書かせるため。ただし黙って握るのは別問題なので、記録は必ず残す
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const { ai } = fakeAi(new Error("推論サービスが落ちている"));
      const result = await workersAiLlm(ai, "default", CACHE_1H).complete(REQUEST);

      expect(result.ok).toBe(false);
      expect(spy).toHaveBeenCalledTimes(1);
      // どの用途の呼び出しで落ちたかが分からないと、search と sql のどちらを見ればよいか特定できない
      expect(spy.mock.calls[0]?.[1]).toMatchObject({ purpose: "search_interpret", model: LLM_MODEL });
    } finally {
      spy.mockRestore();
    }
  });
});

describe("d1SqlExecutor", () => {
  /** `prepare().all()` だけを通す D1 の代わり。`exec` を生やさないことで誤用を型で防ぐ。 */
  const fakeDb = (behaviour: { rows?: Record<string, unknown>[]; error?: Error }) =>
    ({
      prepare: (sql: string) => ({
        all: async () => {
          if (behaviour.error) throw behaviour.error;
          return { results: behaviour.rows ?? [{ echoed: sql }] };
        },
      }),
    }) as unknown as D1Database;

  it("prepare().all() の結果を返す", async () => {
    const rows = [{ name: "寛永寺" }];
    expect(await d1SqlExecutor(fakeDb({ rows })).select("SELECT name FROM spots LIMIT 1")).toEqual({
      ok: true,
      rows,
    });
  });

  it("失敗は throw せず ok:false で返し、SQL つきでログに残す", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const result = await d1SqlExecutor(fakeDb({ error: new Error("no such table") })).select("SELECT 1");

      expect(result.ok).toBe(false);
      // 生成 SQL が原因で落ちるので、SQL 自体がログに無いと原因を再現できない
      expect(spy.mock.calls[0]?.[1]).toMatchObject({ sql: "SELECT 1" });
    } finally {
      spy.mockRestore();
    }
  });
});

describe("d1SqlExecutor は読み取り専用ではない（実測の固定）", () => {
  // ここで固定しているのは**守れていないこと**である。名前が `select` でも、渡した SQL は
  // そのまま実行される。「`prepare` は複文を受けないから安全」という思い込みを潰しておかないと、
  // sql-guard（Issue #119）を「2層目があるから」と緩める判断が生まれる。
  // 封じ込めは sql-guard **だけ**が担う。
  //
  // 将来 D1 側が本当に拒否するようになったら、このテストが落ちて教えてくれる。
  beforeAll(applyMigrations);
  beforeEach(clearGaps);

  const countGaps = async () =>
    (await env.DB.prepare("SELECT COUNT(*) AS n FROM gaps").first<{ n: number }>())?.n;

  const seedOneGap = () =>
    env.DB.prepare("INSERT INTO gaps (question, reason) VALUES ('検証用', 'other')").run();

  it("単文の DELETE を実行してしまう", async () => {
    await seedOneGap();
    const result = await d1SqlExecutor(env.DB).select("DELETE FROM gaps");

    expect(result.ok).toBe(true);
    expect(await countGaps(), "行が消えている＝読み取り専用ではない").toBe(0);
  });

  it("複文の DELETE を実行してしまう（prepare は複文を止めない）", async () => {
    await seedOneGap();
    const result = await d1SqlExecutor(env.DB).select("SELECT 1; DELETE FROM gaps");

    expect(result.ok).toBe(true);
    expect(await countGaps(), "複文の2文目が実行されている").toBe(0);
  });

  it("PRAGMA と sqlite_master が通る（スキーマが読める）", async () => {
    const sql = d1SqlExecutor(env.DB);
    expect((await sql.select("PRAGMA table_list")).ok).toBe(true);
    expect((await sql.select("SELECT name FROM sqlite_master")).ok).toBe(true);
  });

  it("DDL は D1 が拒否する（この層で唯一止まるもの）", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await seedOneGap();
      expect((await d1SqlExecutor(env.DB).select("SELECT question FROM gaps; DROP TABLE gaps")).ok).toBe(false);
      expect(await countGaps(), "テーブルが残っている").toBe(1);
    } finally {
      spy.mockRestore();
    }
  });
});

describe("coreDeps", () => {
  it("env から一式を組み立てる（面ごとに別物を組ませない）", async () => {
    const { ai, calls } = fakeAi(completion("ok"));
    const deps = coreDeps({
      AI: ai,
      AI_GATEWAY_ID: "from-env",
      AI_GATEWAY_CACHE_TTL: "60",
      DB: {} as D1Database,
    } as unknown as Env);

    await deps.llm.complete(REQUEST);
    // ゲートウェイ ID が env 由来であること＝ハードコードしていないこと（ADR-013 決定2）。
    // TTL も同じ — env に置いても組み立て側で拾っていなければ、収録直前に値を変えても効かない（Issue #143）
    expect(calls[0]!.options).toEqual({ gateway: { id: "from-env", cacheTtl: 60 } });
  });

  it('env の "0" が実際の呼び出しまで skipCache として届く（Issue #143 の本体）', async () => {
    // 解析（resolveCachePolicy）と組み立て（workersAiLlm）は別々に固定してあるが、
    // **その2つを繋ぐ配線が抜けても両方のテストは通る**。収録中は応答が返ってしまうため
    // 画面から気づけない — env から `ai.run` の引数までを1本で見る
    const { ai, calls } = fakeAi(completion("ok"));
    const deps = coreDeps({
      AI: ai,
      AI_GATEWAY_ID: "from-env",
      AI_GATEWAY_CACHE_TTL: "0",
      DB: {} as D1Database,
    } as unknown as Env);

    await deps.llm.complete(REQUEST);

    expect(calls[0]!.options).toEqual({ gateway: { id: "from-env", skipCache: true } });
  });
});

/**
 * 収録中に引き直せるようにするための env 解釈（[Issue #143](https://github.com/fffokazaki/tabi-concierge-tokyo/issues/143)）。
 *
 * ここが緩いと、値の書き間違いが**キャッシュ設定の異常ではなく推論そのものの失敗**として現れ、
 * コア操作はキーワード実装へ静かに縮退する（`llm.ts` 冒頭の doc と同じ失敗モード）。
 * 不正値は既定へ倒して `console.error` に出す — 落とすと収録直前に Worker ごと死ぬ。
 */
describe("resolveCachePolicy", () => {
  it("秒数を TTL として読む", () => {
    expect(resolveCachePolicy("3600")).toEqual({ kind: "cache", ttlSeconds: 3600 });
  });

  it("0 はキャッシュを使わない指定として読む（収録前に引き直すための入口）", () => {
    expect(resolveCachePolicy("0")).toEqual({ kind: "skip" });
  });

  it("AI Gateway が受ける下限・上限をそのまま通す（60 秒〜1ヶ月）", () => {
    expect(resolveCachePolicy("60")).toEqual({ kind: "cache", ttlSeconds: 60 });
    expect(resolveCachePolicy("2592000")).toEqual({ kind: "cache", ttlSeconds: 2592000 });
  });

  it("設定そのものが無くても落ちない（欠落は既定へ倒す）", () => {
    // 生成型（`worker-configuration.d.ts`）は wrangler.jsonc の**現在の値**を写した
    // リテラルなので、「型が付いている＝実行時に必ず入っている」の保証にはならない。
    // ここで throw すると `coreDeps` の組み立てで死に、LLM の縮退経路へ入る前に
    // `/api/*` と `/mcp` が丸ごと落ちる
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(resolveCachePolicy(undefined)).toEqual({ kind: "cache", ttlSeconds: 3600 });
      expect(spy).toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  it("前後の空白は無視する", () => {
    expect(resolveCachePolicy(" 3600 ")).toEqual({ kind: "cache", ttlSeconds: 3600 });
    expect(resolveCachePolicy(" 0 ")).toEqual({ kind: "skip" });
  });

  it.each([
    ["下限未満", "59"],
    ["上限超過", "2592001"],
    ["数値でない", "ひとじかん"],
    ["空文字（Number('') が 0 になるので、素直に読むと skip に化ける）", ""],
    ["整数でない", "3600.5"],
    ["負数", "-1"],
    // Number() は指数・16進・符号つきを受理してしまう。設定ファイルにこれらが現れるのは
    // まず書き間違いなので、10進数字だけを受けて残りは既定へ倒す（黙って 60 秒にしない）
    ["指数表記", "6e1"],
    ["16進表記", "0x3c"],
    ["符号つき", "+60"],
  ])("%s は既定へ倒し、握りつぶさずに console.error へ出す（値: %s）", (_label, raw) => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(resolveCachePolicy(raw)).toEqual({ kind: "cache", ttlSeconds: 3600 });
      expect(spy).toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });
});
