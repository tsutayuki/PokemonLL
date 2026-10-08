/**
 * Game master から進化先とメガシンカを切り出す。
 * 実行: node --experimental-strip-types scripts/generate-evolution-line.mjs
 * 入力のゲームマスターはリポジトリに置かない。
 */
import fs from "node:fs";
import path from "node:path";
import { pokemonFormSpriteSuffix } from "../src/lib/pogo/pokemonSprite.ts";

const root = path.resolve(import.meta.dirname, "..");
const gameMasterPath = process.argv[2] ?? "/tmp/try1.json";

const stats = JSON.parse(fs.readFileSync(path.join(root, "public/data/pokemon_stats.json"), "utf8"));
const pvp = JSON.parse(fs.readFileSync(path.join(root, "public/data/pvp_bundle.json"), "utf8"));
const gm = JSON.parse(fs.readFileSync(gameMasterPath, "utf8"));

const statsForms = new Map();
const statsBy = new Map();
for (const row of stats) {
  const forms = statsForms.get(row.pokemon_id) ?? new Set();
  forms.add(row.form);
  statsForms.set(row.pokemon_id, forms);
  statsBy.set(`${row.pokemon_id}:${row.form}`, row);
}

const pvpBy = new Map();
for (const row of pvp.pokemon) {
  pvpBy.set(`${row.pokemonId}:${row.form}`, row);
}

function seg(part) {
  if (!part) return part;
  return part[0].toUpperCase() + part.slice(1).toLowerCase();
}

function resolveForm(dex, species, gmForm) {
  const forms = statsForms.get(dex);
  if (!forms || forms.size === 0) return null;
  if (!gmForm) return forms.has("Normal") ? "Normal" : null;
  let raw = gmForm;
  if (species && raw.startsWith(`${species}_`)) raw = raw.slice(species.length + 1);
  const candidate = raw.split("_").map(seg).join("_");
  for (const form of forms) {
    if (form.toLowerCase() === candidate.toLowerCase()) return form;
  }
  const upper = gmForm.toUpperCase();
  for (const form of forms) {
    if (upper === form.toUpperCase() || upper.endsWith(`_${form.toUpperCase()}`)) return form;
  }
  return null;
}

const speciesDex = new Map();
const templates = [];
for (const item of gm) {
  const id = item.templateId ?? "";
  const matched = /^V(\d+)_POKEMON_(.+)$/.exec(id);
  if (!matched) continue;
  const settings = item.data?.pokemonSettings;
  if (!settings) continue;
  const dex = Number(matched[1]);
  const species = settings.pokemonId ?? "";
  if (species) speciesDex.set(species, dex);
  templates.push({ dex, species, gmForm: settings.form ?? null, settings });
}

const childMap = new Map();
const parentMap = new Map();

function addChild(parentDex, parentForm, childDex, childForm) {
  if (!parentForm || !childForm) return;
  if (!statsBy.has(`${parentDex}:${parentForm}`) || !statsBy.has(`${childDex}:${childForm}`)) return;
  if (parentDex === childDex && parentForm === childForm) return;
  const key = `${parentDex}:${parentForm}`;
  const list = childMap.get(key) ?? [];
  if (!list.some((child) => child.pokemonId === childDex && child.form === childForm)) {
    list.push({ pokemonId: childDex, form: childForm });
    childMap.set(key, list);
  }
  const childKey = `${childDex}:${childForm}`;
  if (!parentMap.has(childKey)) {
    parentMap.set(childKey, { pokemonId: parentDex, form: parentForm });
  }
}

let unresolved = 0;
for (const template of templates) {
  const parentForm = resolveForm(template.dex, template.species, template.gmForm);
  if (!parentForm) continue;
  for (const branch of template.settings.evolutionBranch ?? []) {
    if (branch.temporaryEvolution || !branch.evolution) continue;
    const childDex = speciesDex.get(branch.evolution);
    if (!childDex) {
      unresolved += 1;
      continue;
    }
    let childForm = branch.form ? resolveForm(childDex, branch.evolution, branch.form) : null;
    if (!childForm) {
      const forms = statsForms.get(childDex);
      if (forms?.has("Normal")) childForm = "Normal";
      else if (forms?.size === 1) childForm = [...forms][0];
    }
    if (!childForm) {
      unresolved += 1;
      continue;
    }
    addChild(template.dex, parentForm, childDex, childForm);
  }
}

const COSTUME =
  /copy_|fall_|winter_|summer_|spring_|costume|tshirt|adventure|diwali|doctor|flying_|gofest|gotour|horizons|jeju|kariyushi|kurta|pop_star|rock_star|vs_|wcs_|swim_|wildarea|20\d{2}/i;

const linked = new Set();
for (const list of childMap.values()) {
  for (const child of list) linked.add(`${child.pokemonId}:${child.form}`);
}

function fallbackParentForm(parentDex, childForm) {
  const forms = statsForms.get(parentDex);
  if (!forms) return null;
  for (const token of ["Alola", "Galarian", "Hisuian", "Paldea"]) {
    if (childForm.includes(token) && forms.has(token)) return token;
  }
  return forms.has("Normal") ? "Normal" : null;
}

