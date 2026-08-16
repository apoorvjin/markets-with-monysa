import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { useFocusedSymbol } from "../../lib/focus";
import { useQuoteStream } from "../../lib/quoteStream";
import { TerminalTicker } from "../../components/TerminalTicker";
import { TerminalWorkspace } from "./TerminalWorkspace";

/** Ticks once a second — powers the status-bar clock. */
function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

/**
 * Phones only. The shortest physical screen side gates it: phones are < 600px
 * on their short edge; iPad's short edge is >= 744 and laptops/desktops far
 * larger, so both are allowed. Falls back to the live viewport when
 * `window.screen` is unavailable.
 */
function isPhone(): boolean {
  if (typeof window === "undefined") return false;
  const w = window.screen?.width || window.innerWidth || 0;
  const h = window.screen?.height || window.innerHeight || 0;
  const shortest = Math.min(w, h) || window.innerWidth;
  return shortest > 0 && shortest < 600;
}

function usePhoneGate(): boolean {
  const [phone, setPhone] = useState(isPhone);
  useEffect(() => {
    const on = () => setPhone(isPhone());
    window.addEventListener("resize", on);
    window.addEventListener("orientationchange", on);
    return () => {
      window.removeEventListener("resize", on);
      window.removeEventListener("orientationchange", on);
    };
  }, []);
  return phone;
}

function TerminalBlocked() {
  return (
    <div className="fbt-blocked">
      <div className="fbt-blocked-card">
        <div className="fbt-blocked-icon">🖥️</div>
        <h2>Terminal needs a bigger screen</h2>
        <p>
          The FinBrio Terminal is built for desktop, laptop, and iPad — it packs live
          charts, heatmaps and multi-panel data that don't fit a phone.
        </p>
        <p className="fbt-blocked-sub">
          On mobile, use Markets, Trading, Investing, Macro and Wire — they're all fully
          phone-ready.
        </p>
      </div>
    </div>
  );
}

/**
 * The full-bleed /terminal workspace. Does NOT use the `.page` wrapper, so it
 * escapes the 1440px cap; AppShell drops the `.main` inset via
 * `data-route="terminal"`. Ticker on top, tiling workspace in the middle,
 * sticky status bar at the bottom.
 */
export function TerminalPage() {
  const phone = usePhoneGate();
  if (phone) return <TerminalBlocked />;
  return <TerminalInner />;
}

function TerminalInner() {
  const now = useClock();
  const utc = now.toISOString().slice(11, 19);
  const focus = useFocusedSymbol();
  const streaming = useQuoteStream();

  // Shared with the tape/widgets — one poll feeds all of them (TanStack dedups).
  const { data } = useQuery({
    queryKey: ["quotes"],
    queryFn: () => api.getQuotes(),
    refetchInterval: 30_000,
  });
  const feeds = data?.quotes.length ?? 0;

  return (
    <div className="fbt">
      <TerminalTicker />
      <TerminalWorkspace />
      <footer className="fbt-status">
        <span className="fbt-live">
          <span className="fbt-live-dot" />
          {streaming ? "STREAM" : "POLL"}
        </span>
        <span>{utc} UTC</span>
        {feeds > 0 && (
          <span>
            feeds <span className="up">{feeds}</span> live
          </span>
        )}
        {focus && (
          <span>
            focus <span className="up">{focus.symbol}</span>
          </span>
        )}
        <span className="push">FinBrio Terminal</span>
      </footer>
    </div>
  );
}
