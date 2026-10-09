import { useMemo, useState, type CSSProperties } from "react";
import { ArrowLeft } from "lucide-react";
import { LeagueIconButton } from "../../components/LeagueIconButton";
import { PokemonDotSprite } from "../../components/PokemonDotSprite";
import type { PvpMove } from "../../lib/pogo/combat";
import { bestMoves } from "../../lib/pogo/moveScore";
import { findPvpPokemon, resolveMoves } from "../../lib/pogo/pvpBundle";
import {
  computeBestRankings,
  findMaxLevelBuild,
  leagueCap,
  leagueConfigs,
  speciesDisplayName,
  type LeagueId,
  type PogoStatRecord,
  type SpeciesGroup,
} from "../../lib/pogo/research";
import { simulateBattle, simulateShieldGrid, type ChargeTiming, type FighterInput, type TimelineEvent } from "../../lib/pogo/simulate";
import { useResearchData } from "../shared/useResearchData";
import { openPokemonSearch } from "../shared/pokemonSearchApi";

type SideState = {
  record: PogoStatRecord | null;
  label: string;
  exactSprite: boolean;
  spriteSuffix: number | null;
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
  record: null,
  label: "",
  exactSprite: false,
  spriteSuffix: null,
  shadow: false,
  atkIv: 0,
  defIv: 15,
  staIv: 15,
  fastId: "",
  chargedId: "",
  chargedId2: "",
  shields: 0,
  timing: "cct",
  applyChanceBuffs: false,
};

function clampIv(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(15, Math.max(0, Math.round(value)));
}

