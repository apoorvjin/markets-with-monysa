/**
 * try.ts — tiny CLI to exercise adapters live, with no host project.
 *
 *   tsx scripts/try.ts rss --url https://feeds.bbci.co.uk/news/world/rss.xml
 *   tsx scripts/try.ts rss --url https://evil.example.com/x   # → SSRF rejected
 *   tsx scripts/try.ts feeds                                   # list the registry
 *   tsx scripts/try.ts usgs-quakes | polymarket | nga-msi | faa-nas
 *
 * Keyless adapters only for now (News/RSS + hazards/maritime/aviation). Keyed
 * pillars get a case here as they land.
 */

import { runAdapter, SsrfBlockedError, type SourceAdapter } from "../core/adapter.js";
import { rssAdapter } from "../adapters/news/rss.js";
// Side-effect import: seeds the SSRF allowlist with every registered feed host.
import { FEEDS } from "../adapters/news/feeds-registry.js";
import { usgsQuakesAdapter } from "../adapters/hazards/usgs-quakes.js";
import { polymarketAdapter } from "../adapters/hazards/polymarket.js";
import { ngaMsiAdapter } from "../adapters/maritime/nga-msi.js";
import { faaNasAdapter } from "../adapters/aviation/faa-nas.js";

// Adapters that take no params.
const NO_PARAM: Record<string, SourceAdapter<Record<string, never>, unknown>> = {
  "usgs-quakes": usgsQuakesAdapter,
  polymarket: polymarketAdapter,
  "nga-msi": ngaMsiAdapter,
  "faa-nas": faaNasAdapter,
};

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const cmd = process.argv[2];

  if (cmd === "feeds") {
    for (const f of FEEDS) console.log(`${f.desk.padEnd(14)}  ${f.id.padEnd(18)}  ${f.name}`);
    console.log(`\n${FEEDS.length} feeds registered.`);
    return;
  }

  if (cmd === "rss") {
    const url = arg("url");
    if (!url) {
      console.error("usage: try.ts rss --url <feed-url>");
      process.exit(1);
    }
    try {
      const items = await runAdapter(rssAdapter, { url });
      console.log(JSON.stringify(items.slice(0, 10), null, 2));
      console.log(`\n${items.length} items from ${url}`);
    } catch (err) {
      if (err instanceof SsrfBlockedError) {
        console.error(`REJECTED by SSRF allowlist: ${url}`);
        process.exit(2);
      }
      throw err;
    }
    return;
  }

  if (cmd && NO_PARAM[cmd]) {
    const items = await runAdapter(NO_PARAM[cmd]!, {});
    console.log(JSON.stringify(items.slice(0, 8), null, 2));
    console.log(`\n${items.length} items from ${cmd}`);
    return;
  }

  console.error(
    `unknown command: ${cmd ?? "(none)"} — try: rss | feeds | ${Object.keys(NO_PARAM).join(" | ")}`,
  );
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
