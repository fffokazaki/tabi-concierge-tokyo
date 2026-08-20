import { describe, expect, it } from "vitest";
import type { AggregateDatasetOutput, GetProvenanceOutput, SearchDatasetsOutput } from "../../shared/core";
import { capturingGapRecorder, expectAnswered } from "../test-support";
import { RESTAURANT_DATASET_ID, STATISTICS_DATASET_ID } from "./catalog";
import {
  aggregateDataset,
  areaNotPublishedUnanswered,
  getProvenance,
  rowMissingUnanswered,
  searchDatasets,
  MAX_SEARCH_LIMIT,
} from "./operations";

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

/**
 * 同点の解決（Issue #84）。
 *
 * `scoreEntry` が同点のとき、順位は `.sort(... || a.entry.no - b.entry.no)` の
 * **カタログ登録順**（`no` 昇順）で決まる。関連度と無関係な基準なので、あとから足した
 * データセットほど切り捨てられる側に回る。
 *
 * ここで固定するのは**カタログの中身に依存する事実**で、テストを緑に保つための表明ではない。
 * 既存のキーワード表をいじる・`no` を並べ替える・スコア計算を変えると落ちる — それが狙い。
 * 落ちたら「同点の並びが変わった」であって、期待値を書き換える前に、切り捨てで消える候補が
 * どの興味の一致先だったかを確かめること（Issue #84 の症状の再来かもしれない）。
 *
 * **件数そのものの番人はここではない。** `CATALOG` が10件であること・`no` が `[1..10]` で
 * あることは `scripts/catalog-samples.test.ts` が固定しており、11件目を足せばまずそちらが
 * 落ちる。ここが捕まえるのは**件数が変わらない変更**のほう。
 *
 * 構造化入力 `interests` を送る呼び出しには、覆えていない興味に先に1枠充てる手当てが入っている
 * （`operations.structured.test.ts` の「同点で切り捨てられる興味の一致先を先に確保する」）。
 * ここで見るのは**手当てが効かない自然文の経路**。
 */
describe("同点の解決はカタログ登録順（no 昇順）", () => {
  // 6件がそれぞれキーワード1件で当たり、実測（2026-08-19）で同点になる問い合わせ
  // （「文化」に4件・「家族」に1件・「自然」に1件）。あなたへ画面の「すべて」を自然文へ
  // 畳み込んだ形にあたる。**ラーメンは省いてある** — ジャンル判定を呼ぶだけで、
  // 除外される飲食店データ（no:8）はもともと score 0 なので並びに影響しない
  const TIED_QUERY = "文化、家族向け、自然";

  it("同点の候補は、関連度ではなく登録順に並ぶ", async () => {
    const output = await searchDatasets({ query: TIED_QUERY, limit: MAX_SEARCH_LIMIT }, capturingGapRecorder());

    expect(expectAnswered(output).candidates.map((candidate) => candidate.title)).toEqual([
      "名所・史跡",
      "文化観光施設",
      "文化財一覧",
      "トイレ情報",
      "銭湯",
      "都市公園・都立公園一覧",
    ]);
  });

  it("興味を自然文へ畳み込んだ呼び出しでは、切り捨ても登録順のまま（Issue #84 の手当ては構造化入力にだけ効く）", async () => {
    // 「自然」の唯一の一致先（no:10・渋谷区分として最後に足したデータセット）が落ちる。
    // 畳み込まれた自然文からは、どれがどの興味の一致先かを判定できない（分解は Step 5 の
    // LLM 側の仕事。Issue #53 と同じ理由でスタブに形態素解析を持ち込まない）
    const output = await searchDatasets({ query: TIED_QUERY, limit: 4 }, capturingGapRecorder());

    expect(expectAnswered(output).candidates.map((candidate) => candidate.title)).toEqual([
      "名所・史跡",
      "文化観光施設",
      "文化財一覧",
      "トイレ情報",
    ]);
  });
});

/**
 * エリア・フォールバックの部分欠損（Issue #50）。
 *
 * キーワードが1件も当たらなくても、エリアを収録したデータセットは事実として提示できる。
 * ただし**エリア名のほかに何か訊かれていた**場合、その一覧は訊かれた内容の答えではない。
 * 以前はそれを黙って `answered` として返し、`gaps` も記録も残らなかったため、無関係な候補に
 * 本物の CC BY 出典が付いたまま旅程に載っていた（`operations.ts` 冒頭の「問われたものと違う
 * ものを返さない」に反する状態）。
 *
 * **渋谷だけの問題ではない**ので、収録データセットが8件ある上野・浅草も見る（渋谷は1件）。
 *
 * **この手当てが効くのは「キーワードが1件も当たらなかった」経路だけ**。1件でも当たると
 * キーワード経路で `answered` になり、`query` に畳み込まれた興味の取り落ちは残らない。
 * 興味の取り落ちを報告できるのは構造化入力 `interests` を送った呼び出し（Issue #53／ADR-011。
 * 下の「構造化入力: interests」を参照）。
 * ここのテストが渋谷で通るのは、渋谷を収録するのが都市公園1件だけで、「夜遊び」に部分一致する
 * 銭湯（キーワードに「夜」）が `inArea` から外れるため。判定が正しいからではない。
 */
