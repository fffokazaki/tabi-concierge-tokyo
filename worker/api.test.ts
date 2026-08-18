import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { AggregateDatasetOutput, GetProvenanceOutput, SearchDatasetsOutput } from "../shared/core";
import { DEFAULT_SEARCH_LIMIT, MAX_SEARCH_LIMIT } from "./core/operations";
import {
  applyMigrations,
  clearGaps,
  expectAnswered,
  expectUnanswered,
  postJson,
  postRaw,
  readGapRows,
  readJson,
  request,
} from "./test-support";

/**
 * `/api/*` は未回答を D1 の `gaps` へ書く（Issue #27）。vitest-pool-workers の D1 は
 * テストファイルごとに**空で立ち上がる**ため、スキーマを適用しないと INSERT が
 * "no such table" で落ちる。書き込み失敗は応答を落とさない設計なので、
 * 適用を忘れると**テストは緑のまま記録だけが失われる**。
 */
beforeAll(applyMigrations);

/**
 * コア3操作の `/api/*` スタブ（Issue #22）のテスト。
 *
 * 形だけを見るテストにしない。`toBeTypeOf("string")` の類は、値が捏造されていても通る。
 * 出典は**実在するカタログの値**（ID・提供元・URL・取得日）と一致することまで確かめる。
 */

/**
 * 名所・史跡（台東区）。data/t131067d0000000251/meta.json の実測値。
 *
 * `CATALOG` を import せずリテラルで書き写している。import すると catalog.ts が
 * 自分自身と一致することを確かめるだけになり、値のドリフトを検出できなくなる。
 */
const MEISHO = {
  datasetId: "t131067d0000000251",
  title: "名所・史跡",
  provider: "台東区",
  url: "https://catalog.data.metro.tokyo.lg.jp/dataset/t131067d0000000251",
  retrievedAt: "2026-08-16",
} as const;

/** 文化観光施設（台東区）。上野の美術館・博物館を収録する */
const BUNKA_ID = "t131067d0000000236";
/** 銭湯（台東区）。上野・浅草の両方の固定データを持つ */
const SENTO_ID = "t131067d0000000256";
/** 都市公園・都立公園一覧（渋谷区）。渋谷を収録する唯一のデータセット */
const SHIBUYA_PARK_ID = "t131130d2025000003";
/** R6国・地域別外国人旅行者行動特性調査。施設一覧ではなくクロス集計表 */
const STATISTICS_ID = "t000012d0000000081";
/** 東京都内の飲食店のバリアフリー情報。ジャンルの列を持たない */
const RESTAURANT_ID = "t000012d0000000063";

const search = async (body: unknown) => readJson<SearchDatasetsOutput>(await postJson("/api/search-datasets", body));
const aggregate = async (body: unknown) =>
  readJson<AggregateDatasetOutput>(await postJson("/api/aggregate-dataset", body));
const provenance = async (body: unknown) => readJson<GetProvenanceOutput>(await postJson("/api/provenance", body));

