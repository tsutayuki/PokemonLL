import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { PokemonDotSprite } from "../../components/PokemonDotSprite";
import { usePokemonPicks } from "../../lib/pogo/pokemonPicks";
import { getPokemonDisplayName, type PogoStatRecord } from "../../lib/pogo/research";

const FAVORITES: { id: number; form: string; label: string }[] = [
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
];

const FAVORITE_IDS = new Set(FAVORITES.map((item) => item.id));
const GAP = 2;
const MAX_ICON = 58;
const MAX_ROWS = 3;
const FAVORITE_ROWS = 2;

/**
 * 狭いときは1行9匹。幅が広がると 10、12、14、20匹へ増やす。
 * 絵は枠いっぱいに大きくするが 58px で止める。登録20匹が1行に収まる広さでは20匹。
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

type Mon = { key: string; record: PogoStatRecord; label: string };

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

export function FrequentPokemon({
  stats,
  onPick,
}: {
  stats: PogoStatRecord[];
  onPick: (record: PogoStatRecord, label: string, side: "a" | "b") => void;
}) {
  const { recent } = usePokemonPicks();
  const boxRef = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState({ size: 40, columns: 9 });
  const [pending, setPending] = useState<Mon | null>(null);

  const recentMons = recent
    .map((key) => recentMon(stats, key))
    .filter((mon): mon is Mon => Boolean(mon))
    .filter((mon) => !FAVORITE_IDS.has(mon.record.pokemon_id))
    .slice(0, layout.columns);
  const catalog = FAVORITES.flatMap((item) => {
    const record = findRecord(stats, item.id, item.form);
    if (!record) return [];
    return [{ key: `${item.id}:${item.form}`, record, label: item.label }];
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

  const choose = (side: "a" | "b") => {
    if (!pending) return;
    onPick(pending.record, pending.label, side);
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
          <PokemonDotSprite pokemonId={mon.record.pokemon_id} form={mon.record.form} alt="" size={size} />
        </button>
      ))}
    </div>
  );
}
