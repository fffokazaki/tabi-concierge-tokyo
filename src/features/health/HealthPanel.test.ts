import { describe, expect, it } from "vitest";
import { describeFailure } from "./HealthPanel";

/**
 * 表示文言のうち、組み立てが分岐するものだけを検証する。
 * レンダリング自体は DOM が必要なため、ここでは扱わない。
 */
describe("describeFailure", () => {
  it("statusText があれば見出しに添える", () => {
    const { headline } = describeFailure({
      kind: "http",
      status: 404,
      statusText: "Not Found",
      body: "{}",
    });

    expect(headline).toBe("サーバーが HTTP 404 Not Found を返しました");
  });

  it("statusText が空でも末尾に余分な空白を残さない", () => {
    // 本番は HTTP/2 で応答する。HTTP/2 は理由句を持たないため、
    // ブラウザが見る statusText は常に空になる（＝本番が必ず通る分岐）。
    const { headline } = describeFailure({ kind: "http", status: 404, statusText: "", body: "{}" });

    expect(headline).toBe("サーバーが HTTP 404 を返しました");
  });

  it("形の不正では、どのフィールドが問題かを挙げる", () => {
    const { note } = describeFailure({
      kind: "shape",
      invalidFields: ["status", "service"],
      body: "{}",
    });

    expect(note).toContain("status / service");
  });
});
