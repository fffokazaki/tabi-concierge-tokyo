import { describe, expect, it } from "vitest";
import { capturingGapRecorder, expectAnswered } from "../test-support";
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
 * 構造化入力 `areas`（Issue #58／ADR-011）。
 *
 * 質問文の形だけでは「渋谷から〜」（出発地）と「渋谷を回りたい」（目的地）を見分けられない。
 * 区別を知っているのは呼び出し側なので、目的地の配列を畳み込む前の形で受け、
 * `areas` があるときは質問文からのエリア推測を行わない。
 */
describe("構造化入力: areas（訊かれた目的地）", () => {
  it("出発地として質問文に書かれた代表エリアを、欠損として報告しない", async () => {
    // query だけなら渋谷が過検知される質問（上のテスト）。目的地を areas で明示すれば、
    // 出発地の渋谷は「訊かれた」に数えられない
    const recorder = capturingGapRecorder();
    const output = await searchDatasets({ query: "渋谷から上野の美術館へ行きたい", areas: ["上野"] }, recorder);

    expect(expectAnswered(output).gaps).toBeUndefined();
    expect(recorder.records).toEqual([]);
  });

  it("複数の目的地のうち、候補が覆っていないものは従来どおり欠損にする", async () => {
    // areas は過検知を消すための入力であって、取り落ちの報告（Issue #52）を消す入力ではない
    const recorder = capturingGapRecorder();
    const output = await searchDatasets({ query: "美術館を回りたい", areas: ["上野", "渋谷"] }, recorder);

    const body = expectAnswered(output);
    expect(body.gaps).toHaveLength(1);
    expect(body.gaps?.[0].area).toBe("渋谷");
    expect(recorder.records).toEqual([
      { question: "美術館を回りたい", area: "渋谷", category: undefined, reason: "other" },
    ]);
  });

  it("空配列は「目的地なし」の明示で、質問文からの推測に落とさない", async () => {
    // 未指定（undefined）なら質問文から渋谷・上野を拾う質問。空配列は「推測しないでほしい」
    // という意思表示なので、どちらのエリアも「訊かれた」に数えない
    const recorder = capturingGapRecorder();
    const output = await searchDatasets({ query: "渋谷から上野の美術館へ行きたい", areas: [] }, recorder);

    expect(expectAnswered(output).gaps).toBeUndefined();
    expect(recorder.records).toEqual([]);
  });

  it("目的地と明示された対象エリア外は、欠損として報告する", async () => {
    // 質問文から拾った対象エリア外は出発地と見分けられないので報告しない（Issue #29）が、
    // areas に入れた地名は呼び出し側が目的地だと言っている。報告しないと新宿だけが黙って消える
    const recorder = capturingGapRecorder();
    const output = await searchDatasets({ query: "美術館を回りたい", areas: ["上野", "新宿"] }, recorder);

    const body = expectAnswered(output);
    expect(body.gaps).toHaveLength(1);
    expect(body.gaps?.[0].reason).toBe("out_of_area");
    expect(body.gaps?.[0].area).toBe("新宿");
    expect(recorder.records).toEqual([
      { question: "美術館を回りたい", area: "新宿", category: undefined, reason: "out_of_area" },
    ]);
  });

  it("代表エリアが1つも無ければ、応答全体を out_of_area で返す", async () => {
    const recorder = capturingGapRecorder();
    const output = await searchDatasets({ query: "美術館を回りたい", areas: ["新宿"] }, recorder);

    expect(output.status).toBe("unanswered");
    if (output.status !== "unanswered") return;
    expect(output.reason).toBe("out_of_area");
    expect(output.message).toContain("新宿");
    // 理由が唯一の目的地を報告しているので、空の gaps はキーごと省く
    expect(Object.hasOwn(output, "gaps")).toBe(false);
    expect(recorder.records).toEqual([
      { question: "美術館を回りたい", area: "新宿", category: undefined, reason: "out_of_area" },
    ]);
  });

  it("絞り込みに使うのは areas の最初の代表エリア（呼び出し側の並び順を尊重する）", async () => {
    // 質問文推測の「定義順（上野→浅草→渋谷）」と違い、構造化入力は並び順に意図があるとみなす
    const recorder = capturingGapRecorder();
    const output = await searchDatasets({ query: "公園", areas: ["渋谷", "上野"] }, recorder);

    const body = expectAnswered(output);
    // 渋谷で絞り込むので、先頭は渋谷区の都市公園（上野なら台東区のデータセットが来る）
    expect(body.candidates[0].title).toContain("都市公園");
  });

  it("先頭が対象エリア外でも、後ろに代表エリアがあれば答える（先頭要素で全体を落とさない）", async () => {
    // 「最初の代表エリア」であって「最初の要素」ではない。先頭の新宿で out_of_area に
    // してしまうと、答えられる上野の候補が失われる
    const recorder = capturingGapRecorder();
    const output = await searchDatasets({ query: "美術館を回りたい", areas: ["新宿", "上野"] }, recorder);

    const body = expectAnswered(output);
    expect(body.gaps).toHaveLength(1);
    expect(body.gaps?.[0].reason).toBe("out_of_area");
    expect(body.gaps?.[0].area).toBe("新宿");
  });

  it("直接呼び出しの未トリム・重複要素は正規化する（境界を通らない経路の防御）", async () => {
    // parse.ts はトリム済みの値を渡すが、コアは境界を通らずに直接呼ばれうる（モジュール doc）。
    // 「上野 」を対象エリア外と判定すると事実に反する応答になり、重複はそのぶん欠損が
    // 2行記録されて頻度集計（DOMAIN.md §7）が入力の重複で水増しされる
    const recorder = capturingGapRecorder();
    const trimmed = await searchDatasets({ query: "美術館を回りたい", areas: ["上野 "] }, recorder);
    expect(expectAnswered(trimmed).gaps).toBeUndefined();

    const duplicated = capturingGapRecorder();
    const output = await searchDatasets(
      { query: "美術館を回りたい", areas: ["上野", "渋谷", "渋谷"] },
      duplicated,
    );
    expect(expectAnswered(output).gaps).toHaveLength(1);
    expect(duplicated.records).toEqual([
      { question: "美術館を回りたい", area: "渋谷", category: undefined, reason: "other" },
    ]);
  });

  it("areas だけの直接呼び出しでも、記録の question が空にならない", async () => {
    // 興味も質問文も無い呼び出しでは areas を question に使う。空の question は
    // 「何を訊かれたか」を集計から読めなくする
    const recorder = capturingGapRecorder();
    await searchDatasets({ query: "", areas: ["上野", "渋谷"] }, recorder);

    expect(recorder.records).toEqual([
      { question: "上野、渋谷", area: "渋谷", category: undefined, reason: "other" },
    ]);
  });
});

