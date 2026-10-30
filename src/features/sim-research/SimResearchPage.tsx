import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type Ref } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, Pin } from "lucide-react";
import { LeagueIconButton } from "../../components/LeagueIconButton";
import { PokemonDotSprite } from "../../components/PokemonDotSprite";
import { PokemonLabelFit } from "../../components/PokemonLabelFit";
import { bladeFastMove, statsUnderCap } from "../../lib/pogo/battleTraits";
import { damageForMove, type PvpMove } from "../../lib/pogo/combat";
import { MEGA_LEVELS, readMegaLevel, scaleThirdAttack, type MegaLevel } from "../../lib/pogo/megaLevel";
import { bestMoves } from "../../lib/pogo/moveScore";
import { recordPokemonPick } from "../../lib/pogo/pokemonPicks";
import { findPvpPokemon, resolveMoves } from "../../lib/pogo/pvpBundle";
import {
  computeBestRankings,
  computeDerivedStats,
  findMaxLevelBuild,
  formatBattleStat,
  formatScp,
  leagueCap,
  leagueConfigs,
  displayNameParts,
  speciesDisplayName,
  withBuddyLevels,
  type LeagueId,
  type PogoStatRecord,
  type RankingRow,
  type SpeciesGroup,
} from "../../lib/pogo/research";
import {
  simulateBattle,
  simulateShieldGrid,
  type ChargeTiming,
  type FighterInput,
  type SimResult,
  type TimelineEvent,
} from "../../lib/pogo/simulate";
import { moveBonusEffectLines } from "../../lib/pogo/moveBonusEffect";
import { TimelineOps, PlanPopup, ThrowPopup, chargedNameAt } from "./TimelineOps";
import { InitialStatePopup, type InitialState } from "./InitialStatePopup";
import { TimelineCustom } from "./TimelineCustom";
import { extendPlanFromTimeline, fillLaggingSide, type TimelineStep } from "../../lib/pogo/timelinePlan";
import { IvBars } from "../shared/IvBars";
import { useResearchData } from "../shared/useResearchData";
import { openPokemonSearch } from "../shared/pokemonSearchApi";
import { FrequentPokemon } from "./FrequentPokemon";

const SOZAI_SHADOW_SRC = "/Image/sozai/shadow.png";
const SOZAI_SHIELD_SRC = "/Image/sozai/shield-ui.png";

function ShadowMark() {
  return <img className="sim-shadow-mark" src={SOZAI_SHADOW_SRC} alt="" width={22} height={22} decoding="async" />;
}

function ShieldMark({ size = 16 }: { size?: number }) {
  const height = Math.round(size * (25 / 22));
  return (
    <img
      className="sozai-shield"
      src={SOZAI_SHIELD_SRC}
      alt="防"
      width={size}
      height={height}
      decoding="async"
    />
  );
}

export type SideState = {
  record: PogoStatRecord | null;
  label: string;
  exactSprite: boolean;
  spriteSuffix: number | null;
  shadow: boolean;
  atkIv: number;
  defIv: number;
  staIv: number;
  /** 51 は相棒ボーナスあり。シミュの初期値。 */
  maxLevel: 50 | 51;
  fastId: string;
  chargedId: string;
  chargedId2: string;
  /** サードアタックの威力倍率。1=1.0、2=1.1、3=1.2、4=1.3。 */
  megaLevel: MegaLevel;
  shields: number;
  timing: ChargeTiming;
  moveMode: "optimal" | "custom";
  /** 6回まで。null はその回を打たない。 */
  moveSlots: (string | null)[];
  shieldMode: "optimal" | "custom";
  /** 受けるスペシャルの何発目を防ぐか。最大2。 */
  shieldSlots: number[];
  throwTweaks: ({ buff: boolean; damagePercent: number } | null)[];
  applyChanceBuffs: boolean;
  timelineMode: "optimal" | "custom";
  timelinePlan: TimelineStep[] | null;
  initialOn: boolean;
  /** 0ターン目までに受けているダメージ。残HPは最大HPから引く。 */
  initialDamage: number;
  /** 0～100。 */
  initialEnergy: number;
  initialAttackStage: number;
  initialDefenseStage: number;
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
  maxLevel: 51,
  fastId: "",
  chargedId: "",
  chargedId2: "",
  megaLevel: 1,
  shields: 0,
  timing: "cct",
  moveMode: "optimal",
  moveSlots: [null, null, null, null, null, null],
  shieldMode: "optimal",
  shieldSlots: [],
  throwTweaks: [null, null, null, null, null, null],
  applyChanceBuffs: false,
  timelineMode: "optimal",
  timelinePlan: null,
  initialOn: false,
  initialDamage: 0,
  initialEnergy: 0,
  initialAttackStage: 0,
  initialDefenseStage: 0,
};

function blankSlots() {
  return [null, null, null, null, null, null] as (string | null)[];
}

function blankTweaks() {
  return [null, null, null, null, null, null] as ({ buff: boolean; damagePercent: number } | null)[];
}

function clearPlans(side: SideState): SideState {
  return {
    ...side,
    moveMode: "optimal",
    moveSlots: blankSlots(),
    shieldMode: "optimal",
    shieldSlots: [],
    throwTweaks: blankTweaks(),
    timelineMode: "optimal",
    timelinePlan: null,
    initialOn: false,
    initialDamage: 0,
    initialEnergy: 0,
    initialAttackStage: 0,
    initialDefenseStage: 0,
  };
}

function samePokemon(a: PogoStatRecord | null, b: PogoStatRecord | null) {
  return a?.pokemon_id === b?.pokemon_id && a?.form === b?.form;
}

function moveShieldSlot(slots: number[], index: number) {
  if (slots.includes(index)) return slots.filter((slot) => slot !== index).sort((a, b) => a - b);
  if (slots.length < 2) return [...slots, index].sort((a, b) => a - b);
  const earlier = Math.min(...slots);
  if (earlier === index) return slots;
  return [earlier, index].sort((a, b) => a - b);
}

function levelScale(
  cpData: { levels: number[]; byLevel: Map<string, number> },
  maxLevel: 50 | 51,
) {
  const scaled = maxLevel === 51 ? withBuddyLevels(cpData, true) : cpData;
  return {
    levels: scaled.levels.filter((level) => level <= maxLevel + 1e-9),
    byLevel: scaled.byLevel,
  };
}

/** SCP順位が2桁（1～99位）の個体だけから、攻撃・防御・HPの実数値が最大の行を選ぶ。 */
function pickStatMax(rows: RankingRow[], key: "attack" | "defense" | "stamina") {
  const eligible = rows.filter((row) => row.rank <= 99);
  return eligible.reduce<RankingRow | null>((best, row) => {
    if (!best || row[key] > best[key] + 1e-6) return row;
    if (Math.abs(row[key] - best[key]) <= 1e-6 && row.rank < best.rank) return row;
    return best;
  }, null);
}

