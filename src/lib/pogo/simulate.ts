/**
 * 対戦の細かい仕様は docs/対戦仕様.md。
 * このファイルを直す前に、その文書を読む。連戦モードでも同じ順で処理する。
 */
import {
  AEGIS_CHARGE_MOVE,
  auraWheelType,
  belowHalf,
  gulpCatch,
  gulpDamage,
  gulpSprite,
  isAuraWheel,
  isGulpLoader,
} from "./battleTraits";
import { damageForMove, type PvpMove } from "./combat";
import { resolveThrowTweak } from "./moveBonusEffect";
import { stepDuration, type TimelineStep } from "./timelinePlan";
import { stabMultiplier, typeEffectiveness } from "./types";

export type ChargeTiming = "asap" | "cct";
export type FighterId = "a" | "b";

export type ThrowTweak = {
  /** この1発だけ追加効果を入れる。 */
  buff: boolean;
  /** 25～100。シールドで防いだ技には掛けない。 */
  damagePercent: number;
};

export type FighterInput = {
  label: string;
  attack: number;
  defense: number;
  hp: number;
  types: string[];
  shadow: boolean;
  fast: PvpMove;
  charged: PvpMove[];
  shields: number;
  timing: ChargeTiming;
  applyChanceBuffs: boolean;
  /** カスタムのゲージ技順。null はその回を打たない。未指定なら最適。 */
  chargedQueue?: (string | null)[] | null;
  /** 受けるスペシャルの何発目（0始まり）を防ぐか。未指定なら枚数ぶん先に来た技から防ぐ。 */
  shieldThrows?: number[] | null;
  /** 自分が撃ったスペシャルの何発目か。 */
  throwTweaks?: (ThrowTweak | null)[] | null;
  /** 指定ターンに交代する。出てきたポケモンはそのターン技を出さない。シールドは引き継ぐ。 */
  switchPlan?: SwitchPlan | null;
  /** タイムラインカスタム。ある側は、この順で技か待機を行う。尽きたあとは最適で続ける。 */
  timelinePlan?: TimelineStep[] | null;
  /** 0ターン目の残りHP。未指定なら hp（最大）から始める。 */
  startHp?: number;
  /** 0ターン目のゲージ。0～100。未指定なら 0。 */
  startEnergy?: number;
  /** 0ターン目の攻撃ランク。-4～4。未指定なら 0。 */
  startAttackStage?: number;
  /** 0ターン目の防御ランク。-4～4。未指定なら 0。 */
  startDefenseStage?: number;
  speciesId?: number;
  form?: string;
  /** シールドフォルムを選んだギルガルドだけ。ブレードの実数値と、戻したあとのノーマルアタック。 */
  aegislash?: { bladeAttack: number; bladeDefense: number; bladeFast: PvpMove } | null;
  /** コアを選んだメテノ。流星の姿の攻撃と防御。HPはコアのまま。 */
  miniorMeteor?: { attack: number; defense: number } | null;
  /** 流星の姿を選んだメテノ。半分を下回ったあとのコアの攻撃と防御。 */
  miniorCore?: { attack: number; defense: number } | null;
  /** 後追い。自分の初手が交代し、引き先か相手が倒れるまで続ける。 */
  follow?: FollowPlan | null;
  /**
   * 後追い初手の自動手順だけ。ゲージが足りたスペシャルを、余りノーマルの範囲で最適タイミングまで遅らせる。
   * タイムラインカスタムと最短では付けない。
   */
  scriptCct?: boolean;
};

export type SwitchPlan = {
  turn: number;
  next: {
    label: string;
    attack: number;
    defense: number;
    hp: number;
    types: string[];
    shadow: boolean;
    fast: PvpMove;
    charged: PvpMove[];
    speciesId?: number;
    form?: string;
    aegislash?: FighterInput["aegislash"];
    miniorMeteor?: FighterInput["miniorMeteor"];
    miniorCore?: FighterInput["miniorCore"];
  };
};

export type TimelineEvent = {
  turn: number;
  actor: FighterId;
  kind: "fast" | "charged" | "note";
  moveName: string;
  moveType: string;
  damage: number;
  shielded: boolean;
  actionId: number;
  /** スペシャルが打てるのに、最適タイミングまでノーマルアタックを足した。 */
  cct: boolean;
  /** その側が撃ったスペシャルの何発目か。0始まり。 */
  throwIndex: number | null;
  moveId: string;
  hpA: number;
  hpB: number;
  energyA: number;
  energyB: number;
  /** タイムラインカスタムの手順から出た技。手順のあとの最適は false。 */
  scripted: boolean;
  /** 同じターンの何行目か。0が上。 */
  line: number;
  /** スペシャルと同じ下線。メテノのフォルムチェンジ。 */
  chargeLine?: boolean;
  /** 後追いで、自分側のどのポケモンの行動か。 */
  mon?: "lead" | "back";
  spriteId?: number;
  spriteForm?: string;
  /** このスペシャルを、相手が化けの皮で受けた。 */
  disguise?: boolean;
};

export type SimResult = {
  winner: FighterId | "draw";
  turns: number;
  hpA: number;
  hpB: number;
  maxHpA: number;
  maxHpB: number;
  energyA: number;
  energyB: number;
  rating: number;
  timeline: TimelineEvent[];
  shieldsLeftA: number;
  shieldsLeftB: number;
  /** 倒し切れるスペシャルが溜まっていたのに、次のターンで撃たなかったターン。 */
  koMissA: number[];
  koMissB: number[];
  /** 後追いの内訳。通常の1対1では null。 */
  follow: FollowResult | null;
};

export type FollowPokemon = {
  label: string;
  attack: number;
  defense: number;
  hp: number;
  types: string[];
  shadow: boolean;
  fast: PvpMove;
  charged: PvpMove[];
  speciesId?: number;
  form?: string;
  aegislash?: FighterInput["aegislash"];
  miniorMeteor?: FighterInput["miniorMeteor"];
  miniorCore?: FighterInput["miniorCore"];
  timing: ChargeTiming;
  applyChanceBuffs: boolean;
  chargedQueue?: (string | null)[] | null;
  timelinePlan?: TimelineStep[] | null;
  startHp?: number;
  startEnergy?: number;
  startAttackStage?: number;
  startDefenseStage?: number;
};

export type FollowPlan = {
  next: FollowPokemon;
  /** 1始まり。このターンは初手を見て技を決めてから交代する。 */
  switchTurn: number;
};

export type FollowResult = {
  /** 評価に使った自分側。交代前に勝つと lead。 */
  active: "lead" | "back";
  earlyWin: boolean;
  switched: boolean;
  backEntered: boolean;
  leadHp: number;
  leadMaxHp: number;
  leadEnergy: number;
  backHp: number;
  backMaxHp: number;
  backEnergy: number;
};