export function SimResearchPage() {
  const { data, error, cpData, reload } = useResearchData();
  const [leagueId, setLeagueId] = useState<LeagueId>("great");
  const [sideA, setSideA] = useState<SideState>(emptySide);
  const [sideB, setSideB] = useState<SideState>(emptySide);

  const cap = leagueCap(leagueId);
  const fighterA = packFighter(sideA, data, cpData, cap);
  const fighterB = packFighter(sideB, data, cpData, cap);

  const result = useMemo(() => {
    if (!fighterA || !fighterB) return null;
    return simulateBattle(fighterA.input, fighterB.input);
  }, [fighterA, fighterB]);

  const grid = useMemo(() => {
    if (!fighterA || !fighterB) return null;
    return simulateShieldGrid(fighterA.input, fighterB.input);
  }, [fighterA, fighterB]);

  return (
    <div className="page-iv sim-page">
      <div className="page-heading">
        <a className="btn btn-secondary btn-back" href="#/">
          <ArrowLeft size={16} />
          ホーム
        </a>
        <div>
          <h1>バトルシミュレーション研究</h1>
          <p className="page-lead">2匹を横に並べたまま、シールドと技のタイミングを変えます。名前を押すと検索して入れ替えられます。</p>
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

      {data && cpData ? (
        <>
          <svg className="type-wash-defs" aria-hidden="true" focusable="false">
            <filter id="type-wash" x="-20%" y="-20%" width="140%" height="140%" colorInterpolationFilters="sRGB">
              <feTurbulence type="fractalNoise" baseFrequency="0.012 0.05" numOctaves="2" seed="4" result="noise" />
              <feDisplacementMap in="SourceGraphic" in2="noise" scale="56" xChannelSelector="R" yChannelSelector="G" />
            </filter>
          </svg>
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
            <FighterCard
              title="自分"
              tone="self"
              side={sideA}
              data={data}
              cap={cap}
              levels={cpData.levels}
              byLevel={cpData.byLevel}
              onChange={setSideA}
            />
            <FighterCard
              title="相手"
              tone="foe"
              side={sideB}
              data={data}
              cap={cap}
              levels={cpData.levels}
              byLevel={cpData.byLevel}
              onChange={setSideB}
            />
          </div>
          <p className="note">最適は相手の技に合わせます。追加効果を入れると、確率の変化も必ず起きます。</p>

          {result && fighterA && fighterB ? (
            <>
              <section className="panel result-panel sim-result">
                <h2 className="panel-title">この対面</h2>
                <div className="hero-stats">
                  <div>
                    <span>結果</span>
                    <strong className={`sim-outcome ${result.winner === "a" ? "win-text" : result.winner === "b" ? "lose-text" : ""}`}>
                      {result.winner === "a" ? "勝ち" : result.winner === "b" ? "負け" : "相打ち"}
                    </strong>
                  </div>
                  <div>
                    <span>評価</span>
                    <strong className="hero-cp num">{result.rating}</strong>
                  </div>
                </div>
                <div className="sim-hp-row">
                  <HpBar name={fighterA.name} hp={result.hpA} max={result.maxHpA} tone="self" />
                  <HpBar name={fighterB.name} hp={result.hpB} max={result.maxHpB} tone="foe" />
                </div>
                <p className="note">
                  {result.turns}ターン。評価が100より大きいと勝ちです。
                </p>
              </section>

              {grid ? (
                <section className="panel">
                  <h2 className="panel-title">シールド9マス</h2>
                  <p className="note">マスを押すと、その枚数の結果に切り替わります。自分の枚数が縦、相手が横です。</p>
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

              <section className="panel battle-sheet-panel">
                <BattleSheet events={result.timeline} />
              </section>
            </>
          ) : (
            <section className="panel">
              <p className="page-lead">両方のポケモンにノーマルアタックが入ると、シミュレーションが始まります。</p>
            </section>
          )}
        </>
      ) : null}
    </div>
  );
}

function packFighter(
  side: SideState,
  data: ReturnType<typeof useResearchData>["data"],
  cpData: ReturnType<typeof useResearchData>["cpData"],
  cap: number,
) {
  if (!data || !cpData || !side.record) return null;
  const entry = side.record;
  const pvp = findPvpPokemon(data.bundle, entry.pokemon_id, entry.form);
  if (!pvp) return null;
  const fasts = resolveMoves(data.bundle, pvp.fast);
  const chargedMoves = resolveMoves(data.bundle, pvp.charged);
  const fast = fasts.find((move) => move.id === side.fastId) ?? fasts[0];
  if (!fast) return null;
  const charged = [side.chargedId, side.chargedId2]
    .map((id) => chargedMoves.find((move) => move.id === id) ?? null)
    .filter((move): move is PvpMove => Boolean(move));
  const build = findMaxLevelBuild(entry, side.atkIv, side.defIv, side.staIv, cpData.levels, cpData.byLevel, cap);
  if (!build) return null;
  const input: FighterInput = {
    label: side.label || entry.pokemon_name,
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
  return { name: side.label || entry.pokemon_name, pvp, build, fasts, chargedMoves, input };
}

function FighterCard({
  title,
  tone,
  side,
  data,
  cap,
  levels,
  byLevel,
  onChange,
}: {
  title: string;
  tone: "self" | "foe";
  side: SideState;
  data: NonNullable<ReturnType<typeof useResearchData>["data"]>;
  cap: number;
  levels: number[];
  byLevel: Map<string, number>;
  onChange: (next: SideState | ((current: SideState) => SideState)) => void;
}) {
  const packed = packFighter(side, data, { levels, byLevel }, cap);
  const fasts = packed?.fasts ?? [];
  const chargedMoves = packed?.chargedMoves ?? [];
  const fastValue = fasts.some((move) => move.id === side.fastId) ? side.fastId : (fasts[0]?.id ?? "");
  const chargedValue = chargedMoves.some((move) => move.id === side.chargedId) ? side.chargedId : (chargedMoves[0]?.id ?? "");
  const charged2Value = chargedMoves.some((move) => move.id === side.chargedId2) ? side.chargedId2 : "";
  const stats = packed?.build;
  const types = packed?.pvp.types ?? [];
  const typeStyle: CSSProperties | undefined = types.length
    ? ({
        "--type-main": typePastel(types[0]),
        "--type-accent": typePastel(types[1] ?? types[0]),
      } as CSSProperties)
    : undefined;

  return (
    <section className={`sim-card is-${tone}${types.length ? " has-type" : ""}`} style={typeStyle}>
      <p className="sim-role">{title}</p>
      <button
        type="button"
        className="identity-pick"
        onClick={() => {
          openPokemonSearch((group: SpeciesGroup) => {
            const entry = group.entries[0];
            if (!entry) return;
            const pvp = findPvpPokemon(data.bundle, entry.pokemon_id, entry.form);
            const nextFasts = pvp ? resolveMoves(data.bundle, pvp.fast) : [];
            const nextCharged = pvp ? resolveMoves(data.bundle, pvp.charged) : [];
            const types = pvp?.types ?? [];
            const rankedFast = bestMoves(nextFasts, types, "fast");
            const rankedCharged = bestMoves(nextCharged, types, "charged");
            const best = computeBestRankings(entry, levels, byLevel, cap)[0];
            onChange((current) => ({
              ...current,
              record: entry,
              label: speciesDisplayName(group),
              exactSprite: Boolean(group.exactSprite),
              spriteSuffix: group.spriteSuffix ?? null,
              fastId: rankedFast[0]?.id ?? "",
              chargedId: rankedCharged[0]?.id ?? "",
              chargedId2: rankedCharged[1]?.id ?? "",
              atkIv: best?.atkIv ?? current.atkIv,
              defIv: best?.defIv ?? current.defIv,
              staIv: best?.staIv ?? current.staIv,
            }));
          });
        }}
      >
        <span className="sprite-slot">
          {side.record ? (
            <PokemonDotSprite
              pokemonId={side.record.pokemon_id}
              form={side.exactSprite ? undefined : side.record.form}
              exact={side.exactSprite}
              spriteSuffix={side.spriteSuffix}
              alt=""
              size={40}
            />
          ) : (
            <img className="pokemon-dot-sprite" src="/Image/sprite/Question_Mark.png" alt="" width={40} height={40} />
          )}
        </span>
        <span className="identity-pick-name">{side.record ? side.label : "検索"}</span>
      </button>

      {!side.record ? null : stats ? (
        <p className="sim-cp-line">
          <span>CP</span>
          <strong className="sim-cp num">{stats.cp}</strong>
          <span className="note">
            Lv {stats.level.toFixed(1)} / HP {stats.stamina}
          </span>
        </p>
      ) : side.record ? (
        <p className="note">このリーグのCP上限に入るレベルがありません。</p>
      ) : null}

      {side.record && !packed ? <p className="note">技データがありません。</p> : null}

      {side.record ? (
        <>
      <div className="sim-ivs">
        <IvBox label="攻撃" value={side.atkIv} onChange={(atkIv) => onChange({ ...side, atkIv })} />
        <IvBox label="防御" value={side.defIv} onChange={(defIv) => onChange({ ...side, defIv })} />
        <IvBox label="HP" value={side.staIv} onChange={(staIv) => onChange({ ...side, staIv })} />
      </div>

      <label className="field">
        <span className="field-label">ノーマルアタック</span>
        <select className="input" value={fastValue} onChange={(event) => onChange({ ...side, fastId: event.target.value })}>
          {fasts.map((move) => (
            <option key={move.id} value={move.id}>
              {move.name}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span className="field-label">スペシャルアタック</span>
        <select className="input" value={chargedValue} onChange={(event) => onChange({ ...side, chargedId: event.target.value })}>
          {chargedMoves.map((move) => (
            <option key={move.id} value={move.id}>
              {move.name}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span className="field-label">スペシャルアタック2</span>
        <select className="input" value={charged2Value} onChange={(event) => onChange({ ...side, chargedId2: event.target.value })}>
          <option value="">なし</option>
          {chargedMoves.map((move) => (
            <option key={move.id} value={move.id}>
              {move.name}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span className="field-label">シールド</span>
        <select
          className="input"
          value={side.shields}
          onChange={(event) => onChange({ ...side, shields: Number(event.target.value) })}
        >
          <option value={0}>0</option>
          <option value={1}>1</option>
          <option value={2}>2</option>
        </select>
      </label>
      <label className="field">
        <span className="field-label">タイミング</span>
        <select
          className="input"
          value={side.timing}
          onChange={(event) => onChange({ ...side, timing: event.target.value as ChargeTiming })}
        >
          <option value="asap">最短</option>
          <option value="cct">最適</option>
        </select>
      </label>
      <label className="check-row">
        <input type="checkbox" checked={side.shadow} onChange={(event) => onChange({ ...side, shadow: event.target.checked })} />
        <span>シャドウ</span>
      </label>
      <label className="check-row">
        <input
          type="checkbox"
          checked={side.applyChanceBuffs}
          onChange={(event) => onChange({ ...side, applyChanceBuffs: event.target.checked })}
        />
        <span>追加効果</span>
      </label>
        </>
      ) : null}
    </section>
  );
}

type SheetCell = {
  show: boolean;
  span: number;
  name: string;
  type: string;
  damage: number;
  shielded: boolean;
};

type TurnRow = { turn: number; hpA: number; hpB: number; a: TimelineEvent | null; b: TimelineEvent | null };

function buildSheet(events: TimelineEvent[]) {
  const turns: TurnRow[] = [];
  for (const event of events) {
    let row = turns[turns.length - 1];
    if (!row || row.turn !== event.turn) {
      row = { turn: event.turn, hpA: event.hpA, hpB: event.hpB, a: null, b: null };
      turns.push(row);
    }
    row.hpA = event.hpA;
    row.hpB = event.hpB;
    row[event.actor] = event;
  }

  const chargeTurns = new Set(
    turns.filter((row) => row.a?.kind === "charged" || row.b?.kind === "charged").map((row) => row.turn),
  );
  const cellsA = moveSegments(turns, "a", chargeTurns);
  const cellsB = moveSegments(turns, "b", chargeTurns);

  return turns.map((row) => ({
    turn: row.turn,
    hpA: row.hpA,
    hpB: row.hpB,
    charge: chargeTurns.has(row.turn),
    a: cellsA.get(row.turn) ?? null,
    b: cellsB.get(row.turn) ?? null,
  }));
}

function moveSegments(turns: TurnRow[], actor: "a" | "b", chargeTurns: Set<number>) {
  const cells = new Map<number, SheetCell | null>();
  let index = 0;
  while (index < turns.length) {
    const event = turns[index][actor];
    if (!event) {
      cells.set(turns[index].turn, null);
      index += 1;
      continue;
    }

    let end = index;
    while (end < turns.length && turns[end][actor]?.actionId === event.actionId) {
      const splitAfter = chargeTurns.has(turns[end].turn);
      end += 1;
      if (splitAfter) break;
    }

    const slice = turns.slice(index, end);
    const landing = [...slice].reverse().find((row) => (row[actor]?.damage ?? 0) > 0)?.[actor];
    cells.set(turns[index].turn, {
      show: true,
      span: end - index,
      name: event.moveName,
      type: event.moveType,
      damage: landing?.damage ?? 0,
      shielded: landing?.shielded ?? false,
    });
    for (let cursor = index + 1; cursor < end; cursor += 1) {
      cells.set(turns[cursor].turn, { show: false, span: 0, name: "", type: "", damage: 0, shielded: false });
    }
    index = end;
  }
  return cells;
}

function BattleSheet({ events }: { events: TimelineEvent[] }) {
  const rows = buildSheet(events);
  return (
    <table className="battle-sheet" aria-label="行動">
      <colgroup>
        <col className="col-hp" />
        <col className="col-move" />
        <col className="col-turn" />
        <col className="col-move" />
        <col className="col-hp" />
      </colgroup>
      <tbody>
        {rows.map((row) => (
          <tr key={row.turn} className={row.charge ? "has-charge" : undefined}>
            <td className="hp num">{row.hpA}</td>
            <MoveCell cell={row.a} />
            <td className="turn num">{row.turn}</td>
            <MoveCell cell={row.b} />
            <td className="hp num">{row.hpB}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function MoveCell({ cell }: { cell: SheetCell | null }) {
  if (!cell) return <td className="move is-empty" />;
  if (!cell.show) return null;
  return (
    <td className="move" rowSpan={cell.span} style={{ background: typeWash(cell.type) }}>
      <span className="move-label">
        <span>{cell.name}</span>
        {cell.damage > 0 ? <span className="num move-dmg">{cell.shielded ? `${cell.damage}防` : cell.damage}</span> : null}
      </span>
    </td>
  );
}

const TYPE_PASTEL: Record<string, string> = {
  normal: "#e4ddd2",
  fire: "#f7c7b4",
  water: "#b7ddf6",
  electric: "#f8ebae",
  grass: "#c5e6bc",
  ice: "#d2f3f6",
  fighting: "#f3c4bc",
  poison: "#e2c6ea",
  ground: "#ead7b4",
  flying: "#d4e0f6",
  psychic: "#f6c6dc",
  bug: "#dce8aa",
  rock: "#e6dcc6",
  ghost: "#d2cbe4",
  dragon: "#c9d2f4",
  dark: "#d4cedc",
  steel: "#dce3e8",
  fairy: "#f8d4e8",
};

function typePastel(type: string) {
  return TYPE_PASTEL[type] ?? "#e7eef2";
}

function typeWash(type: string) {
  return `color-mix(in srgb, ${typePastel(type)} 50%, white)`;
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
