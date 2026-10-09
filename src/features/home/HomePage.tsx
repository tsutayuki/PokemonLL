import { ChevronRight, Crosshair, Gauge, Swords, UsersRound, type LucideIcon } from "lucide-react";

type ResearchCard = {
  title: string;
  description: string;
  icon: LucideIcon;
  metrics: string[];
  href?: string;
  ready: boolean;
};

const researchCards: ResearchCard[] = [
  {
    title: "ポケモン個体値研究",
    description: "1匹ごとにCP、SCP、攻撃・防御・HPを比較して、育成候補を絞ります。",
    icon: Gauge,
    metrics: ["SCP順位", "実数値", "リーグ別"],
    href: "#/research/iv",
    ready: true,
  },
  {
    title: "バトルシミュレーション研究",
    description: "シールド枚数とゲージ技のタイミングを変えて、対面の展開を検証します。",
    icon: Swords,
    metrics: ["対面", "シールド", "シミュレーション"],
    href: "#/research/sim",
    ready: true,
  },
  {
    title: "ダメージブレイク研究",
    description: "技ごとのブレイクポイントを、ポケモンの実数値ごとに計算します。",
    icon: Crosshair,
    metrics: ["通常技", "ゲージ技", "ブレイク"],
    href: "#/research/break",
    ready: true,
  },
  {
    title: "6体パーティ考察研究",
    description: "6体編成の役割、補完、苦手対面を可視化して、パーティ案を比べます。",
    icon: UsersRound,
    metrics: ["補完表", "役割", "分析"],
    ready: false,
  },
];

export function HomePage() {
  return (
    <div className="page-home">
      <section className="home-intro rise">
        <p className="eyebrow">ポケモンGO バトル研究</p>
        <h1>PokemonLL</h1>
        <p className="lead">ポケモンGOの育成を、数字で比較する研究ツールです。</p>
        <div className="home-cta-row">
          <a className="btn btn-primary" href="#/research/iv">
            ポケモン個体値研究を開く
          </a>
          <a className="btn btn-secondary" href="#/research/sim">
            シミュレーション
          </a>
        </div>
      </section>

      <section className="research-grid" aria-label="研究メニュー">
        {researchCards.map((card, index) => {
          const Icon = card.icon;
          const body = (
            <>
              <span className="card-icon">
                <Icon size={20} strokeWidth={2.2} />
              </span>
              <span className="card-body">
                <span className="card-kicker">{card.ready ? "利用できる" : "準備中"}</span>
                <span className="card-title">{card.title}</span>
                <span className="card-description">{card.description}</span>
                <span className="metric-list">
                  {card.metrics.map((metric) => (
                    <span key={metric}>{metric}</span>
                  ))}
                </span>
              </span>
              {card.ready ? <ChevronRight className="card-arrow" size={18} aria-hidden="true" /> : null}
            </>
          );

          if (card.ready && card.href) {
            return (
              <a
                className="research-card is-ready rise"
                href={card.href}
                key={card.title}
                style={{ animationDelay: `${80 + index * 70}ms` }}
              >
                {body}
              </a>
            );
          }

          return (
            <article
              className="research-card is-soon rise"
              key={card.title}
              aria-disabled="true"
              style={{ animationDelay: `${80 + index * 70}ms` }}
            >
              {body}
            </article>
          );
        })}
      </section>
    </div>
  );
}