describe("POST /api/search-datasets", () => {
  it("代表エリアの質問には実在データセットの候補を返す", async () => {
    const response = await postJson("/api/search-datasets", { query: "上野の寺社をめぐりたい", area: "上野" });
    expect(response.status).toBe(200);

    const body = expectAnswered(await readJson<SearchDatasetsOutput>(response));
    expect(body.candidates[0]).toMatchObject({
      datasetId: MEISHO.datasetId,
      title: MEISHO.title,
      provider: MEISHO.provider,
      url: MEISHO.url,
    });
    expect(body.candidates[0].matchReason).toContain("45件");
  });

  it("キーワードが多く当たったデータセットほど上に来る", async () => {
    // 「寺社」で No.1 が2ヒット、「文化」で No.2・No.3 が1ヒットずつ。
    // 同点は DATABASE.md §2 の No. 昇順で並ぶ
    const body = expectAnswered(await search({ query: "上野の寺社と文化", area: "上野" }));

    expect(body.candidates.map((candidate) => candidate.datasetId)).toEqual([
      MEISHO.datasetId,
      "t131067d0000000236",
      "t131067d0000000393",
      "t131067d0000000256",
    ]);
  });

  it("キーワードが当たらなくてもエリアが分かれば、そのエリアのデータセットを既定件数だけ返す", async () => {
    const body = expectAnswered(await search({ query: "上野" }));

    // 上野を収録するのは8件。既定値で切られることを実際の件数で確かめる
    expect(body.candidates).toHaveLength(DEFAULT_SEARCH_LIMIT);
    // エリアだけを訊かれているので欠損は足さない（Issue #50）
    expect(body.gaps).toBeUndefined();
  });

  it("エリア名のほかに訊かれた内容があれば、応答の gaps に載って返る（Issue #50）", async () => {
    // 興味チップ「ナイトライフ」＋その他のご希望「渋谷」でプランを作ると、この形の query になる。
    // 以前は都市公園データが gaps なしの「回答あり」として返り、欠損が画面にも記録にも残らなかった
    const body = expectAnswered(await search({ query: "ナイトライフ、渋谷" }));

    expect(body.gaps).toHaveLength(1);
    expect(body.gaps?.[0].reason).toBe("other");
  });

  it("limit で件数を変えられる（上限まで指定できる）", async () => {
    expect(expectAnswered(await search({ query: "上野", limit: 2 })).candidates).toHaveLength(2);
    // 上野を収録するのは8件なので、上限10を指定しても8件で頭打ちになる
    expect(expectAnswered(await search({ query: "上野", limit: MAX_SEARCH_LIMIT })).candidates).toHaveLength(8);
  });

  it("対象エリア外は HTTP エラーではなく unanswered(out_of_area) を返す", async () => {
    const response = await postJson("/api/search-datasets", { query: "美術館に行きたい", area: "新宿" });

    // 「データが無い」はエラーではなく正常な回答（API.md §4）
    expect(response.status).toBe(200);
    const body = expectUnanswered(await readJson<SearchDatasetsOutput>(response));
    expect(body.reason).toBe("out_of_area");
    expect(body.message).toContain("新宿");
  });

  it("明示した area が質問文の地名より優先される", async () => {
    const body = expectUnanswered(await search({ query: "上野の美術館", area: "新宿" }));
    expect(body.reason).toBe("out_of_area");
  });

  it("質問文の代表エリアは対象外の地名より優先される", async () => {
    // この query が `gaps` なしで通るのは、宿泊施設のキーワード「宿」が「新宿」に部分一致して
    // キーワード経路で返るため。「宿」を締める（notWhen を足す等）と、Issue #50 の
    // エリア・フォールバックへ落ちて欠損が1件付き、このテストと :249 の期待が変わる
    const body = expectAnswered(await search({ query: "新宿から上野へ行きたい" }));
    expect(body.candidates.length).toBeGreaterThan(0);
  });

  it("銀座線は「銀座」ではない（部分一致で対象エリア外にしない）", async () => {
    // 銀座線は浅草・上野を通る。地名の部分一致で答えられる問いを弾いてはいけない
    const body = expectAnswered(await search({ query: "銀座線で行ける上野のお寺" }));
    expect(body.candidates[0].datasetId).toBe(MEISHO.datasetId);
  });

  it("「駅のそば」は飲食のジャンル指定ではない", async () => {
    // 「そば」は「近く」の意味にもなる。粒度不足に倒すと答えられる問いを握りつぶす
    const body = expectAnswered(await search({ query: "上野駅のそばのトイレ", area: "上野" }));
    expect(body.candidates.map((candidate) => candidate.datasetId)).toContain("t131067d0000000249");
  });

  it("ラーメンは未公開ではなく粒度不足として返す", async () => {
    const response = await postJson("/api/search-datasets", { query: "上野でラーメンが食べたい", area: "上野" });

    expect(response.status).toBe(200);
    const body = expectUnanswered(await readJson<SearchDatasetsOutput>(response));
    // 飲食店データ自体は存在する。ジャンルの粒度で答えられないだけ（DATABASE.md 既知のデータ欠損）
    expect(body.reason).toBe("insufficient_granularity");
    expect(body.message).toContain("ラーメン");
  });

  it("分類に飲食店を明示しても、ジャンル指定なら粒度不足で返す", async () => {
    // 飲食店データはキーワードに当たるが、ジャンルの列が無いので答えたことにしない
    const body = expectUnanswered(await search({ query: "上野のラーメン", area: "上野", category: "飲食店" }));
    expect(body.reason).toBe("insufficient_granularity");
  });

  it("渋谷の観光・文化施設は、調査済みの事実として data_not_published を返す", async () => {
    const body = expectUnanswered(await search({ query: "渋谷の美術館", area: "渋谷" }));

    expect(body.reason).toBe("data_not_published");
    expect(body.message).toContain("渋谷区");
  });

  it("渋谷の公園は答えられる（渋谷区のデータセットだけを返す）", async () => {
    const body = expectAnswered(await search({ query: "渋谷の公園", area: "渋谷" }));

    expect(body.candidates.map((candidate) => candidate.datasetId)).toEqual([SHIBUYA_PARK_ID]);
    expect(body.candidates[0].provider).toBe("渋谷区");
  });

  it("category を明示して1件も当たらなければ、エリアの一覧に落とさない", async () => {
    // 「神社」の問いにトイレや宿泊施設を返さない（指定を黙って捨てない）
    const body = expectUnanswered(await search({ query: "上野", area: "上野", category: "動物園" }));

    expect(body.reason).toBe("other");
    expect(body.message).toContain("動物園");
  });

  it("エリアも分類も特定できない条件は unanswered(other) を返す", async () => {
    const body = expectUnanswered(await search({ query: "スキー場に行きたい" }));
    expect(body.reason).toBe("other");
  });

  /**
   * 混在クエリの部分欠損（Issue #29）。
   *
   * 答えられる興味と答えられない興味を1つの `query` に混ぜられたとき、答えられる候補だけを
   * 返すと、答えられなかった側の欠損が応答のどこにも現れない。DOMAIN.md §8 不変条件4 が
   * 制約するのは応答であって文書なので、「既知の制限として文書に書く」では満たしたことにならない。
   */
  describe("部分欠損（gaps）", () => {
    it("答えられる興味と答えられない興味が混ざったら、候補と欠損の両方を返す", async () => {
      // 代表シナリオ「明日は浅草と上野、ラーメンが好き」が最も自然に生む入力の形
      const body = expectAnswered(await search({ query: "上野の美術館とラーメン", area: "上野" }));

      // 美術館側は答える
      expect(body.candidates.map((candidate) => candidate.datasetId)).toContain(BUNKA_ID);
      // ラーメン側の欠損は握りつぶさない
      expect(body.gaps).toHaveLength(1);
      expect(body.gaps?.[0].reason).toBe("insufficient_granularity");
      expect(body.gaps?.[0].message).toContain("ラーメン");
    });

    it("候補に飲食店データを混ぜない（答えたことにしない）", async () => {
      // ジャンルの列が無いデータセットを候補に出すと、gaps があっても
      // 「この出典で答えられる」と読める。欠損の可視化が打ち消される
      const body = expectAnswered(await search({ query: "上野の美術館とラーメン", area: "上野" }));
      expect(body.candidates.map((candidate) => candidate.datasetId)).not.toContain(RESTAURANT_ID);
    });

    it("すべて答えられるクエリには gaps を付けない（キーごと省く）", async () => {
      const body = expectAnswered(await search({ query: "上野の美術館", area: "上野" }));

      // 空配列を返すと、呼び出し側が欠損の有無を長さで判定する羽目になる。キーごと無いこと
      expect(Object.hasOwn(body, "gaps")).toBe(false);
    });

    it("覆えなかったエリアは応答の gaps にも area 付きで載る（Issue #52）", async () => {
      // D1 の記録は別のテストで見ている。ここはクライアントが受け取る契約のほう。
      // 応答整形の変更で `area` が落ちても、記録だけ見ていると気づけない
      const body = expectAnswered(await search({ query: "上野・渋谷" }));

      expect(body.gaps).toEqual([
        {
          status: "unanswered",
          reason: "other",
          message:
            "「渋谷」について訊かれましたが、返した候補はいずれも「渋谷」を収録していません。候補は「上野」で絞り込んでいるためです。",
          area: "渋谷",
        },
      ]);
    });

    it("すべて答えられないクエリは unanswered のまま（answered ＋ 全部 gaps にしない）", async () => {
      // ここを answered にすると「答えがある」と嘘をつくことになる
      const body = expectUnanswered(await search({ query: "上野でラーメンが食べたい", area: "上野" }));
      expect(body.reason).toBe("insufficient_granularity");
    });

    it("渋谷で答えられる問いと答えられない問いが混ざった場合も両方返す", async () => {
      const body = expectAnswered(await search({ query: "渋谷の公園と美術館", area: "渋谷" }));

      expect(body.candidates.map((candidate) => candidate.datasetId)).toEqual([SHIBUYA_PARK_ID]);
      expect(body.gaps).toHaveLength(1);
      expect(body.gaps?.[0].reason).toBe("data_not_published");
    });

    /**
     * 対象エリア外の地名は部分欠損にしない。
     *
     * 「新宿のホテルから上野の美術館へ」の新宿は**出発地**であって、新宿のデータを
     * 求めてはいない。スタブには「新宿について訊かれた」と「新宿を経路として書いた」を
     * 見分ける手段が無いため、報告すると答えられている応答にノイズを足すことになる。
     * `gaps` に残しているジャンル語・観光施設語は**求めているデータの種類**を指す語なので、
     * 散文中の言及と取り違えにくい。
     */
    it("出発地・宿泊地として書かれた対象エリア外の地名を欠損として報告しない", async () => {
      const withExplicitArea = expectAnswered(
        await search({ query: "新宿のホテルから上野の美術館へ", area: "上野" }),
      );
      const fromQuery = expectAnswered(await search({ query: "新宿から上野へ行きたい" }));

      for (const body of [withExplicitArea, fromQuery]) {
        expect(body.candidates.length).toBeGreaterThan(0);
        expect(Object.hasOwn(body, "gaps")).toBe(false);
      }
    });

    it("対象エリア外だけを訊かれた場合は従来どおり unanswered(out_of_area)", async () => {
      // 部分欠損から外したのは「一緒に書かれた地名」であって、
      // エリア外そのものを訊かれたときの未回答は変えていない
      const body = expectUnanswered(await search({ query: "新宿の美術館", area: "新宿" }));
      expect(body.reason).toBe("out_of_area");
    });
  });

  it("query が無い場合は 400 で invalid_request を返す", async () => {
    const response = await postJson("/api/search-datasets", { area: "上野" });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "invalid_request" });
  });

  it("空白だけの query も 400 にする", async () => {
    expect((await postJson("/api/search-datasets", { query: "   " })).status).toBe(400);
  });

  it.each([
    ["下限未満", 0],
    ["上限超過", MAX_SEARCH_LIMIT + 1],
    ["整数でない", 2.5],
  ])("limit が%s（%s）なら 400 を返す（黙って丸めない）", async (_label, limit) => {
    const response = await postJson("/api/search-datasets", { query: "上野の観光", limit });

    expect(response.status).toBe(400);
    const body = await readJson<{ error: string; message: string }>(response);
    expect(body.error).toBe("invalid_request");
    expect(body.message).toContain(String(MAX_SEARCH_LIMIT));
  });

  it("limit が数値でなければ 400 を返す", async () => {
    expect((await postJson("/api/search-datasets", { query: "上野", limit: "2" })).status).toBe(400);
  });

  it("area・category の型違いは 400 を返す", async () => {
    expect((await postJson("/api/search-datasets", { query: "上野", area: 1 })).status).toBe(400);
    expect((await postJson("/api/search-datasets", { query: "上野", category: [] })).status).toBe(400);
  });

  describe("構造化入力（interests / areas・ADR-011）", () => {
    it("areas で目的地を明示すると、出発地の代表エリアが欠損に載らない（Issue #58）", async () => {
      const body = expectAnswered(
        await search({ query: "渋谷から上野の美術館へ行きたい", areas: ["上野"] }),
      );

      expect(body.candidates.length).toBeGreaterThan(0);
      expect(Object.hasOwn(body, "gaps")).toBe(false);
    });

    it("interests で興味を送ると、答えていない興味が gaps に載る（Issue #53）", async () => {
      const body = expectAnswered(
        await search({ query: "上野で夜遊びしたい", interests: ["ナイトライフ"] }),
      );

      expect(body.gaps).toHaveLength(1);
      expect(body.gaps?.[0].message).toContain("ナイトライフ");
    });

    it("interests があれば query を省略できる（興味チップだけの呼び出し）", async () => {
      const body = expectAnswered(await search({ interests: ["文化"] }));

      expect(body.candidates.length).toBeGreaterThan(0);
    });

    it("interests が空配列なら、query 省略は従来どおり 400", async () => {
      expect((await postJson("/api/search-datasets", { interests: [] })).status).toBe(400);
    });

    it("area と areas の同時指定は 400（どちらを信じるかを黙って決めない）", async () => {
      const response = await postJson("/api/search-datasets", {
        query: "美術館",
        area: "上野",
        areas: ["上野"],
      });

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({ error: "invalid_request" });
    });

    it("interests・areas の型違い・空文字の要素は 400 を返す", async () => {
      expect((await postJson("/api/search-datasets", { query: "上野", interests: "文化" })).status).toBe(400);
      expect((await postJson("/api/search-datasets", { query: "上野", interests: [1] })).status).toBe(400);
      expect((await postJson("/api/search-datasets", { query: "上野", areas: ["  "] })).status).toBe(400);
    });
  });
});

