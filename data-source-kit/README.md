# data-source-kit

A self-contained, **dependency-free** bundle of *source adapters*: the reusable
part of a data-capture layer, extracted so it can be copied into any project and
reimplemented in any language. No proto, no gateway, no framework coupling — just
`upstream endpoint + auth + params + rate-limit + response→normalized mapping`
per source, over a tiny stack-agnostic core.

It ships one **spec doc** ([SOURCES_SPEC.md](./SOURCES_SPEC.md)) plus one reference
adapter per source. First pillar shipped: **News/OSINT & gov feeds** (RSS, keyless) —
30 feeds grouped into **desks** (intel / world / regions / markets) and tagged with a
heuristic **category + severity** for a terminal-style layout. Others (maritime/aviation,
hazards/conflict) are specced and land one at a time.

## Layout

```
core/
  fetch-timeout.ts    fetchWithTimeout — fetch that aborts after N ms
  circuit-breaker.ts  createCircuitBreaker — cache-fronted breaker for flaky upstreams
  ssrf-allowlist.ts   isAllowedDomain / allowHosts — the load-bearing SSRF guard
  rss-parse.ts        parseRss — RSS 2.0 / Atom / RDF → items, no XML dependency
  adapter.ts          SourceAdapter<TParams,TNormalized> + runAdapter runner
adapters/
  news/
    feeds-registry.ts curated keyless feed registry (seeds the SSRF allowlist)
    rss.ts            the RSS SourceAdapter
scripts/
  try.ts              CLI to run adapters live with no host project
```

## Use it

```ts
import { runAdapter } from "./core/adapter.js";
import { rssAdapter } from "./adapters/news/rss.js";
import { FEEDS, feedsForSection } from "./adapters/news/feeds-registry.js";
// importing the registry seeds the SSRF allowlist with every feed host

const items = await runAdapter(rssAdapter, {
  url: "https://feeds.bbci.co.uk/news/world/rss.xml",
});
// → [{ title, link, pubDate, summary }, ...]  (fetched, parsed, cached 8 min)
```

`runAdapter` gives you SSRF-check → fetch(with timeout) → parse → normalize, all
fronted by the adapter's circuit breaker + TTL cache. You only ever write/port
`endpoint`, `parse`, and `normalize` per source.

To aggregate a whole desk and tag it (what the FinBrio "Wire" server route does):

```ts
import { feedsForDesk } from "./adapters/news/feeds-registry.js";
import { classify } from "./adapters/news/classify.js";

const feeds = feedsForDesk("world");
const all = (await Promise.all(
  feeds.map(async (f) =>
    (await runAdapter(rssAdapter, { url: f.url }).catch(() => [])).map((it) => ({
      ...it,
      source: f.name,
      ...classify(it), // → { category, severity }
    })),
  ),
)).flat();
// merge, dedupe by link, sort by pubDate desc
```

## Try it standalone

```bash
npm install
npm run build                       # tsc — compiles with zero external runtime deps
npx tsx scripts/try.ts feeds        # list the registry
npx tsx scripts/try.ts rss --url https://feeds.bbci.co.uk/news/world/rss.xml
npx tsx scripts/try.ts rss --url https://evil.example.com/x   # → REJECTED by SSRF allowlist
```

## Porting to another language

- `fetch-timeout` → `requests`/`httpx` `timeout=` (Python), `http.Client{Timeout}` (Go).
- `circuit-breaker` → any breaker lib, or the ~40-line state machine here.
- `ssrf-allowlist` → keep the semantics exactly: https-only, no IP literals, host must
  match a registered host (or subdomain). **Do not skip this** — it's what stops a
  tampered/attacker-influenced feed URL from turning the fetcher into an SSRF vector.
- `rss-parse` → any feed parser (`feedparser` in Python, `gofeed` in Go). The regex
  parser here exists only to keep the kit dependency-free.
- `adapter` → the `SourceAdapter` interface is data; re-express it as a struct/protocol.

## Optional deployment pattern: relay indirection
Some upstreams (AIS WebSocket, OpenSky, keyed RSS) are best fronted by a small relay
that keeps keys server-side and, for AIS, turns the live WebSocket into pollable
snapshots. That's a **deployment choice**, documented here but intentionally not baked
into the adapters — the adapters stay pure `endpoint/parse/normalize`.

## Provenance
The reusable patterns here — the circuit breaker, the SSRF allowlist, the RSS
parse step, and the feed registry — were extracted from the **worldmonitor**
project and rewritten to be stack-agnostic and dependency-free. Each `core/` and
`adapters/` file names the specific origin file it was transliterated from, in its
header comment, so a porter can trace it back. The `core/` and `adapters/` code
itself imports nothing from that project (verify: `grep -rE "@/|worldmonitor|convex|sebuf" core adapters` returns nothing).

## What this is NOT
Not the transport. No proto/sebuf generated clients, no gateway, no Convex/Clerk, no
entitlement gating, no dev-proxy wiring. Bring your own transport and host those how
your project already does.
