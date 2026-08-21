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

    // 集計は同時に投げるが、記録の並びは候補順のまま（`callAndRead` は最初の `await` まで
    // 同期に進むので、fetch 自体は候補順に呼ばれる）。この行が見ているのは**呼ぶ順**であって
    // 待ち方ではない ―― fetch の手前に `await` が入ると、並列化と無関係にここが落ちる
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
      // 検索そのものが unanswered の経路。サーバーが添える構造化欠損（Issue #70）は
      // `areas` を送らないと付かないので、この画面の呼び出しでは常に空（Issue #94）
      gaps: [],
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

  it("reason と message の片方だけが同じ gap は畳み込まない（別々の欠損として残す）", async () => {
    // dedupe のキーは reason と message の組（buildPlan.test.ts の同名テストと対）。片方だけの
    // 一致で畳み込むと、同じ分類の別データセットの欠損（実装コメントの言う主ケース）が黙って1件に潰れる
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

    const outcome = expectRecs(await buildRecommendations("all", { fetchImpl }));
    expect(outcome.gaps).toEqual([
      { status: "unanswered", reason: "other", message: "「ショッピング」に当たるものがありませんでした。" },
      { status: "unanswered", reason: "other", message: "固定データにその行がありません。" },
      { status: "unanswered", reason: "insufficient_granularity", message: "「ショッピング」に当たるものがありませんでした。" },
    ]);
  });

  it("同じ gap が別の gap を挟んで再登場しても1件にまとめる（dedupe は配列全体に効く）", async () => {
    // 隣接要素だけを比較する実装へ退行しても、既存の dedupe テスト（隣接する重複のみ）は
    // すべて通ってしまう盲点（PR #104 レビュー）。A, B, A の並びを先頭出現順の A, B へ畳むことを固定する
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

    const outcome = expectRecs(await buildRecommendations("all", { fetchImpl }));
    expect(outcome.gaps).toEqual([gapA, gapB]);
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


  it("要求した datasetId の出典が返らないのは仕様違反なので、データ欠損に混ぜず障害にする（Issue #92）", async () => {
    // API.md §3.3 の契約: 知らない datasetId が1件でも混ざれば応答全体が unanswered になる。
    // よって answered で出典が欠けるのはバックエンドの不整合で、「そのデータが公開されていない」
    // ではない。gaps に混ぜると実装のバグを未公開データとして主張することになる（絶対ルール #1）
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

    const outcome = await buildRecommendations("all", { fetchImpl });
    expect(outcome.kind).toBe("failure");
    if (outcome.kind !== "failure") return;
    expect(outcome.failure.kind).toBe("parse");
    // どの内容の出典が欠けたかを検出できる形で残す（黙って落とさない）
    expect(outcome.failure.detail).toContain("国立西洋美術館");
    expect(outcome.failure.detail).toContain(BUNKA_ID);
  });

  it("出典取得が unanswered なら、それまでに集めた内訳を保ったまま未回答にする（Issue #92・#94）", async () => {
    // `callAndRead` が作る outcome は gaps: [] なので、そのまま返すと検索側・集計側の欠損が消える
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

    const outcome = await buildRecommendations("all", { fetchImpl });
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

  it("早期 return の経路でも dedupe が効く（同じ理由・同じ文面を二重に出さない）", async () => {
    // 成功経路の dedupe はテスト済みだが、#92・#94 で足した2つの早期 return は
    // 別々の gap しか踏んでいなかった。呼び忘れると DataGapCard の React key が重複する
    const shared = { status: "unanswered", reason: "other", message: "同じ理由・同じ文面。" };
    const stub = (provenance?: () => Response) => ({
      [SEARCH]: () =>
        json({
          status: "answered",
          candidates: [{ datasetId: MEISHO_ID, title: "t", provider: "p", url: "u", matchReason: "r" }],
          gaps: [shared],
        }),
      [AGGREGATE]: () => json(shared),
      ...(provenance ? { [PROVENANCE]: provenance } : {}),
    });

    // (1) 候補が全滅する経路
    const allDead = await buildRecommendations("all", { fetchImpl: stubFetch(stub()).fetchImpl });
    expect(allDead.kind === "unanswered" && allDead.gaps).toEqual([shared]);

    // (2) 出典取得が unanswered の経路（1件は集計できている必要があるので別スタブ）
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
    const noProvenance = await buildRecommendations("all", { fetchImpl });
    expect(noProvenance.kind === "unanswered" && noProvenance.gaps).toEqual([shared]);
  });

  it("候補が全滅したら分類は other のまま、個々の理由を gaps で運ぶ（Issue #94）", async () => {
    // 分類の引き上げはしない（1件のデータセットの判定を全体の判定として名乗らない）。
    // 代わりに検索側1件＋集計側2件の内訳をそのまま運ぶ
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

    const outcome = await buildRecommendations("all", { fetchImpl });
    expect(outcome).toEqual({
      kind: "unanswered",
      reason: "other",
      message: "候補のデータセットから、おすすめに出せる地物を取り出せませんでした。",
      gaps: [
        { status: "unanswered", reason: "other", message: "「ショッピング」に当たるものがありませんでした。" },
        { status: "unanswered", reason: "insufficient_granularity", message: "内容を取り出せません。" },
        { status: "unanswered", reason: "data_not_published", message: "「渋谷」の地物を収録していません。" },
      ],
    });
    // 出典を取りに行く必要すら無い
    expect(calls.map((c) => c.path)).not.toContain(PROVENANCE);
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

/**
 * 候補ごとの `aggregate_dataset` を**同時に**投げることの検証（Issue #142）。
 * プラン画面と同型なので、実装と同じくテストも対で写す（ACE-98-1）。
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
        return json({ status: "answered", result: { name: "絹本著色元三大師画像", summary: "…" }, query: "q" });
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
        return json({ status: "answered", result: { name: "絹本著色元三大師画像", summary: "…" }, query: "q" });
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
});
