import { Link, Outlet } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { getTheme, toggleTheme, type Theme } from "../lib/theme";
import { CommandPalette } from "./CommandPalette";

const NAV = [
  {
    to: "/markets",
    label: "Markets",
    icon: (
      <svg className="nav-link-icon" viewBox="0 0 16 16" fill="none" aria-hidden>
        <rect x="1" y="9" width="2.5" height="6" rx="1" fill="currentColor" />
        <rect x="4.75" y="5" width="2.5" height="10" rx="1" fill="currentColor" />
        <rect x="8.5" y="7" width="2.5" height="8" rx="1" fill="currentColor" />
        <rect x="12.25" y="2" width="2.5" height="13" rx="1" fill="currentColor" />
      </svg>
    ),
  },
  {
    to: "/trading",
    label: "Trading",
    icon: (
      <svg className="nav-link-icon" viewBox="0 0 16 16" fill="none" aria-hidden>
        <path
          d="M2 12L5.5 7.5L9 10.5L14 3"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="14" cy="3" r="1.5" fill="currentColor" />
        <circle cx="2" cy="12" r="1.5" fill="currentColor" />
      </svg>
    ),
  },
  {
    to: "/investing",
    label: "Investing",
    icon: (
      <svg className="nav-link-icon" viewBox="0 0 16 16" fill="none" aria-hidden>
        <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" />
        <path d="M5.5 8.5L7.5 10.5L11 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    to: "/macro",
    label: "Macro",
    icon: (
      <svg className="nav-link-icon" viewBox="0 0 16 16" fill="none" aria-hidden>
        <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" />
        <path
          d="M2 8h12M8 2C6.3 4 5.5 6 5.5 8S6.3 12 8 14M8 2c1.7 2 2.5 4 2.5 6S9.7 12 8 14"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
] as const;

export function AppShell() {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [theme, setThemeState] = useState<Theme>(() => getTheme());

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div className="sidebar-logo-dot" />
          MONY<span>SA</span>
        </div>
        <nav>
          {NAV.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              className="nav-link"
              activeProps={{ "data-status": "active" } as never}
            >
              {n.icon}
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="sidebar-footer">
          <button
            type="button"
            className="kbd-hint"
            onClick={() => setPaletteOpen(true)}
          >
            <span>Search symbols</span>
            <kbd>⌘K</kbd>
          </button>
          <button
            type="button"
            className="theme-toggle"
            onClick={() => setThemeState(toggleTheme())}
          >
            {theme === "dark" ? "☀ Light" : "☾ Dark"}
          </button>
          <div className="sidebar-avatar">
            <div className="sidebar-avatar-dot">M</div>
            <span className="sidebar-avatar-label">Portfolio</span>
          </div>
        </div>
      </aside>
      <main className="main">
        <Outlet />
      </main>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  );
}