describe("POST /api/aggregate-dataset", () => {
  it("実在する行を result と実行クエリつきで返す", async () => {
    const response = await postJson("/api/aggregate-dataset", {
      datasetId: MEISHO.datasetId,
      intent: "上野エリアの寺社を1件",
    });
    expect(response.status).toBe(200);

    const body = expectAnswered(await readJson<AggregateDatasetOutput>(response));
    // data/t131067d0000000251/data.csv のヘッダを除く3行目に実在する
    expect(body.result.name).toBe("寛永寺");
    expect(body.result.summary).toContain("上野桜木1丁目14番");
    // 実行クエリは省略不可（API.md §4）。どのスナップショットの何行目かを辿れること
    expect(body.query).toContain(MEISHO.datasetId);
    expect(body.query).toContain("ヘッダを除く 3 行目");
  });

  it("集計意図のエリアで返す行が変わる", async () => {
    const body = expectAnswered(await aggregate({ datasetId: MEISHO.datasetId, intent: "浅草の寺社を1件" }));
    expect(body.result.name).toBe("浅草寺");
  });

  it("指定したエリアの固定データが無いデータセットでも、別エリアの行を返さない", async () => {
    // 台東区の銭湯は上野にも浅草にもある。浅草を指定したら浅草の行しか返してはいけない
    const asakusa = expectAnswered(await aggregate({ datasetId: SENTO_ID, intent: "浅草の銭湯を1件" }));
    expect(asakusa.result.name).toBe("アクアプレイス旭");
    expect(asakusa.result.summary).toContain("浅草5-10-5");

    const ueno = expectAnswered(await aggregate({ datasetId: SENTO_ID, intent: "上野の銭湯を1件" }));
    expect(ueno.result.name).toBe("燕湯");
  });

  it("そのデータセットが収録していないエリアを指定されたら unanswered を返す", async () => {
    // 渋谷区の公園データに上野を求める。先頭行（恵比寿東公園）を返してはいけない
    const body = expectUnanswered(await aggregate({ datasetId: SHIBUYA_PARK_ID, intent: "上野の公園を1件" }));

    expect(body.reason).toBe("data_not_published");
    expect(body.message).toContain("上野");
  });

  it("対象エリア外の意図は search と同じく out_of_area で返す", async () => {
    const body = expectUnanswered(await aggregate({ datasetId: MEISHO.datasetId, intent: "新宿の寺社を1件" }));
    expect(body.reason).toBe("out_of_area");
  });

  it("エリアの指定が無ければ先頭の固定データを返す", async () => {
    const body = expectAnswered(await aggregate({ datasetId: MEISHO.datasetId, intent: "寺社を1件" }));
    expect(body.result.name).toBe("寛永寺");
  });

  it("クロス集計表からは地物を抽出できないので unanswered を返す", async () => {
    const response = await postJson("/api/aggregate-dataset", {
      datasetId: STATISTICS_ID,
      intent: "上野の施設を1件",
    });

    expect(response.status).toBe(200);
    const body = expectUnanswered(await readJson<AggregateDatasetOutput>(response));
    expect(body.reason).toBe("insufficient_granularity");
  });

  it("飲食店データにジャンルを求めた場合も粒度不足で返す", async () => {
    const body = expectUnanswered(await aggregate({ datasetId: RESTAURANT_ID, intent: "上野のラーメン店を1件" }));
    expect(body.reason).toBe("insufficient_granularity");
  });

  it("飲食店データ以外へのジャンル指定は粒度不足にしない", async () => {
    // ジャンル判定が飲食店データ限定であることの裏。条件が外れたら、寺社データが
    // 「ラーメン店」の答えとして返るようになる
    const body = expectAnswered(await aggregate({ datasetId: MEISHO.datasetId, intent: "上野のラーメン屋の近くの寺" }));
    expect(body.result.name).toBe("寛永寺");
  });

  it("利用中の10件に無い datasetId は 400 ではなく unanswered で返す", async () => {
    const response = await postJson("/api/aggregate-dataset", {
      datasetId: "t000000d0000000000",
      intent: "上野の施設を1件",
    });

    // 呼び出し経路で扱いが変わらないようにするため（API.md §4）。provenance 側と揃っている
    expect(response.status).toBe(200);
    const body = expectUnanswered(await readJson<AggregateDatasetOutput>(response));
    expect(body.reason).toBe("other");
  });

  it("intent が無い場合は 400 を返す", async () => {
    const response = await postJson("/api/aggregate-dataset", { datasetId: MEISHO.datasetId });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "invalid_request" });
  });

  it("前後の空白は正規化して扱う（書式ノイズをデータ欠損にしない）", async () => {
    const body = expectAnswered(await aggregate({ datasetId: ` ${MEISHO.datasetId} `, intent: "上野の寺社を1件" }));
    expect(body.result.name).toBe("寛永寺");
  });
});

