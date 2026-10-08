import { useEffect, useMemo, useState } from "react";
import { LeagueIconButton, LeagueMark } from "../../components/LeagueIconButton";
import { PokemonDotSprite } from "../../components/PokemonDotSprite";
import { buildEvolutionLine, type EvolutionData, type LineMember } from "../../lib/pogo/evolutionLine";
import { pokemonDexPlaceholderPath } from "../../lib/pogo/pokemonSprite";
import {
  buildCpMultiplierMap,
  computeBestRankings,
  computeCp,
  formatFormLabel,
  formatPlace,
  formatScp,
  pickPreferredEntry,
  placeTone,
  speciesDisplayName,
  withBuddyLevels,
  type CpMultiplierRecord,
  type PogoStatRecord,
  type RankingRow,
  type SpeciesGroup,
} from "../../lib/pogo/research";
import { recordPokemonPick, usePokemonPicks } from "../../lib/pogo/pokemonPicks";
import { openPokemonSearch } from "../shared/pokemonSearchApi";
import { IvBars } from "../shared/IvBars";
import { RankTable } from "./RankTable";

type TabId = "check" | "study";

const CHECK_LEAGUES = [
  { id: "little", label: "リトル", cap: 500 },
  { id: "great", label: "スーパー", cap: 1500 },
  { id: "ultra", label: "ハイパー", cap: 2500 },
] as const;

const STUDY_LEAGUES = [
  { id: "little", label: "リトル", cap: 500 },
  { id: "great", label: "スーパー", cap: 1500 },
  { id: "ultra", label: "ハイパー", cap: 2500 },
  { id: "master", label: "マスター", cap: Number.POSITIVE_INFINITY },
  { id: "custom", label: "カスタム", cap: null },
] as const;

type StudyLeagueId = (typeof STUDY_LEAGUES)[number]["id"];

