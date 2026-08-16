import { describe, expect, it } from "vitest";
import { isCircleYes } from "./flags.ts";

describe("isCircleYes", () => {
  it("U+3007（漢数字のゼロ）を該当ありとみなす", () => {
    // 飲食店バリアフリー情報の実データはこちら。
    // U+25CB とだけ比較していたため 130 件のフラグが黙って落ちていた
    expect(isCircleYes("〇")).toBe(true);
    expect(isCircleYes("〇")).toBe(true);
  });

  it("U+25CB（白丸）も該当ありとみなす", () => {
    expect(isCircleYes("○")).toBe(true);
    expect(isCircleYes("○")).toBe(true);
  });

  it("前後の空白を無視する", () => {
    expect(isCircleYes(" 〇 ")).toBe(true);
  });

  it("空・未定義・その他の値は該当なし", () => {
    expect(isCircleYes("")).toBe(false);
    expect(isCircleYes(undefined)).toBe(false);
    expect(isCircleYes("×")).toBe(false);
    expect(isCircleYes("有")).toBe(false);
  });
});