describe("POST /api/provenance", () => {
  it("出典7フィールドがすべて実在の値で埋まる", async () => {
    const query = "上野エリアの寺社（検索条件）";
    const response = await postJson("/api/provenance", { datasetIds: [MEISHO.datasetId], query });
    expect(response.status).toBe(200);

    const body = expectAnswered(await readJson<GetProvenanceOutput>(response));
    expect(body.sources).toHaveLength(1);
    expect(body.sources[0]).toEqual({
      datasetId: MEISHO.datasetId,
      datasetTitle: MEISHO.title,
      provider: MEISHO.provider,
      license: "CC BY 4.0",
      url: MEISHO.url,
      query,
      retrievedAt: MEISHO.retrievedAt,
    });
  });

  it("知らない datasetId が混ざったら、既知のぶんだけ返さず unanswered にする", async () => {
    const body = expectUnanswered(
      await provenance({ datasetIds: [MEISHO.datasetId, "t000000d0000000000"], query: "検索条件" }),
    );

    // 黙って落とすと、呼び出し側が「出典が揃った」と誤認する
    expect(body.reason).toBe("other");
    expect(body.message).toContain("t000000d0000000000");
  });

  it("同じ datasetId を重ねて渡しても出典は1件にまとめる", async () => {
    const body = expectAnswered(
      await provenance({ datasetIds: [MEISHO.datasetId, MEISHO.datasetId], query: "検索条件" }),
    );
    expect(body.sources).toHaveLength(1);
  });

  it("query は必須。無ければ 400 を返す", async () => {
    const response = await postJson("/api/provenance", { datasetIds: [MEISHO.datasetId] });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "invalid_request" });
  });

  it("datasetIds が空・要素が空文字なら 400 を返す", async () => {
    expect((await postJson("/api/provenance", { datasetIds: [], query: "検索条件" })).status).toBe(400);
    expect((await postJson("/api/provenance", { datasetIds: [""], query: "検索条件" })).status).toBe(400);
    expect((await postJson("/api/provenance", { datasetIds: [1], query: "検索条件" })).status).toBe(400);
  });
});

