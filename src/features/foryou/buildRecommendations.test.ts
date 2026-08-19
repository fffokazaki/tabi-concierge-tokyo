import { describe, expect, it, vi } from "vitest";
import {
  BUNKA_ID,
  BUNKAZAI_ID,
  jsonResponse as json,
  MEISHO_ID,
  provenanceSource as source,
  stubFetch,
} from "../../test/planFixtures";
import {
  AGGREGATE_PATH as AGGREGATE,
  PROVENANCE_PATH as PROVENANCE,
  SEARCH_PATH as SEARCH,
  stubSuccessfulRecommendations as happyPath,
} from "../../test/forYouFixtures";
import { buildRecommendations, type RecommendationOutcome } from "./buildRecommendations";
import { RECOMMENDATION_LIMIT } from "./constants";

/**
 * あなたへのレコメンド組み立ての検証。`buildPlan.test.ts` と同じ観点
 * （出典なしを返さない・unanswered と障害を混ぜない）に加え、単一チップと
 * 「すべて」で挙動がどう変わるかを確かめる。
 */

const expectRecs = (outcome: RecommendationOutcome): Extract<RecommendationOutcome, { kind: "recommendations" }> => {
  if (outcome.kind !== "recommendations") throw new Error(`recommendations を期待したが ${JSON.stringify(outcome)}`);
  return outcome;
};

describe("単一チップ", () => {
  it("search_datasets に interests を構造化入力で渡す（query は送らない）", async () => {
    const { fetchImpl, calls } = happyPath();
    await buildRecommendations("culture", { fetchImpl });

    const searchCall = calls.find((call) => call.path === SEARCH);
    expect(searchCall?.body).toEqual({ interests: ["文化"], limit: RECOMMENDATION_LIMIT });
  });

  it("3操作を search → aggregate（候補ごと） → provenance の順に呼ぶ", async () => {
    const { fetchImpl, calls } = happyPath();
    await buildRecommendations("culture", { fetchImpl });

    expect(calls.map((call) => call.path)).toEqual([SEARCH, AGGREGATE, AGGREGATE, PROVENANCE]);
  });

  it("name / summary を Recommendation に写し、出典を対で持つ", async () => {
    const { fetchImpl } = happyPath();
    const outcome = expectRecs(await buildRecommendations("culture", { fetchImpl }));

    expect(outcome.recommendations.map((r) => r.name)).toEqual(["寛永寺", "国立西洋美術館"]);
    expect(outcome.recommendations[0].blurb).toBe("所在地は台東区上野桜木1丁目14番。");
    expect(outcome.recommendations[0].source.datasetId).toBe(MEISHO_ID);
  });

  it("単一チップでは理由タグが確定する", async () => {
    const { fetchImpl } = happyPath();
    const outcome = expectRecs(await buildRecommendations("family", { fetchImpl }));

    expect(outcome.recommendations.every((r) => r.reason === "ご家族でのご旅行なので")).toBe(true);
  });

  it("候補が1件しかない興味（例: 家族向け）も、特別扱いせず通常のレコメンドとして返す", async () => {
    const { fetchImpl } = stubFetch({
      [SEARCH]: () =>
        json({
          status: "answered",
          candidates: [{ datasetId: MEISHO_ID, title: "トイレ情報", provider: "台東区", url: "u", matchReason: "r" }],
        }),
      [AGGREGATE]: () =>
        json({ status: "answered", result: { name: "上野公園大黒天横", summary: "多目的トイレあり。" }, query: "q" }),
      [PROVENANCE]: () => json({ status: "answered", sources: [source(MEISHO_ID, "トイレ情報")] }),
    });

    const outcome = expectRecs(await buildRecommendations("family", { fetchImpl }));
    expect(outcome.recommendations).toHaveLength(1);
    expect(outcome.recommendations[0].name).toBe("上野公園大黒天横");
  });

  it("候補がまったく無い興味（例: ラーメン）は unanswered をそのまま返す（障害にしない）", async () => {
    const { fetchImpl } = stubFetch({
      [SEARCH]: () =>
        json({
          status: "unanswered",
          reason: "insufficient_granularity",
          message: "飲食店データはジャンルの列を持たないため「ラーメン」の粒度では答えられません。",
        }),
    });

    const outcome = await buildRecommendations("ramen", { fetchImpl });
    expect(outcome).toEqual({
      kind: "unanswered",
      reason: "insufficient_granularity",
      message: "飲食店データはジャンルの列を持たないため「ラーメン」の粒度では答えられません。",
    });
  });
});

