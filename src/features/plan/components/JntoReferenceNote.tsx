import type { JntoReference } from "../jntoEtiquette";

/**
 * マナーの「参考」情報（JNTO・ADR-012）。`ProvenanceChip`（CC BY 4.0 のカタログ出典）とは
 * 意図的に見た目・ラベルを分ける。「出典」ではなく「参考」— カタログ由来のデータではないため、
 * 個別の事実の裏付けだと誤読されないようにする。
 *
 * `ProvenanceChip` はアクセントカラーの下線リンクのみ・枠なし。こちらはバッジ＋実線の枠を持つ
 * 中立トーンにし、`DataGapCard`（角丸破線・「該当データなし」の意味）とも見た目を変えてある。
 */
export function JntoReferenceNote({ reference }: { reference: JntoReference }) {
  return (
    <div className="jnto-reference-note">
      <span className="jnto-reference-note__badge">参考: JNTO</span>
      <p className="jnto-reference-note__summary">{reference.summary}</p>
      <a href={reference.url} target="_blank" rel="noreferrer" className="jnto-reference-note__link">
        日本政府観光局（JNTO）の公式ページ
      </a>
    </div>
  );
}
