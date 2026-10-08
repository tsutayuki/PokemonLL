const DOT_SPRITE_SIZE = 64;
const PLACEHOLDER = "/Image/sprite/Question_Mark.png";

const COSTUME =
  /copy_|fall_|winter_|summer_|spring_|costume|tshirt|adventure|diwali|doctor|flying_|gofest|gotour|horizons|jeju|kariyushi|kurta|pop_star|rock_star|vs_|wcs_|swim_|20\d{2}/i;

/**
 * 添字 0 は `Image/sprite/{id}.png`。
 * それ以降は `Image/sprite/{id}-{n}.png`（n は 1 始まり）。
 * 色や体の差で確認できた並び（アローラライチュウ=26-1、メガリザードンX/Y、キョダイマックスは 128px）に合わせている。
 */
const FORM_ORDER: Record<number, readonly string[]> = {
  52: ["Normal", "Alola", "Galarian"],
  128: ["Normal", "Paldea_combat", "Paldea_blaze", "Paldea_aqua"],
  201: [
    ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ".split(""),
    "Exclamation_point",
    "Question_mark",
  ],
  351: ["Normal", "Sunny", "Rainy", "Snowy"],
  386: ["Normal", "Attack", "Defense", "Speed"],
  412: ["Plant", "Sandy", "Trash"],
  413: ["Plant", "Sandy", "Trash"],
  421: ["Overcast", "Sunny"],
  422: ["West_sea", "East_sea"],
  423: ["West_sea", "East_sea"],
  479: ["Normal", "Heat", "Wash", "Frost", "Fan", "Mow"],
  487: ["Altered", "Origin"],
  492: ["Land", "Sky"],
  493: typeForms(),
  550: ["Red_striped", "Blue_striped", "White_striped"],
  555: ["Standard", "Zen", "Galarian_standard", "Galarian_zen"],
  585: ["Spring", "Summer", "Autumn", "Winter"],
  586: ["Spring", "Summer", "Autumn", "Winter"],
  641: ["Incarnate", "Therian"],
  642: ["Incarnate", "Therian"],
  645: ["Incarnate", "Therian"],
  646: ["Normal", "Black", "White"],
  647: ["Ordinary", "Resolute"],
  648: ["Aria", "Pirouette"],
  649: ["Normal", "Douse", "Shock", "Burn", "Chill"],
  666: [
    "Meadow", "Continental", "Garden", "Elegant", "Icy_snow", "Modern", "Marine", "Archipelago",
    "High_plains", "Sandstorm", "River", "Monsoon", "Savanna", "Sun", "Ocean", "Jungle", "Fancy",
    "Pokeball", "Polar", "Tundra",
  ],
  669: ["Red", "Yellow", "Orange", "White", "Blue"],
  670: ["Red", "Yellow", "Orange", "White", "Blue"],
  671: ["Red", "Yellow", "Orange", "White", "Blue"],
  676: ["Natural", "Dandy", "Debutante", "Diamond", "Heart", "Kabuki", "La_reine", "Matron", "Pharaoh", "Star"],
  681: ["Shield", "Blade"],
  711: ["Small", "Average", "Large", "Super"],
  720: ["Confined", "Unbound"],
  741: ["Baile", "Pompom", "Pau", "Sensu"],
  745: ["Midday", "Midnight", "Dusk"],
  746: ["Solo", "School"],
  773: typeForms(),
  774: ["Core", "Red", "Orange", "Yellow", "Green", "Blue", "Indigo", "Violet"],
  778: ["Disguised", "Busted"],
  800: ["Normal", "Dusk_mane", "Dawn_wings", "Ultra"],
  849: ["Amped", "Low_key"],
  875: ["Ice", "Noice"],
  876: ["Male", "Female"],
  877: ["Full_belly", "Hangry"],
  888: ["Hero", "Crowned_sword"],
  889: ["Hero", "Crowned_shield"],
  892: ["Single_strike", "Rapid_strike"],
  898: ["Normal", "Ice_rider", "Shadow_rider"],
  905: ["Incarnate", "Therian"],
  925: ["Family_of_three", "Family_of_four"],
  931: ["Green", "Yellow", "Blue", "White"],
  964: ["Zero", "Hero"],
  978: ["Curly", "Droopy", "Stretchy"],
  982: ["Two", "Three"],
};

/** 地域・性別など、差分が1枚だけのときに `{id}-1.png` を使うフォルム。 */
const ALT_SUFFIX_ONE = new Set([
  "Alola",
  "Galarian",
  "Hisuian",
  "Paldea",
  "Origin",
  "Female",
  "Apex",
  "Ultimate",
  "Sky",
  "Therian",
  "Resolute",
  "Pirouette",
  "Blade",
  "Unbound",
  "School",
  "Busted",
  "Low_key",
  "Noice",
  "Hangry",
  "Crowned_sword",
  "Crowned_shield",
  "Rapid_strike",
  "Family_of_four",
  "Three",
]);

function typeForms() {
  return [
    "Normal",
    "Fighting",
    "Flying",
    "Poison",
    "Ground",
    "Rock",
    "Bug",
    "Ghost",
    "Steel",
    "Fire",
    "Water",
    "Grass",
    "Electric",
    "Psychic",
    "Ice",
    "Dragon",
    "Dark",
    "Fairy",
  ];
}

export function pokemonFormSpriteSuffix(pokemonId: number, form?: string) {
  if (!form || form === "Normal" || COSTUME.test(form)) return null;
  const order = FORM_ORDER[Math.floor(pokemonId)];
  if (order) {
    const index = order.indexOf(form);
    return index > 0 ? index : null;
  }
  if (ALT_SUFFIX_ONE.has(form)) return 1;
  return null;
}

export function pokemonSpriteCandidates(
  pokemonId: number,
  form?: string,
  options?: { exact?: boolean; suffix?: number | null },
) {
  const id = Math.max(1, Math.floor(pokemonId));
  if (options?.exact) {
    if (options.suffix != null && options.suffix > 0) {
      return [`/Image/sprite/${id}-${options.suffix}.png`, PLACEHOLDER];
    }
    return [PLACEHOLDER];
  }
  const suffix = pokemonFormSpriteSuffix(id, form);
  const paths: string[] = [];
  if (suffix) paths.push(`/Image/sprite/${id}-${suffix}.png`);
  paths.push(`/Image/sprite/${id}.png`);
  paths.push(PLACEHOLDER);
  return paths;
}

export function pokemonDexPlaceholderPath() {
  return PLACEHOLDER;
}

export function pokemonDotSpriteSize() {
  return DOT_SPRITE_SIZE;
}
