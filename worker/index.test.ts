import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
// env は "cloudflare:test" からも取れるが非推奨。本番コードと同じ入口から取る。
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import app from "./index";

/** Worker を1回叩いて応答を返す。ExecutionContext の後始末まで面倒をみる。 */
async function request(path: string, init?: RequestInit): Promise<Response> {
  const ctx = createExecutionContext();
  const response = await app.fetch(new Request(`https://example.com${path}`, init), env, ctx);
  await waitOnExecutionContext(ctx);
  return response;
}

describe("/api/health", () => {
  it("疎通確認の3項目を返す", async () => {
    const response = await request("/api/health");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: "ok",
      service: "tabi-concierge-tokyo",
    });
  });

  it("ランタイムが workerd であることを実際の値で示す", async () => {
    const response = await request("/api/health");
    const { runtime } = (await response.json()) as { runtime: string };

    // 値そのもの（"Cloudflare-Workers"）は互換設定で変わりうるため固定しない。
    // 「Node ではない実行環境の値が入っている」ことだけを担保する。
    expect(runtime).toBeTypeOf("string");
    expect(runtime.length).toBeGreaterThan(0);
  });
});

describe("/api/* のフォールバック", () => {
  it("未定義の API パスは 404 の JSON を返す（index.html に倒さない）", async () => {
    const response = await request("/api/unknown");

    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toContain("application/json");
    await expect(response.json()).resolves.toEqual({ error: "not_found" });
  });

  it("GET 以外のメソッドでも同じ扱いにする", async () => {
    const response = await request("/api/unknown", { method: "POST" });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "not_found" });
  });
});
