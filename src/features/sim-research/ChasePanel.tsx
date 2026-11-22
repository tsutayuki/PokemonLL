import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";

type ChargeRow = { id: string; name: string; count: number };

export function ChasePanel({
  fastName,
  fastCount,
  fastMax,
  charges,
  order,
  short,
  onFast,
  onCharge,
  onOrder,
}: {
  fastName: string;
  fastCount: number;
  fastMax: number;
  charges: ChargeRow[];
  order: string[];
  short: boolean;
  onFast: (count: number) => void;
  onCharge: (id: string, count: number) => void;
  onOrder: (order: string[]) => void;
}) {
  const [warn, setWarn] = useState(false);
  const [orderOpen, setOrderOpen] = useState(false);
  const total = charges.reduce((sum, row) => sum + row.count, 0);
  return (
    <section className="chase-panel" aria-label="交代タイミング">
      <p className="chase-panel-lead">初手のポケモンが</p>
      <div className="chase-row">
        <span className="chase-move">{fastName || "ノーマルアタック"}</span>
        <CountField label="ノーマルアタックの回数" value={fastCount} max={fastMax} onChange={onFast} />
        <span>回</span>
        {short ? (
          <span className="chase-short-wrap">
            <button type="button" className="chase-short" aria-label="ノーマルアタックの回数が不足しています" onClick={() => setWarn((open) => !open)}>
              !
            </button>
            {warn ? <span className="shield-mismatch-pop chase-short-pop">ノーマルアタックの回数が不足しています</span> : null}
          </span>
        ) : null}
      </div>
      {charges.map((row) => (
        <div className="chase-row" key={row.id}>
          <span className="chase-move">{row.name}</span>
          <CountField label={`${row.name}の回数`} value={row.count} max={3} onChange={(count) => onCharge(row.id, count)} />
          <span>回</span>
        </div>
      ))}
      <p className="chase-panel-end">で交代！</p>
      <button type="button" className="btn btn-outline chase-order-open" disabled={total < 2} onClick={() => setOrderOpen(true)}>
        交代までの技選択
      </button>
      {orderOpen ? (
        <OrderPopup charges={charges} order={order} onOrder={onOrder} onClose={() => setOrderOpen(false)} />
      ) : null}
    </section>
  );
}

export function ChaseFoeSwitch({ on, onChange }: { on: boolean; onChange: (on: boolean) => void }) {
  return (
    <section className="chase-panel chase-foe-switch" aria-label="相手初手交代">
      <button type="button" className="chase-foe-switch-btn" aria-pressed={on} onClick={() => onChange(!on)}>
        <span>相手初手交代</span>
        <span className="chase-foe-switch-knob" aria-hidden="true" />
      </button>
      <p className="chase-foe-switch-note">相手の1ターン目の行動が「交代」になります。</p>
      <p className="chase-foe-switch-note">相手の引き先を追うシミュが再現できます。</p>
    </section>
  );
}

