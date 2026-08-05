# SOURCES_SPEC — per-source reference

Authoritative spec table for every source the kit adapts. Each source collapses to
one `SourceAdapter` (see `core/adapter.ts`): **upstream endpoint + auth/key +
request params + rate-limit + response→normalized mapping**. Everything else
(transport, RPC, gateways) is the host project's concern.

Status legend: **shipped** = adapter exists in `adapters/`; **planned** = spec
recorded, adapter not built yet (added one pillar at a time).

---

## News/OSINT & gov feeds — `auth: none` — **shipped**

One adapter (`adapters/news/rss.ts`) serves every feed; the feed URL is the param.
The registry (`adapters/news/feeds-registry.ts`) is the source of truth for *which*
hosts are fetchable — registering a feed seeds the SSRF allowlist with its host —
and it groups feeds into **desks** (the columns of an intelligence-terminal layout).
A separate `adapters/news/classify.ts` tags each item with a **category** and
**severity** for terminal-style triage.

| Field | Value |
|---|---|
| Adapter id | `rss` |
| Auth | none |
| Endpoint | each registered feed's RSS/Atom URL (+ polite `User-Agent`) |
| Parse | `Response.text()` → `parseRss()` (RSS 2.0 / Atom 1.0 / RDF, decodes named + numeric/hex entities, no XML dep) |
| Normalize | `{ title, link, pubDate(ISO), summary }[]` |
| Enrich (optional) | `classify({title,summary,pubDate})` → `{ category, severity }` |
| Rate limit | be a good citizen — cache 8 min, one fetch per feed per window |
| Cache TTL | 8 min |
| Safety | **SSRF allowlist enforced before every fetch** (`core/ssrf-allowlist.ts`); `news.google.com` special-cased |

**Desks** (`WireDesk`): `intel`, `world`, `middle-east`, `europe`, `africa`,
`latin-america`, `asia-pacific`, `united-states`, `markets`.

**Categories** (`classify`): `conflict`, `disaster`, `protest`, `diplomatic`,
`economic`, `general`. **Severities**: `breaking`, `alert`, `caution`, `normal`
(keyword + recency heuristics — coloring/sorting aid, not ground truth).

### Registered feeds (30, all keyless, verified live)

| desk | id | Source | URL |
|---|---|---|---|
| intel | military-times | Military Times | https://www.militarytimes.com/arc/outboundfeeds/rss/?outputType=xml |
| intel | defense-news | Defense News | https://www.defensenews.com/arc/outboundfeeds/rss/?outputType=xml |
| intel | reliefweb | ReliefWeb | https://reliefweb.int/updates/rss.xml |
| world | bbc-world | BBC World | https://feeds.bbci.co.uk/news/world/rss.xml |
| world | aljazeera | Al Jazeera | https://www.aljazeera.com/xml/rss/all.xml |
| world | guardian-world | Guardian World | https://www.theguardian.com/world/rss |
| world | france24 | France 24 | https://www.france24.com/en/rss |
| world | un-news | UN News | https://news.un.org/feed/subscribe/en/news/all/rss.xml |
| world | dw-world | Deutsche Welle | https://rss.dw.com/rdf/rss-en-world |
| middle-east | bbc-mideast | BBC Middle East | https://feeds.bbci.co.uk/news/world/middle_east/rss.xml |
| middle-east | guardian-mideast | Guardian Middle East | https://www.theguardian.com/world/middleeast/rss |
| europe | bbc-europe | BBC Europe | https://feeds.bbci.co.uk/news/world/europe/rss.xml |
| europe | guardian-europe | Guardian Europe | https://www.theguardian.com/world/europe-news/rss |
| africa | bbc-africa | BBC Africa | https://feeds.bbci.co.uk/news/world/africa/rss.xml |
| africa | africanews | AfricaNews | https://www.africanews.com/feed/rss |
| africa | guardian-africa | Guardian Africa | https://www.theguardian.com/world/africa/rss |
| latin-america | bbc-latam | BBC Latin America | https://feeds.bbci.co.uk/news/world/latin_america/rss.xml |
| latin-america | guardian-americas | Guardian Americas | https://www.theguardian.com/world/americas/rss |
| asia-pacific | bbc-asia | BBC Asia | https://feeds.bbci.co.uk/news/world/asia/rss.xml |
| asia-pacific | guardian-asia | Guardian Asia | https://www.theguardian.com/world/asia/rss |
| united-states | bbc-us | BBC US & Canada | https://feeds.bbci.co.uk/news/world/us_and_canada/rss.xml |
| united-states | cbs-news | CBS News | https://www.cbsnews.com/latest/rss/main |
| markets | fed-press | Federal Reserve | https://www.federalreserve.gov/feeds/press_all.xml |
| markets | ecb-press | ECB | https://www.ecb.europa.eu/rss/press.html |
| markets | sec-press | SEC | https://www.sec.gov/news/pressreleases.rss |
| markets | wsj-markets | WSJ Markets | https://feeds.a.dj.com/rss/RSSMarketsMain.xml |
| markets | marketwatch | MarketWatch | https://feeds.content.dowjones.io/public/rss/mw_topstories |
| markets | cnbc-markets | CNBC Markets | https://www.cnbc.com/id/20910258/device/rss/rss.html |
| markets | yahoo-finance | Yahoo Finance | https://finance.yahoo.com/news/rssindex |
| markets | ft-home | Financial Times | https://www.ft.com/rss/home |

