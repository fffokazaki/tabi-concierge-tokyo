import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AppTabs } from "./AppTabs";

describe("AppTabs", () => {
  it("moves from 旅のプロフィール to the briefing screen after ブリーフィングを作成", () => {
    render(<AppTabs />);

    expect(screen.getByText("あなたの旅について教えてください。")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "ブリーフィングを作成" }));

    expect(screen.getByText("現地の知識で明日を計画しよう。")).toBeInTheDocument();
    expect(screen.getByText("あなたのルート")).toBeInTheDocument();
  });

  it("filters the etiquette list to a selected stop and back", () => {
    render(<AppTabs />);
    fireEvent.click(screen.getByRole("button", { name: "ブリーフィングを作成" }));

    fireEvent.click(screen.getByText("浅草寺（浅草）"));
    expect(screen.getByText("浅草寺（浅草）のマナー")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "すべて表示" }));
    expect(screen.getByText("このルートのマナー")).toBeInTheDocument();
  });

  it("renders the other tabs as disabled placeholders", () => {
    render(<AppTabs />);
    fireEvent.click(screen.getByRole("button", { name: "ブリーフィングを作成" }));

    expect(screen.getByRole("button", { name: "スキャン" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "周辺" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "あなたへ" })).toBeDisabled();
  });
});
