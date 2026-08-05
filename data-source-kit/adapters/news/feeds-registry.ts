/**
 * feeds-registry — curated, keyless (auth: none) RSS/Atom sources, organized
 * into "desks" (the columns of an intelligence-terminal layout).
 *
 * Stack-agnostic analogue of the origin project's `src/config/feeds.ts` (see
 * README → Provenance). Every entry is a public, no-key feed verified live at
 * build time (any that 404'd were dropped, never faked).
 *
 * Registering a feed here is also what makes its host fetchable: `seedAllowlist()`
 * feeds every host into the SSRF allowlist, so a URL is reachable iff a feed for
 * it is registered (single source of truth).
 */

import { allowHosts } from "../../core/ssrf-allowlist.js";

/** A desk = one column in the terminal. Order here is display order. */
export const WIRE_DESKS = [
  "intel",
  "world",
  "middle-east",
  "europe",
  "africa",
  "latin-america",
  "asia-pacific",
  "united-states",
  "markets",
  "corporate",
] as const;
export type WireDesk = (typeof WIRE_DESKS)[number];

export const WIRE_DESK_LABELS: Record<WireDesk, string> = {
  intel: "Intel Feed",
  world: "World News",
  "middle-east": "Middle East",
  europe: "Europe",
  africa: "Africa",
  "latin-america": "Latin America",
  "asia-pacific": "Asia-Pacific",
  "united-states": "United States",
  markets: "Markets & Macro",
  corporate: "Corporate Wire",
};

export interface Feed {
  id: string;
  name: string;
  desk: WireDesk;
  url: string;
  /** Publisher homepage (for attribution links). */
  homepage: string;
}