export function IvResearchPage() {
  const [stats, setStats] = useState<PogoStatRecord[] | null>(null);
  const [cpData, setCpData] = useState<ReturnType<typeof buildCpMultiplierMap> | null>(null);
  const [evolutions, setEvolutions] = useState<EvolutionData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [tab, setTab] = useState<TabId>("check");
  const [selected, setSelected] = useState<SpeciesGroup | null>(null);
  const [form, setForm] = useState("");
  const [atkIv, setAtkIv] = useState(15);
  const [defIv, setDefIv] = useState(15);
  const [staIv, setStaIv] = useState(15);
  const [buddy, setBuddy] = useState(false);
  const [studyLeague, setStudyLeague] = useState<StudyLeagueId>("great");
  const [customCap, setCustomCap] = useState(1500);
  const { recent } = usePokemonPicks();

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setError(null);
      try {
        const [statsRes, cpmRes, evoRes] = await Promise.all([
          fetch("/data/pokemon_stats.json"),
          fetch("/data/cp_multiplier.json"),
          fetch("/data/pokemon_evolutions.json"),
        ]);
        if (!statsRes.ok || !cpmRes.ok || !evoRes.ok) throw new Error("data");
        const nextStats = (await statsRes.json()) as PogoStatRecord[];
        const multipliers = (await cpmRes.json()) as CpMultiplierRecord[];
        const nextEvolutions = (await evoRes.json()) as EvolutionData;
        if (!cancelled) {
          setStats(nextStats);
          setCpData(buildCpMultiplierMap(multipliers));
          setEvolutions(nextEvolutions);
        }
      } catch {
        if (!cancelled) setError("種族値データの読み込みに失敗しました。");
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const entry = useMemo(() => {
    if (!selected) return null;
    return selected.entries.find((item) => item.form === form) ?? pickPreferredEntry(selected);
  }, [form, selected]);

  const levelScale = useMemo(() => (cpData ? withBuddyLevels(cpData, buddy) : null), [buddy, cpData]);
  const maxLevel = buddy ? 51 : 50;

  const members = useMemo(() => {
    if (!entry || !stats || !evolutions) return [];
    return buildEvolutionLine(entry, stats, evolutions);
  }, [entry, evolutions, stats]);

  const studyCap = studyLeague === "custom" ? customCap : STUDY_LEAGUES.find((league) => league.id === studyLeague)?.cap ?? 1500;

  const checkRanks = useMemo(() => {
    const map = new Map<string, RankingRow[]>();
    if (!levelScale || tab !== "check") return map;
    for (const member of members) {
      for (const league of CHECK_LEAGUES) {
        map.set(
          `${member.key}:${league.cap}`,
          computeBestRankings(member.record, levelScale.levels, levelScale.byLevel, league.cap, maxLevel),
        );
      }
    }
    return map;
  }, [levelScale, maxLevel, members, tab]);

  const studyRanks = useMemo(() => {
    if (!entry || !levelScale || tab !== "study") return [];
    return computeBestRankings(entry, levelScale.levels, levelScale.byLevel, studyCap, maxLevel);
  }, [entry, levelScale, maxLevel, studyCap, tab]);

  const studyCurrent = useMemo(
    () => studyRanks.find((row) => row.atkIv === atkIv && row.defIv === defIv && row.staIv === staIv) ?? null,
    [atkIv, defIv, staIv, studyRanks],
  );

  const chooseGroup = (group: SpeciesGroup) => {
    setSelected(group);
    setForm(pickPreferredEntry(group).form);
  };

  const chooseRecent = (pokemonId: number) => {
    if (!stats) return;
    const named = stats.find((item) => item.pokemon_id === pokemonId);
    if (!named) return;
    const entries = stats.filter((item) => item.pokemon_name === named.pokemon_name);
    const group: SpeciesGroup = {
      name: named.pokemon_name,
      pokemonId: Math.min(...entries.map((item) => item.pokemon_id)),
      entries,
    };
    chooseGroup(group);
    recordPokemonPick(group.pokemonId);
  };

  return (
    <div className="page-iv iv-page">
      <div className="iv-title-row">
        <a className="btn btn-secondary btn-back" href="#/">
          ホーム
        </a>
        <h1>個体値研究</h1>
      </div>

      {error ? (
        <section className="panel">
          <p className="page-lead">{error}</p>
          <button type="button" className="btn btn-primary" onClick={() => setReloadKey((value) => value + 1)}>
            再読み込み
          </button>
        </section>
      ) : null}

      {!stats && !error ? <p className="page-lead">種族値データを読み込み中です。</p> : null}

      {stats ? (
        <>
          <section className="mon-pick" aria-label="ポケモン選択">
            {recent.length > 0 ? (
              <div className="recent-row" aria-label="最近選んだポケモン">
                {recent.map((pokemonId) => (
                  <button key={pokemonId} type="button" className="recent-chip" onClick={() => chooseRecent(pokemonId)}>
                    <PokemonDotSprite pokemonId={pokemonId} alt="" size={40} />
                  </button>
                ))}
              </div>
            ) : null}
            <div className="mon-pick-main">
              <button type="button" className="mon-pick-name" onClick={() => openPokemonSearch(chooseGroup)}>
                {selected ? speciesDisplayName(selected) : "ポケモン選択"}
              </button>
              <button type="button" className="mon-pick-sprite" aria-label="ポケモン選択" onClick={() => openPokemonSearch(chooseGroup)}>
                {selected ? (
                  <PokemonDotSprite pokemonId={selected.pokemonId} form={entry?.form} alt="" size={64} />
                ) : (
                  <img className="pokemon-dot-sprite" src={pokemonDexPlaceholderPath()} alt="" width={64} height={64} />
                )}
              </button>
            </div>
            {selected && selected.entries.length > 1 ? (
              <div className="choice-row" role="group" aria-label="フォルム">
                {selected.entries.map((item) => (
                  <button
                    key={item.form}
                    type="button"
                    className="choice"
                    aria-pressed={item.form === entry?.form}
                    onClick={() => setForm(item.form)}
                  >
                    {formatFormLabel(item.form)}
                  </button>
                ))}
              </div>
            ) : null}
          </section>

          <IvBars
            atk={atkIv}
            def={defIv}
            sta={staIv}
            buddy={buddy}
            onBuddy={setBuddy}
            onChange={(next) => {
              setAtkIv(next.atk);
              setDefIv(next.def);
              setStaIv(next.sta);
            }}
          />

          <div className="iv-tabbar" role="tablist" aria-label="個体値研究">
            <button type="button" role="tab" aria-selected={tab === "check"} className={tab === "check" ? "is-active" : ""} onClick={() => setTab("check")}>
              個体チェック
            </button>
            <button type="button" role="tab" aria-selected={tab === "study"} className={tab === "study" ? "is-active" : ""} onClick={() => setTab("study")}>
              数値研究
            </button>
          </div>

          {tab === "check" ? (
            <div className="iv-tab-panel" role="tabpanel">
              {entry && levelScale && evolutions && members.length > 0 ? (
                <div className="check-scroll">
                  <div className="check-board">
                    <div className="check-head">
                      <div />
                      {CHECK_LEAGUES.map((league) => (
                        <div key={league.id} className="check-league-head">
                          <LeagueMark id={league.id} label={league.label} />
                        </div>
                      ))}
                    </div>
                    {members.map((member) => (
                      <div key={member.key} className="check-row">
                        <div className="check-sprite">
                          <PokemonDotSprite
                            pokemonId={member.record.pokemon_id}
                            form={member.exactSprite ? undefined : member.record.form}
                            exact={member.exactSprite}
                            spriteSuffix={member.spriteSuffix}
                            alt={member.label}
                            size={48}
                          />
                          <p className="check-name">{member.label}</p>
                        </div>
                        {CHECK_LEAGUES.map((league) => {
                          const row = checkRanks
                            .get(`${member.key}:${league.cap}`)
                            ?.find((item) => item.atkIv === atkIv && item.defIv === defIv && item.staIv === staIv);
                          const before = row ? previousCp(member, row, stats, evolutions, levelScale.byLevel) : null;
                          return (
                            <div key={league.id} className="check-cell">
                              {row ? (
                                <>
                                  <p className={`check-rank place num ${placeTone(row.rank)}`}>{formatPlace(row.rank)}</p>
                                  <p className="check-mid num">
                                    <span>CP {row.cp}</span>
                                    <span>SCP {formatScp(row.statProduct)}</span>
                                  </p>
                                  <p className="check-fine num">攻撃 {row.attack.toFixed(1)}</p>
                                  <p className="check-fine num">Lv{row.level.toFixed(1)}</p>
                                  {before !== null ? <p className="check-fine num">前CP {before}</p> : null}
                                </>
                              ) : (
                                <p className="check-fine">入らない</p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="note">ポケモンを選ぶと、リーグごとの順位が出ます。</p>
              )}
            </div>
          ) : (
            <div className="iv-tab-panel" role="tabpanel">
              <div className="choice-row league-row is-five" role="group" aria-label="リーグ">
                {STUDY_LEAGUES.map((league) => (
                  <LeagueIconButton
                    key={league.id}
                    id={league.id}
                    label={league.label}
                    pressed={studyLeague === league.id}
                    onClick={() => setStudyLeague(league.id)}
                  />
                ))}
              </div>
              {studyLeague === "custom" ? (
                <label className="field custom-cap">
                  <span className="field-label">CP上限</span>
                  <input
                    className="input"
                    type="number"
                    inputMode="numeric"
                    min={10}
                    max={9999}
                    value={customCap}
                    onChange={(event) => {
                      const next = Number(event.target.value);
                      if (Number.isFinite(next)) setCustomCap(next);
                    }}
                  />
                </label>
              ) : null}
              {entry && studyCurrent ? (
                <div className="study-layout">
                  <section className="study-summary" aria-label="個体分析">
                    <div>
                      <p className="study-kicker">順位</p>
                      <p className={`check-rank place num ${placeTone(studyCurrent.rank)}`}>{formatPlace(studyCurrent.rank)}</p>
                    </div>
                    <div className="study-side">
                      <p className="check-mid num">CP {studyCurrent.cp}</p>
                      <p className="check-mid num">SCP {formatScp(studyCurrent.statProduct)}</p>
                    </div>
                    <div className="study-side check-fine num">
                      <p>攻撃 {studyCurrent.attack.toFixed(1)}</p>
                      <p>防御 {studyCurrent.defense.toFixed(1)}</p>
                      <p>HP {studyCurrent.stamina}</p>
                      <p>レベル {studyCurrent.level.toFixed(1)}</p>
                    </div>
                  </section>
                  <RankTable rows={studyRanks} current={studyCurrent} />
                </div>
              ) : (
                <p className="note">{entry ? "このCP帯には入りません。" : "ポケモンを選ぶと、このリーグの順位と上位表が出ます。"}</p>
              )}
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}

function previousCp(
  member: LineMember,
  row: RankingRow,
  stats: PogoStatRecord[],
  evolutions: EvolutionData,
  byLevel: Map<string, number>,
) {
  const multiplier = byLevel.get(row.level.toFixed(1));
  if (multiplier === undefined) return null;
  if (member.megaBase) {
    return computeCp(member.megaBase, row.atkIv, row.defIv, row.staIv, multiplier);
  }
  const parent = evolutions.parents[`${member.record.pokemon_id}:${member.record.form}`];
  if (!parent) return null;
  const record =
    stats.find((item) => item.pokemon_id === parent.pokemonId && item.form === parent.form) ??
    stats.find((item) => item.pokemon_id === parent.pokemonId);
  if (!record) return null;
  return computeCp(record, row.atkIv, row.defIv, row.staIv, multiplier);
}
