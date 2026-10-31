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
  received: number;
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
    while (self.thrown < queue.length && queue[self.thrown] == null) {
      const rest = queue.slice(self.thrown);
      if (rest.every((slot) => slot == null)) return null;
      self.thrown += 1;
    }
    if (self.thrown >= queue.length) return null;
    const chosen = self.charged.find((move) => move.id === queue[self.thrown]) ?? null;
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
  if (self.fast.turns >= 3) return self.farmed >= farmTarget(self, other);

  const needed = cctTurnsLeft(self.fast.turns, other.fast.turns);
  if (needed == null) return true;
  if (other.action?.kind === "fast" && other.action.turnsLeft === needed) return true;
  return false;
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
    received: 0,
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
    let bestForA: SimResult | null = null;
    for (const planA of listA) {
      let bestForB: SimResult | null = null;
      for (const planB of listB) {
        const result = simulateMoves(
          { ...inputA, shieldThrows: planA },
          { ...inputB, shieldThrows: planB },
        );
        if (!bestForB || preferDefender(result, bestForB)) bestForB = result;
      }
      if (bestForB && (!bestForA || preferAttacker(bestForB, bestForA))) bestForA = bestForB;
    }
    return bestForA ?? simulateMoves(inputA, inputB);
  }
  return simulateMoves(inputA, inputB);
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

/** 評価が高い方を優先し、同じなら自分の残りゲージが多い方。 */
function preferAttacker(next: SimResult, current: SimResult) {
  if (next.rating !== current.rating) return next.rating > current.rating;
  if (next.energyA !== current.energyA) return next.energyA > current.energyA;
  return next.energyB > current.energyB;
}

/** 評価が低い方を優先し、同じなら相手の残りゲージが多い方。 */
function preferDefender(next: SimResult, current: SimResult) {
  if (next.rating !== current.rating) return next.rating < current.rating;
  if (next.energyB !== current.energyB) return next.energyB > current.energyB;
  return next.energyA > current.energyA;
}

/**
 * 最適側だけ、今の相手条件で技を1種類に決める。
 * タイムライン手順、技選択のカスタム順、候補が1つ以下の側は入力のまま固定する。
 * 片方のカスタムは、もう片方の最適探索を止めない。
 */
function moveChoices(input: FighterInput): FighterInput[] {
  if (input.timelinePlan || input.chargedQueue || input.charged.length <= 1) return [input];
  return input.charged.map((move) => ({ ...input, charged: [move], chargedQueue: null }));
}

function simulateMoves(inputA: FighterInput, inputB: FighterInput): SimResult {
  const optionsA = moveChoices(inputA);
  const optionsB = moveChoices(inputB);
  if (optionsA.length === 1 && optionsB.length === 1) return simulateLocked(optionsA[0], optionsB[0]);

  let bestForA: SimResult | null = null;
  for (const nextA of optionsA) {
    let bestForB: SimResult | null = null;
    for (const nextB of optionsB) {
      const result = simulateLocked(nextA, nextB);
      if (!bestForB || preferDefender(result, bestForB)) bestForB = result;
    }
    if (bestForB && (!bestForA || preferAttacker(bestForB, bestForA))) bestForA = bestForB;
  }
  return bestForA ?? simulateLocked(inputA, inputB);
}

function simulateLocked(inputA: FighterInput, inputB: FighterInput): SimResult {
  const a = createFighter("a", inputA);
  const b = createFighter("b", inputB);
  const maxHpA = inputA.hp;
  const maxHpB = inputB.hp;
  const timeline: TimelineEvent[] = [];
  let nextActionId = 1;
  let mimikyuBusted = false;

  for (let turn = 1; turn <= 480; turn += 1) {
    for (const [self, other] of [
      [a, b],
      [b, a],
    ] as const) {
      if (self.hp <= 0) continue;
      if (self.switchPlan?.turn === turn) {
        self.action = null;
        continue;
      }
      if (self.action) continue;
      if (self.timelinePlan && self.planIndex < self.timelinePlan.length) {
        const step = self.timelinePlan[self.planIndex];
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
        }
        continue;
      }
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
    const shellBroke = new Set<FighterId>();
    const markShell = (defender: FighterState) => {
      if (defender.minior === "meteor" && defender.hp > 0 && belowHalf(defender.hp, defender.maxHp)) {
        shellBroke.add(defender.id);
      }
    };

    // 1. 交代。1ターンを使い、出てきたポケモンはこのターン技を出さない。
    for (const fighter of [a, b]) {
      if (fighter.hp <= 0 || fighter.switchPlan?.turn !== turn) continue;
      applySwitch(fighter, fighter.switchPlan.next, mimikyuBusted);
    }

    // 2. スペシャルアタック。攻撃の実数値が高い順。シャドウは入れない。同値ならランダム。1発ごとに戦闘不能を見る。
    const chargers = chargeOrder([a, b].filter((fighter) => fighter.action?.kind === "charged" && fighter.hp > 0));
    const resolved = new Set<number>();
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
        if (!action || self.hp <= 0) return;
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
        if (specialLanded && fighter.action.turnsLeft > 0) fighter.action.turnsLeft = 0;
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
        ...snap,
      });
    }

    if (a.hp <= 0 || b.hp <= 0) {
      const winner = a.hp <= 0 && b.hp <= 0 ? "draw" : a.hp > 0 ? "a" : "b";
      const rating =
        winner === "draw"
          ? 100
          : winner === "a"
            ? 100 + Math.round((100 * Math.max(0, a.hp)) / maxHpA)
            : 100 - Math.round((100 * Math.max(0, b.hp)) / maxHpB);
      return {
        winner,
        turns: turn,
        hpA: Math.max(0, a.hp),
        hpB: Math.max(0, b.hp),
        maxHpA,
        maxHpB,
        energyA: a.energy,
        energyB: b.energy,
        rating,
        timeline,
      };
    }
  }

  return {
    winner: "draw",
    turns: 480,
    hpA: Math.max(0, a.hp),
    hpB: Math.max(0, b.hp),
    maxHpA,
    maxHpB,
    energyA: a.energy,
    energyB: b.energy,
    rating: 100,
    timeline,
  };
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
