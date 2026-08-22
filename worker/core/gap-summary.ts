import {
  REPRESENTATIVE_AREAS,
  UNANSWERED_REASONS,
  type GapSummaryResponse,
  type UnansweredReason,
} from "../../shared/core";

/**
 * 認証のない集計 API へそのまま公開してよいエリア名。
 *
 * `area` / `areas` は任意文字列を受け付け、その値が `gaps.area` に保存されうる。代表エリアと
 * 既知の対象外エリア以外は、自由入力（メールアドレス等）の可能性があるため公開しない。
 */
const PUBLIC_GAP_AREA_LABELS = [
  ...REPRESENTATIVE_AREAS,
  "新宿",
  "池袋",
  "銀座",
  "秋葉原",
  "お台場",
  "六本木",
  "吉祥寺",
  "品川",
] as const;

const OTHER_GAP_AREA_LABEL = "その他のエリア";

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
 * SQL で取得するのは `reason` / 公開用に丸めた `area` / 件数だけ。`question` をいったん
 * 読んでから捨てず、任意の `area` も生値では取り出さないことで、自由入力の個票が公開 API の
 * 処理境界へ入らないようにする。
 */
export async function getGapSummary(db: D1Database): Promise<GapSummaryResponse> {
  const placeholders = PUBLIC_GAP_AREA_LABELS.map(() => "?").join(", ");
  const { results } = await db
    .prepare(
      `WITH public_gaps AS (
        SELECT
          reason,
          CASE
            WHEN area IS NULL THEN NULL
            WHEN area IN (${placeholders}) THEN area
            ELSE ?
          END AS area
        FROM gaps
      )
      SELECT reason, area, COUNT(*) AS count
      FROM public_gaps
      GROUP BY reason, area`,
    )
    .bind(...PUBLIC_GAP_AREA_LABELS, OTHER_GAP_AREA_LABEL)
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
