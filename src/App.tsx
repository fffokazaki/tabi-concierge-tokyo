import { useEffect, useState } from "react";

type Health = { status: string; service: string; runtime: string };

/**
 * Step 1 の骨組み。
 * 目的は「ブラウザの React → Worker の /api/* が繋がっている」ことを
 * 実際の応答で確認できるようにすること。
 */
export function App() {
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/health")
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<Health>;
      })
      .then(setHealth)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  return (
    <main>
      <p className="eyebrow">旅コンシェルジュTOKYO</p>
      <h1>9,600のオープンデータを、旅の相棒に。</h1>
      <p className="lead">
        東京都オープンデータカタログを出典付きで届けるAI旅行ガイド。
        現在は骨組みのみで、旅程生成はこれから実装します。
      </p>

      <section className="card">
        <h2>API 疎通</h2>
        {error && <p className="error">接続できません: {error}</p>}
        {!error && !health && <p className="muted">確認中…</p>}
        {health && (
          <dl>
            <dt>status</dt>
            <dd>{health.status}</dd>
            <dt>ランタイム</dt>
            <dd>{health.runtime}</dd>
          </dl>
        )}
        <p className="muted">
          この値は Worker（workerd）が返しています。React はブラウザで動き、
          <code>/api/health</code> を fetch しています。
        </p>
      </section>

      <section className="card">
        <h2>デザインの正典</h2>
        <p>
          5画面のデザインプロトタイプは <a href="/showcase/">/showcase/</a> にあります。
          これはデザインの決定版であり、動作するアプリではありません。
        </p>
      </section>
    </main>
  );
}
