/**
 * circuit-breaker — cache-fronted breaker for flaky upstreams.
 *
 * Ported (stack-agnostic) from the origin project's `src/utils` `createCircuitBreaker`,
 * as used in `src/services/earthquakes.ts` (see README → Provenance). Same shape:
 *
 *   const cb = createCircuitBreaker({ name, cacheTtlMs });
 *   const data = await cb.execute(() => fetchThing(), fallbackValue, { shouldCache: true });
 *
 * Behaviour:
 *  - Successful `execute` results are cached for `cacheTtlMs` (when `shouldCache`).
 *  - After `failureThreshold` consecutive failures the breaker OPENS for
 *    `openMs`; while open, `execute` short-circuits to the freshest cached value
 *    (even if stale) or the supplied `fallback` — it does NOT call `fn`.
 *  - One success closes the breaker and resets the failure count.
 *
 * Zero dependencies. Persistence is intentionally out of scope for the kit —
 * the origin's `persistCache` hook is a deployment concern (see README).
 */

export interface CircuitBreakerOptions {
  /** Label used in warning logs. */
  name: string;
  /** How long a cached success stays fresh. */
  cacheTtlMs: number;
  /** Consecutive failures before the breaker opens. Default 4. */
  failureThreshold?: number;
  /** How long the breaker stays open once tripped. Default cacheTtlMs. */
  openMs?: number;
  /** Injectable logger (defaults to console.warn). */
  warn?: (msg: string) => void;
}

export interface ExecuteOptions {
  /** Cache the successful result. Default true. */
  shouldCache?: boolean;
}

export interface CircuitBreaker<T = unknown> {
  execute<R extends T>(
    fn: () => Promise<R>,
    fallback: R,
    opts?: ExecuteOptions,
  ): Promise<R>;
  /** Freshest cached value regardless of TTL, or undefined. */
  peek(): T | undefined;
  reset(): void;
}

export function createCircuitBreaker<T = unknown>(
  options: CircuitBreakerOptions,
): CircuitBreaker<T> {
  const {
    name,
    cacheTtlMs,
    failureThreshold = 4,
    openMs = cacheTtlMs,
    warn = (m) => console.warn(m),
  } = options;

  let cached: { value: T; ts: number } | undefined;
  let failures = 0;
  let openedAt = 0;

  const isOpen = () => openedAt > 0 && Date.now() - openedAt < openMs;

  return {
    async execute<R extends T>(
      fn: () => Promise<R>,
      fallback: R,
      { shouldCache = true }: ExecuteOptions = {},
    ): Promise<R> {
      // Fresh cache hit — serve without calling upstream.
      if (cached && Date.now() - cached.ts < cacheTtlMs) {
        return cached.value as R;
      }

      // Breaker open — don't hit upstream; serve last-known or fallback.
      if (isOpen()) {
        return (cached?.value as R) ?? fallback;
      }

      try {
        const value = await fn();
        failures = 0;
        openedAt = 0;
        if (shouldCache) cached = { value, ts: Date.now() };
        return value;
      } catch (err) {
        failures += 1;
        if (failures >= failureThreshold) {
          openedAt = Date.now();
          warn(`[circuit-breaker:${name}] opened after ${failures} failures: ${String(err)}`);
        }
        // Degrade to last-known cached value (even if stale) or the fallback.
        return (cached?.value as R) ?? fallback;
      }
    },
    peek() {
      return cached?.value;
    },
    reset() {
      cached = undefined;
      failures = 0;
      openedAt = 0;
    },
  };
}