export function SimResearchPage() {
  const { data, error, cpData, reload } = useResearchData();
  const [leagueId, setLeagueId] = useState<LeagueId>("great");
  const [sideA, setSideA] = useState<SideState>(emptySide);
  const [sideB, setSideB] = useState<SideState>(emptySide);
  const [shieldPinned, setShieldPinned] = useState(false);
  const [shieldCustomActive, setShieldCustomActive] = useState(false);
  const [planEditor, setPlanEditor] = useState<null | { kind: "move" | "shield"; side: "a" | "b" }>(null);
  const [throwEditor, setThrowEditor] = useState<null | { side: "a" | "b"; index: number }>(null);
  const [timelineOpen, setTimelineOpen] = useState(false);
  const inlinePinRef = useRef<HTMLButtonElement>(null);
  const dockObserver = useRef<ResizeObserver | null>(null);

  const cap = leagueCap(leagueId);
  const fighterA = packFighter(sideA, data, cpData, cap, shieldCustomActive);
  const fighterB = packFighter(sideB, data, cpData, cap, shieldCustomActive);

  const result = useMemo(() => {
    if (!fighterA || !fighterB) return null;
    return simulateBattle(fighterA.input, fighterB.input);
  }, [fighterA, fighterB]);

  const grid = useMemo(() => {
    if (!fighterA || !fighterB) return null;
    return simulateShieldGrid(fighterA.input, fighterB.input);
  }, [fighterA, fighterB]);

  const selectShields = (shieldsA: number, shieldsB: number) => {
    setShieldCustomActive(false);
    setSideA((current) => ({ ...current, shields: shieldsA, shieldMode: "optimal" }));
    setSideB((current) => ({ ...current, shields: shieldsB, shieldMode: "optimal" }));
  };

  const selectShieldCustom = () => {
    setShieldCustomActive(true);
    setSideA((current) => ({ ...current, shieldMode: "custom", shields: current.shieldSlots.length }));
    setSideB((current) => ({ ...current, shieldMode: "custom", shields: current.shieldSlots.length }));
  };

  const changeSide = (which: "a" | "b", next: SideState | ((current: SideState) => SideState)) => {
    const apply = (current: SideState) => (typeof next === "function" ? next(current) : next);
    const setThis = which === "a" ? setSideA : setSideB;
    const setOther = which === "a" ? setSideB : setSideA;
    setThis((current) => {
      const resolved = apply(current);
      if (samePokemon(current.record, resolved.record)) return resolved;
      setShieldCustomActive(false);
      setOther((other) => clearPlans(other));
      return clearPlans(resolved);
    });
  };

  const toggleShieldPin = (fromDock = false) => {
    setShieldPinned((current) => {
      if (current && fromDock) {
        window.setTimeout(() => inlinePinRef.current?.focus({ preventScroll: true }), 0);
      }
      return !current;
    });
  };

  const setDockNode = useCallback((node: HTMLDivElement | null) => {
    dockObserver.current?.disconnect();
    dockObserver.current = null;
    if (!node) {
      document.documentElement.style.removeProperty("--shield-dock-h");
      return;
    }
    const apply = () => {
      document.documentElement.style.setProperty("--shield-dock-h", `${Math.ceil(node.getBoundingClientRect().height)}px`);
    };
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(node);
    dockObserver.current = observer;
  }, []);

  useEffect(() => {
    return () => {
      dockObserver.current?.disconnect();
      document.documentElement.style.removeProperty("--shield-dock-h");
    };
  }, []);

  return (
    <div className="page-iv sim-page">
      <div className="page-heading sim-heading">
        <a className="btn btn-secondary btn-back" href="#/">
          <ArrowLeft size={16} />
          ホーム
        </a>
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

          <FrequentPokemon
            stats={data.stats}
            onPick={(record, label, which) => {
              const group: SpeciesGroup = {
                name: `${record.pokemon_id}:${record.form}`,
                pokemonId: record.pokemon_id,
                entries: [record],
                label,
              };
              recordPokemonPick(group.pokemonId, group.name);
              changeSide(which, (current) => fillSideFromGroup(group, data, cpData.levels, cpData.byLevel, cap, current));
            }}
          />

          <div className="duel-grid">
            <FighterCard
              title="自分"
              tone="self"
              side={sideA}
              data={data}
              cap={cap}
              levels={cpData.levels}
              byLevel={cpData.byLevel}
              onChange={(next) => changeSide("a", next)}
            />
            <FighterCard
              title="相手"
              tone="foe"
              side={sideB}
              data={data}
              cap={cap}
              levels={cpData.levels}
              byLevel={cpData.byLevel}
              onChange={(next) => changeSide("b", next)}
            />
          </div>

          {result && fighterA && fighterB ? (
            <>
              <section className="panel result-panel sim-result" aria-label="この対面">
                <div className="sim-result-shadows">
                  {sideA.record ? (
                    <button
                      type="button"
                      className="league-choice sim-shadow-toggle"
                      aria-pressed={sideA.shadow}
                      aria-label={sideA.shadow ? "自分のシャドウを外す" : "自分をシャドウにする"}
                      onClick={() => setSideA((current) => ({ ...current, shadow: !current.shadow }))}
                    >
                      <ShadowMark />
                    </button>
                  ) : (
                    <span aria-hidden="true" />
                  )}
                  {sideB.record ? (
                    <button
                      type="button"
                      className="league-choice sim-shadow-toggle"
                      aria-pressed={sideB.shadow}
                      aria-label={sideB.shadow ? "相手のシャドウを外す" : "相手をシャドウにする"}
                      onClick={() => setSideB((current) => ({ ...current, shadow: !current.shadow }))}
                    >
                      <ShadowMark />
                    </button>
                  ) : null}
                </div>
                <div className="sim-matchup">
                  <MatchupSide
                    word={result.winner === "draw" ? null : result.winner === "a" ? "WIN" : "LOSE"}
                    side={sideA}
                    hp={result.hpA}
                    max={result.maxHpA}
                    cp={fighterA.build.cp}
                    scp={formatScp(fighterA.build.statProduct)}
                    attack={fighterA.build.attack}
                    defense={fighterA.build.defense}
                    stamina={fighterA.build.stamina}
                    energy={result.energyA}
                    hits={matchupMoveHits(fighterA.input, fighterB.input, fighterA.thirdMove?.id ?? null)}
                  />
                  <MatchupSide
                    word={result.winner === "draw" ? null : result.winner === "b" ? "WIN" : "LOSE"}
                    side={sideB}
                    hp={result.hpB}
                    max={result.maxHpB}
                    cp={fighterB.build.cp}
                    scp={formatScp(fighterB.build.statProduct)}
                    attack={fighterB.build.attack}
                    defense={fighterB.build.defense}
                    stamina={fighterB.build.stamina}
                    energy={result.energyB}
                    hits={matchupMoveHits(fighterB.input, fighterA.input, fighterB.thirdMove?.id ?? null)}
                  />
                </div>
                <p className="note">{result.turns}ターン</p>
              </section>

              {grid && sideA.record && sideB.record ? (
                <div className="shield-block">
                  <ShieldGridView
                    variant="inline"
                    sideA={sideA}
                    sideB={sideB}
                    grid={grid}
                    pinned={shieldPinned}
                    pinRef={inlinePinRef}
                    onTogglePin={() => toggleShieldPin(false)}
                    onSelect={selectShields}
                    customActive={shieldCustomActive}
                    onCustom={selectShieldCustom}
                  />
                  <p className="note">マスを押すと、その枚数の結果に切り替わります。自分の枚数が縦、相手が横です。</p>
                </div>
              ) : null}
              {shieldPinned && grid && sideA.record && sideB.record ? (
                <div className="shield-dock" ref={setDockNode}>
                  <ShieldGridView
                    variant="dock"
                    sideA={sideA}
                    sideB={sideB}
                    grid={grid}
                    pinned={shieldPinned}
                    onTogglePin={() => toggleShieldPin(true)}
                    onSelect={selectShields}
                    customActive={shieldCustomActive}
                    onCustom={selectShieldCustom}
                  />
                </div>
              ) : null}

              <div className="timeline-stack">
              <p className="sim-section-label">タイムライン</p>
              <TimelineOps
                sideA={sideA}
                sideB={sideB}
                movesA={fighterA.input.charged}
                movesB={fighterB.input.charged}
                timeline={result.timeline}
                onChangeA={(next) => changeSide("a", next)}
                onChangeB={(next) => changeSide("b", next)}
                onEdit={setPlanEditor}
                onUseCustomShield={() => setShieldCustomActive(true)}
              />
              <section className="panel battle-sheet-panel">
                <BattleSheet
                  events={result.timeline}
                  onCharged={(side, index) => setThrowEditor({ side, index })}
                />
              </section>
              <button
                type="button"
                className={`timeline-custom-open${sideA.timelineMode === "custom" ? " is-on" : ""}`}
                onClick={() => {
                  const nextA = extendPlanFromTimeline(
                    sideA.timelineMode === "custom" ? sideA.timelinePlan : null,
                    result.timeline,
                    "a",
                  );
                  const nextB = extendPlanFromTimeline(
                    sideB.timelineMode === "custom" ? sideB.timelinePlan : null,
                    result.timeline,
                    "b",
                  );
                  const filled = fillLaggingSide(
                    nextA,
                    Math.max(1, fighterA.input.fast.turns),
                    fighterA.input.fast.id,
                    fighterA.input.fast.energyGain,
                    fighterA.input.charged,
                    nextB,
                    Math.max(1, fighterB.input.fast.turns),
                    fighterB.input.fast.id,
                    fighterB.input.fast.energyGain,
                    fighterB.input.charged,
                  );
                  setSideA((current) => ({ ...current, timelineMode: "custom", timelinePlan: filled.stepsA }));
                  setSideB((current) => ({ ...current, timelineMode: "custom", timelinePlan: filled.stepsB }));
                  setTimelineOpen(true);
                }}
              >
                タイムラインカスタム
              </button>
              </div>
              {timelineOpen && sideA.timelinePlan && sideB.timelinePlan ? (
                <TimelineCustom
                  sideA={{
                    label: sideA.label,
                    fast: fighterA.input.fast,
                    charged: fighterA.input.charged,
                    plan: sideA.timelinePlan,
                  }}
                  sideB={{
                    label: sideB.label,
                    fast: fighterB.input.fast,
                    charged: fighterB.input.charged,
                    plan: sideB.timelinePlan,
                  }}
                  chargeFill={typeChargeFill}
                  moveWash={typeWash}
                  onChangeA={(plan) => setSideA((current) => ({ ...current, timelineMode: "custom", timelinePlan: plan }))}
                  onChangeB={(plan) => setSideB((current) => ({ ...current, timelineMode: "custom", timelinePlan: plan }))}
                  onClose={() => setTimelineOpen(false)}
                />
              ) : null}
              {planEditor ? (
                <PlanPopup
                  kind={planEditor.kind}
                  side={planEditor.side === "a" ? sideA : sideB}
                  moves={planEditor.side === "a" ? fighterA.input.charged : fighterB.input.charged}
                  timeline={result.timeline}
                  actor={planEditor.side}
                  onClose={() => setPlanEditor(null)}
                  onChange={(next) => changeSide(planEditor.side, next)}
                />
              ) : null}
              {throwEditor ? (
                <ThrowPopup
                  side={throwEditor.side === "a" ? sideA : sideB}
                  index={throwEditor.index}
                  moveName={chargedNameAt(result.timeline, throwEditor.side, throwEditor.index)}
                  move={
                    data?.bundle.moves[
                      result.timeline.find(
                        (event) =>
                          event.actor === throwEditor.side &&
                          event.kind === "charged" &&
                          event.throwIndex === throwEditor.index,
                      )?.moveId ?? ""
                    ] ?? null
                  }
                  effectLines={moveBonusEffectLines(
                    data?.bundle.moves[
                      result.timeline.find(
                        (event) =>
                          event.actor === throwEditor.side &&
                          event.kind === "charged" &&
                          event.throwIndex === throwEditor.index,
                      )?.moveId ?? ""
                    ],
                  )}
                  onClose={() => setThrowEditor(null)}
                  onChange={(next) => changeSide(throwEditor.side, next)}
                />
              ) : null}
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

function ShieldGridView({
  variant,
  sideA,
  sideB,
  grid,
  pinned,
  pinRef,
  onTogglePin,
  onSelect,
  customActive,
  onCustom,
}: {
  variant: "inline" | "dock";
  sideA: SideState;
  sideB: SideState;
  grid: SimResult[][];
  pinned?: boolean;
  pinRef?: Ref<HTMLButtonElement>;
  onTogglePin?: () => void;
  onSelect: (shieldsA: number, shieldsB: number) => void;
  customActive: boolean;
  onCustom: () => void;
}) {
  if (!sideA.record || !sideB.record) return null;
  const dockOnly = variant === "dock";
  const label = dockOnly ? "画面下部に固定した対面表" : "対面表";
  return (
    <section className={`panel shield-panel${dockOnly ? " is-dock-only" : ""}`} aria-label={label}>
      {!dockOnly ? (
        <div className="shield-panel-head">
          <h2 className="shield-panel-title">対面表</h2>
          <button
            ref={pinRef}
            type="button"
            className="league-choice shield-pin-toggle"
            aria-pressed={Boolean(pinned)}
            aria-label={pinned ? "画面固定を外す" : "画面下部に固定"}
            onClick={onTogglePin}
          >
            <Pin size={13} aria-hidden="true" />
          </button>
        </div>
      ) : (
        <div className="shield-dock-ear">
          <button
            type="button"
            className="league-choice shield-pin-toggle is-dock"
            aria-pressed={Boolean(pinned)}
            aria-label="画面固定を外す"
            onClick={onTogglePin}
          >
            <Pin size={14} aria-hidden="true" />
          </button>
        </div>
      )}
      <div className="shield-grid" role="grid" aria-label="シールド評価">
        <button
          type="button"
          className={`shield-corner${customActive ? " is-selected" : ""}`}
          aria-pressed={customActive}
          aria-label="保存しているシールドのタイミング"
          onClick={onCustom}
        >
          <PokemonDotSprite
            className="corner-self"
            pokemonId={sideA.record.pokemon_id}
            form={sideA.exactSprite ? undefined : sideA.record.form}
            exact={sideA.exactSprite}
            spriteSuffix={sideA.spriteSuffix}
            alt=""
            size={22}
          />
          <PokemonDotSprite
            className="corner-foe"
            pokemonId={sideB.record.pokemon_id}
            form={sideB.exactSprite ? undefined : sideB.record.form}
            exact={sideB.exactSprite}
            spriteSuffix={sideB.spriteSuffix}
            alt=""
            size={22}
          />
        </button>
        {[0, 1, 2].map((shieldsB) => (
          <span key={`h-${shieldsB}`} className="shield-head">
            <ShieldMark size={15} />
            <span>×{shieldsB}</span>
          </span>
        ))}
        {grid.flatMap((row, shieldsA) => [
          <span key={`l-${shieldsA}`} className="shield-head">
            <ShieldMark size={15} />
            <span>×{shieldsA}</span>
          </span>,
          ...row.map((cell, shieldsB) => {
            const selected = !customActive && sideA.shields === shieldsA && sideB.shields === shieldsB;
            const tone = cell.rating > 100 ? "win" : cell.rating < 100 ? "lose" : "draw";
            return (
              <button
                key={`${shieldsA}-${shieldsB}`}
                type="button"
                className={`shield-cell is-${tone}${selected ? " is-selected" : ""}`}
                style={{ background: shieldFill(cell.rating) }}
                aria-pressed={selected}
                aria-label={`自分${shieldsA} 相手${shieldsB} ${cell.rating}`}
                onClick={() => onSelect(shieldsA, shieldsB)}
              >
                <strong className="num">{cell.rating}</strong>
              </button>
            );
          }),
        ])}
      </div>
    </section>
  );
}

function packFighter(
  side: SideState,
  data: ReturnType<typeof useResearchData>["data"],
  cpData: ReturnType<typeof useResearchData>["cpData"],
  cap: number,
  shieldCustomActive = false,
) {
  if (!data || !cpData || !side.record) return null;
  const entry = side.record;
  const pvp = findPvpPokemon(data.bundle, entry.pokemon_id, entry.form);
  if (!pvp) return null;
  const fasts = resolveMoves(data.bundle, pvp.fast);
  const chargedMoves = resolveMoves(data.bundle, pvp.charged);
  const fast = fasts.find((move) => move.id === side.fastId) ?? fasts[0];
  if (!fast) return null;
  const thirdBase = pvp.third ? (data.bundle.moves[pvp.third] ?? null) : null;
  const charged = [side.chargedId, side.chargedId2]
    .map((id) => chargedMoves.find((move) => move.id === id) ?? null)
    .filter((move): move is PvpMove => Boolean(move))
    .map((move) => (thirdBase && move.id === thirdBase.id ? scaleThirdAttack(thirdBase, side.megaLevel) : move));
  if (thirdBase && !charged.some((move) => move.id === thirdBase.id)) {
    charged.push(scaleThirdAttack(thirdBase, side.megaLevel));
  }
  const scale = levelScale(cpData, side.maxLevel);
  const build = findMaxLevelBuild(entry, side.atkIv, side.defIv, side.staIv, scale.levels, scale.byLevel, cap);
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
    shields: side.shieldMode === "custom" && shieldCustomActive ? side.shieldSlots.length : side.shields,
    timing: side.timing,
    applyChanceBuffs: side.applyChanceBuffs,
    chargedQueue: side.moveMode === "custom" ? side.moveSlots : null,
    timelinePlan: side.timelineMode === "custom" ? side.timelinePlan : null,
    shieldThrows: side.shieldMode === "custom" && shieldCustomActive ? side.shieldSlots : null,
    throwTweaks: side.throwTweaks,
    speciesId: entry.pokemon_id,
    form: entry.form,
  };
  if (entry.pokemon_id === 681 && entry.form === "Shield") {
    const blade = data.stats.find((row) => row.pokemon_id === 681 && row.form === "Blade");
    const cpm = scale.byLevel.get(build.level.toFixed(1));
    const bladeFast = bladeFastMove(data.bundle.moves, fast.id);
    if (blade && cpm != null && bladeFast) {
      const derived = computeDerivedStats(blade, side.atkIv, side.defIv, side.staIv, cpm);
      input.aegislash = { bladeAttack: derived.attack, bladeDefense: derived.defense, bladeFast };
    }
  }
  if (entry.pokemon_id === 774 && entry.form !== "Meteor") {
    const meteor = data.stats.find((row) => row.pokemon_id === 774 && row.form === "Meteor");
    if (meteor) {
      const near = statsUnderCap(
        meteor,
        side.atkIv,
        side.defIv,
        side.staIv,
        withBuddyLevels(cpData, true).byLevel,
        cap,
        55,
      );
      if (near) input.miniorMeteor = { attack: near.attack, defense: near.defense };
    }
  }
  if (side.initialOn) {
    const maxHp = build.stamina;
    const damage = Math.max(0, Math.min(maxHp, Math.floor(side.initialDamage)));
    input.startHp = maxHp - damage;
    input.startEnergy = Math.max(0, Math.min(100, Math.floor(side.initialEnergy)));
    input.startAttackStage = Math.max(-4, Math.min(4, Math.trunc(side.initialAttackStage)));
    input.startDefenseStage = Math.max(-4, Math.min(4, Math.trunc(side.initialDefenseStage)));
  }
  return { name: side.label || entry.pokemon_name, pvp, build, fasts, chargedMoves, thirdMove: thirdBase, input };
}

function fillSideFromGroup(
  group: SpeciesGroup,
  data: NonNullable<ReturnType<typeof useResearchData>["data"]>,
  levels: number[],
  byLevel: Map<string, number>,
  cap: number,
  current: SideState,
): SideState {
  const entry = group.entries[0];
  if (!entry) return current;
  const pvp = findPvpPokemon(data.bundle, entry.pokemon_id, entry.form);
  const nextFasts = pvp ? resolveMoves(data.bundle, pvp.fast) : [];
  const nextCharged = pvp ? resolveMoves(data.bundle, pvp.charged) : [];
  const types = pvp?.types ?? [];
  const rankedFast = bestMoves(nextFasts, types, "fast");
  const rankedCharged = bestMoves(nextCharged, types, "charged");
  const scale = levelScale({ levels, byLevel }, 51);
  const best = computeBestRankings(entry, scale.levels, scale.byLevel, cap, 51)[0];
  return {
    ...current,
    record: entry,
    label: speciesDisplayName(group),
    exactSprite: Boolean(group.exactSprite),
    spriteSuffix: group.spriteSuffix ?? null,
    fastId: rankedFast[0]?.id ?? "",
    chargedId: rankedCharged[0]?.id ?? "",
    chargedId2: rankedCharged[1]?.id ?? "",
    megaLevel: 1,
    maxLevel: 51,
    atkIv: best?.atkIv ?? current.atkIv,
    defIv: best?.defIv ?? current.defIv,
    staIv: best?.staIv ?? current.staIv,
  };
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
  const thirdMove = packed?.thirdMove ?? null;
  const stats = packed?.build;
  const types = packed?.pvp.types ?? [];
  const fastMove = fasts.find((move) => move.id === fastValue) ?? fasts[0] ?? null;
  const [initialOpen, setInitialOpen] = useState(false);
  const typeStyle: CSSProperties | undefined = types.length
    ? ({
        "--type-main": typePastel(types[0]),
        "--type-accent": typePastel(types[1] ?? types[0]),
      } as CSSProperties)
    : undefined;

  return (
    <section className={`sim-card is-${tone}${types.length ? " has-type" : ""}`} style={typeStyle}>
      <div className="sim-card-head">
        <p className="sim-role">{title}</p>
        {side.record ? (
          <button
            type="button"
            className="league-choice sim-shadow-toggle"
            aria-pressed={side.shadow}
            aria-label={side.shadow ? "シャドウを外す" : "シャドウにする"}
            onClick={() => onChange({ ...side, shadow: !side.shadow })}
          >
            <ShadowMark />
          </button>
        ) : null}
      </div>
      <button
        type="button"
        className="identity-pick"
        onClick={() => {
          openPokemonSearch((group: SpeciesGroup) => {
            onChange((current) => fillSideFromGroup(group, data, levels, byLevel, cap, current));
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
        {side.record ? (
          <PokemonLabelFit className="identity-pick-name" {...displayNameParts(side.record.pokemon_id, side.record.pokemon_name, side.label)} />
        ) : (
          <PokemonLabelFit className="identity-pick-name" name="検索" singleLine />
        )}
      </button>

      {!side.record ? null : stats ? null : side.record ? (
        <p className="note">このリーグのCP上限に入るレベルがありません。</p>
      ) : null}

      {side.record && !packed ? <p className="note">技データがありません。</p> : null}

      {side.record ? (
        <>
      <IvFields
        side={side}
        cap={cap}
        levels={levels}
        byLevel={byLevel}
        onChange={onChange}
      />

      <select
        className="input"
        aria-label="ノーマルアタック"
        value={fastValue}
        onChange={(event) => onChange({ ...side, fastId: event.target.value })}
      >
        {fasts.map((move) => (
          <option key={move.id} value={move.id}>
            {move.name}
          </option>
        ))}
      </select>
      <select
        className="input"
        aria-label="スペシャルアタック"
        value={chargedValue}
        onChange={(event) => onChange({ ...side, chargedId: event.target.value })}
      >
        {chargedMoves.map((move) => (
          <option key={move.id} value={move.id}>
            {move.name}
          </option>
        ))}
      </select>
      <select
        className="input"
        aria-label="スペシャルアタック2"
        value={charged2Value}
        onChange={(event) => onChange({ ...side, chargedId2: event.target.value })}
      >
        <option value="">なし</option>
        {chargedMoves.map((move) => (
          <option key={move.id} value={move.id}>
            {move.name}
          </option>
        ))}
      </select>
      {thirdMove ? (
        <div className="sim-third-row">
          <span className="input sim-third-name">{thirdMove.name}</span>
          <label className="field sim-mega-level">
            <select
              className="input"
              aria-label="メガレベル"
              value={side.megaLevel}
              onChange={(event) => onChange({ ...side, megaLevel: readMegaLevel(event.target.value) })}
            >
              {MEGA_LEVELS.map((level) => (
                <option key={level} value={level}>
                  {level}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : null}
      {stats ? (
        <button
          type="button"
          className={`timeline-custom-open sim-initial-open${side.initialOn ? " is-on" : ""}`}
          onClick={() => setInitialOpen(true)}
        >
          初期条件
        </button>
      ) : null}
      {initialOpen && side.record && stats ? (
        <InitialStatePopup
          record={side.record}
          exactSprite={side.exactSprite}
          spriteSuffix={side.spriteSuffix}
          label={side.label}
          maxHp={stats.stamina}
          fastName={fastMove?.name ?? "ノーマルアタック"}
          fastGain={fastMove?.energyGain ?? 0}
          state={initialStateOf(side)}
          onChange={(next: InitialState) => onChange({ ...side, ...next })}
          onClose={() => setInitialOpen(false)}
        />
      ) : null}
        </>
      ) : null}
    </section>
  );
}

function initialStateOf(side: SideState): InitialState {
  return {
    initialOn: side.initialOn,
    initialDamage: side.initialDamage,
    initialEnergy: side.initialEnergy,
    initialAttackStage: side.initialAttackStage,
    initialDefenseStage: side.initialDefenseStage,
  };
}

type SheetCell = {
  show: boolean;
  span: number;
  name: string;
  type: string;
  damage: number;
  shielded: boolean;
  endsCharge: boolean;
  cct: boolean;
  charged: boolean;
  throwIndex: number | null;
  spriteId?: number;
  spriteForm?: string;
};

type TurnRow = {
  key: string;
  turn: number;
  line: number;
  hpA: number;
  hpB: number;
  a: TimelineEvent | null;
  b: TimelineEvent | null;
};

function buildSheet(events: TimelineEvent[]) {
  const byTurn = new Map<number, TimelineEvent[]>();
  for (const event of events) {
    const list = byTurn.get(event.turn) ?? [];
    list.push(event);
    byTurn.set(event.turn, list);
  }

  const turns: TurnRow[] = [];
  for (const [turn, list] of byTurn) {
    const maxLine = Math.max(0, ...list.map((event) => event.line ?? 0));
    const end = list[list.length - 1];
    for (let line = 0; line <= maxLine; line += 1) {
      const row: TurnRow = {
        key: `${turn}-${line}`,
        turn,
        line,
        hpA: end?.hpA ?? 0,
        hpB: end?.hpB ?? 0,
        a: null,
        b: null,
      };
      for (const event of list) {
        if ((event.line ?? 0) !== line) continue;
        row[event.actor] = event;
      }
      if (line > 0) {
        for (const actor of ["a", "b"] as const) {
          if (row[actor]) continue;
          const carried = list.find((event) => event.actor === actor && (event.line ?? 0) === 0 && event.kind === "fast");
          if (carried) row[actor] = carried;
        }
      }
      turns.push(row);
    }
  }

  const chargeKeys = new Set(
    turns
      .filter((row) => row.a?.kind === "charged" || row.b?.kind === "charged" || row.a?.chargeLine || row.b?.chargeLine)
      .map((row) => row.key),
  );
  const cellsA = moveSegments(turns, "a", chargeKeys);
  const cellsB = moveSegments(turns, "b", chargeKeys);

  return turns.map((row) => ({
    key: row.key,
    turn: row.turn,
    line: row.line,
    hpA: row.hpA,
    hpB: row.hpB,
    charge: chargeKeys.has(row.key),
    guardA: receivedShield(row, "a"),
    guardB: receivedShield(row, "b"),
    a: cellsA.get(row.key) ?? null,
    b: cellsB.get(row.key) ?? null,
  }));
}

function receivedShield(row: TurnRow, actor: "a" | "b") {
  const other = actor === "a" ? row.b : row.a;
  return Boolean(other?.kind === "charged" && other.shielded);
}

function moveSegments(turns: TurnRow[], actor: "a" | "b", chargeKeys: Set<string>) {
  const cells = new Map<string, SheetCell | null>();
  let index = 0;
  while (index < turns.length) {
    const event = turns[index][actor];
    if (!event) {
      cells.set(turns[index].key, null);
      index += 1;
      continue;
    }

    const startedEarlier = index > 0 && turns[index - 1][actor]?.actionId === event.actionId;
    if (event.kind === "note" || (startedEarlier && receivedShield(turns[index], actor) && event.kind === "fast")) {
      cells.set(turns[index].key, {
        show: true,
        span: 1,
        name: event.kind === "note" ? event.moveName : "",
        type: event.moveType,
        damage: event.kind === "note" ? event.damage : 0,
        shielded: false,
        endsCharge: chargeKeys.has(turns[index].key),
        cct: false,
        charged: false,
        throwIndex: null,
        spriteId: event.spriteId,
        spriteForm: event.spriteForm,
      });
      index += 1;
      continue;
    }

    let end = index;
    while (end < turns.length && turns[end][actor]?.actionId === event.actionId && turns[end][actor]?.kind !== "note") {
      if (end > index && receivedShield(turns[end], actor)) break;
      const splitAfter = chargeKeys.has(turns[end].key);
      end += 1;
      if (splitAfter) break;
    }

    const slice = turns.slice(index, end);
    let landing = [...slice].reverse().find((row) => (row[actor]?.damage ?? 0) > 0)?.[actor];
    const following = turns[end]?.[actor];
    if (!landing && following?.actionId === event.actionId && (following.damage ?? 0) > 0) landing = following;
    const endsCharge = chargeKeys.has(turns[end - 1].key);
    cells.set(turns[index].key, {
      show: true,
      span: end - index,
      name: event.moveName,
      type: event.moveType,
      damage: landing?.damage ?? 0,
      shielded: landing?.shielded ?? false,
      endsCharge,
      cct: event.kind === "fast" && event.cct,
      charged: event.kind === "charged",
      throwIndex: event.throwIndex,
    });
    for (let cursor = index + 1; cursor < end; cursor += 1) {
      cells.set(turns[cursor].key, {
        show: false,
        span: 0,
        name: "",
        type: "",
        damage: 0,
        shielded: false,
        endsCharge: false,
        cct: false,
        charged: false,
        throwIndex: null,
      });
    }
    index = end;
  }
  return cells;
}

function BattleSheet({
  events,
  onCharged,
}: {
  events: TimelineEvent[];
  onCharged: (side: "a" | "b", index: number) => void;
}) {
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
        {rows.map((row, index) => {
          const prev = rows[index - 1];
          const sameTurn = prev?.turn === row.turn;
          return (
            <tr key={row.key} className={row.charge ? "has-charge" : undefined}>
              <td className="hp num">{!prev || prev.hpA !== row.hpA ? row.hpA : ""}</td>
              <MoveCell cell={row.a} guard={row.guardA} onCharged={(throwIndex) => onCharged("a", throwIndex)} />
              <td className="turn num">{sameTurn ? "" : row.turn}</td>
              <MoveCell cell={row.b} guard={row.guardB} onCharged={(throwIndex) => onCharged("b", throwIndex)} />
              <td className="hp num">{!prev || prev.hpB !== row.hpB ? row.hpB : ""}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function MoveCell({
  cell,
  guard,
  onCharged,
}: {
  cell: SheetCell | null;
  guard: boolean;
  onCharged: (index: number) => void;
}) {
  if (cell && !cell.show) return null;
  if (!cell?.name) {
    if (guard) {
      return (
        <td className={`move is-guard${cell?.endsCharge ? " ends-charge" : ""}`}>
          <span className="move-shield-wrap">
            <ShieldMark size={13} />
          </span>
        </td>
      );
    }
    return <td className="move is-empty" />;
  }
  const stacked = guard;
  const longCct = Boolean(cell.cct && !stacked && cell.span === 1 && cell.name.length >= 6);
  const moveMain = (
    <span className="move-line-main">
      {cell.charged && cell.throwIndex != null ? (
        <button
          type="button"
          className="move-charge-btn"
          style={{ background: typeChargeFill(cell.type) }}
          onClick={() => onCharged(cell.throwIndex ?? 0)}
        >
          {cell.name}
        </button>
      ) : cell.name ? (
        <span className="move-name">{cell.name}</span>
      ) : null}
      {cell.damage > 0 ? <span className="num move-dmg">{cell.damage}</span> : null}
      {cell.spriteId ? (
        <PokemonDotSprite pokemonId={cell.spriteId} form={cell.spriteForm} alt="" size={22} />
      ) : null}
    </span>
  );
  return (
    <td
      className={`move${cell.endsCharge ? " ends-charge" : ""}${stacked ? " is-stacked" : ""}${longCct ? " is-long-cct" : ""}${cell.charged ? " is-charged" : ""}`}
      rowSpan={cell.span}
      style={cell.name ? { background: typeWash(cell.type) } : undefined}
    >
      {stacked ? (
        <span className="move-label is-stacked">
          {moveMain}
          {cell.cct ? <span className="cct-mark">CCT</span> : null}
          <span className="move-shield-wrap">
            <ShieldMark size={13} />
          </span>
        </span>
      ) : (
        <span className={`move-label${cell.cct ? " has-cct" : ""}${longCct ? " is-long" : ""}`}>
          {moveMain}
          {cell.cct ? <span className="cct-mark">CCT</span> : null}
        </span>
      )}
    </td>
  );
}

type MatchupHitRow = {
  id: string;
  name: string;
  damage: number;
  percent: number;
  remainRatio: number;
  band: "low" | "mid" | "high";
  third: boolean;
};

function matchupMoveHits(attacker: FighterInput, defender: FighterInput, thirdId: string | null): MatchupHitRow[] {
  const moves = [attacker.fast, ...attacker.charged];
  const seen = new Set<string>();
  const rows: MatchupHitRow[] = [];
  for (const move of moves) {
    if (seen.has(move.id)) continue;
    seen.add(move.id);
    const damage = damageForMove(
      move,
      attacker.attack,
      defender.defense,
      attacker.types,
      defender.types,
      attacker.shadow,
      defender.shadow,
    );
    const maxHp = Math.max(1, defender.hp);
    const percent = (100 * damage) / maxHp;
    const remainRatio = Math.max(0, Math.min(1, (maxHp - damage) / maxHp));
    const band = remainRatio <= 0.2 ? "low" : remainRatio <= 0.5 ? "mid" : "high";
    rows.push({
      id: move.id,
      name: move.name,
      damage,
      percent,
      remainRatio,
      band,
      third: move.id === thirdId,
    });
  }
  return rows;
}

function MatchupSide({
  word,
  side,
  hp,
  max,
  cp,
  scp,
  attack,
  defense,
  stamina,
  energy,
  hits,
}: {
  word: "WIN" | "LOSE" | null;
  side: SideState;
  hp: number;
  max: number;
  cp: number;
  scp: number;
  attack: number;
  defense: number;
  stamina: number;
  energy: number;
  hits: MatchupHitRow[];
}) {
  const ratio = max > 0 ? hp / max : 0;
  const band = ratio <= 0.2 ? "low" : ratio <= 0.5 ? "mid" : "high";
  const regular = hits.filter((row) => !row.third);
  const third = hits.find((row) => row.third) ?? null;
  return (
    <div className="sim-matchup-side">
      <p className={word === "WIN" ? "sim-win" : word === "LOSE" ? "sim-lose" : "sim-draw"}>{word ?? "相打ち"}</p>
      <p className="sim-cp-line num">
        CP：{cp}　SCP：{scp}
      </p>
      <div className="sim-mon-block">
        {side.record ? (
          <PokemonDotSprite
            pokemonId={side.record.pokemon_id}
            form={side.exactSprite ? undefined : side.record.form}
            exact={side.exactSprite}
            spriteSuffix={side.spriteSuffix}
            alt=""
            size={68}
          />
        ) : null}
        <dl className="sim-real-stats">
          <div>
            <dt>攻撃：</dt>
            <dd className="num">{formatBattleStat(attack, 2)}</dd>
          </div>
          <div>
            <dt>防御：</dt>
            <dd className="num">{formatBattleStat(defense, 2)}</dd>
          </div>
          <div>
            <dt>HP：</dt>
            <dd className="num">{stamina}</dd>
          </div>
        </dl>
      </div>
      <div className={`hp-track is-${band}`}>
        <i style={{ width: `${Math.max(0, Math.min(100, ratio * 100))}%` }} />
        <span className="sim-hp-inbar num">
          {hp} / {max}
        </span>
      </div>
      <p className="sim-gauge">ゲージ：{energy}</p>
      <ul className={`sim-hit-list${regular.length ? "" : " is-empty"}`} aria-label={regular.length ? "技ダメージ" : undefined}>
        {regular.map((row) => (
          <li key={row.id}>
            <HitMeter row={row} />
          </li>
        ))}
      </ul>
      {third ? (
        <div className="sim-hit-third">
          <HitMeter row={third} />
        </div>
      ) : null}
    </div>
  );
}

function HitMeter({ row }: { row: MatchupHitRow }) {
  const lossRatio = Math.max(0, Math.min(1, 1 - row.remainRatio));
  const remainPct = row.remainRatio * 100;
  const lossPct = lossRatio * 100;
  const onlyRemain = lossPct <= 0;
  const onlyLoss = remainPct <= 0;
  return (
    <div className="sim-hit-row">
      <div className="sim-hit-meta">
        <span className="sim-hit-name">{row.name}</span>
        <span className="sim-hit-val num">
          {row.damage}({row.percent.toFixed(1)}%)
        </span>
      </div>
      <div className="hp-track hp-track-hit" aria-hidden="true">
        {onlyLoss ? (
          <i className="hp-hit-lost is-full" style={{ width: "100%" }} />
        ) : (
          <>
            <i className={`hp-hit-remain is-${row.band}${onlyRemain ? " is-full" : ""}`} style={{ width: `${remainPct}%` }} />
            {lossPct > 0 ? <i className="hp-hit-lost" style={{ width: `${lossPct}%` }} /> : null}
          </>
        )}
      </div>
    </div>
  );
}

function shieldFill(rating: number) {
  if (rating === 100) return "linear-gradient(180deg, #f7f8fa 0%, #e6ebf0 100%)";
  if (rating > 100) {
    const t = Math.min(1, (rating - 100) / 50);
    return `linear-gradient(180deg, ${mixRgb([255, 232, 232], [248, 168, 168], t)} 0%, ${mixRgb([246, 208, 208], [228, 112, 112], t)} 100%)`;
  }
  const t = Math.min(1, (100 - rating) / 50);
  return `linear-gradient(180deg, ${mixRgb([242, 245, 255], [206, 210, 244], t)} 0%, ${mixRgb([224, 228, 246], [148, 156, 224], t)} 100%)`;
}

function mixRgb(from: [number, number, number], to: [number, number, number], t: number) {
  const channel = (start: number, end: number) => Math.round(start + (end - start) * t);
  return `rgb(${channel(from[0], to[0])}, ${channel(from[1], to[1])}, ${channel(from[2], to[2])})`;
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
  return `color-mix(in srgb, ${typePastel(type)} 51%, white)`;
}

function hexRgb(hex: string): [number, number, number] {
  const value = hex.replace("#", "");
  return [Number.parseInt(value.slice(0, 2), 16), Number.parseInt(value.slice(2, 4), 16), Number.parseInt(value.slice(4, 6), 16)];
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const light = (max + min) / 2;
  if (max === min) return [0, 0, light];
  const delta = max - min;
  const sat = light > 0.5 ? delta / (2 - max - min) : delta / (max + min);
  const hueBase =
    max === rn ? (gn - bn) / delta + (gn < bn ? 6 : 0) : max === gn ? (bn - rn) / delta + 2 : (rn - gn) / delta + 4;
  return [hueBase / 6, sat, light];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) {
    const gray = Math.round(l * 255);
    return [gray, gray, gray];
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const from = (offset: number) => {
    let t = h + offset;
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [from(1 / 3), from(0), from(-1 / 3)].map((value) => Math.round(value * 255)) as [number, number, number];
}

/** セルの薄い色より彩度を上げ、対面表のボタンに近い上下グラデーション。黒文字が残る明るさ。 */
function typeChargeFill(type: string) {
  const [hue, sat] = rgbToHsl(...hexRgb(typePastel(type)));
  const vivid = sat < 0.08 ? 0.16 : Math.min(0.64, Math.max(0.46, sat * 1.85));
  const top = hslToRgb(hue, vivid * 0.62, 0.88);
  const bottom = hslToRgb(hue, vivid, 0.7);
  return `linear-gradient(180deg, rgb(${top.join(",")}) 0%, rgb(${bottom.join(",")}) 100%)`;
}

function IvFields({
  side,
  cap,
  levels,
  byLevel,
  onChange,
}: {
  side: SideState;
  cap: number;
  levels: number[];
  byLevel: Map<string, number>;
  onChange: (next: SideState | ((current: SideState) => SideState)) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="sim-ivs">
        {(
          [
            ["攻撃", side.atkIv],
            ["防御", side.defIv],
            ["HP", side.staIv],
          ] as const
        ).map(([label, value]) => (
          <div key={label} className="field">
            <span className="field-label">{label}</span>
            <button type="button" className="input iv-open num" onClick={() => setOpen(true)}>
              {value}
            </button>
          </div>
        ))}
      </div>
      {open && side.record
        ? createPortal(
            <IvPopup
              side={side}
              cap={cap}
              levels={levels}
              byLevel={byLevel}
              onClose={() => setOpen(false)}
              onApply={(next) => {
                onChange({ ...side, ...next });
                setOpen(false);
              }}
            />,
            document.body,
          )
        : null}
    </>
  );
}

function IvPopup({
  side,
  cap,
  levels,
  byLevel,
  onClose,
  onApply,
}: {
  side: SideState;
  cap: number;
  levels: number[];
  byLevel: Map<string, number>;
  onClose: () => void;
  onApply: (next: { atkIv: number; defIv: number; staIv: number; maxLevel: 50 | 51 }) => void;
}) {
  const [draftLevel, setDraftLevel] = useState<50 | 51>(side.maxLevel);
  const [draft, setDraft] = useState({ atk: side.atkIv, def: side.defIv, sta: side.staIv });
  const presets = useMemo(() => {
    if (!side.record) return null;
    const scale = levelScale({ levels, byLevel }, draftLevel);
    const rows = computeBestRankings(side.record, scale.levels, scale.byLevel, cap, draftLevel);
    if (!rows.length) return null;
    return {
      scp: rows[0],
      attack: pickStatMax(rows, "attack"),
      defense: pickStatMax(rows, "defense"),
      hp: pickStatMax(rows, "stamina"),
    };
  }, [byLevel, cap, draftLevel, levels, side.record]);
  const snapshot = useMemo(() => {
    if (!side.record) return null;
    const scale = levelScale({ levels, byLevel }, draftLevel);
    return findMaxLevelBuild(side.record, draft.atk, draft.def, draft.sta, scale.levels, scale.byLevel, cap);
  }, [byLevel, cap, draft.atk, draft.def, draft.sta, draftLevel, levels, side.record]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const applyPreset = (row: RankingRow | null) => {
    if (!row) return;
    onApply({ atkIv: row.atkIv, defIv: row.defIv, staIv: row.staIv, maxLevel: draftLevel });
  };

  return (
    <div className="search-overlay is-centered" role="dialog" aria-modal="true" aria-label="個体値">
      <button type="button" className="search-overlay-backdrop" aria-label="閉じる" onClick={onClose} />
      <div className="search-overlay-panel sim-iv-panel">
        <div className="sim-iv-top">
          {side.record ? (
            <PokemonDotSprite
              pokemonId={side.record.pokemon_id}
              form={side.exactSprite ? undefined : side.record.form}
              exact={side.exactSprite}
              spriteSuffix={side.spriteSuffix}
              alt=""
              size={56}
            />
          ) : null}
          {snapshot ? (
            <div className="sim-iv-snapshot">
              <div className="sim-iv-power">
                <p>
                  <span>CP</span>
                  <strong className="num">{snapshot.cp}</strong>
                </p>
                <p>
                  <span>SCP</span>
                  <strong className="num">{formatScp(snapshot.statProduct)}</strong>
                </p>
              </div>
              <dl className="sim-iv-live-stats">
                <div>
                  <dt>攻撃</dt>
                  <dd className="num">{formatBattleStat(snapshot.attack, 2)}</dd>
                </div>
                <div>
                  <dt>防御</dt>
                  <dd className="num">{formatBattleStat(snapshot.defense, 2)}</dd>
                </div>
                <div>
                  <dt>HP</dt>
                  <dd className="num">{snapshot.stamina}</dd>
                </div>
              </dl>
            </div>
          ) : (
            <p className="note sim-iv-snapshot-empty">この上限では入りません</p>
          )}
          <div className="sim-iv-levels" role="group" aria-label="レベル上限">
            {([50, 51] as const).map((level) => (
              <button
                key={level}
                type="button"
                className="league-choice sim-iv-level"
                aria-pressed={draftLevel === level}
                onClick={() => setDraftLevel(level)}
              >
                Lv{level}
              </button>
            ))}
          </div>
        </div>
        <div className="sim-iv-body">
          <div className="sim-iv-presets">
            <button type="button" className="sim-iv-preset" disabled={!presets?.scp} onClick={() => applyPreset(presets?.scp ?? null)}>
              SCP1位
            </button>
            <button type="button" className="sim-iv-preset" disabled={!presets?.attack} onClick={() => applyPreset(presets?.attack ?? null)}>
              2桁A最大
            </button>
            <button type="button" className="sim-iv-preset" disabled={!presets?.defense} onClick={() => applyPreset(presets?.defense ?? null)}>
              2桁B最大
            </button>
            <button type="button" className="sim-iv-preset" disabled={!presets?.hp} onClick={() => applyPreset(presets?.hp ?? null)}>
              2桁H最大
            </button>
          </div>
          <IvBars
            atk={draft.atk}
            def={draft.def}
            sta={draft.sta}
            buddy={draftLevel === 51}
            showBuddy={false}
            onBuddy={() => undefined}
            onChange={setDraft}
          />
        </div>
        <div className="sim-iv-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            閉じる
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => onApply({ atkIv: draft.atk, defIv: draft.def, staIv: draft.sta, maxLevel: draftLevel })}
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
