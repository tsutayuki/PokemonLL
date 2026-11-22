import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft } from "lucide-react";
import { LeagueIconButton } from "../../components/LeagueIconButton";
import { PokemonDotSprite } from "../../components/PokemonDotSprite";
import { StackedMon } from "../../components/StackedMon";
import { PokemonLabelFit } from "../../components/PokemonLabelFit";
import { bladeFastMove, isAuraWheel, statsUnderCap } from "../../lib/pogo/battleTraits";
import type { MegaEntry } from "../../lib/pogo/evolutionLine";
import { cachedBestRankings, fastBreakMark, type FastBreakMark } from "../../lib/pogo/fastBreak";
import { damageForMove, type PvpMove } from "../../lib/pogo/combat";
import { MEGA_LEVELS, readMegaLevel, scaleThirdAttack, type MegaLevel } from "../../lib/pogo/megaLevel";
import { bestMoves } from "../../lib/pogo/moveScore";
import { recordPokemonPick, setActivePickLeague } from "../../lib/pogo/pokemonPicks";
import { findPvpPokemon, resolveMoves } from "../../lib/pogo/pvpBundle";
import {
  computeBestRankings,
  computeDerivedStats,
  findMaxLevelBuild,
  formatBattleStat,
  formatPlace,
  formatScp,
  placeTone,
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
  shieldsSpent,
  simulateBattle,
  simulateShieldGrid,
  type ChargeTiming,
  type FighterInput,
  type FollowPokemon,
  type SimResult,
  type TimelineEvent,
} from "../../lib/pogo/simulate";
import { buildLeadScript, countsFromLead, fastCountMax, reconcileOrder, splitSwitchPlan } from "../../lib/pogo/followPlan";
import { moveBonusEffectLines } from "../../lib/pogo/moveBonusEffect";
import { TimelineOps, PlanPopup, ThrowPopup, chargedNameAt } from "./TimelineOps";
import { InitialStatePopup, type InitialState } from "./InitialStatePopup";
import { TimelineCustom } from "./TimelineCustom";
import { extendPlanFromTimeline, fillLaggingSide, planTurns, stampSegmentFastTurns, type TimelineStep } from "../../lib/pogo/timelinePlan";
import { IvBars } from "../shared/IvBars";
import { useResearchData } from "../shared/useResearchData";
import { openPokemonSearch } from "../shared/pokemonSearchApi";
import { FrequentPokemon, type FrequentPreset } from "./FrequentPokemon";
import { ChaseFoeSwitch, ChasePanel } from "./ChasePanel";
import { requestBreakStudy } from "../break-research/breakJump";

/** タイムライン左右の残ゲージ列。false にすると、ゲージを足す前の5列に戻る。 */
const TIMELINE_ENERGY = true;

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
  megaLevel: 4,
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

