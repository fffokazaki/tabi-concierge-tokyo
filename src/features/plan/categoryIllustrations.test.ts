import { describe, expect, it } from "vitest";
import { resolveCategoryIllustration } from "./categoryIllustrations";

describe("resolveCategoryIllustration", () => {
  it.each(["公園", "飲食店", "区指定文化財"])("監査済みカテゴリ %s を対応画像へ写す", (category) => {
    const result = resolveCategoryIllustration(category);

    expect(result.kind).toBe("mapped");
    expect(result.kind === "mapped" && result.src).toMatch(/\.webp$/);
  });

  it("名所・史跡も含む現存カテゴリを未割当にしない", () => {
    expect(resolveCategoryIllustration("名所・史跡").kind).toBe("mapped");
  });

  it("将来追加された未知カテゴリだけ専用フォールバック画像にする", () => {
    const result = resolveCategoryIllustration("将来の新分類");

    expect(result.kind).toBe("unknown");
    expect(result.kind === "unknown" && result.src).toMatch(/unknown\.webp$/);
  });

  it("空文字だけはAPI破損を画像で隠さない", () => {
    expect(resolveCategoryIllustration("")).toEqual({ kind: "unassigned" });
  });
});
