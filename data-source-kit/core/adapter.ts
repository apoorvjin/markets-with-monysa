/**
 * adapter — the one interface every source in the kit collapses to, plus the
 * `runAdapter` runner that wraps every call in the shared circuit breaker + cache.
 *
 * The reusable part of any source is narrow: upstream endpoint + auth/key +
 * request params + rate-limit + response->normalized mapping. Everything else
 * (transport, RPC, gateways) is the host project's concern. Implement `endpoint`,
 * `parse`, and `normalize` per source; get fetch->normalize->cache for free.
 */

import { createCircuitBreaker, type CircuitBreaker } from "./circuit-breaker.js";
import { fetchWithTimeout } from "./fetch-timeout.js";
import { isAllowedDomain } from "./ssrf-allowlist.js";

export type AuthKind = "none" | "apiKey" | "oauth2" | "basic-24h";

export interface EndpointSpec {
  url: string;
  headers?: Record<string, string>;
}

export interface RateLimit {
  perMin?: number;
  perDay?: number;
  note?: string;
}

export interface SourceAdapter<TParams, TNormalized> {
  /** Stable id, e.g. 'rss', 'usgs-quakes', 'aviationstack-delays'. */
  id: string;
  auth: AuthKind;
  /** Build the upstream request from params. */
  endpoint(params: TParams): EndpointSpec;
  /** Read the HTTP response body into an intermediate form (json | text | xml). */
  parse(raw: Response): Promise<unknown>;
  /** Map the parsed body into the clean domain shape. */
  normalize(raw: unknown, params: TParams): TNormalized[];
  rateLimit: RateLimit;
  /** How long a successful result stays fresh in the runner's cache. */
  cacheTtlMs: number;
  /**
   * When true (default for the RSS adapter), the runner enforces the SSRF
   * allowlist against `endpoint().url` before fetching. Sources that hit a
   * fixed, trusted upstream can leave it false.
   */
  enforceAllowlist?: boolean;
  /** Per-request timeout. Default 12s. */
  timeoutMs?: number;
}

const breakers = new Map<string, CircuitBreaker<unknown>>();

function breakerFor(id: string, cacheTtlMs: number): CircuitBreaker<unknown> {
  let cb = breakers.get(id);
  if (!cb) {
    cb = createCircuitBreaker({ name: id, cacheTtlMs });
    breakers.set(id, cb);
  }
  return cb;
}

export class SsrfBlockedError extends Error {
  constructor(url: string) {
    super(`SSRF allowlist rejected URL: ${url}`);
    this.name = "SsrfBlockedError";
  }
}

/**
 * Run an adapter for the given params: SSRF-check → fetch(with timeout) →
 * parse → normalize, all fronted by the adapter's circuit breaker + TTL cache.
 * A per-(adapter,params) cache key keeps distinct requests independent.
 */
export async function runAdapter<TParams, TNormalized>(
  adapter: SourceAdapter<TParams, TNormalized>,
  params: TParams,
): Promise<TNormalized[]> {
  const spec = adapter.endpoint(params);
  const enforce = adapter.enforceAllowlist ?? adapter.auth === "none";
  if (enforce && !isAllowedDomain(spec.url)) {
    throw new SsrfBlockedError(spec.url);
  }

  const cacheKey = `${adapter.id}:${spec.url}`;
  const cb = breakerFor(cacheKey, adapter.cacheTtlMs);

  return cb.execute(
    async () => {
      const res = await fetchWithTimeout(spec.url, {
        headers: spec.headers,
        timeoutMs: adapter.timeoutMs ?? 12_000,
      });
      if (!res.ok) throw new Error(`${adapter.id}: upstream ${res.status} for ${spec.url}`);
      const parsed = await adapter.parse(res);
      return adapter.normalize(parsed, params);
    },
    [],
  ) as Promise<TNormalized[]>;
}
