import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CATALOG } from "../worker/core/catalog.ts";
import { parseCsv } from "./lib/csv.ts";

/**
 * `worker/core/catalog.ts` の固定データが、原本のスナップショットと一致していることを確かめる。
 *
 * スタブは実在するカタログデータセットを出典として名乗る。そこに原本に無い施設名を書けば、
 * それは出典の偽造になる（CLAUDE.md 絶対に守ること #1・#2）。人の目で確認しただけでは
 * あとから 1 行足したときに崩れるので、ここで機械的に固定する。
 *
 * **このテストが scripts/ にあるのは実行環境の都合**。検証対象は worker のコードだが、
 * `data/` を読むにはファイルシステムが要り、workerd（vitest.worker.config.ts）では読めない。
 * scripts プロジェクトだけが Node で動く（vitest.scripts.config.ts）。
 */

type Meta = {
  datasetId: string;
  title: string;
  publisher: string;
  license: string;
  catalogUrl: string;
  retrievedAt: string;
  rows: number;
};

const readMeta = (datasetId: string): Meta =>
  JSON.parse(readFileSync(`data/${datasetId}/meta.json`, "utf-8")) as Meta;

/** ヘッダを除いたデータ行。`sourceRow` は 1 始まりでこの配列に対応する */
const readRows = (datasetId: string): string[][] =>
  parseCsv(readFileSync(`data/${datasetId}/data.csv`, "utf-8")).slice(1);

describe("カタログのメタ情報", () => {
  it.each(CATALOG.map((entry) => [entry.title, entry] as const))(
    "%s は data/<id>/meta.json の実測値と一致する",
    (_title, entry) => {
      const meta = readMeta(entry.datasetId);

      expect(entry.title).toBe(meta.title);
      expect(entry.provider).toBe(meta.publisher);
      expect(entry.license).toBe(meta.license);
      expect(entry.url).toBe(meta.catalogUrl);
      expect(entry.retrievedAt).toBe(meta.retrievedAt);
      expect(entry.rowCount).toBe(meta.rows);
    },
  );

  it("10件そろっていて、データセットIDが重複しない", () => {
    expect(CATALOG).toHaveLength(10);
    expect(new Set(CATALOG.map((entry) => entry.datasetId)).size).toBe(10);
    expect(CATALOG.map((entry) => entry.no)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });
});

describe("固定データの集計結果", () => {
  const samples = CATALOG.flatMap((entry) => entry.samples.map((sample) => [entry, sample] as const));

  it("スタブが返しうる行がある（回帰でゼロにならない）", () => {
    expect(samples.length).toBeGreaterThan(0);
  });

  it.each(samples.map(([entry, sample]) => [sample.name, entry, sample] as const))(
    "「%s」は原本CSVの記録した行に実在する",
    (_name, entry, sample) => {
      const rows = readRows(entry.datasetId);
      const row = rows[sample.sourceRow - 1];

      expect(row, `${entry.datasetId} に ${sample.sourceRow} 行目が無い`).toBeDefined();
      // 名称の列位置はデータセットごとに違うため、行のどこかに完全一致で現れることを見る
      expect(row).toContain(sample.name);
    },
  );

  it("集計表（施設一覧ではないデータセット）は固定データを持たない", () => {
    const statistics = CATALOG.find((entry) => entry.datasetId === "t000012d0000000081");
    expect(statistics?.samples).toEqual([]);
  });
});