function CountField({
  value,
  max,
  label,
  onChange,
}: {
  value: number;
  max: number;
  label: string;
  onChange: (count: number) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="chase-count" aria-haspopup="dialog" aria-label={label} onClick={() => setOpen(true)}>
        <span className="num">{value}</span>
      </button>
      {open ? (
        <IosPicker
          label={label}
          value={value}
          max={max}
          onChange={onChange}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

function IosPicker({
  value,
  max,
  label,
  onChange,
  onClose,
}: {
  value: number;
  max: number;
  label: string;
  onChange: (count: number) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const draft = useRef(value);
  const ready = useRef(false);
  const touching = useRef(false);
  const pending = useRef<number | null>(null);
  const values = Array.from({ length: max + 1 }, (_, index) => index);
  const [shown, setShown] = useState(value);
  const centerOf = (node: HTMLElement, item: HTMLElement) => item.offsetTop - (node.clientHeight - item.offsetHeight) / 2;
  useEffect(() => {
    const node = ref.current;
    const item = node?.querySelector<HTMLElement>(`[data-count="${value}"]`);
    if (!node || !item) return;
    node.scrollTop = centerOf(node, item);
    const frame = requestAnimationFrame(() => {
      ready.current = true;
    });
    return () => cancelAnimationFrame(frame);
  }, [value, max]);
  const readCentered = () => {
    const node = ref.current;
    if (!node || !ready.current) return;
    const mid = node.scrollTop + node.clientHeight / 2;
    let best = draft.current;
    let bestDist = Number.POSITIVE_INFINITY;
    node.querySelectorAll<HTMLElement>("[data-count]").forEach((child) => {
      const center = child.offsetTop + child.offsetHeight / 2;
      const dist = Math.abs(center - mid);
      if (dist < bestDist) {
        bestDist = dist;
        best = Number(child.dataset.count);
      }
    });
    if (touching.current) pending.current = null;
    if (pending.current != null) {
      draft.current = pending.current;
      if (best === pending.current) pending.current = null;
    } else {
      draft.current = best;
    }
    setShown(best);
  };
  const spinTo = (count: number) => {
    const node = ref.current;
    const item = node?.querySelector<HTMLElement>(`[data-count="${count}"]`);
    if (!node || !item) return;
    pending.current = count;
    draft.current = count;
    const top = centerOf(node, item);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    node.scrollTo({ top, behavior: reduce ? "auto" : "smooth" });
    if (reduce || Math.abs(node.scrollTop - top) < 1) {
      pending.current = null;
      setShown(count);
    }
  };
  const watchTap = (event: ReactPointerEvent<HTMLButtonElement>, count: number) => {
    if (event.button !== 0) return;
    const startX = event.clientX;
    const startY = event.clientY;
    const pointerId = event.pointerId;
    let moved = false;
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      if (Math.hypot(ev.clientX - startX, ev.clientY - startY) > 10) moved = true;
    };
    const end = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      if (!moved) spinTo(count);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
  };
  const commit = () => {
    onChange(draft.current);
    onClose();
  };
  return createPortal(
    <div className="ios-picker-overlay">
      <button type="button" className="ios-picker-backdrop" aria-label="閉じる" onClick={commit} />
      <div className="ios-picker" role="dialog" aria-modal="true" aria-label={label}>
        <div className="ios-picker-bar">
          <p className="ios-picker-label">{label}</p>
          <button type="button" className="ios-picker-done" onClick={commit}>
            完了
          </button>
        </div>
        <div className="ios-picker-window">
          <div className="ios-picker-lens" aria-hidden="true" />
          <div
            ref={ref}
            className="ios-picker-wheel"
            onScroll={readCentered}
            onPointerDown={() => {
              touching.current = true;
            }}
            onPointerUp={() => {
              touching.current = false;
            }}
            onPointerCancel={() => {
              touching.current = false;
            }}
          >
            <span className="ios-picker-pad" />
            {values.map((count) => (
              <button
                key={count}
                type="button"
                data-count={count}
                className={count === shown ? "is-on" : ""}
                onMouseDown={(event) => event.preventDefault()}
                onPointerDown={(event) => watchTap(event, count)}
                onClick={(event) => event.preventDefault()}
              >
                {count}
              </button>
            ))}
            <span className="ios-picker-pad" />
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function OrderPopup({
  charges,
  order,
  onOrder,
  onClose,
}: {
  charges: ChargeRow[];
  order: string[];
  onOrder: (order: string[]) => void;
  onClose: () => void;
}) {
  const names = new Map(charges.map((row) => [row.id, row.name]));
  return createPortal(
    <div className="search-overlay is-centered" role="dialog" aria-modal="true" aria-label="交代までの技選択">
      <button type="button" className="search-overlay-backdrop" aria-label="閉じる" onClick={onClose} />
      <div className="search-overlay-panel sim-plan-panel sim-move-panel">
        <h2 className="shield-panel-title">交代までの技選択</h2>
        <div className="sim-move-picks">
          {order.map((current, index) => (
            <div key={`${current}-${index}`} className="sim-move-round">
              <p>{index + 1}回目</p>
              <div className={`sim-move-choices${charges.length >= 3 ? " is-three" : ""}`}>
                {charges.filter((row) => row.count > 0).map((row) => (
                  <button
                    key={row.id}
                    type="button"
                    className="sim-move-choice"
                    aria-pressed={current === row.id}
                    onClick={() => {
                      const next = order.slice();
                      const swap = next.findIndex((id, cursor) => cursor !== index && id === row.id);
                      next[index] = row.id;
                      if (swap >= 0) next[swap] = current;
                      onOrder(next);
                    }}
                  >
                    {row.name}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
        <p className="chase-order-note">いまの順: {order.map((id) => names.get(id) ?? id).join(" → ")}</p>
        <div className="sim-iv-actions">
          <button type="button" className="btn btn-primary" onClick={onClose}>
            閉じる
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