type Action = {
  kind: "fast" | "charged";
  move: PvpMove;
  turnsLeft: number;
  totalTurns: number;
  id: number;
  startTurn: number;
  cct: boolean;
  scripted: boolean;
};

type FighterState = FighterInput & {
  id: FighterId;
  energy: number;
  shieldsLeft: number;
  attackStage: number;
  defenseStage: number;
  action: Action | null;
  /** タイムラインカスタムの次の手順。 */
  planIndex: number;
  /** ゲージが足りてから、まだ撃たずに通したノーマルアタックの数。 */
  farmed: number;
  thrown: number;
  queueCursor: number;
  received: number;
  switched: boolean;
  backEntered: boolean;
  faintSwitchTurn: number;
  entryLock: number;
  leadHp: number;
  leadEnergy: number;
  leadMaxHp: number;
  activeMon: "lead" | "back";
  speciesId: number;
  formName: string;
  maxHp: number;
  firedSpecials: number;
  aegis: null | "shield" | "blade";
  aegisBladeAttack: number;
  aegisBladeDefense: number;
  aegisShieldAttack: number;
  aegisShieldDefense: number;
  aegisBladeFast: PvpMove | null;
  disguiseReady: boolean;
  gulp: null | "arrokuda" | "pikachu";
  minior: null | "meteor" | "core";
  miniorCoreAttack: number;
  miniorCoreDefense: number;
  miniorMeteorAttack: number;
  miniorMeteorDefense: number;
  /** 手順配列をこの対戦用に複製した。入力側の配列は書き換えない。 */
  planDetached?: boolean;
};

function clampStage(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(-4, Math.min(4, Math.trunc(value)));
}

function clampEnergy(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.floor(value)));
}

function clampStartHp(value: number | undefined, maxHp: number) {
  if (value == null || !Number.isFinite(value)) return maxHp;
  return Math.max(0, Math.min(maxHp, Math.floor(value)));
}

function cctTurnsLeft(myTurns: number, oppTurns: number) {
  if (oppTurns <= 1) return null;
  const key = `${myTurns}-${oppTurns}`;
  const table: Record<string, number | null> = {
    "1-2": 1,
    "1-3": 1,
    "1-4": 1,
    "2-2": null,
    "2-3": 1,
    "2-4": 2,
    "3-2": 1,
    "3-3": null,
    "3-4": 1,
    "4-2": null,
    "4-3": 1,
    "4-4": null,
  };
  return table[key] ?? null;
}

/** 1〜4ターンの表と同じ規則を、5ターンの相手まで伸ばしたもの。 */
function extendedCctTurnsLeft(myTurns: number, oppTurns: number) {
  if (oppTurns <= 1) return null;
  if (myTurns % oppTurns === 0) return null;
  if (myTurns < oppTurns && oppTurns % myTurns === 0) return myTurns;
  return 1;
}

function leadScriptThrowNow(self: FighterState, other: FighterState, move: PvpMove) {
  if (other.shieldsLeft === 0 && damageOf(self, other, move) >= other.hp) return true;
  if (self.fast.turns <= 4 && other.fast.turns <= 4) return shouldThrow(self, other, move);
  const needed = extendedCctTurnsLeft(self.fast.turns, other.fast.turns);
  if (needed == null) return true;
  return other.action?.kind === "fast" && other.action.turnsLeft === needed;
}

function chargeCost(self: FighterState, moveId: string) {
  return self.charged.find((move) => move.id === moveId)?.energy ?? null;
}

/** このファストを今のスペシャルの前へ動かしても、後ろのスペシャルのゲージが足りるか。 */
function canSlideFastBefore(self: FighterState, plan: TimelineStep[], chargeIndex: number, fastIndex: number) {
  const gain = Math.max(0, self.fast.energyGain);
  let gauge = Math.min(100, self.energy + gain);
  for (let index = chargeIndex; index < plan.length; index += 1) {
    if (index === fastIndex) continue;
    const step = plan[index];
    if (!step || step.kind === "wait" || step.kind === "switch") continue;
    if (step.kind === "fast") {
      gauge = Math.min(100, gauge + gain);
      continue;
    }
    const cost = chargeCost(self, step.moveId);
    if (cost == null || gauge < cost) return false;
    gauge = Math.max(0, gauge - cost);
  }
  return true;
}

function spareFastAfter(self: FighterState, chargeIndex: number) {
  const plan = self.timelinePlan;
  if (!plan) return -1;
  for (let index = plan.length - 1; index > chargeIndex; index -= 1) {
    if (plan[index]?.kind !== "fast") continue;
    if (canSlideFastBefore(self, plan, chargeIndex, index)) return index;
  }
  return -1;
}

function snapshot(a: FighterState, b: FighterState) {
  return {
    hpA: Math.max(0, a.hp),
    hpB: Math.max(0, b.hp),
    energyA: a.energy,
    energyB: b.energy,
  };
}

function damageOf(self: FighterState, other: FighterState, move: PvpMove) {
  if (self.aegis === "shield" && move.kind === "fast") return 1;
  const attack = move.kind === "charged" && self.aegis === "shield" ? self.aegisBladeAttack : self.attack;
  const moveType = isAuraWheel(move) && self.speciesId === 877 ? auraWheelType(self.firedSpecials) : move.type;
  return damageForMove(
    { ...move, type: moveType },
    attack,
    other.defense,
    self.types,
    other.types,
    self.shadow,
    other.shadow,
    self.attackStage,
    other.defenseStage,
  );
}

function pickCharged(self: FighterState, other: FighterState) {
  if (self.chargedQueue) {
    const queue = self.chargedQueue;
    while (self.queueCursor < queue.length && queue[self.queueCursor] == null) {
      const rest = queue.slice(self.queueCursor);
      if (rest.every((slot) => slot == null)) return null;
      self.queueCursor += 1;
    }
    if (self.queueCursor >= queue.length) return null;
    const chosen = self.charged.find((move) => move.id === queue[self.queueCursor]) ?? null;
    if (!chosen || self.energy < chosen.energy) return null;
    return chosen;
  }
  return greedyCharged(self, other);
}

function greedyCharged(self: FighterState, other: FighterState) {
  const ready = self.charged.filter((move) => self.energy >= move.energy);
  if (!ready.length) return null;

  const koUnshielded = ready.find((move) => damageOf(self, other, move) >= other.hp && other.shieldsLeft === 0);
  if (koUnshielded) return koUnshielded;

  const bait = self.charged[1];
  if (other.shieldsLeft > 0 && bait && self.energy >= bait.energy) return bait;
  return ready[0];
}