describe("「すべて」", () => {
  it("FORYOU_INTEREST_TAGS の全ラベルを interests にまとめて送る", async () => {
    const { fetchImpl, calls } = happyPath();
    await buildRecommendations("all", { fetchImpl });

    const searchCall = calls.find((call) => call.path === SEARCH);
    expect((searchCall?.body as { interests: string[] }).interests).toEqual([
      "ラーメン",
      "文化",
      "家族向け",
      "自然",
    ]);
  });

  it("理由タグは確定させない（複数興味をまとめて問い合わせているため）", async () => {
    const { fetchImpl } = happyPath();
    const outcome = expectRecs(await buildRecommendations("all", { fetchImpl }));

    expect(outcome.recommendations.every((r) => r.reason === null)).toBe(true);
  });

  it("答えられた候補と一緒に、答えられなかった興味の gaps を持ち上げる", async () => {
    const { fetchImpl } = stubFetch({
      [SEARCH]: () =>
        json({
          status: "answered",
          candidates: [{ datasetId: MEISHO_ID, title: "t", provider: "p", url: "u", matchReason: "r" }],
          gaps: [
            { status: "unanswered", reason: "insufficient_granularity", message: "「ラーメン」の粒度では…" },
            { status: "unanswered", reason: "other", message: "「ショッピング」に当たるものがありませんでした。" },
          ],
        }),
      [AGGREGATE]: () => json({ status: "answered", result: { name: "寛永寺", summary: "…" }, query: "q" }),
      [PROVENANCE]: () => json({ status: "answered", sources: [source(MEISHO_ID, "名所・史跡")] }),
    });

    const outcome = expectRecs(await buildRecommendations("all", { fetchImpl }));
    expect(outcome.gaps).toHaveLength(2);
    expect(outcome.recommendations).toHaveLength(1);
  });
});

