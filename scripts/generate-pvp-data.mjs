import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const outputPath = path.join(projectRoot, "public/data/pvp_bundle.json");

const SOURCES = {
  moves: "https://raw.githubusercontent.com/pvpoke/pvpoke/master/src/data/gamemaster/moves.json",
  pokemonMoves: "https://pogoapi.net/api/v1/current_pokemon_moves.json",
  pokemonTypes: "https://pogoapi.net/api/v1/pokemon_types.json",
  moveNames: "https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv/move_names.csv",
};

const NAME_OVERRIDES = {
  "weather ball fire": "ウェザーボール（ほのお）",
  "weather ball water": "ウェザーボール（みず）",
  "weather ball ice": "ウェザーボール（こおり）",
  "weather ball rock": "ウェザーボール（いわ）",
  "weather ball normal": "ウェザーボール",
  "techno blast": "テクノバスター",
  "techno blast burn": "テクノバスター（ほのお）",
  "techno blast chill": "テクノバスター（こおり）",
  "techno blast shock": "テクノバスター（でんき）",
  "techno blast water": "テクノバスター（みず）",
  "hidden power": "めざめるパワー",
  "hidden power (bug)": "めざめるパワー(むし)",
  "hidden power (dark)": "めざめるパワー(あく)",
  "hidden power (dragon)": "めざめるパワー(ドラゴン)",
  "hidden power (electric)": "めざめるパワー(でんき)",
  "hidden power (fighting)": "めざめるパワー(かくとう)",
  "hidden power (fire)": "めざめるパワー(ほのお)",
  "hidden power (flying)": "めざめるパワー(ひこう)",
  "hidden power (ghost)": "めざめるパワー(ゴースト)",
  "hidden power (grass)": "めざめるパワー(くさ)",
  "hidden power (ground)": "めざめるパワー(じめん)",
  "hidden power (ice)": "めざめるパワー(こおり)",
  "hidden power (poison)": "めざめるパワー(どく)",
  "hidden power (psychic)": "めざめるパワー(エスパー)",
  "hidden power (rock)": "めざめるパワー(いわ)",
  "hidden power (steel)": "めざめるパワー(はがね)",
  "hidden power (water)": "めざめるパワー(みず)",
  "aura wheel": "オーラぐるま",
  "triple axel": "トリプルアクセル",
  "trailblaze": "くさわけ",
  "pounce": "とびかかる",
  "rage fist": "ふんどのこぶし",
  "upper hand": "はんすう",
  "psychic fangs": "サイコファング",
  "high jump kick": "とびひざげり",
  "sacred sword": "せいなるつるぎ",
  "fly": "そらをとぶ",
  "incinerate": "やきつくす",
  "lock on": "ロックオン",
  "geomancy": "ジオコントロール",
  "obstruct": "ブロッキング",
  "breaking swipe": "ワイドブレイカー",
  "lunge": "とびかかる",
  "leafage": "このは",
  "fairy wind": "ようせいのかぜ",
  "water shuriken": "みずしゅりけん",
  "force palm": "はっけい",
  "double kick": "にだんげり",
  "magical leaf": "マジカルリーフ",
  "sand tomb": "すなじごく",
  "dragon breath": "りゅうのいぶき",
  "mud slap": "どろかけ",
  "mud-slap": "どろかけ",
  "future sight": "みらいよち",
  "frenzy plant": "ハードプラント",
  "blast burn": "ブラストバーン",
  "hydro cannon": "ハイドロカノン",
  "meteor mash": "コメットパンチ",
  "shadow claw": "シャドークロー",
  "shadow sneak": "かげうち",
  "shadow punch": "シャドーパンチ",
  "shadow ball": "シャドーボール",
  "aura sphere": "はどうだん",
  "origin pulse": "こんげんのはどう",
  "precipice blades": "だんがいのつるぎ",
  "oblivion wing": "デスウイング",
  "parabolic charge": "パラボラチャージ",
  "natures madness": "しぜんのいかり",
  "nature's madness": "しぜんのいかり",
  "brutal swing": "ぶんまわす",
  "liquidation": "アクアブレイク",
  "power-up punch": "グロウパンチ",
  "power up punch": "グロウパンチ",
  "cross chop": "クロスチョップ",
  "superpower": "ばかぢから",
  "close combat": "インファイト",
  "leaf blade": "リーフブレード",
  "leaf storm": "リーフストーム",
  "seed bomb": "タネばくだん",
  "power whip": "パワーウィップ",
  "sludge bomb": "ヘドロばくだん",
  "sludge wave": "ヘドロウェーブ",
  "body slam": "のしかかり",
  "ice punch": "れいとうパンチ",
  "thunder punch": "かみなりパンチ",
  "fire punch": "ほのおのパンチ",
  "dynamic punch": "ばくれつパンチ",
  "focus blast": "きあいだま",
  "surf": "なみのり",
  "aqua tail": "アクアテール",
  "icy wind": "こごえるかぜ",
  "dragon claw": "ドラゴンクロー",
  "outrage": "げきりん",
  "draco meteor": "りゅうせいぐん",
  "earthquake": "じしん",
  "earth power": "だいちのちから",
  "rock slide": "いわなだれ",
  "stone edge": "ストーンエッジ",
  "wild charge": "ワイルドボルト",
  "thunderbolt": "10まんボルト",
  "discharge": "ほうでん",
  "volt switch": "ボルトチェンジ",
  "scald": "ねっとう",
  "hydro pump": "ハイドロポンプ",
  "flamethrower": "かえんほうしゃ",
  "fire blast": "だいもんじ",
  "overheat": "オーバーヒート",
  "psychic": "サイコキネシス",
  "psystrike": "サイコブレイク",
  "moonblast": "ムーンフォース",
  "dazzling gleam": "マジカルシャイン",
  "play rough": "じゃれつく",
  "crunch": "かみくだく",
  "foul play": "イカサマ",
  "dark pulse": "あくのはどう",
  "night slash": "つじぎり",
  "x-scissor": "シザークロス",
  "bug buzz": "むしのさざめき",
  "lunge": "とびかかる",
  "poison fang": "どくどくのキバ",
  "cross poison": "クロスポイズン",
  "gunk shot": "ダストシュート",
  "aerial ace": "つばめがえし",
  "brave bird": "ブレイブバード",
  "sky attack": "ゴッドバード",
  "drill peck": "ドリルくちばし",
  "hurricane": "ぼうふう",
  "blizzard": "ふぶき",
  "ice beam": "れいとうビーム",
  "avalanche": "ゆきなだれ",
  "triple axel": "トリプルアクセル",
  "meteor beam": "メテオビーム",
  "ancient power": "げんしのちから",
  "zap cannon": "でんじほう",
  "flash cannon": "ラスターカノン",
  "iron head": "アイアンヘッド",
  "heavy slam": "ヘビーボンバー",
  "gyro ball": "ジャイロボール",
  "mirror shot": "ミラーショット",
  "magnet bomb": "マグネットボム",
  "doom desire": "はめつのねがい",
  "sacred fire": "せいなるほのお",
  "aeroblast": "エアロブラスト",
  "fusion bolt": "クロスサンダー",
  "fusion flare": "クロスフレイム",
  "blue flare": "あおいほのお",
  "bolt strike": "らいげき",
  "oblivion wing": "デスウイング",
  "dragon ascent": "ガリョウテンセイ",
  "v-create": "Vジェネレート",
  "sacred sword": "せいなるつるぎ",
  "secret sword": "しんぴのつるぎ",
  "high horsepower": "じだんだ",
  "stomping tantrum": "じだんだ",
  "trailblaze": "くさわけ",
};

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`failed ${url}: ${res.status}`);
  return res.json();
}

