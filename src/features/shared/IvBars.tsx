import { useRef } from "react";

export function IvBars({
  atk,
  def,
  sta,
  buddy,
  onBuddy,
  onChange,
}: {
  atk: number;
  def: number;
  sta: number;
  buddy: boolean;
  onBuddy: (buddy: boolean) => void;
  onChange: (next: { atk: number; def: number; sta: number }) => void;
}) {
  return (
    <div className="iv-bars">
      <button type="button" className="buddy-toggle" aria-pressed={buddy} onClick={() => onBuddy(!buddy)}>
        相棒
      </button>
      <IvBar label="攻撃" value={atk} onChange={(value) => onChange({ atk: value, def, sta })} />
      <IvBar label="防御" value={def} onChange={(value) => onChange({ atk, def: value, sta })} />
      <IvBar label="HP" value={sta} onChange={(value) => onChange({ atk, def, sta: value })} />
      <p className="iv-slide-note">スライドで入力できます</p>
    </div>
  );
}

function IvBar({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  const barRef = useRef<HTMLDivElement>(null);
  const dragged = useRef(false);

  const valueFromClientX = (clientX: number) => {
    const bar = barRef.current;
    if (!bar) return value;
    const cells = bar.querySelectorAll<HTMLButtonElement>(".iv-bar-cell");
    if (cells.length === 0) return value;
    let nearest = 0;
    let best = Number.POSITIVE_INFINITY;
    cells.forEach((cell, index) => {
      const rect = cell.getBoundingClientRect();
      const distance = Math.abs(clientX - (rect.left + rect.width / 2));
      if (distance < best) {
        best = distance;
        nearest = index;
      }
    });
    return nearest;
  };

  return (
    <div className="iv-bar-block">
      <div className="iv-bar-label">
        <span>{label}</span>
        <strong className="num">{value}</strong>
      </div>
      <div
        className="iv-bar"
        role="group"
        aria-label={`${label} ${value}`}
        ref={barRef}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          dragged.current = false;
          event.currentTarget.setPointerCapture(event.pointerId);
          onChange(valueFromClientX(event.clientX));
        }}
        onPointerMove={(event) => {
          if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
          const next = valueFromClientX(event.clientX);
          if (next !== value) dragged.current = true;
          onChange(next);
        }}
      >
        {Array.from({ length: 16 }, (_, index) => {
          const tone = ivTone(index, value);
          return (
            <button
              key={index}
              type="button"
              className={`iv-bar-cell${tone}`}
              aria-label={`${label} ${index}`}
              aria-pressed={index === value}
              onClick={() => {
                if (dragged.current) {
                  dragged.current = false;
                  return;
                }
                onChange(index);
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

function ivTone(index: number, value: number) {
  if (index > value) return "";
  if (index === 0) return " is-zero";
  if (index <= 5) return " is-iv-low";
  if (index <= 10) return " is-iv-mid";
  if (index <= 14) return " is-iv-high";
  return " is-iv-max";
}
