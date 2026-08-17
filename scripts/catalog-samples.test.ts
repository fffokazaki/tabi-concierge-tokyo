import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CATALOG, findEntry, RESTAURANT_DATASET_ID, STATISTICS_DATASET_ID } from "../worker/core/catalog.ts";
import { parseCsv } from "./lib/csv.ts";

/**
 * `worker/core/catalog.ts` の固定データが、原本のスナップショットと一致していることを確かめる。
 *
 * スタブは実在するカタログデータセットを出典として名乗る。そこに原本に無い施設名や住所を
 * 書けば、それは出典の偽造になる（CLAUDE.md 絶対に守ること #1・#2）。人の目で確認しただけでは
 * あとから 1 行足したときに崩れるので、ここで機械的に固定する。
 *
 * 検査するのは名称の実在だけではない。**summary に書いた事実（住所・営業時間・料金など）も
 * 原本のセル値と突き合わせる**。画面に出るのは summary の側なので、そこが原本から離れると、
 * 本物の出典がついた誤った説明になる。
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
  it.each(CATALOG)("$title は data/<id>/meta.json の実測値と一致する", (entry) => {
    const meta = readMeta(entry.datasetId);

    expect(entry.title).toBe(meta.title);
    expect(entry.provider).toBe(meta.publisher);
    expect(entry.license).toBe(meta.license);
    expect(entry.url).toBe(meta.catalogUrl);
    expect(entry.retrievedAt).toBe(meta.retrievedAt);
    expect(entry.rowCount).toBe(meta.rows);
  });

  it.each(CATALOG)("$title の rowCount は原本CSVの実際の行数と一致する", (entry) => {
    // meta.json とだけ比べても、両方メタデータなので CSV 本体とのズレは見つからない。
    // rowCount は出典文字列（describeQuery）に出るので、実体と合っている必要がある
    expect(readRows(entry.datasetId)).toHaveLength(entry.rowCount);
  });

  it.each(CATALOG)("$title の matchReason は収録件数を実測どおりに書いている", (entry) => {
    // matchReason は応答としてユーザーに出る。件数の主張が rowCount とずれていないこと
    expect(`${entry.matchReason}`).toMatch(new RegExp(`${entry.rowCount}\\s*(件|行)`));
  });

  it("10件そろっていて、データセットIDが重複しない", () => {
    expect(CATALOG).toHaveLength(10);
    expect(new Set(CATALOG.map((entry) => entry.datasetId)).size).toBe(10);
    expect(CATALOG.map((entry) => entry.no)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it("特別扱いしているデータセットIDが実在する", () => {
    // ID を定数に集約しても、カタログから消えればガードは黙って効かなくなる。
    // 飲食店データが差し替わればジャンルの粒度不足判定が、統計表が消えれば集計表の判定が外れる
    expect(findEntry(RESTAURANT_DATASET_ID)?.title).toBe("東京都内の飲食店のバリアフリー情報");
    expect(findEntry(STATISTICS_DATASET_ID)?.samples).toEqual([]);
  });
});

describe("固定データの集計結果", () => {
  const samples = CATALOG.flatMap((entry) => entry.samples.map((sample) => ({ entry, sample })));

  it("スタブが返しうる行がある（回帰でゼロにならない）", () => {
    expect(samples.length).toBeGreaterThan(0);
  });

  it.each(samples)("「$sample.name」は原本CSVの記録した行に実在する", ({ entry, sample }) => {
    const rows = readRows(entry.datasetId);
    const row = rows[sample.sourceRow - 1];

    expect(row, `${entry.datasetId} に ${sample.sourceRow} 行目が無い`).toBeDefined();
    // 名称の列位置はデータセットごとに違うため、行のどこかに完全一致で現れることを見る
    expect(row).toContain(sample.name);
  });

  it.each(samples)("「$sample.name」の summary は原本のセル値だけで書かれている", ({ entry, sample }) => {
    const row = readRows(entry.datasetId)[sample.sourceRow - 1];

    expect(sample.sourceCells.length, `${sample.name} に根拠セルが無い`).toBeGreaterThan(0);
    for (const cell of sample.sourceCells) {
      // 原本の行にそのセル値が実在し、かつ summary がその値を使っていること（両方向）
      expect(row, `${sample.name}: 原本に「${cell}」が無い`).toContain(cell);
      expect(sample.summary, `${sample.name}: summary が「${cell}」を使っていない`).toContain(cell);
    }
  });

  it("サンプルのエリアは、そのデータセットの areas に含まれる", () => {
    // ここが破れると、検索では「このエリアには無い」とされたデータセットから、
    // 集計がそのエリアの地物を返すという食い違いが起きる
    for (const { entry, sample } of samples) {
      expect(entry.areas, `${entry.datasetId} の ${sample.name}`).toContain(sample.area);
    }
  });

  it("収録エリアには必ず固定データがある（片方のエリアだけ答えられない状態にしない）", () => {
    for (const entry of CATALOG) {
      for (const area of entry.areas) {
        expect(
          entry.samples.map((sample) => sample.area),
          `${entry.datasetId}（${entry.title}）に ${area} の固定データが無い`,
        ).toContain(area);
      }
    }
  });

  it("集計表（施設一覧ではないデータセット）は固定データを持たない", () => {
    expect(findEntry(STATISTICS_DATASET_ID)?.areas).toEqual([]);
  });
});
