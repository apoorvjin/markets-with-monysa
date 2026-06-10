/**
 * Multi-machine leader election via Redis lease.
 *
 * Fly.io can run >1 machine for the same app. Some background jobs should only
 * run on one of them — backtest pre-warming (5+ minutes of Yahoo Finance calls)
 * and the Finnhub WebSocket connection (free tier rejects the 2nd connection
 * with a 429) — otherwise both machines duplicate work and trip upstream rate
 * limits.
 *
 * Uses Upstash Redis (already wired for OGE pipeline locks). On startup each
 * machine races to set a lease key with TTL; the winner is leader and refreshes
 * the lease periodically. If the leader dies, the lease expires and a peer
 * picks it up on its next refresh attempt.
 *
 * **Without Redis** (local dev or unconfigured Fly): always leader. This keeps
 * single-machine setups working unchanged.
 */

import { Redis } from "@upstash/redis";

const _machineId = process.env.FLY_MACHINE_ID ?? "local";
const _isFly = !!process.env.FLY_APP_NAME;

const _redis = process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
  ? new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    })
  : null;

const LEASE_KEY = "leader:lease";
const LEASE_TTL_S = 90;       // expires 90s after last refresh
const REFRESH_INTERVAL_MS = 30_000; // re-acquire every 30s while leader

let _isLeader: boolean | null = null;
let _refreshTimer: NodeJS.Timeout | null = null;

/**
 * Whether this process currently holds the leader lease.
 *
 * Returns `true` synchronously when Redis isn't configured or we're not on Fly
 * (local dev / single-machine setups). On Fly with Redis, the first call kicks
 * off async lease acquisition; until that resolves, returns `false` to err on
 * the side of "don't duplicate work". After the first successful acquire it
 * returns the cached state and is refreshed every 30s in the background.
 */
export function isLeader(): boolean {
  // Local dev or unconfigured: act as leader so single-machine setups behave.
  if (!_isFly || !_redis) return true;
  return _isLeader === true;
}

/**
 * Start the leader-election loop. Idempotent — call once at startup.
 * No-op when Redis isn't configured.
 */
export function startLeaderElection(): void {
  if (!_isFly || !_redis || _refreshTimer) return;

  void tryAcquire(); // first attempt immediately, then schedule periodic
  _refreshTimer = setInterval(() => { void tryAcquire(); }, REFRESH_INTERVAL_MS);
}

async function tryAcquire(): Promise<void> {
  if (!_redis) return;
  try {
    // Atomic acquire: only set if key absent (NX).
    const acquired = await _redis.set(LEASE_KEY, _machineId, {
      nx: true,
      ex: LEASE_TTL_S,
    });
    if (acquired) {
      if (_isLeader !== true) {
        console.log(`[leader] acquired lease (machine ${_machineId})`);
      }
      _isLeader = true;
      return;
    }
    // Lease held by someone — check if it's us (refresh case).
    const holder = await _redis.get<string>(LEASE_KEY);
    if (holder === _machineId) {
      // We still own it — refresh TTL.
      await _redis.set(LEASE_KEY, _machineId, { ex: LEASE_TTL_S });
      _isLeader = true;
    } else {
      if (_isLeader !== false) {
        console.log(`[leader] follower (lease held by ${holder ?? "?"})`);
      }
      _isLeader = false;
    }
  } catch (e) {
    // On Redis errors, fall back to "not leader" — safer to skip work than to
    // duplicate it. The OGE pipeline takes the same conservative stance.
    console.warn("[leader] election failed:", (e as Error).message);
    _isLeader = false;
  }
}

export function machineId(): string {
  return _machineId;
}
