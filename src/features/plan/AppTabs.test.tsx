import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AppTabs } from "./AppTabs";
import { COUNTER_BOUNDS } from "./constants";

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

  it("keeps counters within their configured bounds when wired into the setup screen's actual buttons", () => {
    render(<AppTabs />);

    // 子どもの初期値は下限（0）。減らそうとしても下限を割らない。
    const kidsDecrement = screen.getByRole("button", { name: "子どもを減らす" });
    const kidsRow = kidsDecrement.closest(".counter-row") as HTMLElement;
    const kidsValue = () => kidsRow.querySelector(".counter-value")?.textContent;
    expect(kidsValue()).toBe("0");
    fireEvent.click(kidsDecrement);
    expect(kidsValue()).toBe("0");

    // 大人を上限を超えて連打しても COUNTER_BOUNDS.adults.max で止まる。
    const adultsIncrement = screen.getByRole("button", { name: "大人を増やす" });
    const adultsRow = adultsIncrement.closest(".counter-row") as HTMLElement;
    const adultsValue = () => adultsRow.querySelector(".counter-value")?.textContent;
    for (let i = 0; i < COUNTER_BOUNDS.adults.max + 5; i++) fireEvent.click(adultsIncrement);
    expect(adultsValue()).toBe(String(COUNTER_BOUNDS.adults.max));
  });

  it("changes the number of rendered stop cards when pace changes", () => {
    const { container } = render(<AppTabs />);

    fireEvent.click(screen.getByRole("button", { name: "ゆったり" }));
    fireEvent.click(screen.getByRole("button", { name: "ブリーフィングを作成" }));
    expect(container.querySelectorAll(".stop-card")).toHaveLength(2);

    // trip-summary-bar は複数の <span> をまとめて1つの <button> にしているため、
    // アクセシブルネームは連結された全文になる（"編集" 単体では一致しない）
    fireEvent.click(screen.getByRole("button", { name: /編集/ }));
    fireEvent.click(screen.getByRole("button", { name: "しっかり" }));
    fireEvent.click(screen.getByRole("button", { name: "ブリーフィングを作成" }));
    expect(container.querySelectorAll(".stop-card")).toHaveLength(4);
  });

  it("renders the other tabs as disabled placeholders", () => {
    render(<AppTabs />);
    fireEvent.click(screen.getByRole("button", { name: "ブリーフィングを作成" }));

    expect(screen.getByRole("button", { name: "スキャン" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "周辺" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "あなたへ" })).toBeDisabled();
  });
});