describe("エリアだけで絞った一覧に添える欠損", () => {
  it("エリア名のほかに訊かれた内容があれば、答えられていないことを gaps に載せて記録する", async () => {
    const recorder = capturingGapRecorder();
    const output = await searchDatasets({ query: "ナイトライフ、渋谷で夜遊びしたい" }, recorder);

    const body = expectAnswered(output);
    expect(body.gaps).toHaveLength(1);
    expect(body.gaps?.[0].reason).toBe("other");
    expect(body.gaps?.[0].message).toContain("渋谷");
    // 画面に出るだけでなく D1 にも残る（DOMAIN.md §8 不変条件4）
    expect(recorder.records).toEqual([
      { question: "ナイトライフ、渋谷で夜遊びしたい", area: "渋谷", category: undefined, reason: "other" },
    ]);
  });

  it.each(["ショッピング、上野", "ショッピング、浅草"])(
    "上野・浅草でも同じように欠損を載せる（渋谷固有の判定に頼らない）: %s",
    async (query) => {
      const recorder = capturingGapRecorder();
      const output = await searchDatasets({ query }, recorder);

      const body = expectAnswered(output);
      // 以前はここでトイレ情報までが gaps なしの「回答あり」として返っていた
      expect(body.gaps).toHaveLength(1);
      expect(body.gaps?.[0].reason).toBe("other");
      expect(recorder.records).toHaveLength(1);
    },
  );

  it("エリアだけを訊かれたときは欠損を足さない（ノイズにしない）", async () => {
    const recorder = capturingGapRecorder();
    const output = await searchDatasets({ query: "上野" }, recorder);

    const body = expectAnswered(output);
    // 「上野」だけの質問には、上野を収録するデータセットの一覧が答えそのもの。
    // ここに欠損を添えると Issue #29 の AC「空配列やノイズを足さない」に反する
    expect(body.gaps).toBeUndefined();
    expect(recorder.records).toEqual([]);
  });

  it.each(["上野、", "上野。", "上野？", "上野！", "上野／", "上野 "])(
    "区切り記号だけが余っていてもエリアだけの質問として扱う（%s）",
    async (query) => {
      const recorder = capturingGapRecorder();
      const output = await searchDatasets({ query }, recorder);

      expect(expectAnswered(output).gaps).toBeUndefined();
      expect(recorder.records).toEqual([]);
    },
  );

  it("area の明示指定でも欠損を添える（/mcp・API コンソール経路）", async () => {
    // プラン画面は area を送らないが、`worker/core/` は境界を通らず直接呼ばれうる
    const recorder = capturingGapRecorder();
    const output = await searchDatasets({ query: "ナイトライフ", area: "渋谷" }, recorder);

    expect(expectAnswered(output).gaps).toHaveLength(1);
    expect(recorder.records).toEqual([
      { question: "ナイトライフ", area: "渋谷", category: undefined, reason: "other" },
    ]);
  });

  it("渋谷の観光・文化施設は従来どおり data_not_published のまま（強い分類を薄めない）", async () => {
    const output = await searchDatasets({ query: "渋谷の美術館", area: "渋谷" }, capturingGapRecorder());

    expect(output.status).toBe("unanswered");
    if (output.status !== "unanswered") return;
    expect(output.reason).toBe("data_not_published");
  });

  it("未調査のジャンルを data_not_published にしない", async () => {
    // 渋谷の観光語リストに「ナイトライフ」を足せば unanswered にはできるが、
    // 未公開と言い切れる根拠（2026-08-16 の観光・文化施設の実測）が無いカテゴリなので
    // それは推測で埋めることになる（CLAUDE.md 絶対ルール #1）
    const output = await searchDatasets({ query: "ナイトライフ、渋谷" }, capturingGapRecorder());

    const body = expectAnswered(output);
    expect(body.gaps?.[0].reason).not.toBe("data_not_published");
  });
});

/**
 * 訊かれたエリアのうち、返した候補が覆っていないもの（Issue #52）。
 *
 * `resolveArea` は代表エリアを**1つしか返さない**ため、`"上野・渋谷"` の候補は上野の分だけになり、
 * 渋谷の要求は応答にも `gaps` テーブルにも残らなかった。Issue #50 の `hasContentBeyondArea` は
 * 「エリア名のほかに何か訊かれたか」しか見ないので、両方ともエリア名のこの質問では発火しない。
 *
 * 判定は**返した候補の `areas` が訊かれたエリアを覆っているか**で行う。「拾わなかったエリアを
 * 機械的に載せる」にすると `"上野・浅草"`（どちらも台東区データが収録している）にノイズが乗る。
 */
