import { spawnSync } from "node:child_process";

import { describe, expect, it } from "vitest";

import {
  extractRows,
  findSqlProblem,
  parseArgs,
  runQuery,
  type Target,
  type WranglerResult,
} from "./query.ts";

/**
 * wrangler `d1 execute --json` が実際に返した stdout（2026-08-22 実測・本番 D1）。
 * `SELECT name, category, area FROM spots WHERE area = '上野' ORDER BY name LIMIT 3` の
 * 応答から meta の一部を抜粋した。結果行が meta に押し出されるのがこのツールの動機なので、
 * テストも「本物の形」から meta だけを落とせているかで判定する。
 *
 * **3 行あるのは意図的。** 1 行だと「先頭 1 行だけ返す」実装でもテストが通ってしまう。
 *
 * **`id` を含めないのも意図的。** `spots.id` は AUTOINCREMENT で、`DELETE` + 再シードを
 * 通すと採番が続きから振られる（実測: 1..1645 → 1646..3290）。id を写し取ると、
 * 正当な再シードのあとに「実測」の主張が実際の応答と合わなくなる。
 */
const REAL_PAYLOAD = JSON.stringify([
  {
    results: [
      { name: "&Here TOKYO UENO", category: "旅館・ホテル営業", area: "上野" },
      { name: "88ｹﾞｽﾄﾊｳｽ", category: "簡易宿所営業", area: "上野" },
      { name: "Air Stay 入谷", category: "旅館・ホテル営業", area: "上野" },
    ],
    success: true,
    meta: {
      served_by: "v3-prod",
      duration: 0.2727,
      changes: 0,
      size_after: 507904,
      rows_read: 3,
      rows_written: 0,
    },
  },
]);

/** 複数文を送ったときに wrangler が返す形（2026-08-22 実測。文ごとの結果が並ぶ平らな配列）。 */
const TWO_STATEMENT_PAYLOAD = JSON.stringify([
  { results: [{ a: 1 }], success: true, meta: {} },
  { results: [{ b: 2 }], success: true, meta: {} },
]);

describe("extractRows", () => {
  it("応答から結果行だけを取り出す（meta を落とし、行は切り詰めない）", () => {
    expect(extractRows(REAL_PAYLOAD)).toEqual({
      rows: [
        { name: "&Here TOKYO UENO", category: "旅館・ホテル営業", area: "上野" },
        { name: "88ｹﾞｽﾄﾊｳｽ", category: "簡易宿所営業", area: "上野" },
        { name: "Air Stay 入谷", category: "旅館・ホテル営業", area: "上野" },
      ],
    });
  });

  it("0 行の結果はそのまま空配列を返す（照会は成立している）", () => {
    const payload = JSON.stringify([{ results: [], success: true, meta: {} }]);

    expect(extractRows(payload)).toEqual({ rows: [] });
  });

  it("success が false の応答は問題として返す（空の結果として通さない）", () => {
    const payload = JSON.stringify([{ results: [], success: false, meta: {} }]);

    const result = extractRows(payload);

    expect(result).toEqual({ problem: expect.stringContaining("success") });
  });

  it("stdout が空なら 0 件ではなく問題として返す", () => {
    expect(extractRows("   ")).toEqual({ problem: expect.stringContaining("0 件ではない") });
  });

  it("JSON として読めない stdout は問題として返す", () => {
    expect(extractRows("✘ [ERROR] something went wrong")).toEqual({
      problem: expect.stringContaining("JSON"),
    });
  });

  it("配列でない JSON（wrangler のエラーオブジェクト）は問題として返す", () => {
    const payload = JSON.stringify({ error: { text: "no such table: nope" } });

    expect(extractRows(payload)).toEqual({ problem: expect.stringContaining("配列ではない") });
  });

  it("空配列は問題として返す（1 文も実行されていない）", () => {
    expect(extractRows("[]")).toEqual({ problem: expect.stringContaining("1 文も実行しなかった") });
  });

  it("複数文ぶんの応答は問題として返す（1 文目だけ黙って返さない）", () => {
    expect(extractRows(TWO_STATEMENT_PAYLOAD)).toEqual({
      problem: expect.stringContaining("2 文ぶん"),
    });
  });

  it("results が配列でない応答は問題として返す", () => {
    const payload = JSON.stringify([{ results: null, success: true, meta: {} }]);

    expect(extractRows(payload)).toEqual({ problem: expect.stringContaining("results") });
  });
});

