import { Redis } from "@upstash/redis";
import type { CandidatePost, PostStatus } from "./types";

// Two-layer: in-memory Map (fast reads for the admin route) + Redis mirror
// (survives restarts). Same shape as routes/oge.ts's cache. Redis is
// optional — absent env vars means in-memory-only, fine for local dev / a
// human-review workflow where someone is watching within a day or two.

const REDIS_KEY_PREFIX = "social-buzz:post:";
const REDIS_TTL_S = 30 * 24 * 60 * 60; // 30 days — old rejected/published rows self-clean

const redis =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      })
    : null;

const _posts = new Map<string, CandidatePost>();
let _hydrated = false;

async function hydrateFromRedis(): Promise<void> {
  if (_hydrated || !redis) {
    _hydrated = true;
    return;
  }
  try {
    const keys = await redis.keys(`${REDIS_KEY_PREFIX}*`);
    if (keys.length > 0) {
      const values = await Promise.all(keys.map((k) => redis.get<CandidatePost>(k)));
      for (const post of values) {
        if (post) _posts.set(post.id, post);
      }
      console.log(`[social-buzz] restored ${_posts.size} post(s) from Redis`);
    }
  } catch (e) {
    console.warn("[social-buzz] queue hydrate failed:", (e as Error).message);
  }
  _hydrated = true;
}

async function mirrorToRedis(post: CandidatePost): Promise<void> {
  if (!redis) return;
  try {
    await redis.set(`${REDIS_KEY_PREFIX}${post.id}`, post, { ex: REDIS_TTL_S });
  } catch (e) {
    console.warn("[social-buzz] queue mirror failed:", (e as Error).message);
  }
}

export async function enqueueCandidate(post: CandidatePost): Promise<void> {
  await hydrateFromRedis();
  _posts.set(post.id, post);
  await mirrorToRedis(post);
}

export async function listCandidates(status?: PostStatus): Promise<CandidatePost[]> {
  await hydrateFromRedis();
  const all = Array.from(_posts.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return status ? all.filter((p) => p.status === status) : all;
}

export async function getCandidate(id: string): Promise<CandidatePost | null> {
  await hydrateFromRedis();
  return _posts.get(id) ?? null;
}

export async function updateCandidate(
  id: string,
  patch: Partial<CandidatePost>,
): Promise<CandidatePost | null> {
  await hydrateFromRedis();
  const existing = _posts.get(id);
  if (!existing) return null;
  const updated: CandidatePost = { ...existing, ...patch };
  _posts.set(id, updated);
  await mirrorToRedis(updated);
  return updated;
}

/** Count of posts published or approved-pending today — backs the daily cap. */
export async function countPublishedOrPendingToday(): Promise<number> {
  await hydrateFromRedis();
  const todayPrefix = new Date().toISOString().slice(0, 10);
  let count = 0;
  for (const post of _posts.values()) {
    if (!post.createdAt.startsWith(todayPrefix)) continue;
    if (post.status === "published" || post.status === "ready_for_manual_post" || post.status === "pending") {
      count++;
    }
  }
  return count;
}
