import React from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  BarChart3,
  Calculator,
  ChevronRight,
  Crosshair,
  Gauge,
  Layers3,
  Shield,
  Swords,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import { IvResearchPage } from "./research/IvResearchPage";
import "./styles.css";

type ResearchCard = {
  title: string;
  description: string;
  status: string;
  icon: LucideIcon;
  accent: string;
  metrics: string[];
  href: string;
};

const researchCards: ResearchCard[] = [
  {
    title: "ポケモン個体値研究",
    description: "1匹のポケモンごとにCP、SCP、攻撃/防御/HPの個体値・実数値を比較して育成候補を研究",
    status: "CP / SCP / Rank",
    icon: Gauge,
    accent: "mint",
    metrics: ["SCP順位比較", "実数値", "リーグ別"],
    href: "#/research/iv",
  },
  {
    title: "ダメージブレイク研究",
    description: "技ごとのブレイクポイントをポケモンの実数値ごとに計算・研究",
    status: "Break Point",
    icon: Crosshair,
    accent: "amber",
    metrics: ["通常技", "ゲージ技", "ブレイクポイント"],
    href: "#/",
  },
  {
    title: "バトルシミュレーション研究",
    description: "シールド枚数、交代タイミング、技発動順を変えて対戦展開を検証する。",
    status: "Simulation",
    icon: Swords,
    accent: "red",
    metrics: ["対面検証", "シールド", "シミュレーション"],
    href: "#/",
  },
  {
    title: "6体6パーティ考察研究",
    description: "6体編成の役割、補完、苦手対面を可視化してパーティ案を比較する。",
    status: "Party Lab",
    icon: UsersRound,
    accent: "blue",
    metrics: ["補完表", "役割", "分析"],
    href: "#/",
  },
];

function App() {
  const [route, setRoute] = React.useState(() => getRouteFromHash(window.location.hash));

  React.useEffect(() => {
    const onHashChange = () => setRoute(getRouteFromHash(window.location.hash));
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  if (route === "/research/iv") {
    return <IvResearchPage />;
  }

  return (
    <main className="app-shell">
      <section className="hero">
        <div className="hero-media" aria-hidden="true" />
        <div className="hero-overlay" />

        <nav className="topbar" aria-label="メインナビゲーション">
          <a className="brand" href="#/" aria-label="PokemonLL ホーム">
            <span className="brand-mark">
              <Activity size={18} strokeWidth={2.4} />
            </span>
            <span>PokemonLL</span>
          </a>
          <div className="nav-actions">
            <button type="button" className="icon-button" aria-label="研究データ">
              <BarChart3 size={18} />
            </button>
            <button type="button" className="icon-button" aria-label="防御相性">
              <Shield size={18} />
            </button>
          </div>
        </nav>

        <div className="hero-content">
          <div className="hero-copy">
            <p className="eyebrow">Pokemon GO Battle Research</p>
            <h1>PokemonLL</h1>
            <p className="lead">
              LLチーム用のポケモンGO育成研究ワークスペース
            </p>
            <div className="quick-stats" aria-label="運用想定">
              <span>
                <strong>10</strong>
                名規模
              </span>
              <span>
                <strong>TS</strong>
                中心
              </span>
              <span>
                <strong>CF</strong>
                無料運用
              </span>
            </div>
          </div>

          <div className="status-panel" aria-label="研究サマリー">
            <div className="panel-heading">
              <Layers3 size={18} />
              <span>Research Modules</span>
            </div>
            <div className="signal-row">
              <span>IV</span>
              <div className="signal-track">
                <i style={{ width: "82%" }} />
              </div>
            </div>
            <div className="signal-row">
              <span>DMG</span>
              <div className="signal-track">
                <i style={{ width: "68%" }} />
              </div>
            </div>
            <div className="signal-row">
              <span>SIM</span>
              <div className="signal-track">
                <i style={{ width: "74%" }} />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="research-grid" aria-label="研究メニュー">
        {researchCards.map((card) => {
          const Icon = card.icon;
          return (
            <a className={`research-card ${card.accent}`} href={card.href} key={card.title}>
              <span className="card-icon">
                <Icon size={22} strokeWidth={2.2} />
              </span>
              <span className="card-body">
                <span className="card-kicker">{card.status}</span>
                <span className="card-title">{card.title}</span>
                <span className="card-description">{card.description}</span>
                <span className="metric-list">
                  {card.metrics.map((metric) => (
                    <span key={metric}>{metric}</span>
                  ))}
                </span>
              </span>
              <ChevronRight className="card-arrow" size={19} aria-hidden="true" />
            </a>
          );
        })}
      </section>

      <section className="build-note" aria-label="構築方針">
        <div>
          <Calculator size={18} />
          <span>Next: 各研究モジュールの入力モデルとCloudflare D1/KV/R2の使い分けを設計</span>
        </div>
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

function getRouteFromHash(hash: string) {
  const normalized = hash.replace(/^#/, "").replace(/\/+$/, "");
  return normalized === "" ? "/" : normalized;
}
