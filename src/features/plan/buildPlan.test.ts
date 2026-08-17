import { describe, expect, it, vi } from "vitest";
import {
  AGGREGATE_PATH as AGGREGATE,
  BUNKA_ID,
  jsonResponse as json,
  MEISHO_ID,
  PROVENANCE_PATH as PROVENANCE,
  provenanceSource as source,
  SEARCH_PATH as SEARCH,
  stubFetch,
} from "../../test/planFixtures";
import { buildPlan, buildQuery, type PlanOutcome } from "./buildPlan";
import { DEFAULT_TRIP } from "./constants";
import type { Trip } from "./types";

/**
 * ルート組み立ての検証（Issue #31）。fetch を注入し、3操作の応答を組み合わせて
 * 「出典なしの内容を返さない」「unanswered と障害を混ぜない」を確かめる。
 *
 * 応答は**実在のカタログ値**を写している。適当な ID で通るテストにすると、
 * 出典の突き合わせが壊れていても気づけない。
 */

/** 2件の候補 → 2件の抽出 → 2件の出典、という素直に成功する組み合わせ */
function happyPath() {
  return stubFetch({
    [SEARCH]: () =>
      json({
        status: "answered",
        candidates: [
          { datasetId: MEISHO_ID, title: "名所・史跡", provider: "台東区", url: "u", matchReason: "r" },
          { datasetId: BUNKA_ID, title: "文化観光施設", provider: "台東区", url: "u", matchReason: "r" },
        ],
      }),
    [AGGREGATE]: (body) =>
      json(
        (body as { datasetId: string }).datasetId === MEISHO_ID
          ? { status: "answered", result: { name: "寛永寺", summary: "所在地は台東区上野桜木1丁目14番。" }, query: "q" }
          : { status: "answered", result: { name: "国立西洋美術館", summary: "所在地は上野公園7番7号。" }, query: "q" },
      ),
    [PROVENANCE]: () =>
      json({ status: "answered", sources: [source(MEISHO_ID, "名所・史跡"), source(BUNKA_ID, "文化観光施設")] }),
  });
}

const expectPlan = (outcome: PlanOutcome): Extract<PlanOutcome, { kind: "plan" }> => {
  if (outcome.kind !== "plan") throw new Error(`plan を期待したが ${JSON.stringify(outcome)}`);
  return outcome;
};

describe("buildQuery", () => {
  it("興味は日本語ラベルに変換する（識別子のままではバックエンドに当たらない）", () => {
    expect(buildQuery({ ...DEFAULT_TRIP, interests: ["ramen", "culture"], notes: "" })).toBe("ラーメン、文化");
  });

  it("その他のご希望も質問文に混ぜる（エリア指定はここ経由でしか渡せない）", () => {
    const trip: Trip = { ...DEFAULT_TRIP, interests: ["culture"], notes: "浅草と上野を回りたい" };
    expect(buildQuery(trip)).toBe("文化、浅草と上野を回りたい");
  });

  it("興味も希望も無ければ空文字（400 を投げに行かない）", () => {
    expect(buildQuery({ ...DEFAULT_TRIP, interests: [], notes: "   " })).toBe("");
  });
});

