/**
 * ku6-3naTool の表データをサイト用カタログにし、既存の技名をそちらへ揃える。
 * 種族値と威力は ku6 に無いので、今の pvp_bundle の数値は残す。
 * 実行: node scripts/generate-sheet-catalog.mjs
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const catalogPath = path.join(root, "public/data/sheet_catalog.json");
const bundlePath = path.join(root, "public/data/pvp_bundle.json");

const RAW = "https://raw.githubusercontent.com/kurosana/ku6-3naTool/main/Data";

const ENGLISH_ALIASES = {
  "weather ball (fire)": "ウェザーボール(ほのお)",
  "weather ball (water)": "ウェザーボール(みず)",
  "weather ball (ice)": "ウェザーボール(こおり)",
  "weather ball (rock)": "ウェザーボール(いわ)",
  "weather ball (normal)": "ウェザーボール",
  "techno blast (burn)": "テクノバスター(ほのお)",
  "techno blast (chill)": "テクノバスター(こおり)",
  "techno blast (shock)": "テクノバスター(でんき)",
  "techno blast (douse)": "テクノバスター(みず)",
  "techno blast (normal)": "テクノバスター",
};

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else quoted = false;
      } else cell += char;
      continue;
    }
    if (char === '"') {
      quoted = true;
      continue;
    }
    if (char === ",") {
      row.push(cell);
      cell = "";
      continue;
    }
    if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }
    if (char !== "\r") cell += char;
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((item) => item.some((value) => value.length > 0));
}

async function fetchText(file) {
  const response = await fetch(`${RAW}/${encodeURIComponent(file)}`);
  if (!response.ok) throw new Error(`${file} ${response.status}`);
  return response.text();
}

function foldWidth(value) {
  return String(value ?? "").replace(/[０-９Ａ-Ｚａ-ｚ]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0));
}

function englishKey(value) {
  return foldWidth(value)
    .toLowerCase()
    .replace(/＋/g, "+")
    .replace(/[’']/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

const COMBAT_NAME_ALIASES = {
  "オーラぐるま(あく)": "AURA_WHEEL_DARK",
  "オーラぐるま(でんき)": "AURA_WHEEL_ELECTRIC",
};

const [moveListText, moveEnglishText, pokemonText, learnText] = await Promise.all([
  fetchText("move_list.csv"),
  fetchText("move_englist.csv"),
  fetchText("pokemon_list.csv"),
  fetchText("poke_movelist.csv"),
]);

const jaByEnglish = new Map(Object.entries(ENGLISH_ALIASES));
for (const row of parseCsv(moveEnglishText).slice(1)) {
  const ja = row[0]?.trim();
  const en = row[1]?.trim();
  if (!ja || !en || ja === "和名") continue;
  jaByEnglish.set(englishKey(en), ja);
}

const moveRows = parseCsv(moveListText);
const moves = moveRows.map((row) => ({
  name: row[1],
  type: row[2],
  priority: Number(row[3]) || 0,
  sheetNo: Number(row[4]) || 0,
  en: "",
  combatId: null,
}));

const learnByKey = new Map();
for (const row of parseCsv(learnText)) {
  const flag = row[0];
  const key = row[1];
  const names = row.slice(3).map((name) => name.trim()).filter(Boolean);
  const entry = learnByKey.get(key) ?? { fast: [], charged: [], extra: [] };
  if (flag === "0") entry.fast = names;
  else if (flag === "1") entry.charged = names;
  else if (flag === "2") entry.extra = names;
  learnByKey.set(key, entry);
}

const bundle = JSON.parse(await fs.readFile(bundlePath, "utf8"));
const combatByEnglish = new Map();
const combatByJapanese = new Map();
let renamed = 0;
for (const move of Object.values(bundle.moves)) {
  const key = englishKey(move.en);
  const ja = jaByEnglish.get(key);
  if (ja && ja !== move.name) {
    move.name = ja;
    renamed += 1;
  }
  combatByEnglish.set(key, move.id);
  combatByJapanese.set(foldWidth(move.name), move.id);
}

for (const move of moves) {
  const en = [...jaByEnglish.entries()].find(([, ja]) => ja === move.name)?.[0] ?? "";
  move.en = en;
  move.combatId =
    COMBAT_NAME_ALIASES[move.name] ??
    combatByJapanese.get(foldWidth(move.name)) ??
    (en ? combatByEnglish.get(en) ?? null : null);
}

function combatIds(names) {
  return names.map((name) => COMBAT_NAME_ALIASES[name] ?? combatByJapanese.get(foldWidth(name)) ?? null);
}

const pokemon = parseCsv(pokemonText).map((row) => {
  const key = row[0];
  const dexPart = key.split("-")[0];
  const learn = learnByKey.get(key) ?? { fast: [], charged: [], extra: [] };
  return {
    key,
    dex: Number(dexPart),
    name: row[1],
    tag: row[7] || "",
    defaultMoves: [row[4], row[5], row[6]].map((name) => name.trim()).filter(Boolean),
    fast: learn.fast,
    charged: learn.charged,
    extra: learn.extra,
    fastIds: combatIds(learn.fast),
    chargedIds: combatIds(learn.charged),
    extraIds: combatIds(learn.extra),
  };
});

const catalog = {
  source: "https://github.com/kurosana/ku6-3naTool",
  note: "表のポケモン・技・覚える技。威力と種族値は pvp_bundle と pokemon_stats を使う。extra はメガシンカ中の追加スペシャルアタック。",
  pokemon,
  moves,
};

await fs.writeFile(catalogPath, JSON.stringify(catalog));
await fs.writeFile(bundlePath, JSON.stringify(bundle));

const unmatchedExtra = pokemon.flatMap((mon) => mon.extra.filter((_, index) => mon.extraIds[index] == null));
console.log(
  `catalog pokemon=${pokemon.length} moves=${moves.length} renamed=${renamed} unmatchedExtra=${[...new Set(unmatchedExtra)].join(",")}`,
);
