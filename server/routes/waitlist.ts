import type { Express } from "express";
import { adminFirestore } from "../lib/firebase-admin";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// In-memory fallback when Firestore isn't configured (local dev). Bounded so a
// flood can't grow it unbounded.
const memWaitlist = new Set<string>();

export function registerWaitlistRoutes(app: Express): void {
  // POST /api/waitlist  { email, source? }
  // Additive, unauthenticated. Stores a launch-notification signup. Deduped by
  // email. Degrades gracefully to an in-memory set when Firestore is absent.
  app.post("/api/waitlist", async (req, res) => {
    const { email, source } = (req.body ?? {}) as { email?: string; source?: string };
    const clean = String(email ?? "").trim().toLowerCase();

    if (!EMAIL_RE.test(clean) || clean.length > 254) {
      return res.status(400).json({ error: "Invalid email" });
    }

    const db = adminFirestore();
    if (db) {
      try {
        // Doc id = email so re-submits are idempotent, not duplicates.
        const id = clean.replace(/[^a-z0-9@._-]/g, "_");
        await db.collection("waitlist").doc(id).set(
          {
            email: clean,
            source: typeof source === "string" ? source.slice(0, 40) : "site",
            createdAt: new Date().toISOString(),
          },
          { merge: true },
        );
        return res.json({ ok: true });
      } catch (e) {
        console.error("[waitlist] Firestore write failed:", e);
        return res.status(500).json({ error: "Could not save. Try again." });
      }
    }

    if (memWaitlist.size < 10_000) memWaitlist.add(clean);
    console.log(`[waitlist] signup (in-memory, no Firestore): ${clean}`);
    return res.json({ ok: true });
  });
}
