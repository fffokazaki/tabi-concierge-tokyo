/**
 * コア3操作（`search_datasets` / `aggregate_dataset` / `get_provenance`）を `/api/*` 経由で
 * 1回叩き、**失敗の種別まで分類して返す**。DOM に依存しない。
 *
 * `health.ts` と同じ分離で、「取得して判定する」までをここに置き、「表示する」は呼び出し側が持つ。
 * 失敗の種別は潰さない（network と parse を同じ文言にすると、原因と逆方向へデバッグを誘導する）。
 *
 * **応答の形は検証しない。** JSON として読めれば `ok` として生の値を返す。形の解釈は
 * 用途によって違うため（開発コンソールは仕様外の応答をそのまま見せたい／プラン画面は
 * 出典の無い内容を表示してはいけない）、ここでは判断せず呼び出し側に委ねる。
 *
 * `features/console/` から `src/api/` へ移した（Issue #31）。プラン画面が同じ分類を必要とし、
 * 二重に持つと片方だけ直したときに気づけない。加えて、開発コンソールは本番ビルドから
 * tree-shaking で落ちる前提なので、プラン画面が `features/console/` を import すると
 * その前提が黙って崩れる。
 */

/** 叩けるコア操作。パスは API.md §3 の確定値 */
export const CORE_ENDPOINTS = {
  search_datasets: "/api/search-datasets",
  aggregate_dataset: "/api/aggregate-dataset",
  get_provenance: "/api/provenance",
} as const;

export type CoreOperation = keyof typeof CORE_ENDPOINTS;

/**
 * `fetch` のタイムアウト（ミリ秒）（Issue #146）。
 *
 * 6000ms は Futoshi が本番実測（`wrangler tail`）に基づき確定した値。Step 5（#119・#120）の
 * 定常状態は単発約1.1秒・並列集計は1件あたり1,296〜1,412ms・4件同時1.55秒・6件同時2.28秒
 * （429 なし）。この呼び出しは search → aggregate（候補ごと並列） → provenance の3段を
 * 直列に踏むため、1回あたりのタイムアウトは総待ち時間の最悪ケースに3倍で効く
 * （6000ms → 最悪18秒。8000ms なら24秒・10000ms なら30秒）。無料枠混雑時の最悪応答は
 * 未観測（意図的な再現不可）であり、これは定常値からの安全側の下限であって tail
 * レイテンシの実測ではない。
 *
 * **クライアント側の中断は Worker 側の推論を止めない** ―― 無料枠のニューロン消費は
 * タイムアウトの有無に関わらず発生する。この値は画面が固まるのを防ぐための UX 上の
 * 上限であり、コスト制御の手段ではない。
 */
export const DEFAULT_TIMEOUT_MS = 6000;

/**
 * 1回の呼び出しの結果。`ok` は HTTP 2xx かつ JSON として読めたことだけを意味する。
 * `answered` / `unanswered` の別は応答ボディ側の `status` であり、ここでは区別しない
 * （どちらも正常応答。API.md §4）。
 */
export type CoreCallResult =
  /** リクエストボディを JSON にできなかった。送信前の失敗で、サーバーには何も届いていない */
  | { kind: "input"; elapsedMs: number; detail: string }
  /** 2xx で JSON が読めた。`body` は応答そのもの */
  | { kind: "ok"; status: number; elapsedMs: number; body: unknown }
  /** 4xx/5xx。JSON なら `body` に入れる（Worker の ApiError を想定）。読めなければ text を入れる */
  | { kind: "http"; status: number; elapsedMs: number; body: unknown; rawText?: string }
  /** リクエストがサーバーまで届かなかった */
  | { kind: "network"; elapsedMs: number; detail: string }
  /**
   * サーバーは応答したが、本文を読み取れない・JSON として解析できない
   * （ストリーム切断・プロキシの HTML 差し込み等）。`network` と分けるのは、
   * 「接続できていない」と表示すると原因と逆方向へデバッグを誘導するため
   */
  | { kind: "parse"; status: number; elapsedMs: number; detail: string; rawText: string }
  /**
   * `timeoutMs` 以内に応答を読み終えられず、こちらから打ち切った（Issue #146）。**`network` に
   * 含めない。** 「接続できません」は原因を誤誘導する ―― fetch 自体は届いていて、サーバー側の
   * 処理待ち（Step 5 の LLM 推論・D1 混雑等）で止まっているだけかもしれない。並列化
   * （Issue #142・PR #145）で候補順に最初の確定した失敗を採るようになったが、そもそも確定
   * しない（応答が永遠に来ない）候補には無力だった ―― この分類の追加自体がその無限待ちを解消する。
   *
   * **ヘッダだけ届いて本文が来ない場合もここに入る。** `AbortSignal` は `fetch` が解決した
   * あとも本文ストリームに効き続けるため、締め切りは本文の読み取り中にも来る。そこを
   * `parse`（「応答を読み取れませんでした」）に落とすと、壊れていない本文を疑わせる
   */
  | { kind: "timeout"; elapsedMs: number; timeoutMs: number };

