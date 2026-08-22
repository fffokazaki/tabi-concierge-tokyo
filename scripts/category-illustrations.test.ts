import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CATEGORY_ILLUSTRATION_GROUPS } from "../src/features/plan/categoryIllustrationGroups.ts";
import { parseCsvRecords } from "./lib/csv.ts";
import { DATASETS, type DatasetDef } from "./lib/datasets.ts";

const EXPECTED_COUNTS = {
  "「東西めぐりん（上野公園経由・三崎坂往復ルート）」停留所": 38,
  "「東西めぐりん（鶯谷駅経由・日医大回りルート）」停留所": 34,
  飲食店: 210,
  下宿営業: 3,
  簡易宿所営業: 205,
  "旅館・ホテル営業": 675,
  観光: 14,
  文化: 8,
  博物館: 4,
  美術館: 4,
  区指定文化財: 19,
  区民文化財: 171,
  "名所・史跡": 45,
  公園: 123,
  公衆トイレ: 69,
  銭湯: 23,
} as const;

function categoryOf(def: DatasetDef, rec: Record<string, string>): string | undefined {
  switch (def.shape) {
    case "taito_legacy":
      return rec["名称"] ? rec["小分類"] || rec["大分類"] || def.defaultCategory : undefined;
    case "standard":
      return rec["名称"] ? rec["文化財分類"] || rec["営業形態"] || def.defaultCategory : undefined;
    case "sento":
      return rec["銭湯名称"] ? def.defaultCategory : undefined;
    case "restaurant":
      return rec["店名"] ? def.defaultCategory : undefined;
    case "statistics":
      return undefined;
  }
}

function actualCounts(): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const def of DATASETS) {
    const records = parseCsvRecords(readFileSync(`data/${def.id}/data.csv`, "utf-8"));
    for (const rec of records) {
      const category = categoryOf(def, rec);
      if (category) counts[category] = (counts[category] ?? 0) + 1;
    }
  }
  return counts;
}

describe("カテゴリイラストの全行監査", () => {
  it("2026-08-16スナップショットは16分類・1,645行の記録と一致する", () => {
    const counts = actualCounts();

    expect(counts).toEqual(EXPECTED_COUNTS);
    expect(Object.values(counts).reduce((sum, count) => sum + count, 0)).toBe(1_645);
  });

  it("現存する16分類を完全一致の写像へ明示し、すべて画像グループへ割り当てる", () => {
    expect(Object.keys(CATEGORY_ILLUSTRATION_GROUPS)).toEqual(Object.keys(EXPECTED_COUNTS));
    expect(CATEGORY_ILLUSTRATION_GROUPS["名所・史跡"]).toBe("heritage");
    expect(Object.values(CATEGORY_ILLUSTRATION_GROUPS)).not.toContain(null);
  });
});
