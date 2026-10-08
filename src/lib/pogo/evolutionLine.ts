import { pokemonFormSpriteSuffix } from "./pokemonSprite";
import { formatFormLabel, getPokemonDisplayName, type PogoStatRecord, type SpeciesGroup } from "./research";

export type EvolutionChild = {
  pokemonId: number;
  form: string;
};

export type MegaEntry = {
  pokemonId: number;
  baseForm: string;
  mega: string;
  attack: number;
  defense: number;
  stamina: number;
  types: string[];
  spriteSuffix: number | null;
  signature: string;
};

export type EvolutionData = {
  children: Record<string, EvolutionChild[]>;
  parents: Record<string, EvolutionChild>;
  signature: Record<string, string>;
  megas: MegaEntry[];
};

export type LineMember = {
  key: string;
  record: PogoStatRecord;
  stage: number;
  label: string;
  spriteSuffix: number | null;
  exactSprite: boolean;
  megaBase: PogoStatRecord | null;
  sortMega: number;
};

const COSTUME =
  /copy_|fall_|winter_|summer_|spring_|costume|tshirt|adventure|diwali|doctor|flying_|gofest|gotour|horizons|jeju|kariyushi|kurta|pop_star|rock_star|vs_|wcs_|swim_|wildarea|20\d{2}/i;

/**
 * 進化ラインは、選んだフォルム自身と、そこから先へ進む進化だけ。
 * 祖先は含めない。メガシンカは進化先として、進化元と同じ段の直後に置く。
 * タイプ・わざ・攻撃・防御・HPが全て同じフォルムは代表1体（選んだフォルム、なければ通常、なければ衣装以外）。
 * 衣装など中身が通常と同じフォルムは、通常の進化先とメガシンカを引き継ぐ。
 * 地域フォームは自分の進化先だけをたどる。
 */
export function buildEvolutionLine(selected: PogoStatRecord, stats: PogoStatRecord[], data: EvolutionData) {
  const byKey = new Map(stats.map((record) => [`${record.pokemon_id}:${record.form}`, record]));
  const pickedMega = findMegaSelection(selected, data);
  if (pickedMega) {
    const base = byKey.get(`${selected.pokemon_id}:${pickedMega.baseForm}`) ?? selected;
    return [
      {
        key: `${selected.pokemon_id}:${pickedMega.baseForm}:${pickedMega.mega}`,
        record: selected,
        stage: 0,
        label: memberLabel(base, pickedMega.mega),
        spriteSuffix: pickedMega.spriteSuffix,
        exactSprite: true,
        megaBase: base,
        sortMega: 1,
      },
    ];
  }
  const seen = new Set<string>();
  const members: LineMember[] = [];

  const pushBase = (record: PogoStatRecord, stage: number) => {
    const key = `${record.pokemon_id}:${record.form}`;
    if (seen.has(key)) return;
    seen.add(key);
    const suffix = pokemonFormSpriteSuffix(record.pokemon_id, record.form);
    members.push({
      key,
      record,
      stage,
      label: memberLabel(record, null),
      spriteSuffix: suffix,
      exactSprite: false,
      megaBase: null,
      sortMega: 0,
    });
    megasOf(record, data, byKey).forEach((mega, index) => {
      const megaKey = `${key}:${mega.mega}`;
      if (seen.has(megaKey)) return;
      seen.add(megaKey);
      members.push({
        key: megaKey,
        record: {
          ...record,
          form: mega.mega,
          base_attack: mega.attack,
          base_defense: mega.defense,
          base_stamina: mega.stamina,
        },
        stage,
        label: memberLabel(record, mega.mega),
        spriteSuffix: mega.spriteSuffix,
        exactSprite: true,
        megaBase: record,
        sortMega: index + 1,
      });
    });
  };

  pushBase(selected, 0);
  const queue: { record: PogoStatRecord; stage: number }[] = [{ record: selected, stage: 0 }];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) break;
    for (const kid of collapse(childrenOf(current.record, data, byKey), data, null)) {
      const key = `${kid.pokemon_id}:${kid.form}`;
      if (seen.has(key)) continue;
      pushBase(kid, current.stage + 1);
      queue.push({ record: kid, stage: current.stage + 1 });
    }
  }

  members.sort((a, b) => {
    if (a.stage !== b.stage) return b.stage - a.stage;
    const suffixA = a.spriteSuffix ?? (a.exactSprite ? 99 : 0);
    const suffixB = b.spriteSuffix ?? (b.exactSprite ? 99 : 0);
    if (suffixA !== suffixB) return suffixA - suffixB;
    if (a.record.pokemon_id !== b.record.pokemon_id) return a.record.pokemon_id - b.record.pokemon_id;
    if (a.sortMega !== b.sortMega) return a.sortMega - b.sortMega;
    return a.label.localeCompare(b.label, "ja");
  });
  return members;
}

function sigOf(data: EvolutionData, record: PogoStatRecord) {
  return (
    data.signature[`${record.pokemon_id}:${record.form}`] ??
    `${record.base_attack}|${record.base_defense}|${record.base_stamina}`
  );
}

