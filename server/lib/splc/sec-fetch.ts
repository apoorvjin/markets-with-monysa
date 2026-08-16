// Single throttled entry point for every SEC request SPLC makes.
//
// SEC asks for <=10 requests/second across ALL their hosts (sec.gov,
// data.sec.gov, efts.sec.gov) per client, and enforces it by blocking the
// offending IP. The nightly batch fires a denominator lookup per edge, so an
// unthrottled run can burst thousands of requests in seconds. The failure
// mode isn't a bill — it's SEC blocking the Fly machine's IP, which would
// also take down `routes/quiver.ts` (Form 4 / EDGAR full-text search) since
// they share that IP. Hence one shared limiter rather than per-module ones.
//
// Concurrency alone is not enough: 4 concurrent requests that each take 20ms
// is 200 req/s. So this caps concurrency AND paces request *starts*.

import pLimit from "p-limit";

// SEC requires a descriptive UA with contact info; requests without one get
// a 403. Kept here so every call site is consistent by construction.
const SEC_USER_AGENT = "monysa-app/1.0 research@monysa.com";

const MAX_CONCURRENCY = 4;
// ~8 req/s — deliberately under the documented 10/s ceiling, since our clock
// and theirs won't agree and other routes share this IP.
const MIN_INTERVAL_MS = 125;

const limiter = pLimit(MAX_CONCURRENCY);
let nextSlot = 0;

/** Reserves the next start slot, so concurrent callers space out rather than
 *  all firing at once. */
async function pace(): Promise<void> {
  const now = Date.now();
  const slot = Math.max(now, nextSlot);
  nextSlot = slot + MIN_INTERVAL_MS;
  const wait = slot - now;
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
}

export interface SecFetchOptions extends RequestInit {
  /** Retries on 429/503 (honouring Retry-After). 0 disables. */
  retries?: number;
}

export async function secFetch(url: string, opts: SecFetchOptions = {}): Promise<Response> {
  const { retries = 2, headers, ...init } = opts;

  return limiter(async () => {
    for (let attempt = 0; ; attempt++) {
      await pace();
      const res = await fetch(url, {
        ...init,
        headers: { "User-Agent": SEC_USER_AGENT, ...(headers as Record<string, string> | undefined) },
      });

      // 429 = rate limited, 503 = SEC's "you're going too fast" page.
      if ((res.status === 429 || res.status === 503) && attempt < retries) {
        const retryAfter = Number(res.headers.get("retry-after"));
        const backoffMs = Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : 1000 * 2 ** attempt;
        console.warn(`[splc] SEC ${res.status} on ${url} — backing off ${backoffMs}ms`);
        // Push every other queued request out too; the whole client is being
        // throttled, not just this one call.
        nextSlot = Math.max(nextSlot, Date.now() + backoffMs);
        await new Promise((r) => setTimeout(r, backoffMs));
        continue;
      }
      return res;
    }
  });
}