function turnsLeftAfterFarms(currentLeft: number, oppTurns: number, myTurns: number, farms: number) {
  let left = Math.max(1, currentLeft);
  let time = farms * myTurns;
  while (time > 0) {
    const step = Math.min(left, time);
    time -= step;
    left -= step;
    if (left <= 0) left = Math.max(1, oppTurns);
  }
  return left;
}

/** 3ターン以上のノーマルアタックは、追加で通す回数を0～2に限り、理想のタイミングに一番近い回数を選ぶ。 */
function farmTarget(self: FighterState, other: FighterState) {
  const ideal = cctTurnsLeft(self.fast.turns, other.fast.turns);
  const currentLeft = other.action?.kind === "fast" ? other.action.turnsLeft : other.fast.turns;
  let bestK = 0;
  let bestLoss = Number.POSITIVE_INFINITY;
  for (let farms = 0; farms <= 2; farms += 1) {
    const left = turnsLeftAfterFarms(currentLeft, other.fast.turns, self.fast.turns, farms);
    const loss = ideal == null ? farms : Math.abs(left - ideal);
    if (loss < bestLoss || (loss === bestLoss && farms < bestK)) {
      bestLoss = loss;
      bestK = farms;
    }
  }
  return bestK;
}

function shouldThrow(self: FighterState, other: FighterState, move: PvpMove) {
  if (other.shieldsLeft === 0 && damageOf(self, other, move) >= other.hp) return true;
  if (self.timing === "asap") return true;
  // 相手が5ターンのときは、0～2回の近似を使わず、残りターンが合うまで待つ。
  if (self.fast.turns >= 3 && other.fast.turns < 5) return self.farmed >= farmTarget(self, other);

  const needed = other.fast.turns >= 5
    ? extendedCctTurnsLeft(self.fast.turns, other.fast.turns)
    : cctTurnsLeft(self.fast.turns, other.fast.turns);
  if (needed == null) return true;
  if (other.action?.kind === "fast" && other.action.turnsLeft === needed) return true;
  return false;
}

/** 今の残りHPを、シールドと化けの皮を考慮して倒し切れるスペシャル。 */
function lethalMoveIds(self: FighterState, other: FighterState) {
  const ids = new Set<string>();
  if (self.hp <= 0 || other.hp <= 0) return ids;
  for (const move of self.charged) {
    if (move.energy <= 0 || self.energy < move.energy) continue;
    const raw = damageOf(self, other, move);
    const damage = other.shieldsLeft > 0 || other.disguiseReady ? 1 : raw;
    if (damage >= other.hp) ids.add(move.id);
  }
  return ids;
}

function wantsShield(defender: FighterState) {
  if (!defender.shieldThrows) return defender.shieldsLeft > 0;
  return defender.shieldsLeft > 0 && defender.shieldThrows.includes(defender.received);
}

function applyBuffs(self: FighterState, other: FighterState, move: PvpMove, forceChance: boolean) {
  if (!move.buffs) return;
  const chance = move.buffChance ?? 1;
  if (chance < 1 && !forceChance) return;

  const [atk, def] = move.buffs;
  const target = move.buffTarget ?? "self";
  const apply = (fighter: FighterState) => {
    fighter.attackStage = clampStage(fighter.attackStage + atk);
    fighter.defenseStage = clampStage(fighter.defenseStage + def);
  };

  if (target === "self" || target === "both") apply(self);
  if (target === "opponent" || target === "both") apply(other);
}

/** 同時発動の順番は攻撃の実数値だけ。シャドウの1.2倍はダメージ計算にだけ使う。 */
function cmpAttack(fighter: FighterState) {
  if (fighter.aegis === "shield" && fighter.action?.kind === "charged") return fighter.aegisBladeAttack;
  return fighter.attack;
}

function clearTraits(fighter: FighterState) {
  fighter.speciesId = 0;
  fighter.formName = "";
  fighter.firedSpecials = 0;
  fighter.aegis = null;
  fighter.aegisBladeAttack = 0;
  fighter.aegisBladeDefense = 0;
  fighter.aegisShieldAttack = fighter.attack;
  fighter.aegisShieldDefense = fighter.defense;
  fighter.aegisBladeFast = null;
  fighter.disguiseReady = false;
  fighter.gulp = null;
  fighter.minior = null;
  fighter.miniorCoreAttack = fighter.attack;
  fighter.miniorCoreDefense = fighter.defense;
  fighter.miniorMeteorAttack = fighter.attack;
  fighter.miniorMeteorDefense = fighter.defense;
}

function initTraits(fighter: FighterState, input: FighterInput, mimicBusted: boolean) {
  clearTraits(fighter);
  fighter.speciesId = input.speciesId ?? 0;
  fighter.formName = input.form ?? "";
  fighter.maxHp = Math.max(0, input.hp);
  if (fighter.speciesId === 778) fighter.disguiseReady = !mimicBusted;
  if (fighter.speciesId === 681 && fighter.formName === "Shield" && input.aegislash) {
    fighter.aegis = "shield";
    fighter.aegisShieldAttack = input.attack;
    fighter.aegisShieldDefense = input.defense;
    fighter.aegisBladeAttack = input.aegislash.bladeAttack;
    fighter.aegisBladeDefense = input.aegislash.bladeDefense;
    fighter.aegisBladeFast = input.aegislash.bladeFast;
    fighter.fast = AEGIS_CHARGE_MOVE;
  }
  if (fighter.speciesId === 774 && (input.miniorMeteor || input.miniorCore)) {
    const meteorAttack = input.miniorMeteor?.attack ?? input.attack;
    const meteorDefense = input.miniorMeteor?.defense ?? input.defense;
    const coreAttack = input.miniorCore?.attack ?? input.attack;
    const coreDefense = input.miniorCore?.defense ?? input.defense;
    fighter.miniorCoreAttack = coreAttack;
    fighter.miniorCoreDefense = coreDefense;
    fighter.miniorMeteorAttack = meteorAttack;
    fighter.miniorMeteorDefense = meteorDefense;
    if (!belowHalf(fighter.hp, fighter.maxHp)) {
      fighter.minior = "meteor";
      fighter.attack = meteorAttack;
      fighter.defense = meteorDefense;
    } else {
      fighter.minior = "core";
      fighter.attack = coreAttack;
      fighter.defense = coreDefense;
    }
  }
}

function enterBlade(fighter: FighterState) {
  fighter.aegis = "blade";
  fighter.attack = fighter.aegisBladeAttack;
  fighter.defense = fighter.aegisBladeDefense;
  if (fighter.aegisBladeFast) fighter.fast = fighter.aegisBladeFast;
}

