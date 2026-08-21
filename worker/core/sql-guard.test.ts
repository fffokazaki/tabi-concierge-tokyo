import { describe, expect, it } from "vitest";
import { ALLOWED_TABLES, guardSelect, MAX_LIMIT } from "./sql-guard";

/**
 * **このファイルが MASTER.md のセキュリティ要件を実際に担保している** —
 * 「Text-to-SQL で生成したクエリが同梱データ以外へ到達しないこと」。
 *
 * 攻撃ケースの並びは Issue #119 の列挙順ではなく、[Issue #118](https://github.com/fffokazaki/tabi-concierge-tokyo/issues/118)
 * で実測した「この層を抜けたら本当に起きること」の危険度順にしてある。
 *
 * | 抜けたら起きること | 実測（vitest-pool-workers の D1） |
 * | --- | --- |
 * | 複文 | `SELECT 1; DELETE FROM gaps` の2文目が**実行され、行が消えた** |
 * | DML | `DELETE` / `UPDATE` は単文でも**実行された** |
 * | PRAGMA・sqlite_master | **スキーマと内部テーブル名（`_cf_METADATA` 等）が読めた** |
 * | DDL | 拒否された（D1 が止める唯一のもの） |
 *
 * DDL のテストが最後にあるのはそのため — あれが確かめているのは主にこのガードの一貫性で、
 * D1 に寄りかかっていないことの確認である。
 */

/** 通す前提の、正常な問い合わせ。 */
const VALID = "SELECT name, note FROM spots WHERE dataset_id = 't131067d0000000251' AND area = '上野'";

const expectRejected = (sql: string, contains?: string) => {
  const result = guardSelect(sql);
  expect(result.ok, `通ってはいけない SQL が通った: ${sql}`).toBe(false);
  if (!result.ok && contains) expect(result.reason).toContain(contains);
};

const expectAccepted = (sql: string): string => {
  const result = guardSelect(sql);
  expect(result.ok, `通るべき SQL が拒否された: ${sql} / ${result.ok ? "" : result.reason}`).toBe(true);
  return result.ok ? result.sql : "";
};

describe("複文（この層を抜けると本当に実行される）", () => {
  it("セミコロンで区切られた2文を拒否する", () => {
    expectRejected("SELECT 1 FROM spots; DELETE FROM spots", "複数の文");
    expectRejected("SELECT name FROM spots; DROP TABLE spots", "複数の文");
  });

  it("末尾のセミコロンだけは書き方の揺れとして許す", () => {
    expect(expectAccepted(`${VALID};`)).not.toContain(";");
  });

  it("改行や空白をまたいだ複文も拒否する", () => {
    expectRejected(`${VALID}\n  ;\n  DELETE FROM spots`, "複数の文");
  });
});

describe("DML（D1 は止めてくれない）", () => {
  it.each(["DELETE FROM spots", "UPDATE spots SET name = 'x'", "INSERT INTO spots (name) VALUES ('x')"])(
    "%s を拒否する",
    (sql) => expectRejected(sql),
  );

  it("SELECT で始まっていても、途中に DML があれば拒否する", () => {
    expectRejected("SELECT name FROM spots WHERE id IN (DELETE FROM spots RETURNING id)", "delete");
    // RETURNING を使った書き込みは「SELECT に見える書き込み」の典型
    expectRejected("SELECT * FROM spots UNION SELECT 1 FROM spots WHERE (UPDATE spots SET name='x')");
  });
});

