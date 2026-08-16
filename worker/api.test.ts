import { describe, expect, it } from "vitest";
import type { AggregateDatasetOutput, GetProvenanceOutput, SearchDatasetsOutput } from "../shared/core";
import { postJson } from "./test-support";

/**
 * コア3操作の `/api/*` スタブ（Issue #22）のテスト。
 *
 * 形だけを見るテストにしない。`toBeTypeOf("string")` の類は、値が捏造されていても通る。
 * 出典は**実在するカタログの値**（ID・提供元・URL・取得日）と一致することまで確かめる。
 */

/** 名所・史跡（台東区）。data/t131067d0000000251/meta.json の実測値 */
const MEISHO = {
  datasetId: "t131067d0000000251",
  title: "名所・史跡",
  provider: "台東区",
  url: "https://catalog.data.metro.tokyo.lg.jp/dataset/t131067d0000000251",
  retrievedAt: "2026-08-16",
} as const;

/** R6国・地域別外国人旅行者行動特性調査。施設一覧ではなくクロス集計表 */
const STATISTICS_ID = "t000012d0000000081";
/** 東京都内の飲食店のバリアフリー情報。ジャンルの列を持たない */
const RESTAURANT_ID = "t000012d0000000063";

const readJson = async <T>(response: Response): Promise<T> => (await response.json()) as T;

describe("POST /api/search-datasets", () => {
  it("代表エリアの質問には実在データセットの候補を返す", async () => {
    const response = await postJson("/api/search-datasets", { query: "上野の寺社をめぐりたい", area: "上野" });
    expect(response.status).toBe(200);

    const body = await readJson<SearchDatasetsOutput>(response);
    expect(body.status).toBe("answered");
    if (body.status !== "answered") return;

    expect(body.candidates.length).toBeGreaterThan(0);
    // 質問の中心（寺社）に最も近いデータセットが先頭に来る
    expect(body.candidates[0]).toMatchObject({
      datasetId: MEISHO.datasetId,
      title: MEISHO.title,
      provider: MEISHO.provider,
      url: MEISHO.url,
    });
    for (const candidate of body.candidates) {
      expect(candidate.matchReason.length).toBeGreaterThan(0);
    }
  });

  it("候補件数の既定は4件で、limit で狭められる", async () => {
    const defaults = await readJson<SearchDatasetsOutput>(
      await postJson("/api/search-datasets", { query: "上野の観光" }),
    );
    const limited = await readJson<SearchDatasetsOutput>(
      await postJson("/api/search-datasets", { query: "上野の観光", limit: 2 }),
    );

    expect(defaults.status).toBe("answered");
    expect(limited.status).toBe("answered");
    if (defaults.status !== "answered" || limited.status !== "answered") return;

    expect(defaults.candidates.length).toBeLessThanOrEqual(4);
    expect(limited.candidates).toHaveLength(2);
  });

  it("対象エリア外は HTTP エラーではなく unanswered(out_of_area) を返す", async () => {
    const response = await postJson("/api/search-datasets", { query: "美術館に行きたい", area: "新宿" });

    // 「データが無い」はエラーではなく正常な回答（API.md §4）
    expect(response.status).toBe(200);
    const body = await readJson<SearchDatasetsOutput>(response);
    expect(body.status).toBe("unanswered");
    if (body.status !== "unanswered") return;

    expect(body.reason).toBe("out_of_area");
    expect(body.message).toContain("新宿");
  });

  it("ラーメンは未公開ではなく粒度不足として返す", async () => {
    const response = await postJson("/api/search-datasets", { query: "上野でラーメンが食べたい", area: "上野" });

    expect(response.status).toBe(200);
    const body = await readJson<SearchDatasetsOutput>(response);
    expect(body.status).toBe("unanswered");
    if (body.status !== "unanswered") return;

    // 飲食店データ自体は存在する。ジャンルの粒度で答えられないだけ（DATABASE.md 既知のデータ欠損）
    expect(body.reason).toBe("insufficient_granularity");
    expect(body.message).toContain("ラーメン");
  });

  it("query が無い場合は 400 で invalid_request を返す", async () => {
    const response = await postJson("/api/search-datasets", { area: "上野" });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "invalid_request" });
  });

  it("limit が範囲外なら 400 を返す（黙って丸めない）", async () => {
    const response = await postJson("/api/search-datasets", { query: "上野の観光", limit: 0 });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "invalid_request" });
  });
});

