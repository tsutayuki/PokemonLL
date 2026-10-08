import { useEffect, useRef, useState } from "react";
import { buildSearchGroups, type EvolutionData } from "../../lib/pogo/evolutionLine";
import { type PogoStatRecord, type SpeciesGroup } from "../../lib/pogo/research";
import { recordPokemonPick, refreshGlobalCounts, usePokemonPicks } from "../../lib/pogo/pokemonPicks";
import { PokemonSearchDialog } from "./PokemonSearchDialog";
import { bindPokemonSearch } from "./pokemonSearchApi";

export function PokemonSearchHost() {
  const [groups, setGroups] = useState<SpeciesGroup[]>([]);
  const [open, setOpen] = useState(false);
  const onSelectRef = useRef<(group: SpeciesGroup) => void>(() => undefined);
  const { counts } = usePokemonPicks();

  useEffect(() => {
    let cancelled = false;
    void refreshGlobalCounts();
    void Promise.all([fetch("/data/pokemon_stats.json"), fetch("/data/pokemon_evolutions.json")])
      .then(async ([statsRes, evoRes]) => {
        if (!statsRes.ok || !evoRes.ok) return;
        const stats = (await statsRes.json()) as PogoStatRecord[];
        const evolutions = (await evoRes.json()) as EvolutionData;
        if (!cancelled) setGroups(buildSearchGroups(stats, evolutions));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return bindPokemonSearch((onSelect) => {
      onSelectRef.current = onSelect;
      setOpen(true);
    });
  }, []);

  return (
    <PokemonSearchDialog
      open={open}
      groups={groups}
      counts={counts}
      onClose={() => setOpen(false)}
      onSelect={(group) => {
        recordPokemonPick(group.pokemonId, group.name);
        onSelectRef.current(group);
        setOpen(false);
      }}
    />
  );
}
