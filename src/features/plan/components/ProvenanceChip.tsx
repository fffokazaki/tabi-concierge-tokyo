import type { ProvenanceSource } from "../types";

/**
 * CC BY 4.0 のライセンス条文。`ProvenanceSource.license` はリテラル型で1値しか取らないため、
 * 対応表ではなく定数で持つ（値が増えたら型エラーになるので、そのとき対応表にする）。
 */
const CC_BY_4_0_URL = "https://creativecommons.org/licenses/by/4.0/";

/**
 * 出典チップ。`get_provenance` の応答（`ProvenanceSource`）を表示する。
 *
 * **ライセンス表記は省略できない。** [CONSTRAINTS.md](../../../../docs/01-context/CONSTRAINTS.md) §3 は
 * 「全回答に出典を強制付与するため、CC BY の表示義務をアーキテクチャレベルで自動的に満たす」と
 * 宣言している。データセット名・提供元・取得日だけを出してライセンスを落とすと、その宣言は
 * 成立しない（Issue #17）。CC BY は**帰属表示・作品名・出典へのリンク・ライセンスの表示**を
 * 求めるので、4つとも描画する。
 *
 * リンクを2つ持つためチップ自体は `<a>` にできない（`<a>` の入れ子は不正な HTML）。
 * 外側は `<span>` で、データセットとライセンスをそれぞれ別のリンクにしている。
 */
export function ProvenanceChip({ source }: { source: ProvenanceSource }) {
  return (
    <span className="provenance-chip">
      出典:{" "}
      <a href={source.url} target="_blank" rel="noreferrer" className="provenance-chip__link">
        {source.datasetTitle}
      </a>
      （{source.provider}・{source.retrievedAt} 取得）{" "}
      <a href={CC_BY_4_0_URL} target="_blank" rel="noreferrer" className="provenance-chip__link">
        {source.license}
      </a>
    </span>
  );
}
