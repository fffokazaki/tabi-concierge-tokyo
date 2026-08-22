import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

const summaryResponse = {
  total: 4,
  byReason: [
    { reason: "insufficient_granularity", count: 2 },
    { reason: "data_not_published", count: 1 },
    { reason: "out_of_area", count: 1 },
  ],
  byArea: [
    { area: "上野", count: 2 },
    { area: null, count: 1 },
    { area: "新宿", count: 1 },
  ],
  byReasonAndArea: [
    { reason: "insufficient_granularity", area: "上野", count: 2 },
    { reason: "data_not_published", area: null, count: 1 },
    { reason: "out_of_area", area: "新宿", count: 1 },
  ],
};

describe("/gaps 還元ダッシュボード", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    window.history.replaceState({}, "", "/");
  });

  it("実データの集計と、都への提出が構想であることを表示する", async () => {
    window.history.replaceState({}, "", "/gaps");
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(summaryResponse), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchImpl);

    render(<App />);

    expect(screen.getByRole("heading", { name: "データ還元ダッシュボード" })).toBeInTheDocument();
    expect(screen.getByText(/東京都・GovTech東京への公開リクエストにまとめる構想/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("4")).toBeInTheDocument());
    expect(screen.getAllByText("粒度不足").length).toBeGreaterThan(0);
    expect(screen.getAllByText("上野").length).toBeGreaterThan(0);
    expect(fetchImpl).toHaveBeenCalledWith("/api/gaps/summary", expect.objectContaining({ method: "GET" }));
  });

  it("0 件を捏造値で埋めず、記録がまだ無いことを表示する", async () => {
    window.history.replaceState({}, "", "/gaps");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ total: 0, byReason: [], byArea: [], byReasonAndArea: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );

    render(<App />);

    await waitFor(() => expect(screen.getByText("未回答の記録はまだありません。")).toBeInTheDocument());
  });
});
