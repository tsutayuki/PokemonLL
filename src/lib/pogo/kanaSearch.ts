/**
 * ポケモン名検索。カタカナの図鑑名に対して、ひらがな・カタカナ・ローマ字（ヘボン式・訓令式）の部分一致を通す。
 */

const KATAKANA_START = 0x30a1;
const HIRAGANA_START = 0x3041;

const COMPOUND: Array<[string, string]> = [
  ["kya", "きゃ"], ["kyu", "きゅ"], ["kyo", "きょ"],
  ["gya", "ぎゃ"], ["gyu", "ぎゅ"], ["gyo", "ぎょ"],
  ["sha", "しゃ"], ["shu", "しゅ"], ["sho", "しょ"],
  ["sya", "しゃ"], ["syu", "しゅ"], ["syo", "しょ"],
  ["ja", "じゃ"], ["ju", "じゅ"], ["jo", "じょ"],
  ["jya", "じゃ"], ["jyu", "じゅ"], ["jyo", "じょ"],
  ["zya", "じゃ"], ["zyu", "じゅ"], ["zyo", "じょ"],
  ["cha", "ちゃ"], ["chu", "ちゅ"], ["cho", "ちょ"],
  ["tya", "ちゃ"], ["tyu", "ちゅ"], ["tyo", "ちょ"],
  ["nya", "にゃ"], ["nyu", "にゅ"], ["nyo", "にょ"],
  ["hya", "ひゃ"], ["hyu", "ひゅ"], ["hyo", "ひょ"],
  ["bya", "びゃ"], ["byu", "びゅ"], ["byo", "びょ"],
  ["pya", "ぴゃ"], ["pyu", "ぴゅ"], ["pyo", "ぴょ"],
  ["mya", "みゃ"], ["myu", "みゅ"], ["myo", "みょ"],
  ["rya", "りゃ"], ["ryu", "りゅ"], ["ryo", "りょ"],
  ["fa", "ふぁ"], ["fi", "ふぃ"], ["fe", "ふぇ"], ["fo", "ふぉ"],
  ["tsa", "つぁ"], ["tsi", "つぃ"], ["tse", "つぇ"], ["tso", "つぉ"],
  ["shi", "し"], ["chi", "ち"], ["tsu", "つ"], ["fu", "ふ"],
  ["si", "し"], ["ti", "ち"], ["tu", "つ"], ["hu", "ふ"],
  ["ji", "じ"], ["zi", "じ"],
  ["xa", "ぁ"], ["xi", "ぃ"], ["xu", "ぅ"], ["xe", "ぇ"], ["xo", "ぉ"],
  ["la", "ぁ"], ["li", "ぃ"], ["lu", "ぅ"], ["le", "ぇ"], ["lo", "ぉ"],
  ["xya", "ゃ"], ["xyu", "ゅ"], ["xyo", "ょ"],
  ["lya", "ゃ"], ["lyu", "ゅ"], ["lyo", "ょ"],
  ["xtu", "っ"], ["xtsu", "っ"], ["ltu", "っ"], ["ltsu", "っ"],
];

const SINGLE: Record<string, string> = {
  a: "あ", i: "い", u: "う", e: "え", o: "お",
  ka: "か", ki: "き", ku: "く", ke: "け", ko: "こ",
  ga: "が", gi: "ぎ", gu: "ぐ", ge: "げ", go: "ご",
  sa: "さ", su: "す", se: "せ", so: "そ",
  za: "ざ", zu: "ず", ze: "ぜ", zo: "ぞ",
  ta: "た", te: "て", to: "と",
  da: "だ", de: "で", do: "ど",
  na: "な", ni: "に", nu: "ぬ", ne: "ね", no: "の",
  ha: "は", hi: "ひ", he: "へ", ho: "ほ",
  ba: "ば", bi: "び", bu: "ぶ", be: "べ", bo: "ぼ",
  pa: "ぱ", pi: "ぴ", pu: "ぷ", pe: "ぺ", po: "ぽ",
  ma: "ま", mi: "み", mu: "む", me: "め", mo: "も",
  ya: "や", yu: "ゆ", yo: "よ",
  ra: "ら", ri: "り", ru: "る", re: "れ", ro: "ろ",
  wa: "わ", wi: "うぃ", we: "うぇ", wo: "を",
  n: "ん",
};

const VOWEL = new Set(["a", "i", "u", "e", "o", "y"]);

function kataToHiraChar(char: string) {
  const code = char.codePointAt(0) ?? 0;
  if (code >= KATAKANA_START && code <= 0x30f6) {
    return String.fromCodePoint(code - KATAKANA_START + HIRAGANA_START);
  }
  return char;
}

export function toHiragana(value: string) {
  return [...value].map(kataToHiraChar).join("");
}

function previousVowel(hiragana: string) {
  const last = hiragana.slice(-1);
  if ("あかさたなはまやらわがざだばぱぁゃ".includes(last)) return "あ";
  if ("いきしちにひみりぎじぢびぴぃ".includes(last)) return "い";
  if ("うくすつぬふむゆるぐずづぶぷぅゅ".includes(last)) return "う";
  if ("えけせてねへめれげぜでべぺぇ".includes(last)) return "え";
  if ("おこそとのほもよろをごぞどぼぽぉょを".includes(last)) return "お";
  return "";
}

/** 長音を母音の繰り返しにした形と、長音を落とした形の両方を返す。 */
export function expandLongVowel(hiragana: string) {
  let stretched = "";
  let stripped = "";
  for (const char of hiragana) {
    if (char === "ー") {
      const vowel = previousVowel(stretched);
      stretched += vowel;
      continue;
    }
    stretched += char;
    stripped += char;
  }
  return [stretched, stripped];
}

