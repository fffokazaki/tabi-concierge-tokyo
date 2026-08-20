import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ProvenanceSource } from "../../../../shared/core";
import type { Recommendation } from "../types";
import { RecommendationCard } from "./RecommendationCard";

const SOURCE: ProvenanceSource = {
  datasetId: "t131067d0000000251",
  datasetTitle: "名所・史跡",
  provider: "台東区",
  license: "CC BY 4.0",
  url: "https://catalog.data.metro.tokyo.lg.jp/dataset/t131067d0000000251",
  query: "文化",
  retrievedAt: "2026-08-16",
};

const RECOMMENDATION: Recommendation = {
  name: "寛永寺",
  blurb: "所在地は台東区上野桜木1丁目14番。",
  reason: "文化に興味がおありなので",
  source: SOURCE,
};

describe("RecommendationCard", () => {
  it("名称・説明・理由タグ・出典を描画する", () => {
    render(<RecommendationCard recommendation={RECOMMENDATION} />);

    expect(screen.getByText("寛永寺")).toBeInTheDocument();
    expect(screen.getByText("所在地は台東区上野桜木1丁目14番。")).toBeInTheDocument();
    expect(screen.getByText("文化に興味がおありなので")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "CC BY 4.0" })).toBeInTheDocument();
  });

  it("reason が無いとき（「すべて」）は理由タグの行を出さない", () => {
    render(<RecommendationCard recommendation={{ ...RECOMMENDATION, reason: null }} />);

    expect(screen.queryByText("文化に興味がおありなので")).not.toBeInTheDocument();
    // 名称・出典は reason の有無に関係なく出る
    expect(screen.getByText("寛永寺")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "CC BY 4.0" })).toBeInTheDocument();
  });

  it("写真は描画しない（確定データセットに画像URLを持つものが無いため）", () => {
    const { container } = render(<RecommendationCard recommendation={RECOMMENDATION} />);

    expect(container.querySelectorAll("img")).toHaveLength(0);
  });

  it("出典（CC BY）とは別に、データセットのカテゴリに応じたJNTOの参考情報を出す（ADR-012）", () => {
    render(<RecommendationCard recommendation={RECOMMENDATION} />);

    // SOURCE.datasetId は名所・史跡（神社・寺のカテゴリ）
    expect(screen.getByText("参考: JNTO")).toBeInTheDocument();
    expect(screen.getByText(/鳥居をくぐる前に一礼し/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /JNTO/ })).toHaveAttribute(
      "href",
      "https://www.japan.travel/en/guide/shrine-and-temple-traditions/",
    );
  });
});
