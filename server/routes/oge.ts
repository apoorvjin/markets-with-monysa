import type { Express } from "express";
import { Redis } from "@upstash/redis";
import Anthropic from "@anthropic-ai/sdk";

// ── Cache ─────────────────────────────────────────────────────────────────────
// Two-layer: Redis (persistent across restarts) + in-memory (fast, avoids
// a Redis round-trip on every request).  Redis is optional — if the env vars
// are absent (local dev) the in-memory layer works standalone.

const CACHE_TTL_S  = 7 * 24 * 60 * 60;    // 7 d in seconds (Redis TTL)
const CACHE_TTL_MS = CACHE_TTL_S * 1000;  // 7 d in ms (in-memory check)
const REDIS_KEY    = "oge:trump-transactions";
const META_KEY     = "oge:pipeline-meta"; // diagnostics: when/why the pipeline last actually ran
const FAIL_KEY     = "oge:pipeline-fail"; // set when a run throws — suppresses re-spawning a worker per GET
const IMPORT_KEY   = "oge:manual-import"; // CSV-imported rows for filings the pipeline can't read (scanned PDFs)
const IMPORT_MEM_TTL_MS = 5 * 60_000;     // in-memory memo — imports change only on an admin POST
const FAIL_TTL_S   = 60 * 60;             // 1 h — a hard failure (WAF block, parser break) won't clear in minutes

const redis = process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
  ? new Redis({
      url:   process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    })
  : null;

interface PipelineMeta {
  lastRunAt: string;      // ISO timestamp — when the pipeline finished writing this data
  triggerSource: string;  // "startup" | "admin-refresh" | "get-miss" | "worker" (spawnFlyWorker fallback)
  durationMs: number;
  txnCount: number;
}

interface PipelineFail {
  at: string;     // ISO timestamp of the failed run
  error: string;  // message thrown by fetchTrumpTransactions()
}

// In-memory layer
let memCache: { data: OgeTransaction[]; ts: number } | null = null;
let memMeta: PipelineMeta | null = null;
let memFail: PipelineFail | null = null;
let memImports: { data: OgeTransaction[]; ts: number } | null = null;

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

async function setCached(data: OgeTransaction[], run: { triggerSource: string; durationMs: number }) {
  setMemCached(data);
  const meta: PipelineMeta = { lastRunAt: new Date().toISOString(), txnCount: data.length, ...run };
  memMeta = meta;
  memFail = null;
  if (redis) {
    try {
      await redis.set(REDIS_KEY, data, { ex: CACHE_TTL_S });
      await redis.set(META_KEY, meta, { ex: CACHE_TTL_S });
      await redis.del(FAIL_KEY);
    } catch (e) {
      console.warn("[oge] redis set failed:", (e as Error).message);
    }
  }
}

// Records a failed run so the next cache-miss GET doesn't spawn another doomed worker.
async function setFailure(error: string) {
  const fail: PipelineFail = { at: new Date().toISOString(), error };
  memFail = fail;
  if (redis) {
    try { await redis.set(FAIL_KEY, fail, { ex: FAIL_TTL_S }); } catch (e) {
      console.warn("[oge] redis fail set failed:", (e as Error).message);
    }
  }
}

// Redis is authoritative when present — its TTL is the cooldown. memFail is the
// local-dev fallback and needs its own expiry check.
async function getFailure(): Promise<PipelineFail | null> {
  if (redis) {
    try { return (await redis.get<PipelineFail>(FAIL_KEY)) ?? null; } catch { return null; }
  }
  if (!memFail) return null;
  return Date.now() - Date.parse(memFail.at) < FAIL_TTL_S * 1000 ? memFail : null;
}

// Best-effort — only used to label the freshness timestamp, never blocks a response.
async function getMeta(): Promise<PipelineMeta | null> {
  if (memMeta) return memMeta;
  if (redis) {
    try {
      const raw = await redis.get<PipelineMeta>(META_KEY);
      if (raw) { memMeta = raw; return raw; }
    } catch (e) {
      console.warn("[oge] redis meta get failed:", (e as Error).message);
    }
  }
  return null;
}

