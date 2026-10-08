import { useEffect, useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { LeagueIconButton } from "../../components/LeagueIconButton";
import { SpeciesPicker } from "../shared/SpeciesPicker";
import { useResearchData } from "../shared/useResearchData";
import type { PvpMove } from "../../lib/pogo/combat";
import { findPvpPokemon, resolveMoves } from "../../lib/pogo/pvpBundle";
import {
  computeBestRankings,
  findMaxLevelBuild,
  formatFormLabel,
  leagueCap,
  leagueConfigs,
  pickPreferredEntry,
  speciesDisplayName,
  type LeagueId,
  type PogoStatRecord,
  type SpeciesGroup,
} from "../../lib/pogo/research";
import { simulateBattle, simulateShieldGrid, type ChargeTiming, type FighterInput } from "../../lib/pogo/simulate";

type SideState = {
  species: string;
  form: string;
  shadow: boolean;
  atkIv: number;
  defIv: number;
  staIv: number;
  fastId: string;
  chargedId: string;
  chargedId2: string;
  shields: number;
  timing: ChargeTiming;
  applyChanceBuffs: boolean;
};

const emptySide: SideState = {
  species: "",
  form: "",
  shadow: false,
  atkIv: 0,
  defIv: 15,
  staIv: 15,
  fastId: "",
  chargedId: "",
  chargedId2: "",
  shields: 2,
  timing: "cct",
  applyChanceBuffs: false,
};

function clampIv(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(15, Math.max(0, Math.round(value)));
}

export function SimResearchPage() {
  const { data, error, speciesGroups, cpData, reload } = useResearchData();
  const [leagueId, setLeagueId] = useState<LeagueId>("great");
  const [sideA, setSideA] = useState<SideState>(emptySide);
  const [sideB, setSideB] = useState<SideState>({ ...emptySide, shields: 2 });

  const cap = leagueCap(leagueId);

  function applySpecies(group: SpeciesGroup, which: "a" | "b") {
    const entry = pickPreferredEntry(group);
    const pvp = data ? findPvpPokemon(data.bundle, group.pokemonId, entry.form) : null;
    const next: Partial<SideState> = {
      species: group.name,
      form: entry.form,
      fastId: pvp?.fast[0] ?? "",
      chargedId: pvp?.charged[0] ?? "",
      chargedId2: pvp?.charged[1] ?? "",
    };
    if (cpData) {
      const record = group.entries.find((item) => item.form === entry.form) ?? entry;
      const best = computeBestRankings(record, cpData.levels, cpData.byLevel, cap)[0];
      if (best) {
        next.atkIv = best.atkIv;
        next.defIv = best.defIv;
        next.staIv = best.staIv;
      }
    }
    if (which === "a") setSideA((current) => ({ ...current, ...next }));
    else setSideB((current) => ({ ...current, ...next }));
  }

  useEffect(() => {
    if (!speciesGroups.length) return;
    if (!sideA.species) applySpecies(speciesGroups[0], "a");
    if (!sideB.species) applySpecies(speciesGroups[Math.min(8, speciesGroups.length - 1)], "b");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speciesGroups]);

  const pack = (side: SideState) => packFighter(side, speciesGroups, data, cpData, cap);

  const fighterA = pack(sideA);
  const fighterB = pack(sideB);

  const result = useMemo(() => {
    if (!fighterA || !fighterB) return null;
    return simulateBattle(fighterA.input, fighterB.input);
  }, [fighterA, fighterB]);

  const grid = useMemo(() => {
    if (!fighterA || !fighterB) return null;
    return simulateShieldGrid(fighterA.input, fighterB.input);
  }, [fighterA, fighterB]);

  return (
    <div className="page-iv">
      <div className="page-heading">
        <a className="btn btn-secondary btn-back" href="#/">
          <ArrowLeft size={16} />
          ホーム
        </a>
        <div>
          <h1>バトルシミュレーション研究</h1>
          <p className="page-lead">
            2匹を入れてシールドとゲージ技のタイミングを変えると、対面の勝敗とタイムラインが出ます。9マスはシールド枚数ごとの結果です。
          </p>
        </div>
      </div>

      {error ? (
        <section className="panel">
          <h2 className="panel-title">データを読み込めませんでした</h2>
          <p className="page-lead">{error}</p>
          <button type="button" className="btn btn-primary" onClick={reload}>
            再読み込み
          </button>
        </section>
      ) : null}

      {!data && !error ? (
        <section className="panel" aria-busy="true">
          <p className="page-lead">研究データを読み込み中です。</p>
        </section>
      ) : null}

      {data ? (
        <>
          <div className="choice-row league-row" role="group" aria-label="リーグ">
            {leagueConfigs
              .filter((league) => league.id !== "custom")
              .map((league) => (
                <LeagueIconButton
                  key={league.id}
                  id={league.id}
                  label={league.label}
                  pressed={league.id === leagueId}
                  onClick={() => setLeagueId(league.id)}
                />
              ))}
          </div>

          <div className="duel-grid">
            <FighterEditor
              title="自分"
              side={sideA}
              groups={speciesGroups}
              data={data}
              onSpecies={(group) => applySpecies(group, "a")}
              onChange={setSideA}
              build={fighterA}
            />
            <FighterEditor
              title="相手"
              side={sideB}
              groups={speciesGroups}
              data={data}
              onSpecies={(group) => applySpecies(group, "b")}
              onChange={setSideB}
              build={fighterB}
            />
          </div>

          {result && fighterA && fighterB ? (
            <>
              <section className="panel result-panel">
                <h2 className="panel-title">この対面</h2>
                <div className="hero-stats">
                  <div>
                    <span>結果</span>
                    <strong className={result.winner === "a" ? "win-text" : result.winner === "b" ? "lose-text" : ""}>
                      {result.winner === "a" ? "勝ち" : result.winner === "b" ? "負け" : "相打ち"}
                    </strong>
                  </div>
                  <div>
                    <span>評価</span>
                    <strong className="hero-cp num">{result.rating}</strong>
                  </div>
                </div>
                <div className="hp-duel">
                  <HpBar
                    name={fighterA.name}
                    hp={result.hpA}
                    max={result.maxHpA}
                    tone="self"
                  />
                  <HpBar
                    name={fighterB.name}
                    hp={result.hpB}
                    max={result.maxHpB}
                    tone="foe"
                  />
                </div>
                <p className="note">
                  {result.turns}ターン / シールド {sideA.shields}対{sideB.shields} / 100より大きいと勝ちです。
                </p>
              </section>

              {grid ? (
                <section className="panel">
                  <h2 className="panel-title">シールド9マス</h2>
                  <p className="note">マスを押すと、そのシールド枚数でタイムラインを見られます。自分の枚数が縦、相手が横です。</p>
                  <div className="shield-grid" role="grid" aria-label="シールド勝敗表">
                    <span className="shield-corner">自分＼相手</span>
                    {[0, 1, 2].map((shieldsB) => (
                      <span key={`h-${shieldsB}`} className="shield-head">
                        {shieldsB}
                      </span>
                    ))}
                    {grid.flatMap((row, shieldsA) => [
                      <span key={`l-${shieldsA}`} className="shield-head">
                        {shieldsA}
                      </span>,
                      ...row.map((cell, shieldsB) => {
                        const selected = sideA.shields === shieldsA && sideB.shields === shieldsB;
                        const tone = cell.rating > 100 ? "win" : cell.rating < 100 ? "lose" : "draw";
                        return (
                          <button
                            key={`${shieldsA}-${shieldsB}`}
                            type="button"
                            className={`shield-cell is-${tone}${selected ? " is-selected" : ""}`}
                            onClick={() => {
                              setSideA((current) => ({ ...current, shields: shieldsA }));
                              setSideB((current) => ({ ...current, shields: shieldsB }));
                            }}
                          >
                            <strong className="num">{cell.rating}</strong>
                            <span>{cell.winner === "a" ? "勝" : cell.winner === "b" ? "負" : "引"}</span>
                          </button>
                        );
                      }),
                    ])}
                  </div>
                </section>
              ) : null}

              <section className="panel">
                <h2 className="panel-title">タイムライン</h2>
                <div className="timeline">
                  {result.timeline.slice(0, 48).map((event, index) => (
                    <div key={`${event.turn}-${index}`} className={`timeline-row is-${event.actor}`}>
                      <span className="num">T{event.turn}</span>
                      <span>{event.actor === "a" ? fighterA.name : fighterB.name}</span>
                      <span>
                        {event.moveName}
                        {event.shielded ? "（シールド）" : ""}
                      </span>
                      <span className="num">{event.damage}</span>
                      <span className="num">
                        {event.hpA}/{event.hpB}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            </>
          ) : (
            <section className="panel">
              <p className="page-lead">両方のポケモンに通常技が入ると、シミュレーションが始まります。</p>
            </section>
          )}
        </>
      ) : null}
    </div>
  );
}

function packFighter(
  side: SideState,
  groups: SpeciesGroup[],
  data: ReturnType<typeof useResearchData>["data"],
  cpData: ReturnType<typeof useResearchData>["cpData"],
  cap: number,
) {
  if (!data || !cpData) return null;
  const group = groups.find((item) => item.name === side.species);
  if (!group) return null;
  const entry = group.entries.find((item) => item.form === side.form) ?? group.entries[0];
  if (!entry) return null;
  const pvp = findPvpPokemon(data.bundle, entry.pokemon_id, side.form);
  if (!pvp) return null;
  const fast = data.bundle.moves[side.fastId] ?? resolveMoves(data.bundle, pvp.fast)[0];
  if (!fast) return null;
  const charged = [side.chargedId, side.chargedId2]
    .map((id) => (id ? data.bundle.moves[id] : null))
    .filter((move): move is PvpMove => Boolean(move));
  const build = findMaxLevelBuild(entry, side.atkIv, side.defIv, side.staIv, cpData.levels, cpData.byLevel, cap);
  if (!build) return null;
  const input: FighterInput = {
    label: speciesDisplayName(group),
    attack: build.attack,
    defense: build.defense,
    hp: build.stamina,
    types: pvp.types,
    shadow: side.shadow,
    fast,
    charged,
    shields: side.shields,
    timing: side.timing,
    applyChanceBuffs: side.applyChanceBuffs,
  };
  return {
    name: speciesDisplayName(group),
    entry,
    pvp,
    build,
    fasts: resolveMoves(data.bundle, pvp.fast),
    chargedMoves: resolveMoves(data.bundle, pvp.charged),
    input,
  };
}

function FighterEditor({
  title,
  side,
  groups,
  data,
  onSpecies,
  onChange,
  build,
}: {
  title: string;
  side: SideState;
  groups: SpeciesGroup[];
  data: NonNullable<ReturnType<typeof useResearchData>["data"]>;
  onSpecies: (group: SpeciesGroup) => void;
  onChange: (next: SideState | ((current: SideState) => SideState)) => void;
  build: ReturnType<typeof packFighter>;
}) {
  const group = groups.find((item) => item.name === side.species) ?? null;
  const entry: PogoStatRecord | null = group
    ? (group.entries.find((item) => item.form === side.form) ?? group.entries[0] ?? null)
    : null;
  const pvp = entry ? findPvpPokemon(data.bundle, entry.pokemon_id, side.form) : null;
  const fasts = pvp ? resolveMoves(data.bundle, pvp.fast) : [];
  const charged = pvp ? resolveMoves(data.bundle, pvp.charged) : [];

  return (
    <section className="panel">
      <h2 className="panel-title">{title}</h2>
      <p className="selected-name">{group ? speciesDisplayName(group) : "未選択"}</p>
      <p className="note">
        {build ? `Lv ${build.build.level.toFixed(1)} / CP ${build.build.cp} / HP ${build.build.stamina}` : "CP上限内の個体がありません"}
      </p>
      <SpeciesPicker groups={groups} selectedName={side.species} onSelect={onSpecies} compact />
      {group && group.entries.length > 1 ? (
        <div className="choice-row" role="group" aria-label="フォルム">
          {group.entries.map((item) => (
            <button
              key={item.form}
              type="button"
              className="choice"
              aria-pressed={item.form === side.form}
              onClick={() => onChange({ ...side, form: item.form })}
            >
              {formatFormLabel(item.form)}
            </button>
          ))}
        </div>
      ) : null}
      <label className="check-row">
        <input type="checkbox" checked={side.shadow} onChange={(event) => onChange({ ...side, shadow: event.target.checked })} />
        シャドウ
      </label>
      <div className="iv-controls">
        <IvBox label="攻撃IV" value={side.atkIv} onChange={(atkIv) => onChange({ ...side, atkIv })} />
        <IvBox label="防御IV" value={side.defIv} onChange={(defIv) => onChange({ ...side, defIv })} />
        <IvBox label="HP IV" value={side.staIv} onChange={(staIv) => onChange({ ...side, staIv })} />
      </div>
      <label className="field">
        <span className="field-label">通常技</span>
        <select className="input" value={side.fastId} onChange={(event) => onChange({ ...side, fastId: event.target.value })}>
          {fasts.map((move) => (
            <option key={move.id} value={move.id}>
              {move.name}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span className="field-label">ゲージ技①</span>
        <select className="input" value={side.chargedId} onChange={(event) => onChange({ ...side, chargedId: event.target.value })}>
          {charged.map((move) => (
            <option key={move.id} value={move.id}>
              {move.name}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span className="field-label">ゲージ技②</span>
        <select className="input" value={side.chargedId2} onChange={(event) => onChange({ ...side, chargedId2: event.target.value })}>
          <option value="">なし</option>
          {charged.map((move) => (
            <option key={move.id} value={move.id}>
              {move.name}
            </option>
          ))}
        </select>
      </label>
      <div className="choice-row" role="group" aria-label="シールド">
        {[0, 1, 2].map((count) => (
          <button
            key={count}
            type="button"
            className="choice"
            aria-pressed={side.shields === count}
            onClick={() => onChange({ ...side, shields: count })}
          >
            シールド{count}
          </button>
        ))}
      </div>
      <div className="choice-row" role="group" aria-label="ゲージ技タイミング">
        <button type="button" className="choice" aria-pressed={side.timing === "asap"} onClick={() => onChange({ ...side, timing: "asap" })}>
          最短
        </button>
        <button type="button" className="choice" aria-pressed={side.timing === "cct"} onClick={() => onChange({ ...side, timing: "cct" })}>
          最適（CCT）
        </button>
      </div>
      <label className="check-row">
        <input
          type="checkbox"
          checked={side.applyChanceBuffs}
          onChange={(event) => onChange({ ...side, applyChanceBuffs: event.target.checked })}
        />
        確率の追加効果を発動する
      </label>
    </section>
  );
}

function HpBar({ name, hp, max, tone }: { name: string; hp: number; max: number; tone: "self" | "foe" }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (hp / max) * 100)) : 0;
  return (
    <div className={`hp-bar is-${tone}`}>
      <div className="hp-bar-meta">
        <span>{name}</span>
        <strong className="num">
          {hp} / {max}
        </strong>
      </div>
      <div className="hp-track">
        <i style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function IvBox({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <input
        className="input iv-input"
        type="number"
        min={0}
        max={15}
        inputMode="numeric"
        value={value}
        onChange={(event) => onChange(clampIv(Number(event.target.value)))}
      />
    </label>
  );
}
