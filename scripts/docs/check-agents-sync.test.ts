import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SHARED_MARKER, collectSyncProblems } from "./check-agents-sync";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

/** マーカーの下に共有本文を持つ、正常な形のファイルを組み立てる。 */
function file(header: string, shared: string): string {
  return [header, "", SHARED_MARKER, "", shared, ""].join("\n");
}

describe("collectSyncProblems", () => {
  it("マーカー以降が一字一句同じなら問題を報告しない", () => {
    const problems = collectSyncProblems([
      { label: "CLAUDE.md", content: file("# CLAUDE.md", "## 絶対に守ること\n\n推測で埋めない。") },
      { label: "AGENTS.md", content: file("# AGENTS.md", "## 絶対に守ること\n\n推測で埋めない。") },
    ]);

    expect(problems).toEqual([]);
  });

  it("マーカーより上（各ファイル固有の見出し）が違っても問題にしない", () => {
    const problems = collectSyncProblems([
      { label: "CLAUDE.md", content: file("# CLAUDE.md\n\nClaude Code 向け。", "共有本文") },
      { label: "AGENTS.md", content: file("# AGENTS.md\n\nCodex CLI 向け。", "共有本文") },
    ]);

    expect(problems).toEqual([]);
  });

  it("マーカー以降が食い違ったら、最初に食い違った行を指して報告する", () => {
    const problems = collectSyncProblems([
      { label: "CLAUDE.md", content: file("# CLAUDE.md", "1行目\n2行目\n3行目") },
      { label: "AGENTS.md", content: file("# AGENTS.md", "1行目\n2行目は違う\n3行目") },
    ]);

    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("CLAUDE.md");
    expect(problems[0]).toContain("AGENTS.md");
    // 共有本文の 2 行目 = CLAUDE.md の 6 行目・AGENTS.md の 6 行目
    expect(problems[0]).toContain("2行目は違う");
  });

  it("マーカーが無いファイルがあれば、両方とも無くても問題として報告する", () => {
    // 「マーカーが無い → 共有部分は空文字 → 空同士で一致」で素通りすると、
    // 検査そのものが空振りしていることに誰も気づけない（偽の防波堤）。
    const problems = collectSyncProblems([
      { label: "CLAUDE.md", content: "# CLAUDE.md\n\nマーカーを消してしまった。\n" },
      { label: "AGENTS.md", content: "# AGENTS.md\n\nマーカーを消してしまった。\n" },
    ]);

    expect(problems).toHaveLength(2);
    expect(problems[0]).toContain("CLAUDE.md");
    expect(problems[1]).toContain("AGENTS.md");
    expect(problems.join("\n")).toContain(SHARED_MARKER);
  });

  it("マーカーが2回出てくるファイルは、どこからが共有本文か決まらないので問題として報告する", () => {
    const problems = collectSyncProblems([
      {
        label: "CLAUDE.md",
        content: ["# CLAUDE.md", SHARED_MARKER, "共有本文", SHARED_MARKER, ""].join("\n"),
      },
      { label: "AGENTS.md", content: file("# AGENTS.md", "共有本文") },
    ]);

    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("CLAUDE.md");
    expect(problems[0]).toContain("2");
  });

  it("マーカーが末尾にあって共有本文が空なら問題として報告する", () => {
    const problems = collectSyncProblems([
      { label: "CLAUDE.md", content: `# CLAUDE.md\n\n${SHARED_MARKER}\n` },
      { label: "AGENTS.md", content: `# AGENTS.md\n\n${SHARED_MARKER}\n` },
    ]);

    expect(problems).toHaveLength(2);
    expect(problems.join("\n")).toContain("空");
  });

  it("末尾の改行の有無だけの違いは問題にしない", () => {
    const shared = `${SHARED_MARKER}\n\n共有本文`;
    const problems = collectSyncProblems([
      { label: "CLAUDE.md", content: `# CLAUDE.md\n\n${shared}\n` },
      { label: "AGENTS.md", content: `# AGENTS.md\n\n${shared}\n\n\n` },
    ]);

    expect(problems).toEqual([]);
  });
});

