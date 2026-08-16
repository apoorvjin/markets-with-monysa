import { Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { signOut } from "../lib/auth";
import { useSession } from "../lib/session";
import { getTheme, toggleTheme, type Theme } from "../lib/theme";
import { CommandPalette } from "./CommandPalette";
import { MarketStatus } from "./MarketStatus";
import { useWireAlertRuntime, WireAlertBanner, WireAlertBell } from "./WireAlerts";

const AUTH_ROUTES = new Set(["/auth", "/verify-email"]);
const SIDEBAR_COLLAPSED_KEY = "finbrio-sidebar-collapsed";

function getSidebarCollapsed(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

const NAV = [
  {
    to: "/terminal",
    label: "Terminal",
    icon: (
      <svg className="nav-link-icon" viewBox="0 0 16 16" fill="none" aria-hidden>
        <rect x="1.5" y="1.5" width="5.5" height="5.5" rx="1" stroke="currentColor" strokeWidth="1.4" />
        <rect x="9" y="1.5" width="5.5" height="5.5" rx="1" stroke="currentColor" strokeWidth="1.4" />
        <rect x="1.5" y="9" width="5.5" height="5.5" rx="1" stroke="currentColor" strokeWidth="1.4" />
        <rect x="9" y="9" width="5.5" height="5.5" rx="1" stroke="currentColor" strokeWidth="1.4" />
      </svg>
    ),
  },
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
  {
    to: "/datacenters",
    label: "Data Centers",
    comingSoon: true,
    icon: (
      <svg className="nav-link-icon" viewBox="0 0 16 16" fill="none" aria-hidden>
        <rect x="2" y="2" width="12" height="4.5" rx="1" stroke="currentColor" strokeWidth="1.4" />
        <rect x="2" y="9.5" width="12" height="4.5" rx="1" stroke="currentColor" strokeWidth="1.4" />
        <circle cx="4.3" cy="4.25" r="0.9" fill="currentColor" />
        <circle cx="4.3" cy="11.75" r="0.9" fill="currentColor" />
      </svg>
    ),
  },
  {
    to: "/tankers",
    label: "Tankers",
    comingSoon: true,
    icon: (
      // Simple ship/tanker silhouette on water.
      <svg className="nav-link-icon" viewBox="0 0 16 16" fill="none" aria-hidden>
        <path
          d="M2 9.5h12l-1.4 3H3.4L2 9.5Z"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinejoin="round"
        />
        <path d="M4.5 9.5V6h5l2 3.5M7 6V4h1.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M1.5 14.5c1 0 1-.8 2-.8s1 .8 2 .8 1-.8 2-.8 1 .8 2 .8 1-.8 2-.8 1 .8 2 .8" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    to: "/splc",
    label: "SPLC Analysis",
    comingSoon: true,
    icon: (
      // Two nodes feeding a centre node — supplier -> company -> customer.
      <svg className="nav-link-icon" viewBox="0 0 16 16" fill="none" aria-hidden>
        <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.4" />
        <circle cx="2.5" cy="3.5" r="1.4" stroke="currentColor" strokeWidth="1.3" />
        <circle cx="2.5" cy="12.5" r="1.4" stroke="currentColor" strokeWidth="1.3" />
        <circle cx="13.5" cy="8" r="1.4" stroke="currentColor" strokeWidth="1.3" />
        <path
          d="M3.9 4.4 6.3 6.6M3.9 11.6 6.3 9.4M10 8h2.1"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
] as const;

export function AppShell() {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [theme, setThemeState] = useState<Theme>(() => getTheme());
  const [collapsed, setCollapsed] = useState<boolean>(() => getSidebarCollapsed());
  const mainRef = useRef<HTMLElement>(null);
  const progressBarRef = useRef<HTMLSpanElement>(null);

  const { user, isPro, loading } = useSession();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const onAuthRoute = AUTH_ROUTES.has(pathname);
  const emailVerified = user?.emailVerified ?? false;
  const authed = !!user && emailVerified;

  // Auth gate: signed-out → /auth; signed-in-but-unverified → /verify-email;
  // fully authed users bounced off the auth screens back into the app.
  useEffect(() => {
    if (loading) return;
    if (!user && !onAuthRoute) {
      navigate({ to: "/auth" });
    } else if (user && !emailVerified && pathname !== "/verify-email") {
      navigate({ to: "/verify-email" });
    } else if (authed && onAuthRoute) {
      navigate({ to: "/markets" });
    }
  }, [loading, user, emailVerified, authed, onAuthRoute, pathname, navigate]);

  // Poll the breaking feed app-wide and drive the in-app alert banner.
  useWireAlertRuntime();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      } else if ((e.metaKey || e.ctrlKey) && e.key === "\\") {
        e.preventDefault();
        setCollapsed((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? "1" : "0");
    } catch {
      // private mode — session-only
    }
  }, [collapsed]);

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

  // While Firebase resolves the initial auth state, show a minimal splash so we
  // never flash protected content or the login screen.
  if (loading) {
    return <AuthSplash />;
  }

  // Unauthenticated (or unverified): render only the auth routes with a bare,
  // chrome-less layout. Any other path shows the splash until the redirect fires.
  if (!authed) {
    return (
      <div className="auth-shell">{onAuthRoute ? <Outlet /> : <AuthSplash />}</div>
    );
  }

  // Authed but still sitting on an auth route → redirecting into the app.
  if (onAuthRoute) {
    return <AuthSplash />;
  }

  return (
    <div className="shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <div className="scroll-progress" aria-hidden="true">
        <span ref={progressBarRef} />
      </div>
      <aside className="sidebar" data-collapsed={collapsed}>
        <button
          type="button"
          className="sidebar-collapse-btn"
          onClick={() => setCollapsed((v) => !v)}
          title={collapsed ? "Expand sidebar (⌘\\)" : "Collapse sidebar (⌘\\)"}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <svg viewBox="0 0 16 16" width="10" height="10" fill="none" aria-hidden>
            <path
              d={collapsed ? "M5 3l6 5-6 5" : "M11 3L5 8l6 5"}
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <div className="sidebar-logo">
          <div className="sidebar-logo-dot" />
          <span className="sidebar-logo-word">
            Fin<span className="sidebar-logo-accent">Brio</span>
          </span>
        </div>
        <MarketStatus />
        <nav>
          {NAV.map((n) =>
            "comingSoon" in n && n.comingSoon ? (
              <div
                key={n.to}
                className="nav-link"
                data-disabled="true"
                aria-disabled="true"
                tabIndex={-1}
                title={`${n.label} — coming soon`}
              >
                {n.icon}
                <span className="nav-link-label">{n.label}</span>
                <span className="nav-link-soon">Soon</span>
              </div>
            ) : (
              <Link
                key={n.to}
                to={n.to}
                className="nav-link"
                activeProps={{ "data-status": "active" } as never}
                title={n.label}
                aria-label={n.label}
              >
                {n.icon}
                <span className="nav-link-label">{n.label}</span>
              </Link>
            ),
          )}
        </nav>
        <div className="sidebar-footer">
          <WireAlertBell />
          <button
            type="button"
            className="kbd-hint"
            onClick={() => setPaletteOpen(true)}
            title="Search symbols (⌘K)"
            aria-label="Search symbols"
          >
            <svg className="kbd-hint-ico" viewBox="0 0 16 16" width="14" height="14" fill="none" aria-hidden>
              <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.4" />
              <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
            <span>Search symbols</span>
            <kbd>⌘K</kbd>
          </button>
          <button
            type="button"
            className="theme-toggle"
            onClick={() => setThemeState(toggleTheme())}
            title={theme === "dark" ? "Switch to light" : "Switch to dark"}
            aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
          >
            <span className="theme-toggle-ico">{theme === "dark" ? "☀" : "☾"}</span>
            <span className="theme-toggle-label">{theme === "dark" ? "Light" : "Dark"}</span>
          </button>
          <AccountChip
            email={user?.email ?? null}
            displayName={user?.displayName ?? null}
            isPro={isPro}
          />
        </div>
      </aside>
      <main
        className="main"
        id="main-content"
        ref={mainRef}
        data-route={pathname.startsWith("/terminal") ? "terminal" : undefined}
      >
        <WireAlertBanner />
        <Outlet />
      </main>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  );
}

function AuthSplash() {
  return (
    <div className="auth-splash">
      <div className="auth-splash-mark">
        Fin<span>Brio</span>
      </div>
    </div>
  );
}

function AccountChip(props: {
  email: string | null;
  displayName: string | null;
  isPro: boolean;
}) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const label = props.displayName?.trim() || props.email || "Account";
  const initial = (label[0] ?? "?").toUpperCase();

  async function handleSignOut() {
    setOpen(false);
    await signOut();
    navigate({ to: "/auth" });
  }

  return (
    <div className="account-chip">
      {open && (
        <div className="account-menu" role="menu">
          <div className="account-menu-head">
            <div className="account-menu-name">{label}</div>
            {props.email && props.displayName && (
              <div className="account-menu-email">{props.email}</div>
            )}
            <span
              className={`account-plan-badge ${props.isPro ? "is-pro" : "is-free"}`}
            >
              {props.isPro ? "Pro" : "Free"}
            </span>
          </div>
          <button type="button" className="account-menu-item" onClick={handleSignOut}>
            Sign out
          </button>
        </div>
      )}
      <button
        type="button"
        className="account-chip-btn"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="account-avatar-dot">{initial}</span>
        <span className="account-chip-label">{label}</span>
        <span
          className={`account-plan-badge ${props.isPro ? "is-pro" : "is-free"}`}
        >
          {props.isPro ? "Pro" : "Free"}
        </span>
      </button>
    </div>
  );
}
