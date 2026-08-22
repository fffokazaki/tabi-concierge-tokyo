import {
  UNANSWERED_REASONS,
  type GapSummaryResponse,
  type UnansweredReason,
} from "../../shared/core";

type GroupedGapRow = {
  reason: UnansweredReason;
  area: string | null;
  count: number;
};

const reasonOrder = new Map<UnansweredReason, number>(
  UNANSWERED_REASONS.map((reason, index) => [reason, index]),
);

const compareArea = (left: string | null, right: string | null) => {
  if (left === right) return 0;
  if (left === null) return -1;
  if (right === null) return 1;
  return left.localeCompare(right, "ja");
};

/**
 * D1 の `gaps` を公開リクエスト候補として読める集計へ変換する。
 *
 * SQL で取得するのは `reason` / `area` / 件数だけ。`question` をいったん読んでから捨てる形に
 * しないことで、自由入力の個票が公開 API の処理境界へ入らないようにする。
 */
export async function getGapSummary(db: D1Database): Promise<GapSummaryResponse> {
  const { results } = await db
    .prepare("SELECT reason, area, COUNT(*) AS count FROM gaps GROUP BY reason, area")
    .all<{ reason: UnansweredReason; area: string | null; count: number }>();

  const byReasonCounts = new Map<UnansweredReason, number>();
  const byAreaCounts = new Map<string | null, number>();
  const byReasonAndArea: GroupedGapRow[] = results.map((row) => {
    const count = Number(row.count);
    byReasonCounts.set(row.reason, (byReasonCounts.get(row.reason) ?? 0) + count);
    byAreaCounts.set(row.area, (byAreaCounts.get(row.area) ?? 0) + count);
    return { reason: row.reason, area: row.area, count };
  });

  const byReason = [...byReasonCounts].map(([reason, count]) => ({ reason, count }));
  byReason.sort(
    (left, right) =>
      right.count - left.count || (reasonOrder.get(left.reason) ?? 0) - (reasonOrder.get(right.reason) ?? 0),
  );

  const byArea = [...byAreaCounts].map(([area, count]) => ({ area, count }));
  byArea.sort((left, right) => right.count - left.count || compareArea(left.area, right.area));

  byReasonAndArea.sort(
    (left, right) =>
      right.count - left.count ||
      (reasonOrder.get(left.reason) ?? 0) - (reasonOrder.get(right.reason) ?? 0) ||
      compareArea(left.area, right.area),
  );

  return {
    total: byReason.reduce((sum, item) => sum + item.count, 0),
    byReason,
    byArea,
    byReasonAndArea,
  };
}
