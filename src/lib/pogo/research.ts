import { pokemonNameMapJa } from "./pokemonNameMap";

export type PogoStatRecord = {
  base_attack: number;
  base_defense: number;
  base_stamina: number;
  form: string;
  pokemon_id: number;
  pokemon_name: string;
};

export type CpMultiplierRecord = {
  level: number;
  multiplier: number;
};

export type LeagueId = "great" | "ultra" | "master" | "custom";

export type LeagueConfig = {
  id: LeagueId;
  label: string;
  cap: number;
};

export type SpeciesGroup = {
  name: string;
  pokemonId: number;
  entries: PogoStatRecord[];
};

export type DerivedStats = {
  attack: number;
  defense: number;
  stamina: number;
  cp: number;
  statProduct: number;
};

export type RankingRow = {
  rank: number;
  atkIv: number;
  defIv: number;
  staIv: number;
  level: number;
  cp: number;
  statProduct: number;
  attack: number;
  defense: number;
  stamina: number;
};

export const leagueConfigs: LeagueConfig[] = [
  { id: "great", label: "スーパーリーグ", cap: 1500 },
  { id: "ultra", label: "ハイパーリーグ", cap: 2500 },
  { id: "master", label: "マスターリーグ", cap: 9999 },
  { id: "custom", label: "カスタム", cap: 1500 },
];

export function leagueCap(leagueId: LeagueId, customCap = 1500) {
  if (leagueId === "custom") return customCap;
  return leagueConfigs.find((league) => league.id === leagueId)?.cap ?? 1500;
}

export function pickPreferredEntry(group: SpeciesGroup) {
  return group.entries.find((entry) => entry.form === "Normal") ?? group.entries[0];
}

export function speciesDisplayName(group: SpeciesGroup) {
  return getPokemonDisplayName(group.pokemonId, group.name);
}

const levelOrder = (a: number, b: number) => a - b;

export function buildCpMultiplierMap(records: CpMultiplierRecord[]) {
  const byLevel = new Map<string, number>();
  const levels = records
    .map((record) => {
      const key = record.level.toFixed(1);
      byLevel.set(key, record.multiplier);
      return record.level;
    })
    .sort(levelOrder);

  return { byLevel, levels };
}

export function groupSpecies(records: PogoStatRecord[]): SpeciesGroup[] {
  const groups = new Map<string, SpeciesGroup>();

  for (const record of records) {
    const existing = groups.get(record.pokemon_name);
    if (existing) {
      existing.entries.push(record);
      if (record.pokemon_id < existing.pokemonId) {
        existing.pokemonId = record.pokemon_id;
      }
      continue;
    }

    groups.set(record.pokemon_name, {
      name: record.pokemon_name,
      pokemonId: record.pokemon_id,
      entries: [record],
    });
  }

  return [...groups.values()]
    .map((group) => ({
      ...group,
      entries: [...group.entries].sort((a, b) => {
        if (a.form === "Normal" && b.form !== "Normal") return -1;
        if (a.form !== "Normal" && b.form === "Normal") return 1;
        return a.form.localeCompare(b.form);
      }),
    }))
    .sort((a, b) => {
      if (a.pokemonId !== b.pokemonId) return a.pokemonId - b.pokemonId;
      return a.name.localeCompare(b.name);
    });
}

export function formatFormLabel(form: string) {
  return form === "Normal" ? "通常" : form.replace(/_/g, " ");
}

export function getPokemonDisplayName(pokemonId: number, fallback: string) {
  return pokemonNameMapJa[pokemonId] ?? fallback;
}

/** CPは切り捨て前のHPを使う。HP実数値のfloorをCPに入れると順位がずれる。 */
export function computeCp(
  record: PogoStatRecord,
  atkIv: number,
  defIv: number,
  staIv: number,
  multiplier: number,
) {
  const attack = record.base_attack + atkIv;
  const defense = record.base_defense + defIv;
  const stamina = record.base_stamina + staIv;
  return Math.max(10, Math.floor((attack * Math.sqrt(defense) * Math.sqrt(stamina) * multiplier * multiplier) / 10));
}

export function computeDerivedStats(
  record: PogoStatRecord,
  atkIv: number,
  defIv: number,
  staIv: number,
  multiplier: number,
): DerivedStats {
  const attack = (record.base_attack + atkIv) * multiplier;
  const defense = (record.base_defense + defIv) * multiplier;
  const stamina = Math.max(10, Math.floor((record.base_stamina + staIv) * multiplier));
  const cp = computeCp(record, atkIv, defIv, staIv, multiplier);
  const statProduct = attack * defense * stamina;

  return { attack, defense, stamina, cp, statProduct };
}

