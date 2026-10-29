import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { PokemonDotSprite } from "../../components/PokemonDotSprite";
import type { PogoStatRecord } from "../../lib/pogo/research";

const STAGES = [-4, -3, -2, -1, 0, 1, 2, 3, 4] as const;

export type InitialState = {
  initialOn: boolean;
  initialDamage: number;
  initialEnergy: number;
  initialAttackStage: number;
  initialDefenseStage: number;
};

export function InitialStatePopup({
  record,
  exactSprite,
  spriteSuffix,
  label,
  maxHp,
  fastName,
  fastGain,
  state,
  onChange,
  onClose,
}: {
  record: PogoStatRecord;
  exactSprite: boolean;
  spriteSuffix: number | null;
  label: string;
  maxHp: number;
  fastName: string;
  fastGain: number;
  state: InitialState;
  onChange: (next: InitialState) => void;
  onClose: () => void;
}) {
  const damage = clampInt(state.initialDamage, 0, maxHp);
  const remaining = maxHp - damage;
  const energy = clampInt(state.initialEnergy, 0, 100);
  const gain = Math.max(0, Math.floor(fastGain));

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const patch = (next: Partial<InitialState>) => onChange({ ...state, initialDamage: damage, initialEnergy: energy, ...next });

  return createPortal(
    <div className="search-overlay is-centered" role="dialog" aria-modal="true" aria-label="初期条件">
      <button type="button" className="search-overlay-backdrop" aria-label="閉じる" onClick={onClose} />
      <div className="search-overlay-panel sim-plan-panel initial-panel">
        <h2 className="shield-panel-title">初期条件</h2>
        <div className="initial-body">
          <div className="initial-head">
            <PokemonDotSprite
              pokemonId={record.pokemon_id}
              form={exactSprite ? undefined : record.form}
              exact={exactSprite}
              spriteSuffix={spriteSuffix}
              alt={label}
              size={56}
            />
            <button
              type="button"
              className="buddy-toggle initial-toggle"
              aria-pressed={state.initialOn}
              onClick={() => patch({ initialOn: !state.initialOn })}
            >
              初期条件機能
            </button>
          </div>

          <div className="initial-hp">
            <label className="field">
              <span className="field-label">HP残量</span>
              <BoundInput
                value={remaining}
                max={maxHp}
                ariaLabel="HP残量"
                onCommit={(value) => patch({ initialDamage: maxHp - value })}
              />
            </label>
            <span className="initial-or">または</span>
            <label className="field">
              <span className="field-label">受けたダメージ</span>
              <BoundInput
                value={damage}
                max={maxHp}
                ariaLabel="受けたダメージ"
                onCommit={(value) => patch({ initialDamage: value })}
              />
            </label>
          </div>
          <p className="initial-note">どちらかの入力でOKです</p>

          <div className="field">
            <span className="field-label">初期ゲージ</span>
            <div className="initial-gauge">
              <BoundInput
                value={energy}
                max={100}
                ariaLabel="初期ゲージ"
                tall
                onCommit={(value) => patch({ initialEnergy: value })}
              />
              <div className="initial-gauge-actions">
                <button type="button" className="initial-gain" disabled={gain <= 0} onClick={() => patch({ initialEnergy: clampInt(energy + gain, 0, 100) })}>
                  {fastName}＋１
                </button>
                <button type="button" className="initial-gain" disabled={gain <= 0} onClick={() => patch({ initialEnergy: clampInt(energy - gain, 0, 100) })}>
                  {fastName}ー１
                </button>
              </div>
            </div>
          </div>

          <StageRow
            label="攻撃ランク"
            value={clampInt(state.initialAttackStage, -4, 4)}
            onChange={(initialAttackStage) => patch({ initialAttackStage })}
          />
          <StageRow
            label="防御ランク"
            value={clampInt(state.initialDefenseStage, -4, 4)}
            onChange={(initialDefenseStage) => patch({ initialDefenseStage })}
          />
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

function BoundInput({
  value,
  max,
  ariaLabel,
  tall = false,
  onCommit,
}: {
  value: number;
  max: number;
  ariaLabel: string;
  tall?: boolean;
  onCommit: (value: number) => void;
}) {
  const [text, setText] = useState(String(value));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setText(String(value));
  }, [focused, value]);

  return (
    <input
      className={`input num${tall ? " is-tall" : ""}`}
      inputMode="numeric"
      autoComplete="off"
      aria-label={ariaLabel}
      value={text}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false);
        if (text === "") setText(String(value));
      }}
      onChange={(event) => {
        const digits = event.target.value.replace(/\D/g, "");
        if (digits === "") {
          setText("");
          return;
        }
        const next = clampInt(Number(digits), 0, max);
        setText(String(next));
        onCommit(next);
      }}
    />
  );
}

function StageRow({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <div className="stage-row" role="group" aria-label={label}>
        {STAGES.map((stage) => (
          <button
            key={stage}
            type="button"
            className={`stage-cell${stage === value ? " is-selected" : ""}`}
            aria-pressed={stage === value}
            onClick={() => onChange(stage)}
          >
            {stage}
          </button>
        ))}
      </div>
    </div>
  );
}

function clampInt(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.trunc(value)));
}
