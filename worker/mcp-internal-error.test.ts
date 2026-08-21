import { expect, it, vi } from "vitest";
import { request } from "./test-support";

/**
 * `/mcp` のツール実行中に想定外の例外が起きたときの扱い。
 *
 * **別ファイルにしてあるのは `vi.mock` がファイル単位で効くため。** `mcp.test.ts` に
 * 置くとコア操作が全テストでモックになり、本物の挙動を確かめている13件が意味を失う。
 *
 * ## なぜこの経路を明示的に固定するのか
 *
 * SDK はツールのコールバックが投げた例外を**自分で捕まえて** `isError: true` の
 * ツール結果へ変換する。このとき `createMcpHandler` の `onerror` は呼ばれず、例外の
 * message はそのままクライアントへ渡る（Issue #117 で実測）。
 *
 * つまり `worker/mcp.ts` の `toolFor` が自分で try/catch しない限り、**本番でコアが
 * 壊れても記録がどこにも残らない**。応答は HTTP 200 で返り続けるため、画面からも
 * API からも気づけない — `gaps` の記録漏れとまったく同じ失敗の形である。
 */

vi.mock("./core/operations", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./core/operations")>()),
  searchDatasets: () => {
    throw new Error("内部の事情が書かれた例外メッセージ");
  },
}));

const callSearch = async (): Promise<{ text: string; isError: boolean }> => {
  const response = await request("/mcp", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "search_datasets", arguments: { query: "上野の寺社をめぐりたい" } },
    }),
  });
  const text = await response.text();
  const data = text
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice("data:".length).trim());
  const body = JSON.parse(data[0] ?? text) as {
    result?: { content?: { text: string }[]; isError?: boolean };
  };
  return { text: body.result?.content?.[0]?.text ?? "", isError: body.result?.isError === true };
};

it("例外を握りつぶさず console.error に記録する", async () => {
  const spy = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    await callSearch();
    expect(spy).toHaveBeenCalledTimes(1);
    // どのツールで起きたかが分からないと、3ツールのどれを見ればよいか特定できない
    expect(spy.mock.calls[0]?.[1]).toMatchObject({ tool: "search_datasets" });
  } finally {
    spy.mockRestore();
  }
});

it("内部の例外メッセージをクライアントへ漏らさない", async () => {
  const spy = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    const { text, isError } = await callSearch();
    expect(isError).toBe(true);
    // `/api/*` の 500 と同じ文言に畳む。面によって漏れ方が変わらないようにする
    expect(text).toBe("サーバー内部でエラーが発生しました");
    expect(text).not.toContain("内部の事情");
  } finally {
    spy.mockRestore();
  }
});
