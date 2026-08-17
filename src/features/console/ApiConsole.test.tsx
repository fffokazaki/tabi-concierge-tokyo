import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiConsole } from "./ApiConsole";

/**
 * コンソール画面の検証。fetch をグローバルに差し替え、送信〜表示までを通す。
 *
 * 見た目の細部ではなく「answered / unanswered / エラーが区別されて出るか」と
 * 「候補の datasetId が他フォームへ引き継がれるか」だけを固定する
 * （このコンソール自体が開発用の道具で、表示の細部は変わりやすいため）。
 */

const jsonResponse = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

afterEach(() => {
  vi.unstubAllGlobals();
});

const submitSearch = () => {
  // 検索フォームの送信ボタンは最初の「送信」
  fireEvent.click(screen.getAllByRole("button", { name: "送信" })[0]);
};

describe("ApiConsole", () => {
  it("answered 応答は「回答あり」として生 JSON つきで表示される", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(200, {
          status: "answered",
          candidates: [{ datasetId: "t131067d0000000251", title: "名所・史跡" }],
        }),
      ),
    );
    render(<ApiConsole />);

    submitSearch();

    await waitFor(() => expect(screen.getByText(/回答あり/)).toBeInTheDocument());
    expect(screen.getByText(/HTTP 200/)).toBeInTheDocument();
    expect(screen.getByText(/t131067d0000000251/)).toBeInTheDocument();
  });

  it("unanswered 応答はエラーではなく「回答なし（正常）」として表示される", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(200, { status: "unanswered", reason: "out_of_area", message: "対象エリア外です" }),
      ),
    );
    render(<ApiConsole />);

    submitSearch();

    await waitFor(() => expect(screen.getByText(/回答なし（正常）/)).toBeInTheDocument());
    // 正常応答なので alert にしない（エラー風に見せると中心設計と矛盾する）
    expect(screen.getByRole("status")).toHaveTextContent("回答なし（正常）");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("400 応答は unanswered と区別された「エラー応答」として表示される", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(400, { error: "invalid_request", message: "query が必要" })),
    );
    render(<ApiConsole />);

    submitSearch();

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("エラー応答"));
    expect(screen.getByText(/invalid_request/)).toBeInTheDocument();
  });

  it("候補を選ぶと datasetId が集計・出典フォームへ引き継がれる", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(200, {
          status: "answered",
          candidates: [
            { datasetId: "t131067d0000000251", title: "名所・史跡" },
            { datasetId: "t131067d0000000236", title: "文化観光施設" },
          ],
        }),
      ),
    );
    render(<ApiConsole />);
    submitSearch();
    await waitFor(() => expect(screen.getByRole("button", { name: "名所・史跡" })).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "名所・史跡" }));
    expect(screen.getByLabelText("datasetId（必須）")).toHaveValue("t131067d0000000251");

    fireEvent.click(screen.getByRole("button", { name: "文化観光施設" }));
    // 集計は1件なので後から選んだ方に置き換わり、出典は複数可なので積み上がる
    expect(screen.getByLabelText("datasetId（必須）")).toHaveValue("t131067d0000000236");
    expect(screen.getByLabelText("datasetIds（カンマ区切り・必須）")).toHaveValue(
      "t131067d0000000251, t131067d0000000236",
    );
  });
});
