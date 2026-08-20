import { describe, expect, it } from "vitest";
import { getJntoReference } from "./jntoEtiquette";

/**
 * datasetId → JNTOカテゴリの対応検証（ADR-012）。
 *
 * `worker/core/catalog.ts` に実在する10件の datasetId を実際に渡し、期待どおりの
 * カテゴリ（＝期待どおりの summary/url）が返ることを確認する。表示タイトルではなく
 * datasetId をキーにしているので、タイトル文言が変わってもこのテストは壊れない。
 */

const SHRINE_TEMPLE_URL = "https://www.japan.travel/en/guide/shrine-and-temple-traditions/";
const BATHHOUSE_URL = "https://www.japan.travel/en/guide/bathing-manners-and-tips/";
const RESTAURANT_URL = "https://www.japan.travel/en/guide/understanding-and-mastering-japanese-manners-and-etiquette/";
const TRANSIT_PARK_URL = "https://www.japan.travel/en/plan/custom-manners/";
const GENERAL_URL = "https://www.japan.travel/en/guide/japanese-manners-dos-and-donts/";

describe("getJntoReference", () => {
  it("名所・史跡（寛永寺・浅草寺等）は神社・寺のカテゴリになる", () => {
    expect(getJntoReference("t131067d0000000251").url).toBe(SHRINE_TEMPLE_URL);
  });

  it("銭湯は銭湯のカテゴリになる", () => {
    expect(getJntoReference("t131067d0000000256").url).toBe(BATHHOUSE_URL);
  });

  it("東京都内の飲食店のバリアフリー情報は飲食店のカテゴリになる", () => {
    expect(getJntoReference("t000012d0000000063").url).toBe(RESTAURANT_URL);
  });

  it("めぐりん停留所・都市公園はどちらも公園・バス停・公共交通のカテゴリになる", () => {
    expect(getJntoReference("t131067d0000000247").url).toBe(TRANSIT_PARK_URL);
    expect(getJntoReference("t131130d2025000003").url).toBe(TRANSIT_PARK_URL);
  });

  it("カテゴリ未対応のデータセット（文化観光施設・文化財一覧・トイレ情報・宿泊施設・統計調査）は一般へフォールバックする", () => {
    const uncategorized = [
      "t131067d0000000236", // 文化観光施設
      "t131067d0000000393", // 文化財一覧
      "t131067d0000000249", // トイレ情報
      "t131067d2025000004", // 宿泊施設（旅館台帳）
      "t000012d0000000081", // R6国・地域別外国人旅行者行動特性調査
    ];
    for (const datasetId of uncategorized) {
      expect(getJntoReference(datasetId).url).toBe(GENERAL_URL);
    }
  });

  it("未知の datasetId も一般へフォールバックする（未定義参照にしない）", () => {
    expect(getJntoReference("存在しないID").url).toBe(GENERAL_URL);
  });

  it("各カテゴリの要約は空文字ではない", () => {
    const ids = [
      "t131067d0000000251",
      "t131067d0000000256",
      "t000012d0000000063",
      "t131067d0000000247",
      "unknown",
    ];
    for (const datasetId of ids) {
      expect(getJntoReference(datasetId).summary.length).toBeGreaterThan(0);
    }
  });
});