describe("訊かれたエリアのうち、候補が覆っていないもの", () => {
  it("上野・渋谷では、渋谷に答えていないことを gaps に載せる", async () => {
    const recorder = capturingGapRecorder();
    const output = await searchDatasets({ query: "上野・渋谷" }, recorder);

    const body = expectAnswered(output);
    expect(body.gaps).toHaveLength(1);
    expect(body.gaps?.[0].reason).toBe("other");
    expect(body.gaps?.[0].message).toContain("渋谷");
  });

  it("答えなかったエリアが記録の area 列から分かる", async () => {
    // 応答全体の area は解決結果の「上野」。答えなかったエリアを集計するには、
    // この欠損の行だけ area が「渋谷」になっている必要がある
    const recorder = capturingGapRecorder();
    await searchDatasets({ query: "上野・渋谷" }, recorder);

    expect(recorder.records).toEqual([
      { question: "上野・渋谷", area: "渋谷", category: undefined, reason: "other" },
    ]);
  });

  it("キーワードが当たった経路でも、覆えなかったエリアを報告する", async () => {
    // フォールバック経路だけに付けると、Issue #50 と同じ非対称（実際に旅程が組み上がる
    // ケースほど発火しない）を作り直すことになる
    const recorder = capturingGapRecorder();
    const output = await searchDatasets({ query: "上野の美術館と渋谷の公園" }, recorder);

    const body = expectAnswered(output);
    expect(body.gaps).toHaveLength(1);
    expect(body.gaps?.[0].message).toContain("渋谷");
    expect(recorder.records).toEqual([
      { question: "上野の美術館と渋谷の公園", area: "渋谷", category: undefined, reason: "other" },
    ]);
  });

  it("候補が両方のエリアを収録していれば欠損を足さない（上野・浅草）", async () => {
    // 台東区の8件はいずれも上野・浅草の両方を収録しているので、答えていないエリアは無い
    const recorder = capturingGapRecorder();
    const output = await searchDatasets({ query: "上野・浅草" }, recorder);

    expect(expectAnswered(output).gaps).toBeUndefined();
    expect(recorder.records).toEqual([]);
  });

  it("出発地として書かれた対象エリア外の地名は欠損にしない（Issue #29 の判断を維持）", async () => {
    const recorder = capturingGapRecorder();
    const output = await searchDatasets({ query: "新宿から上野へ行きたい" }, recorder);

    expect(expectAnswered(output).gaps).toBeUndefined();
    expect(recorder.records).toEqual([]);
  });

  it("エリア・フォールバックに落ちても、記録に残るのは代表エリアだけ", async () => {
    // 「訊かれたエリア」を代表エリアに限らず地名一般から集めると、この質問で新宿の行が増える。
    // 記録の件数だけでなく area の値まで見ないとその取り違えに気づけない
    const recorder = capturingGapRecorder();
    await searchDatasets({ query: "新宿から渋谷へ行きたい" }, recorder);

    expect(recorder.records).toEqual([
      { question: "新宿から渋谷へ行きたい", area: "渋谷", category: undefined, reason: "other" },
    ]);
  });

  it("エリア・フォールバックの欠損と同時に付く（欠損は1件とは限らない）", async () => {
    // 「上野・渋谷の公園」は (1) 質問文の語に当たるデータセットが無い (2) 渋谷を覆えていない
    // の2つが同時に成り立つ。片方だけ消えても件数を見ていないと気づけない
    const recorder = capturingGapRecorder();
    const output = await searchDatasets({ query: "上野・渋谷の公園" }, recorder);

    const body = expectAnswered(output);
    expect(body.gaps).toHaveLength(2);
    // 応答全体のエリア（上野）についての欠損は area を持たない
    expect(body.gaps?.[0].area).toBeUndefined();
    expect(body.gaps?.[1].area).toBe("渋谷");
    // 同じ reason でも重複排除しない（Issue #27 の AC）
    expect(recorder.records).toEqual([
      { question: "上野・渋谷の公園", area: "上野", category: undefined, reason: "other" },
      { question: "上野・渋谷の公園", area: "渋谷", category: undefined, reason: "other" },
    ]);
  });

  it("絞り込みに使うのは質問文の登場順ではなく定義順（上野→浅草→渋谷）", async () => {
    // 「上野・渋谷」では登場順と定義順が一致してしまい、登場順で実装しても通ってしまう
    const recorder = capturingGapRecorder();
    const output = await searchDatasets({ query: "渋谷・上野" }, recorder);

    const body = expectAnswered(output);
    // 先に書かれているのは渋谷だが、絞り込みに使われるのは上野（台東区のデータセット）
    expect(body.candidates[0].datasetId).toBe("t131067d0000000251");
    expect(recorder.records).toEqual([
      { question: "渋谷・上野", area: "渋谷", category: undefined, reason: "other" },
    ]);
  });

  it("query だけの呼び出しでは、出発地として書かれた代表エリアも欠損として報告する（過検知の側に倒す）", async () => {
    // 「渋谷から上野の美術館へ」の渋谷は出発地かもしれないが、渋谷は POC の対象エリアなので
    // 「渋谷のデータも欲しい」の可能性が残る。対象エリア外の新宿（そもそも答えられない）とは
    // 事情が違うため、Issue #29 と逆に過検知の側へ倒す。質問文の形だけでは出発地と目的地を
    // 見分けられないため、これは Issue #58 で**確定した仕様** — 区別を知っている呼び出し側は
    // `areas`（構造化入力）で目的地を明示する（下の「構造化入力: areas」を参照）。
    // 質問文からの抽出は Step 5 の LLM 側の仕事
    const recorder = capturingGapRecorder();
    const output = await searchDatasets({ query: "渋谷から上野の美術館へ行きたい" }, recorder);

    const body = expectAnswered(output);
    expect(body.gaps).toHaveLength(1);
    expect(body.gaps?.[0].area).toBe("渋谷");
    expect(recorder.records).toHaveLength(1);
  });

  it("エリアを持たない従来の部分欠損には area を足さない", async () => {
    // 常に埋めると「応答のエリアと違うから書いてある」という区別が失われる
    const recorder = capturingGapRecorder();
    const output = await searchDatasets({ query: "上野の美術館とラーメン", area: "上野" }, recorder);

    const body = expectAnswered(output);
    expect(body.gaps?.[0].reason).toBe("insufficient_granularity");
    expect(Object.hasOwn(body.gaps?.[0] ?? {}, "area")).toBe(false);
  });

  it("area を明示したら、質問文の他の代表エリアは訊かれたエリアに数えない", async () => {
    // 明示指定は質問文より優先する（API.md §3.1）。絞り込みの指定を尊重し、
    // 指定によって外れたエリアは「黙って落とした」ではなく呼び出し側の意図として扱う
    const recorder = capturingGapRecorder();
    const output = await searchDatasets({ query: "上野の公園", area: "渋谷" }, recorder);

    expect(expectAnswered(output).gaps).toBeUndefined();
    expect(recorder.records).toEqual([]);
  });
});

