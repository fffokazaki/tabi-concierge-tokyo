import { describe, expect, it } from "vitest";
import { capturingGapRecorder, expectAnswered, stubDeps } from "../test-support";
import { searchDatasets } from "./operations";

/**
 * `search_datasets` の構造化入力（`interests` / `areas`・ADR-011）のテスト。
 *
 * operations.test.ts から分離（Issue #71・ファイル分割のみで内容は変えていない）。
 * 位置づけはあちらと同じ — 境界（parse.ts）を通さず直接呼ぶ経路で、壊れた入力からも
 * 不正な応答を作らないことを確かめる。記録は `capturingGapRecorder` で見る（Issue #27）。
 */

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
    const output = await searchDatasets({ query: "渋谷から上野の美術館へ行きたい", areas: ["上野"] }, recorder, stubDeps());

    expect(expectAnswered(output).gaps).toBeUndefined();
    expect(recorder.records).toEqual([]);
  });

  it("複数の目的地のうち、候補が覆っていないものは従来どおり欠損にする", async () => {
    // areas は過検知を消すための入力であって、取り落ちの報告（Issue #52）を消す入力ではない
    const recorder = capturingGapRecorder();
    const output = await searchDatasets({ query: "美術館を回りたい", areas: ["上野", "渋谷"] }, recorder, stubDeps());

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
    const output = await searchDatasets({ query: "渋谷から上野の美術館へ行きたい", areas: [] }, recorder, stubDeps());

    expect(expectAnswered(output).gaps).toBeUndefined();
    expect(recorder.records).toEqual([]);
  });

  it("目的地と明示された対象エリア外は、欠損として報告する", async () => {
    // 質問文から拾った対象エリア外は出発地と見分けられないので報告しない（Issue #29）が、
    // areas に入れた地名は呼び出し側が目的地だと言っている。報告しないと新宿だけが黙って消える
    const recorder = capturingGapRecorder();
    const output = await searchDatasets({ query: "美術館を回りたい", areas: ["上野", "新宿"] }, recorder, stubDeps());

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
    const output = await searchDatasets({ query: "美術館を回りたい", areas: ["新宿"] }, recorder, stubDeps());

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
    const output = await searchDatasets({ query: "公園", areas: ["渋谷", "上野"] }, recorder, stubDeps());

    const body = expectAnswered(output);
    // 渋谷で絞り込むので、先頭は渋谷区の都市公園（上野なら台東区のデータセットが来る）
    expect(body.candidates[0].title).toContain("都市公園");
  });

  it("先頭が対象エリア外でも、後ろに代表エリアがあれば答える（先頭要素で全体を落とさない）", async () => {
    // 「最初の代表エリア」であって「最初の要素」ではない。先頭の新宿で out_of_area に
    // してしまうと、答えられる上野の候補が失われる
    const recorder = capturingGapRecorder();
    const output = await searchDatasets({ query: "美術館を回りたい", areas: ["新宿", "上野"] }, recorder, stubDeps());

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
    const trimmed = await searchDatasets({ query: "美術館を回りたい", areas: ["上野 "] }, recorder, stubDeps());
    expect(expectAnswered(trimmed).gaps).toBeUndefined();

    const duplicated = capturingGapRecorder();
    const output = await searchDatasets(
      { query: "美術館を回りたい", areas: ["上野", "渋谷", "渋谷"] },
      duplicated,
      stubDeps(),
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
    await searchDatasets({ query: "", areas: ["上野", "渋谷"] }, recorder, stubDeps());

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
    const output = await searchDatasets({ query: "上野で夜遊びしたい", interests: ["ナイトライフ"] }, recorder, stubDeps());

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
    const output = await searchDatasets({ query: "", interests: ["ショッピング", "文化"] }, recorder, stubDeps());

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
    const output = await searchDatasets({ query: "上野の美術館", interests: ["文化"] }, recorder, stubDeps());

    expect(expectAnswered(output).gaps).toBeUndefined();
    expect(recorder.records).toEqual([]);
  });

  it("ジャンル指定の飲食の興味は、粒度不足の欠損と二重に報告しない", async () => {
    // 「ラーメン」は collectPartialGaps が insufficient_granularity で報告済み。
    // 興味の取り落ちとしても載せると、同じ欠損が2件になり記録も二重に積まれる
    const recorder = capturingGapRecorder();
    const output = await searchDatasets({ query: "浅草の寺", interests: ["ラーメン"] }, recorder, stubDeps());

    const body = expectAnswered(output);
    expect(body.gaps).toHaveLength(1);
    expect(body.gaps?.[0].reason).toBe("insufficient_granularity");
  });

  it("マナー・作法の興味は、調査済み欠損と二重に報告しない", async () => {
    const recorder = capturingGapRecorder();
    const output = await searchDatasets({ query: "上野の美術館", interests: ["マナー"] }, recorder, stubDeps());

    const body = expectAnswered(output);
    expect(body.gaps).toHaveLength(1);
    expect(body.gaps?.[0].reason).toBe("data_not_published");
  });

  it("エリア・フォールバックに落ちても、興味ごとの欠損が載る", async () => {
    // 渋谷×ナイトライフはキーワードが1件も当たらない（都市公園のみ）。従来の
    // 「質問文の語に当たるデータセットが無かった」という総括ではなく、どの興味に
    // 答えていないかが興味単位で残る
    const recorder = capturingGapRecorder();
    const output = await searchDatasets({ query: "", interests: ["ナイトライフ"], areas: ["渋谷"] }, recorder, stubDeps());

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
    const output = await searchDatasets({ query: "浅草の寺", interests: ["ラーメン", "寿司"] }, recorder, stubDeps());

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
    const output = await searchDatasets({ query: "渋谷の公園", interests: ["観光"] }, recorder, stubDeps());

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
      stubDeps(),
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
      stubDeps(),
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

  it.each([
    {
      label: "興味のみ",
      input: { interests: ["ショッピング"] },
      expectedMessage:
        "利用中の10データセットのキーワードには、興味の語に当たるものがありませんでした。",
      recordedQuestion: "ショッピング",
    },
    {
      label: "質問文と興味",
      input: { query: "演劇", interests: ["ショッピング"] },
      expectedMessage:
        "利用中の10データセットのキーワードには、質問文・興味の語に当たるものがありませんでした。",
      recordedQuestion: "ショッピング、演劇",
    },
    {
      label: "質問文のみ",
      input: { query: "演劇" },
      expectedMessage:
        "利用中の10データセットのキーワードには、質問文の語に当たるものがありませんでした。",
      recordedQuestion: "演劇",
    },
  ])(
    "最後のフォールバックは $label の照合対象だけを message に述べる",
    async ({ input, expectedMessage, recordedQuestion }) => {
      const recorder = capturingGapRecorder();
      const output = await searchDatasets(input, recorder, stubDeps());

      expect(output.status).toBe("unanswered");
      if (output.status !== "unanswered") return;
      expect(output.reason).toBe("other");
      expect(output.message).toBe(expectedMessage);
      expect(recorder.records).toEqual([
        { question: recordedQuestion, area: undefined, category: undefined, reason: "other" },
      ]);
    },
  );

  it("unanswered の早期 return でも、areas で明示された対象エリア外は gaps と記録に残る（Issue #70）", async () => {
    // ジャンル判定が unanswered を返しても、目的地と明示された新宿の out_of_area は
    // 落とさない。unanswered の reason は1つしか運べないため、理由が覆っていない
    // 構造化欠損は unanswered 側の gaps に載せる
    const recorder = capturingGapRecorder();
    const output = await searchDatasets({ query: "", interests: ["ラーメン"], areas: ["上野", "新宿"] }, recorder, stubDeps());

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
    const output = await searchDatasets({ query: "美術館を回りたい", areas: ["新宿", "池袋"] }, recorder, stubDeps());

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
      stubDeps(),
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
    const etiquetteOutput = await searchDatasets({ query: "マナーを知りたい", areas: ["浅草", "新宿"] }, etiquette, stubDeps());
    expect(etiquetteOutput.status).toBe("unanswered");
    if (etiquetteOutput.status !== "unanswered") return;
    expect(etiquetteOutput.reason).toBe("data_not_published");
    expect(etiquetteOutput.gaps?.[0].area).toBe("新宿");
    expect(etiquette.records).toEqual([
      { question: "マナーを知りたい", area: "浅草", category: undefined, reason: "data_not_published" },
      { question: "マナーを知りたい", area: "新宿", category: undefined, reason: "out_of_area" },
    ]);

    const shibuya = capturingGapRecorder();
    const shibuyaOutput = await searchDatasets({ query: "美術館を見たい", areas: ["渋谷", "新宿"] }, shibuya, stubDeps());
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
    const output = await searchDatasets({ query: "", interests: ["ラーメン"], areas: ["上野", "渋谷"] }, recorder, stubDeps());

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
    const output = await searchDatasets({ query: "", interests: ["ナイトライフ", "ラーメン"] }, recorder, stubDeps());

    expect(output.status).toBe("unanswered");
    if (output.status !== "unanswered") return;
    expect(output.reason).toBe("insufficient_granularity");
    expect(Object.hasOwn(output, "gaps")).toBe(false);
    expect(recorder.records).toEqual([
      { question: "ナイトライフ、ラーメン", area: undefined, category: undefined, reason: "insufficient_granularity" },
    ]);
  });

  /**
   * 興味カバレッジ優先の選定（Issue #84）。
   *
   * 同点の解決は `no` 昇順（カタログ登録順）で、関連度と無関係な基準。上から `limit` 件で
   * 切ると、あとから足したデータセットほど構造的に落ちる。落ちた結果その興味が
   * 「返した候補のキーワードに当たらない」となり、**カタログに実在する答えを
   * 「答えられなかった」と見せていた**（Issue #84 の実測）。
   *
   * ここで固定するのは「まだ覆えていない興味に1枠ずつ先に充てる」挙動と、それが
   * **欠損を消す方向には効かない**こと（一致先がそもそも無い興味は従来どおり報告する）。
   */
  describe("同点で切り捨てられる興味の一致先を先に確保する", () => {
    it("「すべて」（4興味・limit 4）で、自然の唯一の一致先が落ちない", async () => {
      // あなたへ画面の「すべて」。実測（2026-08-19）では6件が score=1 の同点になり、
      // 旧実装は no 昇順の上位4件（名所・史跡／文化観光施設／文化財一覧／トイレ情報）を返して
      // no:10 都市公園・都立公園一覧（自然の唯一の一致先）を毎回落としていた
      const recorder = capturingGapRecorder();
      // `query` は送らない。あなたへ画面（`src/features/foryou/buildRecommendations.ts`）は
      // 興味チップだけを送り、自由文を持たない
      const output = await searchDatasets({ interests: ["ラーメン", "文化", "家族向け", "自然"], limit: 4 }, recorder, stubDeps());

      const body = expectAnswered(output);
      expect(body.candidates.map((candidate) => candidate.title)).toEqual([
        "名所・史跡",
        "文化観光施設",
        "トイレ情報",
        "都市公園・都立公園一覧",
      ]);
      // 「自然」の other 欠損は出ない。残るのはラーメンの粒度不足だけ（実在しないデータの欠損）
      expect(body.gaps).toHaveLength(1);
      expect(body.gaps?.[0].reason).toBe("insufficient_granularity");
      expect(recorder.records).toEqual([
        { question: "ラーメン、文化、家族向け、自然", area: undefined, category: undefined, reason: "insufficient_granularity" },
      ]);
    });

    it("確保した枠は「入れるかどうか」にだけ効かせ、並びはスコア順のまま", async () => {
      // 「美術館」で文化観光施設・文化財一覧が score 2、候補に残る他の3件（名所・史跡／
      // 銭湯／都市公園）が score 1。limit 2 では自然のために score 1 の都市公園を確保するが、
      // 返す順序は score 降順のまま
      const output = await searchDatasets(
        { query: "美術館", interests: ["文化", "自然"], limit: 2 },
        capturingGapRecorder(),
      stubDeps(),
    );

      expect(expectAnswered(output).candidates.map((candidate) => candidate.title)).toEqual([
        "文化観光施設",
        "都市公園・都立公園一覧",
      ]);
    });

    it("一致先がカタログに無い興味は、従来どおり欠損として報告する（枠を作って隠さない）", async () => {
      const recorder = capturingGapRecorder();
      const output = await searchDatasets(
        { query: "", interests: ["文化", "家族向け", "自然", "ショッピング"], limit: 4 },
        recorder,
      stubDeps(),
    );

      const body = expectAnswered(output);
      expect(body.gaps).toHaveLength(1);
      expect(body.gaps?.[0].reason).toBe("other");
      expect(body.gaps?.[0].message).toContain("ショッピング");
      expect(recorder.records).toEqual([
        { question: "文化、家族向け、自然、ショッピング", area: undefined, category: undefined, reason: "other" },
      ]);
    });

    it("エリアで絞り込んだ外にしか一致先が無い興味も、従来どおり欠損として報告する", async () => {
      // 都市公園は渋谷収録なので、上野で絞ると枠を確保しようがない。
      // カバレッジ優先はエリアの絞り込みを迂回しない
      const recorder = capturingGapRecorder();
      const output = await searchDatasets(
        { query: "上野の美術館", interests: ["文化", "自然"], limit: 2 },
        recorder,
      stubDeps(),
    );

      const body = expectAnswered(output);
      expect(body.candidates.map((candidate) => candidate.title)).toEqual(["文化観光施設", "文化財一覧"]);
      expect(body.gaps).toHaveLength(1);
      expect(body.gaps?.[0].message).toContain("自然");
      expect(recorder.records).toHaveLength(1);
    });

    it("より強い分類で報告済みの興味には枠を使わない（マナーはキーワードに当たっても確保しない）", async () => {
      // 「公園でのマナー」は no:10 都市公園のキーワード「公園」に当たるが、欠損としては
      // マナーの data_not_published が総括して報告する。ここで枠を使うと、報告の
      // 役に立たないまま関連度の高い候補を1件押し出すことになる。
      //
      // **押し出しが起きるケースを選ぶこと。** `reportableInterests` を選定側に通さない変異は
      // ［文化観光施設／都市公園］を返すので、候補リストの assert だけが判別の手段になる
      // （gaps はどちらの実装でも data_not_published 1件で区別がつかない）
      const output = await searchDatasets(
        { query: "美術館", interests: ["公園でのマナー"], limit: 2 },
        capturingGapRecorder(),
      stubDeps(),
    );

      const body = expectAnswered(output);
      // 枠を使わないので、候補はスコア順の上位2件そのまま
      expect(body.candidates.map((candidate) => candidate.title)).toEqual(["文化観光施設", "文化財一覧"]);
      expect(body.gaps).toHaveLength(1);
      expect(body.gaps?.[0].reason).toBe("data_not_published");
    });

    it("1件で複数の興味を覆える候補には、枠を1つしか使わない", async () => {
      // 名所・史跡は「観光」と「文化」の両方のキーワードを持つ。興味ごとに1枠ずつ取ると
      // 2枠を消費して「自然」が押し出されるが、覆えた興味を差し引けば1枠で済む。
      // この判定を落とすと limit の小さい呼び出しで Issue #84 と同型の症状が戻る
      const recorder = capturingGapRecorder();
      const output = await searchDatasets({ interests: ["観光", "文化", "自然"], limit: 2 }, recorder, stubDeps());

      const body = expectAnswered(output);
      expect(body.candidates.map((candidate) => candidate.title)).toEqual([
        "名所・史跡",
        "都市公園・都立公園一覧",
      ]);
      expect(body.gaps).toBeUndefined();
      expect(recorder.records).toEqual([]);
    });

    it("枠が足りなければ、一致先があっても従来どおり欠損として報告する（カバレッジ優先は欠損隠しに転じない）", async () => {
      // 独立した一致先を持つ興味が3件・枠は2つ。「自然」の一致先（no:10 都市公園）は
      // 候補集合の中に居るが、枠が尽きるので入らない — **その事実は欠損として必ず残る**。
      // `limit` は上限10・`interests` は最大20件（API.md §3.1）なので、
      // 「報告対象の興味 > limit」は仕様上ふつうに起きる入力
      const recorder = capturingGapRecorder();
      const output = await searchDatasets({ interests: ["観光", "家族向け", "自然"], limit: 2 }, recorder, stubDeps());

      const body = expectAnswered(output);
      expect(body.candidates.map((candidate) => candidate.title)).toEqual(["名所・史跡", "トイレ情報"]);
      expect(body.gaps).toHaveLength(1);
      expect(body.gaps?.[0].message).toContain("自然");
      expect(recorder.records).toEqual([
        { question: "観光、家族向け、自然", area: undefined, category: undefined, reason: "other" },
      ]);
    });

    it("interests を送っても、切り捨てが枠の確保と衝突しなければ候補は従来どおり", async () => {
      // 切り捨ては起きる（usable 4件 > limit 2）が、「文化」の一致先はスコア最上位なので
      // 確保しても並びも中身も変わらない。カバレッジ優先が「切り捨てが起きたら必ず結果を
      // 変える」ものではないことを固定する
      const output = await searchDatasets(
        { query: "上野の美術館", interests: ["文化"], limit: 2 },
        capturingGapRecorder(),
      stubDeps(),
    );

      expect(expectAnswered(output).candidates.map((candidate) => candidate.title)).toEqual([
        "文化観光施設",
        "文化財一覧",
      ]);
    });

    it("出荷設定（あなたへ画面の「すべて」・limit 6）では切り捨てが起きず、6件すべて返る", async () => {
      // `RECOMMENDATION_LIMIT`（`src/features/foryou/constants.ts`）は 6。同点6件が枠に収まる
      // ため `selectWithInterestCoverage` は早期 return で返り、**枠の確保は動かない**。
      // 現行の出荷設定を支えているのは PR #82 の 4→6 であって本 PR の選定ではない、という
      // 事実をここで固定する（4 に戻したときの挙動は上の limit 4 のテストが持つ）
      const recorder = capturingGapRecorder();
      const output = await searchDatasets({ interests: ["ラーメン", "文化", "家族向け", "自然"], limit: 6 }, recorder, stubDeps());

      const body = expectAnswered(output);
      expect(body.candidates.map((candidate) => candidate.title)).toEqual([
        "名所・史跡",
        "文化観光施設",
        "文化財一覧",
        "トイレ情報",
        "銭湯",
        "都市公園・都立公園一覧",
      ]);
      expect(body.gaps).toHaveLength(1);
      expect(body.gaps?.[0].reason).toBe("insufficient_granularity");
    });

    it("枠の確保はエリアの取り落ち（Issue #52）を消さない", async () => {
      // 枠の確保で `selected` が変わると、返した候補が収録するエリアも変わりうる。
      // 上野で絞った候補はどれも渋谷を収録していないので、渋谷の取り落ちは枠の確保に
      // 関係なく残る。**いまのカタログでは上野・浅草の8件が同じ areas を持つため
      // 偶然そうなっている**面もあり、11件目（上野と渋谷の両方を収録するもの）が
      // 入ったときに気づけるようここで固定する
      const recorder = capturingGapRecorder();
      const output = await searchDatasets({ areas: ["上野", "渋谷"], interests: ["観光", "家族向け"], limit: 2 }, recorder, stubDeps());

      const body = expectAnswered(output);
      expect(body.candidates.map((candidate) => candidate.title)).toEqual(["名所・史跡", "トイレ情報"]);
      expect(body.gaps).toHaveLength(1);
      expect(body.gaps?.[0].area).toBe("渋谷");
      expect(recorder.records).toEqual([
        { question: "観光、家族向け", area: "渋谷", category: undefined, reason: "other" },
      ]);
    });

    it("【既知の限界】部分一致の偽陽性を能動的に拾い、スコアの高い候補を押し出して欠損まで消す", async () => {
      // `interestCovered` は部分一致でしかないので、興味「緑茶」は都市公園のキーワード
      // 「緑」に当たる。旧実装ではこの誤マッチが効くのは「たまたま枠内に居たとき」だけ
      // だったが、いまは探しに行って枠に座らせる —
      //   旧: [文化観光施設(score 2), 文化財一覧(score 2)] ＋「緑茶」の取り落ち
      //   新: [文化観光施設(2), 都市公園(1)]              ＋ 欠損なし
      // score 2 が score 1 に押し出され、報告されていた欠損が消える。
      //
      // **バグではなく、述語を共有したことの帰結**（選定と報告が同じ盲点を持つ）。
      // 直すには興味の語を分解する必要があり、それは Step 5 の LLM 側の仕事で、
      // スタブに形態素解析を持ち込まない（絶対ルール #1）。ここで固定するのは
      // 「気づかないうちに挙動が変わらないようにする」ため
      const recorder = capturingGapRecorder();
      const output = await searchDatasets({ query: "美術館", interests: ["文化", "緑茶"], limit: 2 }, recorder, stubDeps());

      const body = expectAnswered(output);
      expect(body.candidates.map((candidate) => candidate.title)).toEqual([
        "文化観光施設",
        "都市公園・都立公園一覧",
      ]);
      expect(body.gaps).toBeUndefined();
      expect(recorder.records).toEqual([]);
    });
  });
});
