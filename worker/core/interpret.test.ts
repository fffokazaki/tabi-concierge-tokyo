import { describe, expect, it, vi } from "vitest";
import type { SearchDatasetsOutput } from "../../shared/core";
import { capturingGapRecorder, expectAnswered, stubDeps } from "../test-support";
import type { CoreDeps, LlmClient, LlmRequest } from "./llm";
import { searchDatasets } from "./operations";

/**
 * メタデータRAG（[Issue #120](https://github.com/fffokazaki/tabi-concierge-tokyo/issues/120)）。
 *
 * 入口は `searchDatasets`（公開関数）。**「分解するかどうかの判断」と「失敗したときの縮退」が
 * この Issue の中身**なので、`interpretQuery` を直接叩くと肝心なところを検証できない。
 */

function scriptedLlm(...responses: (string | Error)[]): LlmClient & { readonly asked: LlmRequest[] } {
  const asked: LlmRequest[] = [];
  let index = 0;
  return {
    asked,
    async complete(request) {
      asked.push(request);
      const next = responses[Math.min(index++, responses.length - 1)];
      if (next === undefined) return { ok: false, cause: new Error("応答が尽きました") };
      return next instanceof Error ? { ok: false, cause: next } : { ok: true, text: next };
    },
  };
}

const depsWith = (llm: LlmClient): CoreDeps => ({ ...stubDeps(), llm });

const search = (input: Parameters<typeof searchDatasets>[0], deps: CoreDeps): Promise<SearchDatasetsOutput> =>
  searchDatasets(input, capturingGapRecorder(), deps);

const MEISHO_ID = "t131067d0000000251";

describe("いつ LLM を呼ぶか", () => {
  it("構造化入力があれば呼ばない（呼び出し側の一次情報のほうが強い）", async () => {
    // ADR-011。呼ぶ必要が無いのに呼ぶと、無料枠とレイテンシを使ったうえで結果を捨てる
    const llm = scriptedLlm('{"areas":["浅草"],"interests":["トイレ"],"rankedDatasetIds":[]}');

    await search({ query: "上野の寺社をめぐりたい", interests: ["寺社"] }, depsWith(llm));

    expect(llm.asked).toHaveLength(0);
  });

  it("自然文しか無ければ呼ぶ", async () => {
    const llm = scriptedLlm('{"areas":["上野"],"interests":["寺社"],"rankedDatasetIds":[]}');

    await search({ query: "上野の寺社をめぐりたい" }, depsWith(llm));

    expect(llm.asked).toHaveLength(1);
    expect(llm.asked[0]!.purpose).toBe("search_interpret");
    // カタログ10件をプロンプトに同梱している（Vectorize 不採用の方式）
    expect(llm.asked[0]!.user).toContain(MEISHO_ID);
  });

  it("質問文が空なら呼ばない", async () => {
    const llm = scriptedLlm("{}");
    await search({ query: "", areas: ["上野"] }, depsWith(llm));
    expect(llm.asked).toHaveLength(0);
  });
});