describe("findSqlProblem", () => {
  it("単一の SELECT は通す", () => {
    expect(findSqlProblem("SELECT COUNT(*) AS n FROM spots")).toBeNull();
  });

  it("末尾のセミコロン 1 個は書き方の揺れとして通す", () => {
    expect(findSqlProblem("SELECT 1;  ")).toBeNull();
  });

  it("WITH で始まる 1 文も通す", () => {
    expect(findSqlProblem("WITH x AS (SELECT 1 AS n) SELECT * FROM x")).toBeNull();
  });

  it("gaps（未回答ログ）の点検は通す — LLM 向けの sql-guard とは別ポリシー", () => {
    expect(findSqlProblem("SELECT COUNT(*) AS n FROM gaps")).toBeNull();
  });

  it("文字列リテラルの中のセミコロンは複数文と誤判定しない", () => {
    expect(findSqlProblem("SELECT * FROM spots WHERE name = 'a;b'")).toBeNull();
  });

  it("行コメントの中のセミコロンは複数文と誤判定しない", () => {
    expect(findSqlProblem("SELECT 1 -- ;\n")).toBeNull();
  });

  it("ブロックコメントの中のセミコロンは複数文と誤判定しない", () => {
    expect(findSqlProblem("SELECT /* ; */ 1")).toBeNull();
  });

  it("コメントや文字列の中の書き込み語では止めない", () => {
    expect(findSqlProblem("SELECT * FROM spots WHERE note LIKE '%delete%' -- update\n")).toBeNull();
  });

  it("update_frequency のような列名を書き込み語と誤判定しない", () => {
    expect(findSqlProblem("SELECT update_frequency FROM datasets")).toBeNull();
  });

  it("セミコロンで区切った 2 文目は wrangler を起動する前に弾く", () => {
    expect(findSqlProblem("SELECT 1; DELETE FROM spots")).toContain("複数文");
  });

  it("DELETE を弾く", () => {
    expect(findSqlProblem("DELETE FROM spots")).not.toBeNull();
  });

  it("UPDATE を弾く", () => {
    expect(findSqlProblem("UPDATE spots SET name = 'x'")).not.toBeNull();
  });

  it("DROP TABLE を弾く", () => {
    expect(findSqlProblem("DROP TABLE spots")).not.toBeNull();
  });

  it("PRAGMA を弾く", () => {
    expect(findSqlProblem("PRAGMA table_list")).not.toBeNull();
  });

  it("先頭のコメントで書き込み文を隠しても弾く", () => {
    expect(findSqlProblem("/* SELECT */ DELETE FROM spots")).not.toBeNull();
  });

  it("SQLite が受け付ける WITH … DELETE を弾く（先頭の語だけでは足りない）", () => {
    expect(findSqlProblem("WITH x AS (SELECT id FROM spots) DELETE FROM spots")).not.toBeNull();
  });

  it("コメントだけで実体が無い SQL を弾く", () => {
    expect(findSqlProblem("-- SELECT 1\n")).not.toBeNull();
  });
});

describe("parseArgs", () => {
  it("--remote と SQL を受け取る", () => {
    expect(parseArgs(["--remote", "SELECT COUNT(*) AS n FROM spots"])).toEqual({
      target: "--remote",
      sql: "SELECT COUNT(*) AS n FROM spots",
    });
  });

  it("--local と SQL を受け取る", () => {
    expect(parseArgs(["--local", "SELECT 1"])).toEqual({ target: "--local", sql: "SELECT 1" });
  });

  it("SQL が無ければ問題として返す", () => {
    expect(parseArgs(["--remote"])).toEqual({ problem: expect.stringContaining("渡されていない") });
  });

  it("SQL が空白だけなら問題として返す", () => {
    expect(parseArgs(["--remote", "   "])).toEqual({ problem: expect.stringContaining("空") });
  });

  it("SQL が 2 つ以上に割れていたらクォート忘れとして案内する", () => {
    const result = parseArgs(["--remote", "SELECT", "COUNT(*)", "FROM", "spots"]);

    expect(result).toEqual({ problem: expect.stringContaining("クォート") });
  });

  it("接続先フラグを自分で足した呼び方は、クォート忘れと取り違えずに案内する", () => {
    // `npm run db:query -- --local "SELECT 1"` の argv。クォートは正しく囲まれているので、
    // 「クォート忘れ」と言うのは誤診になる。
    const result = parseArgs(["--remote", "--local", "SELECT 1"]);

    expect(result).toEqual({ problem: expect.stringContaining("db:query:local") });
  });

  it("接続先の指定が無ければ問題として返す", () => {
    expect(parseArgs(["SELECT 1"])).toEqual({ problem: expect.stringContaining("接続先") });
  });
});

