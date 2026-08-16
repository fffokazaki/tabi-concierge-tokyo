import { describe, expect, it } from "vitest";
import { fetchHealth } from "./health";

/** 指定した応答を1回だけ返す fetch。 */
function respondWith(body: string, init?: ResponseInit): typeof fetch {
  return (async () => new Response(body, init)) as typeof fetch;
}

/** 必ず失敗する fetch（ネットワーク断の再現）。 */
function rejectWith(cause: unknown): typeof fetch {
  return (async () => {
    throw cause;
  }) as typeof fetch;
}

const VALID_BODY = JSON.stringify({
  status: "ok",
  service: "tabi-concierge-tokyo",
  runtime: "Cloudflare-Workers",
});

describe("fetchHealth", () => {
  it("正常な応答を ok として返す", async () => {
    const result = await fetchHealth({ fetchImpl: respondWith(VALID_BODY) });

    expect(result).toEqual({
      kind: "ok",
      health: { status: "ok", service: "tabi-concierge-tokyo", runtime: "Cloudflare-Workers" },
    });
  });

  it("サーバーへ届かないときは network とし、原因のメッセージを残す", async () => {
    const result = await fetchHealth({ fetchImpl: rejectWith(new TypeError("Failed to fetch")) });

    expect(result).toEqual({ kind: "network", detail: "Failed to fetch" });
  });

  it("HTTP エラーのとき Worker が返したボディを捨てない", async () => {
    const result = await fetchHealth({
      fetchImpl: respondWith(JSON.stringify({ error: "not_found" }), {
        status: 404,
        statusText: "Not Found",
      }),
    });

    expect(result).toMatchObject({ kind: "http", status: 404, statusText: "Not Found" });
    // AC: Worker の機械可読な理由が表示側まで届くこと。
    expect(result).toHaveProperty("body", '{"error":"not_found"}');
  });

  it("statusText が空でも http として扱う（本番の HTTP/2 は理由句を持たない）", async () => {
    const result = await fetchHealth({
      fetchImpl: respondWith(JSON.stringify({ error: "not_found" }), { status: 404 }),
    });

    expect(result).toMatchObject({ kind: "http", status: 404, statusText: "" });
  });

  it("2xx でも JSON として読めなければ parse とし、network と混同しない", async () => {
    const html = "<!doctype html><html><body>proxy interstitial</body></html>";

    const result = await fetchHealth({ fetchImpl: respondWith(html) });

    expect(result).toMatchObject({ kind: "parse" });
    // 「接続できません」ではなく、サーバーが返した中身を手がかりとして出す。
    expect(result).toHaveProperty("body", html);
  });

  it("空オブジェクトを正常として扱わない", async () => {
    const result = await fetchHealth({ fetchImpl: respondWith("{}") });

    expect(result).toMatchObject({
      kind: "shape",
      invalidFields: ["status", "service", "runtime"],
      body: "{}",
    });
  });

  it("null を正常として扱わない（確認中のまま停止しない）", async () => {
    const result = await fetchHealth({ fetchImpl: respondWith("null") });

    expect(result).toMatchObject({ kind: "shape", invalidFields: ["status", "service", "runtime"] });
  });

  it("フィールドの型が違えば、そのフィールドだけを不正として挙げる", async () => {
    const body = JSON.stringify({ status: 200, service: "tabi-concierge-tokyo", runtime: "workerd" });

    const result = await fetchHealth({ fetchImpl: respondWith(body) });

    expect(result).toMatchObject({ kind: "shape", invalidFields: ["status"] });
  });

  it("配列を正常として扱わない", async () => {
    const result = await fetchHealth({ fetchImpl: respondWith("[]") });

    expect(result).toMatchObject({ kind: "shape" });
  });

  it("長いボディは切り詰めて返す", async () => {
    const result = await fetchHealth({ fetchImpl: respondWith("x".repeat(1000)) });

    expect(result).toMatchObject({ kind: "parse" });
    const { body } = result as { body: string };
    expect(body).toHaveLength(301);
    expect(body.endsWith("…")).toBe(true);
  });

  it("中断されたときは障害として扱わない", async () => {
    const controller = new AbortController();
    controller.abort();

    const result = await fetchHealth({
      signal: controller.signal,
      fetchImpl: rejectWith(new DOMException("Aborted", "AbortError")),
    });

    expect(result).toEqual({ kind: "aborted" });
  });
});
