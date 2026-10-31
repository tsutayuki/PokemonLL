import type { MegaEntry } from "./evolutionLine";
import type { PogoStatRecord } from "./research";
import type { PvpBundle, PvpPokemonRecord } from "./pvpBundle";

export type SheetCatalogEntry = {
  key: string;
  dex: number;
  name?: string;
  tag?: string;
  fastIds: (string | null)[];
  chargedIds: (string | null)[];
  /** メガシンカ中の追加スペシャル。威力とゲージは pvp_bundle のトレーナーバトル値を使う。 */
  extraIds?: (string | null)[];
};

export type SheetCatalog = {
  pokemon: SheetCatalogEntry[];
};

function uniqueIds(ids: (string | null | undefined)[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function sortCatalogKeys(keys: string[]) {
  return [...keys].sort((a, b) => {
    const suffix = (key: string) => (key.includes("-") ? Number(key.split("-")[1]) || 99 : 0);
    const diff = suffix(a) - suffix(b);
    if (diff !== 0) return diff;
    return a.localeCompare(b);
  });
}

function formsForDex(stats: PogoStatRecord[], pokemonId: number) {
  const forms = stats.filter((row) => row.pokemon_id === pokemonId).map((row) => row.form);
  return [...new Set(forms)].sort((a, b) => {
    if (a === "Normal") return -1;
    if (b === "Normal") return 1;
    return a.localeCompare(b, "ja");
  });
}

function catalogKeyFor(pokemonId: number, form: string, keysByDex: Map<number, string[]>, stats: PogoStatRecord[]) {
  const keys = sortCatalogKeys(keysByDex.get(pokemonId) ?? []);
  if (!keys.length) return null;
  if (keys.length === 1) return keys[0];

  const forms = formsForDex(stats, pokemonId);
  const formIndex = forms.indexOf(form);
  const baseKey = keys.find((key) => !key.includes("-")) ?? keys[0];
  if (form === "Normal" || formIndex <= 0) return baseKey;

  const altKeys = keys.filter((key) => key.includes("-"));
  const altIndex = forms.includes("Normal") ? formIndex - 1 : formIndex;
  return altKeys[altIndex] ?? keys[Math.min(formIndex, keys.length - 1)] ?? baseKey;
}

export function applyKu6Learnsets(bundle: PvpBundle, catalog: SheetCatalog, stats: PogoStatRecord[]): PvpBundle {
  const keysByDex = new Map<number, string[]>();
  for (const row of catalog.pokemon) {
    const list = keysByDex.get(row.dex) ?? [];
    list.push(row.key);
    keysByDex.set(row.dex, list);
  }

  const byKey = new Map(catalog.pokemon.map((row) => [row.key, row]));
  const pokemon = bundle.pokemon.map((entry) => {
    const key = catalogKeyFor(entry.pokemonId, entry.form, keysByDex, stats);
    if (!key) return entry;
    const sheet = byKey.get(key);
    if (!sheet) return entry;
    const fast = uniqueIds(sheet.fastIds);
    const charged = uniqueIds(sheet.chargedIds);
    if (!fast.length && !charged.length) return entry;
    return {
      ...entry,
      fast: fast.length ? fast : entry.fast,
      charged: charged.length ? charged : entry.charged,
    };
  });

  return { ...bundle, pokemon };
}

const SMEARGLE_ID = 235;

/** ノーマルアタックはロックオンだけ。スペシャルはほうこうレポートの当たり技リスト順。 */
const SMEARGLE_FAST = ["LOCK_ON"];
const SMEARGLE_CHARGED = [
  "FLYING_PRESS",
  "ROCK_WRECKER",
  "BLAST_BURN",
  "FRENZY_PLANT",
  "TECHNO_BLAST_SHOCK",
  "PSYSTRIKE",
  "AVALANCHE",
  "V_CREATE",
  "BRAVE_BIRD",
  "AEROBLAST",
  "TECHNO_BLAST_NORMAL",
  "TECHNO_BLAST_DOUSE",
  "TECHNO_BLAST_BURN",
  "TECHNO_BLAST_CHILL",
  "ORIGIN_PULSE",
  "PRECIPICE_BLADES",
  "LEAF_BLADE",
  "BOOMBURST",
  "WILD_CHARGE",
  "ROCK_TOMB",
  "GLACIATE",
  "LUNGE",
  "SANDSEAR_STORM",
  "WILDBOLT_STORM",
  "BLEAKWIND_STORM",
];

/** ドーブルはロックオンと、当たり技リストのスペシャルアタックだけを覚える。 */
export function applySmeargleLearnset(bundle: PvpBundle): PvpBundle {
  const fast = SMEARGLE_FAST.filter((id) => bundle.moves[id]?.kind === "fast");
  const charged = SMEARGLE_CHARGED.filter((id) => bundle.moves[id]?.kind === "charged");
  let changed = false;
  const pokemon = bundle.pokemon.map((entry) => {
    if (entry.pokemonId !== SMEARGLE_ID) return entry;
    changed = true;
    return { ...entry, fast, charged, third: null };
  });
  return changed ? { ...bundle, pokemon } : bundle;
}

function megaKindFromName(name: string) {
  if (name.endsWith("X")) return "MEGA_X";
  if (name.endsWith("Y")) return "MEGA_Y";
  return "MEGA";
}

/**
 * 表のメガ行を、フォーム MEGA / MEGA_X / MEGA_Y の技表として足す。
 * サードアタックは extraIds の1つ。基礎威力とゲージ消費は pvp_bundle にある＋技（トレーナーバトル）で、レイドの数値は見ない。
 */
export function applyMegaPokemon(bundle: PvpBundle, catalog: SheetCatalog, megas: MegaEntry[]): PvpBundle {
  const existing = new Set(bundle.pokemon.map((entry) => `${entry.pokemonId}:${entry.form}`));
  const added: PvpPokemonRecord[] = [];

  for (const row of catalog.pokemon) {
    if (row.tag !== "メガ") continue;
    const kind = megaKindFromName(row.name ?? "");
    const matches = megas.filter((mega) => mega.pokemonId === row.dex && mega.mega === kind);
    const mega = matches.find((item) => item.baseForm === "Normal") ?? matches[0];
    if (!mega) continue;
    const key = `${row.dex}:${kind}`;
    if (existing.has(key)) continue;
    const base =
      bundle.pokemon.find((entry) => entry.pokemonId === row.dex && entry.form === mega.baseForm) ??
      bundle.pokemon.find((entry) => entry.pokemonId === row.dex && entry.form === "Normal") ??
      bundle.pokemon.find((entry) => entry.pokemonId === row.dex);
    if (!base) continue;
    const fast = uniqueIds(row.fastIds);
    const charged = uniqueIds(row.chargedIds);
    const thirdId = uniqueIds(row.extraIds ?? [])[0] ?? null;
    added.push({
      pokemonId: row.dex,
      name: base.name,
      form: kind,
      types: mega.types.length ? [...mega.types] : [...base.types],
      fast: fast.length ? fast : [...base.fast],
      charged: charged.length ? charged : [...base.charged],
      third: thirdId && bundle.moves[thirdId] ? thirdId : null,
    });
    existing.add(key);
  }

  if (!added.length) return bundle;
  return { ...bundle, pokemon: [...bundle.pokemon, ...added] };
}
