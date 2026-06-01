import type { Express } from "express";
import { Redis } from "@upstash/redis";

// ── Cache ─────────────────────────────────────────────────────────────────────
// Two-layer: Redis (persistent across restarts) + in-memory (fast, avoids
// a Redis round-trip on every request).  Redis is optional — if the env vars
// are absent (local dev) the in-memory layer works standalone.

const CACHE_TTL_S  = 24 * 60 * 60;        // 24 h in seconds (Redis TTL)
const CACHE_TTL_MS = CACHE_TTL_S * 1000;  // 24 h in ms (in-memory check)
const REDIS_KEY    = "oge:trump-transactions";

const redis = process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
  ? new Redis({
      url:   process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    })
  : null;

// In-memory layer
let memCache: { data: OgeTransaction[]; ts: number } | null = null;

function getMemCached(): OgeTransaction[] | null {
  if (!memCache || Date.now() - memCache.ts > CACHE_TTL_MS) return null;
  return memCache.data;
}
function setMemCached(data: OgeTransaction[]) {
  memCache = { data, ts: Date.now() };
}

async function getCached(): Promise<OgeTransaction[] | null> {
  // 1. In-memory hit — fastest path
  const mem = getMemCached();
  if (mem) return mem;

  // 2. Redis hit — populate in-memory then return
  if (redis) {
    try {
      const raw = await redis.get<OgeTransaction[]>(REDIS_KEY);
      if (raw) {
        setMemCached(raw);
        return raw;
      }
    } catch (e) {
      console.warn("[oge] redis get failed:", (e as Error).message);
    }
  }

  return null;
}

async function setCached(data: OgeTransaction[]) {
  setMemCached(data);
  if (redis) {
    try {
      await redis.set(REDIS_KEY, data, { ex: CACHE_TTL_S });
    } catch (e) {
      console.warn("[oge] redis set failed:", (e as Error).message);
    }
  }
}

// ── Amount ranges (identical to STOCK Act ranges) ─────────────────────────────

const AMOUNT_MAP: Record<string, number> = {
  "$1,001 - $15,000":         8_000,
  "$15,001 - $50,000":        32_500,
  "$50,001 - $100,000":       75_000,
  "$100,001 - $250,000":      175_000,
  "$250,001 - $500,000":      375_000,
  "$500,001 - $1,000,000":    750_000,
  "$1,000,001 - $5,000,000":  3_000_000,
  "Over $5,000,000":          7_500_000,
};

// Fuzzy matchers keyed by the distinguishing numbers (tolerates OCR spacing/char noise)
const FUZZY_AMOUNTS: Array<{ re: RegExp; label: string; mid: number }> = [
  { re: /[Oo]ver\s+[\$Ss][\s\d,\.]+000[\s,\.]?000/i,                                   label: "Over $5,000,000",         mid: 7_500_000 },
  { re: /[\$Ss][\s\d,\.oOlI]*1[\s,\.]?000[\s,\.]?0+1[\s\S]{0,8}[\$Ss][\s\d,\.oOlI]*5[\s,\.]?000/i, label: "$1,000,001 - $5,000,000",  mid: 3_000_000 },
  { re: /[\$Ss][\s\d,\.oOlI]*500[\s,\.]?0+1[\s\S]{0,8}[\$Ss][\s\d,\.oOlI]*1[\s,\.]?000/i,          label: "$500,001 - $1,000,000",    mid: 750_000 },
  { re: /[\$Ss][\s\d,\.oOlI]*250[\s,\.]?0+1[\s\S]{0,8}[\$Ss][\s\d,\.oOlI]*500[\s,\.]?000/i,        label: "$250,001 - $500,000",      mid: 375_000 },
  { re: /[\$Ss][\s\d,\.oOlI]*100[\s,\.]?0+1[\s\S]{0,8}[\$Ss][\s\d,\.oOlI]*250[\s,\.]?000/i,        label: "$100,001 - $250,000",      mid: 175_000 },
  { re: /[\$Ss][\s\d,\.oOlI]*50[\s,\.]?0+1[\s\S]{0,8}[\$Ss][\s\d,\.oOlI]*100[\s,\.]?000/i,         label: "$50,001 - $100,000",       mid: 75_000 },
  { re: /[\$Ss][\s\d,\.oOlI]*15[\s,\.]?0+1[\s\S]{0,8}[\$Ss][\s\d,\.oOlI]*50[\s,\.]?000/i,          label: "$15,001 - $50,000",        mid: 32_500 },
  { re: /[\$Ss][\s\d,\.oOlI]*1[\s,\.]?0+1[\s\S]{0,8}[\$Ss][\s\d,\.oOlI]*15[\s,\.]?000/i,           label: "$1,001 - $15,000",         mid: 8_000 },
];

function matchAmount(text: string): { label: string; mid: number } | null {
  for (const { re, label, mid } of FUZZY_AMOUNTS) {
    if (re.test(text)) return { label, mid };
  }
  return null;
}

// ── PDF text extraction (pdfjs-dist, already installed) ───────────────────────

