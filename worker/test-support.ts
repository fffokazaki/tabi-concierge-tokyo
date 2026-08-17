import type { D1Migration } from "@cloudflare/vitest-pool-workers";
import { applyD1Migrations, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
// env は "cloudflare:test" からも取れるが非推奨。本番コードと同じ入口から取る。
import { env } from "cloudflare:workers";
import { assert } from "vitest";
import type { GapRecord, GapRecorder } from "./core/gaps";
import app from "./index";

/** Worker を1回叩いて応答を返す。ExecutionContext の後始末まで面倒をみる。 */
export async function request(path: string, init?: RequestInit): Promise<Response> {
  const ctx = createExecutionContext();
  const response = await app.fetch(new Request(`https://example.com${path}`, init), env, ctx);
  await waitOnExecutionContext(ctx);
  return response;
}

/** JSON ボディつきの POST。`/api/*` の3操作はすべてこの形で呼ぶ。 */
export const postJson = (path: string, body: unknown): Promise<Response> =>
  postRaw(path, JSON.stringify(body));

/** ボディを文字列のまま送る。壊れた JSON や空ボディの扱いを確かめるため。 */
export const postRaw = (path: string, body: string): Promise<Response> =>
  request(path, { method: "POST", headers: { "content-type": "application/json" }, body });

export const readJson = async <T>(response: Response): Promise<T> => (await response.json()) as T;

/**
 * `answered` であることを表明し、以降のフィールドアクセスを型として通す。
 *
 * `expect(body.status).toBe("answered")` と `if (body.status !== "answered") return;` の
 * 2行に分けて書くと、`expect` を落としたときテストが**何も検証せずに緑**になる。
 * 表明と絞り込みを1つにして、その失敗の形を構造的に無くす。
 */
export function expectAnswered<T extends { status: string }>(body: T): Extract<T, { status: "answered" }> {
  assert(body.status === "answered", `answered を期待したが ${JSON.stringify(body)}`);
  return body as Extract<T, { status: "answered" }>;
}

/** `unanswered` であることを表明する。`expectAnswered` と同じ理由で1つにまとめてある。 */
export function expectUnanswered<T extends { status: string }>(body: T): Extract<T, { status: "unanswered" }> {
  assert(body.status === "unanswered", `unanswered を期待したが ${JSON.stringify(body)}`);
  return body as Extract<T, { status: "unanswered" }>;
}

/**
 * TEST_MIGRATIONS は vitest.worker.config.ts がテスト時にだけ注入するバインディング。
 * 本番の `Env` は wrangler.jsonc から生成されるためこれを含まない。
 */
type TestEnv = Cloudflare.Env & { TEST_MIGRATIONS: D1Migration[] };

/**
 * D1 のスキーマを適用する。
 *
 * vitest-pool-workers の D1 は**テストファイルごとに空で立ち上がる**。適用を忘れると
 * `gaps` への INSERT が "no such table" で落ちるが、`d1GapRecorder` はそれを握りつぶさず
 * ログに出しつつ応答は返すため、**テストは緑のまま記録だけが失われる**。
 * 記録を検査するファイルでは必ず呼ぶこと。
 */
export const applyMigrations = (): Promise<void> =>
  applyD1Migrations((env as TestEnv).DB, (env as TestEnv).TEST_MIGRATIONS);

/** `gaps` テーブルの現在の行。記録の検査に使う。 */
export const readGapRows = async (): Promise<GapRecord[]> => {
  const { results } = await env.DB.prepare(
    "SELECT question, area, category, reason FROM gaps ORDER BY id",
  ).all<{ question: string; area: string | null; category: string | null; reason: GapRecord["reason"] }>();
  return results.map((row) => ({
    question: row.question,
    area: row.area ?? undefined,
    category: row.category ?? undefined,
    reason: row.reason,
  }));
};

/** `gaps` を空にする。テスト間で行数の期待値が持ち越されないように使う。 */
export const clearGaps = (): Promise<unknown> => env.DB.prepare("DELETE FROM gaps").run();

/**
 * 記録内容を配列に貯めるだけの記録器。
 *
 * コア関数を直接呼ぶテスト（`/mcp` 相当の経路）で、D1 を介さずに
 * 「何が記録されたか」を検査するために使う。
 */
export function capturingGapRecorder(): GapRecorder & { readonly records: GapRecord[] } {
  const records: GapRecord[] = [];
  return {
    records,
    async record(next) {
      records.push(...next);
    },
  };
}
