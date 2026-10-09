import type { PvpMove } from "./combat";

/** タイプ一致のとき、評価用の威力に 1.2 を掛ける。ダメージ計算そのものとは別。 */
export function ratedPower(move: PvpMove, attackerTypes: string[]) {
  const stab = attackerTypes.some((type) => type === move.type) ? 1.2 : 1;
  return move.power * stab;
}

/**
 * ノーマルアタック評価 = DPT + EPT×2 + (5−ターン数)÷5
 * DPT = 威力÷ターン数、EPT = チャージ量÷ターン数
 */
export function fastMoveScore(move: PvpMove, attackerTypes: string[]) {
  const turns = Math.max(1, move.turns);
  const dpt = ratedPower(move, attackerTypes) / turns;
  const ept = move.energyGain / turns;
  return dpt + ept * 2 + (5 - turns) / 5;
}

/**
 * スペシャルアタック評価 = DPE × 消費量補正
 * DPE = 威力÷ゲージ消費量
 * 消費量補正 = 消費量係数 ^ 追加効果係数
 * 消費量係数は 35=1.5、40=1.3、45=1.2、50以上=1.05。それ以外は 1。
 * 追加効果係数は、有利な変化の種類係数×発動割合。変化が無い、またはそれ以外の変化は 1。
 */
export function chargedMoveScore(move: PvpMove, attackerTypes: string[]) {
  if (move.energy <= 0) return 0;
  const dpe = ratedPower(move, attackerTypes) / move.energy;
  const coefficient = energyCoefficient(move.energy);
  return dpe * coefficient ** effectExponent(move);
}

export function energyCoefficient(energy: number) {
  if (energy === 35) return 1.5;
  if (energy === 40) return 1.3;
  if (energy === 45) return 1.2;
  if (energy >= 50) return 1.05;
  return 1;
}

export function effectExponent(move: PvpMove) {
  if (!move.buffs) return 1;
  const [attack, defense] = move.buffs;
  const target = move.buffTarget ?? "self";
  const kinds: number[] = [];
  if (target === "opponent" || target === "both") {
    if (attack < 0) kinds.push(2);
    if (defense < 0) kinds.push(1.7);
  }
  if (target === "self" || target === "both") {
    if (attack > 0) kinds.push(1.7);
    if (defense > 0) kinds.push(1.4);
  }
  if (!kinds.length) return 1;
  const chance = move.buffChance ?? 1;
  return Math.max(...kinds) * chance;
}

export function bestMoves(moves: PvpMove[], attackerTypes: string[], kind: "fast" | "charged") {
  const score = kind === "fast" ? fastMoveScore : chargedMoveScore;
  return [...moves].sort((a, b) => score(b, attackerTypes) - score(a, attackerTypes));
}