describe("runQuery", () => {
  const ok = (stdout: string): WranglerResult => ({
    status: 0,
    signal: null,
    stdout,
    stderr: "",
  });

  /** 呼ばれたことと、渡された引数を記録する runner。 */
  function recordingRunner(result: WranglerResult) {
    const calls: Array<{ target: Target; sql: string }> = [];
    return {
      calls,
      run: (target: Target, sql: string) => {
        calls.push({ target, sql });
        return result;
      },
    };
  }

  it("結果行を stdout へ、終了コード 0 を返す", () => {
    const outcome = runQuery(["--remote", "SELECT 1"], () => ok(REAL_PAYLOAD));

    expect(outcome.exitCode).toBe(0);
    expect(JSON.parse(outcome.stdout)).toHaveLength(3);
  });

  it("0 行の結果は [] を stdout へ出す（失敗と区別できる形で）", () => {
    const payload = JSON.stringify([{ results: [], success: true, meta: {} }]);

    const outcome = runQuery(["--remote", "SELECT 1"], () => ok(payload));

    expect(outcome).toMatchObject({ stdout: "[]", exitCode: 0 });
  });

  it("接続先と SQL をそのまま wrangler へ渡す", () => {
    const runner = recordingRunner(ok(REAL_PAYLOAD));

    runQuery(["--local", "SELECT 1"], runner.run);

    expect(runner.calls).toEqual([{ target: "--local", sql: "SELECT 1" }]);
  });

  it("書き込み SQL では wrangler を起動しない（副作用を出す前に止める）", () => {
    const runner = recordingRunner(ok(REAL_PAYLOAD));

    const outcome = runQuery(["--remote", "SELECT 1; DELETE FROM spots"], runner.run);

    expect(runner.calls).toEqual([]);
    expect(outcome.stdout).toBe("");
    expect(outcome.exitCode).toBe(2);
  });

  it("引数が壊れているときも wrangler を起動しない", () => {
    const runner = recordingRunner(ok(REAL_PAYLOAD));

    const outcome = runQuery(["--remote"], runner.run);

    expect(runner.calls).toEqual([]);
    expect(outcome).toMatchObject({ stdout: "", exitCode: 2 });
  });

  it("wrangler が非 0 で終わったら stdout を空にし、失敗の中身を stderr へ回す", () => {
    const wranglerStdout = JSON.stringify({ error: { text: "no such table: nope" } });

    const outcome = runQuery(["--remote", "SELECT 1"], () => ({
      status: 1,
      signal: null,
      stdout: wranglerStdout,
      stderr: "",
    }));

    expect(outcome.stdout).toBe("");
    expect(outcome.exitCode).toBe(1);
    // wrangler は失敗の中身も stdout に書く。捨てずに stderr 側へ回す。
    expect(outcome.stderr.join("\n")).toContain("no such table: nope");
  });

  it("wrangler が 2 で終わっても 1 へ畳む（使い方の誤りと区別する）", () => {
    const outcome = runQuery(["--remote", "SELECT 1"], () => ({
      status: 2,
      signal: null,
      stdout: "",
      stderr: "",
    }));

    expect(outcome).toMatchObject({ stdout: "", exitCode: 1 });
    expect(outcome.stderr.join("\n")).toContain("exit 2");
  });

  it("シグナルで終わった（status が null）ときも失敗として扱う", () => {
    const outcome = runQuery(["--remote", "SELECT 1"], () => ({
      status: null,
      signal: "SIGKILL",
      stdout: "",
      stderr: "",
    }));

    expect(outcome).toMatchObject({ stdout: "", exitCode: 1 });
    expect(outcome.stderr.join("\n")).toContain("SIGKILL");
  });

  it("wrangler を起動できなかったときも失敗として扱う", () => {
    const outcome = runQuery(["--remote", "SELECT 1"], () => ({
      status: null,
      signal: null,
      stdout: "",
      stderr: "",
      error: new Error("spawnSync wrangler ENOENT"),
    }));

    expect(outcome).toMatchObject({ stdout: "", exitCode: 1 });
    expect(outcome.stderr.join("\n")).toContain("ENOENT");
  });

  it("出力が上限を超えて打ち切られたときは「起動できなかった」と言わない", () => {
    const enobufs = Object.assign(new Error("spawnSync maxBuffer exceeded"), { code: "ENOBUFS" });

    const outcome = runQuery(["--remote", "SELECT * FROM spots"], () => ({
      status: null,
      signal: null,
      stdout: "",
      stderr: "",
      error: enobufs,
    }));

    expect(outcome).toMatchObject({ stdout: "", exitCode: 1 });
    expect(outcome.stderr.join("\n")).toContain("0 件ではない");
  });

  it("応答が来ないまま打ち切られたときも「0 件ではない」と言う", () => {
    const etimedout = Object.assign(new Error("spawnSync ETIMEDOUT"), { code: "ETIMEDOUT" });

    const outcome = runQuery(["--remote", "SELECT 1"], () => ({
      status: null,
      signal: null,
      stdout: "",
      stderr: "",
      error: etimedout,
    }));

    expect(outcome).toMatchObject({ stdout: "", exitCode: 1 });
    expect(outcome.stderr.join("\n")).toContain("0 件ではない");
  });

  it("終了コード 0 でも応答が読めなければ stdout に何も書かない", () => {
    const outcome = runQuery(["--remote", "SELECT 1"], () => ok("not json"));

    expect(outcome).toMatchObject({ stdout: "", exitCode: 1 });
  });
});

