import { Link, Outlet } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { getTheme, toggleTheme, type Theme } from "../lib/theme";
import { CommandPalette } from "./CommandPalette";
import { MarketStatus } from "./MarketStatus";
import { useWireAlertRuntime, WireAlertBanner, WireAlertBell } from "./WireAlerts";

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
  {
    to: "/wire",
    label: "Wire",
    icon: (
      <svg className="nav-link-icon" viewBox="0 0 16 16" fill="none" aria-hidden>
        <circle cx="3.5" cy="12.5" r="1.5" fill="currentColor" />
        <path
          d="M2 8.5A5.5 5.5 0 0 1 7.5 14M2 4.5A9.5 9.5 0 0 1 11.5 14"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
] as const;

export function AppShell() {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [theme, setThemeState] = useState<Theme>(() => getTheme());
  const mainRef = useRef<HTMLElement>(null);
  const progressBarRef = useRef<HTMLSpanElement>(null);

  // Poll the breaking feed app-wide and drive the in-app alert banner.
  useWireAlertRuntime();

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

  useEffect(() => {
    const main = mainRef.current;
    const bar = progressBarRef.current;
    if (!main || !bar) return;
    let ticking = false;
    const update = () => {
      const max = main.scrollHeight - main.clientHeight;
      bar.style.width = max > 0 ? `${(main.scrollTop / max) * 100}%` : "0%";
      ticking = false;
    };
    const onScroll = () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
    };
    main.addEventListener("scroll", onScroll, { passive: true });
    update();
    return () => main.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <div className="scroll-progress" aria-hidden="true">
        <span ref={progressBarRef} />
      </div>
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div className="sidebar-logo-dot" />
          <span className="sidebar-logo-word">
            Fin<span className="sidebar-logo-accent">Brio</span>
          </span>
        </div>
        <MarketStatus />
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
          <WireAlertBell />
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
      <main className="main" id="main-content" ref={mainRef}>
        <WireAlertBanner />
        <Outlet />
      </main>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  );
}
