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

const seed = async (
  rows: { name: string; area: string | null; address?: string; note?: string; category?: string }[],
) => {
  await env.DB.prepare(
    "INSERT OR IGNORE INTO datasets (id, no, title, publisher, license, catalog_url, resource_url, retrieved_at, update_frequency, row_count, has_spots) VALUES (?, 1, '名所・史跡', '台東区', 'CC BY 4.0', 'https://example.com', 'https://example.com/x.csv', '2026-08-16', '不定期', 45, 1)",
  )
    .bind(MEISHO_ID)
    .run();
  await env.DB.prepare("DELETE FROM spots").run();
  for (const [i, row] of rows.entries()) {
    await env.DB.prepare(
      "INSERT INTO spots (dataset_id, name, category, area, address, note, source_row) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
      .bind(MEISHO_ID, row.name, row.category ?? "名所・史跡", row.area, row.address ?? null, row.note ?? "", i + 1)
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

/**
 * 説明文に載せる `note` の選別（[Issue #144](https://github.com/fffokazaki/tabi-concierge-tokyo/issues/144)）。
 *
 * ここで使う `note` は**すべて本番 D1 の実値**（2026-08-22 に全10データセットを走査して確認した）。
 * 「それらしい形」を作ってテストすると、実データに無い形だけを守ることになる。
 *
 * 本番で `note` が空でないのは6データセットで、管理用メタデータを含むのは
 * 台東区文化財一覧（`t131067d0000000393`・190行）だけだった。残る5つは営業時間・電話番号・
 * 料金・男女別といった、旅程で読みたい情報しか持たない。
 */
describe("説明文に載せる note の選別", () => {
  it("管理用メタデータの要素を落とす（最終確認日・座標精度）", async () => {
    // 台東区文化財一覧の実値。3要素目だけが管理者向けで、1・2要素目は旅程で意味を持つ
    await seed([
      {
        name: "絹本著色元三大師画像",
        area: "上野",
        address: "東京都台東区上野桜木1丁目",
        note: "美術工芸品 / 所有: 寛永寺 / 最終確認日2024-01-09・座標精度：小字・丁目代表点",
      },
    ]);
    const llm = scriptedLlm(SELECT_ALL);

    const answered = expectAnswered(await aggregate(MEISHO_ID, "上野の寺社を1件", depsWith(llm)));

    expect(answered.result.summary).not.toContain("最終確認日");
    expect(answered.result.summary).not.toContain("座標精度");
    // 落とすのは管理用の要素だけ。文化財の種別と所有者は残す
    expect(answered.result.summary).toContain("美術工芸品");
    expect(answered.result.summary).toContain("所有: 寛永寺");
  });

  it("区切りの中に「・」があっても要素ごと落とせる", async () => {
    // 「座標精度：小字・丁目代表点」の値に「・」が入る。要素の区切りは " / " だけで、
    // 「・」で分けると値の途中で切れて「小字」だけが残る
    await seed([
      { name: "旧吉田屋酒店", area: "上野", note: "建造物 / 最終確認日2024-01-09・座標精度：大字・町代表点" },
    ]);
    const llm = scriptedLlm(SELECT_ALL);

    const answered = expectAnswered(await aggregate(MEISHO_ID, "上野の寺社を1件", depsWith(llm)));

    expect(answered.result.summary).not.toContain("小字");
    expect(answered.result.summary).not.toContain("大字");
    expect(answered.result.summary).not.toContain("代表点");
    expect(answered.result.summary).toContain("建造物");
  });

  it("利用者に有用な note は残す（電話番号）", async () => {
    // 台東区文化観光施設（t131067d0000000236）の実値
    await seed([{ name: "下町風俗資料館", area: "上野", note: "TEL 03-3824-1988" }]);
    const llm = scriptedLlm(SELECT_ALL);

    expect(expectAnswered(await aggregate(MEISHO_ID, "上野の寺社を1件", depsWith(llm))).result.summary).toContain(
      "TEL 03-3824-1988",
    );
  });

  it("原本にある留保を落とさない（営業時間・定休・料金）", async () => {
    // 台東区銭湯一覧（t131067d0000000256）の実値。「定休 第2・4月、1月1日は休業」は
    // 利用者が読むべき留保であって、管理用メタデータではない
    await seed([
      { name: "曙湯", area: "浅草", note: "15:30〜23:00 / 定休 第2・4月、1月1日は休業 / 料金 500" },
    ]);
    const llm = scriptedLlm(SELECT_ALL);

    const summary = expectAnswered(await aggregate(MEISHO_ID, "浅草の銭湯を1件", depsWith(llm))).result.summary;

    expect(summary).toContain("15:30〜23:00");
    expect(summary).toContain("定休 第2・4月、1月1日は休業");
    expect(summary).toContain("料金 500");
  });

  it("要素がすべて管理用なら note ごと落とし、埋め草を足さない", async () => {
    // 本番の実データにこの形は無い（文化財一覧は必ず種別を1要素目に持つ）。
    // 落とした結果が空になったとき「情報なし」のような一文を足すと、データに無いことを
    // 述べたことになる ―― 短くなるだけでよい（「材料が無い列は書かずに短く畳む」と同じ扱い）
    await seed([
      { name: "名前だけの行", area: "上野", note: "最終確認日2024-01-09・座標精度：番地号一致" },
    ]);
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const llm = scriptedLlm(SELECT_ALL);

    const summary = expectAnswered(await aggregate(MEISHO_ID, "上野の寺社を1件", depsWith(llm))).result.summary;

    expect(summary).not.toContain("最終確認日");
    expect(summary).toBe("台東区が名所・史跡として公開している45件のうちの1件。");
    spy.mockRestore();
  });

  it("要素をすべて落としたら警告を出す（区切りの前提が崩れたことに気づける）", async () => {
    // 落とす判定は区切りが `" / "` であることに乗っている。本番の実データでは
    // `note` に `/` を含む370行すべてが空白付きの区切りだった（2026-08-22 実測）が、
    // 再取り込みで表記が変われば note 全体が1要素になり、管理用キーを1つ含むだけで
    // **有用な要素ごと消える**。応答は返るので画面からは気づけない ―― ログには出す
    await seed([
      { name: "旧吉田屋酒店", area: "上野", note: "建造物/所有: 台東区教育委員会/最終確認日2024-01-09" },
    ]);
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const llm = scriptedLlm(SELECT_ALL);

    const summary = expectAnswered(await aggregate(MEISHO_ID, "上野の寺社を1件", depsWith(llm))).result.summary;

    expect(summary).not.toContain("最終確認日");
    expect(spy).toHaveBeenCalledWith("[text-to-sql] note の要素をすべて落としました", expect.anything());
    spy.mockRestore();
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

/**
 * 生成 SQL が「この dataset_id の行に実際に入っている値」だけで絞っているかの検査
 * （[Issue #148](https://github.com/fffokazaki/tabi-concierge-tokyo/issues/148)）。
 *
 * プロンプトは以前から「上の一覧に**実際に存在する値**だけで絞ること」と頼んでいたが、
 * **頼んでいるだけで検査していなかった**。本番（Version `c957fa38`・2026-08-22）で採取した
 * 2つの形は、どちらも一覧に無い語で絞って0行になり、45行・123行あるデータセットについて
 * 「当てはまる行は見つかりませんでした」という**偽の未回答**を返していた。
 *
 * 検査は純粋な文字列処理（LLM も D1 も要らない）なので、ここのテストがそのまま防御の証明になる。
 */
describe("実在しない値では絞らせない（Issue #148）", () => {
  const BOTH_AREAS = [
    { name: "寛永寺", area: "上野" },
    { name: "浅草寺", area: "浅草" },
  ];

  it("intent の語を name へ当てにいく SQL は0行になり、書き直させる（偽の未回答にしない）", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      await seed(BOTH_AREAS);
      // 本番で実際に生成された形。興味が3件のときは出ず、4件にすると出た（Issue #148）
      const overRestrictive =
        `SELECT dataset_id, name, address, note FROM spots WHERE dataset_id = '${MEISHO_ID}'` +
        " AND (category IN ('名所・史跡') OR area IN ('上野', '浅草'))" +
        " AND (name LIKE '%ラーメン%' OR name LIKE '%自然%' OR name LIKE '%文化%' OR name LIKE '%家族向け%') LIMIT 50";
      const llm = scriptedLlm(overRestrictive, SELECT_ALL);

      const output = await aggregate(MEISHO_ID, "ラーメン、自然、文化、家族向け", depsWith(llm));

      expect(expectAnswered(output).result.name).toBe("寛永寺");
      expect(llm.asked).toHaveLength(2);
      // 書き直しの理由に「0行だが緩めれば行がある」ことと件数が入る。
      // intent の語（「ラーメン」等）はプロンプトに元から載っているので、それでは判別にならない
      expect(llm.asked[1]!.user).toContain("0行");
      expect(llm.asked[1]!.user).toContain("2 件");
    } finally {
      warn.mockRestore();
    }
  });

  it("一覧に無い category で絞る SQL も書き直させる", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      await seed(BOTH_AREAS);
      // 本番で採取したもう1つの形（都市公園・都立公園一覧は category が「公園」しか無いのに
      // 「自然」「文化」で絞り、123行あるうち0行になった）
      const invented =
        `SELECT dataset_id, name, address, note FROM spots WHERE dataset_id = '${MEISHO_ID}'` +
        " AND category IN ('自然','文化') AND area = '上野' LIMIT 50";
      const llm = scriptedLlm(invented, SELECT_ALL);

      expect(expectAnswered(await aggregate(MEISHO_ID, "自然、文化", depsWith(llm))).result.name).toBe("寛永寺");
      expect(llm.asked[1]!.user).toContain("自然");
    } finally {
      warn.mockRestore();
    }
  });

  it("一覧の値の一部に当たる LIKE は通す（「文化」と「区民文化財」）", async () => {
    // プロンプトが明示的に許している書き方（Issue #120 の実測）。ここを弾くと、
    // 部分一致で正しく引けていた経路まで書き直しへ回して無料枠を無駄にする
    await seed([{ name: "旧朝倉家住宅", area: "渋谷", category: "区民文化財" }]);
    const partial =
      `SELECT dataset_id, name, address, note FROM spots WHERE dataset_id = '${MEISHO_ID}'` +
      " AND category LIKE '%文化%' LIMIT 50";
    const llm = scriptedLlm(partial);

    expect(expectAnswered(await aggregate(MEISHO_ID, "文化財を1件", depsWith(llm))).result.name).toBe("旧朝倉家住宅");
    expect(llm.asked).toHaveLength(1); // 書き直させない
  });

  it("空文字との比較は通す（note は空のことがある）", async () => {
    // 本番で `answered` を返していた SQL に含まれる形。弾くと動いていた経路が壊れる
    await seed([{ name: "寛永寺", area: "上野" }]);
    const withEmpty =
      `SELECT dataset_id, name, address, note FROM spots WHERE dataset_id = '${MEISHO_ID}'` +
      " AND (category = '名所・史跡' OR area IN ('上野', '浅草') OR note = '') LIMIT 50";
    const llm = scriptedLlm(withEmpty);

    expect(expectAnswered(await aggregate(MEISHO_ID, "上野の寺社を1件", depsWith(llm))).result.name).toBe("寛永寺");
    expect(llm.asked).toHaveLength(1);
  });
  it("エリアの実在値を category 側で使う SQL は拒否する（列を無視して通すと0行になる）", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      await seed(BOTH_AREAS);
      const wrongColumn =
        `SELECT dataset_id, name, address, note FROM spots WHERE dataset_id = '${MEISHO_ID}'` +
        " AND category = '上野' LIMIT 50";
      const llm = scriptedLlm(wrongColumn, SELECT_ALL);

      expect(expectAnswered(await aggregate(MEISHO_ID, "上野の寺社を1件", depsWith(llm))).result.name).toBe("寛永寺");
      expect(llm.asked).toHaveLength(2);
      expect(llm.asked[1]!.user).toContain("上野");
    } finally {
      warn.mockRestore();
    }
  });

  it("当たらない name 条件は0行になり、書き直させる（別の行へすり替えない）", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      await seed(BOTH_AREAS);
      const nameLike =
        `SELECT dataset_id, name, address, note FROM spots WHERE dataset_id = '${MEISHO_ID}'` +
        " AND name LIKE '%渋谷%' LIMIT 50";
      const llm = scriptedLlm(nameLike, SELECT_ALL);

      // intent にエリアを書かない（「渋谷の…」と訊いたまま上野の行を受け取る形を期待値にしない
      // ため。エリアを指定されたときに SQL からエリア条件が落ちる問題は別途 Issue にした）
      expect(expectAnswered(await aggregate(MEISHO_ID, "寺社を1件", depsWith(llm))).result.name).toBe("寛永寺");
      expect(llm.asked).toHaveLength(2);
    } finally {
      warn.mockRestore();
    }
  });

  it("部分一致でしか当たらない値の**完全一致**は拒否する（Issue #120 で0行になった形）", async () => {
    // 「文化」で `区民文化財` を引きたいなら LIKE。`category = '文化'` は0行になる。
    // リテラルだけを見て「一覧の値の一部だから既知」と通すと、この形が素通りする
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      await seed([{ name: "旧朝倉家住宅", area: "渋谷", category: "区民文化財" }]);
      const exactMismatch =
        `SELECT dataset_id, name, address, note FROM spots WHERE dataset_id = '${MEISHO_ID}'` +
        " AND category = '文化' LIMIT 50";
      const relaxed = `SELECT dataset_id, name, address, note FROM spots WHERE dataset_id = '${MEISHO_ID}' AND category LIKE '%文化%' LIMIT 50`;
      const llm = scriptedLlm(exactMismatch, relaxed);

      expect(expectAnswered(await aggregate(MEISHO_ID, "文化財を1件", depsWith(llm))).result.name).toBe("旧朝倉家住宅");
      expect(llm.asked).toHaveLength(2);
      expect(llm.asked[1]!.user).toContain("区民文化財"); // 実在値を示して直させる
    } finally {
      warn.mockRestore();
    }
  });

  it("書き直しても実在しない値のままなら縮退する（偽の未回答にしない）", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      await seed(BOTH_AREAS);
      const invented = `SELECT dataset_id, name, address, note FROM spots WHERE dataset_id = '${MEISHO_ID}' AND category = 'ラーメン' LIMIT 50`;
      const llm = scriptedLlm(invented);

      const output = await aggregate(MEISHO_ID, "ラーメン、文化", depsWith(llm));

      // 縮退＝キーワード実装の応答。**0行の未回答ではない**（それが偽の未回答の正体）
      const answered = expectAnswered(output);
      expect(answered.query).toContain("固定データ抽出（スタブ）");
      expect(llm.asked).toHaveLength(MAX_SQL_ATTEMPTS);
      expect(error).toHaveBeenCalled();
    } finally {
      error.mockRestore();
      warn.mockRestore();
    }
  });

  it("ダブルクォートの文字列でも偽の未回答にはならない", async () => {
    // `stringLiteralsIn` はシングルクォートしか見ない。SQLite は "自然" を識別子として扱うので
    // 実行時に落ち、0行（＝「無かった」）にはならない ―― そこを実測で固定する
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await seed(BOTH_AREAS);
      const doubleQuoted = `SELECT dataset_id, name, address, note FROM spots WHERE dataset_id = '${MEISHO_ID}' AND category = "自然" LIMIT 50`;
      const llm = scriptedLlm(doubleQuoted, SELECT_ALL);

      const output = await aggregate(MEISHO_ID, "自然を1件", depsWith(llm));

      expect(expectAnswered(output).result.name).toBe("寛永寺");
      expect(llm.asked.length).toBeGreaterThan(1); // 書き直しへ回る（未回答にはしない）
    } finally {
      warn.mockRestore();
      error.mockRestore();
    }
  });

  it("0行になった SQL は記録する（本当に無かったのか、変な絞り込みかを後から分けるため）", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      await seed(BOTH_AREAS);
      // 実在値だけで絞っているが該当が無い（＝正しい0行）
      const noRow = `SELECT dataset_id, name, address, note FROM spots WHERE dataset_id = '${MEISHO_ID}' AND area = '渋谷' LIMIT 50`;
      const llm = scriptedLlm(noRow);

      expectUnanswered(await aggregate(MEISHO_ID, "渋谷の寺社を1件", depsWith(llm)));

      expect(warn).toHaveBeenCalledWith(
        "[aggregate] 生成 SQL が0行を返しました",
        expect.objectContaining({ sql: expect.stringContaining("area = '渋谷'") }),
      );
    } finally {
      warn.mockRestore();
    }
  });
  it("否定の演算子は拒否する（全行を除外して0行になる）", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      await seed(BOTH_AREAS);
      // 実在値を使っていても、否定なら「全部除外して0行」になりうる
      const negated = `SELECT dataset_id, name, address, note FROM spots WHERE dataset_id = '${MEISHO_ID}' AND category NOT IN ('名所・史跡') LIMIT 50`;
      const llm = scriptedLlm(negated, SELECT_ALL);

      expect(expectAnswered(await aggregate(MEISHO_ID, "寺社を1件", depsWith(llm))).result.name).toBe("寛永寺");
      expect(llm.asked).toHaveLength(2);
    } finally {
      warn.mockRestore();
    }
  });

  it("dataset_id は `=` だけ（`!=` は別データセットへ広がる）", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      await seed(BOTH_AREAS);
      const negatedId = `SELECT dataset_id, name, address, note FROM spots WHERE dataset_id != '${MEISHO_ID}' LIMIT 50`;
      const llm = scriptedLlm(negatedId, SELECT_ALL);

      expect(expectAnswered(await aggregate(MEISHO_ID, "寺社を1件", depsWith(llm))).result.name).toBe("寛永寺");
      expect(llm.asked).toHaveLength(2);
      expect(llm.asked[1]!.user).toContain("dataset_id");
    } finally {
      warn.mockRestore();
    }
  });

  it("LIKE はワイルドカードの位置まで見る（`'文化'` と `'文化%'` は「区民文化財」に当たらない）", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      await seed([{ name: "旧朝倉家住宅", area: "渋谷", category: "区民文化財" }]);
      const prefixOnly = `SELECT dataset_id, name, address, note FROM spots WHERE dataset_id = '${MEISHO_ID}' AND category LIKE '文化%' LIMIT 50`;
      const ok = `SELECT dataset_id, name, address, note FROM spots WHERE dataset_id = '${MEISHO_ID}' AND category LIKE '区民%' LIMIT 50`;
      const llm = scriptedLlm(prefixOnly, ok);

      expect(expectAnswered(await aggregate(MEISHO_ID, "文化財を1件", depsWith(llm))).result.name).toBe("旧朝倉家住宅");
      expect(llm.asked, "前方一致は当たらないので書き直させる").toHaveLength(2);
    } finally {
      warn.mockRestore();
    }
  });

  it("当たる LIKE は素通しする（`'%文化財'` は「区民文化財」に当たる）", async () => {
    await seed([{ name: "旧朝倉家住宅", area: "渋谷", category: "区民文化財" }]);
    const suffix = `SELECT dataset_id, name, address, note FROM spots WHERE dataset_id = '${MEISHO_ID}' AND category LIKE '%文化財' LIMIT 50`;
    const llm = scriptedLlm(suffix);

    expect(expectAnswered(await aggregate(MEISHO_ID, "文化財を1件", depsWith(llm))).result.name).toBe("旧朝倉家住宅");
    expect(llm.asked).toHaveLength(1);
  });
  it("`%` を大量に含むパターンでも即座に判定する（破滅的バックトラックを起こさない）", async () => {
    // 正規表現へ写す実装では、この形が**2分でも終わらなかった**（実測）。LLM が書いた文字列を
    // 毎回受け取る経路なので、ここが焼けると Worker の CPU ごと持っていかれる
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      await seed([{ name: "旧朝倉家住宅", area: "渋谷", category: "区民文化財".repeat(40) }]);
      const pathological = `%`.repeat(40) + "X" + "%".repeat(40);
      const evil = `SELECT dataset_id, name, address, note FROM spots WHERE dataset_id = '${MEISHO_ID}' AND category LIKE '${pathological}' LIMIT 50`;
      const llm = scriptedLlm(evil, SELECT_ALL);

      expect(expectAnswered(await aggregate(MEISHO_ID, "文化財を1件", depsWith(llm))).result.name).toBe("旧朝倉家住宅");
      expect(llm.asked).toHaveLength(2); // 当たらないので書き直させる
    } finally {
      warn.mockRestore();
    }
  });
});

