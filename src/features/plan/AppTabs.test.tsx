import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  AGGREGATE_PATH,
  jsonResponse,
  MEISHO_ID,
  provenanceSource,
  PROVENANCE_PATH,
  SEARCH_PATH,
  stubFetch,
  stubSuccessfulPlan,
} from "../../test/planFixtures";
import { AppTabs } from "./AppTabs";
import { COUNTER_BOUNDS } from "./constants";

/**
 * プラン画面の表示（Issue #31）。
 *
 * AC の3系統（answered / unanswered / 障害）を、実際の DOM で確かめる。
 * `unanswered` と障害を同じ見た目にしないこと、出典なしの内容を出さないことが要点。
 */

/** 「ブリーフィングを作成」を押してルートが揃うまで待つ */
async function createBriefing(fetchImpl: typeof fetch) {
  render(<AppTabs options={{ fetchImpl }} />);
  fireEvent.click(screen.getByRole("button", { name: "ブリーフィングを作成" }));
}

describe("AppTabs", () => {
  it("旅のプロフィールからブリーフィング画面へ移る", async () => {
    const { fetchImpl } = stubSuccessfulPlan();
    render(<AppTabs options={{ fetchImpl }} />);

    expect(screen.getByText("あなたの旅について教えてください。")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "ブリーフィングを作成" }));

    expect(screen.getByText("現地の知識で明日を計画しよう。")).toBeInTheDocument();
    expect(screen.getByText("あなたのルート")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("寛永寺")).toBeInTheDocument());
  });

  it("keeps counters within their configured bounds when wired into the setup screen's actual buttons", () => {
    const { fetchImpl } = stubSuccessfulPlan();
    render(<AppTabs options={{ fetchImpl }} />);

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

  it("renders the other tabs as disabled placeholders", async () => {
    const { fetchImpl } = stubSuccessfulPlan();
    await createBriefing(fetchImpl);

    expect(screen.getByRole("button", { name: "スキャン" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "周辺" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "あなたへ" })).toBeDisabled();
  });
});

describe("answered — 応答由来のルートと出典", () => {
  it("応答待ちのあいだローディングを出す（無反応に見せない）", async () => {
    const { fetchImpl } = stubSuccessfulPlan();
    await createBriefing(fetchImpl);

    expect(screen.getByText("オープンデータを探しています…")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("寛永寺")).toBeInTheDocument());
  });

  it("停留地の名称と説明が応答由来の値になる", async () => {
    const { fetchImpl } = stubSuccessfulPlan();
    await createBriefing(fetchImpl);

    await waitFor(() => expect(screen.getByText("寛永寺")).toBeInTheDocument());
    // Stop.place ← name / Stop.note ← summary
    expect(screen.getByText("所在地は台東区上野桜木1丁目14番。")).toBeInTheDocument();
    expect(screen.getByText("国立西洋美術館")).toBeInTheDocument();
    expect(screen.getByText("燕湯")).toBeInTheDocument();
  });

  it("停留地ごとに出典チップが出る（ライセンス表記つき）", async () => {
    const { fetchImpl } = stubSuccessfulPlan();
    await createBriefing(fetchImpl);

    await waitFor(() => expect(screen.getByText("寛永寺")).toBeInTheDocument());
    expect(screen.getAllByRole("link", { name: "CC BY 4.0" })).toHaveLength(3);
    expect(screen.getByRole("link", { name: "名所・史跡" })).toHaveAttribute(
      "href",
      `https://catalog.data.metro.tokyo.lg.jp/dataset/${MEISHO_ID}`,
    );
  });

  it("仮データと「デモデータです」ラベルが残っていない", async () => {
    const { fetchImpl } = stubSuccessfulPlan();
    await createBriefing(fetchImpl);

    await waitFor(() => expect(screen.getByText("寛永寺")).toBeInTheDocument());
    // mockScenarios.ts 由来の内容が API 接続経路に混ざっていないこと
    expect(screen.queryByText(/デモデータです/)).not.toBeInTheDocument();
    expect(screen.queryByText("浅草寺（浅草）")).not.toBeInTheDocument();
    expect(screen.queryByText("ラーメン二郎 上野店")).not.toBeInTheDocument();
  });

  it("出典のあるマナー情報が無いことを明示する（仮のマナー文を出さない）", async () => {
    const { fetchImpl } = stubSuccessfulPlan();
    await createBriefing(fetchImpl);

    await waitFor(() => expect(screen.getByText("寛永寺")).toBeInTheDocument());
    expect(screen.getByText(/出典のあるマナー情報はまだありません/)).toBeInTheDocument();
    expect(screen.queryByText(/鳥居をくぐる前に一礼/)).not.toBeInTheDocument();
  });

  it("答えられなかった興味（#29 の gaps）を結果として表示する", async () => {
    const { fetchImpl } = stubFetch({
      [SEARCH_PATH]: () =>
        jsonResponse({
          status: "answered",
          candidates: [{ datasetId: MEISHO_ID, title: "t", provider: "p", url: "u", matchReason: "r" }],
          gaps: [
            {
              status: "unanswered",
              reason: "insufficient_granularity",
              message: "飲食店データはジャンルの列を持たないため「ラーメン」の粒度では答えられません。",
            },
          ],
        }),
      [AGGREGATE_PATH]: () =>
        jsonResponse({ status: "answered", result: { name: "寛永寺", summary: "所在地は…" }, query: "q" }),
      [PROVENANCE_PATH]: () =>
        jsonResponse({ status: "answered", sources: [provenanceSource(MEISHO_ID, "名所・史跡")] }),
    });
    await createBriefing(fetchImpl);

    await waitFor(() => expect(screen.getByText("一部の興味には答えられませんでした")).toBeInTheDocument());
    expect(screen.getByText(/「ラーメン」の粒度では答えられません/)).toBeInTheDocument();
    // 欠損があってもルート自体は出る
    expect(screen.getByText("寛永寺")).toBeInTheDocument();
  });
});

