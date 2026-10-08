import { useEffect, useMemo, useState } from "react";
import { PokemonDotSprite } from "../../components/PokemonDotSprite";
import { matchesNameQuery } from "../../lib/pogo/kanaSearch";
import { speciesDisplayName, type SpeciesGroup } from "../../lib/pogo/research";

export function PokemonSearchDialog({
  open,
  groups,
  counts,
  onClose,
  onSelect,
}: {
  open: boolean;
  groups: SpeciesGroup[];
  counts: Record<string, number>;
  onClose: () => void;
  onSelect: (group: SpeciesGroup) => void;
}) {
  const [query, setQuery] = useState("");

  const results = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return [...groups]
        .sort((a, b) => {
          const countA = counts[String(a.pokemonId)] ?? 0;
          const countB = counts[String(b.pokemonId)] ?? 0;
          if (countB !== countA) return countB - countA;
          return a.pokemonId - b.pokemonId;
        })
        .slice(0, 100);
    }

    return groups
      .filter((group) => {
        const form = group.entries.some((entry) => entry.form.toLowerCase().includes(normalized));
        return form || matchesNameQuery(normalized, speciesDisplayName(group), group.name, group.pokemonId);
      })
      .slice(0, 100);
  }, [counts, groups, query]);

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

  return (
    <div className="search-overlay" role="dialog" aria-modal="true" aria-label="ポケモン検索">
      <button type="button" className="search-overlay-backdrop" aria-label="閉じる" onClick={onClose} />
      <div className="search-overlay-panel">
        <div className="search-overlay-bar">
          <input
            className="input"
            type="search"
            placeholder="ひらがな・カタカナ・ローマ字・図鑑番号"
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
          {query.trim() ? "ひらがな・カタカナ・ローマ字・英語名・図鑑番号" : "選択回数が多い順に100匹"}
        </p>
        <div className="search-overlay-results" role="listbox">
          {results.length === 0 ? (
            <p className="empty-note">一致するポケモンがありません。</p>
          ) : (
            results.map((group) => (
              <button
                key={group.name}
                type="button"
                className="search-result"
                onClick={() => onSelect(group)}
              >
                <PokemonDotSprite pokemonId={group.pokemonId} alt="" size={40} />
                <span className="search-result-name">{speciesDisplayName(group)}</span>
                <span className="search-result-no num">No.{String(group.pokemonId).padStart(4, "0")}</span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
