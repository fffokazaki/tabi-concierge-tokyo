import { describe, expect, it, vi } from "vitest";
import {
  AGGREGATE_PATH as AGGREGATE,
  BUNKA_ID,
  BUNKAZAI_ID,
  jsonResponse as json,
  MEISHO_ID,
  PROVENANCE_PATH as PROVENANCE,
  provenanceSource as source,
  SEARCH_PATH as SEARCH,
  stubFetch,
} from "../../test/planFixtures";
import { buildPlan, type PlanOutcome } from "./buildPlan";
import { DEFAULT_TRIP } from "./constants";

const expectPlan = (outcome: PlanOutcome): Extract<PlanOutcome, { kind: "plan" }> => {
  if (outcome.kind !== "plan") throw new Error(`plan を期待したが ${JSON.stringify(outcome)}`);
  return outcome;
};

/**
 * 候補ごとの `aggregate_dataset` を**同時に**投げることの検証（Issue #142）。
 *
 * Step 5（Issue #119・#120）で1回の呼び出しが約1.1秒（ほぼ全部が推論の待ち時間）に
 * なったため、候補4件を1件ずつ待つと旅程が出るまで5〜6秒かかっていた。速さの検証は
 * 実時間を測らず、「1件目の応答を止めたまま後続が投げられるか」で見る（実時間で
 * 測るテストは CI の負荷で揺れる）。
 *
 * あわせて**並びが到着順に引きずられないこと**も固定する。`Promise.all` の結果を
 * 到着順に積むと、同じ入力でも実行のたびに停留地の順序が変わる。
 * 同型の実装が `buildRecommendations.parallel.test.ts` にある（ACE-98-1。対で写す）。
 *
 * `buildPlan.test.ts` から分けてあるのは、足したぶんで 842 行になり MASTER.md の閾値
 * （800 行超で分割を推奨）に触れたため。並列化の契約だけを1ファイルにまとめている。
 */