describe("スキーマの覗き見（実測で読めてしまった経路）", () => {
  it("PRAGMA を拒否する", () => {
    expectRejected("PRAGMA table_list", "SELECT 文だけ");
    expectRejected("SELECT * FROM spots WHERE 1=1 AND PRAGMA table_list", "pragma");
  });

  it.each(["sqlite_master", "sqlite_schema", "sqlite_temp_master"])("%s を拒否する", (table) => {
    expectRejected(`SELECT name FROM ${table}`);
  });

  it("内部テーブル（d1_migrations / _cf_METADATA）を拒否する", () => {
    expectRejected("SELECT * FROM d1_migrations");
    expectRejected("SELECT * FROM _cf_METADATA");
  });

  it("FROM 走査の視野外に現れた参照も止める（許可リストの受け皿）", () => {
    // 列修飾（`gaps.question`）は FROM に現れないので、テーブル許可リストは見ていない。
    // ここを止めているのは FORBIDDEN_IDENTIFIER_PATTERN だけである。
    //
    // このケース自体は SQLite が「そんな列は無い」で落とすため悪用はできないが、
    // **禁止識別子の検査が実際に発火する唯一のテスト**なので消さないこと。
    // 消すと、あの検査は一度も実行されないまま「守っているつもり」の分岐になる
    expectRejected("SELECT gaps.question FROM spots", "gaps");
    expectRejected("SELECT sqlite_master.name FROM spots", "sqlite_master");
  });

  it("gaps を拒否する（未回答ログはオープンデータではない）", () => {
    // ADR-007 の用途2。回答の材料になってはいけない
    expectRejected("SELECT question FROM gaps", "gaps");
    expectRejected("SELECT * FROM spots JOIN gaps ON 1=1", "gaps");
  });
});

describe("テーブルの許可リスト", () => {
  it.each(ALLOWED_TABLES)("%s は通す", (table) => {
    expectAccepted(`SELECT * FROM ${table} WHERE dataset_id = 'x'`);
  });

  it("知らないテーブルは拒否する（許可側を列挙しているので、名前を知らなくても止まる）", () => {
    expectRejected("SELECT * FROM users", "users");
    expectRejected("SELECT * FROM secrets_2026", "secrets_2026");
  });

  it("カンマ区切りの FROM で1つでも許可外なら拒否する", () => {
    expectRejected("SELECT * FROM spots, users", "users");
  });

  it("JOIN 先も検査する", () => {
    expectAccepted("SELECT s.name FROM spots s JOIN datasets d ON s.dataset_id = d.id");
    expectRejected("SELECT s.name FROM spots s JOIN users u ON 1=1", "users");
  });

  it("サブクエリの FROM も検査する", () => {
    expectRejected("SELECT * FROM spots WHERE id IN (SELECT id FROM users)", "users");
  });

  it("FROM が無い SQL は拒否する（参照先を確かめられない）", () => {
    expectRejected("SELECT 1", "参照するテーブル");
  });
});

describe("コメント偽装・文字列リテラル", () => {
  it("ブロックコメントに隠したセミコロンを見抜く", () => {
    // 走査前にコメントを潰さないと、ここが素通りする
    expectRejected("SELECT name FROM spots /* コメント */ ; DELETE FROM spots", "複数の文");
  });

  it("コメントで禁止語を分断しても拒否する", () => {
    expectRejected("SELECT * FROM spots WHERE 1=1 UNION SELECT * FROM /**/ gaps", "gaps");
  });

  it("行コメントで後続を隠しても、前半だけで判定する", () => {
    expectAccepted(`${VALID} -- ここは無視される ; DELETE FROM spots`);
  });

  it("文字列リテラルの中の禁止語は誤検知しない", () => {
    // 「delete」という語を含む店名などを弾いてしまうと、正当な問い合わせが通らなくなる
    expectAccepted("SELECT name FROM spots WHERE note = 'delete された建物'");
    expectAccepted("SELECT name FROM spots WHERE note = 'gaps という名の店'");
  });

  it("文字列リテラルの中のセミコロンは複文と誤認しない", () => {
    expectAccepted("SELECT name FROM spots WHERE note = 'a;b'");
  });

  it("エスケープされた引用符（'')で文字列を抜けたように見せかけても拒否する", () => {
    expectRejected("SELECT name FROM spots WHERE note = 'it''s'; DELETE FROM spots", "複数の文");
  });
});

