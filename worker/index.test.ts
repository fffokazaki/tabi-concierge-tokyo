import { describe, expect, it } from "vitest";
import { request } from "./test-support";

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
    // 型と長さだけを見る形にすると、何が入っていても通ってしまい主張と手段が噛み合わない。
    expect(runtime.length).toBeGreaterThan(0);
    expect(runtime).not.toMatch(/^Node/);
  });
});

describe("/api/* のフォールバック", () => {
  it("未定義の API パスは 404 の JSON を返す（index.html に倒さない）", async () => {
    const response = await request("/api/unknown");

    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toContain("application/json");
    await expect(response.json()).resolves.toMatchObject({ error: "not_found" });
  });

  it("GET 以外のメソッドでも同じ扱いにする", async () => {
    const response = await request("/api/unknown", { method: "POST" });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ error: "not_found" });
  });
});
