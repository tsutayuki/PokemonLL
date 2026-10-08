import { useSyncExternalStore } from "react";

const RECENT_KEY = "pokemonll.recentDex.v1";
const COUNT_KEY = "pokemonll.pickCounts.v1";
const RECENT_LIMIT = 10;

type PickSnapshot = {
  recent: number[];
  counts: Record<string, number>;
};

const listeners = new Set<() => void>();

function readRecent(): number[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]") as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map((value) => Math.floor(Number(value))).filter((value) => value > 0).slice(0, RECENT_LIMIT);
  } catch {
    return [];
  }
}

function readCounts(): Record<string, number> {
  try {
    const parsed = JSON.parse(localStorage.getItem(COUNT_KEY) ?? "{}") as Record<string, number>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

let snapshot: PickSnapshot = {
  recent: [],
  counts: {},
};

function publish() {
  snapshot = { recent: readRecent(), counts: readCounts() };
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

if (typeof window !== "undefined") {
  snapshot = { recent: readRecent(), counts: readCounts() };
}

export function usePokemonPicks() {
  return useSyncExternalStore(subscribe, () => snapshot, () => snapshot);
}

export function recordPokemonPick(pokemonId: number, countKey?: string) {
  const id = Math.floor(pokemonId);
  if (!id) return;

  const recent = [id, ...readRecent().filter((value) => value !== id)].slice(0, RECENT_LIMIT);
  localStorage.setItem(RECENT_KEY, JSON.stringify(recent));

  const counts = readCounts();
  const key = countKey && /^[\w:.-]+$/.test(countKey) ? countKey : String(id);
  counts[key] = (counts[key] ?? 0) + 1;
  localStorage.setItem(COUNT_KEY, JSON.stringify(counts));
  publish();

  void fetch("/api/pokemon-picks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: key }),
  })
    .then(async (response) => {
      if (!response.ok) return;
      const remote = (await response.json()) as Record<string, number>;
      mergeCounts(remote);
    })
    .catch(() => undefined);
}

export async function refreshGlobalCounts() {
  try {
    const response = await fetch("/api/pokemon-picks");
    if (!response.ok) return;
    const remote = (await response.json()) as Record<string, number>;
    mergeCounts(remote);
  } catch {
    /* サーバー集計が無いときは端末内の回数だけ使う */
  }
}

function mergeCounts(remote: Record<string, number>) {
  const local = readCounts();
  const merged: Record<string, number> = { ...local };
  for (const [key, value] of Object.entries(remote)) {
    const next = Math.floor(Number(value));
    if (!Number.isFinite(next)) continue;
    merged[key] = Math.max(merged[key] ?? 0, next);
  }
  localStorage.setItem(COUNT_KEY, JSON.stringify(merged));
  publish();
}