// Identity of a transaction — same key the pipeline dedupes filings with, so an
// imported row can never duplicate one the LLM already extracted.
function txnKey(t: OgeTransaction): string {
  return `${t.filingDate}|${t.date}|${t.amount}|${t.type}|${t.description}`;
}

// Manually imported rows. Stored separately from REDIS_KEY and with no TTL: a
// pipeline run overwrites REDIS_KEY wholesale, and these must survive that.
async function getImports(): Promise<OgeTransaction[]> {
  if (memImports && Date.now() - memImports.ts < IMPORT_MEM_TTL_MS) return memImports.data;
  if (!redis) return memImports?.data ?? [];
  try {
    const raw = (await redis.get<OgeTransaction[]>(IMPORT_KEY)) ?? [];
    memImports = { data: raw, ts: Date.now() };
    return raw;
  } catch (e) {
    console.warn("[oge] redis import get failed:", (e as Error).message);
    return memImports?.data ?? [];
  }
}

async function saveImports(data: OgeTransaction[]) {
  memImports = { data, ts: Date.now() };
  if (redis) {
    try { await redis.set(IMPORT_KEY, data); } catch (e) {
      console.warn("[oge] redis import set failed:", (e as Error).message);
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

const MIN_AMOUNT = 100_001;

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

// ── Transaction parser (LLM-structured) ───────────────────────────────────────

export interface OgeTransaction {
  description: string;
  type: "purchase" | "sale" | "exchange";
  date: string;          // ISO YYYY-MM-DD transaction date, read from the PDF row by the LLM
  amount: string;
  amountMidpoint: number;
  filingDate: string;    // ISO date from OGE API index — always reliable
  source: string;        // PDF filename
}

const _anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

// Only brackets at/above MIN_AMOUNT are legal LLM output — enforced via schema enum
// so the model can't return a below-floor row even if it wanted to.
const ALLOWED_AMOUNTS = Object.entries(AMOUNT_MAP)
  .filter(([, mid]) => mid >= MIN_AMOUNT)
  .map(([label]) => label);

// ── CSV import ────────────────────────────────────────────────────────────────
// For filings the pipeline physically cannot read — e.g. Trump-08.12.2026-278T.pdf
// is a 34-page image scan whose text layer yields 158 characters. Rows are extracted
// externally and posted here; they are still real OGE data and keep the real PDF
// filename in `source`, so provenance is preserved.

// Minimal RFC4180 split — fields may be quoted and contain commas ("$1,000,001 - $5,000,000").
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out.map((f) => f.trim());
}

// Rebuild the bracket label from the two dollar figures, so mojibake ("$1,000,001â$5,000,000"),
// en/em dashes and "to" all land on a real AMOUNT_MAP key. Returns null if it isn't a real bracket.
function normaliseAmount(raw: string): string | null {
  const s = raw.trim();
  if (AMOUNT_MAP[s] !== undefined) return s;
  if (/over\s*\$\s*5,?000,?000/i.test(s)) return "Over $5,000,000";
  const nums = s.match(/\$[\d,]+/g);
  if (nums?.length === 2) {
    const key = `${nums[0]} - ${nums[1]}`;
    if (AMOUNT_MAP[key] !== undefined) return key;
  }
  return null;
}

// Accepts M/D/YY, M/D/YYYY or an already-ISO date.
function normaliseDate(raw: string): string | null {
  const s = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(s);
  if (!m) return null;
  const [, mo, d, y] = m as unknown as [string, string, string, string];
  return `${y.length === 2 ? `20${y}` : y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

const CSV_COLUMNS = {
  description: ["description", "purchase", "asset", "name"],
  date:        ["date", "transaction_date"],
  amount:      ["reported_amount", "amount"],
  type:        ["type", "transaction_type"],
};

interface CsvParseResult {
  rows: OgeTransaction[];
  skipped: Array<{ line: number; reason: string; raw: string }>;
}

function parseImportCsv(csv: string, filingDate: string, source: string): CsvParseResult {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length < 2) throw new Error("CSV needs a header row and at least one data row");

  const header = splitCsvLine(lines[0]!).map((h) => h.toLowerCase());
  const col = (aliases: string[]) => header.findIndex((h) => aliases.includes(h));
  const iDesc = col(CSV_COLUMNS.description);
  const iDate = col(CSV_COLUMNS.date);
  const iAmt  = col(CSV_COLUMNS.amount);
  const iType = col(CSV_COLUMNS.type); // optional — defaults to "purchase"

  const missing = [
    iDesc < 0 && `description (one of: ${CSV_COLUMNS.description.join(", ")})`,
    iDate < 0 && `date (one of: ${CSV_COLUMNS.date.join(", ")})`,
    iAmt  < 0 && `amount (one of: ${CSV_COLUMNS.amount.join(", ")})`,
  ].filter(Boolean);
  if (missing.length) throw new Error(`CSV missing column(s): ${missing.join("; ")}`);

  const rows: OgeTransaction[] = [];
  const skipped: CsvParseResult["skipped"] = [];

  for (let i = 1; i < lines.length; i++) {
    const raw = lines[i]!;
    const f = splitCsvLine(raw);
    const skip = (reason: string) => skipped.push({ line: i + 1, reason, raw });

    const description = (f[iDesc] ?? "").trim();
    if (!description) { skip("empty description"); continue; }

    const date = normaliseDate(f[iDate] ?? "");
    if (!date) { skip(`unparseable date ${JSON.stringify(f[iDate] ?? "")}`); continue; }

    const amount = normaliseAmount(f[iAmt] ?? "");
    if (!amount) { skip(`unrecognised amount bracket ${JSON.stringify(f[iAmt] ?? "")}`); continue; }

    const amountMidpoint = AMOUNT_MAP[amount]!;
    if (amountMidpoint < MIN_AMOUNT) { skip(`below $100K floor (${amount})`); continue; }

    const rawType = (iType >= 0 ? f[iType] ?? "" : "").trim().toLowerCase();
    const type: OgeTransaction["type"] =
      rawType === "sale" || rawType === "exchange" || rawType === "purchase" ? rawType : "purchase";

    rows.push({ description, type, date, amount, amountMidpoint, filingDate, source });
  }

  return { rows, skipped };
}

interface RawLLMTransaction {
  description: string;
  type: string;
  date: string;
  amount: string;
}

async function structureTransactionsWithLLM(
  text: string,
  filingDate: string,
  source: string,
): Promise<OgeTransaction[]> {
  if (!_anthropic) {
    console.warn("[oge] ANTHROPIC_API_KEY not configured — skipping LLM structuring");
    return [];
  }

  let raw: RawLLMTransaction[];
  try {
    const stream = _anthropic.messages.stream({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 32000,
      system: "You extract stock transaction rows from OCR'd OGE Form 278-T financial disclosure text. The OCR has errors (e.g. \"lourchaso\" for \"purchase\", \"salo\" for \"sale\", garbled company names) — use your knowledge of real public companies and securities to correct them.",
      messages: [{
        role: "user",
        content: `Extract every transaction row in this OGE Form 278-T text whose disclosed amount range is $100,001 or greater. For each row return the cleaned company/security description, the transaction type, the transaction date shown in that row (not a filing date), and its amount range label exactly as one of the allowed values.\n\nText:\n${text}`,
      }],
      output_config: {
        format: {
          type: "json_schema",
          schema: {
            type: "object",
            properties: {
              transactions: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    description: { type: "string" },
                    type: { type: "string", enum: ["purchase", "sale", "exchange"] },
                    date: { type: "string", description: "ISO 8601 date, YYYY-MM-DD" },
                    amount: { type: "string", enum: ALLOWED_AMOUNTS },
                  },
                  required: ["description", "type", "date", "amount"],
                  additionalProperties: false,
                },
              },
            },
            required: ["transactions"],
            additionalProperties: false,
          },
        },
      },
    });

    const msg = await stream.finalMessage();
    const block = msg.content[0];
    if (!block || block.type !== "text") return [];
    raw = (JSON.parse(block.text) as { transactions: RawLLMTransaction[] }).transactions;
  } catch (e) {
    console.error(`[oge] LLM structuring failed for ${source}:`, (e as Error).message);
    return [];
  }

  // Deduplicate exact repeats only (same filing sometimes lists a transaction twice,
  // or "(1)"/"(2)" PDF variants filed the same day overlap) — same description with a
  // different date/type/amount is a distinct transaction and must be kept.
  const seen = new Set<string>();
  const results: OgeTransaction[] = [];
  for (const t of raw) {
    if (!t.description || AMOUNT_MAP[t.amount] === undefined) continue;
    const key = `${filingDate}|${t.date}|${t.amount}|${t.type}|${t.description}`;
    if (seen.has(key)) continue;
    seen.add(key);
    results.push({
      description: t.description,
      type: (t.type as OgeTransaction["type"]) ?? "purchase",
      date: t.date ?? "",
      amount: t.amount,
      amountMidpoint: AMOUNT_MAP[t.amount],
      filingDate,
      source,
    });
  }

  return results.sort((a, b) => b.filingDate.localeCompare(a.filingDate));
}

// ── OGE index fetch + PDF pipeline ───────────────────────────────────────────

const OGE_API = "https://extapps2.oge.gov/201/Presiden.nsf/API.xsp/v2/rest?draw=1&start=0&length=16747";
const OGE_REFERER = "https://www.oge.gov/web/OGE.nsf/Officials%20Individual%20Disclosures%20Search%20Collection?OpenForm";
// extapps2.oge.gov 400s a bare programmatic User-Agent from cloud egress IPs (Fly.io) while
// serving the identical request from a residential one — send browser headers on both calls.
const OGE_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

async function fetchTrumpTransactions(): Promise<OgeTransaction[]> {
  // Step 1 — fetch OGE index
  const indexResp = await fetch(OGE_API, {
    headers: {
      "User-Agent": OGE_UA,
      "X-Requested-With": "XMLHttpRequest",
      Accept: "application/json, text/javascript, */*; q=0.01",
      "Accept-Language": "en-US,en;q=0.9",
      Referer: OGE_REFERER,
    },
    signal: AbortSignal.timeout(20_000),
  });
  if (!indexResp.ok) {
    // Include the body — a bare status makes a WAF block indistinguishable from a real API error.
    const body = (await indexResp.text().catch(() => "")).replace(/\s+/g, " ").trim();
    throw new Error(`OGE index ${indexResp.status}: ${body.slice(0, 200)}`);
  }

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
        headers: { "User-Agent": OGE_UA, Referer: OGE_REFERER },
        signal: AbortSignal.timeout(30_000),
      });
      if (!pdfResp.ok) {
        console.warn(`[oge] PDF ${pdfResp.status} for ${filing.source}`);
        continue;
      }

      const buf = Buffer.from(await pdfResp.arrayBuffer());
      const text = await extractPdfText(buf);

      const txns = await structureTransactionsWithLLM(text, filing.filingDate, filing.source);
      console.log(`[oge] ${filing.source}: extracted ${txns.length} txns ≥$100K`);

      for (const t of txns) {
        const key = `${t.filingDate}|${t.date}|${t.amount}|${t.type}|${t.description}`;
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

export async function bustCache() {
  memCache = null;
  memMeta = null;
  memFail = null;
  _lockFailTs = 0;
  _fetching = false; // allow immediate re-trigger from /refresh endpoint
  if (redis) {
    try { await redis.del(REDIS_KEY, META_KEY, LOCK_KEY, FAIL_KEY); } catch {}
  }
}

// ── Fly.io ephemeral worker machine ──────────────────────────────────────────
// Spawns a temporary 1024 MB machine just for the PDF pipeline, then auto-destroys.
// Falls back to in-process if FLY_API_TOKEN / FLY_APP_NAME / FLY_MACHINE_ID absent.

let _lastWorkerMemoryMb: number | null = null;

async function spawnFlyWorker(triggerSource: string): Promise<boolean> {
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
            env: { OGE_WORKER_MODE: "1", OGE_TRIGGER_SOURCE: triggerSource },
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

async function triggerPipeline(triggerSource: string) {
  if (_fetching) return;
  if (Date.now() - _lockFailTs < LOCK_COOLDOWN_MS) return;
  _fetching = true;

  const fail = await getFailure();
  if (fail) {
    // Last run threw — don't burn an ephemeral worker machine on every cache-miss GET.
    console.log(`[oge] skipping ${triggerSource} — last run failed at ${fail.at}: ${fail.error}`);
    _fetching = false;
    return;
  }

  spawnFlyWorker(triggerSource).then((spawned) => {
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
      const startedAt = Date.now();
      try {
        const txns = await fetchTrumpTransactions();
        await setCached(txns, { triggerSource, durationMs: Date.now() - startedAt });
        console.log(`[oge] pipeline complete — ${txns.length} transactions cached`);
      } catch (e) {
        console.error("[oge] pipeline failed:", (e as Error).message);
        await setFailure((e as Error).message);
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
  const triggerSource = process.env.OGE_TRIGGER_SOURCE ?? "worker";
  const startedAt = Date.now();
  const acquired = await acquireLock();
  if (!acquired) {
    console.log("[oge-worker] lock held by another worker — exiting");
    process.exit(0);
  }
  try {
    const txns = await fetchTrumpTransactions();
    await setCached(txns, { triggerSource, durationMs: Date.now() - startedAt });
    console.log(`[oge-worker] complete — ${txns.length} transactions written to Redis`);
    await releaseLock();
    process.exit(0);
  } catch (e) {
    console.error("[oge-worker] failed:", (e as Error).message);
    await setFailure((e as Error).message);
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
      triggerPipeline("startup");
    }
  }).catch(() => triggerPipeline("startup"));

  // Debug endpoint — shows env vars, last pipeline run, and tests Fly.io Machines API reachability.
  app.get("/api/oge/trump-transactions/config", async (_req, res) => {
    const meta = await getMeta();
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
      lastRun: meta,
      lastFailure: await getFailure(),
      importedRows: (await getImports()).length,
    });
  });

  // Force-bust cache and re-run the PDF pipeline immediately.
  // Hit this once after deploying parser fixes to avoid waiting 7d.
  // Admin-only — this route pays for an LLM run on every call (~$0.35-0.40, one
  // per filing) and bypasses the normal retrigger cooldown. Must not be public.
  app.post("/api/oge/trump-transactions/refresh", async (req, res) => {
    const adminSecret = process.env.ADMIN_SECRET;
    if (!adminSecret) {
      return res.status(503).json({ error: "ADMIN_SECRET not configured" });
    }
    if (req.headers["authorization"] !== `Bearer ${adminSecret}`) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    await bustCache();
    triggerPipeline("admin-refresh");
    res.json({ ok: true, message: "Cache cleared — pipeline running in background" });
  });

  // Publish rows extracted outside the pipeline (scanned PDFs it cannot read).
  // Additive: merged on top of whatever the pipeline produced, never replacing it,
  // and stored under a separate TTL-less key so a later pipeline run can't wipe it.
  app.post("/api/oge/trump-transactions/import", async (req, res) => {
    const adminSecret = process.env.ADMIN_SECRET;
    if (!adminSecret) return res.status(503).json({ error: "ADMIN_SECRET not configured" });
    if (req.headers["authorization"] !== `Bearer ${adminSecret}`) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { csv, filingDate, source } = (req.body ?? {}) as Record<string, unknown>;
    if (typeof csv !== "string" || !csv.trim()) {
      return res.status(400).json({ error: "body.csv (string) is required" });
    }
    if (typeof filingDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(filingDate)) {
      return res.status(400).json({ error: "body.filingDate (YYYY-MM-DD) is required" });
    }
    if (typeof source !== "string" || !source.trim()) {
      return res.status(400).json({ error: "body.source (the OGE PDF filename) is required" });
    }

    let parsed: CsvParseResult;
    try {
      parsed = parseImportCsv(csv, filingDate, source);
    } catch (e) {
      return res.status(400).json({ error: (e as Error).message });
    }

    const existing = await getImports();
    const seen = new Set(existing.map(txnKey));
    const pipeline = (await getCached()) ?? [];
    for (const t of pipeline) seen.add(txnKey(t));

    const added = parsed.rows.filter((t) => !seen.has(txnKey(t)) && seen.add(txnKey(t)));
    await saveImports([...existing, ...added]);
    console.log(`[oge] CSV import from ${source}: +${added.length} rows (${parsed.skipped.length} skipped)`);

    res.json({
      ok: true,
      added: added.length,
      duplicates: parsed.rows.length - added.length,
      skipped: parsed.skipped,
      importedTotal: existing.length + added.length,
    });
  });

  // Undo path — the only way to remove a bad import without hand-editing Redis.
  app.delete("/api/oge/trump-transactions/import", async (req, res) => {
    const adminSecret = process.env.ADMIN_SECRET;
    if (!adminSecret) return res.status(503).json({ error: "ADMIN_SECRET not configured" });
    if (req.headers["authorization"] !== `Bearer ${adminSecret}`) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const source = req.query["source"] as string | undefined;
    const existing = await getImports();
    const kept = source ? existing.filter((t) => t.source !== source) : [];
    await saveImports(kept);
    res.json({ ok: true, removed: existing.length - kept.length, remaining: kept.length });
  });

  app.get("/api/oge/trump-transactions", async (_req, res) => {
    const cached = await getCached();
    const imported = await getImports();

    // Manually imported rows sit on top of the pipeline's output, deduped by the
    // same key the pipeline uses. Serve them even when the pipeline cache is cold.
    if (cached || imported.length > 0) {
      const seen = new Set<string>();
      const merged = [...(cached ?? []), ...imported]
        .filter((t) => !seen.has(txnKey(t)) && seen.add(txnKey(t)))
        .sort((a, b) => b.filingDate.localeCompare(a.filingDate));

      // meta is only absent for cache entries written before this field existed —
      // falls back to the old (less accurate) "when this machine loaded it" timestamp.
      const meta = await getMeta();
      const pipelineRanAt = meta?.lastRunAt ?? (memCache ? new Date(memCache.ts).toISOString() : new Date().toISOString());
      res.set("Cache-Control", "public, max-age=302400, stale-while-revalidate=604800"); // 3.5d / 7d SWR
      return res.json({ transactions: merged, total: merged.length, lastUpdated: pipelineRanAt });
    }

    if (_fetching) {
      return res.json({ transactions: [], total: 0, loading: true, lastUpdated: null });
    }

    const fail = await getFailure();
    if (fail) {
      // loading:false so clients fall through to their no-data/retry state instead of
      // polling a spinner every 8 s against a pipeline that is in failure cooldown.
      return res.json({ transactions: [], total: 0, loading: false, lastUpdated: null });
    }

    // Should not reach here normally — startup already triggered the pipeline.
    triggerPipeline("get-miss");
    res.json({ transactions: [], total: 0, loading: true, lastUpdated: null });
  });
}
