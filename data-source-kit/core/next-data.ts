/**
 * next-data — pull the `__NEXT_DATA__` (or any embedded `{"props":{"pageProps":…}}`)
 * JSON blob out of a server-rendered Next.js page's HTML, without a DOM/HTML parser
 * dependency. Several data-center trackers (see adapters/datacenters) ship their
 * data this way instead of a JSON API — this is the shared extraction step.
 */

const PAGE_PROPS_MARKER = '{"props":{"pageProps":';

/** Scan forward from a '{' to its matching '}', honoring string literals/escapes. */
function extractJsonValue(text: string, start: number): string | null {
  if (text[start] !== "{") return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

/** Extract and parse a Next.js page's `props.pageProps`, or null if not found/malformed. */
export function extractPageProps<T = unknown>(html: string): T | null {
  const start = html.indexOf(PAGE_PROPS_MARKER);
  if (start === -1) return null;
  const json = extractJsonValue(html, start);
  if (!json) return null;
  try {
    const parsed = JSON.parse(json) as { props?: { pageProps?: T } };
    return parsed.props?.pageProps ?? null;
  } catch {
    return null;
  }
}
