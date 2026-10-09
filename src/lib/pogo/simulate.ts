import { damageForMove, type PvpMove } from "./combat";

export type ChargeTiming = "asap" | "cct";
export type FighterId = "a" | "b";

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
};

export type TimelineEvent = {
  turn: number;
  actor: FighterId;
  kind: "fast" | "charged";
  moveName: string;
  damage: number;
  shielded: boolean;
  hpA: number;
  hpB: number;
  energyA: number;
  energyB: number;
};

export type SimResult = {
  winner: FighterId | "draw";
  turns: number;
  hpA: number;
  hpB: number;
  maxHpA: number;
  maxHpB: number;
  rating: number;
  timeline: TimelineEvent[];
};

type Action = {
  kind: "fast" | "charged";
  move: PvpMove;
  turnsLeft: number;
  totalTurns: number;
};

type FighterState = FighterInput & {
  id: FighterId;
  energy: number;
  shieldsLeft: number;
  attackStage: number;
  defenseStage: number;
  action: Action | null;
};

function clampStage(value: number) {
  return Math.max(-4, Math.min(4, value));
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
  return damageForMove(
    move,
    self.attack,
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
  const ready = self.charged.filter((move) => self.energy >= move.energy);
  if (!ready.length) return null;

  const koUnshielded = ready.find((move) => damageOf(self, other, move) >= other.hp && other.shieldsLeft === 0);
  if (koUnshielded) return koUnshielded;

  const bait = self.charged[1];
  if (other.shieldsLeft > 0 && bait && self.energy >= bait.energy) return bait;
  return ready[0];
}

function shouldThrow(self: FighterState, other: FighterState, move: PvpMove) {
  if (other.shieldsLeft === 0 && damageOf(self, other, move) >= other.hp) return true;
  if (self.timing === "asap") return true;

  const needed = cctTurnsLeft(self.fast.turns, other.fast.turns);
  if (needed == null) return true;
  if (other.action?.kind === "fast" && other.action.turnsLeft === needed) return true;
  return false;
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

function resolveOrder(a: FighterState, b: FighterState) {
  if (!a.action || !b.action) return a.action ? [a, b] : [b, a];
  if (a.action.kind === "charged" && b.action.kind === "charged") {
    const atkA = a.attack * (a.shadow ? 1.2 : 1);
    const atkB = b.attack * (b.shadow ? 1.2 : 1);
    if (atkA !== atkB) return atkA > atkB ? [a, b] : [b, a];
    return [a, b];
  }
  if (a.action.kind !== b.action.kind) {
    const fast = a.action.kind === "fast" ? a : b;
    if (fast.action && fast.action.totalTurns <= 1) {
      return a.action.kind === "charged" ? [a, b] : [b, a];
    }
    return a.action.kind === "fast" ? [a, b] : [b, a];
  }
  return [a, b];
}

function createFighter(id: FighterId, input: FighterInput): FighterState {
  return {
    ...input,
    id,
    hp: input.hp,
    energy: 0,
    shieldsLeft: input.shields,
    attackStage: 0,
    defenseStage: 0,
    action: null,
  };
}

type MoveCell = {
  moveA: PvpMove | null;
  moveB: PvpMove | null;
  result: SimResult;
};

/**
 * 両方にスペシャルアタックが2つあるときは、勝つ側は倒すのが一番早い技、
 * 負ける側は負けるまでに相手のHPを一番削る技を、組み合わせの中から一度だけ選ぶ。
 * 選び直して勝敗が入れ替わるループには入らない。選んだ結果が引き分けなら引き分けのまま返す。
 */
export function simulateBattle(inputA: FighterInput, inputB: FighterInput): SimResult {
  if (inputA.charged.length <= 1 && inputB.charged.length <= 1) {
    return simulateLocked(inputA, inputB);
  }

  const optionsA = inputA.charged.length ? inputA.charged : [null];
  const optionsB = inputB.charged.length ? inputB.charged : [null];
  const cells: MoveCell[] = [];
  for (const moveA of optionsA) {
    for (const moveB of optionsB) {
      cells.push({
        moveA,
        moveB,
        result: simulateLocked(
          { ...inputA, charged: moveA ? [moveA] : [] },
          { ...inputB, charged: moveB ? [moveB] : [] },
        ),
      });
    }
  }
  return pickChargedCell(cells).result;
}

function pickChargedCell(cells: MoveCell[]) {
  const winsA = cells.filter((cell) => cell.result.winner === "a");
  const winsB = cells.filter((cell) => cell.result.winner === "b");
  const draws = cells.filter((cell) => cell.result.winner === "draw");
  if (!winsA.length && !winsB.length) return draws[0] ?? cells[0];

  let winnerId: FighterId;
  if (winsA.length && !winsB.length) winnerId = "a";
  else if (winsB.length && !winsA.length) winnerId = "b";
  else {
    const bestA = Math.min(...winsA.map((cell) => cell.result.turns));
    const bestB = Math.min(...winsB.map((cell) => cell.result.turns));
    if (bestA === bestB) return closestCell(draws.length ? draws : cells);
    winnerId = bestA < bestB ? "a" : "b";
  }

  const winCells = winnerId === "a" ? winsA : winsB;
  const fastest = Math.min(...winCells.map((cell) => cell.result.turns));
  const fastestCells = winCells.filter((cell) => cell.result.turns === fastest);
  const winCell = fastestCells.reduce((best, cell) => (winnerHp(cell, winnerId) > winnerHp(best, winnerId) ? cell : best));
  const winMove = winnerId === "a" ? winCell.moveA : winCell.moveB;
  const against = cells.filter((cell) => (winnerId === "a" ? cell.moveA === winMove : cell.moveB === winMove));
  const losses = against.filter((cell) => cell.result.winner === winnerId);
  const pool = losses.length ? losses : against;
  return pool.reduce((best, cell) => {
    const dealt = damageByLoser(cell, winnerId);
    const bestDealt = damageByLoser(best, winnerId);
    if (dealt !== bestDealt) return dealt > bestDealt ? cell : best;
    return cell.result.turns > best.result.turns ? cell : best;
  });
}

function winnerHp(cell: MoveCell, winnerId: FighterId) {
  return winnerId === "a" ? cell.result.hpA : cell.result.hpB;
}

function damageByLoser(cell: MoveCell, winnerId: FighterId) {
  return winnerId === "a" ? cell.result.maxHpA - cell.result.hpA : cell.result.maxHpB - cell.result.hpB;
}

function closestCell(cells: MoveCell[]) {
  return cells.reduce((best, cell) => {
    const gap = Math.abs(cell.result.hpA - cell.result.hpB);
    const bestGap = Math.abs(best.result.hpA - best.result.hpB);
    return gap < bestGap ? cell : best;
  });
}

function simulateLocked(inputA: FighterInput, inputB: FighterInput): SimResult {
  const a = createFighter("a", inputA);
  const b = createFighter("b", inputB);
  const maxHpA = inputA.hp;
  const maxHpB = inputB.hp;
  const timeline: TimelineEvent[] = [];

  for (let turn = 1; turn <= 480; turn += 1) {
    for (const [self, other] of [
      [a, b],
      [b, a],
    ] as const) {
      if (self.hp <= 0 || self.action) continue;
      const charged = pickCharged(self, other);
      if (charged && shouldThrow(self, other, charged)) {
        self.energy -= charged.energy;
        self.action = { kind: "charged", move: charged, turnsLeft: 1, totalTurns: 1 };
      } else {
        self.action = {
          kind: "fast",
          move: self.fast,
          turnsLeft: Math.max(1, self.fast.turns),
          totalTurns: Math.max(1, self.fast.turns),
        };
      }
    }

    const finishing = [a, b].filter((fighter) => {
      if (!fighter.action) return false;
      fighter.action.turnsLeft -= 1;
      return fighter.action.turnsLeft <= 0;
    });

    const ordered = finishing.length === 2 ? resolveOrder(finishing[0], finishing[1]) : finishing;

    for (const self of ordered) {
      const other = self.id === "a" ? b : a;
      const action = self.action;
      if (!action || self.hp <= 0) continue;

      let damage = 0;
      let shielded = false;
      if (action.kind === "fast") {
        self.energy = Math.min(100, self.energy + action.move.energyGain);
        damage = damageOf(self, other, action.move);
        other.hp -= damage;
      } else {
        if (other.shieldsLeft > 0) {
          other.shieldsLeft -= 1;
          damage = 1;
          shielded = true;
        } else {
          damage = damageOf(self, other, action.move);
        }
        other.hp -= damage;
        applyBuffs(self, other, action.move, self.applyChanceBuffs);
      }

      timeline.push({
        turn,
        actor: self.id,
        kind: action.kind,
        moveName: action.move.name,
        damage,
        shielded,
        ...snapshot(a, b),
      });
      self.action = null;
      if (a.hp <= 0 || b.hp <= 0) break;
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
    rating: 100,
    timeline,
  };
}

export function simulateShieldGrid(inputA: FighterInput, inputB: FighterInput) {
  const grid: SimResult[][] = [];
  for (let shieldsA = 0; shieldsA <= 2; shieldsA += 1) {
    const row: SimResult[] = [];
    for (let shieldsB = 0; shieldsB <= 2; shieldsB += 1) {
      row.push(simulateBattle({ ...inputA, shields: shieldsA }, { ...inputB, shields: shieldsB }));
    }
    grid.push(row);
  }
  return grid;
}