/**
 * マナー・作法の問い（Issue #43・ADR-010）。
 *
 * カタログ約9,600件に存在しないことを調査済み（DATABASE.md §2・2026-08-17）なので、
 * 最も強い分類 data_not_published を使う。カタログ外の出典で埋めず、記録の頻度を
 * データ公開リクエストの根拠にする（エスカレーション）。message は文言契約として
 * 完全一致で固定する（ACE-62-3）。
 */
describe("マナー・作法の問い", () => {
  // 「解説に相当するデータ」と限定した文言（DATABASE.md §2.1 の調査範囲）。ルールを場所として
  // 公開したデータ（§2.2）はカタログに実在する（リンク切れ）ので「存在しない」と広げると嘘になる
  const ETIQUETTE_MESSAGE =
    "訪日観光客向けのマナー・作法の解説に相当するデータは、東京都オープンデータカタログに存在しないことを確認済みです（2026-08-17 調査）。この未回答は記録され、東京都へのデータ公開リクエストの題材になります。";

  it("マナーだけを訊かれたら、調査済みの data_not_published を返して記録する", async () => {
    const recorder = capturingGapRecorder();
    const output = await searchDatasets({ query: "日本のマナーを知りたい" }, recorder);

    expect(output.status).toBe("unanswered");
    if (output.status !== "unanswered") return;
    expect(output.reason).toBe("data_not_published");
    expect(output.message).toBe(ETIQUETTE_MESSAGE);
    expect(recorder.records).toEqual([
      { question: "日本のマナーを知りたい", area: undefined, category: undefined, reason: "data_not_published" },
    ]);
  });

  it("エリア付きでもエリアの一覧へ落とさない（ジャンル判定と同じ優先順）", async () => {
    // 後ろに回すと「浅草のマナー」に浅草の一覧を返して欠損が消える
    const recorder = capturingGapRecorder();
    const output = await searchDatasets({ query: "浅草のマナー" }, recorder);

    expect(output.status).toBe("unanswered");
    if (output.status !== "unanswered") return;
    expect(output.reason).toBe("data_not_published");
    expect(recorder.records).toEqual([
      { question: "浅草のマナー", area: "浅草", category: undefined, reason: "data_not_published" },
    ]);
  });

  it("キーワードが当たる問いに混ざっていたら、answered に欠損として添えて記録する", async () => {
    const recorder = capturingGapRecorder();
    const output = await searchDatasets({ query: "上野の美術館と作法" }, recorder);

    expect(output.status).toBe("answered");
    if (output.status !== "answered") return;
    expect(output.gaps).toBeDefined();
    expect(output.gaps!.some((gap) => gap.reason === "data_not_published" && gap.message === ETIQUETTE_MESSAGE)).toBe(
      true,
    );
    expect(recorder.records).toContainEqual({
      question: "上野の美術館と作法",
      area: "上野",
      category: undefined,
      reason: "data_not_published",
    });
  });

  it("調査済みの語（エチケット・おもてなし）で発火する", async () => {
    for (const query of ["エチケットを教えて", "おもてなしの情報"]) {
      const output = await searchDatasets({ query }, capturingGapRecorder());
      expect(output.status).toBe("unanswered");
      if (output.status !== "unanswered") continue;
      expect(output.reason).toBe("data_not_published");
    }
  });

  it("調査していない語（礼儀・ピクトグラム）では発火しない（未調査の断定は推測）", async () => {
    for (const query of ["礼儀を知りたい", "ピクトグラムを探したい"]) {
      const recorder = capturingGapRecorder();
      const output = await searchDatasets({ query }, recorder);

      expect(output.status).toBe("unanswered");
      if (output.status !== "unanswered") continue;
      // 最終フォールバック（other）に落ちる。調査済みの data_not_published にしない
      expect(output.reason).toBe("other");
      expect(output.message).not.toBe(ETIQUETTE_MESSAGE);
      expect(recorder.records.every((r) => r.reason !== "data_not_published")).toBe(true);
    }
  });

  it("複数の欠損が同時に成立したら、どちらも消えずに gaps と記録へ残る", async () => {
    // ADR-010 の頻度集計は記録の完全性に依存する。some/toContainEqual では片方の消失を検出できない
    const recorder = capturingGapRecorder();
    const output = await searchDatasets({ query: "上野の美術館とラーメンと作法", area: "上野" }, recorder);

    expect(output.status).toBe("answered");
    if (output.status !== "answered") return;
    expect(output.gaps).toEqual([
      {
        status: "unanswered",
        reason: "insufficient_granularity",
        message:
          "飲食店の店舗データは「東京都内の飲食店のバリアフリー情報」（210件・バリアフリー対応店に限定）のみで、ジャンルの列を持たないため「ラーメン」の粒度では答えられません。",
      },
      { status: "unanswered", reason: "data_not_published", message: ETIQUETTE_MESSAGE },
    ]);
    expect(recorder.records).toEqual([
      { question: "上野の美術館とラーメンと作法", area: "上野", category: undefined, reason: "insufficient_granularity" },
      { question: "上野の美術館とラーメンと作法", area: "上野", category: undefined, reason: "data_not_published" },
    ]);
  });

  describe("判定の優先順（分岐の並べ替えで壊れたら気づけるよう固定する）", () => {
    it("対象エリア外が先勝ちする（新宿のマナー）", async () => {
      const output = await searchDatasets({ query: "新宿のマナー" }, capturingGapRecorder());

      expect(output.status).toBe("unanswered");
      if (output.status !== "unanswered") return;
      expect(output.reason).toBe("out_of_area");
      // 文面は利用者に見える。実装用語（POC）を出さない（Issue #99）
      expect(output.message).toBe(
        "「新宿」はこのアプリの対象エリア（上野・浅草・渋谷）の外です。",
      );
    });

    it("ジャンル指定の飲食が先勝ちし、マナーの記録は残らない（既知の取りこぼし）", async () => {
      // unanswered は理由を1つしか運べない。ADR-010 の頻度集計にとって既知の穴として固定する
      const recorder = capturingGapRecorder();
      const output = await searchDatasets({ query: "ラーメンのマナー" }, recorder);

      expect(output.status).toBe("unanswered");
      if (output.status !== "unanswered") return;
      expect(output.reason).toBe("insufficient_granularity");
      expect(recorder.records).toHaveLength(1);
    });

    it("マナーは渋谷の観光データ欠損より先勝ちする（渋谷の神社のマナー）", async () => {
      const output = await searchDatasets({ query: "渋谷の神社のマナー" }, capturingGapRecorder());

      expect(output.status).toBe("unanswered");
      if (output.status !== "unanswered") return;
      expect(output.message).toBe(ETIQUETTE_MESSAGE);
    });

    it("category にマナーを書かれても、分類の空振りではなく調査済みの欠損として返す", async () => {
      // haystack は query と category を連結するので、分類欄のマナーも語彙判定に入る。
      // 「絞り込んだ候補に当たらなかった」より「カタログに無いことを調査済み」のほうが強い事実
      const recorder = capturingGapRecorder();
      const output = await searchDatasets({ query: "上野", category: "マナー" }, recorder);

      expect(output.status).toBe("unanswered");
      if (output.status !== "unanswered") return;
      expect(output.reason).toBe("data_not_published");
      expect(output.message).toBe(ETIQUETTE_MESSAGE);
      expect(recorder.records).toEqual([
        { question: "上野", area: "上野", category: "マナー", reason: "data_not_published" },
      ]);
    });
  });

  it("「参拝」はマナー欠損にしない（行為の語。寺社の問いを奪わない）", async () => {
    // キーワードには当たらず（catalog の keywords に「参拝」は無い）、上野のエリア・フォールバックで
    // 一覧が返る。マナーの調査済み欠損は応答にも記録にも出ない
    const recorder = capturingGapRecorder();
    const output = await searchDatasets({ query: "上野で参拝したい" }, recorder);

    expect(output.status).toBe("answered");
    if (output.status !== "answered") return;
    expect(output.gaps).toEqual([
      {
        status: "unanswered",
        reason: "other",
        message:
          "質問文の語に当たるデータセットが無かったため、「上野」を収録するデータセットを、エリアの事実として提示しています。",
      },
    ]);
    expect(recorder.records).toEqual([
      { question: "上野で参拝したい", area: "上野", category: undefined, reason: "other" },
    ]);
  });
});