/**
 * 0行を「無かった」と報告する前に、**緩めた問いでも0行かどうかをデータに訊く**
 * （[Issue #148](https://github.com/fffokazaki/tabi-concierge-tokyo/issues/148) の構造的な歯止め）。
 *
 * 生成 SQL の形を並べて禁じる検査は、レビューのたびに新しい抜け道が出た（数値比較・`IS NULL`・
 * 外側の `NOT`・空文字・定数式…）。**形の列挙では閉じない。** 0行になったときに
 * 「dataset_id（＋訊かれたエリア）だけ」で数え直せば、絞り込みが強すぎたのか本当に無いのかが
 * データで分かる ―― どんな書き方をされても効く。
 */
describe("0行は緩めた問いでも0行のときだけ「無かった」と言う（Issue #148）", () => {
  it("リテラルを持たない絞り込み（`1 = 0`）で0行になっても、偽の未回答にはしない", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      await seed([{ name: "寛永寺", area: "上野" }]);
      // 文字列リテラルが1つも出てこないので、リテラル検査は素通りする
      const constantFalse = `SELECT dataset_id, name, address, note FROM spots WHERE dataset_id = '${MEISHO_ID}' AND 1 = 0 LIMIT 50`;
      const llm = scriptedLlm(constantFalse, SELECT_ALL);

      expect(expectAnswered(await aggregate(MEISHO_ID, "寺社を1件", depsWith(llm))).result.name).toBe("寛永寺");
      expect(llm.asked).toHaveLength(2);
      expect(llm.asked[1]!.user).toContain("0行");
    } finally {
      warn.mockRestore();
    }
  });

  it("本当に行が無いときは未回答のまま（正しい0行は壊さない）", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      await seed([{ name: "寛永寺", area: "上野" }]);
      const shibuya = `SELECT dataset_id, name, address, note FROM spots WHERE dataset_id = '${MEISHO_ID}' AND area = '渋谷' LIMIT 50`;
      const llm = scriptedLlm(shibuya);

      expectUnanswered(await aggregate(MEISHO_ID, "渋谷の寺社を1件", depsWith(llm)));
      expect(llm.asked, "緩めても0行なので書き直させない").toHaveLength(1);
    } finally {
      warn.mockRestore();
    }
  });

  it("書き直しても0行のままなら縮退する（未回答として名乗らない）", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      await seed([{ name: "寛永寺", area: "上野" }]);
      const llm = scriptedLlm(`SELECT dataset_id, name, address, note FROM spots WHERE dataset_id = '${MEISHO_ID}' AND 1 = 0 LIMIT 50`);

      const answered = expectAnswered(await aggregate(MEISHO_ID, "寺社を1件", depsWith(llm)));

      expect(answered.query).toContain("固定データ抽出（スタブ）");
      expect(llm.asked).toHaveLength(MAX_SQL_ATTEMPTS);
      expect(error).toHaveBeenCalled();
    } finally {
      error.mockRestore();
      warn.mockRestore();
    }
  });
  it("施設名で1行を選ぶ SQL は通す（利用者が名指しした施設を別の行にすり替えない）", async () => {
    // `name` を一律で禁じると、「寛永寺に行きたい」と書かれた旅程で別の行へすり替わる。
    // 当たらない name 条件（興味の語を当てにいく形）は0行になり、下の裏取りが捕まえる
    await seed([
      { name: "寛永寺", area: "上野" },
      { name: "浅草寺", area: "浅草" },
    ]);
    const byName = `SELECT dataset_id, name, address, note FROM spots WHERE dataset_id = '${MEISHO_ID}' AND name LIKE '%浅草寺%' LIMIT 50`;
    const llm = scriptedLlm(byName);

    expect(expectAnswered(await aggregate(MEISHO_ID, "浅草寺に行きたい", depsWith(llm))).result.name).toBe("浅草寺");
    expect(llm.asked, "当たっているので書き直させない").toHaveLength(1);
  });

  it("裏取りの照会が失敗したら縮退する（障害をデータ欠損として記録しない）", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      await seed([{ name: "寛永寺", area: "上野" }]);
      // COUNT だけ落ちる D1。生成 SQL の実行は本物のまま
      const real = d1SqlExecutor(env.DB);
      const flaky = {
        select: async (sql: string) =>
          sql.includes("COUNT(*)")
            ? ({ ok: false, cause: new Error("D1 が応答しません") } as const)
            : real.select(sql),
      };
      const llm = scriptedLlm(`SELECT dataset_id, name, address, note FROM spots WHERE dataset_id = '${MEISHO_ID}' AND 1 = 0 LIMIT 50`);

      const output = await aggregate(MEISHO_ID, "寺社を1件", { llm, sql: flaky });

      // 障害は縮退（キーワード実装）。**未回答＝データが無い、として記録しない**（API.md §4）
      expect(expectAnswered(output).query).toContain("固定データ抽出（スタブ）");
      expect(error).toHaveBeenCalled();
    } finally {
      error.mockRestore();
      warn.mockRestore();
    }
  });
});

