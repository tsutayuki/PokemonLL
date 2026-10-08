import { useEffect, useMemo, useRef, useState } from "react";
import { formatBattleStat, formatPlace, IV_FLOORS, type RankingRow } from "../../lib/pogo/research";

const RANK_FILTERS = [
  { label: "100位以内", limit: 100 },
  { label: "300位以内", limit: 300 },
  { label: "500位以内", limit: 500 },
  { label: "1000位以内", limit: 1000 },
  { label: "すべて", limit: null },
] as const;

type SortKey = "rank" | "iv" | "attack" | "defense" | "stamina" | "level" | "cp";
type SortDir = "asc" | "desc" | null;
type Bound = "ge" | "le";

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "rank", label: "順位" },
  { key: "iv", label: "IV" },
  { key: "attack", label: "攻撃" },
  { key: "defense", label: "防御" },
  { key: "stamina", label: "HP" },
  { key: "level", label: "Lv" },
  { key: "cp", label: "CP" },
];

/** この幅なら攻撃・防御の小数第2位を足しても、列が詰まって見えない。 */
const WIDE_STATS_PX = 416;
/** 攻撃・防御・HPの入力を3列にできる幅。 */
const ROOMY_FILTERS_PX = 544;

export function RankTable({
  rows,
  current,
  onIvFloor,
  floor = 0,
  recalc = false,
}: {
  rows: RankingRow[];
  current: RankingRow | null;
  onIvFloor?: (floor: number, recalc: boolean) => void;
  floor?: (typeof IV_FLOORS)[number];
  recalc?: boolean;
}) {
  const [limit, setLimit] = useState<number | null>(100);
  const [ivFloor, setIvFloor] = useState<(typeof IV_FLOORS)[number]>(floor);
  const [recalcRank, setRecalcRank] = useState(recalc);
  const [attackText, setAttackText] = useState("");
  const [attackBound, setAttackBound] = useState<Bound>("ge");
  const [defenseText, setDefenseText] = useState("");
  const [defenseBound, setDefenseBound] = useState<Bound>("ge");
  const [hpText, setHpText] = useState("");
  const [hpBound, setHpBound] = useState<Bound>("ge");
  const [sortKey, setSortKey] = useState<SortKey>("rank");
  const [sortDir, setSortDir] = useState<SortDir>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [wideStats, setWideStats] = useState(false);
  const [roomyFilters, setRoomyFilters] = useState(false);
  const boardRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const currentRef = useRef<HTMLDivElement>(null);
  const [pin, setPin] = useState<"top" | "bottom" | null>(null);

  const visible = useMemo(() => {
    const filtered = rows.filter(
      (row) =>
        (limit === null || row.rank <= limit) &&
        row.atkIv >= ivFloor &&
        row.defIv >= ivFloor &&
        row.staIv >= ivFloor &&
        within(row.attack, attackText, attackBound, false) &&
        within(row.defense, defenseText, defenseBound, false) &&
        within(row.stamina, hpText, hpBound, true),
    );
    if (!sortDir) return filtered;
    const sorted = [...filtered].sort((a, b) => compareRows(a, b, sortKey) * (sortDir === "asc" ? 1 : -1));
    return sorted;
  }, [attackBound, attackText, defenseBound, defenseText, hpBound, hpText, ivFloor, limit, rows, sortDir, sortKey]);

  const currentInList = current
    ? visible.some((row) => row.atkIv === current.atkIv && row.defIv === current.defIv && row.staIv === current.staIv)
    : false;

  useEffect(() => {
    const board = boardRef.current;
    if (!board) return;
    const update = () => {
      const width = board.clientWidth;
      setWideStats(width >= WIDE_STATS_PX);
      setRoomyFilters(width >= ROOMY_FILTERS_PX);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(board);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const update = () => {
      const row = currentRef.current;
      if (!row || !currentInList) {
        setPin(null);
        return;
      }
      const top = row.offsetTop;
      const bottom = top + row.offsetHeight;
      const viewTop = scroller.scrollTop;
      const viewBottom = viewTop + scroller.clientHeight;
      if (bottom <= viewTop + 1) setPin("top");
      else if (top >= viewBottom - 1) setPin("bottom");
      else setPin(null);
    };
    update();
    scroller.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(scroller);
    return () => {
      scroller.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, [currentInList, visible, current]);

  const cycleSort = (key: SortKey) => {
    if (sortKey !== key || sortDir === null) {
      setSortKey(key);
      setSortDir("desc");
      return;
    }
    if (sortDir === "desc") {
      setSortDir("asc");
      return;
    }
    setSortDir(null);
    setSortKey("rank");
  };

  const attackDigits: 1 | 2 = wideStats || (sortDir !== null && sortKey === "attack") ? 2 : 1;
  const defenseDigits: 1 | 2 = wideStats || (sortDir !== null && sortKey === "defense") ? 2 : 1;
  const gridClass = [
    "rank-grid",
    !wideStats && attackDigits === 2 ? "is-atk-fine" : "",
    !wideStats && defenseDigits === 2 ? "is-def-fine" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const boardClass = ["rank-board", roomyFilters ? "is-roomy" : "", wideStats ? "is-wide" : ""].filter(Boolean).join(" ");
  const detailActive = ivFloor !== 0 || attackText !== "" || defenseText !== "" || hpText !== "";

  return (
    <div className={boardClass} ref={boardRef}>
      <div className="rank-filters">
        <label className="rank-scp">
          <span className="field-label">SCP順位</span>
          <select
            className="input rank-scp-select"
            value={limit === null ? "all" : String(limit)}
            onChange={(event) => {
              const value = event.target.value;
              setLimit(value === "all" ? null : Number(value));
            }}
          >
            {RANK_FILTERS.map((filter) => (
              <option key={filter.label} value={filter.limit === null ? "all" : filter.limit}>
                {filter.label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="rank-detail-toggle"
          aria-expanded={detailOpen}
          aria-controls="rank-detail-filters"
          onClick={() => setDetailOpen((open) => !open)}
        >
          <span>詳細絞り込み</span>
          {detailActive ? <span className="rank-detail-active">適用中</span> : null}
          <span aria-hidden="true">{detailOpen ? "▲" : "▼"}</span>
        </button>
        {detailOpen ? (
          <div className="rank-detail" id="rank-detail-filters">
            <div className="rank-floor-row">
              <label className="field">
                <span className="field-label">個体値最低</span>
                <select
                  className="input"
                  value={ivFloor}
                  onChange={(event) => {
                    const floor = Number(event.target.value) as (typeof IV_FLOORS)[number];
                    setIvFloor(floor);
                    onIvFloor?.(floor, recalcRank);
                  }}
                >
                  {IV_FLOORS.map((floor) => (
                    <option key={floor} value={floor}>
                      {floor}以上
                    </option>
                  ))}
                </select>
              </label>
              <label className="rank-recalc">
                <input
                  type="checkbox"
                  checked={recalcRank}
                  onChange={(event) => {
                    const next = event.target.checked;
                    setRecalcRank(next);
                    onIvFloor?.(ivFloor, next);
                  }}
                />
                順位再計算
              </label>
            </div>
            <div className="rank-stat-filters">
              <StatFilter
                label="攻撃"
                value={attackText}
                onValue={setAttackText}
                bound={attackBound}
                onBound={setAttackBound}
                integer={false}
              />
              <StatFilter
                label="防御"
                value={defenseText}
                onValue={setDefenseText}
                bound={defenseBound}
                onBound={setDefenseBound}
                integer={false}
              />
              <StatFilter label="HP" value={hpText} onValue={setHpText} bound={hpBound} onBound={setHpBound} integer />
            </div>
          </div>
        ) : null}
      </div>
      {current && !currentInList ? (
        <p className="rank-outside">この個体は {formatPlace(current.rank)} で、いまの絞り込みの外です。</p>
      ) : null}
      <p className="rank-sort-note">
        見出しをタップすると並べ替えられます。攻撃・防御で並べ替えると、その列は小数点以下2桁になります。
      </p>
      <div className={`${gridClass} rank-head`} role="row">
        {COLUMNS.map((column) => {
          const active = sortDir && sortKey === column.key;
          const mark = !active ? "" : sortDir === "desc" ? " ↓" : " ↑";
          return (
            <button key={column.key} type="button" onClick={() => cycleSort(column.key)}>
              {column.label}
              {mark}
            </button>
          );
        })}
      </div>
      <div className="rank-scroll-wrap">
        <div className="rank-scroll" ref={scrollerRef}>
          {visible.length === 0 ? <p className="rank-empty">条件に合う個体がありません。</p> : null}
          {visible.map((row) => {
            const isCurrent =
              current?.atkIv === row.atkIv && current.defIv === row.defIv && current.staIv === row.staIv;
            return (
              <div
                key={`${row.atkIv}-${row.defIv}-${row.staIv}`}
                ref={isCurrent ? currentRef : undefined}
                className={`${gridClass} rank-line${isCurrent ? " is-current" : ""}`}
              >
                <RankCells row={row} attackDigits={attackDigits} defenseDigits={defenseDigits} />
              </div>
            );
          })}
        </div>
        {pin && current ? (
          <div className={`rank-pin is-${pin}`} aria-hidden="true">
            <div className={`${gridClass} rank-line is-current`}>
              <RankCells row={current} attackDigits={attackDigits} defenseDigits={defenseDigits} />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function StatFilter({
  label,
  value,
  onValue,
  bound,
  onBound,
  integer,
}: {
  label: string;
  value: string;
  onValue: (value: string) => void;
  bound: Bound;
  onBound: (bound: Bound) => void;
  integer: boolean;
}) {
  return (
    <label className="field rank-stat-field">
      <span className="field-label">{label}</span>
      <span className="rank-stat-controls">
        <input
          className="input rank-stat-value"
          type="text"
          inputMode={integer ? "numeric" : "decimal"}
          placeholder="なし"
          value={value}
          onChange={(event) => onValue(integer ? event.target.value.replace(/\D/g, "") : sanitizeDecimal(event.target.value))}
          aria-label={`${label}の実数値`}
        />
        <select
          className="input rank-cmp"
          value={bound}
          onChange={(event) => onBound(event.target.value as Bound)}
          aria-label={`${label}の以上以下`}
        >
          <option value="ge">以上</option>
          <option value="le">以下</option>
        </select>
      </span>
    </label>
  );
}

function RankCells({
  row,
  attackDigits,
  defenseDigits,
}: {
  row: RankingRow;
  attackDigits: 1 | 2;
  defenseDigits: 1 | 2;
}) {
  return (
    <>
      <span>{formatPlace(row.rank)}</span>
      <span>
        {row.atkIv}/{row.defIv}/{row.staIv}
      </span>
      <span>{formatBattleStat(row.attack, attackDigits)}</span>
      <span>{formatBattleStat(row.defense, defenseDigits)}</span>
      <span>{row.stamina}</span>
      <span>{row.level.toFixed(1)}</span>
      <span>{row.cp}</span>
    </>
  );
}

function compareRows(a: RankingRow, b: RankingRow, key: SortKey) {
  if (key === "iv") {
    return a.atkIv - b.atkIv || a.defIv - b.defIv || a.staIv - b.staIv;
  }
  return a[key] - b[key];
}

function within(value: number, text: string, bound: Bound, integer: boolean) {
  const target = readBound(text, integer);
  if (target === null) return true;
  return bound === "ge" ? value >= target : value <= target;
}

function readBound(text: string, integer: boolean) {
  const trimmed = text.trim();
  if (trimmed === "" || trimmed === ".") return null;
  if (integer) {
    if (!/^\d+$/.test(trimmed)) return null;
    return Number(trimmed);
  }
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return null;
  return Number(trimmed);
}

function sanitizeDecimal(raw: string) {
  const cleaned = raw.replace(/[^\d.]/g, "");
  const dot = cleaned.indexOf(".");
  if (dot === -1) return cleaned;
  const head = cleaned.slice(0, dot);
  const tail = cleaned.slice(dot + 1).replace(/\./g, "").slice(0, 2);
  return `${head}.${tail}`;
}
