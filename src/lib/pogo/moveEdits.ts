import type { PvpBundle } from "./pvpBundle";

export type MoveStatPatch = {
  power?: number;
  energy?: number;
  energyGain?: number;
};

export type LearnsetPatch = {
  fast: string[];
  charged: string[];
};

export type MoveEditStore = {
  moves: Record<string, MoveStatPatch>;
  learnsets: Record<string, LearnsetPatch>;
};

const STORAGE_KEY = "pokemonll.moveEdits.v1";
const CHANGE_EVENT = "pokemonll-move-edits";

export function emptyMoveEdits(): MoveEditStore {
  return { moves: {}, learnsets: {} };
}

export function learnsetKey(pokemonId: number, form: string) {
  return `${pokemonId}:${form}`;
}

export function loadMoveEdits(): MoveEditStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyMoveEdits();
    const parsed = JSON.parse(raw) as Partial<MoveEditStore>;
    return {
      moves: parsed.moves && typeof parsed.moves === "object" ? parsed.moves : {},
      learnsets: parsed.learnsets && typeof parsed.learnsets === "object" ? parsed.learnsets : {},
    };
  } catch {
    return emptyMoveEdits();
  }
}

export function saveMoveEdits(store: MoveEditStore) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function subscribeMoveEdits(listener: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) listener();
  };
  window.addEventListener(CHANGE_EVENT, listener);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function applyMoveEdits(bundle: PvpBundle, edits: MoveEditStore): PvpBundle {
  const moves = { ...bundle.moves };
  for (const [id, patch] of Object.entries(edits.moves)) {
    const move = moves[id];
    if (!move || !patch) continue;
    moves[id] = {
      ...move,
      power: patch.power !== undefined ? patch.power : move.power,
      energy: patch.energy !== undefined ? patch.energy : move.energy,
      energyGain: patch.energyGain !== undefined ? patch.energyGain : move.energyGain,
    };
  }

  const pokemon = bundle.pokemon.map((entry) => {
    const patch = edits.learnsets[learnsetKey(entry.pokemonId, entry.form)];
    if (!patch) return entry;
    return {
      ...entry,
      fast: [...patch.fast],
      charged: [...patch.charged],
    };
  });

  return { ...bundle, moves, pokemon };
}
