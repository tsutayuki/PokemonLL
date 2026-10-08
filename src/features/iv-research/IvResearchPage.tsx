import { useEffect, useMemo, useState } from "react";
import { LeagueIconButton, LeagueMark } from "../../components/LeagueIconButton";
import { PokemonDotSprite } from "../../components/PokemonDotSprite";
import {
  buildCpMultiplierMap,
  computeBestRankings,
  computeCp,
  formatFormLabel,
  formatScp,
  pickPreferredEntry,
  speciesDisplayName,
  type CpMultiplierRecord,
  type PogoStatRecord,
  type RankingRow,
  type SpeciesGroup,
} from "../../lib/pogo/research";
import { recordPokemonPick, usePokemonPicks } from "../../lib/pogo/pokemonPicks";
import { openPokemonSearch } from "../shared/pokemonSearchApi";
import { IvBars } from "../shared/IvBars";
import { RankTable } from "./RankTable";

type PreevoEntry = {
  parentId: number;
  parentName: string;
  parentForm: string;
};

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
  const [preevo, setPreevo] = useState<Record<string, PreevoEntry>>({});
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [tab, setTab] = useState<TabId>("check");
  const [selected, setSelected] = useState<SpeciesGroup | null>(null);
  const [form, setForm] = useState("");
  const [atkIv, setAtkIv] = useState(15);
  const [defIv, setDefIv] = useState(15);
  const [staIv, setStaIv] = useState(15);
  const [studyLeague, setStudyLeague] = useState<StudyLeagueId>("great");
  const [customCap, setCustomCap] = useState(1500);
  const { recent } = usePokemonPicks();

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setError(null);
      try {
        const [statsRes, cpmRes, preRes] = await Promise.all([
          fetch("/data/pokemon_stats.json"),
          fetch("/data/cp_multiplier.json"),
          fetch("/data/pokemon_preevo.json"),
        ]);
        if (!statsRes.ok || !cpmRes.ok || !preRes.ok) throw new Error("data");
        const nextStats = (await statsRes.json()) as PogoStatRecord[];
        const multipliers = (await cpmRes.json()) as CpMultiplierRecord[];
        const nextPreevo = (await preRes.json()) as Record<string, PreevoEntry>;
        if (!cancelled) {
          setStats(nextStats);
          setCpData(buildCpMultiplierMap(multipliers));
          setPreevo(nextPreevo);
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

  const studyCap = studyLeague === "custom" ? customCap : STUDY_LEAGUES.find((league) => league.id === studyLeague)?.cap ?? 1500;

  const checkRanks = useMemo(() => {
    if (!entry || !cpData || tab !== "check") return new Map<number, RankingRow[]>();
    const map = new Map<number, RankingRow[]>();
    for (const league of CHECK_LEAGUES) {
      map.set(league.cap, computeBestRankings(entry, cpData.levels, cpData.byLevel, league.cap));
    }
    return map;
  }, [cpData, entry, tab]);

  const studyRanks = useMemo(() => {
    if (!entry || !cpData || tab !== "study") return [];
    return computeBestRankings(entry, cpData.levels, cpData.byLevel, studyCap);
  }, [cpData, entry, studyCap, tab]);

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
                  <img className="pokemon-dot-sprite" src="/Image/placeholder.svg" alt="" width={64} height={64} />
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
              <IvBars atk={atkIv} def={defIv} sta={staIv} onChange={(next) => { setAtkIv(next.atk); setDefIv(next.def); setStaIv(next.sta); }} />
              {entry && cpData ? (
                <div className="check-board">
                  <div className="check-sprite">
                    <PokemonDotSprite pokemonId={entry.pokemon_id} form={entry.form} alt="" size={64} />
                  </div>
                  {CHECK_LEAGUES.map((league) => {
                    const row = checkRanks.get(league.cap)?.find((item) => item.atkIv === atkIv && item.defIv === defIv && item.staIv === staIv);
                    const before = row ? previousCp(entry, row, stats, preevo, cpData) : null;
                    return (
                      <article key={league.id} className="check-league">
                        <h2>
                          <LeagueMark id={league.id} label={league.label} />
                        </h2>
                        {row ? (
                          <div className="check-stats">
                            <p className="check-rank num">#{row.rank}</p>
                            <p className="num">CP {row.cp} <span>Lv{row.level.toFixed(1)}</span></p>
                            <p className="num">SCP {formatScp(row.statProduct)}</p>
                            <p className="num">攻撃 {row.attack.toFixed(1)}</p>
                            {before !== null ? <p className="num">前CP {before}</p> : null}
                          </div>
                        ) : (
                          <p className="note">このCP帯には入りません。</p>
                        )}
                      </article>
                    );
                  })}
                </div>
              ) : (
                <p className="note">ポケモンを選ぶと、リーグごとの順位が出ます。</p>
              )}
            </div>
          ) : (
            <div className="iv-tab-panel" role="tabpanel">
              <IvBars atk={atkIv} def={defIv} sta={staIv} onChange={(next) => { setAtkIv(next.atk); setDefIv(next.def); setStaIv(next.sta); }} />
              <div className="choice-row league-row" role="group" aria-label="リーグ">
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
                  <section className="analysis-card" aria-label="個体分析">
                    <div className="analysis-row">
                      <div>
                        <span>順位</span>
                        <strong className="num">#{studyCurrent.rank}</strong>
                      </div>
                      <div>
                        <span>CP</span>
                        <strong className="num">{studyCurrent.cp}</strong>
                        <small className="num">Lv{studyCurrent.level.toFixed(1)}</small>
                      </div>
                      <div>
                        <span>SCP</span>
                        <strong className="num">{formatScp(studyCurrent.statProduct)}</strong>
                      </div>
                    </div>
                    <div className="analysis-row">
                      <div>
                        <span>攻撃</span>
                        <strong className="num">{studyCurrent.attack.toFixed(1)}</strong>
                      </div>
                      <div>
                        <span>防御</span>
                        <strong className="num">{studyCurrent.defense.toFixed(1)}</strong>
                      </div>
                      <div>
                        <span>HP</span>
                        <strong className="num">{studyCurrent.stamina}</strong>
                      </div>
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
  entry: PogoStatRecord,
  row: RankingRow,
  stats: PogoStatRecord[],
  preevo: Record<string, PreevoEntry>,
  cpData: NonNullable<ReturnType<typeof buildCpMultiplierMap>>,
) {
  const parent = preevo[`${entry.pokemon_id}:${entry.form}`] ?? preevo[`${entry.pokemon_id}:Normal`];
  if (!parent) return null;
  const record =
    stats.find((item) => item.pokemon_id === parent.parentId && item.form === parent.parentForm) ??
    stats.find((item) => item.pokemon_id === parent.parentId);
  if (!record) return null;
  const multiplier = cpData.byLevel.get(row.level.toFixed(1));
  if (multiplier === undefined) return null;
  return computeCp(record, row.atkIv, row.defIv, row.staIv, multiplier);
}
