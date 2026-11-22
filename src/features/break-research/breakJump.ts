import type { LeagueId } from "../../lib/pogo/research";

export type BreakJumpSide = {
  pokemonId: number;
  form: string;
  atkIv: number;
  defIv: number;
  staIv: number;
  shadow: boolean;
  fastId: string;
};

export type BreakJump = {
  league: LeagueId;
  attacker: BreakJumpSide;
  defender: BreakJumpSide;
};

const KEY = "pokemonll.breakJump";

export function requestBreakStudy(jump: BreakJump) {
  sessionStorage.setItem(KEY, JSON.stringify(jump));
  window.location.hash = "#/research/break";
}

export function takeBreakJump(): BreakJump | null {
  const raw = sessionStorage.getItem(KEY);
  if (!raw) return null;
  sessionStorage.removeItem(KEY);
  try {
    return JSON.parse(raw) as BreakJump;
  } catch {
    return null;
  }
}
