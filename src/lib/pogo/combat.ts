import { buffMultiplier, stabMultiplier, typeEffectiveness } from "./types";

export type PvpMoveKind = "fast" | "charged";

export type PvpMove = {
  id: string;
  name: string;
  en: string;
  type: string;
  power: number;
  energy: number;
  energyGain: number;
  turns: number;
  kind: PvpMoveKind;
  buffs?: [number, number];
  buffTarget?: "self" | "opponent" | "both";
  buffChance?: number;
};

export type DamageInput = {
  power: number;
  attack: number;
  defense: number;
  moveType: string;
  attackerTypes: string[];
  defenderTypes: string[];
  shadowAttack?: boolean;
  shadowDefense?: boolean;
  attackStage?: number;
  defenseStage?: number;
};

export function effectiveAttack(attack: number, shadow: boolean, stage = 0) {
  return attack * (shadow ? 1.2 : 1) * buffMultiplier(stage);
}

export function effectiveDefense(defense: number, shadow: boolean, stage = 0) {
  return defense * (shadow ? 1 / 1.2 : 1) * buffMultiplier(stage);
}

/**
 * トレーナーバトルだけの係数。
 * 天候となかよし度はレイド側なので掛けない。
 * シールドで防いだダメージは、この式ではなくシミュレータ側で 1 にする。
 */
const TRAINER_BATTLE_MODIFIER = 1.3;

export function pvpDamage(input: DamageInput) {
  const attack = effectiveAttack(input.attack, Boolean(input.shadowAttack), input.attackStage ?? 0);
  const defense = effectiveDefense(input.defense, Boolean(input.shadowDefense), input.defenseStage ?? 0);
  const stab = stabMultiplier(input.moveType, input.attackerTypes);
  const effectiveness = typeEffectiveness(input.moveType, input.defenderTypes);
  return (
    Math.floor(
      0.5 * input.power * (attack / Math.max(defense, 0.0001)) * stab * effectiveness * TRAINER_BATTLE_MODIFIER,
    ) + 1
  );
}

export function damageForMove(
  move: PvpMove,
  attack: number,
  defense: number,
  attackerTypes: string[],
  defenderTypes: string[],
  shadowAttack = false,
  shadowDefense = false,
  attackStage = 0,
  defenseStage = 0,
) {
  return pvpDamage({
    power: move.power,
    attack,
    defense,
    moveType: move.type,
    attackerTypes,
    defenderTypes,
    shadowAttack,
    shadowDefense,
    attackStage,
    defenseStage,
  });
}

export function nextAttackBreakpoint(input: DamageInput) {
  const current = pvpDamage(input);
  for (let extra = 0.05; extra <= 48; extra += 0.05) {
    const next = pvpDamage({ ...input, attack: input.attack + extra });
    if (next > current) {
      return { attack: input.attack + extra, damage: next, current };
    }
  }
  return null;
}

export function nextDefenseBulkpoint(input: DamageInput) {
  const current = pvpDamage(input);
  for (let extra = 0.05; extra <= 48; extra += 0.05) {
    const next = pvpDamage({ ...input, defense: input.defense + extra });
    if (next < current) {
      return { defense: input.defense + extra, damage: next, current };
    }
  }
  return null;
}

export function hitsToKo(hp: number, damage: number) {
  if (damage <= 0) return Infinity;
  return Math.ceil(hp / damage);
}
