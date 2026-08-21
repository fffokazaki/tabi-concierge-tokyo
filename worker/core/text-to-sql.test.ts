import { env } from "cloudflare:workers";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { AggregateDatasetOutput } from "../../shared/core";
import { applyMigrations, capturingGapRecorder, clearGaps, expectAnswered, expectUnanswered } from "../test-support";
import { RESTAURANT_DATASET_ID, STATISTICS_DATASET_ID } from "./catalog";
import { d1SqlExecutor, type CoreDeps, type LlmClient, type LlmRequest } from "./llm";
import { aggregateDataset } from "./operations";
import { MAX_SQL_ATTEMPTS } from "./text-to-sql";

/**
 * `aggregate_dataset` の D1 実照会（[Issue #119](https://github.com/fffokazaki/tabi-concierge-tokyo/issues/119)）。
 *
 * **入口は `aggregateDataset`（公開関数）にしてある。** 内部関数を直接叩くと、
 * 前段ガード → 実照会 → 縮退 → 記録 という**順序そのもの**を検証できない。
 * このファイルが守っているのは主にその順序である。
 */

const MEISHO_ID = "t131067d0000000251"; // 名所・史跡（台東区・45行）

/** 何を訊かれたかを記録し、決めておいた応答を順に返す LLM。 */
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

/** 実 D1 を引く一式。SQL の実行だけは本物にしないと、封じ込めの検証にならない。 */
const depsWith = (llm: LlmClient): CoreDeps => ({ llm, sql: d1SqlExecutor(env.DB) });

/** 生成 SQL が返しうる、実在の形をした行。 */
const SELECT_ALL = `SELECT dataset_id, name, address, note FROM spots WHERE dataset_id = '${MEISHO_ID}'`;

const seed = async (rows: { name: string; area: string | null; address?: string; note?: string }[]) => {
  await env.DB.prepare(
    "INSERT OR IGNORE INTO datasets (id, no, title, publisher, license, catalog_url, resource_url, retrieved_at, update_frequency, row_count, has_spots) VALUES (?, 1, '名所・史跡', '台東区', 'CC BY 4.0', 'https://example.com', 'https://example.com/x.csv', '2026-08-16', '不定期', 45, 1)",
  )
    .bind(MEISHO_ID)
    .run();
  await env.DB.prepare("DELETE FROM spots").run();
  for (const [i, row] of rows.entries()) {
    await env.DB.prepare(
      "INSERT INTO spots (dataset_id, name, category, area, address, note, source_row) VALUES (?, ?, '名所・史跡', ?, ?, ?, ?)",
    )
      .bind(MEISHO_ID, row.name, row.area, row.address ?? null, row.note ?? "", i + 1)
      .run();
  }
};

const aggregate = (datasetId: string, intent: string, deps: CoreDeps): Promise<AggregateDatasetOutput> =>
  aggregateDataset({ datasetId, intent }, capturingGapRecorder(), deps);

beforeAll(applyMigrations);
beforeEach(clearGaps);

describe("前段ガードは D1 を引く前に確定する", () => {
  // **`stubDeps()` では何も証明できない。** 縮退経路は元々ガードを通るので、
  // ガードが LLM より手前にあることを確かめるには「LLM が行を返せる状態」で叩く必要がある

  it("ラーメン × 飲食店は insufficient_granularity のまま（LLM が答えられる状態でも）", async () => {
    // 実データ検証済みの誠実な「答えられない」（DATABASE.md「既知のデータ欠損」）。
    // ここが LLM 経路で「それらしい行」に置き換わると、本プロジェクトの中心設計が壊れる
    await seed([{ name: "どこかのラーメン店", area: "上野" }]);
    const llm = scriptedLlm(SELECT_ALL);

    const output = await aggregate(RESTAURANT_DATASET_ID, "上野のラーメン屋を1件", depsWith(llm));

    expect(expectUnanswered(output).reason).toBe("insufficient_granularity");
    expect(llm.asked, "ガードより先に LLM を呼んでいる").toHaveLength(0);
  });

  it.each([
    ["未知のデータセットID", "存在しないID", "寺社を1件", "other"],
    ["統計表", STATISTICS_DATASET_ID, "行動特性を1件", "insufficient_granularity"],
    ["対象エリア外", MEISHO_ID, "新宿の寺社を1件", "out_of_area"],
  ] as const)("%s は %s のまま", async (_label, datasetId, intent, reason) => {
    await seed([{ name: "何か", area: "上野" }]);
    const llm = scriptedLlm(SELECT_ALL);

    const output = await aggregate(datasetId, intent, depsWith(llm));

    expect(expectUnanswered(output).reason).toBe(reason);
    expect(llm.asked, "ガードより先に LLM を呼んでいる").toHaveLength(0);
  });
});

