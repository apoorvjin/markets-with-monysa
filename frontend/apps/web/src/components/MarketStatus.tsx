import { useEffect, useReducer, useRef, useState } from "react";

interface MarketDef {
  city: string;
  tz: string;
  /** Regular cash session(s) as [startMin, endMin) from midnight, in the
      exchange's own timezone. Multiple entries handle lunch breaks. */
  sessions: [number, number][];
}

const MARKETS: MarketDef[] = [
  { city: "New York", tz: "America/New_York", sessions: [[570, 960]] }, // 09:30–16:00
  { city: "London", tz: "Europe/London", sessions: [[480, 990]] }, // 08:00–16:30
  { city: "Frankfurt", tz: "Europe/Berlin", sessions: [[540, 1050]] }, // 09:00–17:30
  { city: "Mumbai", tz: "Asia/Kolkata", sessions: [[555, 930]] }, // 09:15–15:30
  {
    city: "Hong Kong",
    tz: "Asia/Hong_Kong",
    sessions: [
      [570, 720],
      [780, 960],
    ],
  }, // 09:30–12:00, 13:00–16:00
  {
    city: "Shanghai",
    tz: "Asia/Shanghai",
    sessions: [
      [570, 690],
      [780, 900],
    ],
  }, // 09:30–11:30, 13:00–15:00
  {
    city: "Tokyo",
    tz: "Asia/Tokyo",
    sessions: [
      [540, 690],
      [750, 900],
    ],
  }, // 09:00–11:30, 12:30–15:00
  { city: "Sydney", tz: "Australia/Sydney", sessions: [[600, 960]] }, // 10:00–16:00
];

function zoned(tz: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(new Date());
  const o: Record<string, string> = {};
  parts.forEach((p) => {
    o[p.type] = p.value;
  });
  const h = parseInt(o.hour ?? "0", 10) % 24;
  const m = parseInt(o.minute ?? "0", 10);
  return {
    weekday: o.weekday,
    mins: h * 60 + m,
    label: `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`,
  };
}

function isOpen(mk: MarketDef): { open: boolean; time: string } {
  const z = zoned(mk.tz);
  if (z.weekday === "Sat" || z.weekday === "Sun") return { open: false, time: z.label };
  for (const [start, end] of mk.sessions) {
    if (z.mins >= start && z.mins < end) return { open: true, time: z.label };
  }
  return { open: false, time: z.label };
}

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

  const statuses = MARKETS.map((mk) => ({ ...mk, ...isOpen(mk) }));
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