describe("リクエストボディの境界", () => {
  it.each([
    ["壊れた JSON", "{"],
    ["空ボディ", ""],
  ])("%s は 400 の JSON を返す", async (_label, raw) => {
    const response = await postRaw("/api/search-datasets", raw);

    expect(response.status).toBe(400);
    expect(response.headers.get("content-type")).toContain("application/json");
    await expect(response.json()).resolves.toMatchObject({ error: "invalid_request" });
  });

  it.each([
    ["配列", []],
    ["文字列", "上野"],
    ["null", null],
  ])("JSON オブジェクトでないボディ（%s）は 400 を返す", async (_label, body) => {
    expect((await postJson("/api/search-datasets", body)).status).toBe(400);
  });

  it("定義済みパスへのメソッド違いは 404 の JSON を返す", async () => {
    const response = await request("/api/search-datasets");

    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toContain("application/json");
    await expect(response.json()).resolves.toMatchObject({ error: "not_found" });
  });
});

describe("出典強制（DOMAIN.md §8 不変条件1）", () => {
  it("検索で返した候補はすべて出典を生成できる", async () => {
    const found = expectAnswered(await search({ query: "上野の寺社と美術館", area: "上野" }));

    const query = "上野の寺社と美術館（検索条件）";
    const sources = expectAnswered(
      await provenance({ datasetIds: found.candidates.map((candidate) => candidate.datasetId), query }),
    );

    expect(sources.sources).toHaveLength(found.candidates.length);
    for (const source of sources.sources) {
      // CC BY 4.0 以外が混ざっていないこと（CLAUDE.md 絶対ルール #4）
      expect(source.license).toBe("CC BY 4.0");
      expect(source.query).toBe(query);
      expect(source.url).toContain("catalog.data.metro.tokyo.lg.jp/dataset/");
      expect(source.retrievedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(source.provider.length).toBeGreaterThan(0);
      expect(source.datasetTitle.length).toBeGreaterThan(0);
    }
  });
});

/**
 * 未回答の D1 記録（Issue #27・DOMAIN.md §8 不変条件4「未回答は必ず理由分類され、記録される」）。
 *
 * コア側の記録内容は operations.test.ts が見ている。ここでは **HTTP 経由で実際に D1 の
 * 行が増えること**を確かめる（記録器の組み立てがルートから抜け落ちていないか）。
 */
describe("未回答の gaps 記録", () => {
  // 直前の describe までの書き込みを持ち越さない
  beforeEach(clearGaps);

  it("対象エリア外の検索で gaps に1行増える", async () => {
    expectUnanswered(await search({ query: "新宿の美術館を探しています", category: "美術館" }));

    expect(await readGapRows()).toEqual([
      {
        question: "新宿の美術館を探しています",
        area: "新宿",
        category: "美術館",
        reason: "out_of_area",
      },
    ]);
  });

  it("同じ未回答が複数回起きたら発生ごとに積む（重複排除しない）", async () => {
    await search({ query: "新宿の美術館" });
    await search({ query: "新宿の美術館" });

    // 頻度を集計できる形にしておく
    expect(await readGapRows()).toHaveLength(2);
  });

  it("欠損の無い answered では gaps が増えない", async () => {
    expectAnswered(await search({ query: "上野の美術館", area: "上野" }));

    expect(await readGapRows()).toEqual([]);
  });

  it("部分欠損つきの answered では gaps が増える（Issue #29 の gaps を記録に落とす）", async () => {
    // AC の「answered → gaps は増えない」は #29 より前に書かれたもの。
    // 部分欠損を持つ answered まで増えないことにすると、#29 で可視化したばかりの
    // 欠損が記録に残らず、不変条件4 が一番効いてほしい場所で破れる
    const body = expectAnswered(await search({ query: "上野の美術館とラーメン", area: "上野" }));
    expect(body.gaps).toHaveLength(1);

    expect(await readGapRows()).toEqual([
      {
        question: "上野の美術館とラーメン",
        area: "上野",
        category: undefined,
        reason: "insufficient_granularity",
      },
    ]);
  });

  it("マナーの調査済み欠損も HTTP 経由で D1 に記録される（Issue #43・ADR-010）", async () => {
    // 記録の頻度がデータ公開リクエストの根拠になる設計なので、永続化の回帰は本質的
    expectUnanswered(await search({ query: "日本のマナーを知りたい" }));

    expect(await readGapRows()).toEqual([
      { question: "日本のマナーを知りたい", area: undefined, category: undefined, reason: "data_not_published" },
    ]);
  });

  it("キーワードが当たる問いに混ざったマナー欠損も D1 に記録される（Issue #43）", async () => {
    const body = expectAnswered(await search({ query: "上野の美術館と作法", area: "上野" }));
    expect(body.gaps).toHaveLength(1);

    expect(await readGapRows()).toEqual([
      { question: "上野の美術館と作法", area: "上野", category: undefined, reason: "data_not_published" },
    ]);
  });

  it("エリア・フォールバックの欠損も記録される（Issue #50）", async () => {
    // 応答ボディに載ることは別のテストで見ている。ここは HTTP 経由で実際に D1 の行が増えるか。
    // 記録器の組み立て漏れ（`worker/index.ts` の配線）はボディだけ見ていても通ってしまう
    const body = expectAnswered(await search({ query: "ナイトライフ、渋谷" }));
    expect(body.gaps).toHaveLength(1);

    expect(await readGapRows()).toEqual([
      { question: "ナイトライフ、渋谷", area: "渋谷", category: undefined, reason: "other" },
    ]);
  });

  it("覆えなかったエリアは、応答全体のエリアではなく自分のエリアで記録される（Issue #52）", async () => {
    // 「上野・渋谷」の応答全体のエリアは解決結果の「上野」。この行まで上野で記録すると、
    // どのエリアに答えられなかったかが D1 から分からなくなる（それが Issue #52 の症状）
    const body = expectAnswered(await search({ query: "上野・渋谷" }));
    expect(body.gaps).toHaveLength(1);

    expect(await readGapRows()).toEqual([
      { question: "上野・渋谷", area: "渋谷", category: undefined, reason: "other" },
    ]);
  });

  it("aggregate_dataset / get_provenance の未回答も記録される", async () => {
    expectUnanswered(await aggregate({ datasetId: MEISHO.datasetId, intent: "新宿の寺を1件" }));
    expectUnanswered(await provenance({ datasetIds: ["存在しないID"], query: "上野の寺社" }));

    expect((await readGapRows()).map((row) => row.reason)).toEqual(["out_of_area", "other"]);
  });

  it("入力の形が壊れている 400 は記録しない（データ欠損ではない）", async () => {
    const response = await postJson("/api/search-datasets", { query: "" });
    expect(response.status).toBe(400);

    expect(await readGapRows()).toEqual([]);
  });
});
