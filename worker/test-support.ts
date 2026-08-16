import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
// env は "cloudflare:test" からも取れるが非推奨。本番コードと同じ入口から取る。
import { env } from "cloudflare:workers";
import { assert } from "vitest";
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
