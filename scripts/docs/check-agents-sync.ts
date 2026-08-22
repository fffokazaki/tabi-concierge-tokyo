/**
 * CLAUDE.md と AGENTS.md の共有本文が一字一句同じであることを検査する（Issue #136）。
 *
 * 2 ファイルは「AI エージェント向けの指示」という同じ役割を持ち、どちらも
 * **単独で完結している**（外部ファイルを読ませない）ことを設計方針にしている。
 * そのため共通部分を別ファイルへ切り出す道は取れず、写しを 2 つ持つしかない。
 *
 * 写しは黙ってずれる。実際 AGENTS.md は冒頭で「内容は CLAUDE.md と同一」と宣言しながら
 * 中身は要約版で、`## 絶対に守ること` 以降だけで 70 行以上の差があった。その結果
 * 「レビューは設計判断を含む変更・出典強制に触れる変更では必ず見る」（CLAUDE.md 側）と
 * 「`version` は SemVer」（AGENTS.md 側）が、それぞれ片方の読み手にだけ届いていなかった。
 * 宣言だけでは守れないので、機械で照合する。
 *
 * 共有本文はマーカー行 `<!-- agent-instructions:shared:start -->` から EOF まで。
 * マーカーより上（タイトルと「誰向けか」の 1〜2 段落）はファイルごとに違ってよい。
 *
 * **マーカーが無いファイルは合格にしない。** 「マーカーが無い → 共有部分は空文字 →
 * 空同士で一致」で素通りさせると、検査そのものが空振りしていることに誰も気づけない。
 * 同じ理由で、マーカーが 2 個あるファイルと、マーカー以降が空のファイルも落とす。
 *
 * 実行例: node scripts/docs/check-agents-sync.ts CLAUDE.md AGENTS.md
 */
import * as fs from "node:fs";
import * as process from "node:process";

const EXIT_OK = 0;
const EXIT_VIOLATION = 1;
const EXIT_USAGE_ERROR = 2;

/** 共有本文の始まりを示すマーカー行。両ファイルにちょうど 1 個ずつ必要。 */
export const SHARED_MARKER = "<!-- agent-instructions:shared:start -->";

/** 既定の検査対象。リポジトリルートからの相対パス。 */
export const DEFAULT_TARGETS = ["CLAUDE.md", "AGENTS.md"];

export interface AgentDoc {
  /** メッセージに出すファイル名。 */
  label: string;
  content: string;
}

interface SharedSection {
  label: string;
  /** 共有本文の各行（末尾の空行は落としてある）。 */
  lines: string[];
  /** 共有本文の 1 行目が、ファイル全体では何行目か（1 始まり）。 */
  firstLineNo: number;
}

/** 1 ファイルから共有本文を取り出す。取り出せない形なら理由を返す。 */
function extractSharedSection(doc: AgentDoc): SharedSection | { problem: string } {
  const lines = doc.content.split("\n");
  const markerIndexes = lines
    .map((line, index) => (line.trim() === SHARED_MARKER ? index : -1))
    .filter((index) => index >= 0);

  if (markerIndexes.length === 0) {
    return {
      problem: `${doc.label}: マーカー行 \`${SHARED_MARKER}\` が無い。共有本文の始まりが分からないため、この検査は何も照合できない`,
    };
  }
  if (markerIndexes.length > 1) {
    return {
      problem: `${doc.label}: マーカー行 \`${SHARED_MARKER}\` が ${markerIndexes.length} 個ある（${markerIndexes
        .map((index) => index + 1)
        .join(", ")} 行目）。共有本文の始まりが一意に決まらない`,
    };
  }

  const markerIndex = markerIndexes[0];
  const body = lines.slice(markerIndex + 1);
  // 末尾の空行は落とす（ファイル末尾の改行の有無だけで落としたくない）。
  while (body.length > 0 && body[body.length - 1].trim() === "") body.pop();
  // 先頭の空行も落とす。マーカー直後に空行を 1 行置く書き方を強制しないため。
  let leadingBlanks = 0;
  while (leadingBlanks < body.length && body[leadingBlanks].trim() === "") leadingBlanks++;

  if (body.length - leadingBlanks === 0) {
    return {
      problem: `${doc.label}: マーカー行以降が空。マーカーを置いただけで共有本文が入っていない`,
    };
  }

  return {
    label: doc.label,
    lines: body.slice(leadingBlanks),
    firstLineNo: markerIndex + 1 + leadingBlanks + 1,
  };
}

/** 2 つの共有本文を突き合わせ、最初に食い違った行を 1 件だけ報告する。 */
function compare(left: SharedSection, right: SharedSection): string[] {
  const length = Math.max(left.lines.length, right.lines.length);
  for (let offset = 0; offset < length; offset++) {
    const leftLine = left.lines[offset];
    const rightLine = right.lines[offset];
    if (leftLine === rightLine) continue;

    const leftAt = `${left.label}:${left.firstLineNo + offset}`;
    const rightAt = `${right.label}:${right.firstLineNo + offset}`;
    return [
      [
        `共有本文が食い違っている（片方だけ更新した可能性がある）: ${leftAt} / ${rightAt}`,
        `  ${left.label}: ${leftLine ?? "（行が無い）"}`,
        `  ${right.label}: ${rightLine ?? "（行が無い）"}`,
      ].join("\n"),
    ];
  }
  return [];
}

/**
 * 検査本体。問題が無ければ空配列を返す。
 *
 * 取り出しに失敗したファイルがある場合は、そこで止めて突き合わせない
 * （空の共有本文どうしを比べて「一致」と言わせないため）。
 */
export function collectSyncProblems(docs: AgentDoc[]): string[] {
  if (docs.length < 2) {
    return [`検査対象が ${docs.length} 件しかない。CLAUDE.md と AGENTS.md の 2 件が要る`];
  }

  const problems: string[] = [];
  const sections: SharedSection[] = [];
  for (const doc of docs) {
    const result = extractSharedSection(doc);
    if ("problem" in result) {
      problems.push(result.problem);
      continue;
    }
    sections.push(result);
  }
  if (problems.length > 0) return problems;

  for (let index = 1; index < sections.length; index++) {
    problems.push(...compare(sections[0], sections[index]));
  }
  return problems;
}

export function main(argv: string[]): number {
  const targets = argv.length > 0 ? argv : DEFAULT_TARGETS;

  const docs: AgentDoc[] = [];
  for (const target of targets) {
    try {
      docs.push({ label: target, content: fs.readFileSync(target, "utf8") });
    } catch (error) {
      console.error(`[check-agents-sync] ${target} を読めない: ${(error as Error).message}`);
      return EXIT_USAGE_ERROR;
    }
  }

  const problems = collectSyncProblems(docs);
  if (problems.length === 0) {
    console.log(`[check-agents-sync] OK: ${targets.join(" と ")} の共有本文は一致している`);
    return EXIT_OK;
  }

  console.error(`[check-agents-sync] ${problems.length} 件の問題:`);
  for (const problem of problems) console.error(`- ${problem}`);
  console.error(
    `\n直し方: 片方の変更をもう片方へ写し、マーカー \`${SHARED_MARKER}\` 以降を一字一句同じにする。`,
  );
  return EXIT_VIOLATION;
}

if (import.meta.filename === process.argv[1]) {
  process.exit(main(process.argv.slice(2)));
}
