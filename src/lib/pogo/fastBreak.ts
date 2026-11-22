import { damageForMove, type PvpMove } from "./combat";
import { computeBestRankings, type PogoStatRecord, type RankingRow } from "./research";

const rankings = new Map<string, RankingRow[]>();

/** 同じ種族・リーグの順位表は使い回す。中身の計算は computeBestRankings のまま。 */
export function cachedBestRankings(
  record: PogoStatRecord,
  levels: number[],
  byLevel: Map<string, number>,
  cap: number,
  maxLevel = 50,
) {
  const key = [
    record.pokemon_id,
    record.form,
    record.base_attack,
    record.base_defense,
    record.base_stamina,
    cap,
    maxLevel,
    levels.length,
    levels[0] ?? 0,
    levels[levels.length - 1] ?? 0,
  ].join("|");
  const hit = rankings.get(key);
  if (hit) return hit;
  const rows = computeBestRankings(record, levels, byLevel, cap, maxLevel, 0);
  rankings.set(key, rows);
  if (rankings.size > 32) {
    const oldest = rankings.keys().next().value;
    if (oldest) rankings.delete(oldest);
  }
  return rows;
}

/**
 * リーグに入る個体の攻撃、または防御だけを動かして、ノーマルアタックのダメージが変わる最良順位。
 * 戦闘そのものは回さない。
 */
export function fastBreakRow(
  rows: RankingRow[],
  move: PvpMove,
  attack: number,
  defense: number,
  attackerTypes: string[],
  defenderTypes: string[],
  shadowAttack: boolean,
  shadowDefense: boolean,
  vary: "attack" | "defense",
) {
  const current = damageForMove(
    move,
    attack,
    defense,
    attackerTypes,
    defenderTypes,
    shadowAttack,
    shadowDefense,
  );
  let best: RankingRow | null = null;
  for (const row of rows) {
    const nextAttack = vary === "attack" ? row.attack : attack;
    const nextDefense = vary === "defense" ? row.defense : defense;
    const damage = damageForMove(
      move,
      nextAttack,
      nextDefense,
      attackerTypes,
      defenderTypes,
      shadowAttack,
      shadowDefense,
    );
    const changed = vary === "attack" ? damage > current : damage < current;
    if (!changed) continue;
    if (!best || row.rank < best.rank) best = row;
  }
  return best;
}

export type FastBreakMark = {
  row: RankingRow;
  /** ブレイクしたときの技ダメージ。 */
  damage: number;
  moveId: string;
};

/** 順位行に、その個体で入るダメージと技を足す。 */
export function fastBreakMark(
  rows: RankingRow[],
  move: PvpMove,
  attack: number,
  defense: number,
  attackerTypes: string[],
  defenderTypes: string[],
  shadowAttack: boolean,
  shadowDefense: boolean,
  vary: "attack" | "defense",
): FastBreakMark | null {
  const row = fastBreakRow(
    rows,
    move,
    attack,
    defense,
    attackerTypes,
    defenderTypes,
    shadowAttack,
    shadowDefense,
    vary,
  );
  if (!row) return null;
  return {
    row,
    moveId: move.id,
    damage: damageForMove(
      move,
      vary === "attack" ? row.attack : attack,
      vary === "defense" ? row.defense : defense,
      attackerTypes,
      defenderTypes,
      shadowAttack,
      shadowDefense,
    ),
  };
}
