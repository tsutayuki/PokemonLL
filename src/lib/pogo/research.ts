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
  const cp = Math.max(10, Math.floor((attack * Math.sqrt(defense) * Math.sqrt(stamina)) / 10));
  const statProduct = attack * defense * stamina;

  return { attack, defense, stamina, cp, statProduct };
}

export function computeBestRankings(
  record: PogoStatRecord,
  levels: number[],
  byLevel: Map<string, number>,
  cap: number,
) {
  const rows: RankingRow[] = [];

  for (let atkIv = 0; atkIv <= 15; atkIv += 1) {
    for (let defIv = 0; defIv <= 15; defIv += 1) {
      for (let staIv = 0; staIv <= 15; staIv += 1) {
        let best: RankingRow | null = null;

        for (const level of levels) {
          const multiplier = byLevel.get(level.toFixed(1));
          if (multiplier === undefined) continue;

          const derived = computeDerivedStats(record, atkIv, defIv, staIv, multiplier);
          if (derived.cp > cap) continue;

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

  return rows.map((row, index) => ({ ...row, rank: index + 1 }));
}