describe("抽出・出典の欠落", () => {
  it("集計で unanswered になった候補は黙って消さず、理由つきで gaps へ合流させる（Issue #89）", async () => {
    const { fetchImpl } = stubFetch({
      [SEARCH]: () =>
        json({
          status: "answered",
          candidates: [
            { datasetId: MEISHO_ID, title: "名所・史跡", provider: "台東区", url: "u", matchReason: "r" },
            { datasetId: BUNKA_ID, title: "文化観光施設", provider: "台東区", url: "u", matchReason: "r" },
          ],
        }),
      [AGGREGATE]: (body) =>
        (body as { datasetId: string }).datasetId === MEISHO_ID
          ? json({ status: "answered", result: { name: "寛永寺", summary: "…" }, query: "q" })
          : json({
              status: "unanswered",
              reason: "insufficient_granularity",
              message: "サンプル行が無いため内容を取り出せません。",
            }),
      [PROVENANCE]: () => json({ status: "answered", sources: [source(MEISHO_ID, "名所・史跡")] }),
    });

    const outcome = expectRecs(await buildRecommendations("culture", { fetchImpl }));
    expect(outcome.recommendations.map((r) => r.name)).toEqual(["寛永寺"]);
    expect(outcome.gaps).toEqual([
      {
        status: "unanswered",
        reason: "insufficient_granularity",
        message: "サンプル行が無いため内容を取り出せません。",
      },
    ]);
  });

  it("search_datasets の gaps と集計の unanswered を両方持ち上げる（前者が先）", async () => {
    const { fetchImpl } = stubFetch({
      [SEARCH]: () =>
        json({
          status: "answered",
          candidates: [
            { datasetId: MEISHO_ID, title: "名所・史跡", provider: "台東区", url: "u", matchReason: "r" },
            { datasetId: BUNKA_ID, title: "文化観光施設", provider: "台東区", url: "u", matchReason: "r" },
          ],
          gaps: [{ status: "unanswered", reason: "insufficient_granularity", message: "「ラーメン」の粒度では…" }],
        }),
      [AGGREGATE]: (body) =>
        (body as { datasetId: string }).datasetId === MEISHO_ID
          ? json({ status: "answered", result: { name: "寛永寺", summary: "…" }, query: "q" })
          : json({ status: "unanswered", reason: "other", message: "固定データにその行がありません。" }),
      [PROVENANCE]: () => json({ status: "answered", sources: [source(MEISHO_ID, "名所・史跡")] }),
    });

    const outcome = expectRecs(await buildRecommendations("all", { fetchImpl }));
    expect(outcome.gaps.map((gap) => gap.message)).toEqual([
      "「ラーメン」の粒度では…",
      "固定データにその行がありません。",
    ]);
  });

  it("同じ理由・同じ文面の gap は1件にまとめる（DataGapCard がこの組で行を区別するため）", async () => {
    const failure = { status: "unanswered", reason: "other", message: "固定データにその行がありません。" };
    const { fetchImpl } = stubFetch({
      [SEARCH]: () =>
        json({
          status: "answered",
          candidates: [
            { datasetId: MEISHO_ID, title: "名所・史跡", provider: "台東区", url: "u", matchReason: "r" },
            { datasetId: BUNKA_ID, title: "文化観光施設", provider: "台東区", url: "u", matchReason: "r" },
            { datasetId: BUNKAZAI_ID, title: "文化財", provider: "台東区", url: "u", matchReason: "r" },
          ],
        }),
      [AGGREGATE]: (body) =>
        (body as { datasetId: string }).datasetId === MEISHO_ID
          ? json({ status: "answered", result: { name: "寛永寺", summary: "…" }, query: "q" })
          : json(failure),
      [PROVENANCE]: () => json({ status: "answered", sources: [source(MEISHO_ID, "名所・史跡")] }),
    });

    const outcome = expectRecs(await buildRecommendations("culture", { fetchImpl }));
    expect(outcome.gaps).toHaveLength(1);
  });

  it("抽出できなかった候補は落とすが、全滅したら空のレコメンドを返さない", async () => {
    const { fetchImpl, calls } = stubFetch({
      [SEARCH]: () =>
        json({
          status: "answered",
          candidates: [{ datasetId: MEISHO_ID, title: "t", provider: "p", url: "u", matchReason: "r" }],
        }),
      [AGGREGATE]: () => json({ status: "unanswered", reason: "other", message: "固定データにその行がありません。" }),
    });

    const outcome = await buildRecommendations("culture", { fetchImpl });
    expect(outcome.kind).toBe("unanswered");
    expect(calls.map((c) => c.path)).not.toContain(PROVENANCE);
  });

  it("検索側と集計側から同じ分類・同じ文面が来ても1件にまとめる", async () => {
    const shared = { status: "unanswered", reason: "other", message: "固定データにその行がありません。" };
    const { fetchImpl } = stubFetch({
      [SEARCH]: () =>
        json({
          status: "answered",
          candidates: [
            { datasetId: MEISHO_ID, title: "名所・史跡", provider: "台東区", url: "u", matchReason: "r" },
            { datasetId: BUNKA_ID, title: "文化観光施設", provider: "台東区", url: "u", matchReason: "r" },
          ],
          gaps: [shared],
        }),
      [AGGREGATE]: (body) =>
        (body as { datasetId: string }).datasetId === MEISHO_ID
          ? json({ status: "answered", result: { name: "寛永寺", summary: "…" }, query: "q" })
          : json(shared),
      [PROVENANCE]: () => json({ status: "answered", sources: [source(MEISHO_ID, "名所・史跡")] }),
    });

    const outcome = expectRecs(await buildRecommendations("all", { fetchImpl }));
    expect(outcome.gaps).toHaveLength(1);
  });

  it("集計の途中で障害が起きたら、それまでに集めた gap ごと打ち切って failure にする", async () => {
    const { fetchImpl, calls } = stubFetch({
      [SEARCH]: () =>
        json({
          status: "answered",
          candidates: [
            { datasetId: MEISHO_ID, title: "名所・史跡", provider: "台東区", url: "u", matchReason: "r" },
            { datasetId: BUNKA_ID, title: "文化観光施設", provider: "台東区", url: "u", matchReason: "r" },
          ],
        }),
      [AGGREGATE]: (body) =>
        (body as { datasetId: string }).datasetId === MEISHO_ID
          ? json({ status: "unanswered", reason: "other", message: "固定データにその行がありません。" })
          : json({ error: "internal_error", message: "集計に失敗しました" }, 500),
    });

    const outcome = await buildRecommendations("culture", { fetchImpl });
    expect(outcome.kind === "failure" && outcome.failure.kind).toBe("http");
    expect(calls.map((c) => c.path)).not.toContain(PROVENANCE);
  });

  it("全滅の理由が1つに定まるなら、汎用の other ではなくその分類・文面で返す", async () => {
    const { fetchImpl } = stubFetch({
      [SEARCH]: () =>
        json({
          status: "answered",
          candidates: [{ datasetId: MEISHO_ID, title: "t", provider: "p", url: "u", matchReason: "r" }],
        }),
      [AGGREGATE]: () =>
        json({
          status: "unanswered",
          reason: "insufficient_granularity",
          message: "この一覧はサンプル行を持たないため、おすすめに出せる粒度で取り出せません。",
        }),
    });

    const outcome = await buildRecommendations("culture", { fetchImpl });
    expect(outcome).toEqual({
      kind: "unanswered",
      reason: "insufficient_granularity",
      message: "この一覧はサンプル行を持たないため、おすすめに出せる粒度で取り出せません。",
    });
  });

  it("全滅の理由が複数あるなら汎用の other に倒す（どれか1つを全体の理由として名乗らない）", async () => {
    const { fetchImpl } = stubFetch({
      [SEARCH]: () =>
        json({
          status: "answered",
          candidates: [
            { datasetId: MEISHO_ID, title: "名所・史跡", provider: "台東区", url: "u", matchReason: "r" },
            { datasetId: BUNKA_ID, title: "文化観光施設", provider: "台東区", url: "u", matchReason: "r" },
          ],
        }),
      [AGGREGATE]: (body) =>
        (body as { datasetId: string }).datasetId === MEISHO_ID
          ? json({ status: "unanswered", reason: "insufficient_granularity", message: "粒度が足りません。" })
          : json({ status: "unanswered", reason: "data_not_published", message: "このエリアを収録していません。" }),
    });

    const outcome = await buildRecommendations("culture", { fetchImpl });
    expect(outcome.kind === "unanswered" && outcome.reason).toBe("other");
  });

  it("全滅時に検索側の gap も勘定に入れる（集計側の理由だけを全体の理由として名乗らない）", async () => {
    const { fetchImpl } = stubFetch({
      [SEARCH]: () =>
        json({
          status: "answered",
          candidates: [{ datasetId: MEISHO_ID, title: "t", provider: "p", url: "u", matchReason: "r" }],
          gaps: [{ status: "unanswered", reason: "insufficient_granularity", message: "「ラーメン」の粒度では…" }],
        }),
      [AGGREGATE]: () =>
        json({ status: "unanswered", reason: "data_not_published", message: "このエリアを収録していません。" }),
    });

    const outcome = await buildRecommendations("all", { fetchImpl });
    expect(outcome.kind === "unanswered" && outcome.reason).toBe("other");
  });

  it("出典が取れなければ、出典なしのままレコメンドを返さない", async () => {
    const { fetchImpl } = stubFetch({
      [SEARCH]: () =>
        json({
          status: "answered",
          candidates: [{ datasetId: MEISHO_ID, title: "t", provider: "p", url: "u", matchReason: "r" }],
        }),
      [AGGREGATE]: () => json({ status: "answered", result: { name: "寛永寺", summary: "…" }, query: "q" }),
      [PROVENANCE]: () => json({ status: "unanswered", reason: "other", message: "出典を生成できません。" }),
    });

    const outcome = await buildRecommendations("culture", { fetchImpl });
    expect(outcome.kind).toBe("unanswered");
  });
});

