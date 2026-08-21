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

  it("LLM の障害では縮退し、握りつぶさず記録する", async () => {
    await expectDegraded(scriptedLlm(new Error("推論サービスが落ちている")));
  });

  it("JSON として読めない出力でも縮退する", async () => {
    await expectDegraded(scriptedLlm("申し訳ありませんが、お答えできません。"));
  });

  it("JSON が途中で切れていても縮退する", async () => {
    await expectDegraded(scriptedLlm('{"areas":["上野"],"interests":["寺'));
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
