import { useSyncExternalStore } from "react";
import type { LeagueId } from "./research";

const RECENT_KEY_V1 = "pokemonll.recentDex.v1";
const COUNT_KEY_V1 = "pokemonll.pickCounts.v1";
const RECENT_KEY = "pokemonll.recentDex.v2";
const COUNT_KEY = "pokemonll.pickCounts.v2";
const RECENT_LIMIT = 10;
const ALL = "all";

type BucketSnapshot = {
  recent: string[];
  counts: Record<string, number>;
};

const EMPTY: BucketSnapshot = { recent: [], counts: {} };
const listeners = new Set<() => void>();
const leagueListeners = new Set<() => void>();
let snapshots = new Map<string, BucketSnapshot>();
let activeLeague: LeagueId | null = null;

function sanitizeKeys(parsed: unknown): string[] {
  if (!Array.isArray(parsed)) return [];
  const keys = parsed
    .map((value) => {
      if (typeof value === "number" && Number.isFinite(value) && value > 0) return String(Math.floor(value));
      if (typeof value === "string" && /^[\w:.-]+$/.test(value)) return value;
      return "";
    })
    .filter((value) => value.length > 0);
  return keys.filter((value, index) => keys.indexOf(value) === index).slice(0, RECENT_LIMIT);
}

function sanitizeCounts(parsed: unknown): Record<string, number> {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  const counts: Record<string, number> = {};
  for (const [key, value] of Object.entries(parsed)) {
    const next = Math.floor(Number(value));
    if (!/^[\w:.-]+$/.test(key) || !Number.isFinite(next)) continue;
    counts[key] = next;
  }
  return counts;
}

function readJson(key: string): unknown {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null");
  } catch {
    return null;
  }
}

function readRecentMap(): Record<string, string[]> {
  const stored = readJson(RECENT_KEY);
  if (stored && typeof stored === "object" && !Array.isArray(stored)) {
    const map: Record<string, string[]> = {};
    for (const [bucket, value] of Object.entries(stored)) {
      if (!/^[\w-]+$/.test(bucket)) continue;
      map[bucket] = sanitizeKeys(value);
    }
    return map;
  }
  const legacy = sanitizeKeys(readJson(RECENT_KEY_V1));
  const map: Record<string, string[]> = legacy.length > 0 ? { [ALL]: legacy, great: [...legacy] } : {};
  if (typeof window !== "undefined") localStorage.setItem(RECENT_KEY, JSON.stringify(map));
  return map;
}

function readCountMap(): Record<string, Record<string, number>> {
  const stored = readJson(COUNT_KEY);
  if (stored && typeof stored === "object" && !Array.isArray(stored)) {
    const map: Record<string, Record<string, number>> = {};
    for (const [bucket, value] of Object.entries(stored)) {
      if (!/^[\w-]+$/.test(bucket)) continue;
      map[bucket] = sanitizeCounts(value);
    }
    return map;
  }
  const legacy = sanitizeCounts(readJson(COUNT_KEY_V1));
  const map: Record<string, Record<string, number>> = Object.keys(legacy).length > 0 ? { [ALL]: legacy, great: { ...legacy } } : {};
  if (typeof window !== "undefined") localStorage.setItem(COUNT_KEY, JSON.stringify(map));
  return map;
}

function publish() {
  const recentMap = readRecentMap();
  const countMap = readCountMap();
  const next = new Map<string, BucketSnapshot>();
  for (const bucket of new Set([...Object.keys(recentMap), ...Object.keys(countMap)])) {
    next.set(bucket, { recent: recentMap[bucket] ?? [], counts: countMap[bucket] ?? {} });
  }
  snapshots = next;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function snapshotFor(league?: LeagueId | null): BucketSnapshot {
  return snapshots.get(league ?? ALL) ?? EMPTY;
}

if (typeof window !== "undefined") publish();

export function usePokemonPicks(league?: LeagueId | null) {
  return useSyncExternalStore(subscribe, () => snapshotFor(league), () => EMPTY);
}

export function useActivePickLeague() {
  return useSyncExternalStore(
    (listener) => {
      leagueListeners.add(listener);
      return () => leagueListeners.delete(listener);
    },
    () => activeLeague,
    () => null,
  );
}

export function setActivePickLeague(league: LeagueId | null) {
  if (activeLeague === league) return;
  activeLeague = league;
  leagueListeners.forEach((listener) => listener());
}

function pushRecent(map: Record<string, string[]>, bucket: string, key: string) {
  map[bucket] = [key, ...(map[bucket] ?? []).filter((value) => value !== key)].slice(0, RECENT_LIMIT);
}

function bumpCount(map: Record<string, Record<string, number>>, bucket: string, key: string) {
  const counts = { ...(map[bucket] ?? {}) };
  counts[key] = (counts[key] ?? 0) + 1;
  map[bucket] = counts;
}

export function recordPokemonPick(pokemonId: number, countKey?: string, league?: LeagueId | null) {
  const id = Math.floor(pokemonId);
  if (!id) return;

  const key = countKey && /^[\w:.-]+$/.test(countKey) ? countKey : String(id);
  const recent = readRecentMap();
  const counts = readCountMap();
  const buckets = league ? [league, ALL] : [ALL];
  for (const bucket of buckets) {
    pushRecent(recent, bucket, key);
    bumpCount(counts, bucket, key);
  }
  localStorage.setItem(RECENT_KEY, JSON.stringify(recent));
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
  const counts = readCountMap();
  const merged = { ...(counts[ALL] ?? {}) };
  for (const [key, value] of Object.entries(remote)) {
    const next = Math.floor(Number(value));
    if (!/^[\w:.-]+$/.test(key) || !Number.isFinite(next)) continue;
    merged[key] = Math.max(merged[key] ?? 0, next);
  }
  counts[ALL] = merged;
  localStorage.setItem(COUNT_KEY, JSON.stringify(counts));
  publish();
}