/**
 * 分類指定の空振りの文言（Issue #59）。
 *
 * 実装が知っているのは「照合した集合でキーワード表に当たらなかった」ことだけなので、
 * 「利用中の10データセットに無い」と断定しない。「上野の公園」で空振りしても、
 * 渋谷区の都市公園・都立公園一覧は10件の中に実在する。
 */
describe("分類指定の空振りの文言", () => {
  // 文言は完全一致で固定する。「〜がありません」の言い換え（対応するものがない・存在しない等）で
  // 断定が再混入しても、部分一致のアサートでは素通りするため
  it("エリアで絞り込んでいた場合、絞り込んだ集合で当たらなかったことだけを述べる", async () => {
    const recorder = capturingGapRecorder();
    const output = await searchDatasets({ query: "上野", category: "公園" }, recorder);

    expect(output.status).toBe("unanswered");
    if (output.status !== "unanswered") return;
    expect(output.reason).toBe("other");
    // 「10件全体に無い」と断定しない。渋谷区の都市公園・都立公園一覧が10件の中に実在する
    expect(output.message).toBe(
      "「上野」で絞り込んだ候補には「公園」の語に当たるデータセットがありませんでした。",
    );

    // 分類指定を黙って捨てない挙動は変えない（従来どおり unanswered("other") として記録される）
    expect(recorder.records).toEqual([
      { question: "上野", area: "上野", category: "公園", reason: "other" },
    ]);
  });

  it("エリア未指定なら、全10件のキーワードを照合して当たらなかったことを述べる", async () => {
    const recorder = capturingGapRecorder();
    const output = await searchDatasets({ query: "演劇", category: "劇場" }, recorder);

    expect(output.status).toBe("unanswered");
    if (output.status !== "unanswered") return;
    expect(output.reason).toBe("other");
    expect(output.message).toBe(
      "利用中の10データセットのキーワードには「劇場」の語に当たるものがありませんでした。",
    );

    // 文言だけでなく記録でも「分類ガードに到達した」ことを固定する（エリア未指定は area 列が空）
    expect(recorder.records).toEqual([
      { question: "演劇", area: undefined, category: "劇場", reason: "other" },
    ]);
  });

  it("最後のフォールバックも「対応するものが無い」と断定しない（同じ判断の姉妹分岐）", async () => {
    const recorder = capturingGapRecorder();
    const output = await searchDatasets({ query: "演劇" }, recorder);

    expect(output.status).toBe("unanswered");
    if (output.status !== "unanswered") return;
    expect(output.reason).toBe("other");
    expect(output.message).toBe(
      "利用中の10データセットのキーワードには、質問文の語に当たるものがありませんでした。",
    );
    expect(recorder.records).toEqual([
      { question: "演劇", area: undefined, category: undefined, reason: "other" },
    ]);
  });
});