export const FEEDS: Feed[] = [
  // ── Intel Feed (defense / conflict / humanitarian) ───────────────────────
  { id: "military-times", name: "Military Times", desk: "intel", url: "https://www.militarytimes.com/arc/outboundfeeds/rss/?outputType=xml", homepage: "https://www.militarytimes.com" },
  { id: "defense-news", name: "Defense News", desk: "intel", url: "https://www.defensenews.com/arc/outboundfeeds/rss/?outputType=xml", homepage: "https://www.defensenews.com" },
  { id: "reliefweb", name: "ReliefWeb", desk: "intel", url: "https://reliefweb.int/updates/rss.xml", homepage: "https://reliefweb.int" },

  // ── World News (global wires) ────────────────────────────────────────────
  { id: "bbc-world", name: "BBC World", desk: "world", url: "https://feeds.bbci.co.uk/news/world/rss.xml", homepage: "https://www.bbc.com/news/world" },
  { id: "aljazeera", name: "Al Jazeera", desk: "world", url: "https://www.aljazeera.com/xml/rss/all.xml", homepage: "https://www.aljazeera.com" },
  { id: "guardian-world", name: "Guardian World", desk: "world", url: "https://www.theguardian.com/world/rss", homepage: "https://www.theguardian.com/world" },
  { id: "france24", name: "France 24", desk: "world", url: "https://www.france24.com/en/rss", homepage: "https://www.france24.com/en" },
  { id: "un-news", name: "UN News", desk: "world", url: "https://news.un.org/feed/subscribe/en/news/all/rss.xml", homepage: "https://news.un.org" },
  { id: "dw-world", name: "Deutsche Welle", desk: "world", url: "https://rss.dw.com/rdf/rss-en-world", homepage: "https://www.dw.com" },

  // ── Middle East ──────────────────────────────────────────────────────────
  { id: "bbc-mideast", name: "BBC Middle East", desk: "middle-east", url: "https://feeds.bbci.co.uk/news/world/middle_east/rss.xml", homepage: "https://www.bbc.com/news/world/middle_east" },
  { id: "guardian-mideast", name: "Guardian Middle East", desk: "middle-east", url: "https://www.theguardian.com/world/middleeast/rss", homepage: "https://www.theguardian.com/world/middleeast" },

  // ── Europe ───────────────────────────────────────────────────────────────
  { id: "bbc-europe", name: "BBC Europe", desk: "europe", url: "https://feeds.bbci.co.uk/news/world/europe/rss.xml", homepage: "https://www.bbc.com/news/world/europe" },
  { id: "guardian-europe", name: "Guardian Europe", desk: "europe", url: "https://www.theguardian.com/world/europe-news/rss", homepage: "https://www.theguardian.com/world/europe-news" },

  // ── Africa ───────────────────────────────────────────────────────────────
  { id: "bbc-africa", name: "BBC Africa", desk: "africa", url: "https://feeds.bbci.co.uk/news/world/africa/rss.xml", homepage: "https://www.bbc.com/news/world/africa" },
  { id: "africanews", name: "AfricaNews", desk: "africa", url: "https://www.africanews.com/feed/rss", homepage: "https://www.africanews.com" },
  { id: "guardian-africa", name: "Guardian Africa", desk: "africa", url: "https://www.theguardian.com/world/africa/rss", homepage: "https://www.theguardian.com/world/africa" },

  // ── Latin America ────────────────────────────────────────────────────────
  { id: "bbc-latam", name: "BBC Latin America", desk: "latin-america", url: "https://feeds.bbci.co.uk/news/world/latin_america/rss.xml", homepage: "https://www.bbc.com/news/world/latin_america" },
  { id: "guardian-americas", name: "Guardian Americas", desk: "latin-america", url: "https://www.theguardian.com/world/americas/rss", homepage: "https://www.theguardian.com/world/americas" },

  // ── Asia-Pacific ─────────────────────────────────────────────────────────
  { id: "bbc-asia", name: "BBC Asia", desk: "asia-pacific", url: "https://feeds.bbci.co.uk/news/world/asia/rss.xml", homepage: "https://www.bbc.com/news/world/asia" },
  { id: "guardian-asia", name: "Guardian Asia", desk: "asia-pacific", url: "https://www.theguardian.com/world/asia/rss", homepage: "https://www.theguardian.com/world/asia" },

  // ── United States ────────────────────────────────────────────────────────
  { id: "bbc-us", name: "BBC US & Canada", desk: "united-states", url: "https://feeds.bbci.co.uk/news/world/us_and_canada/rss.xml", homepage: "https://www.bbc.com/news/world/us_and_canada" },
  { id: "cbs-news", name: "CBS News", desk: "united-states", url: "https://www.cbsnews.com/latest/rss/main", homepage: "https://www.cbsnews.com" },

  // ── Markets & Macro (finance desk — Finbrio's core audience) ─────────────
  { id: "fed-press", name: "Federal Reserve", desk: "markets", url: "https://www.federalreserve.gov/feeds/press_all.xml", homepage: "https://www.federalreserve.gov" },
  { id: "ecb-press", name: "ECB", desk: "markets", url: "https://www.ecb.europa.eu/rss/press.html", homepage: "https://www.ecb.europa.eu" },
  { id: "sec-press", name: "SEC", desk: "markets", url: "https://www.sec.gov/news/pressreleases.rss", homepage: "https://www.sec.gov" },
  { id: "wsj-markets", name: "WSJ Markets", desk: "markets", url: "https://feeds.a.dj.com/rss/RSSMarketsMain.xml", homepage: "https://www.wsj.com" },
  { id: "marketwatch", name: "MarketWatch", desk: "markets", url: "https://feeds.content.dowjones.io/public/rss/mw_topstories", homepage: "https://www.marketwatch.com" },
  { id: "cnbc-markets", name: "CNBC Markets", desk: "markets", url: "https://www.cnbc.com/id/20910258/device/rss/rss.html", homepage: "https://www.cnbc.com" },
  { id: "yahoo-finance", name: "Yahoo Finance", desk: "markets", url: "https://finance.yahoo.com/news/rssindex", homepage: "https://finance.yahoo.com" },
  { id: "ft-home", name: "Financial Times", desk: "markets", url: "https://www.ft.com/rss/home", homepage: "https://www.ft.com" },

  // ── Corporate Wire (primary newswires — ticker-tagged company PRs) ────────
  // Verified live + keyless under the FinBrioWire UA. These carry the issuer's
  // exchange tag ("(Nasdaq: AMIX)") in the title, which extract-tickers turns
  // into a per-symbol catalyst. Business Wire / ACCESSWIRE block our UA (403),
  // so they're intentionally absent. The route filters this desk to items that
  // actually resolve a ticker, so PR Newswire's non-market noise is dropped.
  { id: "globenewswire", name: "GlobeNewswire", desk: "corporate", url: "https://www.globenewswire.com/RssFeed/orgclass/1/feedTitle/GlobeNewswire%20-%20News%20about%20Public%20Companies", homepage: "https://www.globenewswire.com" },
  { id: "prnewswire", name: "PR Newswire", desk: "corporate", url: "https://www.prnewswire.com/rss/news-releases-list.rss", homepage: "https://www.prnewswire.com" },
  { id: "prnewswire-earnings", name: "PR Newswire · Earnings", desk: "corporate", url: "https://www.prnewswire.com/rss/financial-services-latest-news/earnings-list.rss", homepage: "https://www.prnewswire.com" },
];

export function feedsForDesk(desk: WireDesk): Feed[] {
  return FEEDS.filter((f) => f.desk === desk);
}

export function feedById(id: string): Feed | undefined {
  return FEEDS.find((f) => f.id === id);
}

/** Seed the SSRF allowlist with every registered feed's host. Call once at boot. */
export function seedAllowlist(): void {
  allowHosts(FEEDS.map((f) => new URL(f.url).hostname));
}

// Seed on import so consumers that just `import { FEEDS }` still get a populated
// allowlist without a separate wiring step.
seedAllowlist();
