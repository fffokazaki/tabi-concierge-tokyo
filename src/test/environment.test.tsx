import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

/**
 * テスト環境そのものの検証。プロダクトコードは検証しない。
 *
 * 既存のテスト（health.test.ts など）は純粋関数と Web 標準 API しか使わないため、
 * jsdom も setup.ts も効いていない状態で全部通ってしまう。
 * 「設定が書いてある」と「設定が効いている」は別なので、ここで実際に確かめる。
 */

function Greeting({ name }: { name: string }) {
  return <p>こんにちは、{name}さん</p>;
}

describe("フロントエンドのテスト環境", () => {
  it("JSX をレンダリングして DOM から引ける（react プラグイン＋jsdom）", () => {
    render(<Greeting name="東京" />);

    // toBeInTheDocument は setup.ts の jest-dom 読み込みが効いていないと存在しない。
    expect(screen.getByText("こんにちは、東京さん")).toBeInTheDocument();
  });

  it("テストごとに DOM が片付く（setup.ts の cleanup）", () => {
    render(<Greeting name="東京" />);

    // 前のテストの描画が残っていれば getByText は「複数見つかった」で落ちる。
    expect(screen.getByText("こんにちは、東京さん")).toBeInTheDocument();
  });
});
