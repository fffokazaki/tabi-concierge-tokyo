/**
 * 確定10件のオープンデータを東京都オープンデータカタログから取得し、
 * data/<dataset-id>/ にスナップショットとして保存する。
 *
 * 実行: node scripts/fetch-data.ts        （Node 24 の type stripping で直接動く）
 *
 * カタログが SSOT。リソースURLはハードコードせず毎回 API から解決する。
 * datasets.ts の宣言値（タイトル・提供元・更新頻度・文字コード）とカタログの
 * 実値がズレた場合は失敗させる。黙って古い前提のまま取り込まないため。
 */
import { mkdir, writeFile } from "node:fs/promises";
import { DATASETS, RETRIEVED_AT, catalogUrl, type DatasetDef } from "./lib/datasets.ts";

const API = "https://catalog.data.metro.tokyo.lg.jp/api/3/action";

interface Resource {
  format: string;
  url: string;
  name?: string;
}

async function packageShow(id: string) {
  const res = await fetch(`${API}/package_show?id=${id}`);
  if (!res.ok) throw new Error(`package_show ${id}: HTTP ${res.status}`);
  const json = (await res.json()) as { success: boolean; result: Record<string, unknown> };
  if (!json.success) throw new Error(`package_show ${id}: success=false`);
  return json.result;
}

/** 実体が本当に CSV か判定する。カタログの format は自己申告で、HTML が返ることがある（ACE-23-1）。 */
function looksLikeHtml(bytes: Uint8Array): boolean {
  const head = new TextDecoder("ascii").decode(bytes.slice(0, 200)).trimStart().toLowerCase();
  return head.startsWith("<!doctype") || head.startsWith("<html");
}

function decode(bytes: Uint8Array, encoding: DatasetDef["sourceEncoding"]): string {
  // fatal: true で、宣言と実際の文字コードが違えば例外にする（文字化けを黙って通さない）
  const label = encoding === "shift_jis" ? "shift_jis" : "utf-8";
  const text = new TextDecoder(label, { fatal: true }).decode(bytes);
  return text.replace(/^﻿/, "").replace(/\r\n/g, "\n");
}

async function fetchOne(def: DatasetDef) {
  const pkg = await packageShow(def.id);

  // カタログ実値と宣言値の照合
  const actualTitle = pkg.title as string;
  const org = pkg.organization as { title: string };
  const extras = (pkg.extras as Array<{ key: string; value: string }>) ?? [];
  const freq = extras.find((e) => e.key === "更新頻度")?.value ?? "";
  const mismatches: string[] = [];
  if (actualTitle !== def.title) mismatches.push(`title: "${def.title}" → "${actualTitle}"`);
  if (org.title !== def.publisher) mismatches.push(`publisher: "${def.publisher}" → "${org.title}"`);
  if (freq && freq !== def.updateFrequency)
    mismatches.push(`updateFrequency: "${def.updateFrequency}" → "${freq}"`);
  if (pkg.state !== "active") mismatches.push(`state=${pkg.state}`);
  if (pkg.private !== false) mismatches.push(`private=${pkg.private}`);
  if (pkg.license_id !== "CC-BY-4.0") mismatches.push(`license_id=${pkg.license_id}`);
  if (mismatches.length) {
    throw new Error(
      `[${def.id}] カタログの値が datasets.ts の宣言とズレている:\n  - ${mismatches.join("\n  - ")}\n` +
        `  docs/02-design/DATABASE.md と datasets.ts を確認して更新すること。`,
    );
  }

  const resources = (pkg.resources as Resource[]).filter((r) => (r.format ?? "").toUpperCase() === "CSV");
  if (!resources.length) throw new Error(`[${def.id}] CSV リソースが無い`);

  let saved = false;
  for (const r of resources) {
    const res = await fetch(r.url, { redirect: "follow" });
    if (!res.ok) continue;
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (looksLikeHtml(bytes)) continue; // format=CSV でも実体が HTML のことがある
    const text = decode(bytes, def.sourceEncoding);
    const dir = `data/${def.id}`;
    await mkdir(dir, { recursive: true });
    // 保存は UTF-8 に統一する（内容は変えない）。原本の文字コードは meta.json に残す。
    await writeFile(`${dir}/data.csv`, text, "utf-8");
    await writeFile(
      `${dir}/meta.json`,
      JSON.stringify(
        {
          datasetId: def.id,
          title: def.title,
          publisher: def.publisher,
          license: def.license,
          catalogUrl: catalogUrl(def.id),
          resourceUrl: r.url,
          retrievedAt: RETRIEVED_AT,
          updateFrequency: def.updateFrequency,
          sourceEncoding: def.sourceEncoding,
          metadataModified: pkg.metadata_modified,
          rows: text.split("\n").filter((l) => l.trim()).length - 1,
        },
        null,
        2,
      ) + "\n",
      "utf-8",
    );
    const rows = text.split("\n").filter((l) => l.trim()).length - 1;
    console.log(`✓ ${def.no.toString().padStart(2)} ${def.id}  ${rows.toString().padStart(4)}行  ${def.title}`);
    saved = true;
    break;
  }
  if (!saved) throw new Error(`[${def.id}] 取得可能な CSV 実体が無い（全リソースが HTML か取得失敗）`);
}

const failures: string[] = [];
for (const def of DATASETS) {
  try {
    await fetchOne(def);
  } catch (e) {
    failures.push(`${def.id}: ${(e as Error).message}`);
    console.error(`✗ ${def.id} ${def.title}\n  ${(e as Error).message}`);
  }
}
if (failures.length) {
  console.error(`\n${failures.length}/${DATASETS.length} 件が失敗した。`);
  process.exit(1);
}
console.log(`\n全 ${DATASETS.length} 件を data/ へ保存した。`);
