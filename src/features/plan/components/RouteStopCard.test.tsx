import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Stop } from "../types";
import { RouteStopCard } from "./RouteStopCard";

const stop = (category: string): Stop => ({
  place: "恵比寿東公園",
  note: "所在地は渋谷区恵比寿1-2-16。",
  category,
  etiquette: [],
});

const renderCard = (category: string) =>
  render(
    <RouteStopCard
      stop={stop(category)}
      time="10:00"
      selected={false}
      isDragOver={false}
      onSelect={vi.fn()}
      onDragStart={vi.fn()}
      onDragOver={vi.fn()}
      onDrop={vi.fn()}
      onDragEnd={vi.fn()}
    />,
  );

describe("RouteStopCard のカテゴリ画像", () => {
  it("割当済みカテゴリは透過背景用の画像表示になる", () => {
    const { container } = renderCard("公園");

    expect(container.querySelector(".stop-card__thumb--illustrated img")).not.toBeNull();
  });

  it("空カテゴリは画像を置かず、灰色サムネイルを保つ", () => {
    const { container } = renderCard("");

    expect(container.querySelector(".stop-card__thumb--illustrated")).toBeNull();
    expect(container.querySelector(".stop-card__thumb img")).toBeNull();
  });

  it("未知カテゴリは空枠フォールバック画像を表示する", () => {
    const { container } = renderCard("将来の新分類");

    expect(container.querySelector(".stop-card__thumb--illustrated img")).not.toBeNull();
  });
});
