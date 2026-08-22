import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GapEscalationNote } from "./GapEscalationNote";

/**
 * 注記そのものの検査。**出す・出さないの判定はここには無い**（画面側の分岐で、
 * `AppTabs.test.tsx` が実際の DOM で確かめる）。`reason` による出し分けを持たない理由は
 * `GapEscalationNote.tsx` の doc を参照 —— サーバーが返す `other` も記録されているため。
 */
describe("GapEscalationNote", () => {
  it("記録（事実）と還元（意図）の2文をそのまま描画する", () => {
    render(<GapEscalationNote />);

    // 文言はここに literal で置く。コンポーネント側の定数を import して照合すると
    // 何をどう書き換えても通ってしまい、「記録されます／変えていきます」の時制の
    // 切り分け（実装済みの事実と、構想である意図の区別）を検査できない
    expect(
      screen.getByText(
        "答えられなかった問いは記録されます。何が足りないのかを、東京都へのデータ公開リクエストに変えていきます。",
      ),
    ).toBeInTheDocument();
  });

  /**
   * 2026-08-17 の「押す操作を増やさない」決定の回帰。**`button` 要素だけを見ては足りない** ——
   * リンクや `role="button"` を足しても、実在しないオプトイン申請を示唆することは同じなので、
   * 押せるもの全体を禁止する（この観点は Codex のレビュー指摘で足した）。
   */
  it("押せる要素を1つも描画しない（実在しないオプトイン申請を示唆しないため）", () => {
    const { container } = render(<GapEscalationNote />);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(container.querySelector('a, button, input, [role="button"], [role="link"]')).toBeNull();
  });

  it("「送信」「提出」「受け付け」を名乗らない（都への提出プロセスは構想）", () => {
    const { container } = render(<GapEscalationNote />);

    expect(container.textContent).not.toMatch(/送信|提出|受け付け/);
  });

  /** doc が明言している「ライブリージョンにしない」の固定。`role="status"` を足すと
   *  `route-empty` / `DataGapCard` と重ねて読み上げられる。 */
  it("ライブリージョンにしない", () => {
    render(<GapEscalationNote />);

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("装飾アイコンは支援技術へ露出させない", () => {
    const { container } = render(<GapEscalationNote />);

    expect(container.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  });
});
