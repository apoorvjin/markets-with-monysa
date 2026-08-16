// Classifies which cost bucket a supplier's typical business customer would
// use to account for spend with them (COGS/CAPEX/RD/SGA) — the "cost bucket
// classification" step in the SPLC derivation math (edgeValue / bucketTotal).
// Classified once per entity from name + SIC code via Haiku, then cached
// forever (Firestore when configured, in-process Map otherwise) — this
// never changes for a given company, so there's no TTL to reason about.

import Anthropic from "@anthropic-ai/sdk";
import { adminFirestore } from "../firebase-admin";

const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

export type CostBucket = "COGS" | "CAPEX" | "RD" | "SGA";
const VALID_BUCKETS: CostBucket[] = ["COGS", "CAPEX", "RD", "SGA"];

export interface CostBucketResult {
  bucket: CostBucket;
  confidence: number; // Haiku's own stated confidence, 0-1 — informational only
}

const memCache = new Map<string, CostBucketResult>();

export async function classifyCostBucket(
  cik: string,
  companyName: string,
  sic?: string,
): Promise<CostBucketResult | null> {
  const db = adminFirestore();

  if (db) {
    const snap = await db.collection("splcEntities").doc(cik).get();
    const cached = snap.data()?.costBucket as CostBucketResult | undefined;
    if (cached) return cached;
  } else if (memCache.has(cik)) {
    return memCache.get(cik)!;
  }

  if (!anthropic) return null;

  let result: CostBucketResult;
  try {
    const msg = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 200,
      system:
        "You classify companies by which cost bucket a typical business customer would use " +
        "to account for spend with them. COGS: components, raw materials, contract " +
        "manufacturing, commodities. CAPEX: capital equipment, construction, servers, " +
        "industrial machinery. RD: contract research (CRO/CDMO), IP licensing, research " +
        "services. SGA: advertising, staffing, consulting, enterprise SaaS, professional " +
        "services. Pick the single bucket that best matches most of the company's revenue.",
      messages: [{
        role: "user",
        content: `Company: ${companyName}${sic ? ` (SEC SIC code ${sic})` : ""}`,
      }],
      output_config: {
        format: {
          type: "json_schema",
          schema: {
            type: "object",
            properties: {
              bucket: { type: "string", enum: VALID_BUCKETS },
              confidence: { type: "number", description: "0-1" },
            },
            required: ["bucket", "confidence"],
            additionalProperties: false,
          },
        },
      },
    });

    const block = msg.content[0];
    if (!block || block.type !== "text") return null;
    const parsed = JSON.parse(block.text) as { bucket: string; confidence: number };
    if (!VALID_BUCKETS.includes(parsed.bucket as CostBucket)) return null;
    if (!Number.isFinite(parsed.confidence)) return null;

    result = { bucket: parsed.bucket as CostBucket, confidence: parsed.confidence };
  } catch (e) {
    console.error(`[splc] cost-bucket classification failed for ${companyName} (${cik}):`, (e as Error).message);
    return null;
  }

  if (db) {
    await db.collection("splcEntities").doc(cik).set(
      { cik, name: companyName, costBucket: result },
      { merge: true },
    );
  } else {
    memCache.set(cik, result);
  }

  return result;
}