describe("aggregateDataset（直接呼び出し）", () => {
  it("未知の datasetId は other の未回答にする（呼び出し側の指定違いを欠損統計に混ぜない）", async () => {
    const output = await aggregateDataset(
      { datasetId: "t000000d0000000000", intent: "上野の寺を1件" },
      capturingGapRecorder(),
    );

    expect(output.status).toBe("unanswered");
    if (output.status !== "unanswered") return;
    // 文面ごと固定する（Issue #99 と同じ理由）。この分岐は語彙ゲートの収集経路でしか
    // 踏まれておらず、文面・分類の回帰を単体で見張るテストが無かった（PR #109 レビュー指摘）
    expect(output.reason).toBe("other");
    expect(output.message).toBe("データセットID「t000000d0000000000」は利用中の10件に含まれていません。");
  });

  it("エリアを指定されたら、そのエリアの行が無い限り answered を返さない", async () => {
    // 渋谷区の公園データに上野を求める
    const output = await aggregateDataset(
      { datasetId: "t131130d2025000003", intent: "上野の公園を1件" },
      capturingGapRecorder(),
    );

    expect(output.status).toBe("unanswered");
    if (output.status !== "unanswered") return;
    // 文面は DataGapCard 経由で利用者に見える。分類・文面ごと固定して実装用語の混入を止める（Issue #99）
    expect(output.reason).toBe("data_not_published");
    expect(output.message).toBe("「都市公園・都立公園一覧」は「上野」の地物を収録していません。");
  });

  // `aggregateDataset` 経由では踏めない分岐の文面（Issue #99）。現行カタログでは
  // `areas` ⊆ 固定サンプルのエリアなので到達しないが、踏めないことは
  // 「実装用語が出ても気づけない」を意味するので、文面ヘルパを直接固定する
  describe("未回答文面のヘルパ（呼び出し経由では踏めない分岐）", () => {
    it("収録はあるが行が無いときの文面に実装用語を出さない", () => {
      expect(rowMissingUnanswered("名所・史跡一覧", "上野")).toEqual({
        status: "unanswered",
        reason: "other",
        message: "「名所・史跡一覧」は「上野」を収録していますが、このアプリではまだその内容を取り出せません。",
      });
    });

    it("収録が無いときの文面は、確かめた範囲だけを述べる", () => {
      expect(areaNotPublishedUnanswered("名所・史跡一覧", "渋谷")).toEqual({
        status: "unanswered",
        reason: "data_not_published",
        message: "「名所・史跡一覧」は「渋谷」の地物を収録していません。",
      });
    });
  });

  it("対象エリア外の文面に実装用語（POC）を出さない（Issue #99）", async () => {
    // unanswered の message は DataGapCard 経由で利用者に見える。開発者向けの語が
    // 混ざる退行をここで止める（到達不能な「スタブ」の分岐は、下の「未回答文面のヘルパ」で直接固定した）
    const output = await aggregateDataset(
      { datasetId: MEISHO_ID, intent: "新宿の寺を1件" },
      capturingGapRecorder(),
    );

    expect(output.status).toBe("unanswered");
    if (output.status !== "unanswered") return;
    expect(output.reason).toBe("out_of_area");
    expect(output.message).toBe("「新宿」はこのアプリの対象エリア（上野・浅草・渋谷）の外です。");
  });

  it("対象エリア外の文面は検索側と同文にする（画面の dedupeGaps で1件に畳めるように）", async () => {
    // 名乗りの除去（Issue #107）で検索側・集計側の out_of_area が同文になり、画面側の
    // 重複除去（reason と message の組）が畳み込めるようになった。片側だけ文言を直すと
    // この畳み込みが静かに割れるため、同文であること自体を固定する
    const searched = await searchDatasets({ query: "新宿の寺を1件" }, capturingGapRecorder());
    const aggregated = await aggregateDataset(
      { datasetId: MEISHO_ID, intent: "新宿の寺を1件" },
      capturingGapRecorder(),
    );

    expect(searched.status).toBe("unanswered");
    expect(aggregated.status).toBe("unanswered");
    if (searched.status !== "unanswered" || aggregated.status !== "unanswered") return;
    expect(searched.message).toBe(aggregated.message);
  });

  it("既知のエリア名が無い answered は、固定サンプル先頭という選定根拠を query に明記する（Issue #78）", async () => {
    const output = await aggregateDataset({ datasetId: MEISHO_ID, intent: "寺社を1件" }, capturingGapRecorder());

    expect(output.status).toBe("answered");
    if (output.status !== "answered") return;
    // 「エリア無指定」と書かない。確認したのは既知の語彙に当たらなかったことだけ（未知の
    // 地名が書かれていてもこの経路に来る）で、無指定と断定すると実態を超える
    expect(output.query).toContain("既知のエリア名が intent から見つからず");
    expect(output.query).toContain("固定サンプルの先頭を選定");
  });

  it("answered の query は経路によらず、intent の内容と照合していないことを明記する（Issue #78）", async () => {
    // エリアで絞った行も「内容が合うか」は見ていない。無指定経路だけに明記すると、
    // エリア指定ありの応答が対比で「照合済み」に見えてしまう
    const noArea = await aggregateDataset({ datasetId: MEISHO_ID, intent: "寺社を1件" }, capturingGapRecorder());
    const withArea = await aggregateDataset(
      { datasetId: MEISHO_ID, intent: "上野の寺社を1件" },
      capturingGapRecorder(),
    );

    for (const output of [noArea, withArea]) {
      expect(output.status).toBe("answered");
      if (output.status !== "answered") return;
      expect(output.query).toContain("intent の内容との照合はしていない");
    }
  });
});

