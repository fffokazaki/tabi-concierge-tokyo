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
 * キーワード経路で `answered` になり、答えていない興味は残らない（Issue #53・未修正）。
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

  it("出発地として書かれた代表エリアも欠損として報告する（過検知の側に倒す）", async () => {
    // 「渋谷から上野の美術館へ」の渋谷は出発地かもしれないが、渋谷は POC の対象エリアなので
    // 「渋谷のデータも欲しい」の可能性が残る。対象エリア外の新宿（そもそも答えられない）とは
    // 事情が違うため、Issue #29 と逆に過検知の側へ倒す。区別には質問文を構造化して受ける
    // 入口が要るので Issue #58 に分けた。倒す向きを明示するためにテストで固定しておく
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
