import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import type { PvpMove } from "../../lib/pogo/combat";
import {
  alignPlans,
  deleteStep,
  fillLaggingSide,
  insertAtTurn,
  moveStep,
  moveWithinBoundary,
  planTurns,
  stampSegmentFastTurns,
  type TimelineSpan,
  type TimelineStep,
} from "../../lib/pogo/timelinePlan";

const HOLD_MS = 50;
const TAP_MS = 450;
const SLOP_PX = 8;
const SCROLL_ZONE = 76;
const SCROLL_MAX = 0.9;

type SideEdit = {
  label: string;
  fast: PvpMove;
  charged: PvpMove[];
  plan: TimelineStep[];
};

type Block = { index: number; top: number; height: number };

type Session = {
  side: "a" | "b";
  from: number;
  originClientY: number;
  originScroll: number;
  fingerY: number;
  insertAt: number;
  blocks: Block[];
  raf: number;
  last: number;
  pointerId: number;
};

function watchTap(event: ReactPointerEvent, onTap: () => void) {
  const startX = event.clientX;
  const startY = event.clientY;
  const pointerId = event.pointerId;
  const began = performance.now();
  let moved = false;
  const move = (ev: PointerEvent) => {
    if (ev.pointerId !== pointerId) return;
    if (Math.hypot(ev.clientX - startX, ev.clientY - startY) > SLOP_PX) moved = true;
  };
  const end = (ev: PointerEvent) => {
    if (ev.pointerId !== pointerId) return;
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", end);
    window.removeEventListener("pointercancel", end);
    if (!moved && performance.now() - began <= TAP_MS) onTap();
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", end);
  window.addEventListener("pointercancel", end);
}

function spanAt(spans: TimelineSpan[], turn: number) {
  return spans.find((span) => turn >= span.startTurn && turn < span.startTurn + span.turns) ?? null;
}

function uniqueCharged(moves: PvpMove[]) {
  const seen = new Set<string>();
  return moves.filter((move) => {
    if (seen.has(move.id)) return false;
    seen.add(move.id);
    return true;
  });
}

function insertionIndex(blocks: Block[], from: number, visualCenter: number) {
  const others = blocks.filter((block) => block.index !== from).sort((left, right) => left.top - right.top);
  let insertAt = 0;
  for (const block of others) {
    if (visualCenter > block.top + block.height / 2) insertAt += 1;
  }
  return insertAt;
}

function contentShift(blocks: Block[], from: number, insertAt: number) {
  const origin = blocks.reduce((min, block) => Math.min(min, block.top), 0);
  const order = blocks.map((block) => block.index).filter((index) => index !== from);
  order.splice(Math.max(0, Math.min(insertAt, order.length)), 0, from);
  const nextTop = new Map<number, number>();
  let y = origin;
  for (const index of order) {
    nextTop.set(index, y);
    y += blocks.find((block) => block.index === index)?.height ?? 0;
  }
  const shift = new Map<number, number>();
  for (const block of blocks) shift.set(block.index, (nextTop.get(block.index) ?? block.top) - block.top);
  return shift;
}

export function TimelineCustom({
  sideA,
  sideB,
  chargeFill,
  moveWash,
  onChangeA,
  onChangeB,
  onClose,
  onDiscard,
  benchA = null,
  shownTurn = null,
}: {
  sideA: SideEdit;
  sideB: SideEdit;
  chargeFill: (type: string) => string;
  moveWash: (type: string) => string;
  onChangeA: (plan: TimelineStep[]) => void;
  onChangeB: (plan: TimelineStep[]) => void;
  onClose: () => void;
  onDiscard: () => void;
  /** 交代境界より後の自分側。技の挿入候補に使う。 */
  benchA?: SideEdit | null;
  /** 今の対戦結果タイムラインの最後のターン。 */
  shownTurn?: number | null;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const sessionRef = useRef<Session | null>(null);
  const hasShortRef = useRef(false);
  const [insertTurn, setInsertTurn] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const [closeWarned, setCloseWarned] = useState(false);
  const [closeArmed, setCloseArmed] = useState(false);
  const [markTop, setMarkTop] = useState<number | null>(null);

  useLayoutEffect(() => {
    const root = document.documentElement;
    const apply = () => {
      const bulletin = document.querySelector<HTMLElement>(".damage-bulletin");
      const tab = document.querySelector<HTMLElement>(".tab-bar");
      const slot = document.querySelector<HTMLElement>(".ad-banner-slot");
      const rem = Number.parseFloat(getComputedStyle(root).fontSize) || 16;
      const floor =
        (tab?.getBoundingClientRect().height ?? 0) +
        (slot?.getBoundingClientRect().height ?? 0) +
        4.25 * rem;
      const top = bulletin?.getBoundingClientRect().top ?? 0;
      const height = bulletin?.getBoundingClientRect().height ?? 0;
      const viewport = window.visualViewport;
      const measured =
        height > 0
          ? (viewport?.height ?? window.innerHeight) - (top - (viewport?.offsetTop ?? 0))
          : 0;
      const clear = measured > 0 ? measured : floor;
      root.style.setProperty("--timeline-clear", `${Math.ceil(clear)}px`);
    };
    const observer = new ResizeObserver(apply);
    const watch = () => {
      for (const node of document.querySelectorAll<HTMLElement>(".damage-bulletin, .tab-bar, .app-root, .ad-banner-slot")) {
        observer.observe(node);
      }
    };
    const shell = document.querySelector(".app-shell");
    const mutations = new MutationObserver(() => {
      watch();
      apply();
    });
    if (shell) mutations.observe(shell, { childList: true });
    watch();
    apply();
    window.addEventListener("resize", apply);
    window.visualViewport?.addEventListener("resize", apply);
    window.visualViewport?.addEventListener("scroll", apply);
    return () => {
      observer.disconnect();
      mutations.disconnect();
      window.removeEventListener("resize", apply);
      window.visualViewport?.removeEventListener("resize", apply);
      window.visualViewport?.removeEventListener("scroll", apply);
      root.style.removeProperty("--timeline-clear");
    };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (insertTurn != null) setInsertTurn(null);
      else if (hasShortRef.current) setCloseWarned(true);
      else onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [insertTurn, onClose]);

  const change = (side: "a" | "b", plan: TimelineStep[]) => {
    if (side === "a") onChangeA(plan);
    else onChangeB(plan);
  };

  const applySession = (session: Session, followFinger: boolean) => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    const scrollDelta = scroller.scrollTop - session.originScroll;
    const fingerShift = session.fingerY - session.originClientY + scrollDelta;
    const shift = contentShift(session.blocks, session.from, session.insertAt);
    const parts = scroller.querySelectorAll<HTMLElement>(`[data-tl-side="${session.side}"][data-tl-part]`);
    parts.forEach((el) => {
      const index = Number(el.dataset.tlStep);
      if (index === session.from && followFinger) {
        el.style.transition = "none";
        el.style.zIndex = "5";
        el.style.transform = `translateY(${fingerShift}px) scale(1.03)`;
        el.classList.add("is-lifted");
        return;
      }
      const dy = shift.get(index) ?? 0;
      el.style.zIndex = "";
      el.style.transition = "transform 180ms cubic-bezier(0.2, 0.8, 0.2, 1)";
      el.style.transform = dy ? `translateY(${dy}px)` : "";
      el.classList.remove("is-lifted");
    });
  };

  const stopSession = () => {
    const session = sessionRef.current;
    if (session) cancelAnimationFrame(session.raf);
    sessionRef.current = null;
    setDragging(false);
    const scroller = scrollRef.current;
    scroller?.classList.remove("is-dragging");
  };

  const clearTransforms = () => {
    scrollRef.current?.querySelectorAll<HTMLElement>("[data-tl-part]").forEach((el) => {
      el.style.transform = "";
      el.style.transition = "";
      el.style.zIndex = "";
      el.classList.remove("is-lifted");
    });
  };

  const beginLift = (side: "a" | "b", from: number, clientY: number, pointerId: number) => {
    const plan = side === "a" ? sideA.plan : sideB.plan;
    if (plan[from]?.kind === "switch") return;
    const scroller = scrollRef.current;
    if (!scroller) return;
    const base = scroller.getBoundingClientRect().top;
    const blocks: Block[] = [...scroller.querySelectorAll<HTMLElement>(`[data-tl-side="${side}"][data-tl-part="move"]`)]
      .map((el) => {
        const rect = el.getBoundingClientRect();
        return { index: Number(el.dataset.tlStep), top: rect.top - base + scroller.scrollTop, height: rect.height };
      })
      .sort((left, right) => left.top - right.top);
    if (!blocks.some((block) => block.index === from)) return;
    const session: Session = {
      side,
      from,
      originClientY: clientY,
      originScroll: scroller.scrollTop,
      fingerY: clientY,
      insertAt: from,
      blocks,
      raf: 0,
      last: performance.now(),
      pointerId,
    };
    sessionRef.current = session;
    scroller.classList.add("is-dragging");
    setDragging(true);
    if (navigator.vibrate) navigator.vibrate(12);
    const tick = (now: number) => {
      const current = sessionRef.current;
      const box = scrollRef.current;
      if (!current || !box || current.pointerId !== pointerId) return;
      const frame = box.getBoundingClientRect();
      let velocity = 0;
      if (current.fingerY < frame.top + SCROLL_ZONE) {
        const depth = Math.min(1, (frame.top + SCROLL_ZONE - current.fingerY) / SCROLL_ZONE);
        velocity = -SCROLL_MAX * depth;
      } else if (current.fingerY > frame.bottom - SCROLL_ZONE) {
        const depth = Math.min(1, (current.fingerY - (frame.bottom - SCROLL_ZONE)) / SCROLL_ZONE);
        velocity = SCROLL_MAX * depth;
      }
      const dt = Math.min(40, now - current.last);
      current.last = now;
      if (velocity) box.scrollTop += velocity * dt;
      const dragged = current.blocks.find((block) => block.index === current.from);
      const scrollDelta = box.scrollTop - current.originScroll;
      const visualTop = (dragged?.top ?? 0) + (current.fingerY - current.originClientY + scrollDelta);
      const visualCenter = visualTop + (dragged?.height ?? 0) / 2;
      const next = insertionIndex(current.blocks, current.from, visualCenter);
      if (next !== current.insertAt) {
        current.insertAt = next;
        if (navigator.vibrate) navigator.vibrate(8);
      }
      applySession(current, true);
      current.raf = requestAnimationFrame(tick);
    };
    session.raf = requestAnimationFrame(tick);
  };

  const onGripDown = (side: "a" | "b", index: number, event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0 || sessionRef.current) return;
    event.preventDefault();
    const startX = event.clientX;
    const startY = event.clientY;
    const pointerId = event.pointerId;
    let lifted = false;
    const hold = window.setTimeout(() => {
      lifted = true;
      beginLift(side, index, startY, pointerId);
    }, HOLD_MS);
    const cleanup = () => {
      window.clearTimeout(hold);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      if (!lifted) {
        if (Math.hypot(ev.clientX - startX, ev.clientY - startY) > SLOP_PX) cleanup();
        return;
      }
      ev.preventDefault();
      const session = sessionRef.current;
      if (session) session.fingerY = ev.clientY;
    };
    const onUp = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      const session = sessionRef.current;
      cleanup();
      if (!lifted || !session) return;
      cancelAnimationFrame(session.raf);
      const plan = side === "a" ? sideA.plan : sideB.plan;
      const moved = benchA ? moveWithinBoundary(plan, session.from, session.insertAt) : moveStep(plan, session.from, session.insertAt);
      const next = side === "a" && benchA ? stampSegmentFastTurns(moved, Math.max(1, sideA.fast.turns), Math.max(1, benchA.fast.turns)) : moved;
      const shift = contentShift(session.blocks, session.from, session.insertAt);
      applySession({ ...session, insertAt: session.insertAt }, false);
      const scroller = scrollRef.current;
      scroller?.querySelectorAll<HTMLElement>(`[data-tl-side="${side}"][data-tl-part]`).forEach((el) => {
        if (Number(el.dataset.tlStep) !== session.from) return;
        const dy = shift.get(session.from) ?? 0;
        el.style.transition = "transform 180ms cubic-bezier(0.2, 0.8, 0.2, 1)";
        el.style.transform = dy ? `translateY(${dy}px) scale(1)` : "scale(1)";
      });
      window.setTimeout(() => {
        stopSession();
        clearTransforms();
        if (next !== plan) change(side, next);
      }, 190);
    };
    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

  const fastTurnsA = Math.max(1, sideA.fast.turns);
  const fastTurnsB = Math.max(1, sideB.fast.turns);
  const followTurns = Math.max(1, benchA?.fast.turns ?? fastTurnsA);
  const planA = useMemo(
    () => (benchA ? stampSegmentFastTurns(sideA.plan, fastTurnsA, followTurns) : sideA.plan),
    [benchA, sideA.plan, fastTurnsA, followTurns],
  );
  const aligned = useMemo(
    () =>
      alignPlans(planA, fastTurnsA, sideB.plan, fastTurnsB, {
        gainA: sideA.fast.energyGain,
        gainB: sideB.fast.energyGain,
        costA: (moveId) => sideA.charged.find((move) => move.id === moveId)?.energy ?? Number.POSITIVE_INFINITY,
        costB: (moveId) => sideB.charged.find((move) => move.id === moveId)?.energy ?? Number.POSITIVE_INFINITY,
        ...(benchA
          ? {
              gainAtA: (stepIndex: number) => benchGain(planA, benchA, stepIndex) ?? sideA.fast.energyGain,
              costAtA: (moveId: string, stepIndex: number) => {
                const pool = benchAfter(planA, benchA, stepIndex) ? benchA.charged : sideA.charged;
                return pool.find((move) => move.id === moveId)?.energy ?? Number.POSITIVE_INFINITY;
              },
            }
          : {}),
      }),
    [planA, fastTurnsA, fastTurnsB, sideA, sideB, benchA],
  );
  const hasShort = aligned.a.short.length > 0 || aligned.b.short.length > 0;
  hasShortRef.current = hasShort;
  useEffect(() => {
    if (!hasShort) {
      setCloseWarned(false);
      setCloseArmed(false);
    }
  }, [hasShort]);
  const tryClose = () => {
    if (hasShort && !closeArmed) {
      setCloseWarned(true);
      setCloseArmed(true);
      return;
    }
    if (hasShort) onDiscard();
    else onClose();
  };
  const rows = Array.from({ length: aligned.turns }, (_, index) => index + 1);
  useLayoutEffect(() => {
    const root = scrollRef.current;
    if (!root) return;
    let frame = 0;
    const fit = () => {
      root.querySelectorAll<HTMLElement>(".move-name").forEach((name) => {
        name.style.fontSize = "";
        let size = Number.parseFloat(getComputedStyle(name).fontSize);
        const floor = 7.5;
        while (size > floor && name.scrollWidth > name.clientWidth + 0.5) {
          size -= 0.5;
          name.style.fontSize = `${size}px`;
        }
      });
    };
    const run = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(fit);
    };
    run();
    const observer = new ResizeObserver(run);
    observer.observe(root);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [aligned]);

  useLayoutEffect(() => {
    const scroll = scrollRef.current;
    if (!scroll || shownTurn == null) {
      setMarkTop(null);
      return;
    }
    const place = () => {
      const row = scroll.querySelector<HTMLElement>(`tr[data-turn="${shownTurn}"]`);
      const board = row?.closest<HTMLElement>(".timeline-custom-board");
      if (!row || !board) {
        setMarkTop(null);
        return;
      }
      const top = Math.round(row.getBoundingClientRect().bottom - board.getBoundingClientRect().top);
      setMarkTop((current) => (current === top ? current : top));
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(scroll);
    return () => observer.disconnect();
  }, [aligned, shownTurn]);

  return createPortal(
    <div className="search-overlay is-centered timeline-custom-overlay" role="dialog" aria-modal="true" aria-label="タイムラインカスタム">
      <button type="button" className="search-overlay-backdrop" aria-label="閉じる" onClick={tryClose} />
      <div className="search-overlay-panel sim-plan-panel timeline-custom-panel">
        <h2 className="shield-panel-title">タイムラインカスタム</h2>
        <p className="timeline-custom-hint">
          真ん中のターン数をタップすると、その位置に技や待機を追加できます。持ち手を長押しすると、その技を上下に並べ替えられます。
        </p>
        <div ref={scrollRef} className={`timeline-custom-scroll${dragging ? " is-dragging" : ""}${markTop != null ? " has-shown-mark" : ""}`}>
          <div className="timeline-custom-board">
          <table className="battle-sheet timeline-custom-sheet" aria-label="タイムラインの編集">
            <colgroup>
              <col className="tl-col-grip" />
              <col className="tl-col-move" />
              <col className="tl-col-turn" />
              <col className="tl-col-move" />
              <col className="tl-col-grip" />
            </colgroup>
            <tbody>
              {rows.map((turn) => {
                const cellA = spanAt(aligned.a.spans, turn);
                const cellB = spanAt(aligned.b.spans, turn);
                return (
                  <tr
                    key={turn}
                    data-turn={turn}
                    className={aligned.chargeTurns.includes(turn) ? "has-charge" : undefined}
                  >
                    <SideCells
                      side="a"
                      turn={turn}
                      span={cellA}
                      fastCount={fastCountAt(planA, cellA?.stepIndex ?? -1)}
                      short={cellA ? aligned.a.short.includes(cellA.stepIndex) : false}
                      fast={benchAfter(planA, benchA, cellA?.stepIndex ?? -1) && benchA ? benchA.fast : sideA.fast}
                      charged={benchAfter(planA, benchA, cellA?.stepIndex ?? -1) && benchA ? benchA.charged : sideA.charged}
                      moveWash={moveWash}
                      onDelete={(index) => {
                        if (planA[index]?.kind === "switch") return;
                        const removed = deleteStep(planA, index);
                        change("a", benchA ? stampSegmentFastTurns(removed, fastTurnsA, followTurns) : removed);
                      }}
                      onGripDown={onGripDown}
                    />
                    <td className="turn">
                      <button
                        type="button"
                        className="timeline-turn-btn"
                        aria-label={`${turn}ターンに追加`}
                        onPointerDown={(event) => {
                          if (event.button !== 0) return;
                          watchTap(event, () => setInsertTurn(turn));
                        }}
                        onClick={(event) => event.preventDefault()}
                      >
                        {turn}
                      </button>
                    </td>
                    <SideCells
                      side="b"
                      turn={turn}
                      span={cellB}
                      fastCount={fastCountAt(sideB.plan, cellB?.stepIndex ?? -1)}
                      short={cellB ? aligned.b.short.includes(cellB.stepIndex) : false}
                      fast={sideB.fast}
                      charged={sideB.charged}
                      moveWash={moveWash}
                      onDelete={(index) => change("b", deleteStep(sideB.plan, index))}
                      onGripDown={onGripDown}
                    />
                  </tr>
                );
              })}
            </tbody>
          </table>
          {markTop != null ? (
            <div className="timeline-shown-mark" style={{ top: markTop }}>
              <i />
              <span>表示中タイムライン最後尾</span>
            </div>
          ) : null}
          </div>
        </div>
        <div className="timeline-custom-actions">
          {closeWarned && hasShort ? <p className="timeline-close-warn">ゲージの足りないスペシャルアタックがあります</p> : null}
          <div className="timeline-close-row">
            <p className="timeline-close-note">
              シールド位置の切り替えは
              <br />
              別にシールドのカスタムから行ってください
            </p>
            <button type="button" className={`btn btn-primary${closeArmed && hasShort ? " is-discard" : ""}`} onClick={tryClose}>
              {closeArmed && hasShort ? <span className="timeline-close-discard">保存せずに</span> : null}
              閉じる
            </button>
          </div>
        </div>
      </div>
      {insertTurn != null ? (
        <InsertPopup
          turn={insertTurn}
          sideA={insertSideA({ ...sideA, plan: planA }, benchA, insertTurn)}
          sideB={sideB}
          chargeFill={chargeFill}
          onPick={(side, step) => {
            const placed = insertAtTurn(planA, fastTurnsA, sideB.plan, fastTurnsB, side, insertTurn, step);
            const placedA = benchA ? stampSegmentFastTurns(placed.stepsA, fastTurnsA, followTurns) : placed.stepsA;
            const filled = fillLaggingSide(
              placedA,
              fastTurnsA,
              sideA.fast.id,
              sideA.fast.energyGain,
              sideA.charged,
              placed.stepsB,
              fastTurnsB,
              sideB.fast.id,
              sideB.fast.energyGain,
              sideB.charged,
              benchA ? { followFast: { id: benchA.fast.id, turns: followTurns } } : undefined,
            );
            change("a", benchA ? stampSegmentFastTurns(filled.stepsA, fastTurnsA, followTurns) : filled.stepsA);
            change("b", filled.stepsB);
            setInsertTurn(null);
          }}
          onClose={() => setInsertTurn(null)}
        />
      ) : null}
    </div>,
    document.body,
  );
}

function switchTurnOf(plan: TimelineStep[], fastTurns: number) {
  const index = plan.findIndex((step) => step.kind === "switch");
  if (index < 0) return null;
  return planTurns(plan.slice(0, index), fastTurns) + 1;
}

function benchAfter(plan: TimelineStep[], bench: SideEdit | null, stepIndex: number) {
  if (!bench) return false;
  const boundary = plan.findIndex((step) => step.kind === "switch");
  return boundary >= 0 && stepIndex > boundary;
}

function benchGain(plan: TimelineStep[], bench: SideEdit | null, stepIndex: number) {
  return benchAfter(plan, bench, stepIndex) ? bench?.fast.energyGain : undefined;
}

function insertSideA(side: SideEdit, bench: SideEdit | null, turn: number) {
  if (!bench) return side;
  const boundary = switchTurnOf(side.plan, Math.max(1, side.fast.turns));
  if (boundary == null || turn <= boundary) return side;
  return bench;
}

function fastCountAt(steps: TimelineStep[], index: number) {
  if (steps[index]?.kind !== "fast") return null;
  let count = 0;
  for (let cursor = index; cursor >= 0; cursor -= 1) {
    const step = steps[cursor];
    if (!step || step.kind === "charged" || step.kind === "switch") break;
    if (step.kind === "fast") count += 1;
  }
  return count;
}

function SideCells({
  side,
  turn,
  span,
  fastCount,
  short,
  fast,
  charged,
  moveWash,
  onDelete,
  onGripDown,
}: {
  side: "a" | "b";
  turn: number;
  span: TimelineSpan | null;
  fastCount: number | null;
  short: boolean;
  fast: PvpMove;
  charged: PvpMove[];
  moveWash: (type: string) => string;
  onDelete: (index: number) => void;
  onGripDown: (side: "a" | "b", index: number, event: ReactPointerEvent<HTMLButtonElement>) => void;
}) {
  if (span && turn !== span.startTurn) return null;
  if (!span) {
    return side === "a" ? (
      <>
        <td className="tl-grip" />
        <td className="move is-empty" />
      </>
    ) : (
      <>
        <td className="move is-empty" />
        <td className="tl-grip" />
      </>
    );
  }
  const step = span.step;
  if (step.kind === "switch") {
    const cell = (
      <td className="move is-switch" rowSpan={span.turns} data-tl-side={side} data-tl-step={span.stepIndex} data-tl-part="move">
        交代
      </td>
    );
    const blank = <td className="tl-grip" rowSpan={span.turns} />;
    return side === "a" ? (
      <>
        {blank}
        {cell}
      </>
    ) : (
      <>
        {cell}
        {blank}
      </>
    );
  }
  const move = step.kind === "charged" ? charged.find((item) => item.id === step.moveId) : step.kind === "fast" ? fast : null;
  const name = step.kind === "wait" ? "待機" : (move?.name ?? "技");
  const wash = short || !move ? undefined : moveWash(move.type);
  const roomy = span.turns >= 2;
  const grip = (
    <td className="tl-grip" rowSpan={span.turns} data-tl-side={side} data-tl-step={span.stepIndex} data-tl-part="grip">
      <button
        type="button"
        className="timeline-grip"
        aria-label={`${name}を並べ替え`}
        onPointerDown={(event) => onGripDown(side, span.stepIndex, event)}
        onClick={(event) => event.preventDefault()}
        onContextMenu={(event) => event.preventDefault()}
      >
        <GripIcon />
      </button>
    </td>
  );
  const remove = (
    <button
      type="button"
      className="timeline-x"
      aria-label={`${name}を消す`}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.stopPropagation();
        watchTap(event, () => onDelete(span.stepIndex));
      }}
      onClick={(event) => event.preventDefault()}
    >
      ×
    </button>
  );
  const count = fastCount != null ? <span className="num move-dmg">{fastCount}</span> : null;
  const moveCell = (
    <td
      className={`move${step.kind === "wait" ? " is-wait" : ""}${short ? " is-short" : ""}`}
      rowSpan={span.turns}
      data-tl-side={side}
      data-tl-step={span.stepIndex}
      data-tl-part="move"
      style={wash ? { background: wash } : undefined}
    >
      {roomy ? (
        <span className="move-label is-roomy">
          <span className="move-name">{name}</span>
          <span className="move-line-sub">
            {side === "a" ? remove : null}
            {count}
            {side === "b" ? remove : null}
          </span>
        </span>
      ) : (
        <span className={`move-label${side === "b" ? " is-foe" : ""}`}>
          {side === "a" ? remove : null}
          <span className="move-line-main">
            <span className="move-name">{name}</span>
            {count}
          </span>
          {side === "b" ? remove : null}
        </span>
      )}
      {short ? (
        <span className="timeline-energy-mark" aria-label="ゲージが足りません">
          !
        </span>
      ) : null}
    </td>
  );
  return side === "a" ? (
    <>
      {grip}
      {moveCell}
    </>
  ) : (
    <>
      {moveCell}
      {grip}
    </>
  );
}

