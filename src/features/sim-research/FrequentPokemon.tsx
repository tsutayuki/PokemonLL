import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { PokemonDotSprite } from "../../components/PokemonDotSprite";
import { usePokemonPicks } from "../../lib/pogo/pokemonPicks";
import { getPokemonDisplayName, type LeagueId, type PogoStatRecord } from "../../lib/pogo/research";

type Favorite = {
  id: number;
  form: string;
  label: string;
  /** 種族値ファイルに無いメガ。数値は pokemon_evolutions のメガカラマネロ。 */
  mega?: { attack: number; defense: number; stamina: number; spriteSuffix: number };
};

const GREAT: Favorite[] = [
  { id: 809, form: "Normal", label: "メルメタル" },
  { id: 38, form: "Normal", label: "キュウコン" },
  { id: 334, form: "Normal", label: "チルタリス" },
  { id: 959, form: "Normal", label: "デカヌチャン" },
  { id: 222, form: "Galarian", label: "サニーゴ(ガラル)" },
  { id: 823, form: "Normal", label: "アーマーガァ" },
  { id: 671, form: "Red", label: "フラージェス" },
  { id: 195, form: "Normal", label: "ヌオー" },
  { id: 302, form: "Normal", label: "ヤミラミ" },
  { id: 101, form: "Hisuian", label: "マルマイン(ヒスイ)" },
  { id: 395, form: "Normal", label: "エンペルト" },
  { id: 845, form: "Normal", label: "ウッウ" },
  { id: 184, form: "Normal", label: "マリルリ" },
  { id: 980, form: "Normal", label: "ドオー" },
  { id: 778, form: "Disguised", label: "ミミッキュ" },
  { id: 230, form: "Normal", label: "キングドラ" },
  { id: 828, form: "Normal", label: "フォクスライ" },
  { id: 618, form: "Normal", label: "マッギョ" },
  { id: 901, form: "Normal", label: "ガチグマ" },
  { id: 752, form: "Normal", label: "オニシズクモ" },
  { id: 979, form: "Normal", label: "コノヨザル" },
  { id: 862, form: "Galarian", label: "ホルード" },
  { id: 189, form: "Normal", label: "ワタッコ" },
  { id: 737, form: "Normal", label: "デンヂムシ" },
  { id: 386, form: "Defense", label: "ディフェンスデオキシス" },
  { id: 262, form: "Normal", label: "グラエナ" },
  { id: 205, form: "Normal", label: "フォレトス" },
];

const LITTLE: Favorite[] = [
  { id: 436, form: "Normal", label: "ドーミラー" },
  { id: 827, form: "Normal", label: "クスネ" },
  { id: 509, form: "Normal", label: "チョロネコ" },
  { id: 355, form: "Normal", label: "ヨマワル" },
  { id: 360, form: "Normal", label: "ソーナノ" },
  { id: 37, form: "Normal", label: "ロコン" },
  { id: 163, form: "Normal", label: "ホーホー" },
  { id: 263, form: "Normal", label: "ジグザグマ" },
  { id: 453, form: "Normal", label: "ベロバー" },
  { id: 183, form: "Normal", label: "マリル" },
  { id: 235, form: "Normal", label: "ドーブル" },
  { id: 213, form: "Normal", label: "ツボツボ" },
  { id: 751, form: "Normal", label: "シズクモ" },
  { id: 165, form: "Normal", label: "レディバ" },
  { id: 624, form: "Normal", label: "コマタナ" },
  { id: 580, form: "Normal", label: "コアルヒー" },
];

const ULTRA: Favorite[] = [
  { id: 845, form: "Normal", label: "ウッウ" },
  { id: 809, form: "Normal", label: "メルメタル" },
  { id: 812, form: "Normal", label: "ゴリランダー" },
  { id: 718, form: "Complete", label: "ジガルデ(パーフェクト)" },
  {
    id: 687,
    form: "MEGA",
    label: "メガカラマネロ",
    mega: { attack: 208, defense: 222, stamina: 200, spriteSuffix: 1 },
  },
  { id: 671, form: "Red", label: "フラージェス" },
  { id: 324, form: "Normal", label: "バクガメス" },
  { id: 537, form: "Normal", label: "ガマゲロゲ" },
  { id: 229, form: "Normal", label: "ヘルガー" },
  { id: 160, form: "Normal", label: "オーダイル" },
  { id: 823, form: "Normal", label: "アーマーガァ" },
  { id: 143, form: "Normal", label: "カビゴン" },
  { id: 205, form: "Normal", label: "フォレトス" },
  { id: 778, form: "Disguised", label: "ミミッキュ" },
  { id: 9, form: "Normal", label: "カメックス" },
  { id: 687, form: "Normal", label: "カラマネロ" },
  { id: 959, form: "Normal", label: "デカヌチャン" },
  { id: 145, form: "Normal", label: "サンダー" },
  { id: 38, form: "Normal", label: "キュウコン" },
  { id: 593, form: "Normal", label: "ブルンゲル" },
  { id: 89, form: "Alola", label: "アローラベトベトン" },
];