const fallback = [];
for (const template of templates) {
  const childForm = resolveForm(template.dex, template.species, template.gmForm);
  if (!childForm || COSTUME.test(childForm)) continue;
  const childKey = `${template.dex}:${childForm}`;
  if (linked.has(childKey)) continue;
  const parentSpecies = template.settings.parentPokemonId;
  if (!parentSpecies) continue;
  const parentDex = speciesDex.get(parentSpecies);
  const parentForm = fallbackParentForm(parentDex, childForm);
  if (!parentDex || !parentForm) continue;
  addChild(parentDex, parentForm, template.dex, childForm);
  linked.add(childKey);
  fallback.push(`${childKey} <- ${parentDex}:${parentForm}`);
}

function movesOf(dex, form) {
  return pvpBy.get(`${dex}:${form}`) ?? pvpBy.get(`${dex}:Normal`) ?? null;
}

function signature(dex, form, attack, defense, stamina, types) {
  const moves = movesOf(dex, form);
  const typeList = (types ?? moves?.types ?? []).slice().sort();
  const fast = (moves?.fast ?? []).slice().sort();
  const charged = (moves?.charged ?? []).slice().sort();
  return `${attack}|${defense}|${stamina}|${typeList.join(",")}|${fast.join(",")}|${charged.join(",")}`;
}

const signatures = {};
for (const row of stats) {
  signatures[`${row.pokemon_id}:${row.form}`] = signature(
    row.pokemon_id,
    row.form,
    row.base_attack,
    row.base_defense,
    row.base_stamina,
  );
}

const MEGA_ORDER = ["TEMP_EVOLUTION_MEGA", "TEMP_EVOLUTION_MEGA_X", "TEMP_EVOLUTION_MEGA_Y"];
const megaSeen = new Set();
const megas = [];
for (const template of templates) {
  const baseForm = resolveForm(template.dex, template.species, template.gmForm);
  if (!baseForm) continue;
  for (const evo of template.settings.tempEvoOverrides ?? []) {
    const tempId = evo.tempEvoId ?? "";
    if (!MEGA_ORDER.includes(tempId)) continue;
    const mega = tempId.replace("TEMP_EVOLUTION_", "");
    const key = `${template.dex}:${baseForm}:${mega}`;
    if (megaSeen.has(key)) continue;
    megaSeen.add(key);
    const attack = evo.stats?.baseAttack;
    const defense = evo.stats?.baseDefense;
    const stamina = evo.stats?.baseStamina;
    if (attack == null || defense == null || stamina == null) continue;
    const types = [evo.typeOverride1, evo.typeOverride2]
      .filter(Boolean)
      .map((type) => type.replace("POKEMON_TYPE_", "").toLowerCase())
      .sort();
    const inherited = types.length > 0 ? types : (movesOf(template.dex, baseForm)?.types ?? []).slice().sort();
    megas.push({
      pokemonId: template.dex,
      baseForm,
      mega,
      attack,
      defense,
      stamina,
      types: inherited,
      spriteSuffix: null,
      signature: signature(template.dex, baseForm, attack, defense, stamina, inherited),
    });
  }
}

function pngWidth(file) {
  const buf = fs.readFileSync(file);
  if (buf.length < 24 || buf.toString("ascii", 1, 4) !== "PNG") return null;
  return buf.readUInt32BE(16);
}

const byDex = new Map();
for (const mega of megas) {
  const list = byDex.get(mega.pokemonId) ?? [];
  list.push(mega);
  byDex.set(mega.pokemonId, list);
}

for (const [dex, list] of byDex) {
  const forms = statsForms.get(dex) ?? new Set();
  const used = new Set();
  for (const form of forms) {
    const suffix = pokemonFormSpriteSuffix(dex, form);
    if (suffix) used.add(suffix);
  }
  const free = [];
  for (let suffix = 1; suffix <= 12; suffix += 1) {
    const file = path.join(root, "Image/sprite", `${dex}-${suffix}.png`);
    if (!fs.existsSync(file)) continue;
    if (pngWidth(file) !== 64) continue;
    if (used.has(suffix)) continue;
    free.push(suffix);
  }
  list.sort((a, b) => MEGA_ORDER.indexOf(`TEMP_EVOLUTION_${a.mega}`) - MEGA_ORDER.indexOf(`TEMP_EVOLUTION_${b.mega}`));
  const assigned = new Map();
  for (const mega of list) {
    if (!assigned.has(mega.mega)) assigned.set(mega.mega, free.shift() ?? null);
    mega.spriteSuffix = assigned.get(mega.mega);
  }
}

const children = {};
for (const [key, list] of [...childMap.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
  children[key] = list.sort((a, b) => a.pokemonId - b.pokemonId || a.form.localeCompare(b.form));
}
const parents = Object.fromEntries([...parentMap.entries()].sort((a, b) => a[0].localeCompare(b[0])));
megas.sort((a, b) => a.pokemonId - b.pokemonId || a.baseForm.localeCompare(b.baseForm) || a.mega.localeCompare(b.mega));

const out = { children, parents, signature: signatures, megas };
const dest = path.join(root, "public/data/pokemon_evolutions.json");
fs.writeFileSync(dest, `${JSON.stringify(out)}\n`);

console.log(
  JSON.stringify(
    {
      children: Object.keys(children).length,
      parents: Object.keys(parents).length,
      signatures: Object.keys(signatures).length,
      megas: megas.length,
      unresolved,
      fallback,
      charmander: children["4:Normal"],
      charmeleon: children["5:Normal"],
      charizardMegas: megas.filter((mega) => mega.pokemonId === 6),
      pikachu: children["25:Normal"],
      eevee: children["133:Normal"],
      meowthAlola: children["52:Alola"],
      meowth: children["52:Normal"],
    },
    null,
    2,
  ),
);
