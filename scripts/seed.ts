/**
 * data/<dataset-id>/ のスナップショットから D1 投入用の SQL を生成する。
 *
 * 実行: node scripts/seed.ts            → db/seed.generated.sql を書き出す
 *       npm run db:seed:local           → ローカル D1 へ適用する
 *
 * 生成物であって手で編集しない。CSV を取り直したら再生成する。
 *
 * ここでの検証（座標範囲・エリア分類・出典の有無）は、スキーマ側の CHECK 制約と
 * 二重になっている。生成時点で落とすほうが原因が分かりやすいため、あえて両方に置く。
 */
import { readFileSync, writeFileSync } from "node:fs";
import { parseCsvRecords } from "./lib/csv.ts";
import { resolveArea, resolveAreaFromName } from "./lib/area.ts";
import { DATASETS, catalogUrl, type DatasetDef } from "./lib/datasets.ts";

interface Spot {
  datasetId: string;
  name: string;
  category: string;
  area: string | null;
  address: string;
  lat: number | null;
  lon: number | null;
  note: string;
  sourceRow: number;
}

/** 東京都本土の範囲。台東区の X/Y は経度・緯度の並びが自治体標準と逆のため、取り違えをここで落とす */
const LAT_RANGE = [35.4, 35.9] as const;
const LON_RANGE = [138.9, 139.95] as const;

function num(v: string): number | null {
  if (!v) return null;
  const n = Number(v.trim());
  return Number.isFinite(n) ? n : null;
}

function joinNote(parts: (string | undefined)[]): string {
  return parts.map((p) => (p ?? "").trim()).filter(Boolean).join(" / ");
}

/** データセットの形ごとに1行を Spot へ写す。対象外の行（名称が無い等）は null */
function toSpot(def: DatasetDef, rec: Record<string, string>, rowNo: number): Spot | null {
  const base = { datasetId: def.id, sourceRow: rowNo };

  switch (def.shape) {
    case "taito_legacy": {
      const name = rec["名称"];
      if (!name) return null;
      const address = rec["所在地"] ?? "";
      return {
        ...base,
        name,
        // 小分類が実質的な分類（「名所・史跡」「美術館」「観光」など）
        category: rec["小分類"] || rec["大分類"] || def.defaultCategory,
        // めぐりん停留所は住所を持たないため名称から引く（datasets.ts の areaFrom）
        area: def.areaFrom === "name" ? resolveAreaFromName(name) : resolveArea(address, def.fixedArea),
        address,
        // ここが取り違えやすい: X が経度、Y が緯度
        lat: num(rec["Y座標"]),
        lon: num(rec["X座標"]),
        note: joinNote([rec["情報"], rec["電話番号"] ? `TEL ${rec["電話番号"]}` : ""]),
      };
    }

    case "standard": {
      const name = rec["名称"];
      if (!name) return null;
      const address = rec["所在地_連結表記"] ?? "";
      // 町字列があればそちらでエリアを引く（連結表記より正確）
      const town = rec["所在地_町字"] || address;
      return {
        ...base,
        name,
        category: rec["文化財分類"] || rec["営業形態"] || def.defaultCategory,
        area: resolveArea(town, def.fixedArea),
        address,
        lat: num(rec["緯度"]),
        lon: num(rec["経度"]),
        note: joinNote([
          rec["種類"],
          rec["所有者等"] ? `所有: ${rec["所有者等"]}` : "",
          rec["設置位置"],
          rec["面積(㎡)"] ? `面積 ${rec["面積(㎡)"]}㎡` : "",
          rec["備考"],
        ]),
      };
    }

    case "sento": {
      const name = rec["銭湯名称"];
      if (!name) return null;
      const address = rec["住所"] ?? "";
      const hours =
        rec["営業開始時間"] && rec["営業終了時間"] ? `${rec["営業開始時間"]}〜${rec["営業終了時間"]}` : "";
      return {
        ...base,
        name,
        category: def.defaultCategory,
        area: resolveArea(address, def.fixedArea),
        address,
        lat: num(rec["Y座標"]),
        lon: num(rec["X座標"]),
        note: joinNote([
          hours,
          rec["定休日"] ? `定休 ${rec["定休日"]}` : "",
          rec["入浴料金（基本）"] ? `料金 ${rec["入浴料金（基本）"]}` : "",
        ]),
      };
    }

    case "restaurant": {
      const name = rec["店名"];
      if (!name) return null;
      const address = rec["住所"] ?? "";
      // 訪日客に効く項目だけを拾う（バリアフリー22項目すべては持ち込まない）
      const foreign = rec["英語等外国語のメニューがある"] === "○" ? "外国語メニューあり" : "";
      const halal = rec["事前申請によるハラール対応が可能"] === "○" ? "ハラール対応可" : "";
      const vegan =
        rec["事前申請によるベジタリアンまたはヴィーガン対応が可能"] === "○" ? "ベジタリアン対応可" : "";
      return {
        ...base,
        name,
        category: def.defaultCategory,
        area: resolveArea(address, def.fixedArea),
        address,
        lat: null, // このデータセットは座標を持たない
        lon: null,
        note: joinNote([rec["営業時間"], foreign, halal, vegan]),
      };
    }

    case "statistics":
      // クロス集計表。施設一覧ではないため spots へは入れない（出典としてのみ登録）
      return null;
  }
}

