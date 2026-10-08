export type LeagueMarkId = "little" | "great" | "ultra" | "master" | "custom";

/** `Image/league/` の実ファイル。リトルは登録名が littile.webp。 */
const SRC: Record<Exclude<LeagueMarkId, "custom">, string> = {
  little: "/Image/league/littile.webp",
  great: "/Image/league/super.webp",
  ultra: "/Image/league/hyper.webp",
  master: "/Image/league/master.webp",
};

export function leagueMarkSrc(id: LeagueMarkId) {
  if (id === "custom") return null;
  return SRC[id];
}
