/**
 * `/api/health` の疎通確認。
 *
 * DOM に依存しない。ブラウザを起動せずに全ての失敗経路を検証できるようにするため、
 * 「取得して判定する」までをここに置き、「表示する」は HealthPanel.tsx が持つ。
 */

/** Worker（`worker/index.ts`）が `/api/health` で返す形。 */
export type Health = { status: string; service: string; runtime: string };

/**
 * 疎通確認の結果。失敗は種別を保ったまま返す。
 *
 * 種別を1つの文字列に潰すと、「サーバーに届いていない」と
 * 「サーバーは応答しているが中身が壊れている」が同じ文言になり、
 * 原因と逆方向へデバッグを誘導する。
 */
export type HealthResult =
  /** 応答が来て、形も想定どおり。 */
  | { kind: "ok"; health: Health }
  /** リクエストがサーバーまで届かなかった（DNS・オフライン・CORS 等）。 */
  | { kind: "network"; detail: string }
  /** サーバーは応答したが 4xx/5xx。`body` には Worker が返した理由が入る。 */
  | { kind: "http"; status: number; statusText: string; body: string }
  /** 2xx だが JSON として読めない（プロキシによる HTML 差し込み等）。 */
  | { kind: "parse"; detail: string; body: string }
  /** JSON ではあるが `Health` の形ではない（`{}` や `null` を含む）。 */
  | { kind: "shape"; invalidFields: string[]; body: string }
  /** 呼び出し側が中断した。表示すべき障害ではない。 */
  | { kind: "aborted" };

const HEALTH_ENDPOINT = "/api/health";

/** `Health` として揃っていなければならないフィールド。 */
const HEALTH_FIELDS = ["status", "service", "runtime"] as const;

/** エラー表示に載せる応答ボディの最大文字数。全文を出すと画面が壊れるため切り詰める。 */
const BODY_EXCERPT_LIMIT = 300;

/**
 * `/api/health` を叩き、成否と失敗の種別を返す。例外は投げない。
 *
 * @param options.signal 中断用。中断時は `{ kind: "aborted" }` を返す
 * @param options.fetchImpl テストから応答を差し替えるための注入口
 */
export async function fetchHealth(
  options: { signal?: AbortSignal; fetchImpl?: typeof fetch } = {},
): Promise<HealthResult> {
  const { signal, fetchImpl = fetch } = options;

  let response: Response;
  try {
    response = await fetchImpl(HEALTH_ENDPOINT, { signal });
  } catch (cause) {
    return signal?.aborted ? { kind: "aborted" } : { kind: "network", detail: toMessage(cause) };
  }

  // ボディは text() で読む。res.json() だと、プロキシが HTML を差し込んだときに
  // 例外だけが残ってボディが消え、原因を指す唯一の手がかりを失う。
  let body: string;
  try {
    body = await response.text();
  } catch (cause) {
    return signal?.aborted ? { kind: "aborted" } : { kind: "network", detail: toMessage(cause) };
  }

  if (!response.ok) {
    return {
      kind: "http",
      status: response.status,
      statusText: response.statusText,
      body: excerpt(body),
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch (cause) {
    return { kind: "parse", detail: toMessage(cause), body: excerpt(body) };
  }

  const invalidFields = findInvalidFields(parsed);
  if (invalidFields.length > 0) {
    return { kind: "shape", invalidFields, body: excerpt(body) };
  }

  return { kind: "ok", health: parsed as Health };
}

/**
 * `Health` として欠落・型不一致のフィールド名を返す。空配列なら妥当。
 *
 * `null` は `typeof` が `"object"` を返すため明示的に弾く。
 * これを通すと `{}` や `null` が「疎通OK」として扱われ、
 * 中身が空の表 or 「確認中…」のまま停止した画面になる。
 */
function findInvalidFields(value: unknown): string[] {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return [...HEALTH_FIELDS];
  }
  const record = value as Record<string, unknown>;
  return HEALTH_FIELDS.filter((field) => typeof record[field] !== "string");
}

function excerpt(body: string): string {
  const collapsed = body.replace(/\s+/g, " ").trim();
  return collapsed.length <= BODY_EXCERPT_LIMIT
    ? collapsed
    : `${collapsed.slice(0, BODY_EXCERPT_LIMIT)}…`;
}

function toMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
