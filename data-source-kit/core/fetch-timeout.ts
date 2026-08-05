/**
 * fetch-timeout — a `fetch` that aborts after `timeoutMs`.
 *
 * Ported (stack-agnostic) from the origin project's `src/utils/with-timeout.ts`
 * (see README → Provenance).
 * Uses only the platform `fetch` + `AbortController` (Node 18+, Deno, browsers,
 * Bun) — no dependencies. Porting to Python = `requests`/`httpx` `timeout=`;
 * to Go = `http.Client{Timeout}` or a `context.WithTimeout`.
 */

export interface FetchTimeoutOptions {
  /** Abort the request after this many milliseconds. Default 12_000. */
  timeoutMs?: number;
  headers?: Record<string, string>;
  /** Passed through to fetch (e.g. "follow" | "manual"). Default "follow". */
  redirect?: RequestRedirect;
  signal?: AbortSignal;
}

export async function fetchWithTimeout(
  url: string,
  opts: FetchTimeoutOptions = {},
): Promise<Response> {
  const { timeoutMs = 12_000, headers, redirect = "follow", signal } = opts;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  // If the caller passed their own signal, abort ours when theirs fires.
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  try {
    return await fetch(url, {
      headers,
      redirect,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}
