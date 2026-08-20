import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { JntoReference } from "../jntoEtiquette";
import { JntoReferenceNote } from "./JntoReferenceNote";

const REFERENCE: JntoReference = {
  summary: "鳥居や山門をくぐる前に一礼し、参道の中央は避けて端を歩きます。",
  url: "https://www.japan.travel/en/guide/shrine-and-temple-traditions/",
};

describe("JntoReferenceNote", () => {
  it("要約とJNTOへのリンクを描画する", () => {
    render(<JntoReferenceNote reference={REFERENCE} />);

    expect(screen.getByText(REFERENCE.summary)).toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveAttribute("href", REFERENCE.url);
  });

  it("新しいタブで開く（外部サイトへのリンクのため）", () => {
    render(<JntoReferenceNote reference={REFERENCE} />);

    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noreferrer");
  });

  it("「出典」ではなく「参考」とラベル付けする（ADR-012。CC BY 出典と混同させない）", () => {
    render(<JntoReferenceNote reference={REFERENCE} />);

    expect(screen.getByText("参考: JNTO")).toBeInTheDocument();
    expect(screen.queryByText(/^出典/)).not.toBeInTheDocument();
  });

  it("ProvenanceChip とは別クラス名を使う（見た目を意図的に区別する。ADR-012）", () => {
    const { container } = render(<JntoReferenceNote reference={REFERENCE} />);

    expect(container.querySelector(".provenance-chip")).toBeNull();
    expect(container.querySelector(".jnto-reference-note")).not.toBeNull();
  });
});
