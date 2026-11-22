import { useEffect, useState, type ReactElement } from "react";
import { createPortal } from "react-dom";
import type { MoveBonusEffectLine } from "../../lib/pogo/moveBonusEffect";
import { throwTweakForDisplay } from "../../lib/pogo/moveBonusEffect";
import type { PvpMove } from "../../lib/pogo/combat";
import type { ChargeTiming, TimelineEvent } from "../../lib/pogo/simulate";
import type { SideState } from "./SimResearchPage";

const PLAN_LABELS = ["1回目", "2回目", "3回目", "4回目", "5回目", "6回目"];
const SHIELD_LABELS = ["1発目", "2発目", "3発目", "4発目", "5発目", "6発目"];
const SHIELD_SRC = "/Image/sozai/shield-ui.png";

function blankSlots() {
  return [null, null, null, null, null, null] as (string | null)[];
}

function readDamageDraft(draft: string) {
  if (!/^\d{1,3}$/.test(draft)) return null;
  const value = Number(draft);
  return value >= 25 && value <= 100 ? value : null;
}

function moveShieldSlot(slots: number[], index: number) {
  if (slots.includes(index)) return slots.filter((slot) => slot !== index).sort((a, b) => a - b);
  if (slots.length < 2) return [...slots, index].sort((a, b) => a - b);
  const earlier = Math.min(...slots);
  if (earlier === index) return slots;
  return [earlier, index].sort((a, b) => a - b);
}

export function chargedNameAt(events: TimelineEvent[], actor: "a" | "b", index: number) {
  return (
    events.find((event) => event.actor === actor && event.kind === "charged" && event.throwIndex === index)?.moveName ??
    "スペシャルアタック"
  );
}

function firedMoveIds(events: TimelineEvent[], actor: "a" | "b", mon?: "lead" | "back") {
  const ids: string[] = [];
  for (const event of events) {
    if (event.actor !== actor || event.kind !== "charged" || event.throwIndex == null) continue;
    if (mon) {
      if (event.mon === mon) ids.push(event.moveId);
      continue;
    }
    ids[event.throwIndex] = event.moveId;
  }
  return ids;
}

export function TimelineOps({
  sideA,
  sideB,
  movesA,
  movesB,
  timeline,
  onChangeA,
  onChangeB,
  onEdit,
  onUseCustomShield,
  moveA,
  onChangeMoveA,
}: {
  sideA: SideState;
  sideB: SideState;
  movesA: PvpMove[];
  movesB: PvpMove[];
  timeline: TimelineEvent[];
  onChangeA: (next: SideState) => void;
  onChangeB: (next: SideState) => void;
  onEdit: (next: { kind: "move" | "shield"; side: "a" | "b" }) => void;
  onUseCustomShield: () => void;
  /** 後追いのとき、左のゲージ技と技選択は引き先。シールドは sideA のまま。 */
  moveA?: SideState;
  onChangeMoveA?: (next: SideState) => void;
}) {
  const attackA = moveA ?? sideA;
  const changeAttackA = onChangeMoveA ?? onChangeA;
  const openMoves = (which: "a" | "b") => {
    const side = which === "a" ? attackA : sideB;
    const moves = which === "a" ? movesA : movesB;
    const onChange = which === "a" ? changeAttackA : onChangeB;
    const known = new Set(moves.map((move) => move.id));
    const slots = side.moveSlots.every((slot) => slot == null)
      ? blankSlots().map((_, index) => {
          const id = firedMoveIds(timeline, which, which === "a" && moveA ? "back" : undefined)[index];
          return id && known.has(id) ? id : null;
        })
      : side.moveSlots;
    onChange({ ...side, moveMode: "custom", moveSlots: slots });
    onEdit({ kind: "move", side: which });
  };
  const openShield = (which: "a" | "b") => {
    const side = which === "a" ? sideA : sideB;
    const onChange = which === "a" ? onChangeA : onChangeB;
    onChange({ ...side, shieldMode: "custom", shields: side.shieldSlots.length });
    onUseCustomShield();
    onEdit({ kind: "shield", side: which });
  };

  return (
    <div className="timeline-ops" aria-label="タイムライン操作">
      <OpsRow label="ゲージ技">
        <ChoiceButtons
          value={attackA.timing}
          options={[
            ["cct", "最適"],
            ["asap", "最短"],
          ]}
          onChange={(timing) => changeAttackA({ ...attackA, timing: timing as ChargeTiming })}
        />
        <ChoiceButtons
          align="end"
          value={sideB.timing}
          options={[
            ["cct", "最適"],
            ["asap", "最短"],
          ]}
          onChange={(timing) => onChangeB({ ...sideB, timing: timing as ChargeTiming })}
        />
      </OpsRow>
      <OpsRow label="技選択">
        <ChoiceButtons
          value={attackA.moveMode}
          options={[
            ["optimal", "最適"],
            ["custom", "カスタム"],
          ]}
          onChange={(mode) => {
            if (mode === "custom") openMoves("a");
            else changeAttackA({ ...attackA, moveMode: "optimal" });
          }}
        />
        <ChoiceButtons
          align="end"
          value={sideB.moveMode}
          options={[
            ["optimal", "最適"],
            ["custom", "カスタム"],
          ]}
          onChange={(mode) => {
            if (mode === "custom") openMoves("b");
            else onChangeB({ ...sideB, moveMode: "optimal" });
          }}
        />
      </OpsRow>
      <OpsRow label="シールド">
        <ChoiceButtons
          value={sideA.shieldMode}
          options={[
            ["optimal", "最適"],
            ["custom", "カスタム"],
          ]}
          onChange={(mode) => {
            if (mode === "custom") openShield("a");
            else onChangeA({ ...sideA, shieldMode: "optimal" });
          }}
        />
        <ChoiceButtons
          align="end"
          value={sideB.shieldMode}
          options={[
            ["optimal", "最適"],
            ["custom", "カスタム"],
          ]}
          onChange={(mode) => {
            if (mode === "custom") openShield("b");
            else onChangeB({ ...sideB, shieldMode: "optimal" });
          }}
        />
      </OpsRow>
    </div>
  );
}

