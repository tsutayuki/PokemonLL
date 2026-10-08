import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { PokemonDotSprite } from "../../components/PokemonDotSprite";
import { matchesNameQuery } from "../../lib/pogo/kanaSearch";
import { pickPreferredEntry, speciesDisplayName, type SpeciesGroup } from "../../lib/pogo/research";

export function SpeciesPicker({
  groups,
  selectedName,
  onSelect,
  compact = false,
}: {
  groups: SpeciesGroup[];
  selectedName: string;
  onSelect: (group: SpeciesGroup) => void;
  compact?: boolean;
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return groups.slice(0, compact ? 24 : 40);
    return groups
      .filter((group) => matchesNameQuery(normalized, speciesDisplayName(group), group.name, group.pokemonId))
      .slice(0, compact ? 24 : 40);
  }, [compact, groups, query]);

  return (
    <div className="picker-block">
      <label className="field">
        <span className="field-label">
          <Search size={14} />
          ポケモン
        </span>
        <input
          className="input"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="ひらがな・カタカナ・ローマ字"
          type="search"
          autoComplete="off"
          spellCheck={false}
        />
      </label>
      <div className={`species-list${compact ? " is-compact" : ""}`} role="listbox" aria-label="ポケモン一覧">
        {filtered.length === 0 ? (
          <p className="empty-note">一致するポケモンがありません。</p>
        ) : (
          filtered.map((group) => {
            const selected = group.name === selectedName;
            return (
              <button
                key={group.name}
                type="button"
                role="option"
                aria-selected={selected}
                className={`species-item${selected ? " is-selected" : ""}`}
                onClick={() => onSelect(group)}
              >
                <PokemonDotSprite pokemonId={group.pokemonId} form={pickPreferredEntry(group).form} alt="" size={36} />
                <span className="species-name">{speciesDisplayName(group)}</span>
                <span className="species-meta">No.{String(group.pokemonId).padStart(4, "0")}</span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
