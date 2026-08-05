/**
 * ssrf-allowlist — the load-bearing safety guard for the RSS/feed adapters.
 *
 * Ported (stack-agnostic) from the origin project's `api/_rss-allowed-domain-match.js`
 * (see README → Provenance).
 * A feed URL (and, critically, the URL a feed *redirects to*) may only be
 * fetched if its host is on the allowlist. Without this, an attacker who can
 * influence a feed URL could point the server at internal metadata endpoints
 * (169.254.169.254), localhost services, etc. — classic SSRF. Keep it.
 *
 * Rules:
 *  - https only (no http/file/gopher/…).
 *  - No IP-literal hosts (blocks 127.0.0.1, 169.254.x, ::1, etc.).
 *  - Host matches an allowlisted host exactly (after stripping a leading "www."),
 *    OR is a subdomain of an allowlisted host (feeds.bbc.co.uk vs bbc.co.uk).
 *  - `news.google.com` is special-cased allowed (Google News proxies publisher
 *    RSS through query params — see feeds-registry).
 *
 * The allowlist is seeded by the feed registry via `allowHosts()`, so there is
 * a single source of truth: a host is fetchable iff a feed for it is registered.
 */

const allowed = new Set<string>();

/** Add hosts to the allowlist. Idempotent. Leading "www." is normalized off. */
export function allowHosts(hosts: Iterable<string>): void {
  for (const h of hosts) {
    const n = normalizeHost(h);
    if (n) allowed.add(n);
  }
}

/** Special-cased publishers that are always permitted (per spec). */
const ALWAYS_ALLOWED = new Set<string>(["news.google.com"]);

export function normalizeHost(host: string): string {
  return host.trim().toLowerCase().replace(/^www\./, "");
}

const IP_LITERAL = /^(\d{1,3}\.){3}\d{1,3}$/; // IPv4 literal — IPv6 caught via ":" below

/**
 * True if `url` is safe to fetch. Apply to the initial URL AND to the final URL
 * after any redirect (`redirect: "manual"` → re-check `Location`).
 */
export function isAllowedDomain(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:") return false;

  const host = parsed.hostname.toLowerCase();
  if (!host) return false;
  if (IP_LITERAL.test(host)) return false;
  if (host.includes(":")) return false; // IPv6 literal
  if (host === "localhost") return false;

  const normalized = normalizeHost(host);
  if (ALWAYS_ALLOWED.has(normalized)) return true;

  for (const a of allowed) {
    if (normalized === a) return true;
    if (normalized.endsWith(`.${a}`)) return true; // subdomain of an allowed host
  }
  return false;
}

/** Test/introspection helper — the current allowlist as a sorted array. */
export function listAllowedHosts(): string[] {
  return [...allowed].sort();
}
