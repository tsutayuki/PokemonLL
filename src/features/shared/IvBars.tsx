import { useRef } from "react";

/**
 * 指の移動がはっきり左右のときだけスライド。
 * それ以外は、上下スクロールを優先する。
 */
export function ivGestureAxis(dx: number, dy: number): "pending" | "slide" | "scroll" {
  const absX = Math.abs(dx);
  const absY = Math.abs(dy);
  if (absX < 12 && absY < 8) return "pending";
  if (absX >= 12 && absX > absY * 2) return "slide";
  return "scroll";
}

export function IvBars({
  atk,
  def,
  sta,
  buddy,
  onBuddy,
  onChange,
  showBuddy = true,
}: {
  atk: number;
  def: number;
  sta: number;
  buddy: boolean;
  onBuddy: (buddy: boolean) => void;
  onChange: (next: { atk: number; def: number; sta: number }) => void;
  showBuddy?: boolean;
}) {
  return (
    <div className="iv-bars">
      {showBuddy ? (
        <button type="button" className="buddy-toggle" aria-pressed={buddy} onClick={() => onBuddy(!buddy)}>
          相棒
        </button>
      ) : null}
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
  const touch = useRef<{
    id: number;
    x: number;
    y: number;
    scrollY: number;
    mode: "pending" | "slide" | "scroll";
  } | null>(null);

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

  const finishTouch = (pointerId: number, cancelled: boolean) => {
    const active = touch.current;
    if (!active || active.id !== pointerId) return;
    touch.current = null;
    if (cancelled) dragged.current = true;
    if (active.mode !== "slide") return;
    const scrollY = active.scrollY;
    requestAnimationFrame(() => {
      if (window.scrollY !== scrollY) window.scrollTo(window.scrollX, scrollY);
    });
  };

  return (
    <div className="iv-bar-block">
      <div className="iv-bar-label">
        <span>{label}</span>
      </div>
      <div
        className="iv-bar"
        role="group"
        aria-label={`${label} ${value}`}
        ref={barRef}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          dragged.current = false;
          if (event.pointerType === "mouse") {
            touch.current = null;
            event.currentTarget.setPointerCapture(event.pointerId);
            onChange(valueFromClientX(event.clientX));
            return;
          }
          touch.current = {
            id: event.pointerId,
            x: event.clientX,
            y: event.clientY,
            scrollY: window.scrollY,
            mode: "pending",
          };
        }}
        onPointerMove={(event) => {
          if (event.pointerType === "mouse") {
            if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
            const next = valueFromClientX(event.clientX);
            if (next !== value) dragged.current = true;
            onChange(next);
            return;
          }
          const active = touch.current;
          if (!active || active.id !== event.pointerId || active.mode === "scroll") return;
          if (active.mode === "pending") {
            const axis = ivGestureAxis(event.clientX - active.x, event.clientY - active.y);
            if (axis === "pending") return;
            if (axis === "scroll") {
              active.mode = "scroll";
              dragged.current = true;
              return;
            }
            active.mode = "slide";
            event.currentTarget.setPointerCapture(event.pointerId);
          }
          if (window.scrollY !== active.scrollY) window.scrollTo(window.scrollX, active.scrollY);
          dragged.current = true;
          onChange(valueFromClientX(event.clientX));
        }}
        onPointerUp={(event) => finishTouch(event.pointerId, false)}
        onPointerCancel={(event) => finishTouch(event.pointerId, true)}
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
            >
              {index}
            </button>
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