function isSimulatorRoute() {
  const path = window.location.hash.replace(/^#/, "").split("?")[0].replace(/\/+$/, "") || "/sim";
  return path === "/sim" || path === "/research/sim";
}

type ChaseTimelineMemory = {
  live: boolean;
  lead: TimelineStep[] | null;
  back: TimelineStep[] | null;
  foe: TimelineStep[] | null;
};

const emptyChaseTimeline: ChaseTimelineMemory = { live: false, lead: null, back: null, foe: null };

function cloneSteps(steps: TimelineStep[] | null) {
  return steps?.map((step) => ({ ...step })) ?? null;
}

function syncChaseCounts(lead: TimelineStep[]) {
  const counts = countsFromLead(lead);
  const nextCounts: Record<string, number> = {};
  for (const id of counts.charged) nextCounts[id] = (nextCounts[id] ?? 0) + 1;
  return { fast: counts.fast, order: counts.charged, counts: nextCounts };
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
function breakInputKey(
  cap: number,
  sideA: SideState,
  sideB: SideState,
  fighterA: ReturnType<typeof packFighter>,
  fighterB: ReturnType<typeof packFighter>,
) {
  if (!fighterA || !fighterB || !sideA.record || !sideB.record) return "";
  return [
    cap,
    sideA.record.pokemon_id,
    sideA.record.form,
    sideA.record.base_attack,
    sideA.record.base_defense,
    sideA.record.base_stamina,
    sideA.maxLevel,
    fighterA.input.fast.id,
    fighterA.input.attack,
    fighterA.input.defense,
    fighterA.input.shadow,
    sideB.record.pokemon_id,
    sideB.record.form,
    sideB.record.base_attack,
    sideB.record.base_defense,
    sideB.record.base_stamina,
    sideB.maxLevel,
    fighterB.input.fast.id,
    fighterB.input.attack,
    fighterB.input.defense,
    fighterB.input.shadow,
  ].join("|");
}

function pickStatMax(rows: RankingRow[], key: "attack" | "defense" | "stamina") {
  const eligible = rows.filter((row) => row.rank <= 99);
  return eligible.reduce<RankingRow | null>((best, row) => {
    if (!best || row[key] > best[key] + 1e-6) return row;
    if (Math.abs(row[key] - best[key]) <= 1e-6 && row.rank < best.rank) return row;
    return best;
  }, null);
}

/** 後追いで相手の1ターン目を交代（内部は待機）にする。手順があるときはその前に足す。 */
function opponentInput(
  base: FighterInput,
  follow: boolean,
  script: TimelineStep[] | null,
  live: boolean,
  leadSwitch: boolean,
): FighterInput {
  const planned = follow && live ? script : null;
  if (!(follow && leadSwitch)) return planned ? { ...base, timelinePlan: planned } : base;
  return { ...base, timelinePlan: [{ kind: "wait", show: "交代" }, ...(planned ?? [])] };
}

export function SimResearchPage() {
  const { data, error, cpData, reload } = useResearchData();
  const [leagueId, setLeagueId] = useState<LeagueId>("great");

  useEffect(() => {
    setActivePickLeague(leagueId);
    return () => setActivePickLeague(null);
  }, [leagueId]);
  const [sideA, setSideA] = useState<SideState>(emptySide);
  const [sideBack, setSideBack] = useState<SideState>(emptySide);
  const [sideB, setSideB] = useState<SideState>(emptySide);
  const [chaseOn, setChaseOn] = useState(false);
  const [foeLeadSwitch, setFoeLeadSwitch] = useState(false);
  const [viewSlot, setViewSlot] = useState<"lead" | "back">("back");
  const [chaseFast, setChaseFast] = useState(0);
  const [chaseCounts, setChaseCounts] = useState<Record<string, number>>({});
  const [chaseOrder, setChaseOrder] = useState<string[]>([]);
  const [shieldCustomActive, setShieldCustomActive] = useState(false);
  const [planEditor, setPlanEditor] = useState<null | { kind: "move" | "shield"; side: "a" | "b" }>(null);
  const [throwEditor, setThrowEditor] = useState<null | { side: "a" | "b"; index: number }>(null);
  const [timelineOpen, setTimelineOpen] = useState(false);
  const timelineBefore = useRef<{
    live: boolean;
    aMode: SideState["timelineMode"];
    aPlan: TimelineStep[] | null;
    bMode: SideState["timelineMode"];
    bPlan: TimelineStep[] | null;
  } | null>(null);
  /** 保存したタイムライン手順を、今の計算に使うか。手順自体は消さない。 */
  const [timelineLive, setTimelineLive] = useState(false);
  const [chaseTimeline, setChaseTimeline] = useState<ChaseTimelineMemory>(emptyChaseTimeline);
  const chaseTimelineBefore = useRef<ChaseTimelineMemory | null>(null);
  const chaseCountsBefore = useRef<{ fast: number; order: string[]; counts: Record<string, number> } | null>(null);
  const [onSim, setOnSim] = useState(() => isSimulatorRoute());

  const cap = leagueCap(leagueId);
  const chasing = chaseOn && Boolean(sideA.record && sideBack.record);
  const fighterA = packFighter(sideA, data, cpData, cap, shieldCustomActive, timelineLive && !chasing);
  const fighterBack = packFighter(sideBack, data, cpData, cap, shieldCustomActive, false);
  const fighterB = packFighter(sideB, data, cpData, cap, shieldCustomActive, timelineLive && !chasing);
  const timelineCustomOn = chasing && fighterBack ? chaseTimeline.live : timelineLive && sideA.timelineMode === "custom";
  const battleA = fighterA
    ? chaseBattleInput(fighterA, chasing ? fighterBack : null, chaseTimeline.live, chaseTimeline.lead, chaseTimeline.back, chaseFast, chaseOrder)
    : null;

  useEffect(() => {
    const sync = () => setOnSim(isSimulatorRoute());
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  useEffect(() => {
    document.body.classList.toggle("is-chase", chaseOn && onSim);
    return () => document.body.classList.remove("is-chase");
  }, [chaseOn, onSim]);

  useEffect(() => {
    if (chaseOn) return;
    setSideA((current) => {
      if (!current.timelinePlan?.some((step) => step.kind === "switch")) return current;
      return { ...current, timelineMode: "optimal", timelinePlan: null };
    });
  }, [chaseOn]);

  const result = useMemo(() => {
    if (!battleA || !fighterB) return null;
    const foe = opponentInput(fighterB.input, Boolean(battleA.input.follow), chaseTimeline.foe, chaseTimeline.live, foeLeadSwitch);
    return simulateBattle(battleA.input, foe);
  }, [battleA, fighterB, chaseTimeline.live, chaseTimeline.foe, foeLeadSwitch]);

  const grid = useMemo(() => {
    if (!battleA || !fighterB) return null;
    const foe = opponentInput(fighterB.input, Boolean(battleA.input.follow), chaseTimeline.foe, chaseTimeline.live, foeLeadSwitch);
    return simulateShieldGrid(battleA.input, foe);
  }, [battleA, fighterB, chaseTimeline.live, chaseTimeline.foe, foeLeadSwitch]);

  useEffect(() => {
    if (!result?.follow) return;
    if (result.follow.earlyWin) {
      setViewSlot("lead");
      return;
    }
    if (result.follow.active === "back") setViewSlot("back");
  }, [result]);

  const showBack = chasing && viewSlot === "back" && Boolean(fighterBack);
  const viewedSide = showBack ? sideBack : sideA;
  const viewedFighter = showBack && fighterBack ? fighterBack : fighterA;
  const selfHp = result?.follow ? (showBack ? result.follow.backHp : result.follow.leadHp) : (result?.hpA ?? 0);
  const selfMax = result?.follow ? (showBack ? result.follow.backMaxHp : result.follow.leadMaxHp) : (result?.maxHpA ?? 0);
  const selfEnergy = result?.follow ? (showBack ? result.follow.backEnergy : result.follow.leadEnergy) : (result?.energyA ?? 0);

  const breakKey = breakInputKey(cap, viewedSide, sideB, viewedFighter, fighterB);
  const breakMarks = useMemo(() => {
    if (!cpData || !viewedFighter || !fighterB || !viewedSide.record || !sideB.record) return null;
    const scaleFor = (maxLevel: 50 | 51) => levelScale(cpData, maxLevel);
    const rowsFor = (record: PogoStatRecord, maxLevel: 50 | 51) => {
      const scale = scaleFor(maxLevel);
      return cachedBestRankings(record, scale.levels, scale.byLevel, cap, maxLevel);
    };
    const rowsA = rowsFor(viewedSide.record, viewedSide.maxLevel);
    const rowsB = rowsFor(sideB.record, sideB.maxLevel);
    return {
      a: {
        attack: fastBreakMark(
          rowsA,
          viewedFighter.input.fast,
          viewedFighter.input.attack,
          fighterB.input.defense,
          viewedFighter.input.types,
          fighterB.input.types,
          viewedFighter.input.shadow,
          fighterB.input.shadow,
          "attack",
        ),
        defense: fastBreakMark(
          rowsA,
          fighterB.input.fast,
          fighterB.input.attack,
          viewedFighter.input.defense,
          fighterB.input.types,
          viewedFighter.input.types,
          fighterB.input.shadow,
          viewedFighter.input.shadow,
          "defense",
        ),
      },
      b: {
        attack: fastBreakMark(
          rowsB,
          fighterB.input.fast,
          fighterB.input.attack,
          viewedFighter.input.defense,
          fighterB.input.types,
          viewedFighter.input.types,
          fighterB.input.shadow,
          viewedFighter.input.shadow,
          "attack",
        ),
        defense: fastBreakMark(
          rowsB,
          viewedFighter.input.fast,
          viewedFighter.input.attack,
          fighterB.input.defense,
          viewedFighter.input.types,
          fighterB.input.types,
          viewedFighter.input.shadow,
          fighterB.input.shadow,
          "defense",
        ),
      },
    };
  }, [breakKey, cap, cpData]);

  /** 通常も後追いも、今の計算への適用だけ外す。保存した手順は残す。 */
  const releaseCustomTimeline = () => {
    setTimelineLive(false);
    setChaseTimeline((current) => (current.live ? { ...current, live: false } : current));
  };

  const selectShields = (shieldsA: number, shieldsB: number) => {
    releaseCustomTimeline();
    setShieldCustomActive(false);
    setSideA((current) => ({ ...current, shields: shieldsA, shieldMode: "optimal" }));
    setSideB((current) => ({ ...current, shields: shieldsB, shieldMode: "optimal" }));
  };

  const selectShieldCustom = () => {
    setTimelineLive(true);
    setShieldCustomActive(true);
    setSideA((current) => ({ ...current, shieldMode: "custom", shields: current.shieldSlots.length }));
    setSideB((current) => ({ ...current, shieldMode: "custom", shields: current.shieldSlots.length }));
  };

  const writeLeadPlan = (fastCount: number, order: string[]) => {
    if (!chaseTimeline.live || !fighterA) return;
    const specials = order.flatMap((id) => {
      const move = fighterA.input.charged.find((item) => item.id === id);
      return move ? [{ id: move.id, energy: move.energy }] : [];
    });
    const built = buildLeadScript({
      fastId: fighterA.input.fast.id,
      fastTurns: fighterA.input.fast.turns,
      fastGain: fighterA.input.fast.energyGain,
      fastCount,
      startEnergy: fighterA.input.startEnergy ?? 0,
      specials,
    });
    const followTurns = Math.max(1, fighterBack?.input.fast.turns ?? fighterA.input.fast.turns);
    setChaseTimeline((current) => {
      const stamped = stampSegmentFastTurns([...built.steps, { kind: "switch" }, ...(current.back ?? [])], fighterA.input.fast.turns, followTurns);
      const split = splitSwitchPlan(stamped);
      return { ...current, lead: split.lead, back: split.back };
    });
  };

  const applyChaseCount = (id: string, count: number) => {
    if (!fighterA) return;
    const counts = fighterA.input.charged.map((move) => ({
      id: move.id,
      count: move.id === id ? count : (chaseCounts[move.id] ?? 0),
    }));
    const order = reconcileOrder(chaseOrder, counts);
    setChaseCounts((current) => ({ ...current, [id]: count }));
    setChaseOrder(order);
    writeLeadPlan(chaseFast, order);
  };

  const changeBack = (next: SideState | ((current: SideState) => SideState)) => {
    setSideBack((current) => {
      const resolved = typeof next === "function" ? next(current) : next;
      if (samePokemon(current.record, resolved.record)) return resolved;
      setShieldCustomActive(false);
      setTimelineLive(false);
      // 初手と相手はそのままなので、交代タイミングの回数は残す。引き先の手順だけ外す。
      setChaseTimeline((timeline) => ({ ...timeline, back: null }));
      setViewSlot("back");
      return { ...clearPlans(resolved), shadow: false };
    });
  };

  const swapLeads = () => {
    if (!sideA.record || !sideBack.record) return;
    const nextLead = fighterBack;
    if (chaseTimeline.live && chaseTimeline.back) {
      const synced = syncChaseCounts(chaseTimeline.back);
      setChaseFast(synced.fast);
      setChaseOrder(synced.order);
      setChaseCounts(synced.counts);
    } else if (nextLead) {
      const allowed = new Set(nextLead.input.charged.map((move) => move.id));
      setChaseFast((count) => Math.min(count, fastCountMax(nextLead.input.fast.turns)));
      setChaseOrder((order) => order.filter((id) => allowed.has(id)));
      setChaseCounts((counts) => {
        const next: Record<string, number> = {};
        for (const [id, count] of Object.entries(counts)) if (allowed.has(id)) next[id] = count;
        return next;
      });
    }
    setChaseTimeline((current) => ({ ...current, lead: current.back, back: current.lead }));
    setSideA(sideBack);
    setSideBack(sideA);
  };

  const changeSide = (which: "a" | "b", next: SideState | ((current: SideState) => SideState)) => {
    const apply = (current: SideState) => (typeof next === "function" ? next(current) : next);
    const setThis = which === "a" ? setSideA : setSideB;
    setThis((current) => {
      const resolved = apply(current);
      if (samePokemon(current.record, resolved.record)) return resolved;
      setShieldCustomActive(false);
      setTimelineLive(false);
      if (which === "a") {
        setChaseTimeline(emptyChaseTimeline);
        setViewSlot("back");
        setChaseFast(0);
        setChaseCounts({});
        setChaseOrder([]);
      } else {
        setChaseTimeline((timeline) => ({ ...timeline, foe: null }));
      }
      return { ...clearPlans(resolved), shadow: false };
    });
  };

  return (
    <div className="page-iv sim-page">
      <div className="page-heading sim-heading">
        <a className="btn btn-secondary btn-back" href="#/">
          <ArrowLeft size={16} />
          ホーム
        </a>
        <button
          type="button"
          className={`chase-mode-btn${chaseOn ? " is-on" : ""}`}
          aria-pressed={chaseOn}
          onClick={() => {
            setTimelineOpen(false);
            setChaseOn((on) => !on);
          }}
        >
          後追いモード
        </button>
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
            megas={data.megas}
            league={leagueId}
            levels={cpData.levels}
            byLevel={cpData.byLevel}
            chase={chaseOn}
            onPick={(record, label, which, sprite, preset) => {
              const group: SpeciesGroup = {
                name: `${record.pokemon_id}:${record.form}`,
                pokemonId: record.pokemon_id,
                entries: [record],
                label,
                exactSprite: sprite?.exactSprite,
                spriteSuffix: sprite?.spriteSuffix,
              };
              recordPokemonPick(record.pokemon_id, `${record.pokemon_id}:${record.form}`, leagueId);
              const filled = (current: SideState) =>
                applyPreset(fillSideFromGroup(group, data, cpData.levels, cpData.byLevel, cap, current), preset);
              if (which === "back") changeBack(filled);
              else changeSide(which, filled);
            }}
          />

          <div className={`duel-grid${chaseOn ? " is-chase" : ""}`}>
            <FighterCard
              title={chaseOn ? "初手" : "自分"}
              tone="self"
              side={sideA}
              data={data}
              cap={cap}
              levels={cpData.levels}
              byLevel={cpData.byLevel}
              initialHint={!chaseOn}
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
              initialHint={!chaseOn}
              onChange={(next) => changeSide("b", next)}
            />
            {chaseOn ? (
              <button type="button" className="chase-swap" disabled={!sideA.record || !sideBack.record} onClick={swapLeads}>
                初手・裏 入れ替え
              </button>
            ) : null}
            {chaseOn ? <div className="chase-grid-bridge" aria-hidden="true" /> : null}
            {chaseOn ? (
              <FighterCard
                title="引き先"
                tone="self"
                side={sideBack}
                data={data}
                cap={cap}
                levels={cpData.levels}
                byLevel={cpData.byLevel}
                initialHint={!chaseOn}
                onChange={changeBack}
              />
            ) : null}
            {chaseOn && fighterA ? (
              <div className="chase-side">
                <ChasePanel
                  fastName={fighterA.input.fast.name}
                  fastCount={Math.min(chaseFast, fastCountMax(fighterA.input.fast.turns))}
                  fastMax={fastCountMax(fighterA.input.fast.turns)}
                  charges={fighterA.input.charged.map((move) => ({
                    id: move.id,
                    name: move.name,
                    count: Math.min(3, chaseCounts[move.id] ?? 0),
                  }))}
                  order={chaseOrder}
                  short={battleA?.short ?? false}
                  onFast={(count) => {
                    setChaseFast(count);
                    writeLeadPlan(count, chaseOrder);
                  }}
                  onCharge={applyChaseCount}
                  onOrder={(order) => {
                    setChaseOrder(order);
                    writeLeadPlan(chaseFast, order);
                  }}
                />
                <ChaseFoeSwitch on={foeLeadSwitch} onChange={setFoeLeadSwitch} />
              </div>
            ) : null}
          </div>

          {result && fighterA && fighterB ? (
            <>
              <section className="panel result-panel sim-result" aria-label="この対面">
                <div className="sim-result-shadows">
                  {viewedSide.record ? (
                    <button
                      type="button"
                      className="league-choice sim-shadow-toggle"
                      aria-pressed={viewedSide.shadow}
                      aria-label={viewedSide.shadow ? "自分のシャドウを外す" : "自分をシャドウにする"}
                      onClick={() => (showBack ? setSideBack : setSideA)((current) => ({ ...current, shadow: !current.shadow }))}
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
                    onApplyIv={(ivs) => (showBack ? setSideBack : setSideA)((current) => ({ ...current, ...ivs }))}
                    side={viewedSide}
                    rear={chasing && sideA.record && sideBack.record ? (showBack ? sideA : sideBack) : null}
                    view={chasing ? viewSlot : null}
                    onView={chasing ? setViewSlot : undefined}
                    hp={selfHp}
                    max={selfMax}
                    cp={(viewedFighter ?? fighterA).build.cp}
                    scp={formatScp((viewedFighter ?? fighterA).build.statProduct)}
                    attack={(viewedFighter ?? fighterA).build.attack}
                    defense={(viewedFighter ?? fighterA).build.defense}
                    stamina={(viewedFighter ?? fighterA).build.stamina}
                    energy={selfEnergy}
                    shields={shieldsSpent(result.timeline, "a")}
                    hits={matchupMoveHits((viewedFighter ?? fighterA).input, fighterB.input, (viewedFighter ?? fighterA).thirdMove?.id ?? null)}
                    attackBreak={breakMarks?.a.attack ?? null}
                    defenseBreak={breakMarks?.a.defense ?? null}
                    leagueId={leagueId}
                    megas={data?.megas ?? []}
                    foe={sideB}
                  />
                  <MatchupSide
                    word={result.winner === "draw" ? null : result.winner === "b" ? "WIN" : "LOSE"}
                    onApplyIv={(ivs) => setSideB((current) => ({ ...current, ...ivs }))}
                    side={sideB}
                    hp={result.hpB}
                    max={result.maxHpB}
                    cp={fighterB.build.cp}
                    scp={formatScp(fighterB.build.statProduct)}
                    attack={fighterB.build.attack}
                    defense={fighterB.build.defense}
                    stamina={fighterB.build.stamina}
                    energy={result.energyB}
                    shields={shieldsSpent(result.timeline, "b")}
                    hits={matchupMoveHits(fighterB.input, (viewedFighter ?? fighterA).input, fighterB.thirdMove?.id ?? null)}
                    attackBreak={breakMarks?.b.attack ?? null}
                    defenseBreak={breakMarks?.b.defense ?? null}
                    leagueId={leagueId}
                    megas={data?.megas ?? []}
                    foe={viewedSide}
                  />
                </div>
              </section>

              {grid && sideA.record && sideB.record ? (
                <div className="shield-block">
                  <ShieldGridView
                    sideA={sideA}
                    rear={chasing ? sideBack : null}
                    sideB={sideB}
                    grid={grid}
                    onSelect={selectShields}
                    customActive={shieldCustomActive}
                    onCustom={selectShieldCustom}
                  />
                  <p className="note">マスを押すと、その枚数の結果に切り替わります。自分の枚数が縦、相手が横です。</p>
                </div>
              ) : null}

              <div className="timeline-stack">
              <p className="sim-section-label">タイムライン</p>
              <TimelineOps
                sideA={sideA}
                sideB={sideB}
                movesA={chasing && fighterBack ? fighterBack.input.charged : fighterA.input.charged}
                movesB={fighterB.input.charged}
                timeline={result.timeline}
                moveA={chasing ? sideBack : undefined}
                onChangeMoveA={
                  chasing
                    ? (next) => {
                        if (next.timing !== sideBack.timing || next.moveMode !== sideBack.moveMode) releaseCustomTimeline();
                        changeBack(next);
                      }
                    : undefined
                }
                onChangeA={(next) => {
                  if (next.timing !== sideA.timing || next.moveMode !== sideA.moveMode) releaseCustomTimeline();
                  changeSide("a", next);
                }}
                onChangeB={(next) => {
                  if (next.timing !== sideB.timing || next.moveMode !== sideB.moveMode) releaseCustomTimeline();
                  changeSide("b", next);
                }}
                onEdit={setPlanEditor}
                onUseCustomShield={() => setShieldCustomActive(true)}
              />
              <section className={`panel battle-sheet-panel${timelineCustomOn ? " is-custom-live" : ""}`}>
                <BattleSheet
                  events={result.timeline}
                  koMissA={timelineCustomOn ? result.koMissA : []}
                  koMissB={timelineCustomOn ? result.koMissB : []}
                  onCharged={(side, index) => setThrowEditor({ side, index })}
                />
              </section>
              <p className="timeline-effect-note">
                確率の追加効果・スワイプ調整は
                <br />
                タイムラインの技2をタップすると設定できます
              </p>
              <button
                type="button"
                className={`timeline-custom-open${timelineCustomOn ? " is-on" : ""}`}
                onClick={() => {
                  if (chasing && fighterA && fighterBack && fighterB) {
                    chaseTimelineBefore.current = {
                      live: chaseTimeline.live,
                      lead: cloneSteps(chaseTimeline.lead),
                      back: cloneSteps(chaseTimeline.back),
                      foe: cloneSteps(chaseTimeline.foe),
                    };
                    chaseCountsBefore.current = { fast: chaseFast, order: [...chaseOrder], counts: { ...chaseCounts } };
                    const saved = chaseTimeline.lead && chaseTimeline.foe;
                    let stepsA: TimelineStep[];
                    let stepsB: TimelineStep[];
                    const leadTurns = Math.max(1, fighterA.input.fast.turns);
                    const followTurns = Math.max(1, fighterBack.input.fast.turns);
                    if (saved && !chaseTimeline.live) {
                      stepsA = stampSegmentFastTurns(
                        [...(chaseTimeline.lead ?? []), { kind: "switch" }, ...(chaseTimeline.back ?? [])],
                        leadTurns,
                        followTurns,
                      );
                      stepsB = chaseTimeline.foe ?? [];
                    } else {
                      const switchStep: TimelineStep = { kind: "switch" };
                      const baseA: TimelineStep[] | null = chaseTimeline.live && chaseTimeline.lead
                        ? [...chaseTimeline.lead, switchStep, ...(chaseTimeline.back ?? [])]
                        : null;
                      const nextA = extendPlanFromTimeline(baseA, result.timeline, "a");
                      const nextB = extendPlanFromTimeline(chaseTimeline.live ? chaseTimeline.foe : null, result.timeline, "b");
                      const withSwitch: TimelineStep[] = nextA.some((step) => step.kind === "switch") ? nextA : [...nextA, switchStep];
                      const filled = fillLaggingSide(
                        stampSegmentFastTurns(withSwitch, leadTurns, followTurns),
                        leadTurns,
                        fighterA.input.fast.id,
                        fighterA.input.fast.energyGain,
                        fighterA.input.charged,
                        nextB,
                        Math.max(1, fighterB.input.fast.turns),
                        fighterB.input.fast.id,
                        fighterB.input.fast.energyGain,
                        fighterB.input.charged,
                        { lockA: true },
                      );
                      stepsA = stampSegmentFastTurns(filled.stepsA, leadTurns, followTurns);
                      stepsB = filled.stepsB;
                    }
                    const split = splitSwitchPlan(stepsA);
                    setChaseTimeline({ live: true, lead: split.lead, back: split.back, foe: stepsB });
                    const synced = syncChaseCounts(split.lead);
                    setChaseFast(synced.fast);
                    setChaseOrder(synced.order);
                    setChaseCounts(synced.counts);
                    setTimelineOpen(true);
                    return;
                  }
                  timelineBefore.current = {
                    live: timelineLive,
                    aMode: sideA.timelineMode,
                    aPlan: sideA.timelinePlan?.map((step) => ({ ...step })) ?? null,
                    bMode: sideB.timelineMode,
                    bPlan: sideB.timelinePlan?.map((step) => ({ ...step })) ?? null,
                  };
                  const saved =
                    sideA.timelineMode === "custom" &&
                    sideB.timelineMode === "custom" &&
                    sideA.timelinePlan &&
                    sideB.timelinePlan;
                  let stepsA: TimelineStep[];
                  let stepsB: TimelineStep[];
                  if (saved && !timelineLive) {
                    stepsA = sideA.timelinePlan ?? [];
                    stepsB = sideB.timelinePlan ?? [];
                  } else {
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
                    stepsA = filled.stepsA;
                    stepsB = filled.stepsB;
                  }
                  const boundary = stepsA.findIndex((step) => step.kind === "switch");
                  if (boundary >= 0) stepsA = stepsA.slice(0, boundary);
                  setSideA((current) => ({ ...current, timelineMode: "custom", timelinePlan: stepsA }));
                  setSideB((current) => ({ ...current, timelineMode: "custom", timelinePlan: stepsB }));
                  setTimelineLive(true);
                  setTimelineOpen(true);
                }}
              >
                {timelineCustomOn ? "タイムラインカスタム中！" : "タイムラインカスタム"}
              </button>
              <p className="timeline-effect-note">「待機」を挿入するとターンをズラしたシミュレートが可能です</p>
              </div>
              {timelineOpen && chasing && fighterA && fighterBack && fighterB && chaseTimeline.lead && chaseTimeline.foe ? (
                <TimelineCustom
                  shownTurn={result.turns}
                  sideA={{
                    label: sideA.label,
                    fast: fighterA.input.fast,
                    charged: fighterA.input.charged,
                    plan: stampSegmentFastTurns(
                      [...chaseTimeline.lead, { kind: "switch" }, ...(chaseTimeline.back ?? []).filter((step) => step.kind !== "switch")],
                      fighterA.input.fast.turns,
                      fighterBack.input.fast.turns,
                    ),
                  }}
                  sideB={{
                    label: sideB.label,
                    fast: fighterB.input.fast,
                    charged: fighterB.input.charged,
                    plan: chaseTimeline.foe,
                  }}
                  benchA={{
                    label: sideBack.label,
                    fast: fighterBack.input.fast,
                    charged: fighterBack.input.charged,
                    plan: chaseTimeline.back ?? [],
                  }}
                  chargeFill={typeChargeFill}
                  moveWash={typeWash}
                  onChangeA={(plan) => {
                    const split = splitSwitchPlan(plan);
                    setChaseTimeline((current) => ({ ...current, live: true, lead: split.lead, back: split.back }));
                    const synced = syncChaseCounts(split.lead);
                    setChaseFast(synced.fast);
                    setChaseOrder(synced.order);
                    setChaseCounts(synced.counts);
                  }}
                  onChangeB={(plan) => setChaseTimeline((current) => ({ ...current, foe: plan }))}
                  onClose={() => setTimelineOpen(false)}
                  onDiscard={() => {
                    const snap = chaseTimelineBefore.current;
                    const counts = chaseCountsBefore.current;
                    if (snap) setChaseTimeline(snap);
                    if (counts) {
                      setChaseFast(counts.fast);
                      setChaseOrder(counts.order);
                      setChaseCounts(counts.counts);
                    }
                    setTimelineOpen(false);
                  }}
                />
              ) : null}
              {timelineOpen && !chasing && sideA.timelinePlan && sideB.timelinePlan ? (
                <TimelineCustom
                  shownTurn={result.turns}
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
                  onDiscard={() => {
                    const snap = timelineBefore.current;
                    if (snap) {
                      setTimelineLive(snap.live);
                      setSideA((current) => ({ ...current, timelineMode: snap.aMode, timelinePlan: snap.aPlan }));
                      setSideB((current) => ({ ...current, timelineMode: snap.bMode, timelinePlan: snap.bPlan }));
                    }
                    setTimelineOpen(false);
                  }}
                />
              ) : null}
              {planEditor ? (
                <PlanPopup
                  kind={planEditor.kind}
                  title={chasing && planEditor.kind === "move" && planEditor.side === "a" ? "技選択：引き先" : undefined}
                  side={chasing && planEditor.kind === "move" && planEditor.side === "a" ? sideBack : planEditor.side === "a" ? sideA : sideB}
                  moves={
                    chasing && planEditor.kind === "move" && planEditor.side === "a" && fighterBack
                      ? fighterBack.input.charged
                      : planEditor.side === "a"
                        ? fighterA.input.charged
                        : fighterB.input.charged
                  }
                  timeline={result.timeline}
                  actor={planEditor.side}
                  onClose={() => setPlanEditor(null)}
                  onChange={(next) =>
                    chasing && planEditor.kind === "move" && planEditor.side === "a" ? changeBack(next) : changeSide(planEditor.side, next)
                  }
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
  sideA,
  rear,
  sideB,
  grid,
  onSelect,
  customActive,
  onCustom,
}: {
  sideA: SideState;
  rear: SideState | null;
  sideB: SideState;
  grid: SimResult[][];
  onSelect: (shieldsA: number, shieldsB: number) => void;
  customActive: boolean;
  onCustom: () => void;
}) {
  const [warn, setWarn] = useState<string | null>(null);
  useEffect(() => {
    if (!warn) return;
    const close = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest(".shield-mismatch") || target.closest(".shield-mismatch-pop")) return;
      setWarn(null);
    };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [warn]);
  if (!sideA.record || !sideB.record) return null;
  return (
    <section className="panel shield-panel" aria-label="対面表">
      <div className="shield-panel-head">
        <h2 className="shield-panel-title">対面表</h2>
      </div>
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
          {rear?.record ? (
            <PokemonDotSprite
              className="corner-rear"
              pokemonId={rear.record.pokemon_id}
              form={rear.exactSprite ? undefined : rear.record.form}
              exact={rear.exactSprite}
              spriteSuffix={rear.spriteSuffix}
              alt=""
              size={16}
            />
          ) : null}
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
            const usedA = shieldsSpent(cell.timeline, "a");
            const usedB = shieldsSpent(cell.timeline, "b");
            const mismatch = usedA !== shieldsA || usedB !== shieldsB;
            const warnKey = `${shieldsA}-${shieldsB}`;
            return (
              <button
                key={warnKey}
                type="button"
                className={`shield-cell is-${tone}${selected ? " is-selected" : ""}`}
                style={{ background: shieldFill(cell.rating) }}
                aria-pressed={selected}
                aria-label={`自分${shieldsA} 相手${shieldsB} ${cell.rating}`}
                onClick={() => {
                  setWarn(null);
                  onSelect(shieldsA, shieldsB);
                }}
              >
                <strong className="num">{cell.rating}</strong>
                {mismatch ? (
                  <span
                    role="button"
                    tabIndex={selected ? 0 : -1}
                    className="shield-mismatch"
                    aria-label="シールド枚数の差"
                    onClick={(event) => {
                      if (!selected) return;
                      event.stopPropagation();
                      setWarn(warn === warnKey ? null : warnKey);
                    }}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter" && event.key !== " ") return;
                      event.preventDefault();
                      event.stopPropagation();
                      if (selected) setWarn(warn === warnKey ? null : warnKey);
                    }}
                  >
                    !
                  </span>
                ) : null}
                {selected && warn === warnKey ? (
                  <span className="shield-mismatch-pop" role="dialog">
                    ダメージ最適化の結果シールドの枚数に差があります
                  </span>
                ) : null}
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
  timelineLive = false,
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
  const charged = (entry.pokemon_id === 235 ? [side.chargedId] : [side.chargedId, side.chargedId2])
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
    timelinePlan: timelineLive && side.timelineMode === "custom" ? side.timelinePlan : null,
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
  if (entry.pokemon_id === 774 && entry.form === "Meteor") {
    const core = data.stats.find((row) => row.pokemon_id === 774 && row.form === "Red");
    const cpm = scale.byLevel.get(build.level.toFixed(1));
    if (core && cpm != null) {
      const derived = computeDerivedStats(core, side.atkIv, side.defIv, side.staIv, cpm);
      input.miniorCore = { attack: derived.attack, defense: derived.defense };
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

function applyPreset(side: SideState, preset?: FrequentPreset) {
  if (!preset) return side;
  return {
    ...side,
    atkIv: preset.atkIv,
    defIv: preset.defIv,
    staIv: preset.staIv,
    shadow: preset.shadow,
    fastId: preset.fastId || side.fastId,
    chargedId: preset.chargedId || side.chargedId,
    chargedId2: preset.chargedId2 || side.chargedId2,
    megaLevel: preset.megaLevel ?? side.megaLevel,
  };
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
    chargedId2: entry.pokemon_id === 235 ? "" : (rankedCharged[1]?.id ?? ""),
    shadow: false,
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
  initialHint = false,
}: {
  title: string;
  tone: "self" | "foe";
  side: SideState;
  data: NonNullable<ReturnType<typeof useResearchData>["data"]>;
  cap: number;
  levels: number[];
  byLevel: Map<string, number>;
  onChange: (next: SideState | ((current: SideState) => SideState)) => void;
  initialHint?: boolean;
}) {
  const packed = packFighter(side, data, { levels, byLevel }, cap);
  const fasts = packed?.fasts ?? [];
  const chargedMoves = packed?.chargedMoves ?? [];
  const fastValue = fasts.some((move) => move.id === side.fastId) ? side.fastId : (fasts[0]?.id ?? "");
  const chargedValue = chargedMoves.some((move) => move.id === side.chargedId) ? side.chargedId : (chargedMoves[0]?.id ?? "");
  const singleCharged = side.record?.pokemon_id === 235;
  const charged2Value = singleCharged
    ? ""
    : chargedMoves.some((move) => move.id === side.chargedId2)
      ? side.chargedId2
      : "";
  const thirdMove = packed?.thirdMove ?? null;
  const stats = packed?.build;
  const types = packed?.pvp.types ?? [];
  const fastMove = fasts.find((move) => move.id === fastValue) ?? fasts[0] ?? null;
  const [initialOpen, setInitialOpen] = useState(false);
  const placedKey = side.record ? `${side.record.pokemon_id}:${side.record.form}` : "";
  const [initialSpentKey, setInitialSpentKey] = useState("");
  const initialArm = placedKey !== "" && initialSpentKey !== placedKey;
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
      {singleCharged ? (
        <select className="input" aria-label="スペシャルアタック2" value="" disabled>
          <option value="">-</option>
        </select>
      ) : (
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
      )}
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
          chaseHint={initialHint}
          maxHp={stats.stamina}
          fastName={fastMove?.name ?? "ノーマルアタック"}
          fastGain={fastMove?.energyGain ?? 0}
          state={initialStateOf(side)}
          onChange={(next: InitialState, source) => {
            if (source === "input" && initialArm) {
              setInitialSpentKey(placedKey);
              onChange({ ...side, ...next, initialOn: true });
              return;
            }
            onChange({ ...side, ...next });
          }}
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
  extraName?: string;
  extraDamage?: number;
  extraSpriteId?: number;
  extraSpriteForm?: string;
};

type TurnRow = {
  key: string;
  turn: number;
  line: number;
  hpA: number;
  hpB: number;
  energyA: number;
  energyB: number;
  a: TimelineEvent | null;
  b: TimelineEvent | null;
  aNote: TimelineEvent | null;
  bNote: TimelineEvent | null;
};

function isMissile(event: TimelineEvent) {
  return event.kind === "note" && event.moveName === "うのミサイル";
}

function buildSheet(events: TimelineEvent[]) {
  const byTurn = new Map<number, TimelineEvent[]>();
  for (const event of events) {
    const list = byTurn.get(event.turn) ?? [];
    list.push(event);
    byTurn.set(event.turn, list);
  }

  const turns: TurnRow[] = [];
  for (const [turn, list] of byTurn) {
    const visible = list.filter((event) => !isMissile(event));
    const maxLine = Math.max(0, ...visible.map((event) => event.line ?? 0));
    const end = list[list.length - 1];
    for (let line = 0; line <= maxLine; line += 1) {
      const row: TurnRow = {
        key: `${turn}-${line}`,
        turn,
        line,
        hpA: end?.hpA ?? 0,
        hpB: end?.hpB ?? 0,
        energyA: end?.energyA ?? 0,
        energyB: end?.energyB ?? 0,
        a: null,
        b: null,
        aNote: null,
        bNote: null,
      };
      for (const event of visible) {
        if ((event.line ?? 0) !== line) continue;
        row[event.actor] = event;
      }
      if (line === 0) {
        for (const event of list) {
          if (!isMissile(event)) continue;
          if (event.actor === "a") row.aNote = event;
          else row.bNote = event;
        }
      }
      if (line > 0) {
        for (const actor of ["a", "b"] as const) {
          if (row[actor]) continue;
          const carried = visible.find((event) => event.actor === actor && (event.line ?? 0) === 0 && event.kind === "fast");
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
    energyA: row.energyA,
    energyB: row.energyB,
    charge: chargeKeys.has(row.key),
    guardA: receivedGuard(row, "a"),
    guardB: receivedGuard(row, "b"),
    a: cellsA.get(row.key) ?? null,
    b: cellsB.get(row.key) ?? null,
  }));
}

function receivedGuard(row: TurnRow, actor: "a" | "b"): "shield" | "disguise" | null {
  const other = actor === "a" ? row.b : row.a;
  if (other?.kind !== "charged") return null;
  if (other.shielded) return "shield";
  if (other.disguise) return "disguise";
  return null;
}

function sideNote(row: TurnRow, actor: "a" | "b") {
  return actor === "a" ? row.aNote : row.bNote;
}

/** セルの下端が、チャージ下線を引くターンの最後の行に届いている。 */
function cellEndsCharge(turns: TurnRow[], chargeKeys: Set<string>, to: number) {
  const turn = turns[to]?.turn;
  if (turn == null || turns[to + 1]?.turn === turn) return false;
  let start = to;
  while (start > 0 && turns[start - 1].turn === turn) start -= 1;
  for (let index = start; index <= to; index += 1) {
    if (chargeKeys.has(turns[index].key)) return true;
  }
  return false;
}

function moveSegments(turns: TurnRow[], actor: "a" | "b", chargeKeys: Set<string>) {
  const cells = new Map<string, SheetCell | null>();
  let index = 0;
  while (index < turns.length) {
    const event = turns[index][actor];
    const note = sideNote(turns[index], actor);
    if (!event && !note) {
      cells.set(turns[index].key, null);
      index += 1;
      continue;
    }

    const startedEarlier = Boolean(index > 0 && event && turns[index - 1][actor]?.actionId === event.actionId);
    const guardHere = receivedGuard(turns[index], actor);
    if (note || event?.kind === "note" || (startedEarlier && guardHere && event?.kind === "fast")) {
      const missile = note && event && event.kind !== "note" ? note : null;
      const shown = missile ? event : (note ?? event);
      const label = event?.kind === "note" ? event.moveName : missile ? event?.moveName ?? "" : note?.moveName ?? "";
      cells.set(turns[index].key, {
        show: true,
        span: 1,
        name: startedEarlier && guardHere && !missile ? "" : label,
        type: event?.moveType ?? "",
        damage: missile ? (event?.damage ?? 0) : event && event.kind !== "note" ? 0 : (shown?.damage ?? 0),
        shielded: false,
        endsCharge: cellEndsCharge(turns, chargeKeys, index),
        cct: false,
        charged: event?.kind === "charged",
        throwIndex: event?.kind === "charged" ? (event.throwIndex ?? null) : null,
        spriteId: missile ? undefined : shown?.spriteId,
        spriteForm: missile ? undefined : shown?.spriteForm,
        extraName: missile?.moveName,
        extraDamage: missile?.damage,
        extraSpriteId: missile?.spriteId,
        extraSpriteForm: missile?.spriteForm,
      });
      index += 1;
      continue;
    }

    let end = index;
    let sawCharge = false;
    while (end < turns.length && turns[end][actor]?.actionId === event?.actionId && turns[end][actor]?.kind !== "note") {
      if (sideNote(turns[end], actor) && end > index) break;
      if (end > index && receivedGuard(turns[end], actor)) break;
      if (chargeKeys.has(turns[end].key)) sawCharge = true;
      const leaving = !turns[end + 1] || turns[end + 1].turn !== turns[end].turn;
      end += 1;
      if (sawCharge && leaving) break;
    }

    const slice = turns.slice(index, end);
    let landing = [...slice].reverse().find((row) => (row[actor]?.damage ?? 0) > 0)?.[actor];
    const following = turns[end]?.[actor];
    if (!landing && following && following.actionId === event?.actionId && following.damage > 0) landing = following;
    const endsCharge = cellEndsCharge(turns, chargeKeys, end - 1);
    const missile = slice.map((row) => sideNote(row, actor)).find((item) => item);
    cells.set(turns[index].key, {
      show: true,
      span: end - index,
      name: event?.moveName ?? "",
      type: event?.moveType ?? "",
      damage: landing?.damage ?? 0,
      shielded: landing?.shielded ?? false,
      endsCharge,
      cct: event?.kind === "fast" && event.cct,
      charged: event?.kind === "charged",
      throwIndex: event?.throwIndex ?? null,
      extraName: missile?.moveName,
      extraDamage: missile?.damage,
      extraSpriteId: missile?.spriteId,
      extraSpriteForm: missile?.spriteForm,
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
  koMissA = [],
  koMissB = [],
  onCharged,
}: {
  events: TimelineEvent[];
  koMissA?: number[];
  koMissB?: number[];
  onCharged: (side: "a" | "b", index: number) => void;
}) {
  const rows = buildSheet(events);
  const missA = new Set(koMissA);
  const missB = new Set(koMissB);
  return (
      <table className={`battle-sheet${TIMELINE_ENERGY ? " shows-energy" : ""}`} aria-label="行動">
      <colgroup>
        <col className="col-hp" />
        {TIMELINE_ENERGY ? <col className="col-energy" /> : null}
        <col className="col-move" />
        <col className="col-turn" />
        <col className="col-move" />
        {TIMELINE_ENERGY ? <col className="col-energy" /> : null}
        <col className="col-hp" />
      </colgroup>
      <thead>
        <tr>
          <th className="hp">HP</th>
          {TIMELINE_ENERGY ? <th className="energy">EN</th> : null}
          <th className="move" />
          <th className="turn" />
          <th className="move" />
          {TIMELINE_ENERGY ? <th className="energy">EN</th> : null}
          <th className="hp">HP</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => {
          const prev = rows[index - 1];
          const next = rows[index + 1];
          const follow = prev?.turn === row.turn;
          const more = next?.turn === row.turn;
          let span = 1;
          if (!follow) {
            while (rows[index + span]?.turn === row.turn) span += 1;
          }
          let turnStart = index;
          while (turnStart > 0 && rows[turnStart - 1].turn === row.turn) turnStart -= 1;
          let turnEnd = index;
          while (rows[turnEnd + 1]?.turn === row.turn) turnEnd += 1;
          const turnHasCharge = rows.slice(turnStart, turnEnd + 1).some((item) => item.charge);
          const prevHp = follow ? null : prev;
          const energyCell = (side: "a" | "b") => {
            const miss = side === "a" ? missA : missB;
            const energy = side === "a" ? row.energyA : row.energyB;
            const previous = side === "a" ? prevHp?.energyA : prevHp?.energyB;
            const changed = !prevHp || previous !== energy;
            const missNow = miss.has(row.turn);
            const missPrev = Boolean(prev && miss.has(prev.turn));
            if (!changed && !(missNow && !missPrev)) return null;
            return { text: energy, alert: missNow };
          };
          const energyA = energyCell("a");
          const energyB = energyCell("b");
          return (
            <tr
              key={row.key}
              className={[
                row.charge ? "has-charge" : "",
                turnHasCharge && index === turnEnd ? "has-charge-end" : "",
                turnHasCharge && index === turnStart ? "has-charge-span" : "",
                follow ? "is-follow" : "",
                more ? "has-follow" : "",
              ]
                .filter(Boolean)
                .join(" ") || undefined}
            >
              {follow ? null : (
                <>
                  <td className="hp num" rowSpan={span}>
                    {!prevHp || prevHp.hpA !== row.hpA ? row.hpA : ""}
                  </td>
                  {TIMELINE_ENERGY ? (
                    <td className={`energy num${energyA?.alert ? " is-ko-miss" : ""}`} rowSpan={span}>
                      {energyA ? energyA.text : ""}
                    </td>
                  ) : null}
                </>
              )}
              <MoveCell cell={row.a} guard={row.guardA} onCharged={(throwIndex) => onCharged("a", throwIndex)} />
              {follow ? null : (
                <td className="turn num" rowSpan={span}>
                  {row.turn}
                </td>
              )}
              <MoveCell cell={row.b} guard={row.guardB} onCharged={(throwIndex) => onCharged("b", throwIndex)} />
              {follow ? null : (
                <>
                  {TIMELINE_ENERGY ? (
                    <td className={`energy num${energyB?.alert ? " is-ko-miss" : ""}`} rowSpan={span}>
                      {energyB ? energyB.text : ""}
                    </td>
                  ) : null}
                  <td className="hp num" rowSpan={span}>
                    {!prevHp || prevHp.hpB !== row.hpB ? row.hpB : ""}
                  </td>
                </>
              )}
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
  guard: "shield" | "disguise" | null;
  onCharged: (index: number) => void;
}) {
  if (cell && !cell.show) return null;
  const guardMark =
    guard === "shield" ? (
      <span className="move-shield-wrap">
        <ShieldMark size={13} />
      </span>
    ) : guard === "disguise" ? (
      <span className="move-disguise">ばけのかわ</span>
    ) : null;
  if (!cell?.name) {
    if (guardMark) {
      return (
        <td className={`move is-guard${cell?.endsCharge ? " ends-charge" : ""}`}>
          {guardMark}
        </td>
      );
    }
    return <td className="move is-empty" />;
  }
  const stacked = Boolean(guardMark);
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
  const extra =
    cell.extraName ? (
      <span className="move-line-main is-extra">
        <span className="move-name">{cell.extraName}</span>
        {cell.extraDamage ? <span className="num move-dmg">{cell.extraDamage}</span> : null}
        {cell.extraSpriteId ? (
          <PokemonDotSprite pokemonId={cell.extraSpriteId} form={cell.extraSpriteForm} alt="" size={22} />
        ) : null}
      </span>
    ) : null;
  return (
    <td
      className={`move${cell.name === "交代" ? " is-switch" : ""}${cell.endsCharge ? " ends-charge" : ""}${stacked ? " is-stacked" : ""}${longCct ? " is-long-cct" : ""}${cell.charged ? " is-charged" : ""}`}
      rowSpan={cell.span}
      style={cell.name && cell.name !== "交代" ? { background: typeWash(cell.type) } : undefined}
    >
      {stacked ? (
        <span className="move-label is-stacked">
          {moveMain}
          {extra}
          {cell.cct ? <span className="cct-mark">CCT</span> : null}
          {guardMark}
        </span>
      ) : (
        <span className={`move-label${cell.cct ? " has-cct" : ""}${longCct ? " is-long" : ""}`}>
          {moveMain}
          {extra}
          {cell.cct ? <span className="cct-mark">CCT</span> : null}
        </span>
      )}
    </td>
  );
}

type MatchupBar = {
  damage: number;
  percent: number;
  remainRatio: number;
  band: "low" | "mid" | "high";
};

type MatchupHitRow = {
  id: string;
  name: string;
  damage: number;
  percent: number;
  remainRatio: number;
  band: "low" | "mid" | "high";
  third: boolean;
  alt: MatchupBar | null;
};

function matchupBar(damage: number, maxHp: number): MatchupBar {
  const percent = (100 * damage) / maxHp;
  const remainRatio = Math.max(0, Math.min(1, (maxHp - damage) / maxHp));
  const band = remainRatio <= 0.2 ? "low" : remainRatio <= 0.5 ? "mid" : "high";
  return { damage, percent, remainRatio, band };
}

function matchupMoveHits(attacker: FighterInput, defender: FighterInput, thirdId: string | null): MatchupHitRow[] {
  const moves = [attacker.fast, ...attacker.charged];
  const seen = new Set<string>();
  const rows: MatchupHitRow[] = [];
  const maxHp = Math.max(1, defender.hp);
  for (const move of moves) {
    if (seen.has(move.id)) continue;
    seen.add(move.id);
    const hit = (type: string) =>
      damageForMove(
        { ...move, type },
        attacker.attack,
        defender.defense,
        attacker.types,
        defender.types,
        attacker.shadow,
        defender.shadow,
      );
    const damage = hit(move.type);
    const electric = isAuraWheel(move) ? hit("electric") : damage;
    const dark = isAuraWheel(move) ? hit("dark") : damage;
    const bar = matchupBar(isAuraWheel(move) ? electric : damage, maxHp);
    const alt = isAuraWheel(move) && electric !== dark ? matchupBar(dark, maxHp) : null;
    rows.push({
      id: move.id,
      name: move.name,
      ...bar,
      third: move.id === thirdId,
      alt,
    });
  }
  return rows;
}

function MatchupSide({
  word,
  onApplyIv,
  side,
  rear = null,
  view = null,
  onView,
  hp,
  max,
  cp,
  scp,
  attack,
  defense,
  stamina,
  energy,
  shields,
  hits,
  attackBreak,
  defenseBreak,
  leagueId,
  megas,
  foe,
}: {
  word: "WIN" | "LOSE" | null;
  onApplyIv: (ivs: { atkIv: number; defIv: number; staIv: number }) => void;
  side: SideState;
  rear?: SideState | null;
  view?: "lead" | "back" | null;
  onView?: (slot: "lead" | "back") => void;
  hp: number;
  max: number;
  cp: number;
  scp: number;
  attack: number;
  defense: number;
  stamina: number;
  energy: number;
  shields: number;
  hits: MatchupHitRow[];
  attackBreak: FastBreakMark | null;
  defenseBreak: FastBreakMark | null;
  foe: SideState;
  leagueId: LeagueId;
  megas: MegaEntry[];
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
        {side.record && rear?.record ? (
          <StackedMon
            anchorFront
            onRear={onView && view ? () => onView(view === "lead" ? "back" : "lead") : undefined}
            rearLabel={view === "lead" ? "引き先に切り替え" : "初手に切り替え"}
            front={{
              pokemonId: side.record.pokemon_id,
              form: side.record.form,
              exact: side.exactSprite,
              spriteSuffix: side.spriteSuffix,
              shadow: side.shadow,
            }}
            rear={{
              pokemonId: rear.record.pokemon_id,
              form: rear.record.form,
              exact: rear.exactSprite,
              spriteSuffix: rear.spriteSuffix,
              shadow: rear.shadow,
            }}
            size={68}
          />
        ) : side.record ? (
          <span className="sim-banner-sprite">
            <PokemonDotSprite
              pokemonId={side.record.pokemon_id}
              form={side.exactSprite ? undefined : side.record.form}
              exact={side.exactSprite}
              spriteSuffix={side.spriteSuffix}
              alt=""
              size={68}
            />
            {side.shadow ? <img className="sim-banner-shadow" src={SOZAI_SHADOW_SRC} alt="" /> : null}
          </span>
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
      <p className="sim-gauge">
        <span>ゲージ：{energy}</span>
        <span className="sim-gauge-shield">
          <ShieldMark size={14} />×{shields}
        </span>
      </p>
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
      <div className="sim-break-stack">
        <BreakButton kind="break" row={attackBreak} side={side} foe={foe} leagueId={leagueId} megas={megas} onApplyIv={onApplyIv} />
        <BreakButton kind="bulk" row={defenseBreak} side={side} foe={foe} leagueId={leagueId} megas={megas} onApplyIv={onApplyIv} />
        {onView ? (
          <div className="chase-view" role="group" aria-label="表示するポケモン">
            <button type="button" aria-pressed={view === "lead"} onClick={() => onView("lead")}>
              初手
            </button>
            <button type="button" aria-pressed={view === "back"} onClick={() => onView("back")}>
              引き先
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function BreakButton({
  kind,
  row,
  side,
  foe,
  leagueId,
  megas,
  onApplyIv,
}: {
  kind: "break" | "bulk";
  row: FastBreakMark | null;
  side: SideState;
  foe: SideState;
  leagueId: LeagueId;
  megas: MegaEntry[];
  onApplyIv: (ivs: { atkIv: number; defIv: number; staIv: number }) => void;
}) {
  const [open, setOpen] = useState(false);
  const picked = row?.row ?? null;
  const live = Boolean(picked && side.record);
  const label = kind === "break" ? "わざ1ブレイク！" : "ブレイク抑え！";
  const title = kind === "break" ? "わざ1ブレイク！　最大順位" : "ブレイク抑え！　最大順位";
  const statLabel = kind === "break" ? "攻撃" : "防御";
  const stat = picked ? (kind === "break" ? picked.attack : picked.defense) : 0;
  return (
    <>
      <button
        type="button"
        className={`sim-break-btn${live ? " is-live" : ""}`}
        disabled={!live}
        onClick={() => {
          if (live) setOpen(true);
        }}
      >
        <span>{label}</span>
        <span className="num">{picked ? formatPlace(picked.rank) : "位"}</span>
      </button>
      {open && picked && side.record
        ? createPortal(
        <div className="search-overlay is-centered sim-break-overlay" role="dialog" aria-modal="true" aria-label={label}>
          <button type="button" className="search-overlay-backdrop" aria-label="閉じる" onClick={() => setOpen(false)} />
          <div className="search-overlay-panel sim-break-panel">
            <h2 className="shield-panel-title">{title}</h2>
            <div className="sim-break-stage">
              <div className="sim-break-body">
                <PokemonDotSprite
                  pokemonId={side.record.pokemon_id}
                  form={side.exactSprite ? undefined : side.record.form}
                  exact={side.exactSprite}
                  spriteSuffix={side.spriteSuffix}
                  alt=""
                  size={72}
                />
                <p className={`check-rank place num ${placeTone(picked.rank)}`}>{formatPlace(picked.rank)}！</p>
                <p className="check-mid num">
                  {picked.atkIv}-{picked.defIv}-{picked.staIv}
                </p>
                <p className="check-mid num">CP {picked.cp}</p>
                <p className="check-mid num">SCP {formatScp(picked.statProduct)}</p>
                <p className="check-mid num">
                  {statLabel} {formatBattleStat(stat, 2)}
                </p>
              </div>
              <button
                type="button"
                className="btn btn-outline sim-break-recalc"
                onClick={() => {
                  onApplyIv({ atkIv: picked.atkIv, defIv: picked.defIv, staIv: picked.staIv });
                  setOpen(false);
                }}
              >
                <span>この個体で</span>
                <span>再計算</span>
              </button>
            </div>
            <div className="sim-iv-actions">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  if (!side.record || !foe.record) return;
                  requestBreakStudy({
                    league: leagueId,
                    attacker: {
                      pokemonId: side.record.pokemon_id,
                      form: side.record.form,
                      atkIv: picked.atkIv,
                      defIv: picked.defIv,
                      staIv: picked.staIv,
                      shadow: side.shadow,
                      fastId: kind === "break" ? (row?.moveId || side.fastId) : side.fastId,
                    },
                    defender: {
                      pokemonId: foe.record.pokemon_id,
                      form: foe.record.form,
                      atkIv: foe.atkIv,
                      defIv: foe.defIv,
                      staIv: foe.staIv,
                      shadow: foe.shadow,
                      fastId: kind === "bulk" ? (row?.moveId || foe.fastId) : foe.fastId,
                    },
                  });
                  setOpen(false);
                }}
              >
                他の個体値を検索
              </button>
              <button type="button" className="btn btn-outline" onClick={() => setOpen(false)}>
                閉じる
              </button>
            </div>
          </div>
        </div>,
        document.body,
      ) : null}
    </>
  );
}

function HitBar({ row }: { row: MatchupBar }) {
  const lossRatio = Math.max(0, Math.min(1, 1 - row.remainRatio));
  const remainPct = row.remainRatio * 100;
  const lossPct = lossRatio * 100;
  const onlyRemain = lossPct <= 0;
  const onlyLoss = remainPct <= 0;
  return (
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
  );
}

function HitMeter({ row }: { row: MatchupHitRow }) {
  return (
    <div className="sim-hit-row">
      <div className="sim-hit-meta">
        <span className="sim-hit-name">{row.name}</span>
        <span className="sim-hit-val num">
          {row.damage}({row.percent.toFixed(1)}%)
        </span>
      </div>
      <HitBar row={row} />
      {row.alt ? (
        <>
          <div className="sim-hit-meta">
            <span className="sim-hit-name" />
            <span className="sim-hit-val num">
              {row.alt.damage}({row.alt.percent.toFixed(1)}%)
            </span>
          </div>
          <HitBar row={row.alt} />
        </>
      ) : null}
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

function followFromPacked(packed: NonNullable<ReturnType<typeof packFighter>>, timeline: TimelineStep[] | null): FollowPokemon {
  const input = packed.input;
  return {
    label: input.label,
    attack: input.attack,
    defense: input.defense,
    hp: input.hp,
    types: input.types,
    shadow: input.shadow,
    fast: input.fast,
    charged: input.charged,
    speciesId: input.speciesId,
    form: input.form,
    aegislash: input.aegislash,
    miniorMeteor: input.miniorMeteor,
    miniorCore: input.miniorCore,
    timing: input.timing,
    applyChanceBuffs: input.applyChanceBuffs,
    chargedQueue: input.chargedQueue,
    timelinePlan: timeline,
    startHp: input.startHp,
    startEnergy: input.startEnergy,
    startAttackStage: input.startAttackStage,
    startDefenseStage: input.startDefenseStage,
  };
}

function chaseBattleInput(
  lead: NonNullable<ReturnType<typeof packFighter>>,
  back: NonNullable<ReturnType<typeof packFighter>> | null,
  chaseLive: boolean,
  leadPlan: TimelineStep[] | null,
  backPlanSaved: TimelineStep[] | null,
  fastCount: number,
  order: string[],
) {
  if (!back) return { input: lead.input, short: false };
  const known = new Set(lead.input.charged.map((move) => move.id));
  const specials = order.flatMap((id) => {
    const move = lead.input.charged.find((item) => item.id === id);
    return known.has(id) && move ? [{ id: move.id, energy: move.energy }] : [];
  });
  const requested = Math.min(Math.max(0, fastCount), fastCountMax(lead.input.fast.turns));
  const scriptInput = {
    fastId: lead.input.fast.id,
    fastTurns: lead.input.fast.turns,
    fastGain: lead.input.fast.energyGain,
    startEnergy: lead.input.startEnergy ?? 0,
    specials,
  };
  const minimum = buildLeadScript({ ...scriptInput, fastCount: 0 });
  const script = buildLeadScript({ ...scriptInput, fastCount: requested });
  let steps = script.steps;
  let switchTurn = script.switchTurn;
  let backPlan: TimelineStep[] | null = null;
  if (chaseLive && leadPlan) {
    steps = leadPlan.filter((step) => step.kind !== "switch");
    backPlan = backPlanSaved?.filter((step) => step.kind !== "switch") ?? null;
    switchTurn = planTurns(steps, Math.max(1, lead.input.fast.turns)) + 1;
  }
  return {
    short: minimum.fastUsed > requested,
    input: {
      ...lead.input,
      timelinePlan: steps,
      chargedQueue: null,
      scriptCct: !chaseLive && lead.input.timing === "cct",
      follow: { switchTurn, next: followFromPacked(back, backPlan) },
    },
  };
}

function BannerSlot({ slot, children }: { slot: "banner-leading" | "banner-trailing"; children: ReactNode }) {
  const [node, setNode] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setNode(document.getElementById(slot));
  }, [slot]);
  if (!node) return null;
  return createPortal(children, node);
}
