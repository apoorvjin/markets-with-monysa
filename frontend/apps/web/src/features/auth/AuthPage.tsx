import { useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  AuthError,
  resetPassword,
  signInWithEmail,
  signInWithGoogle,
  signUpWithEmail,
} from "../../lib/auth";
import { getTheme, toggleTheme, type Theme } from "../../lib/theme";

type Mode = "signin" | "signup" | "reset";

function messageFor(e: unknown): string {
  if (e instanceof AuthError) return e.message;
  return "Something went wrong. Please try again.";
}

const IOS_APP_URL = "https://apps.apple.com/app/finbrio/id6783981998";

export function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [theme, setTheme] = useState<Theme>(() => getTheme());

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      if (mode === "signup") {
        await signUpWithEmail(name, email, password);
        navigate({ to: "/verify-email" });
      } else if (mode === "signin") {
        await signInWithEmail(email, password);
        navigate({ to: "/markets" });
      } else {
        await resetPassword(email);
        setNotice("Password reset email sent. Check your inbox.");
        setMode("signin");
      }
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      await signInWithGoogle();
      navigate({ to: "/markets" });
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setBusy(false);
    }
  }

  const title =
    mode === "signup"
      ? "Create your account"
      : mode === "reset"
        ? "Reset password"
        : "Welcome back";
  const sub =
    mode === "reset"
      ? "Enter your email and we'll send a reset link."
      : "Sign in to unlock your Pro features across web and mobile.";

  return (
    <div className="login">
      {/* Ambient cinematic backdrop */}
      <div className="login-aurora" aria-hidden>
        <span className="login-blob login-blob--a" />
        <span className="login-blob login-blob--b" />
        <span className="login-blob login-blob--c" />
      </div>
      <div className="login-grid" aria-hidden />
      <div className="login-vignette" aria-hidden />

      <button
        type="button"
        className="login-theme-toggle"
        onClick={() => setTheme(toggleTheme())}
        aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
        title={theme === "dark" ? "Light theme" : "Dark theme"}
      >
        {theme === "dark" ? <SunIcon /> : <MoonIcon />}
      </button>

      {/* ── Left: brand stage ─────────────────────────────────────────── */}
      <section className="login-stage">
        <div className="login-brand">
          <img
            className="login-brand-icon"
            src="/apple-touch-icon.png"
            alt="FinBrio"
            width={40}
            height={40}
          />
          <span className="login-brand-word">
            Fin<span className="login-brand-accent">Brio</span>
          </span>
        </div>

        <div className="login-hero">
          <h1 className="login-headline">
            Every market.
            <br />
            <span className="login-headline-accent">One terminal.</span>
          </h1>
          <p className="login-tagline">
            Live indices, commodities, forex and crypto — with AI trading
            signals and macro intelligence built in.
          </p>

          <TerminalWidget />
        </div>
      </section>

      {/* ── Right: auth card ──────────────────────────────────────────── */}
      <section className="login-panel">
        <div className="login-card">
          <div className="login-card-sheen" aria-hidden />

          <div className="login-card-inner" key={mode}>
            <div className="login-mobilebrand">
              <span className="login-brand-word">
                Fin<span className="login-brand-accent">Brio</span>
              </span>
            </div>

            <h2 className="login-title">{title}</h2>
            <p className="login-sub">{sub}</p>

            {error && (
              <div className="login-alert login-alert--error" role="alert">
                {error}
              </div>
            )}
            {notice && (
              <div className="login-alert login-alert--notice" role="status">
                {notice}
              </div>
            )}

            <form className="login-form" onSubmit={submit}>
              {mode === "signup" && (
                <label className="login-field">
                  <span>Name</span>
                  <input
                    type="text"
                    autoComplete="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Jane Trader"
                  />
                </label>
              )}
              <label className="login-field">
                <span>Email</span>
                <input
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                />
              </label>
              {mode !== "reset" && (
                <label className="login-field">
                  <span className="login-field-row">
                    Password
                    {mode === "signin" && (
                      <button
                        type="button"
                        className="login-inline-link"
                        onClick={() => setMode("reset")}
                      >
                        Forgot?
                      </button>
                    )}
                  </span>
                  <input
                    type="password"
                    autoComplete={mode === "signup" ? "new-password" : "current-password"}
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                  />
                </label>
              )}

              <button type="submit" className="login-submit" disabled={busy}>
                <span className="login-submit-label">
                  {busy
                    ? "Please wait…"
                    : mode === "signup"
                      ? "Create account"
                      : mode === "reset"
                        ? "Send reset link"
                        : "Sign in"}
                </span>
                <span className="login-submit-sheen" aria-hidden />
              </button>
            </form>

            {mode !== "reset" && (
              <>
                <div className="login-divider">
                  <span>or continue with</span>
                </div>
                <button
                  type="button"
                  className="login-google"
                  onClick={google}
                  disabled={busy}
                >
                  <GoogleIcon />
                  Google
                </button>
              </>
            )}

            <div className="login-switch">
              {mode === "signin" && (
                <>
                  New to FinBrio?{" "}
                  <button type="button" onClick={() => setMode("signup")}>
                    Create an account
                  </button>
                </>
              )}
              {mode === "signup" && (
                <>
                  Already have an account?{" "}
                  <button type="button" onClick={() => setMode("signin")}>
                    Sign in
                  </button>
                </>
              )}
              {mode === "reset" && (
                <button type="button" onClick={() => setMode("signin")}>
                  ← Back to sign in
                </button>
              )}
            </div>
          </div>
        </div>

        <p className="login-legal">
          <LockIcon />
          Bank-grade encryption. Your session stays private.
        </p>
      </section>

      <AppPromo />
    </div>
  );
}