function enterShield(fighter: FighterState) {
  fighter.aegis = "shield";
  fighter.attack = fighter.aegisShieldAttack;
  fighter.defense = fighter.aegisShieldDefense;
  fighter.fast = AEGIS_CHARGE_MOVE;
}

function chargeOrder(fighters: FighterState[]) {
  return [...fighters].sort((left, right) => {
    const diff = cmpAttack(right) - cmpAttack(left);
    if (diff !== 0) return diff;
    return Math.random() < 0.5 ? -1 : 1;
  });
}

function applySwitch(fighter: FighterState, next: SwitchPlan["next"], mimicBusted: boolean) {
  const shieldsLeft = fighter.shieldsLeft;
  const id = fighter.id;
  const timing = fighter.timing;
  const applyChanceBuffs = fighter.applyChanceBuffs;
  const shields = fighter.shields;
  Object.assign(fighter, {
    ...next,
    id,
    shields,
    shieldsLeft,
    timing,
    applyChanceBuffs,
    switchPlan: null,
    energy: 0,
    attackStage: 0,
    defenseStage: 0,
    action: null,
    hp: next.hp,
    farmed: 0,
    thrown: 0,
    received: 0,
  });
  initTraits(
    fighter,
    {
      label: next.label,
      attack: next.attack,
      defense: next.defense,
      hp: next.hp,
      types: next.types,
      shadow: next.shadow,
      fast: next.fast,
      charged: next.charged,
      shields,
      timing,
      applyChanceBuffs,
      speciesId: next.speciesId,
      form: next.form,
      aegislash: next.aegislash,
      miniorMeteor: next.miniorMeteor,
      miniorCore: next.miniorCore,
    },
    mimicBusted,
  );
  if (fighter.speciesId === 778 && mimicBusted) fighter.defenseStage = -1;
}

function rememberLead(fighter: FighterState) {
  if (fighter.switched) return;
  fighter.leadHp = Math.max(0, fighter.hp);
  fighter.leadEnergy = fighter.energy;
  fighter.leadMaxHp = fighter.maxHp;
}

function applyFollowSwitch(fighter: FighterState) {
  const next = fighter.follow?.next;
  if (!next || fighter.switched) return;
  rememberLead(fighter);
  const shieldsLeft = fighter.shieldsLeft;
  const received = fighter.received;
  const thrown = fighter.thrown;
  const throwTweaks = fighter.throwTweaks;
  const shieldThrows = fighter.shieldThrows;
  const shields = fighter.shields;
  const id = fighter.id;
  Object.assign(fighter, {
    ...next,
    id,
    shields,
    shieldsLeft,
    shieldThrows,
    throwTweaks,
    thrown,
    received,
    follow: fighter.follow,
    switchPlan: null,
    energy: clampEnergy(next.startEnergy ?? 0),
    attackStage: clampStage(next.startAttackStage ?? 0),
    defenseStage: clampStage(next.startDefenseStage ?? 0),
    action: null,
    hp: clampStartHp(next.startHp, next.hp),
    farmed: 0,
    planIndex: 0,
    queueCursor: 0,
    timelinePlan: next.timelinePlan ?? null,
    chargedQueue: next.chargedQueue ?? null,
    timing: next.timing,
    applyChanceBuffs: next.applyChanceBuffs,
    scriptCct: false,
    planDetached: false,
  });
  initTraits(
    fighter,
    {
      label: next.label,
      attack: next.attack,
      defense: next.defense,
      hp: next.hp,
      types: next.types,
      shadow: next.shadow,
      fast: next.fast,
      charged: next.charged,
      shields,
      timing: next.timing,
      applyChanceBuffs: next.applyChanceBuffs,
      speciesId: next.speciesId,
      form: next.form,
      aegislash: next.aegislash,
      miniorMeteor: next.miniorMeteor,
      miniorCore: next.miniorCore,
    },
    false,
  );
  fighter.attackStage = clampStage(next.startAttackStage ?? 0);
  fighter.defenseStage = clampStage(next.startDefenseStage ?? 0);
  fighter.hp = clampStartHp(next.startHp, fighter.maxHp);
  fighter.switched = true;
  fighter.backEntered = true;
  fighter.activeMon = "back";
  fighter.faintSwitchTurn = 0;
}

function createFighter(id: FighterId, input: FighterInput): FighterState {
  const maxHp = Math.max(0, input.hp);
  const fighter: FighterState = {
    ...input,
    id,
    hp: clampStartHp(input.startHp, maxHp),
    energy: clampEnergy(input.startEnergy ?? 0),
    shieldsLeft: input.shields,
    attackStage: clampStage(input.startAttackStage ?? 0),
    defenseStage: clampStage(input.startDefenseStage ?? 0),
    action: null,
    planIndex: 0,
    farmed: 0,
    thrown: 0,
    queueCursor: 0,
    received: 0,
    switched: false,
    backEntered: false,
    faintSwitchTurn: 0,
    entryLock: 0,
    leadHp: clampStartHp(input.startHp, maxHp),
    leadEnergy: clampEnergy(input.startEnergy ?? 0),
    leadMaxHp: maxHp,
    activeMon: "lead",
    speciesId: 0,
    formName: "",
    maxHp,
    firedSpecials: 0,
    aegis: null,
    aegisBladeAttack: 0,
    aegisBladeDefense: 0,
    aegisShieldAttack: input.attack,
    aegisShieldDefense: input.defense,
    aegisBladeFast: null,
    disguiseReady: false,
    gulp: null,
    minior: null,
    miniorCoreAttack: input.attack,
    miniorCoreDefense: input.defense,
    miniorMeteorAttack: input.attack,
    miniorMeteorDefense: input.defense,
  };
  initTraits(fighter, input, false);
  return fighter;
}

export function simulateBattle(inputA: FighterInput, inputB: FighterInput): SimResult {
  const plansA = inputA.shieldThrows ? null : shieldPlanOptions(inputA.shields);
  const plansB = inputB.shieldThrows ? null : shieldPlanOptions(inputB.shields);
  if (plansA || plansB) {
    const listA = plansA ?? [inputA.shieldThrows ?? []];
    const listB = plansB ?? [inputB.shieldThrows ?? []];
    const tie = tieContext(inputA, inputB);
    // 後追いだけ、指定枚数を実際に使えるならその中から選ぶ。通常は評価が先。
    const chaseShields = Boolean(inputA.follow || inputB.follow);
    let bestForA: SimResult | null = null;
    for (const planA of listA) {
      let bestForB: SimResult | null = null;
      for (const planB of listB) {
        const result = simulateMoves(
          { ...inputA, shieldThrows: planA },
          { ...inputB, shieldThrows: planB },
        );
        if (!bestForB || preferChaseShield(result, bestForB, "b", inputB.shields, chaseShields, tie, preferDefender)) {
          bestForB = result;
        }
      }
      if (
        bestForB &&
        (!bestForA || preferChaseShield(bestForB, bestForA, "a", inputA.shields, chaseShields, tie, preferAttacker))
      ) {
        bestForA = bestForB;
      }
    }
    return bestForA ?? simulateMoves(inputA, inputB);
  }
  return simulateMoves(inputA, inputB);
}

