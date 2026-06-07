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
  const doc = await (pdfjs as any).getDocument({ data: new Uint8Array(buf), useSystemFonts: true }).promise;
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

// Corporate suffix anchors — used to locate the company name boundary in extracted text
const COMPANY_SUFFIXES = new Set(["INC", "CORP", "LLC", "LTD", "ETF", "FUND", "TRUST", "PLC"]);

// Common English stop-words that never appear in company names
const STOP_WORDS = new Set([
  "YOUR", "YOU", "THE", "OF", "FOR", "BY", "AT", "IN", "TO", "AND", "OR",
  "WITH", "FROM", "AN", "MY", "THEIR", "THIS", "THAT",
]);

// OCR noise patterns from adjacent PDF columns
const NOISE_TOKEN_RE = /urch|yea|yoa|yos|vos|nos|daw|aoont|unsol|amount|acct|brok|aclod/i;

const VOWELS = new Set("AEIOU");
function hasLongConsRun(word: string): boolean {
  let run = 0;
  for (const ch of word) {
    run = VOWELS.has(ch) ? 0 : run + 1;
    if (run >= 4) return true;
  }
  return false;
}

function isNoise(word: string): boolean {
  return NOISE_TOKEN_RE.test(word) || STOP_WORDS.has(word) || hasLongConsRun(word);
}

// Returns every distinct company name found in the lookback window.
// A single 300-char window may span multiple PDF rows (due to column bleed),
// so we scan all corporate suffixes left-to-right and emit one entry per anchor.
function extractAllCompanyNames(lookback: string): string[] {
  // Row layout: [row#] [description] [type] [date] [N/A] → amount
  const typeMatches = [...lookback.matchAll(TYPE_KEYWORD_RE)];
  const beforeType = typeMatches.length > 0
    ? lookback.slice(0, typeMatches[typeMatches.length - 1].index!)
    : lookback;

  const segment = beforeType.slice(-300);

  const cleaned = segment
    .replace(/\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4}/g, " ")  // dates
    .replace(/\b\d{1,3}\b/g, " ")                         // row numbers / small nums
    .replace(/\b\d{4,}\b/g, " ")                          // large standalone numbers
    .replace(/[^A-Za-z\s\-&]/g, " ")                      // keep letters
    .replace(/\b[A-Za-z]\b/g, " ")                        // lone letters
    .replace(/\bINC(?=[A-Z])/g, "INC ")                   // split INCCL → INC CL
    .replace(/\bCORP(?=[A-Z])/g, "CORP ")                 // split CORPA → CORP A
    .replace(/\s{2,}/g, " ")
    .trim()
    .toUpperCase();

  const words = cleaned.split(/\s+/).filter((w) => w.length >= 2);
  if (words.length === 0) return [];

  const results: string[] = [];

  // Scan every corporate suffix in order — each is an anchor for one company entry.
  for (let si = 0; si < words.length; si++) {
    if (!COMPANY_SUFFIXES.has(words[si])) continue;

    // Collect up to 2 post-suffix qualifiers (e.g. "COM", "CL", "CLASS").
    // Stop immediately at noise — it means we've crossed into the type column.
    const after: string[] = [];
    for (let i = si + 1; i < words.length && after.length < 2; i++) {
      const w = words[i];
      if (NOISE_TOKEN_RE.test(w) || w.length < 2) break;
      if (COMPANY_SUFFIXES.has(w)) break; // next company starts
      after.push(w);
    }

    // Walk backwards collecting the company name, stopping at the previous suffix
    // (that row's name is already captured by an earlier iteration).
    // Use break (not continue) on noise — the first bad word is a hard boundary.
    // "Transaction of your broker ADOBE INC": hitting YOUR stops the walk cleanly.
    const before: string[] = [];
    for (let i = si - 1; i >= 0 && before.length < 3; i--) {
      const w = words[i];
      if (COMPANY_SUFFIXES.has(w)) break; // previous row boundary
      if (w.length < 3) continue;         // skip lone letters / short tokens
      if (isNoise(w)) break;              // hard stop at first bad word
      before.unshift(w);
    }

    if (before.length > 0) {
      results.push([...before, words[si], ...after].join(" "));
    }
  }

  // Fallback: last 6 words (no corporate suffix — e.g. ETFs, crypto tickers)
  if (results.length === 0) {
    return [words.slice(-6).join(" ")];
  }

  return results;
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
      const descriptions = extractAllCompanyNames(lookback);
      for (const description of descriptions) {
        results.push({ description, type: txType, date: "", amount: label, amountMidpoint: mid, filingDate, source });
      }
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
    .slice(0, 7); // cap at 7 most recent — run on 512 MB worker machine via spawnFlyWorker()

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
const LOCK_TTL = 10 * 60; // 10 min — enough time to process 7 PDFs on a 512 MB worker

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