describe("CLI（npm script が実際に叩く経路）", () => {
  /**
   * `node scripts/db/query.ts …` を実際に起動する。
   *
   * 関数が正しくても、エントリーポイントの条件（`import.meta.filename === process.argv[1]`）や
   * 終了コードの配線、`console.log` / `console.error` の振り分けが壊れていれば、
   * 関数を直接呼ぶテストは緑のまま素通りする。
   *
   * **`--remote` は絶対に渡さない。** 検査対象のガードが壊れた瞬間に、テストが本番 D1 へ
   * SQL を流すことになる。実際にこの PR の作業中、ガードをスタブにしたまま
   * `runCli(["--remote", "DELETE FROM spots"])` を走らせて本番の spots 1,645 行を消した
   * （`npm run db:seed` で復旧・`datasets` と `gaps` は無傷）。テストは「壊れたときに
   * 落ちる」ものであって「壊れたときに壊す」ものではない。書き込み SQL を実際に
   * 起動する経路へ通すなら、宛先は必ず `--local` にする。
   */
  function runCli(args: string[]): { status: number; stdout: string; stderr: string } {
    const result = spawnSync("node", ["scripts/db/query.ts", ...args], { encoding: "utf8" });
    return { status: result.status ?? -1, stdout: result.stdout, stderr: result.stderr };
  }

  it("引数なしで起動したら終了コード 2（エントリガードが空振りすると 0 になる）", () => {
    const result = runCli([]);

    expect(result.status).toBe(2);
    expect(result.stdout).toBe("");
  });

  it("SQL を渡さなければ終了コード 2 で、stdout は空", () => {
    const result = runCli(["--local"]);

    expect(result.status).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("db:query");
  });

  it("書き込み SQL は終了コード 2 で止まり、stdout は空", () => {
    // 宛先は --local。ガードが壊れていたら消えるのはローカルの（未適用の）DB だけになる。
    const result = runCli(["--local", "DELETE FROM spots"]);

    expect(result.status).toBe(2);
    expect(result.stdout).toBe("");
  });
});
