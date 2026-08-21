import { describe, expect, it, vi } from "vitest";
import { coreDeps, d1SqlExecutor, LLM_MODEL, workersAiLlm } from "./llm";

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

describe("workersAiLlm", () => {
  it("プロンプトの末尾に /no_think を付ける", async () => {
    // これが無いと思考トークンが max_tokens を食い尽くし、JSON が閉じ括弧の無い状態で
    // 切れる（実測: 素だと出力379トークン・思考1,308字 / `/no_think` なら53トークン）。
    // パーサ側では復元できない壊れ方なので、入力側で止めるしかない
    const { ai, calls } = fakeAi(completion('{"areas":[]}'));
    await workersAiLlm(ai, "default").complete(REQUEST);

    const messages = calls[0]!.input["messages"] as { role: string; content: string }[];
    expect(messages.at(-1)!.content.endsWith("/no_think")).toBe(true);
    expect(messages.at(-1)!.content).toContain("質問文");
  });

  it("AI Gateway を経由して呼ぶ（ADR-013 決定1）", async () => {
    // gateway オプション無しで呼ぶと、消費量が見えずキャッシュも効かない。
    // ダッシュボードにログが積まれないことでしか気づけないので、ここで固定する
    const { ai, calls } = fakeAi(completion("{}"));
    await workersAiLlm(ai, "tabi-concierge-tokyo").complete(REQUEST);

    expect(calls[0]!.model).toBe(LLM_MODEL);
    expect(calls[0]!.options).toEqual({ gateway: { id: "tabi-concierge-tokyo", cacheTtl: 3600 } });
  });

  it("成功したら本文を前後の空白を落として返す", async () => {
    const { ai } = fakeAi(completion('\n\n{"areas":["上野"]}\n'));
    expect(await workersAiLlm(ai, "default").complete(REQUEST)).toEqual({
      ok: true,
      text: '{"areas":["上野"]}',
    });
  });

  it("finish_reason が length なら失敗として扱う（途中で切れているため）", async () => {
    // ここを成功にすると、閉じていない JSON がパーサへ渡る。運が悪いと途中まででパースが
    // 通り、**欠けた結果を正しい結果として使ってしまう**
    const { ai } = fakeAi(completion('{"areas":["上', "length"));
    const result = await workersAiLlm(ai, "default").complete(REQUEST);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(String(result.cause)).toContain("max_tokens");
  });

  it("content が null なら失敗として扱う（思考モデルはこの形を返す）", async () => {
    // reasoning_content だけが埋まり content が null、という応答が実在する
    const { ai } = fakeAi(completion(null));
    expect((await workersAiLlm(ai, "default").complete(REQUEST)).ok).toBe(false);
  });

  it("content が空白だけでも失敗として扱う", async () => {
    const { ai } = fakeAi(completion("   \n  "));
    expect((await workersAiLlm(ai, "default").complete(REQUEST)).ok).toBe(false);
  });

  it("例外は throw せず ok:false で返し、握りつぶさずログに残す", async () => {
    // throw しない設計にしてあるのは、呼び出し側に「失敗したらどうするか」を必ず
    // 書かせるため。ただし黙って握るのは別問題なので、記録は必ず残す
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const { ai } = fakeAi(new Error("推論サービスが落ちている"));
      const result = await workersAiLlm(ai, "default").complete(REQUEST);

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

describe("coreDeps", () => {
  it("env から一式を組み立てる（面ごとに別物を組ませない）", async () => {
    const { ai, calls } = fakeAi(completion("ok"));
    const deps = coreDeps({ AI: ai, AI_GATEWAY_ID: "from-env", DB: {} as D1Database } as unknown as Env);

    await deps.llm.complete(REQUEST);
    // ゲートウェイ ID が env 由来であること＝ハードコードしていないこと（ADR-013 決定2）
    expect(calls[0]!.options).toMatchObject({ gateway: { id: "from-env" } });
  });
});
