/**
 * 開発用 API コンソールの「叩いて分類する」部分。
 *
 * DOM に依存しない。`health.ts` と同じ分離で、「取得して判定する」までをここに置き、
 * 「表示する」は ApiConsole.tsx が持つ。失敗の種別も health.ts と同じ方針で潰さない
 * （network と parse を同じ文言にすると、原因と逆方向へデバッグを誘導する）。
 *
 * コンソールは応答をそのまま見せる道具なので、応答の**形の検証はしない**。
 * 形を検証して弾いてしまうと、「サーバーが仕様外の応答を返している」というまさに
 * 見たい事象が画面に出なくなる。JSON として読めれば ok として生の値を返す。
 */

/** コンソールが叩ける操作。パスは API.md §3 の確定値 */
export const CONSOLE_ENDPOINTS = {
  search_datasets: "/api/search-datasets",
  aggregate_dataset: "/api/aggregate-dataset",
  get_provenance: "/api/provenance",
} as const;

export type ConsoleOperation = keyof typeof CONSOLE_ENDPOINTS;

/**
 * 1回の呼び出しの結果。`ok` は HTTP 2xx かつ JSON として読めたことだけを意味する。
 * `answered` / `unanswered` の別は応答ボディ側の `status` であり、ここでは区別しない
 * （どちらも正常応答。API.md §4）。
 */
export type ConsoleResult =
  /** 2xx で JSON が読めた。`body` は応答そのもの */
  | { kind: "ok"; status: number; elapsedMs: number; body: unknown }
  /** 4xx/5xx。JSON なら `body` に入れる（Worker の ApiError を想定）。読めなければ text を入れる */
  | { kind: "http"; status: number; elapsedMs: number; body: unknown; rawText?: string }
  /** リクエストがサーバーまで届かなかった */
  | { kind: "network"; elapsedMs: number; detail: string }
  /** 2xx だが JSON として読めない（プロキシの HTML 差し込み等） */
  | { kind: "parse"; status: number; elapsedMs: number; detail: string; rawText: string };

/**
 * コア操作を1回叩いて分類する。例外は投げない。
 *
 * @param options.fetchImpl テストから応答を差し替えるための注入口
 * @param options.now 所要時間の計測用（テストで固定できるようにする）
 */
export async function callOperation(
  operation: ConsoleOperation,
  requestBody: unknown,
  options: { fetchImpl?: typeof fetch; now?: () => number } = {},
): Promise<ConsoleResult> {
  const { fetchImpl = fetch, now = () => performance.now() } = options;
  const startedAt = now();
  const elapsed = () => Math.round(now() - startedAt);

  let response: Response;
  try {
    response = await fetchImpl(CONSOLE_ENDPOINTS[operation], {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(requestBody),
    });
  } catch (cause) {
    return { kind: "network", elapsedMs: elapsed(), detail: toMessage(cause) };
  }

  // text() で読んでから JSON.parse する。response.json() だと、壊れた応答のときに
  // 例外だけが残ってボディが消え、原因を指す唯一の手がかりを失う（health.ts と同じ理由）
  let text: string;
  try {
    text = await response.text();
  } catch (cause) {
    return { kind: "network", elapsedMs: elapsed(), detail: toMessage(cause) };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (cause) {
    if (!response.ok) {
      // 4xx/5xx で非 JSON（Cloudflare のエラーページ等）。http として見せる
      return { kind: "http", status: response.status, elapsedMs: elapsed(), body: undefined, rawText: text };
    }
    return { kind: "parse", status: response.status, elapsedMs: elapsed(), detail: toMessage(cause), rawText: text };
  }

  if (!response.ok) {
    return { kind: "http", status: response.status, elapsedMs: elapsed(), body: parsed };
  }
  return { kind: "ok", status: response.status, elapsedMs: elapsed(), body: parsed };
}

/**
 * 応答ボディの `status` を覗く。表示のバッジ分けに使う。
 * 仕様外の値でも落とさず "unknown" にする（コンソールは仕様外をそのまま見せる道具）。
 */
export function peekAnswerStatus(body: unknown): "answered" | "unanswered" | "unknown" {
  if (typeof body === "object" && body !== null && "status" in body) {
    const status = (body as { status: unknown }).status;
    if (status === "answered" || status === "unanswered") return status;
  }
  return "unknown";
}

function toMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
