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
  const [size, setSize] = useState(40);
  const [pending, setPending] = useState<Mon | null>(null);

  const recentMons = recent
    .map((key) => recentMon(stats, key))
    .filter((mon): mon is Mon => Boolean(mon))
    .filter((mon) => !FAVORITE_IDS.has(mon.record.pokemon_id));
  const catalog = FAVORITES.flatMap((item) => {
    const record = findRecord(stats, item.id, item.form);
    if (!record) return [];
    return [{ key: `${item.id}:${item.form}`, record, label: item.label }];
  });
  const perRow = Math.ceil(catalog.length / 2);
  const row2 = catalog.slice(0, perRow);
  const row3 = catalog.slice(perRow);
  const widest = Math.max(perRow, recentMons.length, 1);

  useEffect(() => {
    const node = boxRef.current;
    if (!node) return;
    const apply = () => {
      const style = getComputedStyle(node);
      const pad = Number.parseFloat(style.paddingLeft) + Number.parseFloat(style.paddingRight);
      const inner = Math.max(0, node.clientWidth - pad);
      const gap = 2;
      const next = Math.floor((inner - gap * (widest - 1)) / widest);
      setSize(Math.max(1, Math.min(40, next)));
    };
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(node);
    return () => observer.disconnect();
  }, [widest]);

  const choose = (side: "a" | "b") => {
    if (!pending) return;
    onPick(pending.record, pending.label, side);
    setPending(null);
  };

  return (
    <div className={`panel freq-box${pending ? " is-picking" : ""}`} ref={boxRef}>
      {recentMons.length ? <FreqRow mons={recentMons} size={size} onPick={setPending} /> : null}
      {row2.length ? <FreqRow mons={row2} size={size} onPick={setPending} /> : null}
      {row3.length ? <FreqRow mons={row3} size={size} onPick={setPending} /> : null}
      {pending
        ? createPortal(
            <button type="button" className="freq-cancel" aria-label="選択を閉じる" onClick={() => setPending(null)} />,
            document.body,
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
