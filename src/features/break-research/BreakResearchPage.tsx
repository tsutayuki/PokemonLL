import { useEffect, useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { LeagueIconButton } from "../../components/LeagueIconButton";
import { SpeciesPicker } from "../shared/SpeciesPicker";
import { useResearchData } from "../shared/useResearchData";
import { damageForMove, hitsToKo, nextAttackBreakpoint, nextDefenseBulkpoint, type PvpMove } from "../../lib/pogo/combat";
import { findPvpPokemon, resolveMoves } from "../../lib/pogo/pvpBundle";
import {
  computeBestRankings,
  findMaxLevelBuild,
  formatFormLabel,
  leagueCap,
  leagueConfigs,
  pickPreferredEntry,
  speciesDisplayName,
  type LeagueId,
  type PogoStatRecord,
  type SpeciesGroup,
} from "../../lib/pogo/research";
import { TYPE_LABEL_JA, asPvpType } from "../../lib/pogo/types";

type SideState = {
  species: string;
  form: string;
  shadow: boolean;
  atkIv: number;
  defIv: number;
  staIv: number;
  fastId: string;
  chargedId: string;
};

const emptySide: SideState = {
  species: "",
  form: "",
  shadow: false,
  atkIv: 0,
  defIv: 15,
  staIv: 15,
  fastId: "",
  chargedId: "",
};

function clampIv(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(15, Math.max(0, Math.round(value)));
}

export function BreakResearchPage() {
  const { data, error, speciesGroups, cpData, reload } = useResearchData();
  const [leagueId, setLeagueId] = useState<LeagueId>("great");
  const [attacker, setAttacker] = useState<SideState>(emptySide);
  const [defender, setDefender] = useState<SideState>(emptySide);

  const cap = leagueCap(leagueId);

  useEffect(() => {
    if (!speciesGroups.length) return;
    if (!attacker.species) applySpecies(speciesGroups[0], "attacker", true);
    if (!defender.species) applySpecies(speciesGroups[Math.min(1, speciesGroups.length - 1)], "defender", true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speciesGroups]);

  function applySpecies(group: SpeciesGroup, side: "attacker" | "defender", initMoves: boolean) {
    const entry = pickPreferredEntry(group);
    const pvp = data ? findPvpPokemon(data.bundle, group.pokemonId, entry.form) : null;
    const next: Partial<SideState> = {
      species: group.name,
      form: entry.form,
    };
    if (initMoves && pvp) {
      next.fastId = pvp.fast[0] ?? "";
      next.chargedId = pvp.charged[0] ?? "";
    }
    if (cpData && data) {
      const record = group.entries.find((item) => item.form === entry.form) ?? entry;
      const best = computeBestRankings(record, cpData.levels, cpData.byLevel, cap)[0];
      if (best) {
        next.atkIv = best.atkIv;
        next.defIv = best.defIv;
        next.staIv = best.staIv;
      }
    }
    if (side === "attacker") setAttacker((current) => ({ ...current, ...next }));
    else setDefender((current) => ({ ...current, ...next }));
  }

  const attackerGroup = speciesGroups.find((group) => group.name === attacker.species) ?? null;
  const defenderGroup = speciesGroups.find((group) => group.name === defender.species) ?? null;
  const attackerEntry = attackerGroup?.entries.find((entry) => entry.form === attacker.form) ?? attackerGroup?.entries[0] ?? null;
  const defenderEntry = defenderGroup?.entries.find((entry) => entry.form === defender.form) ?? defenderGroup?.entries[0] ?? null;

  const attackerPvp = data && attackerEntry ? findPvpPokemon(data.bundle, attackerEntry.pokemon_id, attacker.form) : null;
  const defenderPvp = data && defenderEntry ? findPvpPokemon(data.bundle, defenderEntry.pokemon_id, defender.form) : null;
  const attackerFasts = data && attackerPvp ? resolveMoves(data.bundle, attackerPvp.fast) : [];
  const attackerCharged = data && attackerPvp ? resolveMoves(data.bundle, attackerPvp.charged) : [];
  const defenderFasts = data && defenderPvp ? resolveMoves(data.bundle, defenderPvp.fast) : [];
  const defenderCharged = data && defenderPvp ? resolveMoves(data.bundle, defenderPvp.charged) : [];

  useEffect(() => {
    if (!attackerPvp) return;
    if (!attackerPvp.fast.includes(attacker.fastId)) {
      setAttacker((current) => ({ ...current, fastId: attackerPvp.fast[0] ?? "" }));
    }
    if (!attackerPvp.charged.includes(attacker.chargedId)) {
      setAttacker((current) => ({ ...current, chargedId: attackerPvp.charged[0] ?? "" }));
    }
  }, [attacker.chargedId, attacker.fastId, attackerPvp]);

  useEffect(() => {
    if (!defenderPvp) return;
    if (!defenderPvp.fast.includes(defender.fastId)) {
      setDefender((current) => ({ ...current, fastId: defenderPvp.fast[0] ?? "" }));
    }
    if (!defenderPvp.charged.includes(defender.chargedId)) {
      setDefender((current) => ({ ...current, chargedId: defenderPvp.charged[0] ?? "" }));
    }
  }, [defender.chargedId, defender.fastId, defenderPvp]);

  const attackerBuild = useMemo(
    () =>
      attackerEntry && cpData
        ? findMaxLevelBuild(attackerEntry, attacker.atkIv, attacker.defIv, attacker.staIv, cpData.levels, cpData.byLevel, cap)
        : null,
    [attacker.atkIv, attacker.defIv, attacker.staIv, attackerEntry, cap, cpData],
  );
  const defenderBuild = useMemo(
    () =>
      defenderEntry && cpData
        ? findMaxLevelBuild(defenderEntry, defender.atkIv, defender.defIv, defender.staIv, cpData.levels, cpData.byLevel, cap)
        : null,
    [cap, cpData, defender.atkIv, defender.defIv, defender.staIv, defenderEntry],
  );

  const outgoing = useMemo(() => {
    if (!attackerBuild || !defenderBuild || !attackerPvp) return [];
    const moves = [...attackerFasts, ...attackerCharged];
    return moves.map((move) => {
      const damage = damageForMove(
        move,
        attackerBuild.attack,
        defenderBuild.defense,
        attackerPvp.types,
        defenderPvp?.types ?? ["normal"],
        attacker.shadow,
        defender.shadow,
      );
      const next = nextAttackBreakpoint({
        power: move.power,
        attack: attackerBuild.attack,
        defense: defenderBuild.defense,
        moveType: move.type,
        attackerTypes: attackerPvp.types,
        defenderTypes: defenderPvp?.types ?? ["normal"],
        shadowAttack: attacker.shadow,
        shadowDefense: defender.shadow,
      });
      return {
        move,
        damage,
        next,
        ko: hitsToKo(defenderBuild.stamina, damage),
      };
    });
  }, [attacker.shadow, attackerBuild, attackerCharged, attackerFasts, attackerPvp, defender.shadow, defenderBuild, defenderPvp]);

  const incomingFast = defenderFasts.find((move) => move.id === defender.fastId) ?? defenderFasts[0] ?? null;
  const incoming = useMemo(() => {
    if (!attackerBuild || !defenderBuild || !incomingFast || !defenderPvp || !attackerPvp) return null;
    const damage = damageForMove(
      incomingFast,
      defenderBuild.attack,
      attackerBuild.defense,
      defenderPvp.types,
      attackerPvp.types,
      defender.shadow,
      attacker.shadow,
    );
    const bulk = nextDefenseBulkpoint({
      power: incomingFast.power,
      attack: defenderBuild.attack,
      defense: attackerBuild.defense,
      moveType: incomingFast.type,
      attackerTypes: defenderPvp.types,
      defenderTypes: attackerPvp.types,
      shadowAttack: defender.shadow,
      shadowDefense: attacker.shadow,
    });
    return { move: incomingFast, damage, bulk, ko: hitsToKo(attackerBuild.stamina, damage) };
  }, [attacker.shadow, attackerBuild, attackerPvp, defender.shadow, defenderBuild, defenderPvp, incomingFast]);

  const atkIvRows = useMemo(() => {
    if (!attackerEntry || !defenderBuild || !cpData || !attackerPvp) return [];
    const move = attackerFasts.find((item) => item.id === attacker.fastId) ?? attackerFasts[0];
    if (!move) return [];
    return Array.from({ length: 16 }, (_, atkIv) => {
      const build = findMaxLevelBuild(
        attackerEntry,
        atkIv,
        attacker.defIv,
        attacker.staIv,
        cpData.levels,
        cpData.byLevel,
        cap,
      );
      if (!build) return null;
      const damage = damageForMove(
        move,
        build.attack,
        defenderBuild.defense,
        attackerPvp.types,
        defenderPvp?.types ?? ["normal"],
        attacker.shadow,
        defender.shadow,
      );
      return { atkIv, damage, attack: build.attack, level: build.level, cp: build.cp };
    }).filter((row): row is NonNullable<typeof row> => Boolean(row));
  }, [attacker.defIv, attacker.fastId, attacker.shadow, attacker.staIv, attackerEntry, attackerFasts, attackerPvp, cap, cpData, defender.shadow, defenderBuild, defenderPvp]);

  return (
    <div className="page-iv">
      <div className="page-heading">
        <a className="btn btn-secondary btn-back" href="#/">
          <ArrowLeft size={16} />
          ホーム
        </a>
        <div>
          <h1>ダメージブレイク研究</h1>
          <p className="page-lead">
            自分と相手を選ぶと、技ごとのダメージと次のブレイクポイントが出ます。黄色い行は、今の個体よりダメージが1上がる攻撃IVです。
          </p>
        </div>
      </div>

      {error ? (
        <section className="panel">
          <h2 className="panel-title">データを読み込めませんでした</h2>
          <p className="page-lead">{error}</p>
          <button type="button" className="btn btn-primary" onClick={reload}>
            再読み込み
          </button>
        </section>
      ) : null}

      {!data && !error ? (
        <section className="panel" aria-busy="true">
          <p className="page-lead">研究データを読み込み中です。</p>
        </section>
      ) : null}

      {data ? (
        <>
          <div className="choice-row league-row" role="group" aria-label="リーグ">
            {leagueConfigs
              .filter((league) => league.id !== "custom")
              .map((league) => (
                <LeagueIconButton
                  key={league.id}
                  id={league.id}
                  label={league.label}
                  pressed={league.id === leagueId}
                  onClick={() => setLeagueId(league.id)}
                />
              ))}
          </div>

          <div className="duel-grid">
            <SideEditor
              title="自分"
              side={attacker}
              group={attackerGroup}
              entry={attackerEntry}
              groups={speciesGroups}
              fasts={attackerFasts}
              charged={attackerCharged}
              buildLabel={attackerBuild ? `Lv ${attackerBuild.level.toFixed(1)} / CP ${attackerBuild.cp}` : "CP上限内の個体がありません"}
              onSpecies={(group) => applySpecies(group, "attacker", true)}
              onChange={setAttacker}
            />
            <SideEditor
              title="相手"
              side={defender}
              group={defenderGroup}
              entry={defenderEntry}
              groups={speciesGroups}
              fasts={defenderFasts}
              charged={defenderCharged}
              buildLabel={defenderBuild ? `Lv ${defenderBuild.level.toFixed(1)} / CP ${defenderBuild.cp}` : "CP上限内の個体がありません"}
              onSpecies={(group) => applySpecies(group, "defender", true)}
              onChange={setDefender}
            />
          </div>

          <section className="panel">
            <h2 className="panel-title">与ダメージ</h2>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>技</th>
                    <th>タイプ</th>
                    <th>ダメージ</th>
                    <th>倒す発数</th>
                    <th>次のブレイク</th>
                  </tr>
                </thead>
                <tbody>
                  {outgoing.map((row) => (
                    <tr key={row.move.id}>
                      <td>
                        {row.move.name}
                        <span className="table-sub">{row.move.kind === "fast" ? "通常技" : "ゲージ技"}</span>
                      </td>
                      <td>{TYPE_LABEL_JA[asPvpType(row.move.type)]}</td>
                      <td className="num">{row.damage}</td>
                      <td className="num">{Number.isFinite(row.ko) ? row.ko : "—"}</td>
                      <td className="num">
                        {row.next
                          ? `${row.next.damage}（攻撃実数値 +${(row.next.attack - (attackerBuild?.attack ?? 0)).toFixed(1)}）`
                          : "なし"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {incoming ? (
            <section className="panel">
              <h2 className="panel-title">被ダメージ（相手の通常技）</h2>
              <p className="note">
                {incoming.move.name} で {incoming.damage} ダメージ。倒されるまで {incoming.ko} 発。
                {incoming.bulk
                  ? ` 防御実数値が +${(incoming.bulk.defense - (attackerBuild?.defense ?? 0)).toFixed(1)} で ${incoming.bulk.damage} に減ります。`
                  : ""}
              </p>
            </section>
          ) : null}

          <section className="panel">
            <h2 className="panel-title">攻撃IVと通常技ダメージ</h2>
            <p className="note">防御・HPはそのまま、攻撃IVだけを変えたときの通常技ダメージです。</p>
            <div className="iv-damage-grid">
              {atkIvRows.map((row, index) => {
                const prev = index > 0 ? atkIvRows[index - 1] : null;
                const isBreak = Boolean(prev && row.damage > prev.damage);
                return (
                  <div
                    key={row.atkIv}
                    className={`iv-damage-cell${row.atkIv === attacker.atkIv ? " is-current" : ""}${isBreak ? " is-break" : ""}`}
                  >
                    <span>攻撃 {row.atkIv}</span>
                    <strong className="num">{row.damage}</strong>
                  </div>
                );
              })}
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}

function SideEditor({
  title,
  side,
  group,
  entry,
  groups,
  fasts,
  charged,
  buildLabel,
  onSpecies,
  onChange,
}: {
  title: string;
  side: SideState;
  group: SpeciesGroup | null;
  entry: PogoStatRecord | undefined | null;
  groups: SpeciesGroup[];
  fasts: PvpMove[];
  charged: PvpMove[];
  buildLabel: string;
  onSpecies: (group: SpeciesGroup) => void;
  onChange: (next: SideState | ((current: SideState) => SideState)) => void;
}) {
  return (
    <section className="panel">
      <h2 className="panel-title">{title}</h2>
      <p className="selected-name">{group ? speciesDisplayName(group) : "未選択"}</p>
      <p className="note">{buildLabel}</p>
      <SpeciesPicker groups={groups} selectedName={side.species} onSelect={onSpecies} compact />
      {group && group.entries.length > 1 ? (
        <div className="choice-row" role="group" aria-label="フォルム">
          {group.entries.map((item) => (
            <button
              key={item.form}
              type="button"
              className="choice"
              aria-pressed={item.form === side.form}
              onClick={() => onChange({ ...side, form: item.form })}
            >
              {formatFormLabel(item.form)}
            </button>
          ))}
        </div>
      ) : null}
      <label className="check-row">
        <input
          type="checkbox"
          checked={side.shadow}
          onChange={(event) => onChange({ ...side, shadow: event.target.checked })}
        />
        シャドウ
      </label>
      <div className="iv-controls">
        <IvBox label="攻撃IV" value={side.atkIv} onChange={(atkIv) => onChange({ ...side, atkIv })} />
        <IvBox label="防御IV" value={side.defIv} onChange={(defIv) => onChange({ ...side, defIv })} />
        <IvBox label="HP IV" value={side.staIv} onChange={(staIv) => onChange({ ...side, staIv })} />
      </div>
      <label className="field">
        <span className="field-label">通常技</span>
        <select className="input" value={side.fastId} onChange={(event) => onChange({ ...side, fastId: event.target.value })}>
          {fasts.map((move) => (
            <option key={move.id} value={move.id}>
              {move.name}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span className="field-label">ゲージ技</span>
        <select
          className="input"
          value={side.chargedId}
          onChange={(event) => onChange({ ...side, chargedId: event.target.value })}
        >
          {charged.map((move) => (
            <option key={move.id} value={move.id}>
              {move.name}
            </option>
          ))}
        </select>
      </label>
      {entry ? (
        <p className="note">
          種族値 {entry.base_attack} / {entry.base_defense} / {entry.base_stamina}
        </p>
      ) : null}
    </section>
  );
}

function IvBox({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <input
        className="input iv-input"
        type="number"
        min={0}
        max={15}
        inputMode="numeric"
        value={value}
        onChange={(event) => onChange(clampIv(Number(event.target.value)))}
      />
    </label>
  );
}