async function extractPdfText(buf: Buffer): Promise<string> {
  // Dynamic import — pdfjs-dist is ESM-only
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await (pdfjs as any).getDocument({ data: new Uint8Array(buf) }).promise;
  let text = "";
  try {
    for (let p = 1; p <= (doc as any).numPages; p++) {
      const page = await (doc as any).getPage(p);
      const content = await page.getTextContent();
      text += (content.items as any[]).map((i: any) => i.str ?? "").join(" ") + "\n";
    }
  } finally {
    // Explicitly release pdfjs memory — important on constrained servers
    await (doc as any).destroy();
  }
  return text;
}

// ── Transaction parser ────────────────────────────────────────────────────────

export interface OgeTransaction {
  description: string;
  type: "purchase" | "sale" | "exchange";
  date: string;          // always "" — OCR dates are unreliable; UI shows filingDate only
  amount: string;
  amountMidpoint: number;
  filingDate: string;    // ISO date from OGE API index — always reliable
  source: string;        // PDF filename
}

function detectType(window: string): "purchase" | "sale" | "exchange" {
  const s = window.toLowerCase();
  if (/exch/.test(s)) return "exchange";
  if (/\bsal\b|nle\b|sell/.test(s)) return "sale";
  return "purchase"; // Trump's 278-T is predominantly purchases
}

// OCR variants of "sale", "purchase", "exchange" in the type column.
// Uses a loose prefix-match to tolerate character substitutions (salo, lourch, etc.)
const TYPE_KEYWORD_RE = /\b[a-z]?(?:sal\w*|sell|purch\w+|nurch\w+|ourch\w+|durch\w+|exch\w+)\b/gi;

function extractCompanyName(lookback: string): string {
  // Row layout: [row#] [description] [type] [date] [N/A] → amount
  // Strategy: anchor on the last transaction-type keyword, then take
  // the text BEFORE it (that's where the description lives).
  const typeMatches = [...lookback.matchAll(TYPE_KEYWORD_RE)];
  const beforeType = typeMatches.length > 0
    ? lookback.slice(0, typeMatches[typeMatches.length - 1].index!)
    : lookback;

  // Take last 160 chars of the pre-type segment (one row's description worth)
  const segment = beforeType.slice(-160);

  const cleaned = segment
    .replace(/\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4}/g, " ")  // dates
    .replace(/\b\d{1,3}\b/g, " ")                         // row numbers / small nums
    .replace(/\b\d{4,}\b/g, " ")                          // large standalone numbers
    .replace(/[^A-Za-z\s\-&]/g, " ")                      // keep letters
    .replace(/\b[A-Za-z]\b/g, " ")                        // lone letters
    .replace(/\s{2,}/g, " ")
    .trim()
    .toUpperCase();

  const words = cleaned.split(/\s+/).filter((w) => w.length >= 2);
  if (words.length === 0) return "";
  return words.slice(-6).join(" ");
}

