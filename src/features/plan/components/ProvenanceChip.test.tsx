import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ProvenanceSource } from "../types";
import { ProvenanceChip } from "./ProvenanceChip";

/**
 * 出典チップの表示（Issue #17）。
 *
 * CONSTRAINTS.md §3 は「全回答に出典を強制付与するため、CC BY の表示義務を
 * アーキテクチャレベルで自動的に満たす」と宣言している。ライセンス表記が描画されないと
 * その宣言は成立しないので、7フィールドのうち**画面に出す必要があるもの**を明示的に確かめる。
 */

const SOURCE: ProvenanceSource = {
  datasetId: "t131067d0000000251",
  datasetTitle: "名所・史跡",
  provider: "台東区",
  license: "CC BY 4.0",
  url: "https://catalog.data.metro.tokyo.lg.jp/dataset/t131067d0000000251",
  query: "上野の寺社",
  retrievedAt: "2026-08-16",
};

describe("ProvenanceChip", () => {
  it("ライセンス表記を描画する（CC BY の表示義務）", () => {
    render(<ProvenanceChip source={SOURCE} />);

    expect(screen.getByText("CC BY 4.0")).toBeInTheDocument();
  });

  it("ライセンスは条文へのリンクにする", () => {
    // CC BY は「ライセンスへのリンク」も求める。文字列だけでは義務を満たしきらない
    render(<ProvenanceChip source={SOURCE} />);

    expect(screen.getByRole("link", { name: "CC BY 4.0" })).toHaveAttribute(
      "href",
      "https://creativecommons.org/licenses/by/4.0/",
    );
  });

  it("帰属表示（データセット名・提供元・取得日）とカタログへのリンクを描画する", () => {
    render(<ProvenanceChip source={SOURCE} />);

    expect(screen.getByRole("link", { name: "名所・史跡" })).toHaveAttribute("href", SOURCE.url);
    expect(screen.getByText(/台東区/)).toBeInTheDocument();
    expect(screen.getByText(/2026-08-16 取得/)).toBeInTheDocument();
  });

  it("リンクを入れ子にしない（<a> の中の <a> は不正な HTML）", () => {
    const { container } = render(<ProvenanceChip source={SOURCE} />);

    expect(container.querySelectorAll("a a")).toHaveLength(0);
    expect(container.querySelectorAll("a")).toHaveLength(2);
  });
});