describe("buildPlan の集計を同時に投げる（Issue #142）", () => {
  const candidate = (datasetId: string, title: string) => ({
    datasetId,
    title,
    provider: "台東区",
    url: "u",
    matchReason: "r",
  });

  const THREE_CANDIDATES = [
    candidate(MEISHO_ID, "名所・史跡"),
    candidate(BUNKA_ID, "文化観光施設"),
    candidate(BUNKAZAI_ID, "文化財一覧"),
  ];

  const NAME_BY_ID: Record<string, string> = {
    [MEISHO_ID]: "寛永寺",
    [BUNKA_ID]: "国立西洋美術館",
    [BUNKAZAI_ID]: "絹本著色元三大師画像",
  };

  it("1件目の応答を待たずに残りの候補も投げる（直列だと候補数ぶん待ち時間が積み上がる）", async () => {
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const started: string[] = [];

    const { fetchImpl } = stubFetch({
      [SEARCH]: () => json({ status: "answered", candidates: THREE_CANDIDATES }),
      [AGGREGATE]: async (body) => {
        const datasetId = (body as { datasetId: string }).datasetId;
        started.push(datasetId);
        // 応答を止めたまま、後続の候補が投げられるかを見る
        await held;
        return json({ status: "answered", result: { name: NAME_BY_ID[datasetId], summary: "…" }, query: "q" });
      },
      [PROVENANCE]: () =>
        json({
          status: "answered",
          sources: [
            source(MEISHO_ID, "名所・史跡"),
            source(BUNKA_ID, "文化観光施設"),
            source(BUNKAZAI_ID, "文化財一覧"),
          ],
        }),
    });

    const pending = buildPlan(DEFAULT_TRIP, { fetchImpl });
    try {
      await vi.waitFor(() => expect(started).toEqual([MEISHO_ID, BUNKA_ID, BUNKAZAI_ID]));
    } finally {
      // 直列のままなら waitFor が落ちる。保留したままにすると fetch が返らず後始末が残る
      release();
    }
    // 保留を解いたあと最後まで組み上がることまで見る。`await pending` だけだと、結果が
    // failure に化けていても通ってしまう
    const plan = expectPlan(await pending);
    expect(plan.stops.map((s) => s.stop.place)).toEqual(["寛永寺", "国立西洋美術館", "絹本著色元三大師画像"]);
  });

  it("障害が複数あっても、候補順で最初のものを返す（到着順ではない）", async () => {
    // 到着順に採ると、同じ入力でも実行のたびに違う障害（HTTP か通信断か）が画面に出る。
    // 1件目の障害だけ遅らせて、先に返る2件目の障害に上書きされないことを見る
    const { fetchImpl, calls } = stubFetch({
      [SEARCH]: () => json({ status: "answered", candidates: THREE_CANDIDATES }),
      [AGGREGATE]: async (body) => {
        const datasetId = (body as { datasetId: string }).datasetId;
        if (datasetId === MEISHO_ID) {
          await new Promise((resolve) => setTimeout(resolve, 20));
          return json({ error: "internal_error", message: "D1 が応答しません" }, 500);
        }
        if (datasetId === BUNKA_ID) throw new TypeError("Failed to fetch"); // 即時の通信断
        return json({ status: "answered", result: { name: "絹本著色元三大師画像", summary: "…" }, query: "q" });
      },
      [PROVENANCE]: () => json({ status: "answered", sources: [source(BUNKAZAI_ID, "文化財一覧")] }),
    });

    const outcome = await buildPlan(DEFAULT_TRIP, { fetchImpl });
    expect(outcome.kind === "failure" && outcome.failure.kind).toBe("http");
    expect(outcome.kind === "failure" && outcome.failure.status).toBe(500);
    // 障害なので出典は取りに行かない（直列だったときと同じ）
    expect(calls.map((c) => c.path)).not.toContain(PROVENANCE);
  });

  it("応答が候補順と違う順に返っても、停留地と gaps の並びは候補順のまま", async () => {
    // 到着順に積む実装だと「文化財一覧 → 名所・史跡」になり、同じ入力でも実行のたびに
    // 旅程の並びが変わる（受け入れ条件「停留地の並び順が変わらない」）。
    // 1件目だけ実際に遅らせる ―― マイクロタスクの解決順に頼ると、遅れずに返る候補の方が
    // 先に並んでしまい、到着順に積む実装でもたまたま通ってしまう（実測で確認）
    const { fetchImpl } = stubFetch({
      [SEARCH]: () => json({ status: "answered", candidates: THREE_CANDIDATES }),
      [AGGREGATE]: async (body) => {
        const datasetId = (body as { datasetId: string }).datasetId;
        if (datasetId === BUNKA_ID) {
          return json({
            status: "unanswered",
            reason: "insufficient_granularity",
            message: "サンプル行が無いため内容を取り出せません。",
          });
        }
        if (datasetId === BUNKAZAI_ID) {
          return json({ status: "answered", result: { name: "絹本著色元三大師画像", summary: "台東区指定文化財。" }, query: "q" });
        }
        await new Promise((resolve) => setTimeout(resolve, 20)); // 1件目が最後に返る
        return json({ status: "answered", result: { name: "寛永寺", summary: "上野桜木1丁目14番。" }, query: "q" });
      },
      [PROVENANCE]: () =>
        json({
          status: "answered",
          sources: [source(MEISHO_ID, "名所・史跡"), source(BUNKAZAI_ID, "文化財一覧")],
        }),
    });

    const plan = expectPlan(await buildPlan(DEFAULT_TRIP, { fetchImpl }));
    expect(plan.stops.map((s) => s.stop.place)).toEqual(["寛永寺", "絹本著色元三大師画像"]);
    expect(plan.gaps.map((gap) => gap.message)).toEqual(["サンプル行が無いため内容を取り出せません。"]);
  });
  it("候補順で最初の障害が確定したら、応答しない候補を待たずに返す", async () => {
    // 全件の完了を待つ実装（`Promise.all`）だと、ここで永遠に返らずテストがタイムアウトする。
    // 直列だったころの「1件目の障害で即座に終わる」を、並列にしたまま保てているかを見る
    const { fetchImpl, calls } = stubFetch({
      [SEARCH]: () => json({ status: "answered", candidates: THREE_CANDIDATES }),
      [AGGREGATE]: (body) => {
        const datasetId = (body as { datasetId: string }).datasetId;
        if (datasetId === MEISHO_ID) return json({ error: "internal_error", message: "D1 が応答しません" }, 500);
        return new Promise<Response>(() => {}); // 応答しない候補
      },
      [PROVENANCE]: () => json({ status: "answered", sources: [source(MEISHO_ID, "名所・史跡")] }),
    });

    const outcome = await buildPlan(DEFAULT_TRIP, { fetchImpl });
    expect(outcome.kind === "failure" && outcome.failure.kind).toBe("http");
    expect(calls.map((c) => c.path)).not.toContain(PROVENANCE);
  });

  it("未回答が複数あっても、gaps は［検索側 → 候補順］のまま", async () => {
    // 1件目の未回答だけ遅らせる。到着順に積むと2件目が先に並び、欠損の並びが実行のたびに変わる
    const { fetchImpl } = stubFetch({
      [SEARCH]: () =>
        json({
          status: "answered",
          candidates: THREE_CANDIDATES,
          gaps: [{ status: "unanswered", reason: "other", message: "「ショッピング」に当たるものがありませんでした。" }],
        }),
      [AGGREGATE]: async (body) => {
        const datasetId = (body as { datasetId: string }).datasetId;
        if (datasetId === MEISHO_ID) {
          await new Promise((resolve) => setTimeout(resolve, 20));
          return json({ status: "unanswered", reason: "insufficient_granularity", message: "1件目の未回答。" });
        }
        if (datasetId === BUNKA_ID) {
          return json({ status: "unanswered", reason: "data_not_published", message: "2件目の未回答。" });
        }
        return json({ status: "answered", result: { name: "絹本著色元三大師画像", summary: "…" }, query: "q" });
      },
      [PROVENANCE]: () => json({ status: "answered", sources: [source(BUNKAZAI_ID, "文化財一覧")] }),
    });

    const plan = expectPlan(await buildPlan(DEFAULT_TRIP, { fetchImpl }));
    expect(plan.gaps.map((gap) => gap.message)).toEqual([
      "「ショッピング」に当たるものがありませんでした。",
      "1件目の未回答。",
      "2件目の未回答。",
    ]);
  });
  it("配列の途中で障害が確定しても、その先の無応答を待たずに返す", async () => {
    // 打ち切りが「1件目が失敗したとき」だけの特別扱いになっていないことを見る
    const { fetchImpl, calls } = stubFetch({
      [SEARCH]: () => json({ status: "answered", candidates: THREE_CANDIDATES }),
      [AGGREGATE]: (body) => {
        const datasetId = (body as { datasetId: string }).datasetId;
        if (datasetId === MEISHO_ID) {
          return json({ status: "answered", result: { name: "寛永寺", summary: "…" }, query: "q" });
        }
        if (datasetId === BUNKA_ID) return json({ error: "internal_error", message: "D1 が応答しません" }, 500);
        return new Promise<Response>(() => {}); // 3件目は応答しない
      },
      [PROVENANCE]: () => json({ status: "answered", sources: [source(MEISHO_ID, "名所・史跡")] }),
    });

    const outcome = await buildPlan(DEFAULT_TRIP, { fetchImpl });
    expect(outcome.kind === "failure" && outcome.failure.kind).toBe("http");
    expect(calls.map((c) => c.path)).not.toContain(PROVENANCE);
  });
});