describe("分解の結果を既存の判定へ渡す", () => {
  it("**自然文だけの呼び出しでも、答えられなかった興味を欠損として報告できる**", async () => {
    // これが本 Issue の中核。構造化入力（`interests`）を送らない呼び出しでは、
    // キーワードが1件でも当たれば `answered` になり、答えていない興味は応答のどこにも
    // 残らなかった（Issue #53 の doc に記録されている既知の限界）。
    //
    // **「ナイトライフ」を使うのは意図的である。** 「ラーメン」のようなジャンル語だと、
    // 質問文から拾う既存経路（`collectPartialGaps`・Issue #29）が LLM 抜きでも欠損を出すため、
    // 分解が効いているかを判定できない（実際、最初に書いたテストはそれで無条件に通っていた）。
    // ナイトライフは `interests` として渡らない限り報告されないので、この経路だけを見る
    const query = "上野の寺社とナイトライフを楽しみたい";

    const withoutLlm = expectAnswered(await search({ query }, stubDeps()));
    expect(withoutLlm.gaps, "前提が崩れている: 分解なしでも欠損が出ている").toBeUndefined();

    const llm = scriptedLlm(`{"areas":["上野"],"interests":["寺社","ナイトライフ"],"rankedDatasetIds":[]}`);
    const answered = expectAnswered(await search({ query }, depsWith(llm)));

    expect(answered.gaps, "分解した興味の取り落としが報告されていない").toBeDefined();
    expect(answered.gaps!.map((gap) => gap.message).join()).toContain("ナイトライフ");
  });

  it("利用者が送った構造化入力を上書きしない", async () => {
    // 「呼ばない」判断が効くので実際には到達しないが、`withInterpretation` の性質として固定する
    const llm = scriptedLlm('{"areas":["渋谷"],"interests":["ナイトライフ"],"rankedDatasetIds":[]}');

    const output = await search({ query: "上野", areas: ["上野"] }, depsWith(llm));

    expect(expectAnswered(output).candidates.length).toBeGreaterThan(0);
    expect(llm.asked).toHaveLength(0);
  });

  it("同点の並びに関連度の順位が効く（従来は登録順だけだった）", async () => {
    // 「文化、家族向け、自然」は複数のデータセットが同点になる既知の入力
    // （`operations.test.ts` の TIED_QUERY）。従来この同点は登録順（`no` 昇順）で
    // 解決されており、**関連度とは無関係**だった（CLAUDE.md の注記）。
    // LLM の順位を第2キーに入れて、そこを埋める
    const TIED_QUERY = "文化、家族向け、自然";
    const baseline = expectAnswered(await search({ query: TIED_QUERY, limit: 2 }, stubDeps()));
    // 縮退経路（＝従来の並び）で2位までに入らないものを、LLM が1位に推す
    const all = expectAnswered(await search({ query: TIED_QUERY, limit: 10 }, stubDeps()));
    const demoted = all.candidates.find(
      (candidate) => !baseline.candidates.some((top) => top.datasetId === candidate.datasetId),
    )!;
    expect(demoted, "同点で切り捨てられる候補が見つからない").toBeDefined();

    const llm = scriptedLlm(`{"areas":[],"interests":[],"rankedDatasetIds":["${demoted.datasetId}"]}`);
    const answered = expectAnswered(await search({ query: TIED_QUERY, limit: 2 }, depsWith(llm)));

    expect(
      answered.candidates.map((candidate) => candidate.datasetId),
      "LLM が1位に推した候補が枠に入っていない",
    ).toContain(demoted.datasetId);
  });

  it("matchReason は LLM に書かせない（カタログの実測文字列を使う）", async () => {
    const llm = scriptedLlm(
      `{"areas":["上野"],"interests":["寺社"],"rankedDatasetIds":["${MEISHO_ID}"],"matchReason":"LLM が書いた説明"}`,
    );

    const answered = expectAnswered(await search({ query: "上野の寺社をめぐりたい" }, depsWith(llm)));

    for (const candidate of answered.candidates) {
      expect(candidate.matchReason).not.toContain("LLM が書いた説明");
      expect(candidate.matchReason.length).toBeGreaterThan(0);
    }
  });
});

