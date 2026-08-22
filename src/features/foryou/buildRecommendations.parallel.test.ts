import { describe, expect, it, vi } from "vitest";
import {
  BUNKA_ID,
  BUNKAZAI_ID,
  jsonResponse as json,
  MEISHO_ID,
  provenanceSource as source,
  stubFetch,
} from "../../test/planFixtures";
import { AGGREGATE_PATH as AGGREGATE, PROVENANCE_PATH as PROVENANCE, SEARCH_PATH as SEARCH } from "../../test/forYouFixtures";
import { buildRecommendations, type RecommendationOutcome } from "./buildRecommendations";

const expectRecs = (outcome: RecommendationOutcome): Extract<RecommendationOutcome, { kind: "recommendations" }> => {
  if (outcome.kind !== "recommendations") throw new Error(`recommendations を期待したが ${JSON.stringify(outcome)}`);
  return outcome;
};

/**
 * 候補ごとの `aggregate_dataset` を**同時に**投げることの検証（Issue #142）。
 * プラン画面と同型なので、実装と同じくテストも対で写す（ACE-98-1。対は `buildPlan.parallel.test.ts`）。
 * 「すべて」は候補が6件まで出るぶん、直列だと待ち時間の積み上がりはプランより大きい。
 */
describe("buildRecommendations の集計を同時に投げる（Issue #142）", () => {
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
        await held; // 応答を止めたまま、後続の候補が投げられるかを見る
        return json({ status: "answered", result: { name: NAME_BY_ID[datasetId], summary: "…", category: "名所・史跡" }, query: "q" });
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

    const pending = buildRecommendations("culture", { fetchImpl });
    try {
      await vi.waitFor(() => expect(started).toEqual([MEISHO_ID, BUNKA_ID, BUNKAZAI_ID]));
    } finally {
      release();
    }
    // 保留を解いたあと最後まで組み上がることまで見る（`await pending` だけだと failure でも通る）
    const outcome = expectRecs(await pending);
    expect(outcome.recommendations.map((rec) => rec.name)).toEqual([
      "寛永寺",
      "国立西洋美術館",
      "絹本著色元三大師画像",
    ]);
  });

  it("障害が複数あっても、候補順で最初のものを返す（到着順ではない）", async () => {
    // 到着順に採ると、同じ入力でも実行のたびに違う障害（HTTP か通信断か）が画面に出る
    const { fetchImpl, calls } = stubFetch({
      [SEARCH]: () => json({ status: "answered", candidates: THREE_CANDIDATES }),
      [AGGREGATE]: async (body) => {
        const datasetId = (body as { datasetId: string }).datasetId;
        if (datasetId === MEISHO_ID) {
          await new Promise((resolve) => setTimeout(resolve, 20));
          return json({ error: "internal_error", message: "D1 が応答しません" }, 500);
        }
        if (datasetId === BUNKA_ID) throw new TypeError("Failed to fetch"); // 即時の通信断
        return json({ status: "answered", result: { name: "絹本著色元三大師画像", summary: "…", category: "名所・史跡" }, query: "q" });
      },
      [PROVENANCE]: () => json({ status: "answered", sources: [source(BUNKAZAI_ID, "文化財一覧")] }),
    });

    const outcome = await buildRecommendations("culture", { fetchImpl });
    expect(outcome.kind === "failure" && outcome.failure.kind).toBe("http");
    expect(outcome.kind === "failure" && outcome.failure.status).toBe(500);
    expect(calls.map((c) => c.path)).not.toContain(PROVENANCE);
  });

  it("応答が候補順と違う順に返っても、レコメンドと gaps の並びは候補順のまま", async () => {
    // 到着順に積むと、同じ興味チップを押しても実行のたびにカードの並びが変わる。
    // 1件目だけ実際に遅らせる（マイクロタスクの解決順に頼ると、到着順に積む実装でも通る）
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
          return json({ status: "answered", result: { name: "絹本著色元三大師画像", summary: "台東区指定文化財。", category: "名所・史跡" }, query: "q" });
        }
        await new Promise((resolve) => setTimeout(resolve, 20)); // 1件目が最後に返る
        return json({ status: "answered", result: { name: "寛永寺", summary: "上野桜木1丁目14番。", category: "名所・史跡" }, query: "q" });
      },
      [PROVENANCE]: () =>
        json({
          status: "answered",
          sources: [source(MEISHO_ID, "名所・史跡"), source(BUNKAZAI_ID, "文化財一覧")],
        }),
    });

    const outcome = expectRecs(await buildRecommendations("culture", { fetchImpl }));
    expect(outcome.recommendations.map((rec) => rec.name)).toEqual(["寛永寺", "絹本著色元三大師画像"]);
    expect(outcome.gaps.map((gap) => gap.message)).toEqual(["サンプル行が無いため内容を取り出せません。"]);
  });
  it("候補順で最初の障害が確定したら、応答しない候補を待たずに返す", async () => {
    // 全件の完了を待つ実装（`Promise.all`）だと、ここで永遠に返らずテストがタイムアウトする
    const { fetchImpl, calls } = stubFetch({
      [SEARCH]: () => json({ status: "answered", candidates: THREE_CANDIDATES }),
      [AGGREGATE]: (body) => {
        const datasetId = (body as { datasetId: string }).datasetId;
        if (datasetId === MEISHO_ID) return json({ error: "internal_error", message: "D1 が応答しません" }, 500);
        return new Promise<Response>(() => {}); // 応答しない候補
      },
      [PROVENANCE]: () => json({ status: "answered", sources: [source(MEISHO_ID, "名所・史跡")] }),
    });

    const outcome = await buildRecommendations("culture", { fetchImpl });
    expect(outcome.kind === "failure" && outcome.failure.kind).toBe("http");
    expect(calls.map((c) => c.path)).not.toContain(PROVENANCE);
  });

  it("未回答が複数あっても、gaps は［検索側 → 候補順］のまま", async () => {
    // 1件目の未回答だけ遅らせる。到着順に積むと2件目が先に並ぶ
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
        return json({ status: "answered", result: { name: "絹本著色元三大師画像", summary: "…", category: "名所・史跡" }, query: "q" });
      },
      [PROVENANCE]: () => json({ status: "answered", sources: [source(BUNKAZAI_ID, "文化財一覧")] }),
    });

    const outcome = expectRecs(await buildRecommendations("culture", { fetchImpl }));
    expect(outcome.gaps.map((gap) => gap.message)).toEqual([
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
          return json({ status: "answered", result: { name: "寛永寺", summary: "…", category: "名所・史跡" }, query: "q" });
        }
        if (datasetId === BUNKA_ID) return json({ error: "internal_error", message: "D1 が応答しません" }, 500);
        return new Promise<Response>(() => {}); // 3件目は応答しない
      },
      [PROVENANCE]: () => json({ status: "answered", sources: [source(MEISHO_ID, "名所・史跡")] }),
    });

    const outcome = await buildRecommendations("culture", { fetchImpl });
    expect(outcome.kind === "failure" && outcome.failure.kind).toBe("http");
    expect(calls.map((c) => c.path)).not.toContain(PROVENANCE);
  });
});
