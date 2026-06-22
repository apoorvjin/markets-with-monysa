import type { Express } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { getDevicePlan, isPro } from "../plan-enforcement";

const _anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

const _cache = new Map<string, { data: object; ts: number }>();
const EXPOSURE_TTL = 24 * 60 * 60 * 1000;

export function registerExposureRoutes(app: Express): void {
  app.get("/api/exposure/analysis", async (req, res) => {
    const country = ((req.query.country as string) || "").trim();
    const sector = ((req.query.sector as string) || "").trim();
    const tariffRate = parseFloat((req.query.tariffRate as string) || "0");

    if (!country || !sector) {
      return res.status(400).json({ error: "country and sector are required" });
    }

    if (!isPro(getDevicePlan(req))) {
      return res.status(403).json({ error: "AI Tariff Analysis requires Pro plan.", code: "PLAN_REQUIRED" });
    }

    const key = `${country}_${sector}_${tariffRate}`;
    res.set("Cache-Control", "private, max-age=43200"); // 12h — Insight-gated, private
    const cached = _cache.get(key);
    if (cached && Date.now() - cached.ts < EXPOSURE_TTL) {
      return res.json(cached.data);
    }

    if (!_anthropic) {
      return res.json({ comps: [], summary: "AI analysis unavailable — ANTHROPIC_API_KEY not configured." });
    }

    try {
      const msg = await _anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 700,
        system: "You are a sell-side analyst. Return JSON only — no prose, no markdown fences.",
        messages: [{
          role: "user",
          content: `Country: ${country}. Sector: ${sector}. US tariff rate: ${tariffRate}%.
Return JSON exactly: { "comps": [{ "name": string, "ticker": string, "revenueExposurePct": number, "earningsImpactPct": number }], "summary": string }
List 4-6 major US-listed companies most exposed to this country+sector tariff.
revenueExposurePct = estimated % of company revenue derived from or dependent on this country.
earningsImpactPct = estimated EPS headwind from this tariff (negative number, e.g. -4.2).
summary = 2 sentences on the sector-level earnings impact of these tariffs.`,
        }],
      });

      const text = msg.content[0].type === "text" ? msg.content[0].text.trim() : "{}";

      let data: object;
      try {
        // Strip any accidental markdown fences
        const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
        data = JSON.parse(cleaned);
      } catch {
        console.error("Exposure analysis: failed to parse Haiku JSON:", text);
        data = { comps: [], summary: "Could not parse AI response." };
      }

      _cache.set(key, { data, ts: Date.now() });
      return res.json(data);
    } catch (err) {
      console.error("Exposure analysis error:", err);
      return res.status(500).json({ comps: [], summary: "AI analysis failed." });
    }
  });
}