describe("対象エリア外の地名", () => {
  it("**目的地として訊かれた対象外エリアを欠損として拾う**", async () => {
    // `areas` の契約はもともと「代表エリア以外の要素は目的地と明示されたエリア外として扱い、
    // `out_of_area` の欠損として応答に添える」。対象外かどうかの判定は `resolveArea` が持ち、
    // LLM の仕事ではない。ここで捨てると「新宿を訊かれた」がどこにも残らず、
    // DOMAIN.md §7 のデータ公開リクエストへ還元できない
    const llm = scriptedLlm('{"areas":["上野","新宿"],"interests":["観光"],"rankedDatasetIds":[]}');
    const recorder = capturingGapRecorder();

    const output = await searchDatasets({ query: "上野と新宿を回りたい" }, recorder, depsWith(llm));

    const answered = expectAnswered(output);
    expect(answered.gaps?.map((gap) => `${gap.reason}:${gap.area}`)).toContain("out_of_area:新宿");
    expect(recorder.records.map((record) => `${record.reason}:${record.area}`)).toContain("out_of_area:新宿");
  });

  it("対象外を落とすと欠損も消える（プロンプトが落とさせてはいけない理由）", async () => {
    // 上のテストと対で、**何を守っているか**を示す。プロンプトを「対象エリアだけ返せ」に
    // 戻すとこちらの形になり、訊かれた事実が消える
    const llm = scriptedLlm('{"areas":["上野"],"interests":["観光"],"rankedDatasetIds":[]}');
    const recorder = capturingGapRecorder();

    await searchDatasets({ query: "上野と新宿を回りたい" }, recorder, depsWith(llm));

    expect(recorder.records.map((record) => record.area)).not.toContain("新宿");
  });
});

describe("出発地の扱い（モデルの追従に依存する既知のリスク）", () => {
  it("出発地を areas に入れられると、答えられたはずの問いが unanswered になる", async () => {
    // **これは守れていないことを固定するテストである。** プロンプトで「出発地は入れない」と
    // 指示し、具体例も添えてあるが、従うかはモデル次第。従わなかったときに何が起きるかを
    // 見えるようにしておく。
    //
    // `resolveArea` は `areas[0]` を主エリアに採るので、出発地が先頭に来ると
    // そのエリアの判定（渋谷なら観光データ未公開）が働き、**候補がゼロになる**。
    // 実モデルで一度この形を踏み、プロンプトに例を足して解消した（Issue #120）
    const query = "渋谷から上野の美術館へ行きたい";
    const misread = scriptedLlm('{"areas":["渋谷","上野"],"interests":["美術館"],"rankedDatasetIds":[]}');
    const correct = scriptedLlm('{"areas":["上野"],"interests":["美術館"],"rankedDatasetIds":[]}');

    const withMisread = await search({ query }, depsWith(misread));
    const withCorrect = await search({ query }, depsWith(correct));

    expect(withMisread.status, "出発地を入れられると候補が消える").toBe("unanswered");
    expect(expectAnswered(withCorrect).candidates.length).toBeGreaterThan(0);
  });

  it("目的地が2つある場合は両方を欠損の判定に使う", async () => {
    // 「AからBへ」ではなく「AとBを回る」なら、両方が目的地。
    // 対象外が混ざっていても落とさない（上の out_of_area のテストと対）
    const llm = scriptedLlm('{"areas":["浅草","渋谷"],"interests":["買い物"],"rankedDatasetIds":[]}');

    const output = await search({ query: "浅草から渋谷へ移動して買い物したい" }, depsWith(llm));

    expect(output.status === "answered" || output.status === "unanswered").toBe(true);
    expect((output.gaps ?? []).length, "2つ目の目的地が欠損として残っていない").toBeGreaterThan(0);
  });
});

describe("記録", () => {
  it("gaps の question は利用者の言葉のままにする（LLM の読みを混ぜない）", async () => {
    // 混ぜると `gaps.question` が「訊かれたこと」ではなくなり、後から利用者の言葉と
    // 機械が足した語を区別できない（Issue #114 と同じ性質の問題）
    const llm = scriptedLlm('{"areas":["新宿"],"interests":["美術館"],"rankedDatasetIds":[]}');
    const recorder = capturingGapRecorder();

    await searchDatasets({ query: "新宿の美術館に行きたい" }, recorder, depsWith(llm));

    expect(recorder.records).toHaveLength(1);
    expect(recorder.records[0]!.question).toBe("新宿の美術館に行きたい");
    expect(recorder.records[0]!.question).not.toContain("美術館、");
  });
});

