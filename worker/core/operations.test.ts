import { describe, expect, it } from "vitest";
import { capturingGapRecorder } from "../test-support";
import { aggregateDataset, getProvenance, searchDatasets, MAX_SEARCH_LIMIT } from "./operations";

/**
 * コア関数を**境界（parse.ts）を通さずに直接呼ぶ**経路のテスト。
 *
 * `/api/*` は必ず `parse.ts` を通るが、Step 5 で足す `/mcp` はコア関数を直接呼ぶ（ADR-008）。
 * 「境界が守ってくれる」前提の不変条件は、その経路では効かない。ここでは HTTP を介さず、
 * 壊れた入力をコアへ直接渡しても不正な応答を作らないことを確かめる。
 *
 * 未回答の記録も同様に、D1 ではなく `capturingGapRecorder` で「何が記録されたか」を見る。
 * 記録先が何であれ、コアが同じ行を作ることを確かめるのがここの役目（Issue #27）。
 */

const MEISHO_ID = "t131067d0000000251";

describe("searchDatasets（直接呼び出し）", () => {
  it("limit が範囲外でも、候補ゼロの answered を作らない", async () => {
    // 以前は limit: 0 が slice(0, 0) となり `{ status: "answered", candidates: [] }` を返せた。
    // 出典ゼロの「回答あり」は DOMAIN.md §8 不変条件1 の違反
    const zero = await searchDatasets({ query: "上野の寺社", limit: 0 }, capturingGapRecorder());
    const negative = await searchDatasets({ query: "上野の寺社", limit: -5 }, capturingGapRecorder());

    for (const output of [zero, negative]) {
      expect(output.status).toBe("answered");
      if (output.status !== "answered") continue;
      expect(output.candidates.length).toBeGreaterThan(0);
    }
  });

  it("limit が上限を超えても上限までしか返さない", async () => {
    const output = await searchDatasets({ query: "上野", limit: 999 }, capturingGapRecorder());

    expect(output.status).toBe("answered");
    if (output.status !== "answered") return;
    expect(output.candidates.length).toBeLessThanOrEqual(MAX_SEARCH_LIMIT);
  });
});

describe("aggregateDataset（直接呼び出し）", () => {
  it("エリアを指定されたら、そのエリアの行が無い限り answered を返さない", async () => {
    // 渋谷区の公園データに上野を求める
    const output = await aggregateDataset(
      { datasetId: "t131130d2025000003", intent: "上野の公園を1件" },
      capturingGapRecorder(),
    );

    expect(output.status).toBe("unanswered");
  });
});

describe("getProvenance（直接呼び出し）", () => {
  it("datasetIds が空なら例外にする（未回答の統計に混ぜない）", async () => {
    // 空配列は「答えが無い」ではなく呼び出し側の契約違反。unanswered として記録されると、
    // データ欠損の集計（DOMAIN.md §7）に呼び出し側のバグが紛れ込む
    await expect(getProvenance({ datasetIds: [], query: "検索条件" }, capturingGapRecorder())).rejects.toThrow(
      TypeError,
    );
  });

  it("出典は必ず1件以上返す", async () => {
    const output = await getProvenance({ datasetIds: [MEISHO_ID], query: "検索条件" }, capturingGapRecorder());

    expect(output.status).toBe("answered");
    if (output.status !== "answered") return;
    expect(output.sources.length).toBeGreaterThan(0);
  });
});

/**
 * 未回答の記録（Issue #27・DOMAIN.md §8 不変条件4）。
 *
 * 記録は `/api/*` と `/mcp` の両経路で同じように残る必要がある（ADR-008）ため、
 * ルートではなくコア側の振る舞いとして検査する。
 */
describe("未回答の記録", () => {
  it("unanswered には解決後のエリアを添える（入力の area をそのまま入れない）", async () => {
    const recorder = capturingGapRecorder();
    // area は未指定。集計に効くのは質問文から解決した「新宿」のほう
    await searchDatasets({ query: "新宿の美術館" }, recorder);

    expect(recorder.records).toEqual([
      { question: "新宿の美術館", area: "新宿", category: undefined, reason: "out_of_area" },
    ]);
  });

  it("answered に載る部分欠損も記録する（Issue #29 の gaps）", async () => {
    const recorder = capturingGapRecorder();
    const output = await searchDatasets({ query: "上野の美術館とラーメン", area: "上野" }, recorder);

    // 応答は answered。それでも欠損は記録に残る
    expect(output.status).toBe("answered");
    expect(recorder.records).toEqual([
      {
        question: "上野の美術館とラーメン",
        area: "上野",
        category: undefined,
        reason: "insufficient_granularity",
      },
    ]);
  });

  it("欠損の無い answered では記録しない", async () => {
    const recorder = capturingGapRecorder();
    await searchDatasets({ query: "上野の美術館", area: "上野" }, recorder);

    expect(recorder.records).toEqual([]);
  });

  it("category を指定していれば記録に残す", async () => {
    const recorder = capturingGapRecorder();
    await searchDatasets({ query: "上野", area: "上野", category: "動物園" }, recorder);

    expect(recorder.records).toEqual([
      { question: "上野", area: "上野", category: "動物園", reason: "other" },
    ]);
  });

  it("aggregate_dataset の未回答も記録する（/api と /mcp で経路が違っても同じ）", async () => {
    const recorder = capturingGapRecorder();
    await aggregateDataset({ datasetId: MEISHO_ID, intent: "新宿の寺を1件" }, recorder);

    expect(recorder.records).toEqual([
      { question: "新宿の寺を1件", area: "新宿", category: undefined, reason: "out_of_area" },
    ]);
  });

  it("get_provenance の未回答も記録する", async () => {
    const recorder = capturingGapRecorder();
    await getProvenance({ datasetIds: ["存在しないID"], query: "上野の寺社" }, recorder);

    expect(recorder.records).toEqual([
      { question: "上野の寺社", area: undefined, category: undefined, reason: "other" },
    ]);
  });

  it("get_provenance の契約違反（datasetIds が空）は記録しない", async () => {
    const recorder = capturingGapRecorder();
    await expect(getProvenance({ datasetIds: [], query: "上野の寺社" }, recorder)).rejects.toThrow(TypeError);

    // 呼び出し側のバグをデータ欠損の集計に混ぜない
    expect(recorder.records).toEqual([]);
  });

  it("同じ未回答が複数回起きたら、その回数だけ積む（重複排除しない）", async () => {
    const recorder = capturingGapRecorder();
    await searchDatasets({ query: "新宿の美術館" }, recorder);
    await searchDatasets({ query: "新宿の美術館" }, recorder);

    // 頻度を集計できる形にしておく（Issue #27 の AC）
    expect(recorder.records).toHaveLength(2);
  });
});
