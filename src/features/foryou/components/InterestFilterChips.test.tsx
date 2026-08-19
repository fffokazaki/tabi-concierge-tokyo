import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FORYOU_INTEREST_TAGS } from "../constants";
import { InterestFilterChips } from "./InterestFilterChips";

describe("InterestFilterChips", () => {
  it("「すべて」と設定済みのチップをすべて描画する", () => {
    render(<InterestFilterChips options={FORYOU_INTEREST_TAGS} active="all" onSelect={() => {}} />);

    expect(screen.getByRole("button", { name: "すべて" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ラーメン" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "文化" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "家族向け" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "自然" })).toBeInTheDocument();
  });

  it("常に1つだけアクティブになる（単一選択）", () => {
    render(<InterestFilterChips options={FORYOU_INTEREST_TAGS} active="culture" onSelect={() => {}} />);

    expect(screen.getByRole("button", { name: "文化" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "すべて" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "ラーメン" })).toHaveAttribute("aria-pressed", "false");
  });

  it("チップを押すと選んだ値で onSelect を呼ぶ", () => {
    const onSelect = vi.fn();
    render(<InterestFilterChips options={FORYOU_INTEREST_TAGS} active="all" onSelect={onSelect} />);

    fireEvent.click(screen.getByRole("button", { name: "家族向け" }));
    expect(onSelect).toHaveBeenCalledWith("family");

    fireEvent.click(screen.getByRole("button", { name: "すべて" }));
    expect(onSelect).toHaveBeenCalledWith("all");
  });
});
