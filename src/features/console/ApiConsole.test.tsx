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

  it("非 JSON の 200 は「応答を読めません」として alert 表示される（network と混ざらない）", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>injected</html>", { status: 200 })));
    render(<ApiConsole />);

    submitSearch();

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("応答を読めません"));
    expect(screen.getByText(/<html>injected<\/html>/)).toBeInTheDocument();
  });

  it("fetch の失敗は「サーバーに接続できません」として alert 表示される", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    render(<ApiConsole />);

    submitSearch();

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("サーバーに接続できません"));
  });

  it("status が仕様外の 200 は「status 不明」の警告として表示される（alert にしない）", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, { status: "maybe" })));
    render(<ApiConsole />);

    submitSearch();

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("200（status 不明）"));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("検索フォームは limit を数値化し、空の絞り込みをボディから省く（補正はしない）", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, { status: "answered", candidates: [] }));
    vi.stubGlobal("fetch", fetchImpl);
    render(<ApiConsole />);

    // 範囲外の 0 も数値のまま送る（400 の経路を確かめる道具なので補正しない）
    fireEvent.change(screen.getByLabelText("limit"), { target: { value: "0" } });
    submitSearch();
    await waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1));
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({ query: "上野の寺社をめぐりたい", limit: 0 });

    // 数値でない limit は文字列のまま送る（型違反の 400 を試せる）
    fireEvent.change(screen.getByLabelText("limit"), { target: { value: "abc" } });
    submitSearch();
    await waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(2));
    expect(JSON.parse(fetchImpl.mock.calls[1][1].body)).toEqual({ query: "上野の寺社をめぐりたい", limit: "abc" });
  });

  it("出典フォームはカンマ・空白区切りの datasetIds を配列にして送る", async () => {
    // 改行は <input> が値として保持できない（DOM 仕様で除去される）ため、区切りとしては扱えない。
    // 複数行を貼り付けると ID が連結されるが、未知 ID として unanswered になり画面で気づける
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, { status: "answered", sources: [] }));
    vi.stubGlobal("fetch", fetchImpl);
    render(<ApiConsole />);

    fireEvent.change(screen.getByLabelText("datasetIds（カンマ区切り・必須）"), {
      target: { value: " id1, id2　id3 " },
    });
    fireEvent.click(screen.getAllByRole("button", { name: "送信" })[2]);

    await waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1));
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(body.datasetIds).toEqual(["id1", "id2", "id3"]);
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

    // 同じ候補をもう一度選んでも出典の ID は重複しない
    fireEvent.click(screen.getByRole("button", { name: "名所・史跡" }));
    expect(screen.getByLabelText("datasetIds（カンマ区切り・必須）")).toHaveValue(
      "t131067d0000000251, t131067d0000000236",
    );
  });
});