describe("LIMIT", () => {
  it("無ければ上限を足す", () => {
    expect(expectAccepted(VALID)).toBe(`${VALID} LIMIT ${MAX_LIMIT}`);
  });

  it("上限以下の指定はそのまま通す", () => {
    const sql = `${VALID} LIMIT 3`;
    expect(expectAccepted(sql)).toBe(sql);
  });

  it("**検査した文字列と実行する文字列を一致させる**（コメントごしの迂回を塞ぐ）", () => {
    // 実測（Issue #119）で見つけた迂回。検査は scrub 済みの文字列で行い、実行は元の文字列を
    // 返していたため、`SELECT * FROM spots; -- comment` が
    // `SELECT * FROM spots; -- comment LIMIT 50` になっていた
    // （LIMIT がコメントの中に入って効かず、セミコロンも実行文に残る）
    const withTrailingComment = expectAccepted("SELECT name FROM spots -- comment");
    expect(withTrailingComment, "コメントが実行文に残っている").not.toContain("--");
    expect(withTrailingComment).toBe(`SELECT name FROM spots LIMIT ${MAX_LIMIT}`);

    const withSemicolonAndComment = expectAccepted("SELECT name FROM spots; -- comment");
    expect(withSemicolonAndComment, "セミコロンが実行文に残っている").not.toContain(";");
    expect(withSemicolonAndComment).toBe(`SELECT name FROM spots LIMIT ${MAX_LIMIT}`);

    const withBlockComment = expectAccepted("SELECT name /* 途中 */ FROM spots");
    expect(withBlockComment).toBe(`SELECT name FROM spots LIMIT ${MAX_LIMIT}`);
  });

  it("カンマ形式・式・OFFSET を含む上限の迂回を拒否する", () => {
    // `LIMIT 0, 100000` は SQLite では OFFSET 0 / LIMIT 100000。緩い正規表現だと
    // 先頭の `0` だけが読まれて「上限以下」に見える（実測で通っていた）
    expectRejected("SELECT name FROM spots LIMIT 0, 100000", "LIMIT は末尾に");
    expectRejected("SELECT name FROM spots LIMIT 1e9", "LIMIT は末尾に");
    // LIMIT の後ろに別の句が続く形も認めない（末尾固定にすることで、後から効く指定を防ぐ）
    expectRejected("SELECT name FROM spots LIMIT 10 UNION SELECT name FROM spots", "LIMIT は末尾に");
  });

  it("末尾の OFFSET つきの正しい形は通す", () => {
    // OFFSET が大きくても返る行数は LIMIT が抑えるので、行数の上限としては問題ない
    expect(expectAccepted("SELECT name FROM spots LIMIT 10 OFFSET 5")).toBe("SELECT name FROM spots LIMIT 10 OFFSET 5");
    // コメントは実行前に落ちるので、末尾コメント付きも正しい形として通る
    expect(expectAccepted("SELECT name FROM spots LIMIT 10 OFFSET 5 -- 補足")).toBe(
      "SELECT name FROM spots LIMIT 10 OFFSET 5",
    );
  });

  it("上限を超える指定は、書き換えずに拒否する", () => {
    // 黙って書き換えると、生成側は自分の指定が無効になったことに気づけない。
    // 拒否すればリトライで直せる（text-to-sql.ts が理由を添えて再生成する）
    expectRejected(`${VALID} LIMIT ${MAX_LIMIT + 1}`, `${MAX_LIMIT} 以下`);
  });
});

describe("DDL（D1 も拒否するが、ここでも止める）", () => {
  // D1 の拒否は実装依存であって保証された仕様として確認したわけではない。寄りかからない
  it.each(["DROP TABLE spots", "ALTER TABLE spots ADD COLUMN x TEXT", "CREATE TABLE x (a TEXT)"])(
    "%s を拒否する",
    (sql) => expectRejected(sql),
  );
});

describe("正常系", () => {
  it("素直な問い合わせを通す", () => {
    expectAccepted("SELECT name, note, source_row FROM spots WHERE dataset_id = 'abc' AND area = '浅草' ORDER BY id LIMIT 1");
  });

  it("空・空白だけは拒否する", () => {
    expectRejected("", "空");
    expectRejected("   \n  ", "空");
  });
});
