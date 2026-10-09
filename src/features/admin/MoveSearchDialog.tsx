import { useEffect, useMemo, useState } from "react";
import type { PvpMove } from "../../lib/pogo/combat";
import { matchesNameQuery } from "../../lib/pogo/kanaSearch";

export function MoveSearchDialog({
  open,
  moves,
  kind,
  onClose,
  onSelect,
}: {
  open: boolean;
  moves: PvpMove[];
  kind: "fast" | "charged" | null;
  onClose: () => void;
  onSelect: (move: PvpMove) => void;
}) {
  const [query, setQuery] = useState("");

  const pool = useMemo(() => {
    const list = kind ? moves.filter((move) => move.kind === kind) : moves;
    return [...list].sort((a, b) => a.name.localeCompare(b.name, "ja"));
  }, [kind, moves]);

  const results = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return pool.slice(0, 80);
    return pool.filter((move) => matchesMove(normalized, move)).slice(0, 80);
  }, [pool, query]);

  useEffect(() => {
    if (open) setQuery("");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, open]);

  if (!open) return null;

  const title = kind === "fast" ? "ノーマルアタックを追加" : kind === "charged" ? "スペシャルアタックを追加" : "技を検索";

  return (
    <div className="search-overlay" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" className="search-overlay-backdrop" aria-label="閉じる" onClick={onClose} />
      <div className="search-overlay-panel">
        <div className="search-overlay-bar">
          <input
            className="input"
            type="search"
            placeholder="ひらがな・カタカナ・ローマ字・英語名"
            autoComplete="off"
            spellCheck={false}
            value={query}
            autoFocus
            onChange={(event) => setQuery(event.target.value)}
          />
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            閉じる
          </button>
        </div>
        <p className="search-overlay-hint">
          {query.trim() ? "ひらがな・カタカナ・ローマ字・英語名" : "名前の順に80件"}
        </p>
        <div className="search-overlay-results" role="listbox">
          {results.length === 0 ? (
            <p className="empty-note">一致する技がありません。</p>
          ) : (
            results.map((move) => (
              <button key={move.id} type="button" className="search-result move-search-result" onClick={() => onSelect(move)}>
                <span className="search-result-name">{move.name}</span>
                {kind ? null : (
                  <span className="search-result-no">{move.kind === "fast" ? "ノーマル" : "スペシャル"}</span>
                )}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function matchesMove(query: string, move: PvpMove) {
  if (matchesNameQuery(query, move.name, move.en, 0)) return true;
  return move.id.toLowerCase().includes(query.replace(/\s/g, ""));
}
