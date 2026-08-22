import type { DragEvent, KeyboardEvent } from "react";
import { resolveCategoryIllustration } from "../categoryIllustrations";
import type { Stop } from "../types";

type RouteStopCardProps = {
  stop: Stop;
  /** 表示用の時間帯ラベル。並べ替え後の位置（pos）から導出される値で、stop 自体の属性ではない。 */
  time: string;
  selected: boolean;
  isDragOver: boolean;
  onSelect: () => void;
  onDragStart: (e: DragEvent<HTMLDivElement>) => void;
  onDragOver: (e: DragEvent<HTMLDivElement>) => void;
  onDrop: (e: DragEvent<HTMLDivElement>) => void;
  onDragEnd: () => void;
};

export function RouteStopCard({ stop, time, selected, isDragOver, onSelect, onDragStart, onDragOver, onDrop, onDragEnd }: RouteStopCardProps) {
  const modifier = isDragOver ? " stop-card--drag-over" : selected ? " stop-card--selected" : "";
  const illustration = resolveCategoryIllustration(stop.category);

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect();
    }
  };

  return (
    <div
      className={`stop-card${modifier}`}
      draggable
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      onClick={onSelect}
      onKeyDown={handleKeyDown}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
    >
      <div className="stop-card__handle" aria-hidden="true">
        <svg width="10" height="16" viewBox="0 0 10 16">
          <circle cx="2.5" cy="2.5" r="1.4" fill="currentColor" />
          <circle cx="7.5" cy="2.5" r="1.4" fill="currentColor" />
          <circle cx="2.5" cy="8" r="1.4" fill="currentColor" />
          <circle cx="7.5" cy="8" r="1.4" fill="currentColor" />
          <circle cx="2.5" cy="13.5" r="1.4" fill="currentColor" />
          <circle cx="7.5" cy="13.5" r="1.4" fill="currentColor" />
        </svg>
      </div>
      <div
        className={`stop-card__thumb${illustration.kind === "unassigned" ? "" : " stop-card__thumb--illustrated"}`}
        aria-hidden="true"
      >
        {illustration.kind === "unassigned" ? null : (
          <img className="stop-card__thumb-image" src={illustration.src} alt="" />
        )}
      </div>
      <div className="stop-card__body">
        <div className="stop-card__time">{time}</div>
        <div className="stop-card__place">{stop.place}</div>
        <div className="stop-card__note">{stop.note}</div>
      </div>
    </div>
  );
}
