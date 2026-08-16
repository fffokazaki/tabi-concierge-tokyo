import { useEffect, useState } from "react";
import { fetchHealth, type HealthResult } from "./health";

/** 中断はユーザーに見せる障害ではないため、画面が持つ状態からは除く。 */
type DisplayableResult = Exclude<HealthResult, { kind: "aborted" }>;

/** 失敗の表示内容。種別ごとに「何が起きたか」と「次にどこを疑うか」を分けて出す。 */
type FailureView = { headline: string; note: string; body?: string };

/**
 * `/api/health` の疎通確認パネル。
 *
 * 成否を1つの状態に持つ。成功と失敗を別々の state に分けると、
 * StrictMode の二重実行で「エラー文」と「正常な表」が同時に残りうる。
 */
export function HealthPanel() {
  const [result, setResult] = useState<DisplayableResult | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    void fetchHealth({ signal: controller.signal }).then((next) => {
      // 1回目の実行は cleanup で中断済み。ここで捨てないと、
      // 遅れて届いた古い応答が新しい結果を上書きしうる。
      if (next.kind === "aborted") return;
      // 画面を閉じれば DOM のテキストは消える。障害の痕跡をコンソールに残す。
      if (next.kind !== "ok") {
        console.error("[health] /api/health の疎通確認に失敗しました", next);
      }
      setResult(next);
    });

    return () => controller.abort();
  }, []);

  return (
    <section className="card">
      <h2>API 疎通</h2>
      <HealthStatus result={result} />
      <p className="muted">
        この値は Worker（workerd）が返しています。React はブラウザで動き、
        <code>/api/health</code> を fetch しています。
      </p>
    </section>
  );
}

function HealthStatus({ result }: { result: DisplayableResult | null }) {
  if (result === null) return <p className="muted">確認中…</p>;

  if (result.kind === "ok") {
    return (
      <dl>
        <dt>status</dt>
        <dd>{result.health.status}</dd>
        <dt>ランタイム</dt>
        <dd>{result.health.runtime}</dd>
      </dl>
    );
  }

  const { headline, note, body } = describeFailure(result);
  return (
    <div role="alert">
      <p className="error">{headline}</p>
      <p className="muted error-note">{note}</p>
      {body !== undefined && <pre className="error-body">{body || "（本文は空でした）"}</pre>}
    </div>
  );
}

/**
 * 失敗の種別を、原因の切り分けに使える日本語へ変換する。
 *
 * 「接続できません」に寄せないこと。サーバーが応答している失敗（parse / shape）を
 * ネットワーク障害として見せると、原因と逆方向へデバッグを誘導する。
 *
 * テストから直接呼べるよう export している（レンダリングには DOM が要るため）。
 */
export function describeFailure(result: Exclude<DisplayableResult, { kind: "ok" }>): FailureView {
  switch (result.kind) {
    case "network":
      return {
        headline: "サーバーに接続できません",
        note: `リクエストが Worker まで届いていません（オフライン・DNS・CORS など）。原因: ${result.detail}`,
      };
    case "http":
      return {
        headline: `サーバーが HTTP ${result.status}${result.statusText ? ` ${result.statusText}` : ""} を返しました`,
        note: "接続はできています。Worker が要求を拒否したか、パスが誤っています。応答本文が理由を示します。",
        body: result.body,
      };
    case "parse":
      return {
        headline: "応答を JSON として読めません",
        note: `サーバーは正常に応答しています。ネットワークではなく応答内容の問題です（プロキシによる HTML 差し込みなど）。原因: ${result.detail}`,
        body: result.body,
      };
    case "shape":
      return {
        headline: "応答の形が想定と違います",
        note: `JSON としては読めましたが、${result.invalidFields.join(" / ")} が欠落しているか文字列ではありません。`,
        body: result.body,
      };
  }
}