const MASTER: Favorite[] = [
  { id: 888, form: "Crowned_sword", label: "ザシアン(剣の王)" },
  { id: 646, form: "White", label: "ホワイトキュレム" },
  { id: 483, form: "Origin", label: "オリジンディアルガ" },
  { id: 647, form: "Ordinary", label: "ケルディオ" },
  { id: 484, form: "Origin", label: "オリジンパルキア" },
  { id: 718, form: "Complete", label: "ジガルデ(パーフェクト)" },
  { id: 382, form: "Normal", label: "カイオーガ" },
  { id: 643, form: "Normal", label: "レシラム" },
  { id: 901, form: "Normal", label: "ガチグマ" },
  { id: 249, form: "Normal", label: "ルギア" },
  { id: 716, form: "Normal", label: "ゼルネアス" },
  { id: 890, form: "Normal", label: "ムゲンダイナ" },
  { id: 250, form: "Normal", label: "ホウオウ" },
  { id: 792, form: "Normal", label: "ルナアーラ" },
  { id: 644, form: "Normal", label: "ゼクロム" },
  { id: 800, form: "Dusk_mane", label: "日食ネクロズマ" },
  { id: 800, form: "Dawn_wings", label: "月食ネクロズマ" },
  { id: 889, form: "Crowned_shield", label: "ザマゼンタ(たての王)" },
];

const FAVORITES_BY_LEAGUE: Record<Exclude<LeagueId, "custom">, Favorite[]> = {
  little: LITTLE,
  great: GREAT,
  ultra: ULTRA,
  master: MASTER,
};

function favoritesFor(league: LeagueId) {
  if (league === "custom") return GREAT;
  return FAVORITES_BY_LEAGUE[league];
}
const GAP = 2;
const MAX_ICON = 58;
const MAX_ROWS = 3;
const FAVORITE_ROWS = 2;

/**
 * 狭いときは1行9匹。幅が広がると 10、12、14、20匹へ増やす。
 * 絵は枠いっぱいに大きくするが 58px で止める。1行は最大20匹。
 */
export function frequentBarLayout(inner: number) {
  const width = Math.max(0, inner);
  const sizeFor = (columns: number) => Math.floor((width - GAP * (columns - 1)) / columns);
  const steps = [
    { columns: 9, minSize: 1 },
    { columns: 10, minSize: 40 },
    { columns: 12, minSize: 44 },
    { columns: 14, minSize: 48 },
    { columns: 20, minSize: 46 },
  ];
  let columns = 9;
  for (const step of steps) {
    if (sizeFor(step.columns) >= step.minSize) columns = step.columns;
  }
  return { columns, size: Math.max(1, Math.min(MAX_ICON, sizeFor(columns))) };
}

type Mon = {
  key: string;
  record: PogoStatRecord;
  label: string;
  exact?: boolean;
  spriteSuffix?: number | null;
};

function findRecord(stats: PogoStatRecord[], id: number, form: string) {
  return stats.find((row) => row.pokemon_id === id && row.form === form) ?? null;
}

function recentMon(stats: PogoStatRecord[], key: string): Mon | null {
  const split = key.indexOf(":");
  if (split <= 0) return null;
  const id = Number(key.slice(0, split));
  const form = key.slice(split + 1);
  if (!Number.isFinite(id) || !form || form.includes(":")) return null;
  const record = findRecord(stats, id, form);
  if (!record) return null;
  return { key: `${id}:${form}`, record, label: getPokemonDisplayName(id, record.pokemon_name) };
}

