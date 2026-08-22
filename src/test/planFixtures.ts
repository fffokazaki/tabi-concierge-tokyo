import { vi } from "vitest";
import type { ProvenanceSource } from "../../shared/core";

/**
 * プラン画面のテスト用フィクスチャ（Issue #31）。
 *
 * `usePlanState` / `AppTabs` は `/api/*` を3回叩くので、テストごとに応答を組み立てると
 * 本題が埋もれる。値は**実在のカタログ値**を写している（適当な ID にすると、出典の
 * 突き合わせが壊れていても気づけない）。
 *
 * このファイルはテストからしか import されないため、本番バンドルには入らない。
 */

export const MEISHO_ID = "t131067d0000000251";
export const BUNKA_ID = "t131067d0000000236";
export const BUNKAZAI_ID = "t131067d0000000393";

export const SEARCH_PATH = "/api/search-datasets";
export const AGGREGATE_PATH = "/api/aggregate-dataset";
export const PROVENANCE_PATH = "/api/provenance";

export const provenanceSource = (datasetId: string, datasetTitle: string): ProvenanceSource => ({
  datasetId,
  datasetTitle,
  provider: "台東区",
  license: "CC BY 4.0",
  url: `https://catalog.data.metro.tokyo.lg.jp/dataset/${datasetId}`,
  query: "検索条件",
  retrievedAt: "2026-08-16",
});

export const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/**
 * パスごとに応答を決める fetch。呼ばれたパスとボディを記録する。
 * 応答はリクエストボディから作れるようにしてある（呼ばれた回数で分岐すると、
 * 同じテストで2回ルートを取り直したときに崩れる）。
 *
 * ハンドラは `Promise<Response>` を返してもよい。応答を保留できないと
 * 「候補の集計が同時に投げられているか」を確かめられない（Issue #142）。
 */
export function stubFetch(byPath: Partial<Record<string, (body: unknown) => Response | Promise<Response>>>) {
  const calls: { path: string; body: unknown }[] = [];
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input);
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ path, body });
    const make = byPath[path];
    if (!make) throw new Error(`想定外のパスが呼ばれました: ${path}`);
    return make(body);
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

/** 3件の停留地が出典つきで返る、素直に成功する組み合わせ */
export const PLAN_FIXTURE_STOPS = [
  { id: MEISHO_ID, title: "名所・史跡", name: "寛永寺", summary: "所在地は台東区上野桜木1丁目14番。", category: "名所・史跡" },
  { id: BUNKA_ID, title: "文化観光施設", name: "国立西洋美術館", summary: "所在地は上野公園7番7号。", category: "美術館" },
  { id: "t131067d0000000256", title: "銭湯", name: "燕湯", summary: "住所は東京都台東区上野3-14-5。", category: "銭湯" },
] as const;

type FixtureStop = { id: string; title: string; name: string; summary: string; category: string };

/** `stubSuccessfulPlan` 系の共通実装。渡した停留地の集合で3操作すべてに一貫して答える。 */
export function stubSuccessfulPlanWithStops(planStops: readonly FixtureStop[]) {
  return stubFetch({
    [SEARCH_PATH]: () =>
      jsonResponse({
        status: "answered",
        candidates: planStops.map((stop) => ({
          datasetId: stop.id,
          title: stop.title,
          provider: "台東区",
          url: "u",
          matchReason: "r",
        })),
      }),
    // 実際の aggregate_dataset と同じく datasetId で引く。呼ばれた回数では分岐しない
    [AGGREGATE_PATH]: (body) => {
      const datasetId = (body as { datasetId: string }).datasetId;
      const stop = planStops.find((candidate) => candidate.id === datasetId);
      if (!stop) return jsonResponse({ status: "unanswered", reason: "other", message: "未知のID" });
      return jsonResponse({
        status: "answered",
        result: { name: stop.name, summary: stop.summary, category: stop.category },
        query: "q",
      });
    },
    [PROVENANCE_PATH]: () =>
      jsonResponse({
        status: "answered",
        sources: planStops.map((stop) => provenanceSource(stop.id, stop.title)),
      }),
  });
}

export function stubSuccessfulPlan() {
  return stubSuccessfulPlanWithStops(PLAN_FIXTURE_STOPS);
}

/**
 * 4件の停留地が出典つきで返る組み合わせ（バランス型の表示上限＝3件を超えるケースの回帰用）。
 * `PLAN_FIXTURE_STOPS`（3件）は他テストがその件数そのものに依存しているため変更しない。
 */
export const PLAN_FIXTURE_STOPS_4 = [
  ...PLAN_FIXTURE_STOPS,
  { id: BUNKAZAI_ID, title: "文化財一覧", name: "絹本著色元三大師画像", summary: "台東区指定文化財の一つ。", category: "区指定文化財" },
] as const;
