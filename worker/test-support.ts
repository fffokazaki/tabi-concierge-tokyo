import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
// env は "cloudflare:test" からも取れるが非推奨。本番コードと同じ入口から取る。
import { env } from "cloudflare:workers";
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
  request(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
