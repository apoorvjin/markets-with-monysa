/**
 * extract-tickers — pull exchange-tagged stock symbols out of a headline/summary.
 *
 * Corporate press releases (GlobeNewswire, PR Newswire, …) name the issuer with
 * an inline exchange tag: "Autonomix Medical (NASDAQ: AMIX) …". That parenthetical
 * is what turns a generic PR into a per-symbol trading catalyst. Deterministic,
 * keyless, no LLM — same spirit as classify.ts. Tune the exchange list freely.
 */

// (EXCHANGE: TICKER) — case-insensitive exchange name, optional space around the
// colon, 1–5 uppercase letters with an optional single-letter class suffix (BRK.A).
const TICKER_RE =
  /\((?:NASDAQ|NYSE(?:\s+American|\s+Arca)?|AMEX|OTCQB|OTCQX|OTCMKTS|OTC|CBOE)\s*:\s*([A-Z]{1,5}(?:\.[A-Z])?)\)/gi;

/** Deduped, upper-cased tickers mentioned with an exchange tag. Empty if none. */
export function extractTickers(title: string, summary?: string): string[] {
  const text = `${title} ${summary ?? ""}`;
  const seen = new Set<string>();
  for (const m of text.matchAll(TICKER_RE)) {
    seen.add(m[1].toUpperCase());
  }
  return [...seen];
}