/* ── Live-terminal widget (synthetic, purely decorative) ──────────────── */

function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TICKERS = [
  { s: "S&P 500", v: "+0.62%", up: true },
  { s: "NASDAQ", v: "+0.81%", up: true },
  { s: "GOLD", v: "+0.44%", up: true },
  { s: "WTI", v: "-0.90%", up: false },
  { s: "BTC", v: "+1.72%", up: true },
  { s: "EUR/USD", v: "+0.12%", up: true },
  { s: "VIX", v: "-2.10%", up: false },
  { s: "US10Y", v: "4.21%", up: true },
];

function TerminalWidget() {
  const W = 340;
  const H = 132;
  const candles = useMemo(() => {
    const rand = mulberry32(7);
    let price = 100;
    const out: { o: number; c: number; h: number; l: number }[] = [];
    for (let i = 0; i < 26; i++) {
      const o = price;
      const c = Math.max(70, o + (rand() - 0.44) * 7);
      const h = Math.max(o, c) + rand() * 3.2;
      const l = Math.min(o, c) - rand() * 3.2;
      out.push({ o, c, h, l });
      price = c;
    }
    return out;
  }, []);

  const lo = Math.min(...candles.map((k) => k.l));
  const hi = Math.max(...candles.map((k) => k.h));
  const pad = 12;
  const y = (v: number) => pad + (H - pad * 2) * (1 - (v - lo) / (hi - lo));
  const step = W / candles.length;
  const bw = step * 0.52;
  const linePts = candles
    .map((k, i) => `${i * step + step / 2},${y(k.c)}`)
    .join(" ");

  return (
    <div className="term">
      <div className="term-head">
        <span className="term-badge">
          <span className="term-live" /> LIVE
        </span>
        <span className="term-name">FINBRIO · GLOBAL MACRO</span>
        <span className="term-quote">
          5,231.40 <span className="term-up">▲ 0.62%</span>
        </span>
      </div>

      <svg
        className="term-chart"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        aria-hidden
      >
        <defs>
          <linearGradient id="term-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#00D4AA" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#00D4AA" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="term-sweep" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#00D4AA" stopOpacity="0" />
            <stop offset="50%" stopColor="#00D4AA" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#00D4AA" stopOpacity="0" />
          </linearGradient>
        </defs>

        <polygon
          className="term-area"
          points={`0,${H} ${linePts} ${W},${H}`}
          fill="url(#term-fill)"
        />

        {candles.map((k, i) => {
          const cx = i * step + step / 2;
          const up = k.c >= k.o;
          const color = up ? "#00D4AA" : "#FF4D6A";
          const top = y(Math.max(k.o, k.c));
          const bottom = y(Math.min(k.o, k.c));
          return (
            <g key={i} className="term-candle" style={{ animationDelay: `${i * 55}ms` }}>
              <line x1={cx} x2={cx} y1={y(k.h)} y2={y(k.l)} stroke={color} strokeWidth="1" opacity="0.55" />
              <rect
                x={cx - bw / 2}
                y={top}
                width={bw}
                height={Math.max(1.5, bottom - top)}
                rx="1"
                fill={color}
                opacity="0.9"
              />
            </g>
          );
        })}

        <polyline className="term-line" points={linePts} fill="none" stroke="url(#term-sweep)" strokeWidth="2" />
      </svg>

      <div className="term-ticker">
        <div className="term-ticker-track">
          {[...TICKERS, ...TICKERS].map((t, i) => (
            <span key={i} className="term-tick">
              {t.s} <em className={t.up ? "term-up" : "term-down"}>{t.v}</em>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function AppPromo() {
  return (
    <div className="login-app">
      <div className="login-app-copy">
        <strong>Take the terminal anywhere</strong>
        <span>FinBrio is on iPhone. Android is coming soon.</span>
      </div>
      <div className="login-app-badges">
        <a
          className="app-badge"
          href={IOS_APP_URL}
          target="_blank"
          rel="noreferrer"
        >
          <AppleGlyph />
          <span className="app-badge-text">
            <small>Download on the</small>
            App Store
          </span>
        </a>
        <span className="app-badge app-badge--soon" aria-disabled="true">
          <PlayGlyph />
          <span className="app-badge-text">
            <small>Coming soon to</small>
            Google Play
          </span>
        </span>
      </div>
    </div>
  );
}

/* ── Icons (SVG — no emoji per design checklist) ──────────────────────── */

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.47.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z" />
    </svg>
  );
}

function AppleGlyph() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M16.37 1.43c0 1.13-.41 2.19-1.11 2.98-.76.86-2 1.52-3.02 1.44-.13-1.08.41-2.23 1.09-2.97.76-.84 2.09-1.47 3.04-1.45zM20.5 17.2c-.55 1.27-.81 1.84-1.53 2.96-.99 1.57-2.39 3.53-4.12 3.54-1.53.02-1.93-1-4.02-.99-2.09 0-2.53 1.01-4.06.99-1.74-.02-3.05-1.79-4.05-3.36C-.02 18.02-.35 13.6.9 11.27c.9-1.67 2.5-2.72 3.98-2.72 1.5 0 2.45 1.03 4.03 1.03 1.53 0 2.46-1.03 4.16-1.03 1.3 0 2.7.71 3.69 1.94-3.24 1.77-2.72 6.39.74 7.71z" />
    </svg>
  );
}

function PlayGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M3.3 2.4c-.2.2-.3.5-.3.9v17.4c0 .4.1.7.3.9l.1.1L13 12v-.2L3.4 2.3l-.1.1zM16.6 15.3 13.5 12l3.1-3.3 3.7 2.1c1 .6 1 1.6 0 2.2l-3.7 2.3zM13.5 12l3.1 3.3-11.9 6.8c-.3.2-.7.2-1 0L13.5 12zM4.7 1.9c.3-.2.7-.2 1 0l11.9 6.8L13.5 12 4.7 1.9z" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="5" y="11" width="14" height="9" rx="2" stroke="currentColor" strokeWidth="1.7" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="4.2" stroke="currentColor" strokeWidth="1.7" />
      <path
        d="M12 2.5v2.2M12 19.3v2.2M4.6 4.6l1.6 1.6M17.8 17.8l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.6 19.4l1.6-1.6M17.8 6.2l1.6-1.6"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M20 14.2A8 8 0 1 1 9.8 4 6.3 6.3 0 0 0 20 14.2z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  );
}