function romajiToHiragana(romaji: string) {
  const source = romaji.replace(/l/g, "r");
  let out = "";
  let i = 0;
  while (i < source.length) {
    const rest = source.slice(i);
    if (rest.startsWith("nn")) {
      out += "ん";
      i += 2;
      continue;
    }
    if (rest[0] === "n") {
      const next = rest[1] ?? "";
      if (!next || (!VOWEL.has(next) && next !== "n")) {
        out += "ん";
        i += 1;
        continue;
      }
    }
    const twin = rest[0] === rest[1] && rest[0] && !"aeioun".includes(rest[0]);
    if (twin) {
      out += "っ";
      i += 1;
      continue;
    }
    let consumed = "";
    let consumedHira = "";
    for (const [roma, hira] of COMPOUND) {
      if (rest.startsWith(roma) && roma.length > consumed.length) {
        consumed = roma;
        consumedHira = hira;
      }
    }
    if (consumed) {
      out += consumedHira;
      i += consumed.length;
      continue;
    }
    const two = rest.slice(0, 2);
    const one = rest.slice(0, 1);
    if (SINGLE[two]) {
      out += SINGLE[two];
      i += 2;
      continue;
    }
    if (SINGLE[one] && one !== "n") {
      out += SINGLE[one];
      i += 1;
      continue;
    }
    i += 1;
  }
  return out;
}

function queryHiraganaVariants(query: string) {
  const normalized = query.normalize("NFKC").toLowerCase().replace(/[\s・･._\-ｰ'"’]/g, "").replace(/[♀♂]/g, "");
  const hira = toHiragana(normalized);
  const variants = new Set<string>(expandLongVowel(hira));
  if (/[a-z]/.test(normalized)) {
    const converted = romajiToHiragana(normalized.replace(/[^a-z]/g, ""));
    for (const variant of expandLongVowel(converted)) variants.add(variant);
  }
  return [...variants].filter((variant) => variant.length > 0);
}

function nameHiragana(name: string, stripPunctuation: boolean) {
  const pattern = stripPunctuation ? /[♀♂\s・･._\-ｰ'"’]/g : /[♀♂\s・･]/g;
  return expandLongVowel(toHiragana(name.normalize("NFKC").toLowerCase().replace(pattern, "")));
}

const RANK_EXACT = 0;
const RANK_PREFIX = 1;
const RANK_PARTIAL = 2;

function queryStretched(query: string) {
  const normalized = query.normalize("NFKC").toLowerCase().replace(/[\s・･._\-ｰ'"’]/g, "").replace(/[♀♂]/g, "");
  const stretched = new Set<string>();
  const own = expandLongVowel(toHiragana(normalized))[0];
  if (own) stretched.add(own);
  if (/[a-z]/.test(normalized)) {
    const converted = expandLongVowel(romajiToHiragana(normalized.replace(/[^a-z]/g, "")))[0];
    if (converted) stretched.add(converted);
  }
  return [...stretched].filter((variant) => variant.length > 0);
}

/**
 * 小さいほど先。0 は完全一致、1 は名前の先頭、2 は途中だけ。
 * 長音は伸ばした形で先頭を見る。ドオーの「オー」はドードーの「ドー」にしない。
 */
export function nameQueryRank(
  query: string,
  japanese: string,
  english: string,
  dex: number,
  aliases: readonly string[] = [],
) {
  const raw = query.normalize("NFKC").trim().toLowerCase();
  if (!raw) return null;
  let best: number | null = null;
  const keep = (rank: number) => {
    best = best == null ? rank : Math.min(best, rank);
  };

  const dexText = String(dex);
  if (dexText === raw || dexText.padStart(4, "0") === raw) keep(RANK_EXACT);

  const englishKey = english.toLowerCase().replace(/[\s._\-]/g, "");
  const queryKey = raw.replace(/[\s・･._\-ｰ'"’]/g, "");
  if (queryKey && englishKey === queryKey) keep(RANK_EXACT);
  else if (queryKey && englishKey.startsWith(queryKey)) keep(RANK_PREFIX);
  else if (queryKey && englishKey.includes(queryKey)) keep(RANK_PARTIAL);

  if (matchesNameExactly(raw, japanese, aliases)) keep(RANK_EXACT);

  const stretchedQuery = queryStretched(raw);
  const variants = queryHiraganaVariants(raw);
  for (const name of [japanese, ...aliases]) {
    const forms = nameHiragana(name, false);
    const stretched = forms[0] ?? "";
    if (stretchedQuery.some((variant) => stretched.startsWith(variant))) keep(RANK_PREFIX);
    if (variants.some((variant) => forms.some((item) => item.includes(variant)))) keep(RANK_PARTIAL);
  }
  return best;
}

/** 図鑑名と、ひらがな・カタカナ・ローマ字の入力が、長音のゆれを除いて同じ文字列か。部分一致は含めない。 */
export function matchesNameExactly(query: string, japanese: string, aliases: readonly string[] = []) {
  const raw = query.normalize("NFKC").trim().toLowerCase();
  if (!raw) return false;
  const variants = queryHiraganaVariants(raw);
  return [japanese, ...aliases].some((name) => {
    const names = new Set(nameHiragana(name, true));
    return variants.some((variant) => names.has(variant));
  });
}

export function matchesNameQuery(
  query: string,
  japanese: string,
  english: string,
  dex: number,
  aliases: readonly string[] = [],
) {
  const raw = query.normalize("NFKC").trim().toLowerCase();
  if (!raw) return true;
  return nameQueryRank(raw, japanese, english, dex, aliases) != null;
}