---

## Maritime & aviation — **planned**

| Source | Auth / env | Upstream | Notes |
|---|---|---|---|
| OpenSky (flights) | oauth2 (`OPENSKY_*`) — anon works, lower cap | opensky-network.org REST | |
| ADS-B Exchange | apiKey (RapidAPI) | adsbexchange via RapidAPI | |
| AviationStack | apiKey (`AVIATIONSTACK_API`) | aviationstack.com | port the monthly/request **budget guard** |
| AISStream (ships) | apiKey (`AISSTREAM_API_KEY`) | wss://stream.aisstream.io | **WebSocket, live-only** — needs a WS→snapshot collector, not a GET |
| NGA MSI | none | msi.nga.mil JSON | ✅ **shipped** — `adapters/maritime/nga-msi.ts` |
| FAA NAS | none | nasstatus.faa.gov (XML) | ✅ **shipped** — `adapters/aviation/faa-nas.ts` (via `core/xml-lite.ts`) |
| ICAO NOTAMs | apiKey (`ICAO_API_KEY`, MENA only) | applications.icao.int | |
| GPSJam | none | gpsjam daily tiles | ⛔ **deferred** — data path `gpsjam.org/data/YYYY-MM-DD-h3-4.json` returns 404 (dead ≥5 days as of 2026-08-04); revisit when a working endpoint is confirmed |

## Hazards & conflict — **planned**

| Source | Auth / env | Upstream | Notes |
|---|---|---|---|
| USGS quakes | none | earthquake.usgs.gov GeoJSON | ✅ **shipped** — `adapters/hazards/usgs-quakes.ts` (M2.5+ past day) |
| NASA FIRMS (wildfire) | apiKey (`NASA_FIRMS_API_KEY`) | firms.modaps.eosdis.nasa.gov CSV | |
| OpenAQ (air quality) | apiKey (`OPENAQ_API_KEY`, v3) | api.openaq.org | |
| AQICN | apiKey (token) | api.waqi.info | |
| GDELT | none | api.gdeltproject.org | ⛔ **deferred** — 429 from cloud IPs even when spaced ≥5s; would need the ngrams dataset or a proxy |
| ACLED (conflict) | basic-24h (`ACLED_ACCESS_TOKEN` or email+pass) | acleddata.com | **24h token refresh**; research-only license |
| UCDP (conflict) | apiKey (`UCDP_ACCESS_TOKEN`) | ucdp.uu.se | annual datasets, not real-time |
| Polymarket (signal) | none | gamma-api.polymarket.com | ✅ **shipped** — `adapters/hazards/polymarket.ts` (geo/macro-filtered) |
| OREF alerts | none | Israel HFC endpoint | ⛔ **deferred** — 403 Access Denied outside Israel (geo + Referer gated); needs an Israel-side relay |

---

## Reusable patterns carried into `core/`

- **Circuit breaker** (`core/circuit-breaker.ts`) — `createCircuitBreaker({name,cacheTtlMs}).execute(fn, fallback, {shouldCache})`.
- **SSRF allowlist** (`core/ssrf-allowlist.ts`) — www-normalization + subdomain match; **non-negotiable for the RSS adapter**.
- **Budget guard** (planned) — AviationStack monthly/request ceilings so a freemium key can't be blown.
- **Relay indirection** (optional, documented not baked in) — route AIS/OpenSky/RSS through a relay to keep keys server-side / turn AIS WS into snapshots.

## Explicitly NOT extracted
Proto/sebuf clients, the gateway, Convex, Clerk, entitlement gating, Vite dev-proxy
wiring, RPC service classes — transport/plumbing the host project supplies its own way.
