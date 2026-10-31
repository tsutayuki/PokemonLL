import { useEffect, useMemo, useRef, useState } from "react";
import { PokemonDotSprite } from "../../components/PokemonDotSprite";
import { PokemonLabelFit } from "../../components/PokemonLabelFit";
import { matchesNameExactly, nameQueryRank } from "../../lib/pogo/kanaSearch";
import { speciesDisplayName, speciesLabelParts, type SpeciesGroup } from "../../lib/pogo/research";

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
  const [composing, setComposing] = useState(false);
  const typed = useRef(false);
  const pickedName = useRef("");

  const results = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return [...groups]
        .sort((a, b) => {
          const countA = searchCount(a, counts);
          const countB = searchCount(b, counts);
          if (countB !== countA) return countB - countA;
          return a.pokemonId - b.pokemonId || (a.label ?? "").localeCompare(b.label ?? "", "ja");
        })
        .slice(0, 100);
    }

    return groups
      .flatMap((group) => {
        const entry = group.entries[0];
        const english = searchEnglish(entry?.pokemon_name ?? "", entry?.form ?? "");
        const rank = nameQueryRank(normalized, speciesDisplayName(group), english, group.pokemonId, group.aliases ?? []);
        return rank == null ? [] : [{ group, rank }];
      })
      .sort((a, b) => {
        if (a.rank !== b.rank) return a.rank - b.rank;
        const length = speciesDisplayName(a.group).length - speciesDisplayName(b.group).length;
        if (length !== 0) return length;
        return a.group.pokemonId - b.group.pokemonId || (a.group.label ?? "").localeCompare(b.group.label ?? "", "ja");
      })
      .slice(0, 100)
      .map((item) => item.group);
  }, [counts, groups, query]);

  const exactHit = useMemo(() => {
    const trimmed = query.trim();
    if (!open || composing || !trimmed || results.length !== 1) return null;
    const group = results[0];
    if (!matchesNameExactly(trimmed, speciesDisplayName(group), group.aliases ?? [])) return null;
    return group;
  }, [composing, open, query, results]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setComposing(false);
      typed.current = false;
      pickedName.current = "";
    }
  }, [open]);

  useEffect(() => {
    if (!open || !typed.current || !exactHit) return;
    if (pickedName.current === exactHit.name) return;
    pickedName.current = exactHit.name;
    onSelect(exactHit);
  }, [exactHit, onSelect, open]);

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
            onCompositionStart={() => setComposing(true)}
            onCompositionEnd={() => setComposing(false)}
            onChange={(event) => {
              typed.current = true;
              setQuery(event.target.value);
            }}
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
                <span className="sprite-slot">
                  <PokemonDotSprite
                    pokemonId={group.pokemonId}
                    form={group.exactSprite ? undefined : group.entries[0]?.form}
                    exact={group.exactSprite}
                    spriteSuffix={group.spriteSuffix}
                    alt=""
                    size={40}
                  />
                </span>
                <PokemonLabelFit
                  className="search-result-name"
                  {...speciesLabelParts(group)}
                />
                <span className="search-result-no num">No.{String(group.pokemonId).padStart(4, "0")}</span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function searchEnglish(name: string, form: string) {
  const parts = [name, form];
  if (form === "MEGA") parts.push(`mega ${name}`);
  if (form === "MEGA_X") parts.push(`mega ${name}`, `mega x ${name}`, `mega ${name} x`);
  if (form === "MEGA_Y") parts.push(`mega ${name}`, `mega y ${name}`, `mega ${name} y`);
  return parts.join(" ").trim();
}

function searchCount(group: SpeciesGroup, counts: Record<string, number>) {
  const own = counts[group.name] ?? 0;
  const entry = group.entries[0];
  const legacy = entry?.form === "Normal" && !group.exactSprite ? (counts[String(group.pokemonId)] ?? 0) : 0;
  return own + legacy;
}