function GripIcon() {
  return (
    <svg className="timeline-grip-icon" viewBox="0 0 20 14" aria-hidden="true">
      <path d="M1 1.5h18M1 7h18M1 12.5h18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function InsertPopup({
  turn,
  sideA,
  sideB,
  chargeFill,
  onPick,
  onClose,
}: {
  turn: number;
  sideA: SideEdit;
  sideB: SideEdit;
  chargeFill: (type: string) => string;
  onPick: (side: "a" | "b", step: TimelineStep) => void;
  onClose: () => void;
}) {
  return (
    <div className="search-overlay is-centered timeline-insert-overlay" role="dialog" aria-modal="true" aria-label={`${turn}ターンに追加`}>
      <button type="button" className="search-overlay-backdrop" aria-label="閉じる" onClick={onClose} />
      <div className="search-overlay-panel sim-plan-panel timeline-insert-panel">
        <h2 className="shield-panel-title">{turn}ターンに追加</h2>
        <div className="timeline-insert-grid">
          <InsertColumn side="a" edit={sideA} chargeFill={chargeFill} onPick={onPick} />
          <InsertColumn side="b" edit={sideB} chargeFill={chargeFill} onPick={onPick} />
        </div>
        <div className="sim-iv-actions">
          <button type="button" className="btn btn-primary" onClick={onClose}>
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}

function InsertColumn({
  side,
  edit,
  chargeFill,
  onPick,
}: {
  side: "a" | "b";
  edit: SideEdit;
  chargeFill: (type: string) => string;
  onPick: (side: "a" | "b", step: TimelineStep) => void;
}) {
  const charged = uniqueCharged(edit.charged);
  return (
    <div className="timeline-insert-col">
      <p className="timeline-insert-name">{edit.label || (side === "a" ? "自分" : "相手")}</p>
      <button
        type="button"
        className="timeline-insert-btn"
        style={{ background: chargeFill(edit.fast.type) }}
        onClick={() => onPick(side, { kind: "fast", moveId: edit.fast.id })}
      >
        {edit.fast.name}
      </button>
      {charged.map((move) => (
        <button
          key={move.id}
          type="button"
          className="timeline-insert-btn"
          style={{ background: chargeFill(move.type) }}
          onClick={() => onPick(side, { kind: "charged", moveId: move.id })}
        >
          {move.name}
        </button>
      ))}
      <button type="button" className="timeline-insert-btn is-wait" onClick={() => onPick(side, { kind: "wait" })}>
        待機
      </button>
    </div>
  );
}