describe("実照会", () => {
  it("D1 の実データから1件を返し、query に実行した SQL を書く", async () => {
    await seed([{ name: "寛永寺", area: "上野", address: "上野桜木1丁目14番" }]);
    const llm = scriptedLlm(SELECT_ALL);

    const answered = expectAnswered(await aggregate(MEISHO_ID, "上野の寺社を1件", depsWith(llm)));

    expect(answered.result.name).toBe("寛永寺");
    expect(answered.result.summary).toContain("所在地は上野桜木1丁目14番。");
    // 出典の再現に要る（API.md §4）。スタブの「固定データ抽出」ではなくなったことも示す
    expect(answered.query).toContain("D1 実照会");
    expect(answered.query).toContain("FROM spots");
  });

  it("```sql``` で囲まれていても取り出せる", async () => {
    await seed([{ name: "寛永寺", area: "上野" }]);
    const llm = scriptedLlm("```sql\n" + SELECT_ALL + "\n```");

    expect(expectAnswered(await aggregate(MEISHO_ID, "上野の寺社を1件", depsWith(llm))).result.name).toBe("寛永寺");
  });

  it("材料が無い列は書かずに短く畳む（推測で埋めない）", async () => {
    // address が NULL のときに「所在地は不明」のような一文を足すと、データに無いことを
    // 述べたことになる。短くなるだけでよい
    await seed([{ name: "名前だけの行", area: "上野" }]);
    const llm = scriptedLlm(SELECT_ALL);

    const answered = expectAnswered(await aggregate(MEISHO_ID, "上野の寺社を1件", depsWith(llm)));

    expect(answered.result.summary).not.toContain("所在地");
    expect(answered.result.summary).toContain("台東区が名所・史跡として公開している45件のうちの1件。");
  });
});

describe("0行は障害ではなく答え", () => {
  it("other として返し、断定しない述語を使う", async () => {
    await seed([{ name: "寛永寺", area: "上野" }]);
    const llm = scriptedLlm(`${SELECT_ALL} AND area = '浅草'`);

    const unansweredOutput = expectUnanswered(await aggregate(MEISHO_ID, "浅草の寺社を1件", depsWith(llm)));

    // data_not_published は「存在しないと確かめられた」場合の最も強い主張。
    // 0行が示すのは「生成された WHERE 句に当たらなかった」ことだけなので使えない
    expect(unansweredOutput.reason).toBe("other");
    expect(unansweredOutput.message).toContain("見つかりませんでした");
    expect(unansweredOutput.message).not.toContain("収録していません");
  });

  it("gaps に記録される（データ公開リクエストへ還元するため）", async () => {
    await seed([{ name: "寛永寺", area: "上野" }]);
    const recorder = capturingGapRecorder();

    await aggregateDataset(
      { datasetId: MEISHO_ID, intent: "浅草の寺社を1件" },
      recorder,
      depsWith(scriptedLlm(`${SELECT_ALL} AND area = '浅草'`)),
    );

    expect(recorder.records).toHaveLength(1);
    expect(recorder.records[0]).toMatchObject({ reason: "other", question: "浅草の寺社を1件" });
  });
});

