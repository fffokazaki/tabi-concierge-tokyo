import { AppTabs } from "./features/plan/AppTabs";
import { HealthPanel } from "./features/health/HealthPanel";

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
  return (
    <main className="dev-notes">
      <p className="eyebrow">開発メモ</p>

      <HealthPanel />

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