describe("障害", () => {
  it("ネットワーク断は network の障害にする", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError("Failed to fetch")) as unknown as typeof fetch;

    const outcome = await buildRecommendations("culture", { fetchImpl });
    expect(outcome.kind === "failure" && outcome.failure.kind).toBe("network");
  });

  it("HTTP エラーは unanswered と区別された障害にする", async () => {
    const { fetchImpl } = stubFetch({
      [SEARCH]: () => json({ error: "invalid_request", message: '"interests" の要素が不正です' }, 400),
    });

    const outcome = await buildRecommendations("culture", { fetchImpl });
    expect(outcome.kind).toBe("failure");
    if (outcome.kind !== "failure") return;
    expect(outcome.failure.kind).toBe("http");
    expect(outcome.failure.status).toBe(400);
  });

  it("仕様外の応答は parse の障害にする（unanswered に倒さない）", async () => {
    const { fetchImpl } = stubFetch({
      [SEARCH]: () => json({ status: "answered", candidates: [{ title: "datasetId が無い" }] }),
    });

    const outcome = await buildRecommendations("culture", { fetchImpl });
    expect(outcome.kind === "failure" && outcome.failure.kind).toBe("parse");
  });

  it("license が CC BY 4.0 でない出典は通さない", async () => {
    const { fetchImpl } = stubFetch({
      [SEARCH]: () =>
        json({
          status: "answered",
          candidates: [{ datasetId: MEISHO_ID, title: "t", provider: "p", url: "u", matchReason: "r" }],
        }),
      [AGGREGATE]: () => json({ status: "answered", result: { name: "寛永寺", summary: "…" }, query: "q" }),
      [PROVENANCE]: () =>
        json({ status: "answered", sources: [{ ...source(MEISHO_ID, "名所・史跡"), license: "その他" }] }),
    });

    const outcome = await buildRecommendations("culture", { fetchImpl });
    expect(outcome.kind === "failure" && outcome.failure.kind).toBe("parse");
  });
});