/** 後追いは、指定枚数を使えた候補を評価より先に残す。使えなければ通常の順位に戻る。 */
function preferChaseShield(
  next: SimResult,
  current: SimResult,
  actor: FighterId,
  shields: number,
  chaseShields: boolean,
  tie: TieContext,
  prefer: (next: SimResult, current: SimResult, tie: TieContext) => boolean,
) {
  if (chaseShields) {
    const nextFull = shieldsSpent(next.timeline, actor) === shields;
    const currentFull = shieldsSpent(current.timeline, actor) === shields;
    if (nextFull !== currentFull) return nextFull;
  }
  return prefer(next, current, tie);
}

function shieldPlanOptions(count: number) {
  const use = Math.max(0, Math.min(2, Math.floor(count)));
  if (use === 0) return null;
  const horizon = 4;
  const plans: number[][] = [];
  const walk = (start: number, left: number, acc: number[]) => {
    if (left === 0) {
      plans.push([...acc]);
      return;
    }
    for (let index = start; index < horizon; index += 1) {
      acc.push(index);
      walk(index + 1, left - 1, acc);
      acc.pop();
    }
  };
  walk(0, use, []);
  return plans;
}

type TieSide = { shields: number; bestMoves: Set<string>; mon?: "lead" | "back" };

type TieContext = { a: TieSide; b: TieSide };

/** タイプ一致と相性を含めた威力を、消費ゲージで割る。 */
function chargedDpe(move: PvpMove, attackerTypes: string[], defenderTypes: string[]) {
  if (move.energy <= 0) return 0;
  const power = move.power * stabMultiplier(move.type, attackerTypes) * typeEffectiveness(move.type, defenderTypes);
  return power / move.energy;
}

function bestChargedMoves(input: FighterInput, defenderTypes: string[]) {
  const follow = input.follow?.next;
  // 後追いは引き先の技だけでDPEを比べる。初手の技は同点判定に入れない。
  const groups = follow
    ? [{ moves: follow.charged, types: follow.types }]
    : [{ moves: input.charged, types: input.types }];
  const planned = input.switchPlan?.next;
  if (planned && !follow) groups.push({ moves: planned.charged, types: planned.types });
  let best = Number.NEGATIVE_INFINITY;
  const ids: string[] = [];
  for (const group of groups) {
    for (const move of group.moves) {
      const dpe = chargedDpe(move, group.types, defenderTypes);
      if (dpe > best + 1e-9) {
        best = dpe;
        ids.length = 0;
        ids.push(move.id);
      } else if (Math.abs(dpe - best) <= 1e-9 && !ids.includes(move.id)) ids.push(move.id);
    }
  }
  return new Set(ids);
}

function tieContext(inputA: FighterInput, inputB: FighterInput): TieContext {
  return {
    a: {
      shields: inputA.shields,
      bestMoves: bestChargedMoves(inputA, inputB.types),
      mon: inputA.follow ? "back" : undefined,
    },
    b: {
      shields: inputB.shields,
      bestMoves: bestChargedMoves(inputB, inputA.types),
      mon: inputB.follow ? "back" : undefined,
    },
  };
}

/** 指定した枚数を、実際に使った側を数える。 */
function shieldFidelity(result: SimResult, tie: TieContext) {
  const usedA = shieldsSpent(result.timeline, "a") === tie.a.shields ? 1 : 0;
  const usedB = shieldsSpent(result.timeline, "b") === tie.b.shields ? 1 : 0;
  return usedA + usedB;
}

function bestMoveThrows(result: SimResult, actor: FighterId, side: TieSide) {
  if (!side.bestMoves.size) return 0;
  const seen = new Set<number>();
  let count = 0;
  for (const event of result.timeline) {
    if (event.actor !== actor || event.kind !== "charged" || !side.bestMoves.has(event.moveId) || seen.has(event.actionId)) continue;
    if (side.mon && event.mon !== side.mon) continue;
    seen.add(event.actionId);
    count += 1;
  }
  return count;
}

/**
 * 評価が違うときは評価だけを見る。
 * 同じ評価のときは、指定枚数のシールドを使った方、DPEが一番高い技を多く撃った方、残りゲージの順。
 */
function preferAttacker(next: SimResult, current: SimResult, tie: TieContext) {
  if (next.rating !== current.rating) return next.rating > current.rating;
  const shields = shieldFidelity(next, tie) - shieldFidelity(current, tie);
  if (shields !== 0) return shields > 0;
  const moves = bestMoveThrows(next, "a", tie.a) - bestMoveThrows(current, "a", tie.a);
  if (moves !== 0) return moves > 0;
  if (next.energyA !== current.energyA) return next.energyA > current.energyA;
  return next.energyB > current.energyB;
}

/** 評価が違うときは、相手が自分の評価を下げる方だけを見る。同点の順位は preferAttacker と同じ。 */
function preferDefender(next: SimResult, current: SimResult, tie: TieContext) {
  if (next.rating !== current.rating) return next.rating < current.rating;
  const shields = shieldFidelity(next, tie) - shieldFidelity(current, tie);
  if (shields !== 0) return shields > 0;
  const moves = bestMoveThrows(next, "b", tie.b) - bestMoveThrows(current, "b", tie.b);
  if (moves !== 0) return moves > 0;
  if (next.energyB !== current.energyB) return next.energyB > current.energyB;
  return next.energyA > current.energyA;
}

/**
 * 最適側だけ、今の相手条件で技を1種類に決める。
 * タイムライン手順、技選択のカスタム順、候補が1つ以下の側は入力のまま固定する。
 * 片方のカスタムは、もう片方の最適探索を止めない。
 */
function moveChoices(input: FighterInput): FighterInput[] {
  const lead =
    input.timelinePlan || input.chargedQueue || input.charged.length <= 1
      ? [input]
      : input.charged.map((move) => ({ ...input, charged: [move], chargedQueue: null }));
  const expanded: FighterInput[] = [];
  for (const item of lead) {
    const next = item.follow?.next;
    if (!item.follow || !next || next.timelinePlan || next.chargedQueue || next.charged.length <= 1) {
      expanded.push(item);
      continue;
    }
    for (const move of next.charged) {
      expanded.push({ ...item, follow: { ...item.follow, next: { ...next, charged: [move], chargedQueue: null } } });
    }
  }
  return expanded;
}