/**
 * 名指しされた施設が候補データセットに無いときの扱い
 * （[Issue #153](https://github.com/fffokazaki/tabi-concierge-tokyo/issues/153) の決定）。
 *
 * 上の「実在しない値では絞らせない（Issue #148）」が固定しているのは**逆側**である ――
 * 興味の語を `name` に当てにいって0行になった SQL を「無かった」と報告させない
 * （「intent の語を name へ当てにいく SQL は0行になり、書き直させる（偽の未回答にしない）」・
 * 「本当に行が無いときは未回答のまま（正しい0行は壊さない）」）。
 *
 * 同じ機械が、名指し（「浅草寺に行きたい」）の0行では**別の施設へのすり替え**を生む。
 * リテラルだけを見て興味の語と施設名を区別する決定的な方法が無いため、#153 は
 * **偽の未回答を残すより実在する行を返す**方を選んだ。ここが固定するのはその決定であって、
 * 「すり替えが望ましい」ではない。伝える形の設計は
 * [#166](https://github.com/fffokazaki/tabi-concierge-tokyo/issues/166) で扱う。
 *
 * **挙動を変えるときはこのテストを意図的に書き換えること。**
 */
describe("名指しされた施設が無いときは黙ってすり替える（Issue #153 の決定）", () => {
  it("同じエリアに行があるときは、未回答にせず別の施設を返す", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      // 「浅草寺」は収録していないが、浅草の行そのものはある
      await seed([
        { name: "浅草神社", area: "浅草" },
        { name: "寛永寺", area: "上野" },
      ]);
      const byName =
        `SELECT dataset_id, name, address, note FROM spots WHERE dataset_id = '${MEISHO_ID}'` +
        " AND name LIKE '%浅草寺%' LIMIT 50";
      const relaxed =
        `SELECT dataset_id, name, address, note FROM spots WHERE dataset_id = '${MEISHO_ID}'` +
        " AND area = '浅草' LIMIT 50";
      const llm = scriptedLlm(byName, relaxed);
      const recorder = capturingGapRecorder();

      const output = await aggregateDataset(
        { datasetId: MEISHO_ID, intent: "浅草寺に行きたい" },
        recorder,
        depsWith(llm),
      );

      const answered = expectAnswered(output);
      expect(answered.result.name, "名指しは外れたが、選ばれたデータセットの実在する行を返す").toBe("浅草神社");
      expect(llm.asked, "0行のまま返さず、絞り込みを緩めて書き直させる").toHaveLength(2);

      // 答えを返しているので**欠損ではない**。ここで gaps に積むと、DOMAIN.md §7 の
      // 「答えられなかったことの一次情報」という定義を壊し、偽の欠損を自分で足すことになる
      expect(recorder.records, "答えているので gaps には積まない（Issue #151 の偽の欠損を増やさない）").toHaveLength(
        0,
      );

      // **すり替えは応答から読み取れない。** `query` に載るのは書き直した後の SQL なので、
      // 「浅草寺」という語は応答のどこにも残らない ―― これは記録漏れではなく上の決定の帰結で、
      // #166 が解こうとしている残りの問題そのものである
      expect(answered.query, "書き直した後の SQL が載るので名指しの語は残らない").not.toContain("浅草寺");
      expect(JSON.stringify(answered), "応答のどこにも名指しの語は残らない").not.toContain("浅草寺");
    } finally {
      warn.mockRestore();
    }
  });

  it("代表エリアを読み取れたときは、そのエリアに行が無ければ未回答のまま", async () => {
    // `countRelaxed` は読み取れた代表エリアを緩めない。「浅草寺」を名指しされてもこの
    // データセットが浅草を1行も収録していなければ、上野の行を代わりに返したりはせず未回答に
    // なる（別エリアの行で代替すると本物の出典がついた誤答になる・API.md §3.2）。
    // **この歯止めが効くのは代表エリアを読み取れたときだけ** ―― 次のテストがその境界を示す
    await seed([{ name: "寛永寺", area: "上野" }]);
    const byName =
      `SELECT dataset_id, name, address, note FROM spots WHERE dataset_id = '${MEISHO_ID}'` +
      " AND name LIKE '%浅草寺%' LIMIT 50";
    const llm = scriptedLlm(byName);

    expectUnanswered(await aggregate(MEISHO_ID, "浅草寺に行きたい", depsWith(llm)));
    expect(llm.asked, "浅草の行が1件も無いので書き直させない").toHaveLength(1);
  });

  it("**代表エリアを読み取れない intent では、すり替え先はエリアを越える**", async () => {
    // 直前のテストの歯止めは `findRepresentativeArea` が intent から代表エリアを
    // 拾えたときだけ成り立つ。拾えるのは「上野」「浅草」「渋谷」の部分一致だけなので
    // （`shared/core.ts` の `REPRESENTATIVE_AREAS`）、未知の地名（巣鴨のとげぬき地蔵）や
    // エリア無指定では `countRelaxed` にエリア条件が付かず、**データセット全体**から選ばれる。
    //
    // これは #153 で選んだ①の**範囲の広さ**であって、別の不具合ではない ―― ただし
    // 「エリアは越えない」と書くと実装より強い主張になる（cross-model レビュー・信頼度96）。
    // 訊かれたエリアが SQL から落ちる形は [Issue #152](https://github.com/fffokazaki/tabi-concierge-tokyo/issues/152) が別に扱う
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      await seed([{ name: "寛永寺", area: "上野" }]);
      const byName =
        `SELECT dataset_id, name, address, note FROM spots WHERE dataset_id = '${MEISHO_ID}'` +
        " AND name LIKE '%とげぬき地蔵%' LIMIT 50";
      const llm = scriptedLlm(byName, SELECT_ALL);

      const answered = expectAnswered(await aggregate(MEISHO_ID, "とげぬき地蔵に行きたい", depsWith(llm)));

      expect(answered.result.name, "巣鴨を訊かれても上野の行が返る（エリアの歯止めは効いていない）").toBe("寛永寺");
      expect(llm.asked, "エリア条件が付かないので「行はある」と判定され、書き直させる").toHaveLength(2);
    } finally {
      warn.mockRestore();
    }
  });
});
