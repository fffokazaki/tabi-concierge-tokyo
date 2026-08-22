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
import { buildPlan, buildQuery, ROUTE_STOP_LIMIT, type PlanOutcome } from "./buildPlan";
import { DEFAULT_TRIP, MAX_STOP_COUNT } from "./constants";
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

    // 集計は同時に投げるが、記録の並びは候補順のまま（`callAndRead` は最初の `await` まで
    // 同期に進むので、fetch 自体は候補順に呼ばれる）。この行が見ているのは**呼ぶ順**であって
    // 待ち方ではない ―― fetch の手前に `await` が入ると、並列化と無関係にここが落ちる
    expect(calls.map((call) => call.path)).toEqual([SEARCH, AGGREGATE, AGGREGATE, PROVENANCE]);
  });

  it("search_datasets へ渡す limit は STOP_COUNT_BY_PACE の最大値と揃っている（別々にハードコードして乖離させない）", async () => {
    const { fetchImpl, calls } = happyPath();
    await buildPlan(DEFAULT_TRIP, { fetchImpl });

    const searchCall = calls.find((call) => call.path === SEARCH);
    expect((searchCall?.body as { limit: number }).limit).toBe(MAX_STOP_COUNT);
    expect(ROUTE_STOP_LIMIT).toBe(MAX_STOP_COUNT);
  });

  it("search_datasets へは興味を畳み込まず interests 配列で送る（畳み込むと答えていない興味が沈黙する・Issue #53）", async () => {
    const { fetchImpl, calls } = happyPath();
    await buildPlan({ ...DEFAULT_TRIP, interests: ["nightlife"], notes: "上野で夜遊びしたい" }, { fetchImpl });

    // Issue #53 の実測ケース。畳み込んだ「ナイトライフ、上野で夜遊びしたい」は銭湯の
    // キーワード「夜」が「夜遊び」に部分一致して answered になり、ナイトライフの欠損が沈黙する
    const searchCall = calls.find((call) => call.path === SEARCH);
    expect(searchCall?.body).toMatchObject({ interests: ["ナイトライフ"], query: "上野で夜遊びしたい" });
  });

  it("その他のご希望が空なら query キーごと省く（interests 併送時の空文字は境界で省略と同義に受理されるため、省くことだけが「空でも送ってよい」の誤読を防ぐ）", async () => {
    const { fetchImpl, calls } = happyPath();
    await buildPlan(DEFAULT_TRIP, { fetchImpl });

    const body = calls.find((call) => call.path === SEARCH)?.body as Record<string, unknown>;
    expect(body.interests).toEqual(["ラーメン", "文化"]);
    expect(body).not.toHaveProperty("query");
  });

  it("空白だけのご希望も query キーごと省く（trim の退行で「空はキーごと省く」の契約形が崩れたことに気づけるように）", async () => {
    const { fetchImpl, calls } = happyPath();
    await buildPlan({ ...DEFAULT_TRIP, interests: ["culture"], notes: "   " }, { fetchImpl });

    const body = calls.find((call) => call.path === SEARCH)?.body as Record<string, unknown>;
    expect(body).not.toHaveProperty("query");
  });

  it("ご希望の前後の空白は落として送る（trim 済みの値が query に載る）", async () => {
    const { fetchImpl, calls } = happyPath();
    await buildPlan({ ...DEFAULT_TRIP, interests: [], notes: " 浅草を回りたい " }, { fetchImpl });

    const body = calls.find((call) => call.path === SEARCH)?.body as Record<string, unknown>;
    expect(body.query).toBe("浅草を回りたい");
  });

  it("興味が無ければ interests キーごと省く（従来どおり query だけの呼び出し）", async () => {
    const { fetchImpl, calls } = happyPath();
    await buildPlan({ ...DEFAULT_TRIP, interests: [], notes: "浅草を回りたい" }, { fetchImpl });

    const body = calls.find((call) => call.path === SEARCH)?.body as Record<string, unknown>;
    expect(body.query).toBe("浅草を回りたい");
    expect(body).not.toHaveProperty("interests");
  });

  it("aggregate の intent と provenance の query には従来どおり畳み込んだ全文を渡す（意図・根拠の再現用）", async () => {
    const { fetchImpl, calls } = happyPath();
    await buildPlan({ ...DEFAULT_TRIP, interests: ["nightlife"], notes: "上野で夜遊びしたい" }, { fetchImpl });

    const aggregateCall = calls.find((call) => call.path === AGGREGATE);
    const provenanceCall = calls.find((call) => call.path === PROVENANCE);
    expect((aggregateCall?.body as { intent: string }).intent).toBe("ナイトライフ、上野で夜遊びしたい");
    expect((provenanceCall?.body as { query: string }).query).toBe("ナイトライフ、上野で夜遊びしたい");
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
    // 検索そのものが unanswered の経路。サーバーが添える構造化欠損（Issue #70）は `areas` を
    // 送らないと付かず、プラン画面は `interests` は送るが `areas` は送らないので常に空
    //（Issue #94。興味の取り落ちは unanswered 側には載らない — API.md §3.1）
    expect(outcome).toEqual({
      kind: "unanswered",
      reason: "out_of_area",
      message: "「新宿」は対象エリアの外です。",
      gaps: [],
    });
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
    if (outcome.kind === "unanswered") {
      // 個々の候補の理由を全体の分類へ引き上げない（Issue #94 の決定。内訳は gaps で運ぶ）
      expect(outcome.reason).toBe("other");
      expect(outcome.message).toContain("旅程に出せる地物を取り出せませんでした");
      // 引き上げないぶん、内訳は gaps に残る（黙って捨てない）
      expect(outcome.gaps).toEqual([
        { status: "unanswered", reason: "other", message: "固定データにその行がありません。" },
      ]);
    }
    // 出典を取りに行く必要すら無い
    expect(calls.map((c) => c.path)).not.toContain(PROVENANCE);
  });

  it("集計で unanswered になった候補は黙って消さず、理由つきで gaps へ合流させる（Issue #95）", async () => {
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

    const plan = expectPlan(await buildPlan(DEFAULT_TRIP, { fetchImpl }));
    expect(plan.stops.map((s) => s.stop.place)).toEqual(["寛永寺"]);
    expect(plan.gaps).toEqual([
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

    const plan = expectPlan(await buildPlan(DEFAULT_TRIP, { fetchImpl }));
    expect(plan.gaps.map((gap) => gap.message)).toEqual([
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

    const plan = expectPlan(await buildPlan(DEFAULT_TRIP, { fetchImpl }));
    // 件数だけでなく中身も固定する。「畳み込みすぎて別物が消えた」場合も件数は1になる
    expect(plan.gaps).toEqual([{ status: "unanswered", reason: "other", message: "固定データにその行がありません。" }]);
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

    const plan = expectPlan(await buildPlan(DEFAULT_TRIP, { fetchImpl }));
    expect(plan.gaps).toEqual([shared]);
  });

  it("reason と message の片方だけが同じ gap は畳み込まない（別々の欠損として残す）", async () => {
    // dedupe のキーは reason と message の組。片方だけの一致で畳み込むと、
    // 同じ分類の別データセットの欠損（実装コメントの言う主ケース）が黙って1件に潰れる
    const { fetchImpl } = stubFetch({
      [SEARCH]: () =>
        json({
          status: "answered",
          candidates: [
            { datasetId: MEISHO_ID, title: "名所・史跡", provider: "台東区", url: "u", matchReason: "r" },
            { datasetId: BUNKA_ID, title: "文化観光施設", provider: "台東区", url: "u", matchReason: "r" },
            { datasetId: BUNKAZAI_ID, title: "文化財", provider: "台東区", url: "u", matchReason: "r" },
          ],
          gaps: [{ status: "unanswered", reason: "other", message: "「ショッピング」に当たるものがありませんでした。" }],
        }),
      [AGGREGATE]: (body) => {
        const id = (body as { datasetId: string }).datasetId;
        if (id === MEISHO_ID) return json({ status: "answered", result: { name: "寛永寺", summary: "…" }, query: "q" });
        // 検索側の gap と reason だけ同じ（message は別）
        if (id === BUNKA_ID) return json({ status: "unanswered", reason: "other", message: "固定データにその行がありません。" });
        // 検索側の gap と message だけ同じ（reason は別）
        return json({
          status: "unanswered",
          reason: "insufficient_granularity",
          message: "「ショッピング」に当たるものがありませんでした。",
        });
      },
      [PROVENANCE]: () => json({ status: "answered", sources: [source(MEISHO_ID, "名所・史跡")] }),
    });

    const plan = expectPlan(await buildPlan(DEFAULT_TRIP, { fetchImpl }));
    expect(plan.gaps).toEqual([
      { status: "unanswered", reason: "other", message: "「ショッピング」に当たるものがありませんでした。" },
      { status: "unanswered", reason: "other", message: "固定データにその行がありません。" },
      { status: "unanswered", reason: "insufficient_granularity", message: "「ショッピング」に当たるものがありませんでした。" },
    ]);
  });

  it("同じ gap が別の gap を挟んで再登場しても1件にまとめる（dedupe は配列全体に効く）", async () => {
    // 隣接要素だけを比較する実装へ退行しても、既存の dedupe テスト（隣接する重複のみ）は
    // すべて通ってしまう盲点（PR #104 レビュー。buildRecommendations.test.ts の同名テストと対）。
    // A, B, A の並びを先頭出現順の A, B へ畳むことを固定する
    const gapA = { status: "unanswered", reason: "other", message: "「ショッピング」に当たるものがありませんでした。" };
    const gapB = {
      status: "unanswered",
      reason: "insufficient_granularity",
      message: "飲食店データはジャンルの列を持たないため「ラーメン」の粒度では答えられません。",
    };
    const { fetchImpl } = stubFetch({
      [SEARCH]: () =>
        json({
          status: "answered",
          candidates: [
            { datasetId: MEISHO_ID, title: "名所・史跡", provider: "台東区", url: "u", matchReason: "r" },
            { datasetId: BUNKA_ID, title: "文化観光施設", provider: "台東区", url: "u", matchReason: "r" },
          ],
          gaps: [gapA, gapB],
        }),
      [AGGREGATE]: (body) =>
        (body as { datasetId: string }).datasetId === MEISHO_ID
          ? json({ status: "answered", result: { name: "寛永寺", summary: "…" }, query: "q" })
          : json(gapA),
      [PROVENANCE]: () => json({ status: "answered", sources: [source(MEISHO_ID, "名所・史跡")] }),
    });

    const plan = expectPlan(await buildPlan(DEFAULT_TRIP, { fetchImpl }));
    expect(plan.gaps).toEqual([gapA, gapB]);
  });

  it("unanswered が先に来ても、後続候補の集計は続ける", async () => {
    // continue が break に変わる退行の検出。既存の合流テストは「成功→未回答」の順しか踏まない
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
          ? json({ status: "unanswered", reason: "insufficient_granularity", message: "サンプル行が無いため内容を取り出せません。" })
          : json({ status: "answered", result: { name: "国立西洋美術館", summary: "…" }, query: "q" }),
      [PROVENANCE]: () => json({ status: "answered", sources: [source(BUNKA_ID, "文化観光施設")] }),
    });

    const plan = expectPlan(await buildPlan(DEFAULT_TRIP, { fetchImpl }));
    expect(plan.stops.map((s) => s.stop.place)).toEqual(["国立西洋美術館"]);
    expect(plan.gaps.map((gap) => gap.message)).toEqual(["サンプル行が無いため内容を取り出せません。"]);
    expect(calls.filter((c) => c.path === AGGREGATE)).toHaveLength(2);
  });

  it("集計の途中で障害が起きたら、それまでに集めた gap ごと打ち切って failure にする", async () => {
    // unanswered（データが無い・積んで続行）と障害（システム異常・即打ち切り）を混ぜない（API.md §4）。
    // 障害を gap 扱いで続行すると、HTTP 500 が「データがありません」として画面に出る
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
          : json({ error: "internal_error", message: "D1 が応答しません" }, 500),
      [PROVENANCE]: () => json({ status: "answered", sources: [source(MEISHO_ID, "名所・史跡")] }),
    });

    const outcome = await buildPlan(DEFAULT_TRIP, { fetchImpl });
    expect(outcome.kind === "failure" && outcome.failure.kind).toBe("http");
    expect(calls.map((c) => c.path)).not.toContain(PROVENANCE);
  });

  it("要求した datasetId の出典が返らないのは仕様違反なので、データ欠損に混ぜず障害にする（Issue #92。foryou 側と対）", async () => {
    // API.md §3.3 の契約: 知らない datasetId が1件でも混ざれば応答全体が unanswered になる。
    // よって answered で出典が欠けるのはバックエンドの不整合で、gaps に混ぜると実装のバグを
    // 未公開データとして主張することになる（絶対ルール #1）
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
          : json({ status: "answered", result: { name: "国立西洋美術館", summary: "…" }, query: "q" }),
      // BUNKA_ID の出典を返さない
      [PROVENANCE]: () => json({ status: "answered", sources: [source(MEISHO_ID, "名所・史跡")] }),
    });

    const outcome = await buildPlan(DEFAULT_TRIP, { fetchImpl });
    expect(outcome.kind).toBe("failure");
    if (outcome.kind !== "failure") return;
    expect(outcome.failure.kind).toBe("parse");
    expect(outcome.failure.detail).toContain("国立西洋美術館");
    expect(outcome.failure.detail).toContain(BUNKA_ID);
  });

  it("出典取得が unanswered なら、それまでに集めた内訳を保ったまま未回答にする（Issue #92・#94。foryou 側と対）", async () => {
    const { fetchImpl } = stubFetch({
      [SEARCH]: () =>
        json({
          status: "answered",
          candidates: [
            { datasetId: MEISHO_ID, title: "名所・史跡", provider: "台東区", url: "u", matchReason: "r" },
            { datasetId: BUNKA_ID, title: "文化観光施設", provider: "台東区", url: "u", matchReason: "r" },
          ],
          gaps: [{ status: "unanswered", reason: "other", message: "「ショッピング」に当たるものがありませんでした。" }],
        }),
      [AGGREGATE]: (body) =>
        (body as { datasetId: string }).datasetId === MEISHO_ID
          ? json({ status: "answered", result: { name: "寛永寺", summary: "…" }, query: "q" })
          : json({ status: "unanswered", reason: "insufficient_granularity", message: "内容を取り出せません。" }),
      [PROVENANCE]: () => json({ status: "unanswered", reason: "other", message: "出典を生成できません。" }),
    });

    const outcome = await buildPlan(DEFAULT_TRIP, { fetchImpl });
    expect(outcome).toEqual({
      kind: "unanswered",
      reason: "other",
      message: "出典を生成できません。",
      gaps: [
        { status: "unanswered", reason: "other", message: "「ショッピング」に当たるものがありませんでした。" },
        { status: "unanswered", reason: "insufficient_granularity", message: "内容を取り出せません。" },
      ],
    });
  });

  it("早期 return の経路でも dedupe が効く（同じ理由・同じ文面を二重に出さない。foryou 側と対）", async () => {
    const shared = { status: "unanswered", reason: "other", message: "同じ理由・同じ文面。" };

    // (1) 候補が全滅する経路
    const allDeadStub = stubFetch({
      [SEARCH]: () =>
        json({
          status: "answered",
          candidates: [{ datasetId: MEISHO_ID, title: "t", provider: "p", url: "u", matchReason: "r" }],
          gaps: [shared],
        }),
      [AGGREGATE]: () => json(shared),
    });
    const allDead = await buildPlan(DEFAULT_TRIP, { fetchImpl: allDeadStub.fetchImpl });
    expect(allDead.kind === "unanswered" && allDead.gaps).toEqual([shared]);

    // (2) 出典取得が unanswered の経路
    const { fetchImpl } = stubFetch({
      [SEARCH]: () =>
        json({
          status: "answered",
          candidates: [
            { datasetId: MEISHO_ID, title: "t", provider: "p", url: "u", matchReason: "r" },
            { datasetId: BUNKA_ID, title: "t", provider: "p", url: "u", matchReason: "r" },
          ],
          gaps: [shared],
        }),
      [AGGREGATE]: (body) =>
        (body as { datasetId: string }).datasetId === MEISHO_ID
          ? json({ status: "answered", result: { name: "寛永寺", summary: "…" }, query: "q" })
          : json(shared),
      [PROVENANCE]: () => json({ status: "unanswered", reason: "other", message: "出典を生成できません。" }),
    });
    const noProvenance = await buildPlan(DEFAULT_TRIP, { fetchImpl });
    expect(noProvenance.kind === "unanswered" && noProvenance.gaps).toEqual([shared]);
  });

  it("候補が全滅したら分類は other のまま、検索側と集計側の内訳を gaps で運ぶ（Issue #94。foryou 側と対）", async () => {
    const { fetchImpl, calls } = stubFetch({
      [SEARCH]: () =>
        json({
          status: "answered",
          candidates: [
            { datasetId: MEISHO_ID, title: "名所・史跡", provider: "台東区", url: "u", matchReason: "r" },
            { datasetId: BUNKA_ID, title: "文化観光施設", provider: "台東区", url: "u", matchReason: "r" },
          ],
          gaps: [{ status: "unanswered", reason: "other", message: "「ショッピング」に当たるものがありませんでした。" }],
        }),
      [AGGREGATE]: (body) =>
        (body as { datasetId: string }).datasetId === MEISHO_ID
          ? json({ status: "unanswered", reason: "insufficient_granularity", message: "内容を取り出せません。" })
          : json({ status: "unanswered", reason: "data_not_published", message: "「渋谷」の地物を収録していません。" }),
    });

    const outcome = await buildPlan(DEFAULT_TRIP, { fetchImpl });
    expect(outcome).toEqual({
      kind: "unanswered",
      reason: "other",
      message: "候補のデータセットから、旅程に出せる地物を取り出せませんでした。",
      gaps: [
        { status: "unanswered", reason: "other", message: "「ショッピング」に当たるものがありませんでした。" },
        { status: "unanswered", reason: "insufficient_granularity", message: "内容を取り出せません。" },
        { status: "unanswered", reason: "data_not_published", message: "「渋谷」の地物を収録していません。" },
      ],
    });
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

  it("出典が一部の datasetId しか返らなければ、残りを黙って落とさず障害にする（Issue #92 で変更）", async () => {
    // **以前はここで「対応しない停留地を落とす」ことを期待していた。** その挙動は
    // Issue #92 の指摘どおり握りつぶしで、しかも API.md §3.3 の契約（知らない datasetId が
    // 1件でも混ざれば応答全体が unanswered）に照らすと、出典が欠ける answered はそもそも
    // 仕様外。落とすのではなく仕様違反として表に出す
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

    const outcome = await buildPlan(DEFAULT_TRIP, { fetchImpl });
    expect(outcome.kind).toBe("failure");
    expect(outcome.kind === "failure" && outcome.failure.kind).toBe("parse");
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

  it("応答しない呼び出しは network ではなく timeout の障害にする（Issue #146。あなたへ側と対）", async () => {
    // signal が発火するまで一切解決しない fetch。実装が timeoutMs を coreOperations.ts へ
    // 渡し忘れていると、このテストは実時間で固まる（それ自体が退行の検出になる）
    const fetchImpl = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("The operation was aborted due to timeout", "TimeoutError"));
        });
      });
    }) as unknown as typeof fetch;

    const outcome = await buildPlan(DEFAULT_TRIP, { fetchImpl, timeoutMs: 20 });
    expect(outcome.kind === "failure" && outcome.failure.kind).toBe("timeout");
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