describe("unanswered — 正常な結果として表示する", () => {
  it("エラー表示ではなく「該当するオープンデータがありません」＋ message を出す", async () => {
    const { fetchImpl } = stubFetch({
      [SEARCH_PATH]: () =>
        jsonResponse({
          status: "unanswered",
          reason: "out_of_area",
          message: "「新宿」は POC の対象エリア（上野・浅草・渋谷）の外です。",
        }),
    });
    await createBriefing(fetchImpl);

    await waitFor(() => expect(screen.getByText("該当するオープンデータがありません")).toBeInTheDocument());
    expect(screen.getByText(/「新宿」は POC の対象エリア/)).toBeInTheDocument();
    // 理由分類を握りつぶさない
    expect(screen.getByText("分類: out_of_area")).toBeInTheDocument();
    // 障害の見出しは出ない
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("障害 — unanswered と区別して表示する", () => {
  it("ネットワーク断は接続の問題として出す", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError("Failed to fetch")) as unknown as typeof fetch;
    await createBriefing(fetchImpl);

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByText("サーバーに接続できませんでした")).toBeInTheDocument();
    // データが無いという結論に倒さない
    expect(screen.queryByText("該当するオープンデータがありません")).not.toBeInTheDocument();
  });

  it("HTTP エラーはサーバー側のエラーとして出し、再試行できる", async () => {
    let attempt = 0;
    const { fetchImpl } = stubFetch({
      [SEARCH_PATH]: () => {
        attempt += 1;
        return attempt === 1
          ? jsonResponse({ error: "internal_error", message: "サーバー内部でエラーが発生しました" }, 500)
          : jsonResponse({
              status: "answered",
              candidates: [{ datasetId: MEISHO_ID, title: "t", provider: "p", url: "u", matchReason: "r" }],
            });
      },
      [AGGREGATE_PATH]: () =>
        jsonResponse({ status: "answered", result: { name: "寛永寺", summary: "所在地は…" }, query: "q" }),
      [PROVENANCE_PATH]: () =>
        jsonResponse({ status: "answered", sources: [provenanceSource(MEISHO_ID, "名所・史跡")] }),
    });
    await createBriefing(fetchImpl);

    await waitFor(() => expect(screen.getByText("サーバーがエラーを返しました")).toBeInTheDocument());
    expect(screen.getByText(/HTTP 500/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "再試行" }));
    await waitFor(() => expect(screen.getByText("寛永寺")).toBeInTheDocument());
  });

  it("仕様外の応答は「読み取れない」として出す（データが無いことにしない）", async () => {
    const { fetchImpl } = stubFetch({
      [SEARCH_PATH]: () => jsonResponse({ status: "answered", candidates: [{ title: "datasetId が無い" }] }),
    });
    await createBriefing(fetchImpl);

    await waitFor(() => expect(screen.getByText("応答を読み取れませんでした")).toBeInTheDocument());
    expect(screen.queryByText("該当するオープンデータがありません")).not.toBeInTheDocument();
  });
});