/** みんポケ表示に合わせ、実数値積を1000で割って切り捨てた値。 */
export function formatScp(statProduct: number) {
  return Math.floor(statProduct / 1000);
}

/** 相棒ボーナス。ゲームマスターのレベル51と、50→51の半レベル刻み。 */
export const BUDDY_CPM: CpMultiplierRecord[] = [
  { level: 50.5, multiplier: 0.84279999 },
  { level: 51, multiplier: 0.84529999 },
];

export function withBuddyLevels(
  map: { byLevel: Map<string, number>; levels: number[] },
  buddy: boolean,
) {
  if (!buddy) return map;
  const byLevel = new Map(map.byLevel);
  const levels = [...map.levels];
  for (const extra of BUDDY_CPM) {
    const key = extra.level.toFixed(1);
    if (byLevel.has(key)) continue;
    byLevel.set(key, extra.multiplier);
    levels.push(extra.level);
  }
  levels.sort(levelOrder);
  return { byLevel, levels };
}

export function formatPlace(rank: number) {
  return `${rank}位`;
}

/** 攻撃・防御の表示。通常は小数第1位。個体チェック、並べ替え中の列、幅のある順位表は第2位。 */
export function formatBattleStat(value: number, digits: 1 | 2) {
  return value.toFixed(digits);
}

/** 1位は金、2–9位は赤、10–99位はオレンジ。 */
export function placeTone(rank: number) {
  if (rank === 1) return "is-gold";
  if (rank <= 9) return "is-hot";
  if (rank <= 99) return "is-warm";
  return "";
}

export function computeBestRankings(
  record: PogoStatRecord,
  levels: number[],
  byLevel: Map<string, number>,
  cap: number,
  maxLevel = 50,
) {
  const rows: RankingRow[] = [];

  for (let atkIv = 0; atkIv <= 15; atkIv += 1) {
    for (let defIv = 0; defIv <= 15; defIv += 1) {
      for (let staIv = 0; staIv <= 15; staIv += 1) {
        let best: RankingRow | null = null;

        for (const level of levels) {
          if (level > maxLevel + 1e-9) continue;
          const multiplier = byLevel.get(level.toFixed(1));
          if (multiplier === undefined) continue;

          const derived = computeDerivedStats(record, atkIv, defIv, staIv, multiplier);
          if (derived.cp > cap) break;

          if (
            best === null ||
            derived.statProduct > best.statProduct ||
            (derived.statProduct === best.statProduct && derived.cp > best.cp) ||
            (derived.statProduct === best.statProduct && derived.cp === best.cp && level > best.level)
          ) {
            best = {
              rank: 0,
              atkIv,
              defIv,
              staIv,
              level,
              cp: derived.cp,
              statProduct: derived.statProduct,
              attack: derived.attack,
              defense: derived.defense,
              stamina: derived.stamina,
            };
          }
        }

        if (best) rows.push(best);
      }
    }
  }

  rows.sort((a, b) => {
    if (b.statProduct !== a.statProduct) return b.statProduct - a.statProduct;
    if (b.cp !== a.cp) return b.cp - a.cp;
    if (b.level !== a.level) return b.level - a.level;
    if (a.atkIv !== b.atkIv) return a.atkIv - b.atkIv;
    if (a.defIv !== b.defIv) return a.defIv - b.defIv;
    return a.staIv - b.staIv;
  });

  let lastProduct = Number.POSITIVE_INFINITY;
  let lastRank = 0;
  return rows.map((row, index) => {
    const same = Math.abs(row.statProduct - lastProduct) < 1e-6;
    const rank = same ? lastRank : index + 1;
    lastProduct = row.statProduct;
    lastRank = rank;
    return { ...row, rank };
  });
}

export function findMaxLevelBuild(
  record: PogoStatRecord,
  atkIv: number,
  defIv: number,
  staIv: number,
  levels: number[],
  byLevel: Map<string, number>,
  cap: number,
) {
  let best: (DerivedStats & { level: number }) | null = null;

  for (const level of levels) {
    const multiplier = byLevel.get(level.toFixed(1));
    if (multiplier === undefined) continue;
    const derived = computeDerivedStats(record, atkIv, defIv, staIv, multiplier);
    if (derived.cp > cap) continue;
    best = { ...derived, level };
  }

  return best;
}