function favoriteMon(stats: PogoStatRecord[], item: Favorite): Mon | null {
  const baseForm = item.mega ? "Normal" : item.form;
  const base = findRecord(stats, item.id, baseForm);
  if (!base) return null;
  if (!item.mega) return { key: `${item.id}:${item.form}`, record: base, label: item.label };
  return {
    key: `${item.id}:${item.form}`,
    label: item.label,
    exact: true,
    spriteSuffix: item.mega.spriteSuffix,
    record: {
      ...base,
      form: item.form,
      base_attack: item.mega.attack,
      base_defense: item.mega.defense,
      base_stamina: item.mega.stamina,
    },
  };
}

export function FrequentPokemon({
  stats,
  league,
  onPick,
}: {
  stats: PogoStatRecord[];
  league: LeagueId;
  onPick: (
    record: PogoStatRecord,
    label: string,
    side: "a" | "b",
    sprite?: { exactSprite?: boolean; spriteSuffix?: number | null },
  ) => void;
}) {
  const { recent } = usePokemonPicks();
  const boxRef = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState({ size: 40, columns: 9 });
  const [pending, setPending] = useState<Mon | null>(null);
  const favorites = favoritesFor(league);
  const favoriteKeys = new Set(favorites.map((item) => `${item.id}:${item.form}`));

  const recentMons = recent
    .map((key) => recentMon(stats, key))
    .filter((mon): mon is Mon => Boolean(mon))
    .filter((mon) => !favoriteKeys.has(`${mon.record.pokemon_id}:${mon.record.form}`))
    .slice(0, layout.columns);
  const catalog = favorites.flatMap((item) => {
    const mon = favoriteMon(stats, item);
    return mon ? [mon] : [];
  });
  const favoriteLimit = layout.columns * Math.min(FAVORITE_ROWS, MAX_ROWS - (recentMons.length ? 1 : 0));
  const favoriteRows: Mon[][] = [];
  const shownFavorites = catalog.slice(0, favoriteLimit);
  for (let index = 0; index < shownFavorites.length; index += layout.columns) {
    favoriteRows.push(shownFavorites.slice(index, index + layout.columns));
  }

  useEffect(() => {
    const node = boxRef.current;
    if (!node) return;
    const apply = () => {
      const style = getComputedStyle(node);
      const pad = Number.parseFloat(style.paddingLeft) + Number.parseFloat(style.paddingRight);
      const inner = Math.max(0, node.clientWidth - pad);
      setLayout(frequentBarLayout(inner));
    };
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setPending(null);
  }, [league]);

  const choose = (side: "a" | "b") => {
    if (!pending) return;
    onPick(pending.record, pending.label, side, { exactSprite: pending.exact, spriteSuffix: pending.spriteSuffix });
    setPending(null);
  };

  return (
    <div className={`panel freq-box${pending ? " is-picking" : ""}`} ref={boxRef}>
      {recentMons.length ? <FreqRow mons={recentMons} size={layout.size} onPick={setPending} /> : null}
      {favoriteRows.map((row) => (
        <FreqRow key={row[0]?.key ?? "row"} mons={row} size={layout.size} onPick={setPending} />
      ))}
      {pending
        ? createPortal(
            <button type="button" className="freq-cancel" aria-label="選択を閉じる" onClick={() => setPending(null)} />,
            document.querySelector(".app-root") ?? document.body,
          )
        : null}
      {pending ? (
        <>
          <button type="button" className="freq-margin" aria-label="選択を閉じる" onClick={() => setPending(null)} />
          <div className="freq-choose" role="group" aria-label={`${pending.label}をどちらに入れるか`}>
            <button type="button" className="freq-side is-left" onClick={() => choose("a")}>
              <span className="freq-arrow" aria-hidden="true">
                ◀
              </span>
              <span>左に追加</span>
            </button>
            <button type="button" className="freq-side is-right" onClick={() => choose("b")}>
              <span className="freq-arrow" aria-hidden="true">
                ▶
              </span>
              <span>右に追加</span>
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}

function FreqRow({ mons, size, onPick }: { mons: Mon[]; size: number; onPick: (mon: Mon) => void }) {
  return (
    <div className="freq-row">
      {mons.map((mon) => (
        <button
          key={mon.key}
          type="button"
          className="freq-mon"
          style={{ width: size, height: size }}
          aria-label={mon.label}
          onClick={() => onPick(mon)}
        >
          <PokemonDotSprite
            pokemonId={mon.record.pokemon_id}
            form={mon.record.form}
            exact={mon.exact}
            spriteSuffix={mon.spriteSuffix}
            alt=""
            size={size}
          />
        </button>
      ))}
    </div>
  );
}