describe("POST /api/aggregate-dataset", () => {
  it("実在する行を result と実行クエリつきで返す", async () => {
    const response = await postJson("/api/aggregate-dataset", {
      datasetId: MEISHO.datasetId,
      intent: "上野エリアの寺社を1件",
    });
    expect(response.status).toBe(200);

    const body = await readJson<AggregateDatasetOutput>(response);
    expect(body.status).toBe("answered");
    if (body.status !== "answered") return;

    // data/t131067d0000000251/data.csv の3行目に実在する
    expect(body.result.name).toBe("寛永寺");
    expect(body.result.summary).toContain("上野桜木1丁目14番");
    // 実行クエリは省略不可（API.md §4）。どのスナップショットの何行目かを辿れること
    expect(body.query).toContain(MEISHO.datasetId);
    expect(body.query).toContain("3 行目");
  });

  it("集計意図のエリアで返す行が変わる", async () => {
    const body = await readJson<AggregateDatasetOutput>(
      await postJson("/api/aggregate-dataset", { datasetId: MEISHO.datasetId, intent: "浅草の寺社を1件" }),
    );

    expect(body.status).toBe("answered");
    if (body.status !== "answered") return;
    expect(body.result.name).toBe("浅草寺");
  });

  it("クロス集計表からは地物を抽出できないので unanswered を返す", async () => {
    const response = await postJson("/api/aggregate-dataset", {
      datasetId: STATISTICS_ID,
      intent: "上野の施設を1件",
    });

    expect(response.status).toBe(200);
    const body = await readJson<AggregateDatasetOutput>(response);
    expect(body.status).toBe("unanswered");
    if (body.status !== "unanswered") return;
    expect(body.reason).toBe("insufficient_granularity");
  });

  it("飲食店データにジャンルを求めた場合も粒度不足で返す", async () => {
    const body = await readJson<AggregateDatasetOutput>(
      await postJson("/api/aggregate-dataset", { datasetId: RESTAURANT_ID, intent: "上野のラーメン店を1件" }),
    );

    expect(body.status).toBe("unanswered");
    if (body.status !== "unanswered") return;
    expect(body.reason).toBe("insufficient_granularity");
  });

  it("intent が無い場合は 400 を返す", async () => {
    const response = await postJson("/api/aggregate-dataset", { datasetId: MEISHO.datasetId });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "invalid_request" });
  });
});

describe("POST /api/provenance", () => {
  it("出典7フィールドがすべて実在の値で埋まる", async () => {
    const query = "上野エリアの寺社（検索条件）";
    const response = await postJson("/api/provenance", { datasetIds: [MEISHO.datasetId], query });
    expect(response.status).toBe(200);

    const body = await readJson<GetProvenanceOutput>(response);
    expect(body.status).toBe("answered");
    if (body.status !== "answered") return;

    expect(body.sources).toHaveLength(1);
    expect(body.sources[0]).toEqual({
      datasetId: MEISHO.datasetId,
      datasetTitle: MEISHO.title,
      provider: MEISHO.provider,
      license: "CC BY 4.0",
      url: MEISHO.url,
      query,
      retrievedAt: MEISHO.retrievedAt,
    });
  });

  it("知らない datasetId が混ざったら、既知のぶんだけ返さず unanswered にする", async () => {
    const body = await readJson<GetProvenanceOutput>(
      await postJson("/api/provenance", {
        datasetIds: [MEISHO.datasetId, "t000000d0000000000"],
        query: "検索条件",
      }),
    );

    // 黙って落とすと、呼び出し側が「出典が揃った」と誤認する
    expect(body.status).toBe("unanswered");
    if (body.status !== "unanswered") return;
    expect(body.reason).toBe("data_not_published");
    expect(body.message).toContain("t000000d0000000000");
  });

  it("query は必須。無ければ 400 を返す", async () => {
    const response = await postJson("/api/provenance", { datasetIds: [MEISHO.datasetId] });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "invalid_request" });
  });

  it("datasetIds が空なら 400 を返す", async () => {
    const response = await postJson("/api/provenance", { datasetIds: [], query: "検索条件" });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "invalid_request" });
  });
});

describe("出典強制（DOMAIN.md §8 不変条件1）", () => {
  it("検索で返した候補はすべて出典を生成できる", async () => {
    const search = await readJson<SearchDatasetsOutput>(
      await postJson("/api/search-datasets", { query: "上野の寺社と美術館", area: "上野" }),
    );
    expect(search.status).toBe("answered");
    if (search.status !== "answered") return;

    const query = "上野の寺社と美術館（検索条件）";
    const provenance = await readJson<GetProvenanceOutput>(
      await postJson("/api/provenance", {
        datasetIds: search.candidates.map((candidate) => candidate.datasetId),
        query,
      }),
    );

    expect(provenance.status).toBe("answered");
    if (provenance.status !== "answered") return;
    expect(provenance.sources).toHaveLength(search.candidates.length);
    for (const source of provenance.sources) {
      // CC BY 4.0 以外が混ざっていないこと（CLAUDE.md 絶対ルール #4）
      expect(source.license).toBe("CC BY 4.0");
      expect(source.query).toBe(query);
      expect(source.url).toContain("catalog.data.metro.tokyo.lg.jp/dataset/");
      expect(source.retrievedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(source.provider.length).toBeGreaterThan(0);
      expect(source.datasetTitle.length).toBeGreaterThan(0);
    }
  });
});