async function fetchText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`failed ${url}: ${res.status}`);
  return res.text();
}

function parseMoveNameCsv(csv) {
  const enToJa = new Map();
  for (const line of csv.split(/\r?\n/).slice(1)) {
    if (!line.trim()) continue;
    const parts = line.split(",");
    if (parts.length < 3) continue;
    const language = parts[1];
    const name = parts.slice(2).join(",").replace(/^"|"$/g, "");
    const id = parts[0];
    if (language === "9") enToJa.set(id, { en: name, ja: enToJa.get(id)?.ja ?? "" });
    if (language === "11") {
      const current = enToJa.get(id) ?? { en: "", ja: name };
      current.ja = name;
      enToJa.set(id, current);
    }
  }
  const byEnglish = new Map();
  for (const { en, ja } of enToJa.values()) {
    if (en && ja) byEnglish.set(en.toLowerCase(), ja);
  }
  return byEnglish;
}

function japaneseName(englishName, byEnglish) {
  const key = englishName.toLowerCase().replace(/[’']/g, "'");
  return NAME_OVERRIDES[key] ?? byEnglish.get(key) ?? NAME_OVERRIDES[key.replace(/-/g, " ")] ?? englishName;
}

function compactMove(move, jaName) {
  const kind = move.energyGain > 0 || (move.energy === 0 && (move.turns ?? 0) >= 1 && move.power < 40)
    ? "fast"
    : "charged";
  const record = {
    id: move.moveId,
    name: jaName,
    en: move.name,
    type: String(move.type ?? "normal").toLowerCase(),
    power: move.power ?? 0,
    energy: move.energy ?? 0,
    energyGain: move.energyGain ?? 0,
    turns: move.turns ?? (kind === "fast" ? Math.max(1, Math.round((move.cooldown ?? 500) / 500)) : 1),
    kind: move.energyGain > 0 ? "fast" : "charged",
  };
  if (move.buffs) {
    record.buffs = move.buffs;
    record.buffTarget = move.buffTarget ?? "self";
    record.buffChance = Number(move.buffApplyChance ?? 1);
  }
  return record;
}

function unique(list) {
  return [...new Set(list.filter(Boolean))];
}

function resolveMoveIds(names, byEnglishName) {
  return unique(
    names.map((name) => {
      const found = byEnglishName.get(name.toLowerCase());
      return found?.id ?? null;
    }),
  );
}

const [rawMoves, rawLearnsets, rawTypes, nameCsv] = await Promise.all([
  fetchJson(SOURCES.moves),
  fetchJson(SOURCES.pokemonMoves),
  fetchJson(SOURCES.pokemonTypes),
  fetchText(SOURCES.moveNames),
]);

/**
 * PvPoke の moves.json には、既存の技の数値をポケモン名つきで複製したエントリがある。
 * Water Gun Fast Blastoise と Hydro Pump Blastoise は、みずでっぽうとハイドロポンプと同じ系統の複製で、
 * どのポケモンの習得リストにも無い。日本語名にも当たらず、技検索に英語のまま出る。
 */
const SKIP_MOVE_IDS = new Set(["WATER_GUN_FAST_BLASTOISE", "HYDRO_PUMP_BLASTOISE"]);

const jaByEnglish = parseMoveNameCsv(nameCsv);
const moves = {};
const byEnglishName = new Map();

for (const move of rawMoves) {
  if (!move?.moveId || SKIP_MOVE_IDS.has(move.moveId)) continue;
  const ja = japaneseName(move.name ?? move.moveId, jaByEnglish);
  const compact = compactMove(move, ja);
  moves[compact.id] = compact;
  byEnglishName.set(String(move.name).toLowerCase(), compact);
}

const typeKey = (row) => `${row.pokemon_id}::${row.form ?? "Normal"}`;
const typesByKey = new Map();
for (const row of rawTypes) {
  typesByKey.set(typeKey(row), (row.type ?? []).map((type) => String(type).toLowerCase()));
}

const pokemon = [];
let missingMoves = 0;

for (const row of rawLearnsets) {
  const key = typeKey(row);
  const fast = resolveMoveIds([...(row.fast_moves ?? []), ...(row.elite_fast_moves ?? [])], byEnglishName);
  const charged = resolveMoveIds(
    [...(row.charged_moves ?? []), ...(row.elite_charged_moves ?? [])],
    byEnglishName,
  );
  missingMoves += (row.fast_moves?.length ?? 0) + (row.charged_moves?.length ?? 0) - (fast.length + charged.length);
  pokemon.push({
    pokemonId: row.pokemon_id,
    name: row.pokemon_name,
    form: row.form ?? "Normal",
    types: typesByKey.get(key) ?? typesByKey.get(`${row.pokemon_id}::Normal`) ?? ["normal"],
    fast,
    charged,
  });
}

const bundle = { moves, pokemon };
await fs.writeFile(outputPath, JSON.stringify(bundle));
console.log(
  `Wrote ${outputPath} (${Object.keys(moves).length} moves, ${pokemon.length} pokemon, unmatched leftover=${missingMoves})`,
);