function parseTransactionsFromText(
  text: string,
  minMidpoint: number,
  filingDate: string,
  source: string,
): OgeTransaction[] {
  const results: OgeTransaction[] = [];

  for (const { re, label, mid } of FUZZY_AMOUNTS) {
    if (mid < minMidpoint) continue;

    const localRe = new RegExp(re.source, "gi");
    let m;
    while ((m = localRe.exec(text)) !== null) {
      const lookback = text.slice(Math.max(0, m.index - 300), m.index);
      const txType = detectType(lookback.slice(-150));
      const description = extractCompanyName(lookback) || label;
      results.push({ description, type: txType, date: "", amount: label, amountMidpoint: mid, filingDate, source });
    }
  }

  // Deduplicate: same filing + amount + type + description
  const seen = new Set<string>();
  return results
    .filter((t) => {
      // Drop pure-noise entries
      if (t.description === t.amount) return false; // fell back to amount label
      if (!t.description.split(" ").some((w) => w.length >= 5)) return false; // no word ≥ 5 chars
      // Drop descriptions made entirely of transaction-type garbage words
      const uniqueWords = new Set(t.description.split(" ").map((w) => w.toLowerCase()));
      const noiseWords = new Set(["purchase", "sale", "exchange", "ourchase", "nurchl", "yes", "vos", "yoa", "yos", "yea", "nos", "non"]);
      if ([...uniqueWords].every((w) => noiseWords.has(w))) return false;
      const key = `${t.filingDate}|${t.amount}|${t.type}|${t.description}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => b.filingDate.localeCompare(a.filingDate));
}

// ── OGE index fetch + PDF pipeline ───────────────────────────────────────────

const OGE_API = "https://extapps2.oge.gov/201/Presiden.nsf/API.xsp/v2/rest?draw=1&start=0&length=16747";
const OGE_REFERER = "https://www.oge.gov/web/OGE.nsf/Officials%20Individual%20Disclosures%20Search%20Collection?OpenForm";
const MIN_AMOUNT = 100_001;

async function fetchTrumpTransactions(): Promise<OgeTransaction[]> {
  // Step 1 — fetch OGE index
  const indexResp = await fetch(OGE_API, {
    headers: {
      "User-Agent": "monysa-app/1.0",
      "X-Requested-With": "XMLHttpRequest",
    },
    signal: AbortSignal.timeout(20_000),
  });
  if (!indexResp.ok) throw new Error(`OGE index ${indexResp.status}`);

  const index = await indexResp.json() as { data: Array<Record<string, string>> };
  const rows = Array.isArray(index.data) ? index.data : [];

  // Step 2 — filter to Trump 278 Transaction filings, sorted newest first
  const cutoff = new Date(Date.now() - 365 * 86_400_000).toISOString().slice(0, 10);
  const hrefRe = /href='([^']+\.pdf)'/i;
  const filings = rows
    .filter((r) =>
      typeof r === "object" &&
      r.name === "Trump, Donald J" &&
      /278\s+Transaction/i.test(r.type ?? "") &&
      (r.docDate ?? "") >= cutoff,
    )
    .map((r) => ({
      pdfUrl:     (hrefRe.exec(r.type ?? "") ?? [])[1] ?? "",
      filingDate: (r.docDate ?? "").slice(0, 10),
      source:     (r.type ?? "").match(/Trump[^']+\.pdf/i)?.[0] ?? "278T.pdf",
    }))
    .filter((f) => f.pdfUrl)
    .sort((a, b) => b.filingDate.localeCompare(a.filingDate))
    .slice(0, 7); // cap at 7 most recent — pdfjs is memory-heavy on constrained servers

  if (filings.length === 0) throw new Error("No Trump 278-T filings found in OGE index");
  console.log(`[oge] found ${filings.length} Trump 278-T filings in last 12 months`);

  // Step 3 — download + parse each PDF
  const allTransactions: OgeTransaction[] = [];
  const globalSeen = new Set<string>();

  for (const filing of filings) {
    try {
      const pdfResp = await fetch(filing.pdfUrl, {
        headers: { "User-Agent": "monysa-app/1.0", Referer: OGE_REFERER },
        signal: AbortSignal.timeout(30_000),
      });
      if (!pdfResp.ok) {
        console.warn(`[oge] PDF ${pdfResp.status} for ${filing.source}`);
        continue;
      }

      const buf = Buffer.from(await pdfResp.arrayBuffer());
      const text = await extractPdfText(buf);

      const txns = parseTransactionsFromText(text, MIN_AMOUNT, filing.filingDate, filing.source);
      console.log(`[oge] ${filing.source}: extracted ${txns.length} txns ≥$100K`);

      for (const t of txns) {
        const key = `${t.filingDate}|${t.amount}|${t.type}|${t.description}`;
        if (!globalSeen.has(key)) {
          globalSeen.add(key);
          allTransactions.push(t);
        }
      }
    } catch (e) {
      console.warn(`[oge] failed to process ${filing.source}:`, (e as Error).message);
    }
  }

  return allTransactions.sort((a, b) => b.filingDate.localeCompare(a.filingDate));
}

// ── Distributed lock (prevents multiple machines running pipeline at once) ────

const LOCK_KEY = "oge:pipeline-lock";
const LOCK_TTL = 10 * 60; // 10 min — enough time to process 7 PDFs

async function acquireLock(): Promise<boolean> {
  if (!redis) return true; // single-machine dev mode, always proceed
  try {
    const result = await redis.set(LOCK_KEY, "1", { nx: true, ex: LOCK_TTL });
    return result === "OK";
  } catch {
    return true; // Redis unavailable — let this machine proceed
  }
}

async function releaseLock() {
  if (!redis) return;
  try { await redis.del(LOCK_KEY); } catch {}
}

// ── Background pipeline ───────────────────────────────────────────────────────

let _fetching = false;

function triggerPipeline() {
  if (_fetching) return;
  _fetching = true;
  acquireLock().then(async (acquired) => {
    if (!acquired) {
      console.log("[oge] another machine already running pipeline — skipping");
      _fetching = false;
      return;
    }
    console.log("[oge] pipeline started");
    try {
      const txns = await fetchTrumpTransactions();
      await setCached(txns);
      console.log(`[oge] pipeline complete — ${txns.length} transactions cached`);
    } catch (e) {
      console.error("[oge] pipeline failed:", (e as Error).message);
    } finally {
      await releaseLock();
      _fetching = false;
    }
  });
}

// ── Route registration ────────────────────────────────────────────────────────

export function registerOgeRoutes(app: Express) {
  // On startup: check Redis — if warm, load into memory and we're done.
  // If cold, start the pipeline in the background.
  getCached().then((cached) => {
    if (cached) {
      console.log(`[oge] restored ${cached.length} transactions from Redis`);
    } else {
      triggerPipeline();
    }
  }).catch(() => triggerPipeline());

  app.get("/api/oge/trump-transactions", async (_req, res) => {
    const cached = await getCached();
    if (cached) {
      return res.json({ transactions: cached, total: cached.length, lastUpdated: new Date().toISOString() });
    }

    if (_fetching) {
      return res.json({ transactions: [], total: 0, loading: true, lastUpdated: null });
    }

    // Should not reach here normally — startup already triggered the pipeline.
    triggerPipeline();
    res.json({ transactions: [], total: 0, loading: true, lastUpdated: null });
  });
}