async function bustCache() {
  memCache = null;
  _lockFailTs = 0;
  _fetching = false; // allow immediate re-trigger from /refresh endpoint
  if (redis) {
    try { await redis.del(REDIS_KEY, LOCK_KEY); } catch {}
  }
}

// ── Fly.io ephemeral worker machine ──────────────────────────────────────────
// Spawns a temporary 1024 MB machine just for the PDF pipeline, then auto-destroys.
// Falls back to in-process if FLY_API_TOKEN / FLY_APP_NAME / FLY_MACHINE_ID absent.

let _lastWorkerMemoryMb: number | null = null;

async function spawnFlyWorker(): Promise<boolean> {
  const appName  = process.env.FLY_APP_NAME;
  const machineId = process.env.FLY_MACHINE_ID;
  const token    = process.env.FLY_API_TOKEN;
  if (!appName || !machineId || !token) return false;

  try {
    // Resolve current machine's image so the worker uses the same build.
    const infoResp = await fetch(
      `https://api.machines.dev/v1/apps/${appName}/machines/${machineId}`,
      { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000) },
    );
    if (!infoResp.ok) {
      console.warn(`[oge] could not fetch machine info: ${infoResp.status}`);
      return false;
    }
    const info = await infoResp.json() as { config?: { image?: string } };
    const image = info.config?.image;
    if (!image) { console.warn("[oge] machine image ref missing"); return false; }

    // Create ephemeral 1024 MB machine with worker flag.
    const createResp = await fetch(
      `https://api.machines.dev/v1/apps/${appName}/machines`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          config: {
            image,
            env: { OGE_WORKER_MODE: "1" },
            guest: { memory_mb: 1024, cpu_kind: "shared", cpus: 1 },
            auto_destroy: true,
            restart: { policy: "no" },
          },
        }),
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (!createResp.ok) {
      const body = await createResp.text();
      console.warn(`[oge] worker spawn failed: ${createResp.status} ${body.slice(0, 120)}`);
      return false;
    }
    const worker = await createResp.json() as { id: string; config?: { guest?: { memory_mb?: number } } };
    _lastWorkerMemoryMb = worker.config?.guest?.memory_mb ?? null;
    console.log(`[oge] spawned 1024 MB ephemeral worker ${worker.id} (actual: ${_lastWorkerMemoryMb} MB) — awaiting Redis result`);
    return true;
  } catch (e) {
    console.warn("[oge] worker spawn error:", (e as Error).message);
    return false;
  }
}

// ── Background pipeline ───────────────────────────────────────────────────────

let _fetching = false;

// Timestamp of the last failed lock acquisition — prevents hammering Redis with
// repeated lock checks on every GET while another machine holds the lock.
let _lockFailTs = 0;
const LOCK_COOLDOWN_MS = 5 * 60_000; // 5 min between retry attempts

