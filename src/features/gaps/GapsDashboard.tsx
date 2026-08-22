import { useEffect, useState } from "react";
import {
  UNANSWERED_REASONS,
  type GapSummaryResponse,
  type UnansweredReason,
} from "../../../shared/core";

const SUMMARY_PATH = "/api/gaps/summary";

const REASON_LABELS: Record<UnansweredReason, string> = {
  data_not_published: "データ未公開",
  insufficient_granularity: "粒度不足",
  out_of_area: "対象エリア外",
  other: "その他",
};

type LoadState =
  | { kind: "loading" }
  | { kind: "loaded"; summary: GapSummaryResponse }
  | { kind: "error"; message: string };

export function GapsDashboard() {
  const [state, setState] = useState<LoadState>({ kind: "loading" });

  useEffect(() => {
    const controller = new AbortController();

    void loadSummary(controller.signal).then((next) => {
      if (!controller.signal.aborted) setState(next);
    });

    return () => controller.abort();
  }, []);

  return (
    <main className="gaps-dashboard">
      <header className="gaps-dashboard__header">
        <a className="gaps-dashboard__back" href="/">
          ← 旅コンシェルジュTOKYOへ
        </a>
        <p className="eyebrow">OPEN DATA FEEDBACK</p>
        <h1>データ還元ダッシュボード</h1>
        <p className="gaps-dashboard__lead">
          旅の問いに答えられなかった記録を、何のデータが足りないのか見渡せる形に集計します。
        </p>
        <div className="gaps-dashboard__concept">
          <strong>構想</strong>
          <span>この集計を、東京都・GovTech東京への公開リクエストにまとめる構想です。提出プロセス自体は未実装です。</span>
        </div>
      </header>

      {state.kind === "loading" && <p role="status">集計を読み込んでいます…</p>}
      {state.kind === "error" && (
        <div className="gaps-dashboard__error" role="alert">
          <strong>集計を読み込めませんでした</strong>
          <span>{state.message}</span>
        </div>
      )}
      {state.kind === "loaded" && <Summary summary={state.summary} />}

      <p className="gaps-dashboard__privacy">
        この画面と API は分類済みの集計値だけを扱います。利用者が入力した質問文（個票）や、
        公開対象外のエリア入力は公開しません。
      </p>
    </main>
  );
}

function Summary({ summary }: { summary: GapSummaryResponse }) {
  if (summary.total === 0) {
    return (
      <section className="gaps-dashboard__empty">
        <span className="gaps-dashboard__total">0</span>
        <p>未回答の記録はまだありません。</p>
      </section>
    );
  }

  return (
    <>
      <section className="gaps-dashboard__total-card" aria-label="未回答の記録総数">
        <span className="gaps-dashboard__total">{summary.total}</span>
        <span>件の未回答を記録</span>
        <small>同じ問いも発生ごとに数えます</small>
      </section>

      <div className="gaps-dashboard__grid">
        <BreakdownCard title="理由別" items={summary.byReason.map((item) => ({
          label: REASON_LABELS[item.reason],
          count: item.count,
        }))} />
        <BreakdownCard title="エリア別" items={summary.byArea.map((item) => ({
          label: item.area ?? "エリア指定なし",
          count: item.count,
        }))} />
      </div>

      <section className="gaps-dashboard__card">
        <h2>理由 × エリア</h2>
        <div className="gaps-dashboard__table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">理由</th>
                <th scope="col">エリア</th>
                <th scope="col">件数</th>
              </tr>
            </thead>
            <tbody>
              {summary.byReasonAndArea.map((item) => (
                <tr key={`${item.reason}:${item.area ?? "none"}`}>
                  <td>{REASON_LABELS[item.reason]}</td>
                  <td>{item.area ?? "エリア指定なし"}</td>
                  <td>{item.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function BreakdownCard({ title, items }: { title: string; items: Array<{ label: string; count: number }> }) {
  const max = Math.max(...items.map((item) => item.count), 1);

  return (
    <section className="gaps-dashboard__card">
      <h2>{title}</h2>
      <ul className="gaps-dashboard__breakdown">
        {items.map((item) => (
          <li key={item.label}>
            <div className="gaps-dashboard__row">
              <span>{item.label}</span>
              <strong>{item.count}</strong>
            </div>
            <div className="gaps-dashboard__bar" aria-hidden="true">
              <span style={{ width: `${(item.count / max) * 100}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

async function loadSummary(signal: AbortSignal): Promise<LoadState> {
  try {
    const response = await fetch(SUMMARY_PATH, { method: "GET", headers: { accept: "application/json" }, signal });
    if (!response.ok) return { kind: "error", message: `HTTP ${response.status}` };

    const body: unknown = await response.json();
    if (!isGapSummaryResponse(body)) return { kind: "error", message: "応答の形が想定と違います。" };
    return { kind: "loaded", summary: body };
  } catch (cause) {
    if (signal.aborted) return { kind: "loading" };
    return { kind: "error", message: cause instanceof Error ? cause.message : String(cause) };
  }
}

function isGapSummaryResponse(value: unknown): value is GapSummaryResponse {
  if (!isRecord(value) || !isCount(value.total)) return false;
  if (!Array.isArray(value.byReason) || !Array.isArray(value.byArea) || !Array.isArray(value.byReasonAndArea)) return false;

  const isReason = (reason: unknown): reason is UnansweredReason =>
    typeof reason === "string" && (UNANSWERED_REASONS as readonly string[]).includes(reason);
  const isArea = (area: unknown): area is string | null => area === null || typeof area === "string";

  return (
    value.byReason.every((item) => isRecord(item) && isReason(item.reason) && isCount(item.count)) &&
    value.byArea.every((item) => isRecord(item) && isArea(item.area) && isCount(item.count)) &&
    value.byReasonAndArea.every(
      (item) => isRecord(item) && isReason(item.reason) && isArea(item.area) && isCount(item.count),
    )
  );
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isCount = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0;
