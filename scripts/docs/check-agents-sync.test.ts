import { describe, expect, it } from "vitest";
import { SHARED_MARKER, collectSyncProblems } from "./check-agents-sync";

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
  it("CLAUDE.md と AGENTS.md の共有本文が一致している", async () => {
    const fs = await import("node:fs");
    const problems = collectSyncProblems([
      { label: "CLAUDE.md", content: fs.readFileSync("CLAUDE.md", "utf8") },
      { label: "AGENTS.md", content: fs.readFileSync("AGENTS.md", "utf8") },
    ]);

    expect(problems).toEqual([]);
  });
});