function triggerPipeline() {
  if (_fetching) return;
  if (Date.now() - _lockFailTs < LOCK_COOLDOWN_MS) return;
  _fetching = true;

  spawnFlyWorker().then((spawned) => {
    if (spawned) {
      // Ephemeral 512 MB worker owns the pipeline + Redis write.
      // Main machines keep returning loading:true until getCached() finds data.
      // Safety: reset _fetching after 15 min in case the worker silently fails.
      setTimeout(() => { _fetching = false; }, 15 * 60_000);
      return;
    }

    // On Fly.io: NEVER fall back to in-process — pdfjs OOMs 256 MB machines.
    // If we reach here on Fly.io it means FLY_API_TOKEN is missing or invalid.
    if (process.env.FLY_APP_NAME) {
      console.error("[oge] worker spawn failed on Fly.io — set FLY_API_TOKEN secret. In-process pipeline disabled to prevent OOM.");
      _fetching = false;
      return;
    }

    // Local dev only: in-process pipeline (no Fly.io env, no memory constraint).
    acquireLock().then(async (acquired) => {
      if (!acquired) {
        console.log("[oge] another machine holds the pipeline lock — cooling down 5 min");
        _lockFailTs = Date.now();
        _fetching = false;
        return;
      }
      console.log("[oge] pipeline started (local in-process)");
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
  });
}

// ── Worker entry point (OGE_WORKER_MODE=1) ───────────────────────────────────
// Called by server/index.ts when the ephemeral 512 MB machine starts.

export async function runOgePipelineAndExit(): Promise<void> {
  console.log("[oge-worker] starting — 512 MB mode");
  const acquired = await acquireLock();
  if (!acquired) {
    console.log("[oge-worker] lock held by another worker — exiting");
    process.exit(0);
  }
  try {
    const txns = await fetchTrumpTransactions();
    await setCached(txns);
    console.log(`[oge-worker] complete — ${txns.length} transactions written to Redis`);
    await releaseLock();
    process.exit(0);
  } catch (e) {
    console.error("[oge-worker] failed:", (e as Error).message);
    await releaseLock();
    process.exit(1);
  }
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

  // Debug endpoint — shows env vars and tests Fly.io Machines API reachability.
  app.get("/api/oge/trump-transactions/config", async (_req, res) => {
    const appName   = process.env.FLY_APP_NAME;
    const machineId = process.env.FLY_MACHINE_ID;
    const token     = process.env.FLY_API_TOKEN;

    let machineApiStatus: string | number = "not tested";
    let machineApiImage: string | null = null;
    if (appName && machineId && token) {
      try {
        const r = await fetch(
          `https://api.machines.dev/v1/apps/${appName}/machines/${machineId}`,
          { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8_000) },
        );
        machineApiStatus = r.status;
        if (r.ok) {
          const d = await r.json() as { config?: { image?: string } };
          machineApiImage = d.config?.image ?? null;
        } else {
          machineApiImage = await r.text();
        }
      } catch (e) {
        machineApiStatus = `error: ${(e as Error).message}`;
      }
    }

    res.json({
      hasFlyAppName:   !!appName,
      hasFlyMachineId: !!machineId,
      hasFlyApiToken:  !!token,
      hasRedis:        !!redis,
      fetching:             _fetching,
      lockFailTs:           _lockFailTs ? new Date(_lockFailTs).toISOString() : null,
      flyAppName:           appName ?? null,
      lastWorkerMemoryMb:   _lastWorkerMemoryMb,
      machineApiStatus,
      machineApiImage,
    });
  });

  // Force-bust cache and re-run the PDF pipeline immediately.
  // Hit this once after deploying parser fixes to avoid waiting 24h.
  app.post("/api/oge/trump-transactions/refresh", async (_req, res) => {
    await bustCache();
    triggerPipeline();
    res.json({ ok: true, message: "Cache cleared — pipeline running in background" });
  });

  app.get("/api/oge/trump-transactions", async (_req, res) => {
    const cached = await getCached();
    if (cached) {
      const pipelineRanAt = memCache ? new Date(memCache.ts).toISOString() : new Date().toISOString();
      return res.json({ transactions: cached, total: cached.length, lastUpdated: pipelineRanAt });
    }

    if (_fetching) {
      return res.json({ transactions: [], total: 0, loading: true, lastUpdated: null });
    }

    // Should not reach here normally — startup already triggered the pipeline.
    triggerPipeline();
    res.json({ transactions: [], total: 0, loading: true, lastUpdated: null });
  });
}
