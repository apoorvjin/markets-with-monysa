import type { Express } from "express";
import { adminFirestore } from "../lib/firebase-admin";

const CACHE_TTL_MS = 30 * 60 * 1000; // matches the nightly-batch cadence; no point polling faster
const cache = new Map<string, { data: unknown; ts: number }>();

// `no-cache` means "revalidate before reusing", NOT "don't cache" — the browser
// still stores the body and Express's weak ETag turns the check into a cheap
// 304. A long max-age was actively harmful here: the nightly batch can change
// both the contents AND the response shape, and a client holding a stale copy
// has no way to discover that until the timer expires. It presented as an
// empty company list with no error, which is the worst possible failure mode.
// Both payloads are small, so revalidation costs far less than being wrong.
const REVALIDATE = "private, no-cache";

export function registerSplcRoutes(app: Express): void {
  // Registered before the :symbol route below — Express matches route
  // literals before params in registration order, so this must come first
  // or "/api/splc/universe" would be swallowed as ?symbol=universe.
  //
  // The universe is discovered by the nightly batch (whoever actually
  // discloses a named counterparty), not a curated list — see
  // lib/splc/derivation-batch.ts.
  app.get("/api/splc/universe", async (_req, res) => {
    const cached = cache.get("__universe__");
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
      res.set("Cache-Control", REVALIDATE);
      return res.json(cached.data);
    }

    const db = adminFirestore();
    let data: { companies: unknown[]; lastUpdated?: string } = { companies: [] };
    if (db) {
      const snap = await db.collection("splcMeta").doc("universe").get();
      if (snap.exists) data = snap.data() as { companies: unknown[]; lastUpdated?: string };
    }

    cache.set("__universe__", { data, ts: Date.now() });
    res.set("Cache-Control", REVALIDATE);
    res.json(data);
  });

  app.get("/api/splc/:symbol", async (req, res) => {
    const symbol = req.params.symbol.toUpperCase();
    const cached = cache.get(symbol);
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
      res.set("Cache-Control", REVALIDATE);
      return res.json(cached.data);
    }

    const db = adminFirestore();
    if (!db) return res.json({ ticker: symbol, found: false, suppliers: [], customers: [], coverage: null });

    const snap = await db.collection("splcGraph").doc(symbol).get();
    const data = snap.exists
      ? { ticker: symbol, found: true, ...snap.data() }
      : { ticker: symbol, found: false, suppliers: [], customers: [], coverage: null };

    cache.set(symbol, { data, ts: Date.now() });
    res.set("Cache-Control", REVALIDATE);
    res.json(data);
  });
}
