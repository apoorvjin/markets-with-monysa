/**
 * server/routes/social-buzz.ts
 * Admin-only API for the "market buzz" social pipeline review queue.
 * Protected by the same ADMIN_SECRET Bearer auth as routes/admin.ts.
 *
 *   GET   /api/admin/social-buzz/queue?status=pending
 *   PATCH /api/admin/social-buzz/queue/:id
 *   POST  /api/admin/social-buzz/queue/:id/approve
 *   POST  /api/admin/social-buzz/queue/:id/reject
 *   GET   /api/admin/social-buzz/status
 *   POST  /api/admin/social-buzz/kill-switch
 *   POST  /api/admin/social-buzz/cap
 *   POST  /api/admin/social-buzz/run-once   (debug — manually trigger a poll tick)
 */

import type { Express } from "express";
import { authMiddleware } from "../lib/admin-auth";
import { listCandidates, getCandidate, updateCandidate, countPublishedOrPendingToday } from "../lib/social-buzz/queue";
import { publishToInstagram, PLACEHOLDER_IMAGE_URL } from "../lib/social-buzz/meta-client";
import { tick } from "../lib/social-buzz/poller";
import type { PostStatus } from "../lib/social-buzz/types";
import { killSwitchActive, setKillSwitch, dailyCap, setDailyCap } from "../lib/social-buzz/config-override";

export function registerSocialBuzzRoutes(app: Express): void {
  app.get("/api/admin/social-buzz/queue", authMiddleware, async (req, res) => {
    const status = req.query.status as PostStatus | undefined;
    const posts = await listCandidates(status);
    return res.json({ posts });
  });

  app.patch("/api/admin/social-buzz/queue/:id", authMiddleware, async (req, res) => {
    const id = req.params.id as string;
    const { copy, targetChannels } = req.body as { copy?: string; targetChannels?: string[] };
    const patch: Record<string, unknown> = {};
    if (typeof copy === "string") patch.copy = copy;
    if (Array.isArray(targetChannels)) patch.targetChannels = targetChannels;

    const updated = await updateCandidate(id, patch);
    if (!updated) return res.status(404).json({ error: "Not found" });
    return res.json({ post: updated });
  });

  app.post("/api/admin/social-buzz/queue/:id/approve", authMiddleware, async (req, res) => {
    const id = req.params.id as string;
    const post = await getCandidate(id);
    if (!post) return res.status(404).json({ error: "Not found" });

    if (killSwitchActive()) {
      return res.status(409).json({ error: "Kill switch active — publishing suppressed" });
    }

    const reviewedBy = (req.body as { reviewedBy?: string })?.reviewedBy;
    const reviewedAt = new Date().toISOString();

    if (post.targetChannels.includes("x")) {
      // X is never posted to via API — approval just marks it ready to
      // copy-paste manually.
      const updated = await updateCandidate(id, {
        status: "ready_for_manual_post",
        reviewedBy,
        reviewedAt,
      });
      return res.json({ post: updated });
    }

    // Instagram: actually publish (or dry-run log, per meta-client's own gate).
    const result = await publishToInstagram(post, PLACEHOLDER_IMAGE_URL);
    const updated = await updateCandidate(id, result.ok
      ? { status: "published", publishedAt: reviewedAt, igMediaId: result.igMediaId, reviewedBy, reviewedAt }
      : { status: "failed", failureReason: result.error, reviewedBy, reviewedAt });
    return res.json({ post: updated, publishResult: result });
  });

  app.post("/api/admin/social-buzz/queue/:id/reject", authMiddleware, async (req, res) => {
    const id = req.params.id as string;
    const reviewedBy = (req.body as { reviewedBy?: string })?.reviewedBy;
    const updated = await updateCandidate(id, {
      status: "rejected",
      reviewedBy,
      reviewedAt: new Date().toISOString(),
    });
    if (!updated) return res.status(404).json({ error: "Not found" });
    return res.json({ post: updated });
  });

  app.get("/api/admin/social-buzz/status", authMiddleware, async (_req, res) => {
    return res.json({
      killSwitch: killSwitchActive(),
      autoPublishEnabled: process.env.SOCIAL_BUZZ_AUTO_PUBLISH_ENABLED === "true",
      dryRun: process.env.SOCIAL_BUZZ_DRY_RUN !== "false" && !process.env.META_PAGE_ACCESS_TOKEN,
      postsToday: await countPublishedOrPendingToday(),
      cap: dailyCap(),
    });
  });

  app.post("/api/admin/social-buzz/kill-switch", authMiddleware, async (req, res) => {
    const { enabled } = req.body as { enabled?: boolean };
    if (typeof enabled !== "boolean") return res.status(400).json({ error: "enabled must be boolean" });
    setKillSwitch(enabled);
    console.log(`[social-buzz] kill switch ${enabled ? "ENABLED" : "disabled"} via admin override`);
    return res.json({ ok: true, killSwitch: killSwitchActive() });
  });

  // In-process override for the daily post cap — same non-redeploy pattern
  // as the kill switch above. Resets to the SOCIAL_BUZZ_MAX_POSTS_PER_DAY
  // env default (or 3) on restart.
  app.post("/api/admin/social-buzz/cap", authMiddleware, async (req, res) => {
    const { cap } = req.body as { cap?: number };
    if (typeof cap !== "number" || !Number.isInteger(cap) || cap < 0) {
      return res.status(400).json({ error: "cap must be a non-negative integer" });
    }
    setDailyCap(cap);
    console.log(`[social-buzz] daily cap set to ${cap} via admin override`);
    return res.json({ ok: true, cap: dailyCap() });
  });

  // Debug-only: manually trigger a poll tick against real live data, useful for
  // verifying the detector/copywriter/queue flow without waiting for the
  // scheduled interval. Admin-gated like every other route here.
  app.post("/api/admin/social-buzz/run-once", authMiddleware, async (_req, res) => {
    try {
      await tick();
      return res.json({ ok: true });
    } catch (e) {
      return res.status(500).json({ error: String(e) });
    }
  });
}
