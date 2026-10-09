import React from "react";

type SiteLayoutProps = {
  title?: string;
  route?: string;
  children: React.ReactNode;
};

const navItems = [
  { href: "#/", label: "ホーム", route: "/" },
  { href: "#/research/iv", label: "個体値", route: "/research/iv" },
  { href: "#/research/sim", label: "シミュ", route: "/research/sim" },
  { href: "#/research/break", label: "ブレイク", route: "/research/break" },
] as const;

export function SiteLayout({ title, route = "/", children }: SiteLayoutProps) {
  React.useEffect(() => {
    document.title = title ? `${title} | PokemonLL` : "PokemonLL";
  }, [title]);

  return (
    <div className="app-root">
      <div className="ambient" aria-hidden="true">
        <span className="ambient-bleed ambient-a" />
        <span className="ambient-bleed ambient-b" />
        <span className="ambient-bleed ambient-c" />
        <span className="ambient-ripple" />
      </div>
      <a className="skip-link" href="#main">
        本文へスキップ
      </a>
      <header className="site-header">
        <div className="site-header-bar">
          <div className="site-header-inner">
            <a className="brand" href="#/" aria-label="PokemonLL ホーム">
              <span className="brand-mark" aria-hidden="true">
                LL
              </span>
              <span className="brand-name">PokemonLL</span>
            </a>
            <nav className="site-nav" aria-label="研究メニュー">
              {navItems.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  className={item.route === route ? "is-active" : undefined}
                  aria-current={item.route === route ? "page" : undefined}
                >
                  {item.label}
                </a>
              ))}
            </nav>
          </div>
        </div>
      </header>
      <main id="main" className="site-main">
        {children}
      </main>
      <footer className="site-footer">
        <p>種族値は pogoapi.net、技データは PvP 公開データを元にしています。</p>
        <p>PokemonLL</p>
      </footer>
    </div>
  );
}
