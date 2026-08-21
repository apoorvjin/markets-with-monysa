import { useEffect, useReducer, useRef, useState } from "react";
import { MARKETS, sessionStatuses } from "../lib/sessions";

/** Global exchange-session status pill — mirrors the marketing site's .mkt
    widget (frontend/apps/site/src/components/Nav.astro), same session table
    and open/closed logic, ported to React with a 30s re-render tick. */
export function MarketStatus() {
  const [, retick] = useReducer((n: number) => n + 1, 0);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const id = setInterval(retick, 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, []);

  const statuses = sessionStatuses();
  const openCount = statuses.filter((s) => s.open).length;
  const label = openCount > 0 ? `${openCount} of ${MARKETS.length} open` : "All markets closed";

  return (
    <div className="mkt" data-open={open ? "true" : "false"} ref={wrapRef}>
      <button
        type="button"
        className="mkt__pill"
        aria-expanded={open}
        aria-controls="mkt-panel"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="mkt__dot" data-open={openCount > 0 ? "true" : "false"} />
        <span>{label}</span>
        <svg
          className="mkt__chev"
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      <div className="mkt__panel" id="mkt-panel" role="region" aria-label="Global exchange sessions">
        <div className="mkt__rows">
          {statuses.map((s) => (
            <div className="mkt__row" data-open={s.open ? "true" : "false"} key={s.city}>
              <span className="mkt__rdot" />
              <span className="mkt__city">{s.city}</span>
              <span className="mkt__time">{s.time}</span>
              <span className="mkt__state">{s.open ? "Open" : "Closed"}</span>
            </div>
          ))}
        </div>
        <p className="mkt__foot">Regular trading hours · local exchange time. Holidays not shown.</p>
      </div>
    </div>
  );
}
