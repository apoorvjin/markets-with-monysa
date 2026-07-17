import { randomUUID } from "node:crypto";
import { isLeader } from "../leader";
import { latestPrices, TRADING_ASSETS } from "../../trading";
import { getFearGreedCache } from "../../routes/volatility";
import {
  detectNotableMover,
  detectSignalFlip,
  detectFearGreedRegimeChange,
  type MoverCandidate,
} from "./detector";
import { generatePostCopy } from "./copywriter";
import { enqueueCandidate, updateCandidate, countPublishedOrPendingToday } from "./queue";
import { publishToInstagram, PLACEHOLDER_IMAGE_URL } from "./meta-client";
import type { BuzzEvent, CandidatePost, SocialChannel } from "./types";

// Small deliberate watchlist for signal-flip checks, not the full ~39-asset
// universe — each symbol costs one internal HTTP call per tick.
const WATCHED_SIGNAL_SYMBOLS = ["^GSPC", "^IXIC", "GC=F", "CL=F", "BTC-USD"];

let _lastFearGreed: string | null = null;
const _lastSignalBySymbol = new Map<string, string>();
const _pendingFlipConfirm = new Map<string, string>();

async function fetchSignalDirection(symbol: string): Promise<string | null> {
  try {
    const port = process.env.PORT || "5001";
    const res = await fetch(
      `http://localhost:${port}/api/trading/signals/${encodeURIComponent(symbol)}?strategy=1`,
    );
    if (!res.ok) return null;
    const json = (await res.json()) as { direction?: string };
    return json.direction ?? null;
  } catch {
    return null;
  }
}

/**
 * Generates one CandidatePost per channel (not one post fanning out to
 * multiple channels) — this keeps the single top-level `status` field
 * meaningful: Instagram's row can be auto-published while X's row sits
 * ready-for-manual-post, without needing per-channel status tracking.
 */
async function processEvent(event: BuzzEvent): Promise<void> {
  const copy = await generatePostCopy(event);
  const channels: SocialChannel[] = ["instagram", "x"];

  for (const channel of channels) {
    const candidate: CandidatePost = {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      triggerType: event.triggerType,
      triggerSummary: event.triggerSummary,
      copy,
      targetChannels: [channel],
      status: "pending",
    };
    await enqueueCandidate(candidate);

    if (channel === "instagram" && process.env.SOCIAL_BUZZ_AUTO_PUBLISH_ENABLED === "true") {
      const result = await publishToInstagram(candidate, PLACEHOLDER_IMAGE_URL);
      await updateCandidate(
        candidate.id,
        result.ok
          ? { status: "published", publishedAt: new Date().toISOString(), igMediaId: result.igMediaId }
          : { status: "failed", failureReason: result.error },
      );
    }
    // x channel: always stays "pending" here. The admin route's approve
    // action transitions it straight to "ready_for_manual_post" — X is never
    // auto-published, regardless of SOCIAL_BUZZ_AUTO_PUBLISH_ENABLED.
  }
}

export async function tick(): Promise<void> {
  if (process.env.SOCIAL_BUZZ_KILL_SWITCH === "true") return;

  // Counts channel-rows, not distinct market events (each event yields up to
  // 2 rows, one per channel) — the effective daily event count is roughly
  // half the configured cap. Simple and transparent over precise.
  const cap = Number(process.env.SOCIAL_BUZZ_MAX_POSTS_PER_DAY) || 3;
  if ((await countPublishedOrPendingToday()) >= cap) return;

  const events: BuzzEvent[] = [];

  // 1. Notable mover — in-process read of the existing latestPrices poll
  // cache, no extra network fetch.
  const movers: MoverCandidate[] = TRADING_ASSETS.filter((a) => latestPrices.has(a.symbol)).map(
    (a) => ({
      symbol: a.symbol,
      name: a.name,
      changePercent: latestPrices.get(a.symbol)?.changePercent ?? 0,
    }),
  );
  const moverEvent = detectNotableMover(movers);
  if (moverEvent) events.push(moverEvent);

  // 2. Fear & Greed regime change — reads the existing hourly-refreshed cache.
  const fg = getFearGreedCache();
  if (fg) {
    const fgEvent = detectFearGreedRegimeChange(_lastFearGreed, fg.classification);
    if (fgEvent) events.push(fgEvent);
    _lastFearGreed = fg.classification;
  }

  // 3. Signal flips on the watchlist — requires the flip to persist across 2
  // consecutive ticks before treating it as notable, to avoid single-tick noise.
  for (const symbol of WATCHED_SIGNAL_SYMBOLS) {
    const direction = await fetchSignalDirection(symbol);
    if (!direction) continue;
    const prev = _lastSignalBySymbol.get(symbol) ?? null;

    if (prev === "HOLD" && direction !== "HOLD" && direction !== prev) {
      const pendingConfirm = _pendingFlipConfirm.get(symbol);
      if (pendingConfirm === direction) {
        const flipEvent = detectSignalFlip(symbol, prev, direction);
        if (flipEvent) events.push(flipEvent);
        _pendingFlipConfirm.delete(symbol);
      } else {
        _pendingFlipConfirm.set(symbol, direction);
      }
    } else {
      _pendingFlipConfirm.delete(symbol);
    }
    _lastSignalBySymbol.set(symbol, direction);
  }

  for (const event of events) {
    await processEvent(event).catch((e) => console.error("[social-buzz] processEvent failed:", e));
  }
}

/** Start the leader-only social-buzz poller. Call once at server startup. */
export function startSocialBuzzPoller(): void {
  const intervalMinutes = Number(process.env.SOCIAL_BUZZ_POLL_INTERVAL_MINUTES) || 20;
  setInterval(() => {
    if (!isLeader()) return;
    tick().catch((e) => console.error("[social-buzz] tick error:", e));
  }, intervalMinutes * 60_000);
}