function childrenOf(record: PogoStatRecord, data: EvolutionData, byKey: Map<string, PogoStatRecord>) {
  let list = data.children[`${record.pokemon_id}:${record.form}`];
  if (!list) {
    const normal = byKey.get(`${record.pokemon_id}:Normal`);
    if (normal && sigOf(data, normal) === sigOf(data, record)) {
      list = data.children[`${record.pokemon_id}:Normal`];
    }
  }
  if (!list) return [];
  return list
    .map((child) => byKey.get(`${child.pokemonId}:${child.form}`))
    .filter((child): child is PogoStatRecord => Boolean(child));
}

function megasOf(record: PogoStatRecord, data: EvolutionData, byKey: Map<string, PogoStatRecord>) {
  const own = data.megas.filter((mega) => mega.pokemonId === record.pokemon_id && mega.baseForm === record.form);
  if (own.length > 0) return own;
  const normal = byKey.get(`${record.pokemon_id}:Normal`);
  if (normal && sigOf(data, normal) === sigOf(data, record)) {
    return data.megas.filter((mega) => mega.pokemonId === record.pokemon_id && mega.baseForm === "Normal");
  }
  return [];
}

function collapse(records: PogoStatRecord[], data: EvolutionData, preferred: PogoStatRecord | null) {
  const groups = new Map<string, PogoStatRecord[]>();
  for (const record of records) {
    const key = `${record.pokemon_id}:${sigOf(data, record)}`;
    const list = groups.get(key) ?? [];
    list.push(record);
    groups.set(key, list);
  }
  return [...groups.values()].map((list) => pickRepresentative(list, preferred));
}

function pickRepresentative(list: PogoStatRecord[], preferred: PogoStatRecord | null) {
  if (preferred) {
    const match = list.find((item) => item.pokemon_id === preferred.pokemon_id && item.form === preferred.form);
    if (match) return match;
  }
  return list.find((item) => item.form === "Normal") ?? list.find((item) => !COSTUME.test(item.form)) ?? list[0];
}

function megaLabel(mega: string) {
  if (mega === "MEGA") return "メガ";
  if (mega === "MEGA_X") return "メガX";
  if (mega === "MEGA_Y") return "メガY";
  return mega;
}

/**
 * 検索用。タイプ・わざ・攻撃・防御・HPが全部同じフォルムは代表1体。
 * どれか一つでも違うフォルムと、中身の違うメガシンカは別の結果にする。
 */
export function buildSearchGroups(stats: PogoStatRecord[], data: EvolutionData): SpeciesGroup[] {
  const buckets = new Map<string, PogoStatRecord[]>();
  for (const record of stats) {
    const signature = data.signature[`${record.pokemon_id}:${record.form}`] ?? statSignature(record);
    const key = `${record.pokemon_id}:${signature}`;
    const list = buckets.get(key) ?? [];
    list.push(record);
    buckets.set(key, list);
  }

  const seen = new Set<string>();
  const groups: SpeciesGroup[] = [];
  for (const [key, list] of buckets) {
    seen.add(key);
    const representative = pickRepresentative(list, null);
    groups.push({
      name: `${representative.pokemon_id}:${representative.form}`,
      pokemonId: representative.pokemon_id,
      entries: [representative],
      label: memberLabel(representative, null),
    });
  }

  for (const mega of data.megas) {
    const key = `${mega.pokemonId}:${mega.signature}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const base =
      stats.find((record) => record.pokemon_id === mega.pokemonId && record.form === mega.baseForm) ??
      stats.find((record) => record.pokemon_id === mega.pokemonId);
    if (!base) continue;
    const record: PogoStatRecord = {
      pokemon_id: mega.pokemonId,
      pokemon_name: base.pokemon_name,
      form: mega.mega,
      base_attack: mega.attack,
      base_defense: mega.defense,
      base_stamina: mega.stamina,
    };
    groups.push({
      name: `${mega.pokemonId}:${mega.baseForm}:${mega.mega}`,
      pokemonId: mega.pokemonId,
      entries: [record],
      label: memberLabel(base, mega.mega),
      exactSprite: true,
      spriteSuffix: mega.spriteSuffix,
    });
  }

  groups.sort((a, b) => a.pokemonId - b.pokemonId || (a.label ?? "").localeCompare(b.label ?? "", "ja"));
  return groups;
}

function statSignature(record: PogoStatRecord) {
  return `${record.base_attack}|${record.base_defense}|${record.base_stamina}`;
}

function findMegaSelection(selected: PogoStatRecord, data: EvolutionData) {
  if (selected.form !== "MEGA" && selected.form !== "MEGA_X" && selected.form !== "MEGA_Y") return null;
  return (
    data.megas.find(
      (mega) =>
        mega.pokemonId === selected.pokemon_id &&
        mega.mega === selected.form &&
        mega.attack === selected.base_attack &&
        mega.defense === selected.base_defense &&
        mega.stamina === selected.base_stamina,
    ) ?? null
  );
}

function memberLabel(record: PogoStatRecord, mega: string | null) {
  const name = getPokemonDisplayName(record.pokemon_id, record.pokemon_name);
  if (mega) return `${name} ${megaLabel(mega)}`;
  if (record.form !== "Normal") return `${name} ${formatFormLabel(record.form)}`;
  return name;
}