describe("縮退", () => {
  const expectDegraded = async (llm: LlmClient) => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      // 分解できなくても応答は返る（Step 5 以前と同じキーワード実装のまま進む）
      const output = await search({ query: "上野の寺社をめぐりたい" }, depsWith(llm));
      expectAnswered(output);
      // 応答が返るので、記録しないと本番で分解が死んでいても誰も気づけない
      expect(spy).toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  };

  it("**縮退時の応答は、分解を持たない実装と完全に一致する**", async () => {
    // 「Step 5 以前と同じ応答」という縮退の約束を、候補・順序・欠損まで含めて固定する。
    // `answered` であることとログだけを見ていると、候補や欠損が変わっても通ってしまう
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const query = "上野の美術館とラーメンを楽しみたい";
      const baseline = await search({ query }, stubDeps());

      for (const broken of [
        scriptedLlm(new Error("推論サービスが落ちている")),
        scriptedLlm("申し訳ありませんが、お答えできません。"),
        scriptedLlm('{"areas":["上野"],"interests":["寺'),
        scriptedLlm("{}"),
      ]) {
        expect(await search({ query }, depsWith(broken))).toEqual(baseline);
      }
    } finally {
      spy.mockRestore();
    }
  });

  it("LLM の障害では縮退し、握りつぶさず記録する", async () => {
    await expectDegraded(scriptedLlm(new Error("推論サービスが落ちている")));
  });

  it("JSON として読めない出力でも縮退する", async () => {
    await expectDegraded(scriptedLlm("申し訳ありませんが、お答えできません。"));
  });

  it("JSON が途中で切れていても縮退する", async () => {
    await expectDegraded(scriptedLlm('{"areas":["上野"],"interests":["寺'));
  });

  it.each([
    ["空のオブジェクト", "{}"],
    ["areas が配列でない", '{"areas":"上野","interests":[],"rankedDatasetIds":[]}'],
    ["interests が欠けている", '{"areas":[],"rankedDatasetIds":[]}'],
    ["rankedDatasetIds が null", '{"areas":[],"interests":[],"rankedDatasetIds":null}'],
  ])("形式違反（%s）も縮退として扱う", async (_label, text) => {
    // ここを「読めたぶんだけ使う」に緩めると、分解が何も起きていないのに縮退のログも
    // 残らない。**LLM 経路が壊れていても「キーワード実装と同じ応答が返るだけ」に見える**
    await expectDegraded(scriptedLlm(text));
  });

  it("すべて空配列は正常（形式違反と区別する）", async () => {
    // 「読み取れる地名も興味も無かった」は正しい結果であって、失敗ではない
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const llm = scriptedLlm('{"areas":[],"interests":[],"rankedDatasetIds":[]}');
      expectAnswered(await search({ query: "上野の寺社をめぐりたい" }, depsWith(llm)));
      expect(spy, "空配列を失敗として扱っている").not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  it("ハルシネーションした ID を見えるようにする", async () => {
    // **候補は CATALOG から作られるので、偽の ID はそもそも候補になれない。**
    // ここで確かめているのは安全性ではなく可視性で、記録が無いとプロンプトの劣化に
    // 気づけない（それがこの分岐の存在理由である）
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const llm = scriptedLlm(
        `{"areas":["上野"],"interests":["寺社"],"rankedDatasetIds":["存在しないID","${MEISHO_ID}"]}`,
      );

      const answered = expectAnswered(await search({ query: "上野の寺社をめぐりたい" }, depsWith(llm)));

      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0]?.[1]).toMatchObject({ id: "存在しないID" });
      // 念のため（候補になれないことの確認。ここが破れたら設計が変わったということ）
      expect(answered.candidates.map((candidate) => candidate.datasetId)).not.toContain("存在しないID");
    } finally {
      warn.mockRestore();
    }
  });
});
