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

export function matchesNameQuery(query: string, japanese: string, english: string, dex: number) {
  const raw = query.normalize("NFKC").trim().toLowerCase();
  if (!raw) return true;
  const dexText = String(dex);
  if (dexText === raw || dexText.padStart(4, "0") === raw) return true;

  const englishKey = english.toLowerCase().replace(/[\s._\-]/g, "");
  const queryKey = raw.replace(/[\s・･._\-ｰ'"’]/g, "");
  if (englishKey.includes(queryKey)) return true;

  const nameHira = expandLongVowel(toHiragana(japanese.normalize("NFKC").replace(/[♀♂\s・･]/g, "")));
  return queryHiraganaVariants(raw).some((variant) => nameHira.some((name) => name.includes(variant)));
}
