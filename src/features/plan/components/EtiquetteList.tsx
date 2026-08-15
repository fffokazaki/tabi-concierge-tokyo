import type { EtiquetteTip } from "../types";
import { ProvenanceChip } from "./ProvenanceChip";

export function EtiquetteList({ tips }: { tips: EtiquetteTip[] }) {
  return (
    <ul className="etiquette-list">
      {tips.map((tip) => (
        <li key={tip.text} className="etiquette-item">
          <span className="etiquette-item__dot" aria-hidden="true" />
          <div>
            <div className="etiquette-item__text">{tip.text}</div>
            {tip.source && <ProvenanceChip source={tip.source} />}
          </div>
        </li>
      ))}
    </ul>
  );
}
