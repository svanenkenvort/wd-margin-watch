import type { ReactNode } from "react";

const TABS = [
  { href: "/", label: "Overview", key: "overview" },
  { href: "/open", label: "Open jobs", key: "open" },
  { href: "/completed", label: "Completed", key: "completed" },
  { href: "/reports", label: "Yearly report", key: "reports" },
  { href: "/settings", label: "Settings", key: "settings" },
] as const;

export type TabKey = (typeof TABS)[number]["key"];

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className="logo">
      <rect x="2" y="2" width="28" height="28" rx="5" fill="none" stroke="currentColor" strokeWidth="2.6" />
      <rect x="5.2" y="17" width="21.6" height="9.8" fill="var(--teal)" opacity="0.9" />
      <line x1="5" y1="16.2" x2="27" y2="16.2" stroke="currentColor" strokeWidth="2.6" />
      <line x1="16" y1="5" x2="16" y2="16" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

export function Shell({
  active,
  year,
  years,
  children,
  actions,
}: {
  active: TabKey;
  year?: number;
  years?: number[];
  children: ReactNode;
  actions?: ReactNode;
}) {
  const withYear = (href: string) => (year && (active === "overview" || active === "completed" || active === "reports") ? `${href}?year=${year}` : href);
  return (
    <div className="app">
      <header className="topbar">
        <a href="/" className="brand" aria-label="Margin Watch home">
          <Logo />
          <span>Margin Watch</span>
        </a>
        <nav className="tabs" aria-label="Main">
          {TABS.map((t) => (
            <a key={t.key} href={t.key === "open" || t.key === "settings" ? t.href : withYear(t.href)} className="tab" aria-current={active === t.key ? "page" : undefined}>
              {t.label}
            </a>
          ))}
        </nav>
        <div className="topbar-right">
          {years && year ? (
            <div className="years" role="group" aria-label="Year">
              {years.map((y) => (
                <a key={y} href={`?year=${y}`} className="year" aria-current={y === year ? "true" : undefined}>
                  {y}
                </a>
              ))}
            </div>
          ) : null}
          {actions}
        </div>
      </header>
      <main className="page">{children}</main>
    </div>
  );
}

export function PageHead({ title, sub, children }: { title: string; sub?: string; children?: ReactNode }) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        {sub ? <p className="sub">{sub}</p> : null}
      </div>
      {children ? <div className="page-head-actions">{children}</div> : null}
    </div>
  );
}