describe("実ファイル", () => {
  it("CLAUDE.md と AGENTS.md の共有本文が一致している", () => {
    const problems = collectSyncProblems([
      { label: "CLAUDE.md", content: fs.readFileSync("CLAUDE.md", "utf8") },
      { label: "AGENTS.md", content: fs.readFileSync("AGENTS.md", "utf8") },
    ]);

    expect(problems).toEqual([]);
  });
});

describe("行の増減", () => {
  it("片方だけ行が多いときは、足りない側を「（行が無い）」と示して報告する", () => {
    const problems = collectSyncProblems([
      { label: "CLAUDE.md", content: file("# CLAUDE.md", "1行目\n2行目") },
      { label: "AGENTS.md", content: file("# AGENTS.md", "1行目") },
    ]);

    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("（行が無い）");
    expect(problems[0]).toContain("2行目");
  });

  it("食い違った行の行番号を、両ファイルのファイル内行番号で示す", () => {
    // file() が作る形: 1行目=見出し / 2行目=空行 / 3行目=マーカー / 4行目=空行 / 5行目〜=共有本文
    const problems = collectSyncProblems([
      { label: "CLAUDE.md", content: file("# CLAUDE.md", "1行目\n2行目") },
      { label: "AGENTS.md", content: file("# AGENTS.md", "1行目\n2行目は違う") },
    ]);

    expect(problems[0]).toContain("CLAUDE.md:6");
    expect(problems[0]).toContain("AGENTS.md:6");
  });
});

describe("改行コード", () => {
  it("LF と CRLF の違いだけでは落とさない", () => {
    // どちらか片方を Windows で編集しただけで CI が落ちるのは、指示内容のドリフトではない。
    const shared = file("# 見出し", "共有本文\n2行目");
    const problems = collectSyncProblems([
      { label: "CLAUDE.md", content: shared },
      { label: "AGENTS.md", content: shared.replace(/\n/g, "\r\n") },
    ]);

    expect(problems).toEqual([]);
  });
});

describe("CLI（CI が実際に叩く経路）", () => {
  /**
   * `node scripts/docs/check-agents-sync.ts <a> <b>` を実際に起動して終了コードを見る。
   *
   * 比較関数が正しくても、エントリーポイントの条件（`import.meta.filename ===
   * process.argv[1]`）や終了コードの配線が壊れていれば **CI は緑のまま素通りする**。
   * そこは関数を直接呼ぶテストでは踏めないので、プロセスとして起動する。
   */
  function runCli(args: string[]): { status: number; output: string } {
    const result = spawnSync("node", ["scripts/docs/check-agents-sync.ts", ...args], {
      encoding: "utf8",
    });
    return { status: result.status ?? -1, output: `${result.stdout}${result.stderr}` };
  }

  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "agents-sync-"));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  /** 一時ファイルを書いてパスを返す。 */
  function write(name: string, content: string): string {
    const target = path.join(dir, name);
    fs.writeFileSync(target, content);
    return target;
  }

  it("共有本文が一致していれば終了コード 0", () => {
    const a = write("a.md", file("# A", "共有本文"));
    const b = write("b.md", file("# B", "共有本文"));

    const { status, output } = runCli([a, b]);

    expect(status).toBe(0);
    expect(output).toContain("OK");
  });

  it("共有本文が食い違っていれば終了コード 1", () => {
    const a = write("a.md", file("# A", "共有本文"));
    const b = write("b.md", file("# B", "違う共有本文"));

    const { status, output } = runCli([a, b]);

    expect(status).toBe(1);
    expect(output).toContain("食い違っている");
  });

  it("ファイルを読めなければ終了コード 2（違反 1 と区別する）", () => {
    const a = write("a.md", file("# A", "共有本文"));

    const { status, output } = runCli([a, path.join(dir, "存在しない.md")]);

    expect(status).toBe(2);
    expect(output).toContain("読めない");
  });
});
