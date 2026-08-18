import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Unanswered } from "../../../../shared/core";
import { DataGapCard } from "./DataGapCard";

const GAPS: Unanswered[] = [
  { status: "unanswered", reason: "insufficient_granularity", message: "ラーメン店の確認できるデータはありません。" },
  { status: "unanswered", reason: "out_of_area", message: "「新宿」は対象エリアの外です。" },
];

describe("DataGapCard", () => {
  it("実際の gaps の message をそのまま列挙する", () => {
    render(<DataGapCard gaps={GAPS} />);

    expect(screen.getByText("ラーメン店の確認できるデータはありません。")).toBeInTheDocument();
    expect(screen.getByText("「新宿」は対象エリアの外です。")).toBeInTheDocument();
  });

  it("リクエストボタンや件数は描画しない（実在しないオプトイン申請を示唆しないため）", () => {
    render(<DataGapCard gaps={GAPS} />);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByText(/リクエスト/)).not.toBeInTheDocument();
  });
});