/**
 * コア操作を1回叩いて分類する。例外は投げない。
 *
 * @param options.fetchImpl テストから応答を差し替えるための注入口
 * @param options.now 所要時間の計測用（テストで固定できるようにする）
 * @param options.timeoutMs `DEFAULT_TIMEOUT_MS` を上書きする（テストが実時間を待たずに
 *   タイムアウト経路を検証するための注入口。本番では基本的に既定値のまま使う）
 */
export async function callCoreOperation(
  operation: CoreOperation,
  requestBody: unknown,
  options: { fetchImpl?: typeof fetch; now?: () => number; timeoutMs?: number } = {},
): Promise<CoreCallResult> {
  const { fetchImpl = fetch, now = () => performance.now(), timeoutMs = DEFAULT_TIMEOUT_MS } = options;
  const startedAt = now();
  const elapsed = () => Math.round(now() - startedAt);

  // シリアライズは fetch と別に捕まえる。同じ try に入れると、循環参照や BigInt の
  // 失敗（送信前）が「サーバーに接続できません」（送信後）として表示される
  let serialized: string;
  try {
    serialized = JSON.stringify(requestBody);
  } catch (cause) {
    return { kind: "input", elapsedMs: elapsed(), detail: toMessage(cause) };
  }

  // AbortSignal.timeout は workerd・ブラウザどちらも標準実装で追加ライブラリが要らない。
  // **signal を変数に持つ**のは、締め切りを過ぎたかどうかの判定に signal そのものを使うため
  // （下の deadlinePassed）。この signal は fetch の解決後も本文ストリームに効き続けるので、
  // 「打ち切ったか」を見る場所は fetch の catch だけでは足りない
  const signal = AbortSignal.timeout(timeoutMs);

  /**
   * この呼び出しを締め切りで打ち切ったか。**reject 理由の name では判定しない。**
   * `AbortSignal.timeout()` の理由は実測で `DOMException` の "TimeoutError"（Node 24 実行・
   * Chrome 実行の両方で確認）だが、名前を見に行くと「どのエンジンがどの名前で reject するか」
   * を追い続けることになる。`signal.aborted` は締め切りが来たときにだけ true になり、
   * abort アルゴリズムの順序（aborted を立てる → イベント → reject）により、catch に
   * 入った時点では必ず反映されている。判定したいのは「こちらが打ち切ったか」であって
   * 「例外の名前が何か」ではない。
   *
   * **この判定は両方向とも `coreOperations.test.ts` で固定してある** ―― 打ち切りを取りこぼさない
   * 側は「応答しない呼び出しは…」「ヘッダは返ったが本文が来ないまま…」、締め切り前の失敗を
   * timeout と名乗らない側は「fetch の失敗は network として原因を保つ」「本文の読み取り失敗は
   * network ではなく parse」。変異（常に false／常に true）でそれぞれ落ちることを確認済み
   */
  const deadlinePassed = () => signal.aborted;

  let response: Response;
  try {
    response = await fetchImpl(CORE_ENDPOINTS[operation], {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: serialized,
      signal,
    });
  } catch (cause) {
    if (deadlinePassed()) return { kind: "timeout", elapsedMs: elapsed(), timeoutMs };
    return { kind: "network", elapsedMs: elapsed(), detail: toMessage(cause) };
  }

  // text() で読んでから JSON.parse する。response.json() だと、壊れた応答のときに
  // 例外だけが残ってボディが消え、原因を指す唯一の手がかりを失う（health.ts と同じ理由）
  let text: string;
  try {
    text = await response.text();
  } catch (cause) {
    // ヘッダは返ったが本文が来ないまま締め切りが来た場合。parse に落とすと、壊れていない
    // 本文を疑わせる（実際に起きたのは「こちらが打ち切った」）
    if (deadlinePassed()) return { kind: "timeout", elapsedMs: elapsed(), timeoutMs };
    // 応答は届いている。network（未接続）に分類すると原因と逆方向へ誘導する
    return {
      kind: "parse",
      status: response.status,
      elapsedMs: elapsed(),
      detail: `本文の読み取りに失敗: ${toMessage(cause)}`,
      rawText: "",
    };
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
 * 応答ボディの `status` を覗く。開発コンソールのバッジ分けに使う。
 * 仕様外の値でも落とさず "unknown" にする（コンソールは仕様外をそのまま見せる道具）。
 *
 * **プラン画面はこれを使わない。** 画面に出す内容は形まで検証する必要がある
 * （出典の無い内容を表示しない。CLAUDE.md 絶対ルール #2）。
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
