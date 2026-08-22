import { BUNKA_ID, jsonResponse, MEISHO_ID, provenanceSource, stubFetch } from "./planFixtures";

/**
 * あなたへ画面のテスト用フィクスチャ。`planFixtures.ts` の汎用部品（jsonResponse・stubFetch・
 * 実在のカタログ ID）をそのまま使う。3操作の呼び出し形自体はプランと共通のため。
 */

export const SEARCH_PATH = "/api/search-datasets";
export const AGGREGATE_PATH = "/api/aggregate-dataset";
export const PROVENANCE_PATH = "/api/provenance";

/** 2件のレコメンドが出典つきで返る、素直に成功する組み合わせ */
export const FORYOU_FIXTURE_RECS = [
  { id: MEISHO_ID, title: "名所・史跡", name: "寛永寺", summary: "所在地は台東区上野桜木1丁目14番。", category: "名所・史跡" },
  { id: BUNKA_ID, title: "文化観光施設", name: "国立西洋美術館", summary: "所在地は上野公園7番7号。", category: "美術館" },
] as const;

export function stubSuccessfulRecommendations() {
  return stubFetch({
    [SEARCH_PATH]: () =>
      jsonResponse({
        status: "answered",
        candidates: FORYOU_FIXTURE_RECS.map((rec) => ({
          datasetId: rec.id,
          title: rec.title,
          provider: "台東区",
          url: "u",
          matchReason: "r",
        })),
      }),
    [AGGREGATE_PATH]: (body) => {
      const datasetId = (body as { datasetId: string }).datasetId;
      const rec = FORYOU_FIXTURE_RECS.find((candidate) => candidate.id === datasetId);
      if (!rec) return jsonResponse({ status: "unanswered", reason: "other", message: "未知のID" });
      return jsonResponse({
        status: "answered",
        result: { name: rec.name, summary: rec.summary, category: rec.category },
        query: "q",
      });
    },
    [PROVENANCE_PATH]: () =>
      jsonResponse({
        status: "answered",
        sources: FORYOU_FIXTURE_RECS.map((rec) => provenanceSource(rec.id, rec.title)),
      }),
  });
}
