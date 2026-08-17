import type { UnansweredReason } from "../../shared/core";

/**
 * 未回答（`unanswered`）を D1 の `gaps` テーブルへ記録する（Issue #27）。
 *
 * DOMAIN.md §8 の不変条件4 は「未回答は必ず理由分類され、**記録される**」と定めている。
 * Issue #22 のスタブは分類して返すところまでは満たしていたが、記録していなかった。
 * 記録が無いと DOMAIN.md §7 の「未回答 → データ公開リクエスト」への還元が成立しない。
 * これは本プロジェクトのコアドメインの半分にあたる。
 *
 * ## なぜ記録器を必須の引数にするのか
 *
 * `worker/core/` は `/api/*` と `/mcp` の**両方から呼ばれる**（ADR-008）。記録器を
 * optional にすると、`/mcp` を足したときに渡し忘れても型が通り、**その経路だけ黙って
 * 記録が止まる**。記録の欠落は応答を壊さないので、テストでも本番でも気づけない。
 * 必須にしておけば、渡し忘れはコンパイルエラーになる。
 *
 * 「記録しない」を選ぶこと自体は禁じていないが、そのときは呼び出し側のコードに
 * 記録しない実装を書くことになる（書き忘れとは区別がつく）。
 */

/** `gaps` テーブルの1行。列は migrations/0001_init.sql と対応する。 */
export type GapRecord = {
  /** 答えられなかった質問。`query` / `intent` をそのまま入れる */
  question: string;
  /**
   * この問いがどのエリアについてのものだったか。**解決後の値**を入れる。
   *
   * 入力の `area` をそのまま入れてはいけない。「新宿の美術館」（`area` 未指定）が
   * `out_of_area` で返るとき、集計に効く値は質問文から解決した「新宿」であって、
   * 未指定の `area` ではない。どのエリアのデータが足りないかを集計するための列なので、
   * ここを取り違えると最も有用なシグナルが落ちる。
   */
  area?: string;
  /** 絞り込みに使った分類（あれば） */
  category?: string;
  reason: UnansweredReason;
};

/**
 * 未回答の記録先。テストは D1 を使わない実装に差し替える。
 */
export interface GapRecorder {
  /** 0件のときは何もしない。**この呼び出しは失敗しない**（下記 `d1GapRecorder` 参照） */
  record(records: readonly GapRecord[]): Promise<void>;
}

const INSERT_GAP = "INSERT INTO gaps (question, area, category, reason) VALUES (?, ?, ?, ?)";

/**
 * D1 へ書き込む記録器。
 *
 * **書き込みの失敗で回答経路を落とさない。** 未回答そのものは正常な応答なので、
 * 記録に失敗したことを理由に 500 を返すと、答えられないという事実まで利用者に届かなくなる。
 * ただし**握りつぶさない**。Workers で観測できるのは `console.*` → wrangler tail / Logpush
 * だけなので、失敗は必ずログに出す（DOMAIN.md §8 不変条件4 が守れていない状態そのものであり、
 * 静かに消えると「gaps が 0 行なのは未回答が無いから」と誤読される）。
 */
export function d1GapRecorder(db: D1Database): GapRecorder {
  return {
    async record(records) {
      if (records.length === 0) return;
      try {
        const statement = db.prepare(INSERT_GAP);
        await db.batch(
          records.map((record) =>
            statement.bind(record.question, record.area ?? null, record.category ?? null, record.reason),
          ),
        );
      } catch (cause) {
        console.error("[gaps] 未回答の記録に失敗しました", {
          count: records.length,
          reasons: records.map((record) => record.reason),
          cause,
        });
      }
    },
  };
}
