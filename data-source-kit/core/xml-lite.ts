/**
 * xml-lite — minimal, dependency-free helpers for flat XML documents (e.g. the
 * FAA NAS airport-status feed). Not a general XML parser — same philosophy as
 * `rss-parse.ts`: string/regex extraction so the kit needs zero packages and
 * ports trivially. Use a real XML lib if you ever need namespaces/attributes at
 * depth.
 */

/** All inner strings of `<tag ...>…</tag>` occurrences within `xml`. */
export function extractBlocks(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "gi");
  return [...xml.matchAll(re)].map((m) => m[1] ?? "");
}

/** First inner text of `<tag ...>…</tag>` within `block`, trimmed, or "". */
export function tagText(block: string, tag: string): string {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "i");
  const m = re.exec(block);
  if (!m) return "";
  return decodeXml(m[1] ?? "").trim();
}

/** Value of an attribute on the first tag opening inside `block`. */
export function attr(block: string, name: string): string {
  const m = new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, "i").exec(block);
  return m ? decodeXml(m[1] ?? "") : "";
}

function decodeXml(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => safeCp(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => safeCp(parseInt(d, 10)))
    .replace(/&amp;/g, "&");
}

function safeCp(n: number): string {
  try {
    return Number.isFinite(n) && n > 0 ? String.fromCodePoint(n) : "";
  } catch {
    return "";
  }
}