function OpsRow({ label, children }: { label: string; children: [ReactElement, ReactElement] }) {
  return (
    <div className="timeline-ops-row">
      <div className="timeline-ops-side">{children[0]}</div>
      <p className="timeline-ops-label">{label}</p>
      <div className="timeline-ops-side is-end">{children[1]}</div>
    </div>
  );
}

function ChoiceButtons({
  value,
  options,
  align,
  onChange,
}: {
  value: string;
  options: [string, string][];
  align?: "end";
  onChange: (value: string) => void;
}) {
  return (
    <div className={`timeline-ops-choices${align === "end" ? " is-end" : ""}`}>
      {options.map(([id, label]) => (
        <button
          key={id}
          type="button"
          className="league-choice timeline-op"
          aria-pressed={value === id}
          onClick={() => onChange(id)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export function PlanPopup({
  kind,
  side,
  moves,
  title,
  onClose,
  onChange,
}: {
  kind: "move" | "shield";
  side: SideState;
  moves: PvpMove[];
  timeline: TimelineEvent[];
  actor: "a" | "b";
  title?: string;
  onClose: () => void;
  onChange: (next: SideState) => void;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const equipped = moves.filter((move, index) => moves.findIndex((other) => other.id === move.id) === index);

  return createPortal(
    <div className="search-overlay is-centered" role="dialog" aria-modal="true" aria-label={kind === "move" ? "技選択" : "シールド"}>
      <button type="button" className="search-overlay-backdrop" aria-label="閉じる" onClick={onClose} />
      {kind === "move" ? (
        <div className="search-overlay-panel sim-plan-panel sim-move-panel">
          <h2 className="shield-panel-title">{title ?? "技選択"}</h2>
          <div className="sim-move-picks">
            {PLAN_LABELS.map((label, index) => {
              const locked = side.moveSlots.slice(0, index).some((slot) => !slot);
              return (
                <div key={label} className={`sim-move-round${locked ? " is-locked" : ""}`}>
                  <p>{label}</p>
                  <div className={`sim-move-choices${equipped.length >= 3 ? " is-three" : ""}`}>
                    {equipped.map((move) => {
                      const on = side.moveSlots[index] === move.id;
                      return (
                        <button
                          key={move.id}
                          type="button"
                          className="sim-move-choice"
                          aria-pressed={on}
                          disabled={locked}
                          onClick={() => {
                            const moveSlots = [...side.moveSlots];
                            if (on) {
                              for (let cursor = index; cursor < moveSlots.length; cursor += 1) moveSlots[cursor] = null;
                            } else {
                              moveSlots[index] = move.id;
                            }
                            onChange({ ...side, moveMode: "custom", moveSlots });
                          }}
                        >
                          {move.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="sim-iv-actions">
            <button type="button" className="btn btn-primary" onClick={onClose}>
              閉じる
            </button>
          </div>
        </div>
      ) : (
        <div className="search-overlay-panel sim-shield-panel">
          <h2 className="shield-panel-title">シールド</h2>
          <table className="sim-shield-table">
              <thead>
                <tr>
                  {SHIELD_LABELS.map((label) => (
                    <th key={label} scope="col">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  {SHIELD_LABELS.map((label, index) => {
                    const on = side.shieldSlots.includes(index);
                    return (
                      <td key={label}>
                        <button
                          type="button"
                          className="sim-shield-slot"
                          aria-pressed={on}
                          aria-label={`${label}でシールドを使う`}
                          onClick={() => {
                            const shieldSlots = moveShieldSlot(side.shieldSlots, index);
                            onChange({ ...side, shieldMode: "custom", shieldSlots, shields: shieldSlots.length });
                          }}
                        >
                          {on ? <img src={SHIELD_SRC} alt="" /> : null}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          <div className="sim-iv-actions">
            <button type="button" className="btn btn-primary" onClick={onClose}>
              閉じる
            </button>
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}

export function ThrowPopup({
  side,
  index,
  moveName,
  move,
  effectLines,
  onClose,
  onChange,
}: {
  side: SideState;
  index: number;
  moveName: string;
  move: PvpMove | null;
  effectLines: MoveBonusEffectLine[];
  onClose: () => void;
  onChange: (next: SideState) => void;
}) {
  const tweak = throwTweakForDisplay(side.throwTweaks[index], move);
  const [draft, setDraft] = useState(String(tweak.damagePercent));
  const [seenPercent, setSeenPercent] = useState(tweak.damagePercent);
  if (seenPercent !== tweak.damagePercent) {
    setSeenPercent(tweak.damagePercent);
    setDraft(String(tweak.damagePercent));
  }
  const write = (next: { buff: boolean; damagePercent: number }) => {
    const throwTweaks = [...side.throwTweaks];
    throwTweaks[index] = next;
    onChange({ ...side, throwTweaks });
  };
  const commitDraft = () => {
    const value = readDamageDraft(draft);
    if (value == null) {
      setDraft(String(tweak.damagePercent));
      return;
    }
    if (value !== tweak.damagePercent) write({ ...tweak, damagePercent: value });
  };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      commitDraft();
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, draft, tweak, side.throwTweaks, index]);

  return createPortal(
    <div className="search-overlay is-centered" role="dialog" aria-modal="true" aria-label={moveName}>
      <button type="button" className="search-overlay-backdrop" aria-label="閉じる" onClick={onClose} />
      <div className="search-overlay-panel sim-plan-panel">
        <h2 className="shield-panel-title">{moveName}</h2>
        <div className="sim-throw-buff">
          <button
            type="button"
            className="league-choice timeline-op sim-throw-buff-btn"
            aria-pressed={tweak.buff}
            onClick={() => {
              const value = readDamageDraft(draft);
              if (value == null) setDraft(String(tweak.damagePercent));
              write({ buff: !tweak.buff, damagePercent: value ?? tweak.damagePercent });
            }}
          >
            追加効果
          </button>
          <div className="sim-throw-buff-note" aria-label="追加効果の内容">
            {effectLines.length ? (
              effectLines.map((line, lineIndex) => (
                <p key={`${lineIndex}-${line.kind}-${line.stage}`} className="sim-throw-buff-line">
                  {line.chance}
                  {line.kind}
                  {line.stage}
                </p>
              ))
            ) : (
              <p className="sim-throw-buff-line is-empty">
                <span className="sim-throw-buff-none">なし</span>
              </p>
            )}
          </div>
        </div>
        <label className="field sim-damage-field">
          <span>ダメージ</span>
          <span className="sim-damage-input">
            <input
              className="input num"
              inputMode="numeric"
              autoComplete="off"
              enterKeyHint="done"
              value={draft}
              onFocus={(event) => event.currentTarget.select()}
              onChange={(event) => setDraft(event.target.value.replace(/[^\d]/g, "").slice(0, 3))}
              onBlur={commitDraft}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  event.currentTarget.blur();
                }
              }}
            />
            <span>%</span>
          </span>
        </label>
        <div className="sim-throw-presets">
          {(
            [
              ["なし", 25],
              ["NICE", 50],
              ["GREAT", 75],
              ["EXCELLENT", 100],
            ] as const
          ).map(([label, percent]) => (
            <button
              key={label}
              type="button"
              className="league-choice timeline-op"
              aria-pressed={draft !== "" && Number(draft) === percent}
              onClick={() => {
                setDraft(String(percent));
                write({ ...tweak, damagePercent: percent });
              }}
            >
              {label}
            </button>
          ))}
        </div>
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
