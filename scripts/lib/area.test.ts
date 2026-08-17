import { describe, expect, it } from "vitest";
import { extractTown, resolveArea, resolveAreaFromName } from "./area.ts";

describe("extractTown", () => {
  it("都県・区のプレフィックスと丁目以降を落として町字だけ返す", () => {
    expect(extractTown("東京都台東区上野桜木1丁目14番")).toBe("上野桜木");
    expect(extractTown("上野公園7番7号")).toBe("上野公園");
    expect(extractTown("蔵前4丁目36番7号（竜宝寺内）")).toBe("蔵前");
  });

  it("ハイフン表記や全角数字でも町字を切り出せる", () => {
    expect(extractTown("谷中5-7")).toBe("谷中");
    expect(extractTown("浅草５丁目３番２号")).toBe("浅草");
  });

  it("漢数字の丁目でも町字を切り出せる", () => {
    // 宿泊施設（旅館台帳）は漢数字。ここを落とすと883件が丸ごと未分類になる
    expect(extractTown("浅草一丁目1番15号")).toBe("浅草");
    expect(extractTown("上野七丁目1番1号")).toBe("上野");
    expect(extractTown("西浅草三丁目17番1号")).toBe("西浅草");
  });

  it("町字自体に漢数字を含む地名を壊さない", () => {
    // 「丁目」が続く場合だけ落とすので、三ノ輪・三筋はそのまま残る
    expect(extractTown("三ノ輪1丁目1番")).toBe("三ノ輪");
    expect(extractTown("三筋2丁目1番")).toBe("三筋");
  });

  it("空文字は空文字のまま返す", () => {
    expect(extractTown("")).toBe("");
  });
});

describe("resolveAreaFromName（住所列を持たないデータ用）", () => {
  it("停留所名に含まれる町字からエリアを判定する", () => {
    expect(resolveAreaFromName("東西(鶯谷駅経由・日医大回りルート)2上野駅入谷口")).toBe("上野");
    expect(resolveAreaFromName("東西(鶯谷駅経由・日医大回りルート)33浅草消防署")).toBe("浅草");
  });

  it("長い町字を優先する（西浅草を浅草として素通りさせない）", () => {
    // どちらも結果は「浅草」だが、照合順が逆だと北上野が上野以外へ倒れる余地が出る
    expect(resolveAreaFromName("27西浅草三丁目")).toBe("浅草");
    expect(resolveAreaFromName("25北上野二丁目")).toBe("上野");
  });

  it("曖昧な町字（浅草橋・元浅草）を含む名称は判定しない", () => {
    expect(resolveAreaFromName("浅草橋駅前")).toBeNull();
    expect(resolveAreaFromName("元浅草三丁目")).toBeNull();
  });

  it("地名を含まない名称は null", () => {
    expect(resolveAreaFromName("12谷中銀座・よみせ通り")).toBeNull();
    expect(resolveAreaFromName("")).toBeNull();
  });

  describe("括弧内の路線名に引っかからない（Issue #30）", () => {
    it("路線名の地名ではなく停留所名の地名で決まる", () => {
      // 「上野公園経由」の路線名が先に当たり、この路線の全38停留所が上野に倒れていた
      expect(resolveAreaFromName("東西(上野公園経由・三崎坂往復ルート)27西浅草三丁目")).toBe("浅草");
      expect(resolveAreaFromName("東西(上野公園経由・三崎坂往復ルート)30浅草駅")).toBe("浅草");
      expect(resolveAreaFromName("東西(上野公園経由・三崎坂往復ルート)31雷門前")).toBe("浅草");
    });

    it("路線名にしか地名が無い停留所は判定しない（路線名で埋めない）", () => {
      // 谷中・三崎坂・新御徒町は代表エリア外。路線名の「上野公園」で上野にしてはいけない
      expect(resolveAreaFromName("東西(上野公園経由・三崎坂往復ルート)12谷中銀座・よみせ通り")).toBeNull();
      expect(resolveAreaFromName("東西(上野公園経由・三崎坂往復ルート)37新御徒町駅")).toBeNull();
    });

    it("停留所名側の地名は括弧があっても拾える（回帰確認）", () => {
      expect(resolveAreaFromName("東西(鶯谷駅経由・日医大回りルート)2上野駅入谷口")).toBe("上野");
      expect(resolveAreaFromName("東西(上野公園経由・三崎坂往復ルート)18池之端四丁目")).toBe("上野");
    });

    it("全角の括弧書きも落とす", () => {
      // 補足は全角で書かれている実データがある（三筋は代表エリア外なので null）
      expect(resolveAreaFromName("東西(上野公園経由・三崎坂往復ルート)35三筋二丁目（台東デザイナーズビレッジ）")).toBeNull();
      // 括弧内にだけ代表エリア名がある場合も、それで判定しない
      expect(resolveAreaFromName("架空停留所（上野公園経由）")).toBeNull();
    });

    it("曖昧な町字の判定も括弧を落とした後に行う", () => {
      // 路線名に浅草橋を含むだけで、浅草の停留所を判定不能にしない
      expect(resolveAreaFromName("南北(浅草橋経由ルート)5西浅草三丁目")).toBe("浅草");
      // 停留所名の側が浅草橋なら従来どおり判定しない
      expect(resolveAreaFromName("南北(上野公園経由ルート)5浅草橋駅前")).toBeNull();
    });

    it("括弧が閉じていない名称は削らない（どこまでが括弧書きか決められないため）", () => {
      // 実データ72件には 0 件。削る範囲を推測しない代わりに、路線名に引っかかる可能性は残る。
      // 挙動を明示しておかないと、後から「閉じていない場合も直っている」と誤読される
      expect(resolveAreaFromName("東西(上野公園経由27西浅草三丁目")).toBe("上野");
    });
  });
});

