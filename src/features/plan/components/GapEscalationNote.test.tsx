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

  it("ボタンを描画しない（実在しないオプトイン申請を示唆しないため・2026-08-17 の決定）", () => {
    render(<GapEscalationNote />);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("「送信」「提出」「受け付け」を名乗らない（都への提出プロセスは構想）", () => {
    const { container } = render(<GapEscalationNote />);

    expect(container.textContent).not.toMatch(/送信|提出|受け付け/);
  });
});