/**
 * 利用者に見える文面に開発者向けの語が混ざらないこと（Issue #99）。
 *
 * 個々の文面の完全一致テストは、実装と期待値を**同時に**書き換えれば通ってしまう。
 * こちらは語彙リストを独立した不変条件として持ち、混入の経路そのものを塞ぐ。
 *
 * 集めるのは実際の呼び出しが返した `message`（`unanswered` 本体と `answered` の
 * `gaps` の両方）。ヘルパを個別に列挙するのではなく応答から集めるのは、**新しい分岐を
 * 足した人が語彙チェックの対象へ追加し忘れても効く**ようにするため。ただし呼び出しが
 * すべて `answered`（欠損なし）に倒れると検査対象ゼロで緑になるので、件数でも縛る。
 */
describe("利用者向け文面の語彙", () => {
  // 出典の query は対象外（`get_provenance` は呼び出し側の入力をそのまま返す）。
  // `aggregate_dataset` の answered が返す `query` も対象外 — あれは API/MCP 利用者向けに
  // 選定根拠を明記するフィールドで、画面には出ない（Issue #80 に申し送り済み）
  const DEV_TERMS = [
    "スタブ",
    "stub",
    "POC",
    "poc",
    "固定データ",
    "固定サンプル",
    "サンプル行",
    "プロトタイプ",
    "D1",
    "TODO",
    "Step 5",
    "Text-to-SQL",
    "CSV",
    "datasetId",
  ];

  /**
   * 実際の呼び出しが返す `message` をすべて集める（`unanswered` 本体と `answered` の
   * `gaps` の両方）。文面の不変条件テスト（実装用語・名乗りの一文）で共有する。
   */
  const collectUserFacingMessages = async (): Promise<string[]> => {
    const messages: string[] = [];
    // 引数を応答の型そのままで受ける。構造型（`{ status: string; message?: string }`）で
    // 受けると `Unanswered.message` をリネームしても型エラーにならず、静かに0件を集める
    const collect = (
      label: string,
      output: SearchDatasetsOutput | AggregateDatasetOutput | GetProvenanceOutput,
    ): void => {
      const before = messages.length;
      if (output.status === "unanswered") messages.push(output.message);
      if ("gaps" in output) for (const gap of output.gaps ?? []) messages.push(gap.message);
      // **入力ごとに**1件以上を主張する。合計の下限だけだと、gaps を複数返す別の入力が
      // 埋めてしまい「この呼び出しが answered へ倒れて検査対象が消えた」を見逃す
      expect(messages.length, `${label} から文面を集められなかった`).toBeGreaterThan(before);
    };

    // 検索側の分岐: 対象エリア外 / ジャンル指定の飲食 / マナー / 渋谷の観光 /
    // エリアのみのフォールバック / 訊かれたエリアの取り落ち / 分類の空振り（代表エリア・
    // エリア無しの両枝） / 最後のフォールバック / 興味の取り落ち / unanswered に添える
    // 目的地の取り落ち。**文面を生む分岐を1つでも欠くと、その分岐は完全一致テストの
    // 同時書き換えで不変条件ごとすり抜ける**（PR #109 レビューで2分岐の欠けを検出）
    for (const input of [
      { query: "新宿のマナー" },
      { query: "上野のラーメン" },
      { query: "浅草のマナー" },
      { query: "渋谷の美術館", area: "渋谷" as const },
      { query: "ナイトライフ、渋谷で夜遊びしたい" },
      { query: "上野・渋谷の美術館" },
      { query: "美術館を回りたい", areas: ["上野", "新宿"] },
      { query: "上野", category: "ナイトライフ" },
      { query: "演劇", category: "劇場" },
      { query: "演劇" },
      { interests: ["文化", "ラーメン"] },
      { query: "上野の美術館", interests: ["演劇"] },
      { query: "ラーメン", areas: ["上野", "渋谷"] },
    ]) {
      collect(JSON.stringify(input), await searchDatasets(input, capturingGapRecorder()));
    }

    // 集計側の分岐: 未知の ID / ジャンル指定の飲食 / 集計表 / 対象エリア外 / 収録なし
    for (const input of [
      { datasetId: "t000000d0000000000", intent: "上野の寺を1件" },
      { datasetId: RESTAURANT_DATASET_ID, intent: "上野のラーメンを1件" },
      { datasetId: STATISTICS_DATASET_ID, intent: "上野の統計を1件" },
      { datasetId: MEISHO_ID, intent: "新宿の寺を1件" },
      { datasetId: "t131130d2025000003", intent: "上野の公園を1件" },
    ]) {
      collect(JSON.stringify(input), await aggregateDataset(input, capturingGapRecorder()));
    }

    // 出典側の分岐: 未知の ID（名乗りを持ったことは無いが、両不変条件の傘に入れる。
    // PR #109 レビューで、収集経路に一度も乗っていないことを検出）
    collect(
      "getProvenance unknown id",
      await getProvenance({ datasetIds: ["t000000d0000000000"], query: "上野の寺社" }, capturingGapRecorder()),
    );

    // 到達不能な分岐はヘルパから直接
    messages.push(rowMissingUnanswered("名所・史跡一覧", "上野").message);

    // 呼び出しが answered へ倒れて検査対象が消えていないことを確かめる（黙って緑にしない）
    expect(messages.length).toBeGreaterThanOrEqual(18);
    return messages;
  };

  it("スタブが返しうる未回答・欠損の文面すべてに実装用語が無い", async () => {
    for (const message of await collectUserFacingMessages()) {
      for (const term of DEV_TERMS) expect(message, `文面: ${message}`).not.toContain(term);
    }
  });

  it("文面を「該当するオープンデータが〜」の名乗りで始めない（Issue #107）", async () => {
    // 画面（PlanScreen / ForYouScreen）は未回答の見出しとして「該当するオープンデータがありません」
    // を描画するため、message 側が名乗りを持つと同じ一文が見出しと本文で重複する。名乗りは
    // status / reason（画面では見出し）が担い、message は確かめた事実だけを書く（API.md §4）。
    // 断定（〜ません）と照合の結果（〜ませんでした）の使い分け（Issue #59）は文中の述語に残る
    for (const message of await collectUserFacingMessages()) {
      // 先頭に空白・改行を挟むと ^ アンカーをすり抜けるため、整形の乱れごと禁止する
      expect(message, `文面: ${message}`).toBe(message.trim());
      // 文頭だけでなく文中への挿し込みも禁止する。見出しとの重複（Issue #107 の症状）は
      // 名乗りがどこに書かれても起きる
      expect(message, `文面: ${message}`).not.toContain("該当するオープンデータ");
    }
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
