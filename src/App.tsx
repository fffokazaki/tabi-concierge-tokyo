import { useEffect, useState } from "react";
import { AppTabs } from "./features/plan/AppTabs";

type Health = { status: string; service: string; runtime: string };

export function App() {
  return (
    <>
      <AppTabs />
      {import.meta.env.DEV && <DevNotes />}
    </>
  );
}

/** 開発時のみ表示する疎通確認パネル。本番ビルドではマウントされず、/api/health も呼ばれない。 */
function DevNotes() {
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
    <main className="dev-notes">
      <p className="eyebrow">開発メモ</p>

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