describe("resolveArea", () => {
  it("浅草の代表施設を、住所に「浅草」が無くても浅草と判定する", () => {
    // 浅草文化観光センターの所在地は「雷門2丁目18番9号」。
    // LIKE '%浅草%' ではこの施設が落ちる（部分一致が使えない最大の理由）
    expect(resolveArea("雷門2丁目18番9号")).toBe("浅草");
    expect(resolveArea("花川戸1丁目15番1号")).toBe("浅草");
  });

  it("「浅草」を含むが浅草エリアではない町字を除外する", () => {
    // 浅草橋は台東区南端（浅草寺から約2km）、元浅草は新御徒町付近。
    // どちらも部分一致なら誤って浅草に混ざる
    expect(resolveArea("浅草橋1丁目1番1号")).toBeNull();
    expect(resolveArea("元浅草2丁目1番1号")).toBeNull();
  });

  it("浅草エリアの町字を判定する", () => {
    expect(resolveArea("浅草7丁目4番1号")).toBe("浅草"); // 待乳山聖天
    expect(resolveArea("千束3丁目18番7号")).toBe("浅草"); // 鷲神社
    expect(resolveArea("西浅草1丁目1番1号")).toBe("浅草");
  });

  it("上野エリアの町字を判定する", () => {
    expect(resolveArea("上野公園7番20号")).toBe("上野"); // 国立科学博物館
    expect(resolveArea("上野桜木1丁目14番")).toBe("上野"); // 寛永寺
    expect(resolveArea("池之端1丁目4番24号")).toBe("上野"); // 横山大観記念館
    expect(resolveArea("東上野2丁目21番10号")).toBe("上野");
  });

  it("代表エリア外の台東区の町字は null を返す", () => {
    expect(resolveArea("谷中5-4-7")).toBeNull(); // 全生庵
    expect(resolveArea("根岸1丁目1番1号")).toBeNull();
    expect(resolveArea("蔵前4丁目36番7号")).toBeNull();
  });

  it("fixedArea が指定されていれば住所を見ずにそれを使う", () => {
    // 渋谷区のデータは区単位で1件のみのため、町字マッピングを持たない
    expect(resolveArea("東京都渋谷区代々木神園町2-1", "渋谷")).toBe("渋谷");
    expect(resolveArea("", "渋谷")).toBe("渋谷");
  });

  it("未知の町字は null を返す（推測で埋めない）", () => {
    expect(resolveArea("架空町1丁目")).toBeNull();
  });
});