function simulateMoves(inputA: FighterInput, inputB: FighterInput): SimResult {
  const optionsA = moveChoices(inputA);
  const optionsB = moveChoices(inputB);
  if (optionsA.length === 1 && optionsB.length === 1) return simulateLocked(optionsA[0], optionsB[0]);

  const tie = tieContext(inputA, inputB);
  let bestForA: SimResult | null = null;
  for (const nextA of optionsA) {
    let bestForB: SimResult | null = null;
    for (const nextB of optionsB) {
      const result = simulateLocked(nextA, nextB);
      if (!bestForB || preferDefender(result, bestForB, tie)) bestForB = result;
    }
    if (bestForB && (!bestForA || preferAttacker(bestForB, bestForA, tie))) bestForA = bestForB;
  }
  return bestForA ?? simulateLocked(inputA, inputB);
}

function simulateLocked(inputA: FighterInput, inputB: FighterInput): SimResult {
  const a = createFighter("a", inputA);
  const b = createFighter("b", inputB);
  const maxHpB = inputB.hp;
  const timeline: TimelineEvent[] = [];
  const koMissA = new Set<number>();
  const koMissB = new Set<number>();
  let bankedKo: { turn: number; a: Set<string>; b: Set<string> } | null = null;
  let nextActionId = 1;
  let mimikyuBusted = false;

  const conclude = (turn: number, timedOut = false): SimResult => {
    const bench = a.follow?.next ?? null;
    const bothDown = a.hp <= 0 && b.hp <= 0;
    const benchSaves = Boolean(bench && !a.switched && bothDown && !timedOut);
    if (!a.switched) rememberLead(a);
    const backMax = Math.max(1, bench?.hp ?? a.leadMaxHp);
    const backHp = a.backEntered ? Math.max(0, a.hp) : clampStartHp(bench?.startHp, bench?.hp ?? 0);
    const backEnergy = a.backEntered ? a.energy : clampEnergy(bench?.startEnergy ?? 0);
    const winner: FighterId | "draw" = timedOut
      ? "draw"
      : benchSaves
        ? "a"
        : a.hp <= 0 && b.hp <= 0
          ? "draw"
          : a.hp > 0
            ? "a"
            : "b";
    const earlyWin = Boolean(a.follow && !a.switched && !benchSaves && winner === "a" && b.hp <= 0 && a.leadHp > 0);
    const active = earlyWin ? "lead" : a.switched || benchSaves ? "back" : "lead";
    const selfHp = active === "back" ? backHp : Math.max(0, a.switched ? a.leadHp : a.hp);
    const selfMax = Math.max(1, active === "back" ? backMax : a.leadMaxHp);
    const rating =
      winner === "draw"
        ? 100
        : winner === "a"
          ? 100 + Math.round((100 * selfHp) / selfMax)
          : 100 - Math.round((100 * Math.max(0, b.hp)) / Math.max(1, maxHpB));
    return {
      winner,
      turns: turn,
      hpA: active === "back" ? backHp : Math.max(0, a.hp),
      hpB: Math.max(0, b.hp),
      maxHpA: active === "back" ? backMax : a.leadMaxHp,
      maxHpB,
      energyA: active === "back" ? backEnergy : a.energy,
      energyB: b.energy,
      rating,
      timeline,
      shieldsLeftA: a.shieldsLeft,
      shieldsLeftB: b.shieldsLeft,
      koMissA: [...koMissA],
      koMissB: [...koMissB],
      follow: a.follow
        ? {
            active,
            earlyWin,
            switched: a.switched,
            backEntered: a.backEntered,
            leadHp: Math.max(0, a.leadHp),
            leadMaxHp: a.leadMaxHp,
            leadEnergy: a.leadEnergy,
            backHp,
            backMaxHp: backMax,
            backEnergy,
          }
        : null,
    };
  };

  for (let turn = 1; turn <= 480; turn += 1) {
    const leadSwitchNotes: FighterId[] = [];
    let faintEntered: FighterId | null = null;
    if (a.faintSwitchTurn === turn && !a.switched) {
      applyFollowSwitch(a);
      faintEntered = "a";
      a.entryLock = turn;
      a.action = null;
      b.action = null;
    }
    for (const [self, other] of [
      [a, b],
      [b, a],
    ] as const) {
      if (self.hp <= 0 || self.entryLock === turn) continue;
      const scriptedSwitchNow = Boolean(
        self.follow && !self.switched && self.follow.switchTurn === turn && self.faintSwitchTurn === 0,
      );
      if (self.switchPlan?.turn === turn || scriptedSwitchNow) {
        self.action = null;
        continue;
      }
      if (self.action) continue;
      const holdForSwitch = Boolean(self.follow && !self.switched && turn < self.follow.switchTurn);
      if (self.timelinePlan && self.planIndex < self.timelinePlan.length) {
        const step = self.timelinePlan[self.planIndex];
        if (self.scriptCct && !self.switched && self.timing === "cct" && step?.kind === "charged") {
          const ready = self.charged.find((item) => item.id === step.moveId);
          if (ready && self.energy >= ready.energy && !leadScriptThrowNow(self, other, ready)) {
            const fastAt = spareFastAfter(self, self.planIndex);
            if (fastAt >= 0 && self.timelinePlan) {
              if (!self.planDetached) {
                self.timelinePlan = self.timelinePlan.slice();
                self.planDetached = true;
              }
              self.timelinePlan.splice(fastAt, 1);
              self.farmed += 1;
              const sneakTurns = Math.max(1, self.fast.turns);
              self.action = {
                kind: "fast",
                move: self.fast,
                turnsLeft: sneakTurns,
                totalTurns: sneakTurns,
                id: nextActionId++,
                startTurn: turn,
                cct: true,
                scripted: true,
              };
              continue;
            }
          }
        }
        self.planIndex += 1;
        if (step?.kind === "charged") {
          const move = self.charged.find((item) => item.id === step.moveId);
          if (move && self.energy >= move.energy) {
            self.farmed = 0;
            self.action = {
              kind: "charged",
              move,
              turnsLeft: 1,
              totalTurns: 1,
              id: nextActionId++,
              startTurn: turn,
              cct: false,
              scripted: true,
            };
          }
        } else if (step?.kind === "fast") {
          const turns = stepDuration(step, Math.max(1, self.fast.turns));
          self.action = {
            kind: "fast",
            move: self.fast,
            turnsLeft: turns,
            totalTurns: turns,
            id: nextActionId++,
            startTurn: turn,
            cct: false,
            scripted: true,
          };
        } else if (step?.kind === "wait" && step.show === "交代") {
          leadSwitchNotes.push(self.id);
        }
        continue;
      }
      if (holdForSwitch) continue;
      const charged = pickCharged(self, other);
      if (charged && shouldThrow(self, other, charged)) {
        self.farmed = 0;
        self.action = {
          kind: "charged",
          move: charged,
          turnsLeft: 1,
          totalTurns: 1,
          id: nextActionId++,
          startTurn: turn,
          cct: false,
          scripted: false,
        };
      } else {
        if (charged) self.farmed += 1;
        else self.farmed = 0;
        const turns = Math.max(1, self.fast.turns);
        self.action = {
          kind: "fast",
          move: self.fast,
          turnsLeft: turns,
          totalTurns: turns,
          id: nextActionId++,
          startTurn: turn,
          cct: Boolean(charged),
          scripted: false,
        };
      }
    }

    const occupied = [a, b].map((fighter) => ({ fighter, action: fighter.action }));
    const dealt: Record<FighterId, { damage: number; shielded: boolean; throwIndex: number | null; disguise: boolean }> = {
      a: { damage: 0, shielded: false, throwIndex: null, disguise: false },
      b: { damage: 0, shielded: false, throwIndex: null, disguise: false },
    };
    const moveLine: Record<FighterId, number> = { a: 0, b: 0 };
    const shownType: Record<FighterId, string> = { a: "", b: "" };
    const notes: {
      actor: FighterId;
      line: number;
      name: string;
      damage: number;
      chargeLine: boolean;
      spriteId?: number;
      spriteForm?: string;
    }[] = [];
    for (const actor of leadSwitchNotes) {
      notes.push({ actor, line: 0, name: "交代", damage: 0, chargeLine: false });
    }
    const shellBroke = new Set<FighterId>();
    const markShell = (defender: FighterState) => {
      if (defender.minior === "meteor" && defender.hp > 0 && belowHalf(defender.hp, defender.maxHp)) {
        shellBroke.add(defender.id);
      }
    };

    // 1. 交代。1ターンを使い、出てきたポケモンはこのターン技を出さない。
    for (const fighter of [a, b]) {
      if (fighter.follow && !fighter.switched && fighter.hp > 0 && fighter.follow.switchTurn === turn) {
        applyFollowSwitch(fighter);
        notes.push({ actor: fighter.id, line: 0, name: "交代", damage: 0, chargeLine: false });
        continue;
      }
      if (fighter.hp <= 0 || fighter.switchPlan?.turn !== turn) continue;
      applySwitch(fighter, fighter.switchPlan.next, mimikyuBusted);
    }
    if (faintEntered) {
      notes.push({ actor: faintEntered, line: 0, name: "交代", damage: 0, chargeLine: false });
    }

    // 2. スペシャルアタック。攻撃の実数値が高い順。シャドウは入れない。同値ならランダム。1発ごとに戦闘不能を見る。
    const chargers = chargeOrder([a, b].filter((fighter) => fighter.action?.kind === "charged" && fighter.hp > 0));
    const resolved = new Set<number>();
    const threwCharged = new Set<FighterId>();
    let faintedFromSpecial = false;
    let specialLanded = false;
    for (const self of chargers) {
      const other = self.id === "a" ? b : a;
      const action = self.action;
      if (action && shellBroke.has(self.id) && self.minior === "meteor") {
        self.action = null;
        continue;
      }
      if (!action || self.hp <= 0 || other.hp <= 0) {
        self.action = null;
        continue;
      }
      if (self.aegis === "shield") {
        enterBlade(self);
        notes.push({ actor: self.id, line: 0, name: "フォルムチェンジ", damage: 0, chargeLine: false });
        moveLine[self.id] = 1;
      }
      self.energy = Math.max(0, self.energy - action.move.energy);
      const throwIndex = self.thrown;
      const tweak = resolveThrowTweak(self.throwTweaks?.[throwIndex] ?? null, action.move);
      self.thrown += 1;
      if (self.chargedQueue) self.queueCursor += 1;
      if (isAuraWheel(action.move) && self.speciesId === 877) shownType[self.id] = auraWheelType(self.firedSpecials);
      let damage = 0;
      let shielded = false;
      let disguise = false;
      if (wantsShield(other)) {
        other.shieldsLeft -= 1;
        damage = 1;
        shielded = true;
        if (other.aegis === "blade") enterShield(other);
      } else if (other.disguiseReady) {
        damage = 1;
        disguise = true;
        other.disguiseReady = false;
        mimikyuBusted = true;
        other.defenseStage = clampStage(other.defenseStage - 1);
      } else {
        damage = damageOf(self, other, action.move);
        if (tweak) {
          const percent = Math.max(25, Math.min(100, Math.round(tweak.damagePercent)));
          damage = Math.max(1, Math.round((damage * percent) / 100));
        }
      }
      other.received += 1;
      other.hp -= damage;
      if (tweak) {
        if (tweak.buff) applyBuffs(self, other, action.move, true);
      } else {
        applyBuffs(self, other, action.move, self.applyChanceBuffs);
      }
      const noteLine = (actor: FighterId, preferred: number) => {
        let line = preferred;
        while (notes.some((note) => note.actor === actor && note.line === line)) line += 1;
        return line;
      };
      if (self.speciesId === 845 && isGulpLoader(action.move) && !self.gulp) {
        self.gulp = gulpCatch(self.hp, self.maxHp);
        notes.push({
          actor: self.id,
          line: noteLine(self.id, 1),
          name: "うのミサイル装填",
          damage: 0,
          chargeLine: false,
          ...gulpSprite(self.gulp),
        });
      }
      if (other.speciesId === 845 && other.gulp && !shielded) {
        const caught = other.gulp;
        const missile = gulpDamage(self.maxHp);
        self.hp -= missile;
        if (caught === "arrokuda") self.defenseStage = clampStage(self.defenseStage - 1);
        else self.attackStage = clampStage(self.attackStage - 2);
        other.gulp = null;
        notes.push({
          actor: other.id,
          line: 0,
          name: "うのミサイル",
          damage: missile,
          chargeLine: false,
          ...gulpSprite(caught),
        });
      }
      self.firedSpecials += 1;
      markShell(other);
      dealt[self.id] = { damage, shielded, throwIndex, disguise };
      resolved.add(action.id);
      threwCharged.add(self.id);
      self.action = null;
      specialLanded = true;
      if (a.hp <= 0 || b.hp <= 0) {
        faintedFromSpecial = true;
        break;
      }
    }

    if (shellBroke.size) specialLanded = true;

    // 3. スペシャルで戦闘不能なら、残りのノーマルアタックはダメージもチャージも無しで打ち切る。
    if (faintedFromSpecial) {
      for (const fighter of [a, b]) {
        if (fighter.action) fighter.action = null;
      }
    } else {
      // 4. 最終ターンのノーマルアタックだけ、ダメージとチャージを入れる。
      //    このターンにスペシャルがあった技は、最終ターンまで進めてから処理する。
      const strikeFast = (self: FighterState) => {
        const other = self.id === "a" ? b : a;
        const action = self.action;
        if (!action) return;
        self.energy = Math.min(100, self.energy + action.move.energyGain);
        const damage = other.hp > 0 ? damageOf(self, other, action.move) : 0;
        if (other.hp > 0) other.hp -= damage;
        dealt[self.id] = { damage, shielded: false, throwIndex: null, disguise: false };
        self.action = null;
        markShell(other);
      };
      const finishing: FighterState[] = [];
      for (const fighter of [a, b]) {
        if (fighter.action?.kind !== "fast" || fighter.hp <= 0) continue;
        fighter.action.turnsLeft -= 1;
        if (specialLanded && fighter.action.turnsLeft > 0) {
          const discarded = fighter.action.turnsLeft;
          fighter.action.turnsLeft = 0;
          // 手順上の長さで決めた交代は、打ち切って捨てたターンの分だけ前にずらす。
          const follow = fighter.follow;
          if (fighter.action.scripted && follow && !fighter.switched && follow.switchTurn > turn) {
            fighter.follow = { ...follow, switchTurn: Math.max(turn + 1, follow.switchTurn - discarded) };
          }
        }
        if (fighter.action.turnsLeft <= 0) finishing.push(fighter);
      }
      for (const self of finishing) strikeFast(self);
      if (shellBroke.size) {
        for (const fighter of [a, b]) {
          if (fighter.action?.kind === "fast") strikeFast(fighter);
        }
      }
    }

    for (const fighter of [a, b]) {
      if (!shellBroke.has(fighter.id) || fighter.minior !== "meteor") continue;
      fighter.minior = "core";
      fighter.attack = fighter.miniorCoreAttack;
      fighter.defense = fighter.miniorCoreDefense;
      notes.push({ actor: fighter.id, line: 1, name: "フォルムチェンジ", damage: 0, chargeLine: true });
    }

    const snap = snapshot(a, b);
    for (const { fighter, action } of occupied) {
      if (!action) continue;
      if (action.kind === "charged" && !resolved.has(action.id)) continue;
      timeline.push({
        turn,
        actor: fighter.id,
        kind: action.kind,
        moveName: action.move.name,
        moveType: shownType[fighter.id] || action.move.type,
        damage: dealt[fighter.id].damage,
        shielded: dealt[fighter.id].shielded,
        actionId: action.id,
        cct: action.cct,
        throwIndex: action.kind === "charged" ? dealt[fighter.id].throwIndex : null,
        moveId: action.move.id,
        scripted: action.scripted,
        line: moveLine[fighter.id],
        disguise: action.kind === "charged" ? dealt[fighter.id].disguise : false,
        mon: fighter.id === "a" ? fighter.activeMon : undefined,
        ...snap,
      });
    }
    for (const note of notes) {
      timeline.push({
        turn,
        actor: note.actor,
        kind: "note",
        moveName: note.name,
        moveType: "",
        damage: note.damage,
        shielded: false,
        actionId: nextActionId++,
        cct: false,
        throwIndex: null,
        moveId: "",
        scripted: false,
        line: note.line,
        chargeLine: note.chargeLine,
        spriteId: note.spriteId,
        spriteForm: note.spriteForm,
        mon: note.actor === "a" ? a.activeMon : undefined,
        ...snap,
      });
    }

    // 自分のスペシャルの直後に予定されていた交代は、そのターンの最後に付け、次のターンを使わない。
    for (const fighter of [a, b]) {
      if (!threwCharged.has(fighter.id) || fighter.hp <= 0 || fighter.switched) continue;
      const follow = fighter.follow;
      if (!follow || follow.switchTurn !== turn + 1 || fighter.faintSwitchTurn !== 0) continue;
      const other = fighter.id === "a" ? b : a;
      if (other.hp <= 0) continue;
      applyFollowSwitch(fighter);
      const after = snapshot(a, b);
      let line = 1;
      while (timeline.some((event) => event.turn === turn && event.actor === fighter.id && (event.line ?? 0) === line)) line += 1;
      timeline.push({
        turn,
        actor: fighter.id,
        kind: "note",
        moveName: "交代",
        moveType: "",
        damage: 0,
        shielded: false,
        actionId: nextActionId++,
        cct: false,
        throwIndex: null,
        moveId: "",
        scripted: false,
        line,
        mon: fighter.id === "a" ? fighter.activeMon : undefined,
        ...after,
      });
    }

    if (bankedKo) {
      const threw = (side: FighterId, ids: Set<string>) =>
        timeline.some((event) => event.turn === turn && event.actor === side && event.kind === "charged" && ids.has(event.moveId));
      if (bankedKo.a.size && !threw("a", bankedKo.a)) koMissA.add(bankedKo.turn);
      if (bankedKo.b.size && !threw("b", bankedKo.b)) koMissB.add(bankedKo.turn);
    }
    bankedKo = a.hp > 0 && b.hp > 0 ? { turn, a: lethalMoveIds(a, b), b: lethalMoveIds(b, a) } : null;

    if (a.hp <= 0 || b.hp <= 0) {
      if (a.follow && !a.switched && a.hp <= 0 && b.hp > 0) {
        a.faintSwitchTurn = turn + 1;
        a.action = null;
        b.action = null;
        continue;
      }
      return conclude(turn);
    }
  }

  return conclude(480, true);
}

export function shieldsSpent(timeline: TimelineEvent[], defender: "a" | "b") {
  const attacker = defender === "a" ? "b" : "a";
  const seen = new Set<number>();
  let count = 0;
  for (const event of timeline) {
    if (event.actor !== attacker || event.kind !== "charged" || !event.shielded) continue;
    if (seen.has(event.actionId)) continue;
    seen.add(event.actionId);
    count += 1;
  }
  return count;
}

export function simulateShieldGrid(inputA: FighterInput, inputB: FighterInput) {
  const grid: SimResult[][] = [];
  for (let shieldsA = 0; shieldsA <= 2; shieldsA += 1) {
    const row: SimResult[] = [];
    for (let shieldsB = 0; shieldsB <= 2; shieldsB += 1) {
      row.push(simulateBattle({ ...inputA, shields: shieldsA, shieldThrows: null }, { ...inputB, shields: shieldsB, shieldThrows: null }));
    }
    grid.push(row);
  }
  return grid;
}