describe("buildPlan", () => {
  it("3操作を search → aggregate → provenance の順に呼ぶ", async () => {
    const { fetchImpl, calls } = happyPath();
    await buildPlan(DEFAULT_TRIP, { fetchImpl });

    expect(calls.map((call) => call.path)).toEqual([SEARCH, AGGREGATE, AGGREGATE, PROVENANCE]);
  });

  it("name / summary を Stop.place / Stop.note に写し、出典を対で持つ", async () => {
    const { fetchImpl } = happyPath();
    const plan = expectPlan(await buildPlan(DEFAULT_TRIP, { fetchImpl }));

    expect(plan.stops.map((s) => s.stop.place)).toEqual(["寛永寺", "国立西洋美術館"]);
    expect(plan.stops[0].stop.note).toBe("所在地は台東区上野桜木1丁目14番。");
    expect(plan.stops[0].source.datasetId).toBe(MEISHO_ID);
    expect(plan.stops[1].source.datasetId).toBe(BUNKA_ID);
  });

  it("マナーは空にする（出典を持つデータが無いため）", async () => {
    const { fetchImpl } = happyPath();
    const plan = expectPlan(await buildPlan(DEFAULT_TRIP, { fetchImpl }));

    // 仮のマナー文を入れるのは出典なしの回答にあたる（Issue #43）
    expect(plan.stops.every((s) => s.stop.etiquette.length === 0)).toBe(true);
  });

  it("answered に載る部分欠損（#29 の gaps）を持ち上げる", async () => {
    const { fetchImpl } = stubFetch({
      [SEARCH]: () =>
        json({
          status: "answered",
          candidates: [{ datasetId: MEISHO_ID, title: "t", provider: "p", url: "u", matchReason: "r" }],
          gaps: [{ status: "unanswered", reason: "insufficient_granularity", message: "「ラーメン」の粒度では…" }],
        }),
      [AGGREGATE]: () => json({ status: "answered", result: { name: "寛永寺", summary: "…" }, query: "q" }),
      [PROVENANCE]: () => json({ status: "answered", sources: [source(MEISHO_ID, "名所・史跡")] }),
    });

    const plan = expectPlan(await buildPlan(DEFAULT_TRIP, { fetchImpl }));
    expect(plan.gaps).toHaveLength(1);
    expect(plan.gaps[0].reason).toBe("insufficient_granularity");
  });

  it("検索が unanswered なら、そのまま unanswered として返す（障害にしない）", async () => {
    const { fetchImpl } = stubFetch({
      [SEARCH]: () => json({ status: "unanswered", reason: "out_of_area", message: "「新宿」は対象エリアの外です。" }),
    });

    const outcome = await buildPlan(DEFAULT_TRIP, { fetchImpl });
    expect(outcome).toEqual({ kind: "unanswered", reason: "out_of_area", message: "「新宿」は対象エリアの外です。" });
  });

  it("抽出できなかった候補は落とすが、全滅したら空のルートを返さない", async () => {
    const { fetchImpl, calls } = stubFetch({
      [SEARCH]: () =>
        json({
          status: "answered",
          candidates: [{ datasetId: MEISHO_ID, title: "t", provider: "p", url: "u", matchReason: "r" }],
        }),
      [AGGREGATE]: () => json({ status: "unanswered", reason: "other", message: "固定データにその行がありません。" }),
    });

    const outcome = await buildPlan(DEFAULT_TRIP, { fetchImpl });
    expect(outcome.kind).toBe("unanswered");
    // 出典を取りに行く必要すら無い
    expect(calls.map((c) => c.path)).not.toContain(PROVENANCE);
  });

  it("出典が取れなければ、出典なしのまま停留地を返さない", async () => {
    // CLAUDE.md 絶対ルール #2。get_provenance は ID が1つでも不明なら全体を unanswered にする
    const { fetchImpl } = stubFetch({
      [SEARCH]: () =>
        json({
          status: "answered",
          candidates: [{ datasetId: MEISHO_ID, title: "t", provider: "p", url: "u", matchReason: "r" }],
        }),
      [AGGREGATE]: () => json({ status: "answered", result: { name: "寛永寺", summary: "…" }, query: "q" }),
      [PROVENANCE]: () => json({ status: "unanswered", reason: "other", message: "出典を生成できません。" }),
    });

    const outcome = await buildPlan(DEFAULT_TRIP, { fetchImpl });
    expect(outcome.kind).toBe("unanswered");
    expect(outcome.kind === "unanswered" && outcome.message).toContain("出典");
  });

  it("出典が一部の datasetId しか返らなければ、対応しない停留地を落とす", async () => {
    const { fetchImpl } = stubFetch({
      [SEARCH]: () =>
        json({
          status: "answered",
          candidates: [
            { datasetId: MEISHO_ID, title: "t", provider: "p", url: "u", matchReason: "r" },
            { datasetId: BUNKA_ID, title: "t", provider: "p", url: "u", matchReason: "r" },
          ],
        }),
      [AGGREGATE]: () => json({ status: "answered", result: { name: "寛永寺", summary: "…" }, query: "q" }),
      // 出典は1件だけ返る
      [PROVENANCE]: () => json({ status: "answered", sources: [source(MEISHO_ID, "名所・史跡")] }),
    });

    const plan = expectPlan(await buildPlan(DEFAULT_TRIP, { fetchImpl }));
    expect(plan.stops).toHaveLength(1);
    expect(plan.stops[0].source.datasetId).toBe(MEISHO_ID);
  });

  it("HTTP エラーは unanswered と区別された障害にする", async () => {
    const { fetchImpl } = stubFetch({
      [SEARCH]: () => json({ error: "invalid_request", message: '"query" は空でない文字列で指定してください' }, 400),
    });

    const outcome = await buildPlan(DEFAULT_TRIP, { fetchImpl });
    expect(outcome.kind).toBe("failure");
    if (outcome.kind !== "failure") return;
    expect(outcome.failure.kind).toBe("http");
    expect(outcome.failure.status).toBe(400);
    expect(outcome.failure.detail).toContain("query");
  });

  it("ネットワーク断は network の障害にする", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError("Failed to fetch")) as unknown as typeof fetch;

    const outcome = await buildPlan(DEFAULT_TRIP, { fetchImpl });
    expect(outcome.kind === "failure" && outcome.failure.kind).toBe("network");
  });

  it("仕様外の応答は parse の障害にする（unanswered に倒さない）", async () => {
    // 「サーバーが壊れた応答を返している」が「データがありません」として出ると、
    // 原因と逆方向へデバッグを誘導する
    const { fetchImpl } = stubFetch({
      [SEARCH]: () => json({ status: "answered", candidates: [{ title: "datasetId が無い" }] }),
    });

    const outcome = await buildPlan(DEFAULT_TRIP, { fetchImpl });
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

    // カタログ外のデータを組み込まない（CLAUDE.md 絶対ルール #4）
    const outcome = await buildPlan(DEFAULT_TRIP, { fetchImpl });
    expect(outcome.kind === "failure" && outcome.failure.kind).toBe("parse");
  });

  it("興味も希望も無ければ、サーバーを叩かず入力の問題として返す", async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;

    const outcome = await buildPlan({ ...DEFAULT_TRIP, interests: [], notes: "" }, { fetchImpl });
    expect(outcome.kind === "failure" && outcome.failure.kind).toBe("input");
    // 自分たちの入力不足を未回答の集計（gaps）に積まない
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
