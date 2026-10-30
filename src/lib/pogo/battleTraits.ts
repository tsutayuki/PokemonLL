import type { PvpMove } from "./combat";
import { computeDerivedStats, type PogoStatRecord } from "./research";

/** シールドフォルム中のノーマルアタック。ダメージは式ではなく 1 固定。 */
export const AEGIS_CHARGE_MOVE: PvpMove = {
  id: "AEGISLASH_SHIELD_CHARGE",
  name: "チャージ",
  en: "Charge",
  type: "normal",
  power: 0,
  energy: 0,
  energyGain: 6,
  turns: 2,
  kind: "fast",
};

const BLADE_FAST_ID: Record<string, string> = {
  AEGISLASH_CHARGE_PSYCHO_CUT: "PSYCHO_CUT",
  AEGISLASH_CHARGE_AIR_SLASH: "AIR_SLASH",
  PSYCHO_CUT: "PSYCHO_CUT",
  AIR_SLASH: "AIR_SLASH",
};

export function isAuraWheel(move: PvpMove) {
  return move.id === "AURA_WHEEL_ELECTRIC" || move.id === "AURA_WHEEL_DARK" || move.name === "オーラぐるま";
}

/** 1始まりのスペシャル回数。奇数はでんき、偶数はあく。 */
export function auraWheelType(firedBefore: number) {
  return (firedBefore + 1) % 2 === 1 ? "electric" : "dark";
}

export function isGulpLoader(move: PvpMove) {
  return move.id === "DIVE" || move.id === "SURF";
}

/** 半分より多いときサシカマス。ちょうど半分と、それ未満はピカチュウ。 */
export function gulpCatch(hp: number, maxHp: number): "arrokuda" | "pikachu" {
  return hp * 2 > maxHp ? "arrokuda" : "pikachu";
}

export function gulpDamage(maxHp: number) {
  return Math.max(1, Math.floor(maxHp * 0.15));
}

export function gulpSprite(catchKind: "arrokuda" | "pikachu") {
  return catchKind === "pikachu" ? { spriteId: 25, spriteForm: "Normal" } : { spriteId: 846, spriteForm: "Normal" };
}

/** 半分ちょうどは下回っていない。 */
export function belowHalf(hp: number, maxHp: number) {
  return hp * 2 < maxHp;
}

export function bladeFastMove(moves: Record<string, PvpMove>, fastId: string) {
  const id = BLADE_FAST_ID[fastId] ?? fastId;
  return moves[id] ?? moves.PSYCHO_CUT ?? null;
}

/** レベル50以降は半レベルあたり +0.0025。公式の51までと同じ刻み。 */
export function cpmForLevel(byLevel: Map<string, number>, level: number) {
  const known = byLevel.get(level.toFixed(1));
  if (known != null) return known;
  if (level < 50 || level > 55) return null;
  const base = byLevel.get("50.0");
  if (base == null) return null;
  return base + (level - 50) * 0.005;
}

/** リーグ上限を超えないうちで、一番上限に近いレベル。最大55。 */
export function statsUnderCap(
  record: PogoStatRecord,
  atkIv: number,
  defIv: number,
  staIv: number,
  byLevel: Map<string, number>,
  cap: number,
  maxLevel = 55,
) {
  let best: ReturnType<typeof computeDerivedStats> | null = null;
  for (let level = 1; level <= maxLevel + 1e-9; level += 0.5) {
    const multiplier = cpmForLevel(byLevel, level);
    if (multiplier == null) continue;
    const derived = computeDerivedStats(record, atkIv, defIv, staIv, multiplier);
    if (derived.cp > cap) break;
    best = derived;
  }
  return best;
}
