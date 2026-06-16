import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  BarChart3,
  Gauge,
  ListFilter,
  Search,
} from "lucide-react";
import {
  buildCpMultiplierMap,
  computeBestRankings,
  computeDerivedStats,
  formatFormLabel,
  getPokemonDisplayName,
  groupSpecies,
  leagueConfigs,
  type CpMultiplierRecord,
  type LeagueId,
  type PogoStatRecord,
  type RankingRow,
  type SpeciesGroup,
} from "../pogoResearch";

type LoadedData = {
  stats: PogoStatRecord[];
  multipliers: CpMultiplierRecord[];
};

function leagueCap(leagueId: LeagueId, customCap: number) {
  if (leagueId === "custom") return customCap;
  return leagueConfigs.find((league) => league.id === leagueId)?.cap ?? 1500;
}

function pickPreferredEntry(group: SpeciesGroup) {
  return group.entries.find((entry) => entry.form === "Normal") ?? group.entries[0];
}

function speciesDisplayName(group: SpeciesGroup) {
  return getPokemonDisplayName(group.pokemonId, group.name);
}

function formatStat(value: number) {
  return value.toLocaleString("ja-JP", {
    maximumFractionDigits: 2,
  });
}

export function IvResearchPage() {
  const [data, setData] = useState<LoadedData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selectedSpecies, setSelectedSpecies] = useState("");
  const [selectedForm, setSelectedForm] = useState("");
  const [leagueId, setLeagueId] = useState<LeagueId>("great");
  const [customCap, setCustomCap] = useState(1500);
  const [level, setLevel] = useState(50);
  const [atkIv, setAtkIv] = useState(0);
  const [defIv, setDefIv] = useState(15);
  const [staIv, setStaIv] = useState(15);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [statsRes, cpmRes] = await Promise.all([
          fetch("/data/pokemon_stats.json"),
          fetch("/data/cp_multiplier.json"),
        ]);

        if (!statsRes.ok || !cpmRes.ok) {
          throw new Error("data fetch failed");
        }

        const stats = (await statsRes.json()) as PogoStatRecord[];
        const multipliers = (await cpmRes.json()) as CpMultiplierRecord[];

        if (!cancelled) {
          setData({ stats, multipliers });
        }
      } catch {
        if (!cancelled) {
          setError("種族値データの読み込みに失敗しました。");
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const speciesGroups = useMemo(() => {
    if (!data) return [];
    return groupSpecies(data.stats);
  }, [data]);

  useEffect(() => {
    if (!speciesGroups.length) return;
    if (!selectedSpecies) {
      const preferred = speciesGroups[0];
      const entry = pickPreferredEntry(preferred);
      setSelectedSpecies(preferred.name);
      setSelectedForm(entry.form);
    }
  }, [selectedSpecies, speciesGroups]);

  const filteredSpecies = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return speciesGroups.slice(0, 60);

    return speciesGroups.filter((group) => {
      const englishName = group.name.toLowerCase();
      const japaneseName = speciesDisplayName(group).toLowerCase();
      const formMatch = group.entries.some((entry) => entry.form.toLowerCase().includes(normalizedQuery));
      return englishName.includes(normalizedQuery) || japaneseName.includes(normalizedQuery) || formMatch;
    }).slice(0, 60);
  }, [query, speciesGroups]);

  useEffect(() => {
    if (!selectedSpecies || !speciesGroups.length) return;
    const group = speciesGroups.find((item) => item.name === selectedSpecies);
    if (!group) return;
    if (!group.entries.some((entry) => entry.form === selectedForm)) {
      setSelectedForm(pickPreferredEntry(group).form);
    }
  }, [selectedForm, selectedSpecies, speciesGroups]);

  const selectedGroup = useMemo(() => {
    if (!selectedSpecies) return null;
    return speciesGroups.find((group) => group.name === selectedSpecies) ?? null;
  }, [selectedSpecies, speciesGroups]);

  const selectedEntry = useMemo(() => {
    if (!selectedGroup) return null;
    return selectedGroup.entries.find((entry) => entry.form === selectedForm) ?? pickPreferredEntry(selectedGroup);
  }, [selectedForm, selectedGroup]);

  const cpData = useMemo(() => {
    if (!data) return null;
    return buildCpMultiplierMap(data.multipliers);
  }, [data]);

  const cap = leagueCap(leagueId, customCap);

  const allRankings = useMemo(() => {
    if (!selectedEntry || !cpData) return [];
    return computeBestRankings(selectedEntry, cpData.levels, cpData.byLevel, cap);
  }, [cap, cpData, selectedEntry]);

  const rankings = useMemo(() => allRankings.slice(0, 80), [allRankings]);

  const currentStats = useMemo(() => {
    if (!selectedEntry || !cpData) return null;
    const multiplier = cpData.byLevel.get(level.toFixed(1));
    if (multiplier === undefined) return null;
    return computeDerivedStats(selectedEntry, atkIv, defIv, staIv, multiplier);
  }, [atkIv, cpData, defIv, level, selectedEntry, staIv]);

  const currentRank = useMemo(() => {
    if (!currentStats || !allRankings.length) return null;
    const found = allRankings.find(
      (row) => row.atkIv === atkIv && row.defIv === defIv && row.staIv === staIv,
    );
    return found ?? null;
  }, [atkIv, allRankings, defIv, currentStats, staIv]);

  const speciesCount = speciesGroups.length;
  const formCount = selectedGroup?.entries.length ?? 0;

  return (
    <main className="research-page">
      <header className="page-shell">
        <a className="back-link" href="#/">
          <ArrowLeft size={18} />
          <span>ホームに戻る</span>
        </a>
        <div className="page-title-block">
          <p className="eyebrow">PokemonLL / IV Research</p>
          <h1>ポケモン個体値研究</h1>
          <p className="page-lead">
            信頼できる公開データを元に、種族値、個体値、CP、PvP向けランキングを比較するページ。
          </p>
        </div>
      </header>

      {error ? (
        <section className="iv-panel page-shell">
          <div className="panel-heading">
            <ListFilter size={18} />
            <span>データ読み込みエラー</span>
          </div>
          <p className="page-lead">{error}</p>
        </section>
      ) : null}

      {!data ? (
        <section className="iv-panel page-shell">
          <p className="page-lead">種族値データを読み込み中です。</p>
        </section>
      ) : (
        <>
          <section className="iv-grid">
            <article className="iv-panel iv-panel-wide">
              <div className="panel-heading">
                <Search size={18} />
                <span>ポケモン検索</span>
              </div>
              <div className="search-row">
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="名前やフォルムで絞り込み"
                  className="search-input"
                />
              </div>
              <div className="species-list">
                {filteredSpecies.map((group) => {
                  const isSelected = group.name === selectedSpecies;
                  return (
                    <button
                      key={group.name}
                      type="button"
                      className={`species-item ${isSelected ? "selected" : ""}`}
                      onClick={() => {
                        setSelectedSpecies(group.name);
                        setSelectedForm(pickPreferredEntry(group).form);
                      }}
                    >
                      <span className="species-name">{speciesDisplayName(group)}</span>
                      <span className="species-meta">
                        No.{String(group.pokemonId).padStart(3, "0")} / {group.entries.length} form
                      </span>
                    </button>
                  );
                })}
              </div>
            </article>

            <article className="iv-panel">
              <div className="panel-heading">
                <Gauge size={18} />
                <span>選択中</span>
              </div>
              <div className="summary-stack">
                <div>
                  <span>種族</span>
                  <strong>{selectedGroup ? speciesDisplayName(selectedGroup) : "-"}</strong>
                </div>
                <div>
                  <span>フォルム</span>
                  <strong>{selectedEntry ? formatFormLabel(selectedEntry.form) : "-"}</strong>
                </div>
                <div>
                  <span>種族数</span>
                  <strong>{speciesCount}</strong>
                </div>
                <div>
                  <span>フォルム数</span>
                  <strong>{formCount}</strong>
                </div>
              </div>
            </article>

            <article className="iv-panel">
              <div className="panel-heading">
                <BarChart3 size={18} />
                <span>研究条件</span>
              </div>
              <div className="control-stack">
                <label>
                  <span>リーグ</span>
                  <select value={leagueId} onChange={(event) => setLeagueId(event.target.value as LeagueId)}>
                    {leagueConfigs.map((league) => (
                      <option key={league.id} value={league.id}>
                        {league.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>CP上限</span>
                  <input
                    type="number"
                    min={10}
                    max={9999}
                    value={leagueId === "custom" ? customCap : cap}
                    onChange={(event) => setCustomCap(Number(event.target.value))}
                    disabled={leagueId !== "custom"}
                  />
                </label>
                <label>
                  <span>レベル</span>
                  <input
                    type="range"
                    min={1}
                    max={50}
                    step={0.5}
                    value={level}
                    onChange={(event) => setLevel(Number(event.target.value))}
                  />
                  <strong>{level.toFixed(1)}</strong>
                </label>
              </div>
            </article>
          </section>

          <section className="iv-grid iv-grid-main">
            <article className="iv-panel iv-panel-wide">
              <div className="panel-heading">
                <ListFilter size={18} />
                <span>個体値とCP</span>
              </div>
              <div className="control-row">
                <label>
                  <span>攻撃IV</span>
                  <input
                    type="number"
                    min={0}
                    max={15}
                    value={atkIv}
                    onChange={(event) => setAtkIv(Number(event.target.value))}
                  />
                </label>
                <label>
                  <span>防御IV</span>
                  <input
                    type="number"
                    min={0}
                    max={15}
                    value={defIv}
                    onChange={(event) => setDefIv(Number(event.target.value))}
                  />
                </label>
                <label>
                  <span>HP IV</span>
                  <input
                    type="number"
                    min={0}
                    max={15}
                    value={staIv}
                    onChange={(event) => setStaIv(Number(event.target.value))}
                  />
                </label>
              </div>

              <div className="result-grid">
                <div>
                  <span>CP</span>
                  <strong>{currentStats ? currentStats.cp : "-"}</strong>
                </div>
                <div>
                  <span>攻撃</span>
                  <strong>{currentStats ? formatStat(currentStats.attack) : "-"}</strong>
                </div>
                <div>
                  <span>防御</span>
                  <strong>{currentStats ? formatStat(currentStats.defense) : "-"}</strong>
                </div>
                <div>
                  <span>HP</span>
                  <strong>{currentStats ? formatStat(currentStats.stamina) : "-"}</strong>
                </div>
              </div>

              <div className="result-grid muted">
                <div>
                  <span>種族値</span>
                  <strong>
                    {selectedEntry ? `${selectedEntry.base_attack} / ${selectedEntry.base_defense} / ${selectedEntry.base_stamina}` : "-"}
                  </strong>
                </div>
                <div>
                  <span>上限</span>
                  <strong>{cap}</strong>
                </div>
                <div>
                  <span>ソース</span>
                  <strong>pogoapi.net</strong>
                </div>
                <div>
                  <span>比較</span>
                  <strong>{currentRank ? `#${currentRank.rank}` : "-"}</strong>
                </div>
              </div>
            </article>

            <article className="iv-panel">
              <div className="panel-heading">
                <BarChart3 size={18} />
                <span>ランキング上位</span>
              </div>
              <div className="ranking-list">
                {rankings.slice(0, 12).map((row) => (
                  <div key={`${row.rank}-${row.atkIv}-${row.defIv}-${row.staIv}`} className="ranking-row">
                    <span className="ranking-no">#{row.rank}</span>
                    <div className="ranking-main">
                      <strong>{row.atkIv}/{row.defIv}/{row.staIv}</strong>
                      <span>Lv {row.level.toFixed(1)} / CP {row.cp} / SP {Math.round(row.statProduct)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </article>
          </section>

          <section className="iv-panel page-shell">
            <div className="panel-heading">
              <ListFilter size={18} />
              <span>現在の選択</span>
            </div>
            <p className="page-lead">
              {selectedEntry
                ? `${selectedGroup ? speciesDisplayName(selectedGroup) : selectedEntry.pokemon_name} (${formatFormLabel(selectedEntry.form)}) の個体値研究を表示中。`
                : "ポケモンを選択してください。"}
            </p>
          </section>
        </>
      )}
    </main>
  );
}