describe("縮退（インフラ障害・出力不正）", () => {
  const expectFallback = (output: AggregateDatasetOutput) => {
    const answered = expectAnswered(output);
    // 縮退先は Step 5 以前の実装そのもの。「固定データ抽出（スタブ）」がその印
    expect(answered.query).toContain("固定データ抽出（スタブ）");
    return answered;
  };

  it("LLM の障害では即座に縮退し、握りつぶさず記録する", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await seed([{ name: "寛永寺", area: "上野" }]);
      const llm = scriptedLlm(new Error("推論サービスが落ちている"));

      expectFallback(await aggregate(MEISHO_ID, "上野の寺社を1件", depsWith(llm)));

      // 縮退は応答を返すので、記録しないと本番で LLM 経路が死んでいても誰も気づけない
      expect(spy).toHaveBeenCalled();
      expect(llm.asked, "障害はリトライしても同じなので繰り返さない").toHaveLength(1);
    } finally {
      spy.mockRestore();
    }
  });

  it("危険な SQL は実行せず、理由を添えて書き直させる", async () => {
    await seed([{ name: "寛永寺", area: "上野" }]);
    const llm = scriptedLlm(`${SELECT_ALL}; DELETE FROM spots`, SELECT_ALL);

    expect(expectAnswered(await aggregate(MEISHO_ID, "上野の寺社を1件", depsWith(llm))).result.name).toBe("寛永寺");
    // 1回目の拒否理由がプロンプトに入っていること（入らないと同じ SQL を書き直してくる）
    expect(llm.asked).toHaveLength(2);
    expect(llm.asked[1]!.user).toContain("複数の文");
    // **行が消えていない** ＝ 危険な SQL が実行されなかったことの実測
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM spots").first<{ n: number }>())?.n).toBe(1);
  });

  it("上限まで書き直しても直らなければ縮退する", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      await seed([{ name: "寛永寺", area: "上野" }]);
      const llm = scriptedLlm("DELETE FROM spots");

      expectFallback(await aggregate(MEISHO_ID, "上野の寺社を1件", depsWith(llm)));

      expect(llm.asked).toHaveLength(MAX_SQL_ATTEMPTS);
      expect(spy).toHaveBeenCalled();
    } finally {
      spy.mockRestore();
      warn.mockRestore();
    }
  });

  it("**別データセットの行が返ったら縮退する（生成 SQL では偽装できない検証）**", async () => {
    // `WHERE dataset_id = '...'` が SQL 文字列にあるかを見る検査は
    // `WHERE dataset_id = 'X' OR 1=1` で抜けられる。実際に返った行を見るほうが偽装できない。
    // 別データセットの行を出典つきで返すことは、**出典が本物であるぶん誤りが見つけにくい**
    // 最悪の壊れ方になる（絶対ルール #2）
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await seed([{ name: "寛永寺", area: "上野" }]);
      await env.DB.prepare(
        "INSERT OR IGNORE INTO datasets (id, no, title, publisher, license, catalog_url, resource_url, retrieved_at, update_frequency, row_count, has_spots) VALUES ('other-dataset', 99, '別のデータ', '別の区', 'CC BY 4.0', 'https://example.com', 'https://example.com/y.csv', '2026-08-16', '不定期', 1, 1)",
      ).run();
      await env.DB.prepare(
        "INSERT INTO spots (dataset_id, name, category, area, address, note, source_row) VALUES ('other-dataset', '別データの行', 'その他', '上野', NULL, '', 1)",
      ).run();

      // 構文としては通るが、`OR 1=1` で他データセットの行まで拾ってしまう SQL
      const llm = scriptedLlm(
        `SELECT dataset_id, name FROM spots WHERE dataset_id = '${MEISHO_ID}' OR 1=1 ORDER BY dataset_id`,
      );

      expectFallback(await aggregate(MEISHO_ID, "上野の寺社を1件", depsWith(llm)));
      expect(spy).toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  it("依存が例外を投げても縮退する（500 にしない）", async () => {
    // `LlmClient` / `SqlExecutor` は「throw しない」約束だが、約束は強制ではない。
    // 例外が抜けると app.onError の 500 になり、設計した縮退が働かないまま利用者に
    // エラーが返る。**縮退できる場所で 500 を出さない**
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await seed([{ name: "寛永寺", area: "上野" }]);
      const throwing: LlmClient = {
        async complete() {
          throw new Error("注入された実装が例外を投げた");
        },
      };

      expectFallback(await aggregate(MEISHO_ID, "上野の寺社を1件", depsWith(throwing)));
      expect(spy).toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  it("縮退したこと自体は gaps に記録しない（障害をデータ欠損として集計しない）", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await seed([{ name: "寛永寺", area: "上野" }]);
      const recorder = capturingGapRecorder();

      const output = await aggregateDataset(
        { datasetId: MEISHO_ID, intent: "上野の寺社を1件" },
        recorder,
        depsWith(scriptedLlm(new Error("推論サービスが落ちている"))),
      );

      // 縮退先が answered なので記録は0件。インフラ障害が
      // 「このデータが足りない」として集計へ流れ込まないことの確認
      expectAnswered(output);
      expect(recorder.records).toHaveLength(0);
    } finally {
      spy.mockRestore();
    }
  });

  it("必須の列が欠けていたら書き直させる", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      await seed([{ name: "寛永寺", area: "上野" }]);
      const llm = scriptedLlm(
        `SELECT dataset_id, address FROM spots WHERE dataset_id = '${MEISHO_ID}'`,
        SELECT_ALL,
      );

      expect(expectAnswered(await aggregate(MEISHO_ID, "上野の寺社を1件", depsWith(llm))).result.name).toBe("寛永寺");
      expect(llm.asked[1]!.user).toContain("name");
    } finally {
      warn.mockRestore();
    }
  });
});
