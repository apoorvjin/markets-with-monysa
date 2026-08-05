/**
 * rss-parse — RSS 2.0 / Atom 1.0 → normalized items, with no XML dependency.
 *
 * Ported (stack-agnostic) from the origin project's `api/rss-proxy.js` parse step
 * (see README → Provenance).
 * Deliberately regex/string-based so it ports trivially to any language and
 * needs zero packages. It is a *feed* parser, not a general XML parser — it
 * only understands the handful of elements feeds actually use.
 */

export interface RssItem {
  title: string;
  link: string;
  /** ISO 8601 when parseable, else the raw string, else "". */
  pubDate: string;
  summary: string;
}

/** Decode the entities that show up in feeds (named + any numeric/hex). */
function decodeEntities(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    // Numeric + hex character references, e.g. &#8216; &#x2018; — decode any.
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => codePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => codePoint(parseInt(dec, 10)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    // &amp; last so a double-encoded "&amp;#x2018;" isn't mangled mid-pass.
    .replace(/&amp;/g, "&");
}

function codePoint(n: number): string {
  try {
    return Number.isFinite(n) && n > 0 ? String.fromCodePoint(n) : "";
  } catch {
    return "";
  }
}

/** Strip HTML tags and collapse whitespace (for summaries). */
function stripHtml(s: string): string {
  return decodeEntities(s)
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** First inner text of `<tag ...>…</tag>` within `block`, or "". */
function tag(block: string, name: string): string {
  const re = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i");
  const m = re.exec(block);
  return m ? decodeEntities(m[1]).trim() : "";
}

/** Atom links: <link href="..." rel="alternate"/>. Prefer alternate/self. */
function atomLink(block: string): string {
  const links = [...block.matchAll(/<link\b([^>]*)\/?>/gi)];
  if (links.length === 0) return "";
  const withHref = links
    .map((m) => {
      const attrs = m[1];
      const href = /href\s*=\s*["']([^"']+)["']/i.exec(attrs)?.[1] ?? "";
      const rel = /rel\s*=\s*["']([^"']+)["']/i.exec(attrs)?.[1] ?? "alternate";
      return { href, rel };
    })
    .filter((l) => l.href);
  if (withHref.length === 0) return "";
  const alt = withHref.find((l) => l.rel === "alternate");
  return decodeEntities((alt ?? withHref[0]).href).trim();
}

function toIso(raw: string): string {
  if (!raw) return "";
  const t = Date.parse(raw);
  return Number.isNaN(t) ? raw : new Date(t).toISOString();
}

function parseBlocks(xml: string, blockTag: string): string[] {
  const re = new RegExp(`<${blockTag}(?:\\s[^>]*)?>([\\s\\S]*?)</${blockTag}>`, "gi");
  return [...xml.matchAll(re)].map((m) => m[1]);
}

export function parseRss(xml: string): RssItem[] {
  if (!xml) return [];

  // RSS <item> first; fall back to Atom <entry>.
  const isAtom = /<feed\b/i.test(xml) && !/<rss\b/i.test(xml);
  const blocks = isAtom ? parseBlocks(xml, "entry") : parseBlocks(xml, "item");

  const items: RssItem[] = [];
  for (const block of blocks) {
    const title = tag(block, "title");
    const link = isAtom ? atomLink(block) : tag(block, "link");
    const rawDate =
      tag(block, "pubDate") ||
      tag(block, "published") ||
      tag(block, "updated") ||
      tag(block, "dc:date");
    const rawSummary =
      tag(block, "description") ||
      tag(block, "summary") ||
      tag(block, "content") ||
      tag(block, "content:encoded");

    if (!title && !link) continue; // junk block
    items.push({
      title: stripHtml(title),
      link: link.trim(),
      pubDate: toIso(rawDate),
      summary: stripHtml(rawSummary).slice(0, 500),
    });
  }
  return items;
}
