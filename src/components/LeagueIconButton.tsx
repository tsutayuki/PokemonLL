import { leagueMarkSrc, type LeagueMarkId } from "../lib/pogo/leagueMark";

export function LeagueIconButton({
  id,
  label,
  pressed,
  onClick,
}: {
  id: LeagueMarkId;
  label: string;
  pressed: boolean;
  onClick: () => void;
}) {
  const src = leagueMarkSrc(id);
  return (
    <button type="button" className="league-choice" aria-pressed={pressed} aria-label={label} onClick={onClick}>
      {src ? <img src={src} alt="" /> : <span className="league-custom">CP</span>}
    </button>
  );
}

export function LeagueMark({ id, label }: { id: LeagueMarkId; label: string }) {
  const src = leagueMarkSrc(id);
  if (!src) return null;
  return <img className="league-mark" src={src} alt={label} />;
}
