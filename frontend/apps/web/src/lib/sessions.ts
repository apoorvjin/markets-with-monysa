/** Global exchange session table + open/closed logic.
 *
 * Extracted from MarketStatus.tsx so the nav pill and the Markets session
 * strip read from ONE table — two copies would drift the moment an exchange
 * changes hours. Mirrors the marketing site's `.mkt` widget
 * (frontend/apps/site/src/components/Nav.astro). */

export interface MarketDef {
  city: string;
  /** Short code for the compact strip. */
  code: string;
  tz: string;
  /** Regular cash session(s) as [startMin, endMin) from midnight, in the
      exchange's own timezone. Multiple entries handle lunch breaks. */
  sessions: [number, number][];
}

export const MARKETS: MarketDef[] = [
  { city: "New York", code: "NY", tz: "America/New_York", sessions: [[570, 960]] }, // 09:30–16:00
  { city: "London", code: "LON", tz: "Europe/London", sessions: [[480, 990]] }, // 08:00–16:30
  { city: "Frankfurt", code: "FRA", tz: "Europe/Berlin", sessions: [[540, 1050]] }, // 09:00–17:30
  { city: "Mumbai", code: "BOM", tz: "Asia/Kolkata", sessions: [[555, 930]] }, // 09:15–15:30
  {
    city: "Hong Kong",
    code: "HK",
    tz: "Asia/Hong_Kong",
    sessions: [
      [570, 720],
      [780, 960],
    ],
  }, // 09:30–12:00, 13:00–16:00
  {
    city: "Shanghai",
    code: "SHA",
    tz: "Asia/Shanghai",
    sessions: [
      [570, 690],
      [780, 900],
    ],
  }, // 09:30–11:30, 13:00–15:00
  {
    city: "Tokyo",
    code: "TYO",
    tz: "Asia/Tokyo",
    sessions: [
      [540, 690],
      [750, 900],
    ],
  }, // 09:00–11:30, 12:30–15:00
  { city: "Sydney", code: "SYD", tz: "Australia/Sydney", sessions: [[600, 960]] }, // 10:00–16:00
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

export function isOpen(mk: MarketDef): { open: boolean; time: string } {
  const z = zoned(mk.tz);
  if (z.weekday === "Sat" || z.weekday === "Sun") return { open: false, time: z.label };
  for (const [start, end] of mk.sessions) {
    if (z.mins >= start && z.mins < end) return { open: true, time: z.label };
  }
  return { open: false, time: z.label };
}

/** Every exchange with its current open state, for either presentation. */
export function sessionStatuses() {
  return MARKETS.map((mk) => ({ ...mk, ...isOpen(mk) }));
}