const q = (v: string | null) => (v === null ? "NULL" : `'${v.replace(/'/g, "''")}'`);
const n = (v: number | null) => (v === null ? "NULL" : String(v));

const lines: string[] = [
  "-- 自動生成ファイル。編集しない（scripts/seed.ts で再生成する）",
  `-- 生成元: data/<dataset-id>/ のスナップショット（取得日 2026-08-16）`,
  "",
  "DELETE FROM spots;",
  "DELETE FROM datasets;",
  "",
];

const errors: string[] = [];
const stats: Record<string, { total: number; areas: Record<string, number>; geo: number }> = {};
let totalSpots = 0;

for (const def of DATASETS) {
  const csv = readFileSync(`data/${def.id}/data.csv`, "utf-8");
  const meta = JSON.parse(readFileSync(`data/${def.id}/meta.json`, "utf-8"));
  const recs = parseCsvRecords(csv);

  const spots: Spot[] = [];
  recs.forEach((rec, i) => {
    const s = toSpot(def, rec, i + 1);
    if (s) spots.push(s);
  });

  // 座標の検証。1件でも範囲外なら生成を止める（黙って通すと全件がインド洋へ飛ぶ）
  for (const s of spots) {
    if (s.lat !== null && (s.lat < LAT_RANGE[0] || s.lat > LAT_RANGE[1]))
      errors.push(`[${def.id}] row ${s.sourceRow} "${s.name}": lat=${s.lat} が範囲外（X/Y の取り違え？）`);
    if (s.lon !== null && (s.lon < LON_RANGE[0] || s.lon > LON_RANGE[1]))
      errors.push(`[${def.id}] row ${s.sourceRow} "${s.name}": lon=${s.lon} が範囲外（X/Y の取り違え？）`);
  }

  lines.push(
    `INSERT INTO datasets (id, no, title, publisher, license, catalog_url, resource_url, retrieved_at, update_frequency, row_count, has_spots) VALUES (` +
      [
        q(def.id),
        def.no,
        q(def.title),
        q(def.publisher),
        q(def.license),
        q(catalogUrl(def.id)),
        q(meta.resourceUrl),
        q(meta.retrievedAt),
        q(def.updateFrequency),
        recs.length,
        def.shape === "statistics" ? 0 : 1,
      ].join(", ") +
      ");",
  );

  for (const s of spots) {
    lines.push(
      `INSERT INTO spots (dataset_id, name, category, area, address, lat, lon, note, source_row) VALUES (` +
        [
          q(s.datasetId),
          q(s.name),
          q(s.category),
          q(s.area),
          q(s.address),
          n(s.lat),
          n(s.lon),
          q(s.note),
          s.sourceRow,
        ].join(", ") +
        ");",
    );
  }
  lines.push("");

  const areas: Record<string, number> = {};
  for (const s of spots) areas[s.area ?? "(対象外)"] = (areas[s.area ?? "(対象外)"] ?? 0) + 1;
  stats[def.title] = { total: spots.length, areas, geo: spots.filter((s) => s.lat !== null).length };
  totalSpots += spots.length;
}

if (errors.length) {
  console.error("座標の検証に失敗した:\n" + errors.slice(0, 20).join("\n"));
  process.exit(1);
}

writeFileSync("db/seed.generated.sql", lines.join("\n"), "utf-8");

console.log("生成: db/seed.generated.sql");
console.log(`datasets ${DATASETS.length} 件 / spots ${totalSpots} 件\n`);
console.log("データセット別の内訳（エリア分類）:");
for (const [title, s] of Object.entries(stats)) {
  const areaStr = Object.entries(s.areas)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k}:${v}`)
    .join(" ");
  console.log(`  ${title.padEnd(22, "　")} ${String(s.total).padStart(4)}件 座標${String(s.geo).padStart(4)}件  ${areaStr}`);
}
