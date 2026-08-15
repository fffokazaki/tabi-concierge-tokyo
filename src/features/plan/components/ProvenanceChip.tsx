import type { ProvenanceSource } from "../types";

/**
 * 出典チップ。get_provenance（Step 5）から source が渡ってきたときだけ表示する。
 * 未接続のあいだ EtiquetteTip.source は常に undefined なので、このコンポーネントは呼ばれない。
 */
export function ProvenanceChip({ source }: { source: ProvenanceSource }) {
  return (
    <a href={source.url} target="_blank" rel="noreferrer" className="provenance-chip">
      出典: {source.datasetTitle}（{source.provider}・{source.retrievedAt} 取得）
    </a>
  );
}