/**
 * 構造化入力 `interests`（Issue #53／ADR-011）。
 *
 * 興味を自然文（`query`）に畳み込むと、キーワードが1件でも当たった時点で `answered` になり、
 * 答えていない興味は応答のどこにも残らない。畳み込む前の配列で受ければ、興味ごとに
 * 「返した候補が覆っているか」を判定できる。判定は既存のキーワード表との照合だけで、
 * 自然文の分解（形態素解析）はスタブに持ち込まない。
 */
describe("構造化入力: interests（訊かれた興味）", () => {
  it("キーワードが当たった経路でも、覆えなかった興味を gaps に載せて記録する", async () => {
    // 「夜遊び」に銭湯のキーワード「夜」が部分一致して answered になる質問（Issue #53 の実測）。
    // query に畳み込むと沈黙するが、interests で送れば「ナイトライフに答えていない」が残る
    const recorder = capturingGapRecorder();
    const output = await searchDatasets({ query: "上野で夜遊びしたい", interests: ["ナイトライフ"] }, recorder);

    const body = expectAnswered(output);
    expect(body.gaps).toHaveLength(1);
    expect(body.gaps?.[0].reason).toBe("other");
    expect(body.gaps?.[0].message).toContain("ナイトライフ");
    expect(recorder.records).toEqual([
      { question: "ナイトライフ、上野で夜遊びしたい", area: "上野", category: undefined, reason: "other" },
    ]);
  });

  it("答えられた興味と答えられなかった興味を区別して返す", async () => {
    // 「文化」は文化観光施設のキーワードに当たるが、「ショッピング」はどのキーワードにも
    // 当たらない。query 無し・興味チップだけの呼び出し（境界は interests があれば query を
    // 省略できる）
    const recorder = capturingGapRecorder();
    const output = await searchDatasets({ query: "", interests: ["ショッピング", "文化"] }, recorder);

    const body = expectAnswered(output);
    expect(body.gaps).toHaveLength(1);
    expect(body.gaps?.[0].message).toContain("ショッピング");
    expect(body.gaps?.[0].message).not.toContain("文化");
    expect(recorder.records).toEqual([
      { question: "ショッピング、文化", area: undefined, category: undefined, reason: "other" },
    ]);
  });

  it("すべての興味に答えられていれば、ノイズになる欠損を足さない", async () => {
    const recorder = capturingGapRecorder();
    const output = await searchDatasets({ query: "上野の美術館", interests: ["文化"] }, recorder);

    expect(expectAnswered(output).gaps).toBeUndefined();
    expect(recorder.records).toEqual([]);
  });

  it("ジャンル指定の飲食の興味は、粒度不足の欠損と二重に報告しない", async () => {
    // 「ラーメン」は collectPartialGaps が insufficient_granularity で報告済み。
    // 興味の取り落ちとしても載せると、同じ欠損が2件になり記録も二重に積まれる
    const recorder = capturingGapRecorder();
    const output = await searchDatasets({ query: "浅草の寺", interests: ["ラーメン"] }, recorder);

    const body = expectAnswered(output);
    expect(body.gaps).toHaveLength(1);
    expect(body.gaps?.[0].reason).toBe("insufficient_granularity");
  });

  it("マナー・作法の興味は、調査済み欠損と二重に報告しない", async () => {
    const recorder = capturingGapRecorder();
    const output = await searchDatasets({ query: "上野の美術館", interests: ["マナー"] }, recorder);

    const body = expectAnswered(output);
    expect(body.gaps).toHaveLength(1);
    expect(body.gaps?.[0].reason).toBe("data_not_published");
  });

  it("エリア・フォールバックに落ちても、興味ごとの欠損が載る", async () => {
    // 渋谷×ナイトライフはキーワードが1件も当たらない（都市公園のみ）。従来の
    // 「質問文の語に当たるデータセットが無かった」という総括ではなく、どの興味に
    // 答えていないかが興味単位で残る
    const recorder = capturingGapRecorder();
    const output = await searchDatasets({ query: "", interests: ["ナイトライフ"], areas: ["渋谷"] }, recorder);

    const body = expectAnswered(output);
    expect(body.gaps).toHaveLength(1);
    expect(body.gaps?.[0].message).toContain("ナイトライフ");
    expect(recorder.records).toEqual([
      { question: "ナイトライフ", area: "渋谷", category: undefined, reason: "other" },
    ]);
  });

  it("ジャンル語の興味が複数あっても、報告に対応しない側は沈黙させない", async () => {
    // 粒度不足として報告されるのは haystack で最初に見つかった1語（ラーメン）だけ。
    // 「ラーメンを含む興味」だけを畳み、寿司は other の取り落ちとして残す —
    // ジャンル語を含むという理由で両方畳むと、寿司の要求が応答からも記録からも消える
    const recorder = capturingGapRecorder();
    const output = await searchDatasets({ query: "浅草の寺", interests: ["ラーメン", "寿司"] }, recorder);

    const body = expectAnswered(output);
    expect(body.gaps).toHaveLength(2);
    expect(body.gaps?.[0].reason).toBe("insufficient_granularity");
    expect(body.gaps?.[0].message).toContain("ラーメン");
    expect(body.gaps?.[1].reason).toBe("other");
    expect(body.gaps?.[1].message).toContain("寿司");
    expect(recorder.records).toHaveLength(2);
  });

  it("渋谷の観光の興味は、調査済み欠損と二重に報告しない", async () => {
    const recorder = capturingGapRecorder();
    const output = await searchDatasets({ query: "渋谷の公園", interests: ["観光"] }, recorder);

    const body = expectAnswered(output);
    expect(body.gaps).toHaveLength(1);
    expect(body.gaps?.[0].reason).toBe("data_not_published");
    expect(recorder.records).toHaveLength(1);
  });

  it("重複した興味は1件に正規化する（記録の水増しを防ぐ）", async () => {
    const recorder = capturingGapRecorder();
    const output = await searchDatasets(
      { query: "", interests: ["ナイトライフ", "ナイトライフ"], areas: ["渋谷"] },
      recorder,
    );

    expect(expectAnswered(output).gaps).toHaveLength(1);
    expect(recorder.records).toHaveLength(1);
  });

  it("興味・目的地・エリア外が同時に欠けたら、3種の欠損がすべて載る", async () => {
    // 出所の異なる欠損（興味の取り落ち・明示されたエリア外・エリアの取り落ち）は独立に付く。
    // 連結順や早期 return の変更でどれかが黙って消えても、件数だけ見ていては気づけない
    const recorder = capturingGapRecorder();
    const output = await searchDatasets(
      { query: "美術館を回りたい", interests: ["ナイトライフ"], areas: ["上野", "渋谷", "新宿"] },
      recorder,
    );

    const body = expectAnswered(output);
    expect(body.gaps).toHaveLength(3);
    expect(body.gaps?.[0].message).toContain("ナイトライフ");
    expect(body.gaps?.[0].area).toBeUndefined();
    expect(body.gaps?.[1].reason).toBe("out_of_area");
    expect(body.gaps?.[1].area).toBe("新宿");
    expect(body.gaps?.[2].area).toBe("渋谷");
    expect(recorder.records).toEqual([
      { question: "ナイトライフ、美術館を回りたい", area: "上野", category: undefined, reason: "other" },
      { question: "ナイトライフ、美術館を回りたい", area: "新宿", category: undefined, reason: "out_of_area" },
      { question: "ナイトライフ、美術館を回りたい", area: "渋谷", category: undefined, reason: "other" },
    ]);
  });

  it("すべての興味に答えられなければ、従来どおり unanswered を返す（answered ＋ 全部 gaps にしない）", async () => {
    const recorder = capturingGapRecorder();
    const output = await searchDatasets({ query: "", interests: ["ショッピング"] }, recorder);

    expect(output.status).toBe("unanswered");
    if (output.status !== "unanswered") return;
    expect(output.reason).toBe("other");
    // 質問文の無い呼び出しに「質問文の語」と書かない（実際に照合した入力だけを書く）
    expect(output.message).toContain("興味");
    expect(recorder.records).toEqual([
      { question: "ショッピング", area: undefined, category: undefined, reason: "other" },
    ]);
  });

  it("unanswered の早期 return でも、areas で明示された対象エリア外は gaps と記録に残る（Issue #70）", async () => {
    // ジャンル判定が unanswered を返しても、目的地と明示された新宿の out_of_area は
    // 落とさない。unanswered の reason は1つしか運べないため、理由が覆っていない
    // 構造化欠損は unanswered 側の gaps に載せる
    const recorder = capturingGapRecorder();
    const output = await searchDatasets({ query: "", interests: ["ラーメン"], areas: ["上野", "新宿"] }, recorder);

    expect(output.status).toBe("unanswered");
    if (output.status !== "unanswered") return;
    expect(output.reason).toBe("insufficient_granularity");
    expect(output.gaps).toHaveLength(1);
    expect(output.gaps?.[0].reason).toBe("out_of_area");
    expect(output.gaps?.[0].area).toBe("新宿");
    expect(recorder.records).toEqual([
      { question: "ラーメン", area: "上野", category: undefined, reason: "insufficient_granularity" },
      { question: "ラーメン", area: "新宿", category: undefined, reason: "out_of_area" },
    ]);
  });

  it("応答全体が out_of_area のとき、理由が報告する地名を除いた残りの目的地が gaps に残る", async () => {
    // areas に代表エリアが1つも無い場合、理由に載るのは先頭の1件だけ。2件目以降を
    // 落とすと「新宿・池袋を回りたい」の池袋だけが応答からも記録からも消える
    const recorder = capturingGapRecorder();
    const output = await searchDatasets({ query: "美術館を回りたい", areas: ["新宿", "池袋"] }, recorder);

    expect(output.status).toBe("unanswered");
    if (output.status !== "unanswered") return;
    expect(output.reason).toBe("out_of_area");
    expect(output.message).toContain("新宿");
    expect(output.gaps).toHaveLength(1);
    expect(output.gaps?.[0].area).toBe("池袋");
    expect(recorder.records).toEqual([
      { question: "美術館を回りたい", area: "新宿", category: undefined, reason: "out_of_area" },
      { question: "美術館を回りたい", area: "池袋", category: undefined, reason: "out_of_area" },
    ]);
  });

  it("分類の空振りでも、areas で明示された対象エリア外は gaps に残る", async () => {
    const recorder = capturingGapRecorder();
    const output = await searchDatasets(
      { query: "動物園に行きたい", areas: ["上野", "新宿"], category: "動物園" },
      recorder,
    );

    expect(output.status).toBe("unanswered");
    if (output.status !== "unanswered") return;
    expect(output.reason).toBe("other");
    expect(output.gaps).toHaveLength(1);
    expect(output.gaps?.[0].area).toBe("新宿");
    expect(recorder.records).toEqual([
      { question: "動物園に行きたい", area: "上野", category: "動物園", reason: "other" },
      { question: "動物園に行きたい", area: "新宿", category: "動物園", reason: "out_of_area" },
    ]);
  });

  it("マナー・渋谷観光の unanswered でも、areas で明示された対象エリア外は gaps に残る", async () => {
    // どちらも unansweredWith を通る同型の経路だが、分岐の並べ替えで片方だけ添え忘れても
    // 気づけるよう個別に固定する
    const etiquette = capturingGapRecorder();
    const etiquetteOutput = await searchDatasets({ query: "マナーを知りたい", areas: ["浅草", "新宿"] }, etiquette);
    expect(etiquetteOutput.status).toBe("unanswered");
    if (etiquetteOutput.status !== "unanswered") return;
    expect(etiquetteOutput.reason).toBe("data_not_published");
    expect(etiquetteOutput.gaps?.[0].area).toBe("新宿");
    expect(etiquette.records).toEqual([
      { question: "マナーを知りたい", area: "浅草", category: undefined, reason: "data_not_published" },
      { question: "マナーを知りたい", area: "新宿", category: undefined, reason: "out_of_area" },
    ]);

    const shibuya = capturingGapRecorder();
    const shibuyaOutput = await searchDatasets({ query: "美術館を見たい", areas: ["渋谷", "新宿"] }, shibuya);
    expect(shibuyaOutput.status).toBe("unanswered");
    if (shibuyaOutput.status !== "unanswered") return;
    expect(shibuyaOutput.reason).toBe("data_not_published");
    expect(shibuyaOutput.gaps?.[0].area).toBe("新宿");
    expect(shibuya.records).toEqual([
      { question: "美術館を見たい", area: "渋谷", category: undefined, reason: "data_not_published" },
      { question: "美術館を見たい", area: "新宿", category: undefined, reason: "out_of_area" },
    ]);
  });

  it("unanswered でも、目的地と明示された代表エリアの2件目以降が gaps と記録に残る", async () => {
    // 絞り込みに使った上野は記録の area 列（解決結果）に残るが、渋谷はこの欠損が無いと
    // 応答・記録・question 列のどこにも残らない。「返した候補が〜」の文言は候補の無い
    // 文脈では嘘になるため、この応答が答えていない事実だけを書いた専用の文言を使う
    const recorder = capturingGapRecorder();
    const output = await searchDatasets({ query: "", interests: ["ラーメン"], areas: ["上野", "渋谷"] }, recorder);

    expect(output.status).toBe("unanswered");
    if (output.status !== "unanswered") return;
    expect(output.reason).toBe("insufficient_granularity");
    expect(output.gaps).toHaveLength(1);
    expect(output.gaps?.[0].reason).toBe("other");
    expect(output.gaps?.[0].area).toBe("渋谷");
    expect(output.gaps?.[0].message).toContain("答えられていません");
    expect(recorder.records).toEqual([
      { question: "ラーメン", area: "上野", category: undefined, reason: "insufficient_granularity" },
      { question: "ラーメン", area: "渋谷", category: undefined, reason: "other" },
    ]);
  });

  it("unanswered に興味ごとの欠損は載せない（未回答が全体を覆っている）", async () => {
    // 興味別の欠損 message は「返した候補」を前提にしており、候補が存在しない未回答の
    // 文脈では嘘になる。興味は記録の question 列に畳み込まれて残る（Issue #70 の判断）
    const recorder = capturingGapRecorder();
    const output = await searchDatasets({ query: "", interests: ["ナイトライフ", "ラーメン"] }, recorder);

    expect(output.status).toBe("unanswered");
    if (output.status !== "unanswered") return;
    expect(output.reason).toBe("insufficient_granularity");
    expect(Object.hasOwn(output, "gaps")).toBe(false);
    expect(recorder.records).toEqual([
      { question: "ナイトライフ、ラーメン", area: undefined, category: undefined, reason: "insufficient_granularity" },
    ]);
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
    "該当するオープンデータがありません。訪日観光客向けのマナー・作法の解説に相当するデータは、東京都オープンデータカタログに存在しないことを確認済みです（2026-08-17 調査）。この未回答は記録され、東京都へのデータ公開リクエストの題材になります。";

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
          "該当するオープンデータがありません。飲食店の店舗データは「東京都内の飲食店のバリアフリー情報」（210件・バリアフリー対応店に限定）のみで、ジャンルの列を持たないため「ラーメン」の粒度では答えられません。",
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
          "該当するオープンデータがありません。質問文の語に当たるデータセットが無かったため、「上野」を収録するデータセットを、エリアの事実として提示しています。",
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
      "該当するオープンデータが見つかりませんでした。「上野」で絞り込んだ候補には「公園」の語に当たるデータセットがありませんでした。",
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
      "該当するオープンデータが見つかりませんでした。利用中の10データセットのキーワードには「劇場」の語に当たるものがありませんでした。",
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
      "該当するオープンデータが見つかりませんでした。利用中の10データセットのキーワードには、質問文の語に当たるものがありませんでした。",
    );
    expect(recorder.records).toEqual([
      { question: "演劇", area: undefined, category: undefined, reason: "other" },
    ]);
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
