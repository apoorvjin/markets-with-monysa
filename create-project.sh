#!/usr/bin/env bash
#
# create-project.sh — scaffold a new full-stack project using the same
# architecture as this repo (Express + TS modular API, pnpm monorepo web
# client with a contracts→api-client→ui pipeline, an ops/admin portal, and
# Fly/Vercel deploy tooling), minus any domain code.
#
# It generates ONE clean, domain-agnostic skeleton wired end-to-end around a
# single example "items" feature so the result runs the moment it's created
# and shows you exactly how to add the next feature.
#
# Usage:
#   ./create-project.sh                         # interactive
#   ./create-project.sh --name my-app --yes     # non-interactive (defaults)
#   ./create-project.sh --name my-app --scope @acme --fly-app my-app-api \
#       --region iad --dir ~/code/my-app --install --yes
#
# Flags:
#   --name <slug>       project slug (kebab-case)         [prompt]
#   --title <text>      human display title              [derived from name]
#   --scope <@scope>    pnpm package scope, e.g. @acme    [@<name>]
#   --fly-app <slug>    Fly.io app name for the API       [<name>-api]
#   --region <code>     Fly primary region               [iad]
#   --dir <path>        output directory                 [../<name>]
#   --install           run npm/pnpm install after generating
#   --no-git            skip git init + first commit
#   --yes, -y           accept defaults, no prompts
#   --help, -h          this help
#
set -euo pipefail

# ── Colors ──────────────────────────────────────────────────────────────────
if [ -t 1 ]; then
  BOLD='\033[1m'; DIM='\033[2m'; NC='\033[0m'
  CYAN='\033[0;36m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; BLUE='\033[0;34m'
else
  BOLD=''; DIM=''; NC=''; CYAN=''; GREEN=''; YELLOW=''; RED=''; BLUE=''
fi

die()  { echo -e "${RED}✗ $*${NC}" >&2; exit 1; }
info() { echo -e "${CYAN}$*${NC}"; }
ok()   { echo -e "${GREEN}$*${NC}"; }

# ── Defaults / arg parsing ──────────────────────────────────────────────────
PROJECT_NAME=""
TITLE=""
SCOPE=""
FLY_APP=""
REGION="iad"
DEST=""
DO_INSTALL=false
DO_GIT=true
ASSUME_YES=false
API_PORT="5001"      # NOT 5000 — macOS AirPlay owns 5000
WEB_PORT="5173"
ADMIN_PORT="5175"

usage() { sed -n '2,40p' "$0" | sed 's/^# \{0,1\}//'; exit 0; }

while [ $# -gt 0 ]; do
  case "$1" in
    --name)    PROJECT_NAME="${2:-}"; shift 2 ;;
    --title)   TITLE="${2:-}"; shift 2 ;;
    --scope)   SCOPE="${2:-}"; shift 2 ;;
    --fly-app) FLY_APP="${2:-}"; shift 2 ;;
    --region)  REGION="${2:-}"; shift 2 ;;
    --dir)     DEST="${2:-}"; shift 2 ;;
    --install) DO_INSTALL=true; shift ;;
    --no-git)  DO_GIT=false; shift ;;
    --yes|-y)  ASSUME_YES=true; shift ;;
    --help|-h) usage ;;
    *) die "Unknown flag: $1  (try --help)" ;;
  esac
done

# ── Banner ──────────────────────────────────────────────────────────────────
echo -e "${BOLD}${BLUE}"
echo "  ┌────────────────────────────────────────────────┐"
echo "  │   scaffold · full-stack project generator      │"
echo "  │   Express + TS  ·  pnpm monorepo  ·  ops/deploy │"
echo "  └────────────────────────────────────────────────┘"
echo -e "${NC}"

# ── Interactive prompts ─────────────────────────────────────────────────────
prompt() { # prompt <var> <label> <default>
  local __var="$1" __label="$2" __def="$3" __ans=""
  if [ "$ASSUME_YES" = true ] || [ ! -t 0 ]; then
    printf -v "$__var" '%s' "${!__var:-$__def}"
    return
  fi
  local cur="${!__var:-$__def}"
  read -r -p "$(echo -e "${BOLD}$__label${NC} ${DIM}[$cur]${NC}: ")" __ans </dev/tty || true
  printf -v "$__var" '%s' "${__ans:-$cur}"
}

if [ -z "$PROJECT_NAME" ] && { [ "$ASSUME_YES" = true ] || [ ! -t 0 ]; }; then
  PROJECT_NAME="my-app"
fi
prompt PROJECT_NAME "Project slug (kebab-case)" "my-app"

# derive defaults from the (possibly just-entered) name
[ -z "$TITLE" ]   && TITLE="$(echo "$PROJECT_NAME" | sed -E 's/[-_]+/ /g' | awk '{for(i=1;i<=NF;i++)$i=toupper(substr($i,1,1)) substr($i,2)}1')"
[ -z "$SCOPE" ]   && SCOPE="@${PROJECT_NAME//[^a-zA-Z0-9]/}"
[ -z "$FLY_APP" ] && FLY_APP="${PROJECT_NAME}-api"

prompt TITLE   "Display title" "$TITLE"
prompt SCOPE   "pnpm package scope" "$SCOPE"
prompt FLY_APP "Fly.io API app name" "$FLY_APP"
prompt REGION  "Fly primary region" "$REGION"

if [ -z "$DEST" ]; then
  DEST="$(cd .. 2>/dev/null && pwd)/$PROJECT_NAME"
  DEST="${DEST:-../$PROJECT_NAME}"
fi
prompt DEST "Output directory" "$DEST"

# ── Validate ────────────────────────────────────────────────────────────────
echo "$PROJECT_NAME" | grep -Eq '^[a-z][a-z0-9-]*$' || die "Project slug must be kebab-case ([a-z][a-z0-9-]*): '$PROJECT_NAME'"
echo "$SCOPE" | grep -Eq '^@[a-z0-9-]+$' || die "Scope must look like @acme: '$SCOPE'"
if [ -e "$DEST" ] && [ -n "$(ls -A "$DEST" 2>/dev/null || true)" ]; then
  die "Destination '$DEST' exists and is not empty."
fi

# ── Confirm ─────────────────────────────────────────────────────────────────
echo ""
echo -e "  ${BOLD}name${NC}     $PROJECT_NAME"
echo -e "  ${BOLD}title${NC}    $TITLE"
echo -e "  ${BOLD}scope${NC}    $SCOPE   ${DIM}(packages: $SCOPE/contracts, $SCOPE/api-client, $SCOPE/ui)${NC}"
echo -e "  ${BOLD}fly app${NC}  $FLY_APP   ${DIM}(region $REGION)${NC}"
echo -e "  ${BOLD}ports${NC}    api:$API_PORT  web:$WEB_PORT  admin:$ADMIN_PORT"
echo -e "  ${BOLD}dir${NC}      $DEST"
echo -e "  ${BOLD}git${NC}      $([ "$DO_GIT" = true ] && echo 'init + first commit' || echo 'skip')   ${BOLD}install${NC}  $([ "$DO_INSTALL" = true ] && echo yes || echo no)"
echo ""
if [ "$ASSUME_YES" != true ] && [ -t 0 ]; then
  read -r -p "$(echo -e "${BOLD}Generate? [Y/n]${NC} ")" _c </dev/tty || true
  case "${_c:-Y}" in [nN]*) die "Aborted." ;; esac
fi

# ── Sed-escape values (| is the tpl delimiter) ──────────────────────────────
esc() { printf '%s' "$1" | sed -e 's/[\\&|]/\\&/g'; }
PROJECT_NAME_E="$(esc "$PROJECT_NAME")"
TITLE_E="$(esc "$TITLE")"
SCOPE_E="$(esc "$SCOPE")"
FLY_APP_E="$(esc "$FLY_APP")"
REGION_E="$(esc "$REGION")"

# ── Templating writer: reads a quoted heredoc on stdin, substitutes tokens ──
tpl() {
  local dest="$DEST/$1"
  mkdir -p "$(dirname "$dest")"
  sed \
    -e "s|__PROJECT_NAME__|$PROJECT_NAME_E|g" \
    -e "s|__TITLE__|$TITLE_E|g" \
    -e "s|__SCOPE__|$SCOPE_E|g" \
    -e "s|__FLY_APP__|$FLY_APP_E|g" \
    -e "s|__REGION__|$REGION_E|g" \
    -e "s|__API_PORT__|$API_PORT|g" \
    -e "s|__WEB_PORT__|$WEB_PORT|g" \
    -e "s|__ADMIN_PORT__|$ADMIN_PORT|g" \
    > "$dest"
  echo -e "  ${DIM}+ $1${NC}"
}

mkdir -p "$DEST"
echo ""
info "Writing files…"

# ════════════════════════════════════════════════════════════════════════════
#  ROOT (API package)
# ════════════════════════════════════════════════════════════════════════════

tpl package.json <<'FILEEOF'
{
  "name": "__PROJECT_NAME__-api",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "server:dev": "NODE_ENV=development tsx watch --env-file=.env server/index.ts",
    "server:start": "NODE_ENV=production tsx server/index.ts",
    "web:build": "cd frontend && VITE_API_BASE_URL= pnpm --filter __SCOPE__/web build",
    "admin:dev": "cd frontend && pnpm --filter __SCOPE__/admin dev",
    "dev": "./dev.sh"
  },
  "dependencies": {
    "@upstash/redis": "^1.34.0",
    "express": "^5.0.1",
    "express-rate-limit": "^8.0.0",
    "tsx": "^4.19.0",
    "zod": "^3.25.0"
  },
  "devDependencies": {
    "@types/express": "^5.0.0",
    "typescript": "~5.6.0"
  }
}
FILEEOF

tpl tsconfig.json <<'FILEEOF'
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "baseUrl": ".",
    "types": ["node"]
  },
  "include": ["server/**/*.ts"]
}
FILEEOF

tpl .gitignore <<'FILEEOF'
node_modules/
dist/
server_dist/
.env
.env.local
.DS_Store
*.log
frontend/**/dist/
frontend/**/node_modules/
.vercel/
FILEEOF

tpl .dockerignore <<'FILEEOF'
node_modules/
.git/
*.md
.env
frontend/node_modules/
frontend/**/node_modules/
# The admin/ops portal is a local-only tool — never ship it inside the API image.
frontend/apps/admin/dist/
FILEEOF

tpl .env.example <<'FILEEOF'
# ── __TITLE__ · environment ──────────────────────────────────────────────────
# Copy to .env for local dev. Everything is optional — the app degrades
# gracefully when a key is absent (dev mode = every device is "pro").

# Server
PORT=__API_PORT__

# CORS — comma-separated origins allowed in production (additive; never drop one).
# Localhost + ngrok are always allowed in dev regardless of this list.
ALLOWED_ORIGINS=

# Plan enforcement / request signing. When set, /api requests on SIGNED_ROUTES
# must carry an X-Signature header, and plan gates go live (absent = dev/pro).
APP_SIGNING_SECRET=

# Billing webhook shared secret (Bearer). Absent = webhook accepts unauthenticated (dev).
BILLING_WEBHOOK_SECRET=

# Admin/ops portal Bearer token (server/lib/admin-auth.ts). Absent = admin API
# open in local dev, disabled on Fly.
ADMIN_SECRET=

# Multi-machine leader election (optional). Without these, every process is leader.
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
FILEEOF

tpl Dockerfile <<'FILEEOF'
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev --ignore-scripts
COPY . .
EXPOSE __API_PORT__
ENV NODE_ENV=production
ENV NODE_OPTIONS="--max-old-space-size=400"
CMD ["npx", "tsx", "server/index.ts"]
FILEEOF

tpl fly.toml <<'FILEEOF'
app = "__FLY_APP__"
primary_region = "__REGION__"

[build]

[http_service]
  internal_port = __API_PORT__
  force_https = true
  auto_stop_machines = "off"
  auto_start_machines = true
  min_machines_running = 1

[[vm]]
  memory = "512mb"
  cpu_kind = "shared"
  cpus = 1
FILEEOF

# ════════════════════════════════════════════════════════════════════════════
#  SERVER
# ════════════════════════════════════════════════════════════════════════════

tpl server/index.ts <<'FILEEOF'
import express from "express";
import type { Request, Response, NextFunction } from "express";
import rateLimit from "express-rate-limit";
import { createHmac, timingSafeEqual } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { registerRoutes } from "./routes";
import { startLeaderElection, machineId } from "./lib/leader";

const app = express();
const log = console.log;
const APP_NAME = "__TITLE__ API";

// Behind a reverse proxy (Fly/Vercel/etc.) trust 1 hop so express-rate-limit
// keys per real client IP instead of grouping everyone behind the proxy.
app.set("trust proxy", 1);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

// The ops portal (./admin.sh) runs on this fixed local port and always targets
// production — let its origin through CORS even when isProd is true.
const ADMIN_PORTAL_ORIGIN = "http://localhost:__ADMIN_PORT__";

function setupCors(app: express.Application) {
  const isProd = !!process.env.FLY_REGION || process.env.NODE_ENV === "production";
  app.use((req, res, next) => {
    const allowed = new Set((process.env.ALLOWED_ORIGINS || "").split(",").filter(Boolean));
    const origin = req.header("origin");
    const isLocaldev =
      !isProd &&
      (origin?.startsWith("http://localhost:") ||
        origin?.startsWith("http://127.0.0.1:") ||
        origin?.includes(".ngrok-free.app") ||
        origin?.includes(".ngrok.app"));
    const isAllowed = origin && (allowed.has(origin) || isLocaldev || origin === ADMIN_PORTAL_ORIGIN);

    if (isAllowed) {
      res.header("Access-Control-Allow-Origin", origin);
      res.header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD");
      res.header(
        "Access-Control-Allow-Headers",
        "Content-Type, Authorization, Accept, Origin, X-Device-ID, X-User-ID, X-Signature, If-None-Match",
      );
      res.header("Access-Control-Allow-Credentials", "true");
      res.header("Access-Control-Max-Age", "86400");
    }
    if (req.method === "OPTIONS") {
      return isAllowed ? res.sendStatus(200) : res.status(403).end();
    }
    next();
  });
}

function setupBodyParsing(app: express.Application) {
  app.use(express.json({ verify: (req, _res, buf) => { req.rawBody = buf; } }));
  app.use(express.urlencoded({ extended: false }));
}

// One-line [TIMING] log per /api request — greppable, and what an ops/log
// dashboard would parse for latency metrics.
function setupRequestLogging(app: express.Application) {
  app.use((req, res, next) => {
    const start = Date.now();
    res.on("finish", () => {
      if (!req.path.startsWith("/api")) return;
      log(`[TIMING] ${req.method} ${req.path} ${res.statusCode} in ${Date.now() - start}ms`);
    });
    next();
  });
}

function setupRateLimiting(app: express.Application) {
  const general = rateLimit({ windowMs: 60_000, max: 200, standardHeaders: true, legacyHeaders: false });
  // Tighter cap for compute/AI-heavy endpoints — copy this for any expensive route.
  const heavy = rateLimit({ windowMs: 60_000, max: 30, standardHeaders: true, legacyHeaders: false });
  app.use("/api", general);
  app.use("/api/items/:id/analysis", heavy);
}

// Add expensive/abusable routes here to require an HMAC X-Signature header.
// Empty by default — the machinery is wired, just opt routes in.
const SIGNED_ROUTES: string[] = [];

function setupRequestSigning(app: express.Application) {
  const secret = process.env.APP_SIGNING_SECRET;
  if (!secret) {
    log("⚠️  APP_SIGNING_SECRET not set — request signing disabled (dev mode)");
    return;
  }
  const mw = (req: Request, res: Response, next: NextFunction) => {
    const header = req.headers["x-signature"] as string | undefined;
    if (!header || !header.includes(".")) return res.status(401).json({ error: "Missing/invalid X-Signature." });
    const [ts, provided] = [header.slice(0, header.indexOf(".")), header.slice(header.indexOf(".") + 1)];
    const tsNum = parseInt(ts, 10);
    if (isNaN(tsNum) || Math.abs(Date.now() - tsNum) > 5 * 60_000) {
      return res.status(401).json({ error: "Request timestamp expired." });
    }
    const expected = createHmac("sha256", secret).update(ts).digest("hex");
    try {
      const a = Buffer.from(expected, "hex"), b = Buffer.from(provided, "hex");
      if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error();
    } catch {
      return res.status(401).json({ error: "Invalid request signature." });
    }
    next();
  };
  for (const p of SIGNED_ROUTES) app.use(p, mw);
  if (SIGNED_ROUTES.length) log(`✓ Request signing active on: ${SIGNED_ROUTES.join(", ")}`);
}

function setupErrorHandler(app: express.Application) {
  app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    const e = err as { status?: number; statusCode?: number; message?: string };
    console.error("Internal Server Error:", err);
    if (res.headersSent) return next(err);
    res.status(e.status || e.statusCode || 500).json({ message: e.message || "Internal Server Error" });
  });
}

(async () => {
  setupCors(app);
  setupBodyParsing(app);
  setupRequestLogging(app);
  setupRateLimiting(app);
  setupRequestSigning(app);

  app.get("/", (_req, res) => res.json({ status: "ok", name: APP_NAME, version: "1.0.0" }));

  const server = await registerRoutes(app);

  // Serve the compiled web SPA when its dist/ is present (single-origin deploy).
  // API routes always win; the SPA catch-all must come last.
  const webDist = join(process.cwd(), "frontend/apps/web/dist");
  if (existsSync(webDist)) {
    app.use(express.static(webDist));
    app.get(/.*/, (_req, res) => res.sendFile(join(webDist, "index.html")));
    log(`✓ Serving web frontend from ${webDist}`);
  }

  setupErrorHandler(app);
  startLeaderElection();

  const port = parseInt(process.env.PORT || "__API_PORT__", 10);
  server.listen(port, "0.0.0.0", () => log(`${APP_NAME} on :${port} (machine ${machineId()})`));
})();
FILEEOF

tpl server/routes.ts <<'FILEEOF'
import type { Express } from "express";
import { createServer, type Server } from "node:http";
import { registerItemsRoutes } from "./routes/items";
import { registerBillingRoutes } from "./routes/billing";
import { registerAdminRoutes } from "./routes/admin";

/**
 * Central route registry. Each feature owns a `registerXRoutes(app)` file in
 * routes/ — add the import + call here when you scaffold a new feature.
 */
export async function registerRoutes(app: Express): Promise<Server> {
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", ts: new Date().toISOString() });
  });

  registerItemsRoutes(app);
  registerBillingRoutes(app);
  registerAdminRoutes(app);

  return createServer(app);
}
FILEEOF

tpl server/plan-enforcement.ts <<'FILEEOF'
import type { Request, Response, NextFunction } from "express";

// Exactly two tiers. Keep this the single source of truth for gating.
export type DevicePlan = "free" | "pro";

// When APP_SIGNING_SECRET is absent we're in local/dev mode — every device is
// treated as "pro" so no gate fires while you build.
export const enforcementEnabled = !!process.env.APP_SIGNING_SECRET;

// In-process plan cache — authoritative for request-time lookups. Seeded/updated
// by the billing webhook (routes/billing.ts). Swap for a DB-backed store when
// you need persistence across restarts.
export const devicePlanMap = new Map<string, DevicePlan>();

export function getDevicePlan(req: Request): DevicePlan {
  if (!enforcementEnabled) return "pro";
  // Prefer account identity (X-User-ID) over device id when signed in.
  const userId = req.headers["x-user-id"] as string | undefined;
  if (userId) {
    const plan = devicePlanMap.get(userId);
    if (plan) return plan;
  }
  const deviceId = req.headers["x-device-id"] as string | undefined;
  if (deviceId) return devicePlanMap.get(deviceId) ?? "free";
  return "free";
}

export function isPro(plan: DevicePlan): boolean {
  return plan === "pro";
}

/** Route guard for Pro-only endpoints → 403 { code: "PLAN_REQUIRED" } for free. */
export function requirePro(req: Request, res: Response, next: NextFunction): void {
  if (isPro(getDevicePlan(req))) return next();
  res.status(403).json({ error: "This feature requires Pro.", code: "PLAN_REQUIRED" });
}
FILEEOF

tpl server/lib/cache.ts <<'FILEEOF'
import type { Response } from "express";

/**
 * Tiny in-process TTL cache. One instance per resource/key-space:
 *   const c = createCache<Payload>(60_000);
 *   const hit = c.get(key); if (hit) return hit;
 *   ...compute... c.set(key, data);
 */
export function createCache<T>(ttlMs: number) {
  const store = new Map<string, { data: T; ts: number }>();
  return {
    ttlMs,
    get(key: string): T | undefined {
      const hit = store.get(key);
      return hit && Date.now() - hit.ts < ttlMs ? hit.data : undefined;
    },
    set(key: string, data: T) { store.set(key, { data, ts: Date.now() }); },
    clear() { store.clear(); },
  };
}

/**
 * Emit Cache-Control so a CDN/edge can absorb concurrent traffic:
 *   max-age ≈ half the TTL, stale-while-revalidate ≈ the full TTL.
 * Pass { private: true } for plan-gated responses so a shared edge can't
 * serve one device's payload to another.
 */
export function setCacheHeaders(res: Response, ttlMs: number, opts: { private?: boolean } = {}) {
  const maxAge = Math.floor(ttlMs / 2000);
  const swr = Math.floor(ttlMs / 1000);
  res.set("Cache-Control", `${opts.private ? "private" : "public"}, max-age=${maxAge}, stale-while-revalidate=${swr}`);
}
FILEEOF

tpl server/lib/leader.ts <<'FILEEOF'
/**
 * Multi-machine leader election via Upstash Redis lease.
 *
 * When you scale to >1 instance, background jobs (pollers, warmers, websockets)
 * should run on exactly one of them. Gate those with `isLeader()`.
 *
 * Without Redis configured (local dev / single machine) every process is
 * leader, so single-instance setups behave unchanged.
 */
import { Redis } from "@upstash/redis";

const _machineId = process.env.FLY_MACHINE_ID ?? "local";
const _isFly = !!process.env.FLY_APP_NAME;
const _redis =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({ url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN })
    : null;

const LEASE_KEY = "leader:lease";
const LEASE_TTL_S = 90;
const REFRESH_INTERVAL_MS = 30_000;

let _isLeader: boolean | null = null;
let _timer: NodeJS.Timeout | null = null;

export function isLeader(): boolean {
  if (!_isFly || !_redis) return true;
  return _isLeader === true;
}

export function startLeaderElection(): void {
  if (!_isFly || !_redis || _timer) return;
  void tryAcquire();
  _timer = setInterval(() => void tryAcquire(), REFRESH_INTERVAL_MS);
}

async function tryAcquire(): Promise<void> {
  if (!_redis) return;
  try {
    const acquired = await _redis.set(LEASE_KEY, _machineId, { nx: true, ex: LEASE_TTL_S });
    if (acquired) { _isLeader = true; return; }
    const holder = await _redis.get<string>(LEASE_KEY);
    if (holder === _machineId) {
      await _redis.set(LEASE_KEY, _machineId, { ex: LEASE_TTL_S });
      _isLeader = true;
    } else {
      _isLeader = false;
    }
  } catch (e) {
    console.warn("[leader] election failed:", (e as Error).message);
    _isLeader = false;
  }
}

export function machineId(): string {
  return _machineId;
}
FILEEOF

tpl server/lib/admin-auth.ts <<'FILEEOF'
import type { Request, Response, NextFunction } from "express";

/** Bearer ADMIN_SECRET guard for the ops portal's API surface. */
export function adminAuth(req: Request, res: Response, next: NextFunction): void {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) {
    // No secret set: allow in local dev, but never on a real Fly machine.
    if (process.env.FLY_REGION) {
      res.status(503).json({ error: "Admin disabled (no ADMIN_SECRET)." });
      return;
    }
    return next();
  }
  if (req.headers.authorization === `Bearer ${secret}`) return next();
  res.status(401).json({ error: "Unauthorized" });
}
FILEEOF

tpl server/data/items.ts <<'FILEEOF'
export interface Item {
  id: string;
  name: string;
  emoji: string;
  value: number;
  changePercent: number;
}

/** Replace this static seed with your real data source (DB, upstream API, …). */
export const ITEMS: Item[] = [
  { id: "alpha",   name: "Alpha",   emoji: "🟢", value: 128.4, changePercent: 1.2 },
  { id: "bravo",   name: "Bravo",   emoji: "🔵", value: 64.1,  changePercent: -0.6 },
  { id: "charlie", name: "Charlie", emoji: "🟣", value: 512.7, changePercent: 3.4 },
  { id: "delta",   name: "Delta",   emoji: "🟠", value: 22.9,  changePercent: -2.1 },
];
FILEEOF

tpl server/routes/items.ts <<'FILEEOF'
import type { Express } from "express";
import { ITEMS } from "../data/items";
import { createCache, setCacheHeaders } from "../lib/cache";
import { requirePro } from "../plan-enforcement";

// ── The "add a feature" reference. Copy this file, swap the data source, and
//    register it in ../routes.ts. It shows the three patterns you'll reuse
//    everywhere: TTL cache, Cache-Control headers, and a Pro gate. ──────────

const LIST_TTL = 60_000; // 60s
const listCache = createCache<unknown>(LIST_TTL);

export function registerItemsRoutes(app: Express): void {
  // Free, public, cached.
  app.get("/api/items", (_req, res) => {
    const cached = listCache.get("all");
    if (cached) {
      setCacheHeaders(res, LIST_TTL);
      return res.json(cached);
    }
    const items = ITEMS.map((it) => ({
      ...it,
      // jitter so the TTL is observable while developing
      changePercent: Number((it.changePercent + (Math.random() - 0.5)).toFixed(2)),
    }));
    const data = { items, lastUpdated: new Date().toISOString() };
    listCache.set("all", data);
    setCacheHeaders(res, LIST_TTL);
    res.json(data);
  });

  app.get("/api/items/:id", (req, res) => {
    const item = ITEMS.find((i) => i.id === req.params.id);
    if (!item) return res.status(404).json({ error: "Unknown item." });
    res.json(item);
  });

  // Plan-gated (Pro). Dev mode = every device is "pro", so this works locally;
  // in prod, free devices get 403 { code: "PLAN_REQUIRED" }. Note the private
  // Cache-Control so an edge can't leak one user's payload to another.
  app.get("/api/items/:id/analysis", requirePro, (req, res) => {
    const item = ITEMS.find((i) => i.id === req.params.id);
    if (!item) return res.status(404).json({ error: "Unknown item." });
    setCacheHeaders(res, 5 * 60_000, { private: true });
    res.json({
      id: item.id,
      analysis: `Deep-dive analysis for ${item.name} would be generated here.`,
      lastUpdated: new Date().toISOString(),
    });
  });
}
FILEEOF

tpl server/routes/billing.ts <<'FILEEOF'
import type { Express } from "express";
import { devicePlanMap, type DevicePlan } from "../plan-enforcement";

/**
 * Billing webhook. Identifier-agnostic: ANY active entitlement → "pro".
 * Adapt the body extraction to your provider (RevenueCat, Stripe, …).
 */
export function registerBillingRoutes(app: Express): void {
  app.post("/api/billing/webhook", (req, res) => {
    const secret = process.env.BILLING_WEBHOOK_SECRET;
    if (secret && req.headers.authorization !== `Bearer ${secret}`) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const body = (req.body ?? {}) as Record<string, unknown>;
    const id = (body.appUserId ?? body.userId ?? body.deviceId) as string | undefined;
    if (!id) return res.status(400).json({ error: "Missing user/device id." });

    const active = Array.isArray(body.entitlements)
      ? body.entitlements.length > 0
      : !!body.active;
    const plan: DevicePlan = active ? "pro" : "free";
    devicePlanMap.set(id, plan);
    res.json({ ok: true, id, plan });
  });
}
FILEEOF

tpl server/routes/admin.ts <<'FILEEOF'
import type { Express } from "express";
import { adminAuth } from "../lib/admin-auth";
import { devicePlanMap } from "../plan-enforcement";
import { machineId } from "../lib/leader";

/** Ops/admin API surface — consumed by the local admin portal (./admin.sh). */
export function registerAdminRoutes(app: Express): void {
  app.get("/api/admin/ping", adminAuth, (_req, res) => {
    res.json({ ok: true, machine: machineId(), uptimeSec: Math.round(process.uptime()) });
  });

  app.get("/api/admin/plans", adminAuth, (_req, res) => {
    res.json({ count: devicePlanMap.size, plans: Object.fromEntries(devicePlanMap) });
  });
}
FILEEOF

# ════════════════════════════════════════════════════════════════════════════
#  FRONTEND — monorepo root
# ════════════════════════════════════════════════════════════════════════════

tpl frontend/package.json <<'FILEEOF'
{
  "name": "__PROJECT_NAME__-frontend",
  "private": true,
  "packageManager": "pnpm@9.15.9",
  "engines": { "node": ">=20" },
  "scripts": {
    "dev": "pnpm --filter __SCOPE__/web dev",
    "build": "pnpm --filter __SCOPE__/web build",
    "preview": "pnpm --filter __SCOPE__/web preview",
    "typecheck": "pnpm -r typecheck"
  }
}
FILEEOF

tpl frontend/pnpm-workspace.yaml <<'FILEEOF'
packages:
  - "packages/*"
  - "apps/*"
FILEEOF

tpl frontend/tsconfig.base.json <<'FILEEOF'
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "noEmit": true,
    "types": []
  }
}
FILEEOF

# ── packages/contracts ──────────────────────────────────────────────────────

tpl frontend/packages/contracts/package.json <<'FILEEOF'
{
  "name": "__SCOPE__/contracts",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "scripts": { "typecheck": "tsc --noEmit" },
  "dependencies": { "zod": "^3.25.0" },
  "devDependencies": { "typescript": "^5.6.0" }
}
FILEEOF

tpl frontend/packages/contracts/tsconfig.json <<'FILEEOF'
{ "extends": "../../tsconfig.base.json", "include": ["src"] }
FILEEOF

tpl frontend/packages/contracts/src/index.ts <<'FILEEOF'
// Single source of truth for every API response shape. Add a file per feature
// and re-export it here. The web build fails at compile time if a client uses
// a field the schema doesn't declare — that's the point.
export * from "./items";
FILEEOF

tpl frontend/packages/contracts/src/items.ts <<'FILEEOF'
import { z } from "zod";

export const Item = z.object({
  id: z.string(),
  name: z.string(),
  emoji: z.string(),
  value: z.number(),
  changePercent: z.number(),
});
export type Item = z.infer<typeof Item>;

export const ItemsResponse = z.object({
  items: z.array(Item),
  lastUpdated: z.string(),
});
export type ItemsResponse = z.infer<typeof ItemsResponse>;
FILEEOF

# ── packages/api-client ─────────────────────────────────────────────────────

tpl frontend/packages/api-client/package.json <<'FILEEOF'
{
  "name": "__SCOPE__/api-client",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "scripts": { "typecheck": "tsc --noEmit" },
  "dependencies": { "__SCOPE__/contracts": "workspace:*", "zod": "^3.25.0" },
  "devDependencies": { "typescript": "^5.6.0" }
}
FILEEOF

tpl frontend/packages/api-client/tsconfig.json <<'FILEEOF'
{ "extends": "../../tsconfig.base.json", "include": ["src"] }
FILEEOF

tpl frontend/packages/api-client/src/index.ts <<'FILEEOF'
import type { z } from "zod";
import { ItemsResponse } from "__SCOPE__/contracts";

/**
 * Typed fetch layer. Every method parses its response with the matching
 * contract schema, so a shape drift throws loudly instead of rendering junk.
 * Plain GETs with no custom headers → no CORS preflight; the browser handles
 * ETag/304 transparently.
 */
export class ApiClient {
  constructor(private baseUrl: string) {}

  private async get<T extends z.ZodTypeAny>(path: string, schema: T): Promise<z.infer<T>> {
    const res = await fetch(`${this.baseUrl}${path}`, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${path}`);
    return schema.parse(await res.json());
  }

  getItems() {
    return this.get("/api/items", ItemsResponse);
  }
}
FILEEOF

# ── packages/ui ─────────────────────────────────────────────────────────────

tpl frontend/packages/ui/package.json <<'FILEEOF'
{
  "name": "__SCOPE__/ui",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "main": "./src/index.tsx",
  "types": "./src/index.tsx",
  "exports": {
    ".": "./src/index.tsx",
    "./tokens.css": "./src/tokens.css",
    "./ui.css": "./src/ui.css"
  },
  "scripts": { "typecheck": "tsc --noEmit" },
  "peerDependencies": { "react": "^19.0.0" },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "react": "^19.0.0",
    "typescript": "^5.6.0"
  }
}
FILEEOF

tpl frontend/packages/ui/tsconfig.json <<'FILEEOF'
{ "extends": "../../tsconfig.base.json", "include": ["src"] }
FILEEOF

tpl frontend/packages/ui/src/format.ts <<'FILEEOF'
export function fmtPct(n: number | null | undefined): string {
  if (n == null) return "—";
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}
export function fmtNum(n: number | null | undefined): string {
  if (n == null) return "—";
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}
export function tone(n: number | null | undefined): "up" | "down" | "flat" {
  if (n == null || n === 0) return "flat";
  return n > 0 ? "up" : "down";
}
export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "";
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${Math.floor(s)}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}
FILEEOF

tpl frontend/packages/ui/src/index.tsx <<'FILEEOF'
import type { CSSProperties, ReactNode } from "react";
export * from "./format";
import { tone } from "./format";

export function Card(props: { children: ReactNode; style?: CSSProperties }) {
  return <div className="ui-card" style={props.style}>{props.children}</div>;
}

export function Chip(props: { label: ReactNode; active?: boolean; onClick?: () => void }) {
  return (
    <button type="button" className="ui-chip" data-active={props.active ? "true" : "false"} onClick={props.onClick}>
      {props.label}
    </button>
  );
}

export function Stat(props: { label: string; value: ReactNode; delta?: number | null }) {
  return (
    <div className="ui-stat">
      <span className="ui-stat-label">{props.label}</span>
      <span className="ui-stat-value">{props.value}</span>
      {props.delta != null && <span className="ui-delta" data-tone={tone(props.delta)}>{props.delta >= 0 ? "▲" : "▼"}</span>}
    </div>
  );
}

export function Badge(props: { children: ReactNode; tone?: "up" | "down" | "flat" }) {
  return <span className="ui-badge" data-tone={props.tone ?? "flat"}>{props.children}</span>;
}
FILEEOF

tpl frontend/packages/ui/src/tokens.css <<'FILEEOF'
/* Design tokens — dark by default, light via [data-theme="light"]. One place
   to retheme the whole app. Consume as var(--accent), var(--s4), etc. */
:root,
:root[data-theme="dark"] {
  --bg: #000000;
  --surface: #0a0a0a;
  --border: #1c1c1e;
  --accent: #00d4aa;
  --danger: #ff4d6a;
  --warning: #ffb84d;
  --text: #f5f5f7;
  --text-dim: #8e8e93;

  --s1: 4px; --s2: 6px; --s3: 8px; --s4: 12px;
  --s5: 16px; --s6: 20px; --s7: 24px; --s8: 32px;
  --r-sm: 8px; --r-md: 12px; --r-lg: 16px;
}
:root[data-theme="light"] {
  --bg: #ffffff;
  --surface: #f5f7fa;
  --border: #e5e7eb;
  --accent: #00c49a;
  --danger: #e8384f;
  --warning: #e6952a;
  --text: #111827;
  --text-dim: #6b7280;
}
FILEEOF

tpl frontend/packages/ui/src/ui.css <<'FILEEOF'
.ui-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
  padding: var(--s5);
}
.ui-chip {
  background: transparent;
  border: 1px solid var(--border);
  color: var(--text-dim);
  border-radius: var(--r-md);
  padding: var(--s2) var(--s4);
  font: inherit;
  cursor: pointer;
}
.ui-chip[data-active="true"] {
  color: var(--bg);
  background: var(--accent);
  border-color: var(--accent);
}
.ui-stat { display: flex; align-items: baseline; gap: var(--s2); }
.ui-stat-label { color: var(--text-dim); font-size: 13px; }
.ui-stat-value { font-weight: 600; }
.ui-delta[data-tone="up"], .ui-badge[data-tone="up"] { color: var(--accent); }
.ui-delta[data-tone="down"], .ui-badge[data-tone="down"] { color: var(--danger); }
.ui-delta[data-tone="flat"], .ui-badge[data-tone="flat"] { color: var(--text-dim); }
.ui-badge {
  font-size: 12px;
  padding: 2px var(--s2);
  border-radius: var(--r-sm);
  border: 1px solid var(--border);
}
FILEEOF

# ── apps/web ────────────────────────────────────────────────────────────────

tpl frontend/apps/web/package.json <<'FILEEOF'
{
  "name": "__SCOPE__/web",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "__SCOPE__/api-client": "workspace:*",
    "__SCOPE__/contracts": "workspace:*",
    "__SCOPE__/ui": "workspace:*",
    "@tanstack/react-query": "^5.62.0",
    "@tanstack/react-router": "^1.95.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.3.4",
    "typescript": "^5.6.0",
    "vite": "^6.0.0"
  }
}
FILEEOF

tpl frontend/apps/web/tsconfig.json <<'FILEEOF'
{ "extends": "../../tsconfig.base.json", "include": ["src", "vite.config.ts"] }
FILEEOF

tpl frontend/apps/web/vite.config.ts <<'FILEEOF'
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: { port: __WEB_PORT__ },
});
FILEEOF

tpl frontend/apps/web/index.html <<'FILEEOF'
<!doctype html>
<html lang="en" data-theme="dark">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>__TITLE__</title>
    <script>
      // Apply persisted theme before first paint to avoid a flash.
      try {
        var t = localStorage.getItem("__PROJECT_NAME__-theme");
        if (t === "light" || t === "dark") document.documentElement.setAttribute("data-theme", t);
      } catch (e) {}
    </script>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
FILEEOF

tpl frontend/apps/web/src/vite-env.d.ts <<'FILEEOF'
/// <reference types="vite/client" />
FILEEOF

tpl frontend/apps/web/src/lib/api.ts <<'FILEEOF'
import { QueryClient } from "@tanstack/react-query";
import { ApiClient } from "__SCOPE__/api-client";

// Empty base = same-origin (single-origin prod deploy behind the API's SPA
// serving). In dev, target the local API. Override with VITE_API_BASE_URL.
const API_BASE =
  import.meta.env.VITE_API_BASE_URL || (import.meta.env.DEV ? "http://localhost:__API_PORT__" : "");

export const api = new ApiClient(API_BASE);

// staleTime mirrors the server's cache TTLs so the client doesn't refetch
// faster than the data actually changes.
export const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false } },
});
FILEEOF

tpl frontend/apps/web/src/router.tsx <<'FILEEOF'
import { createRootRoute, createRoute, createRouter, Outlet } from "@tanstack/react-router";
import { AppShell } from "./AppShell";
import { ItemsPage } from "./pages/ItemsPage";

const rootRoute = createRootRoute({
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
});

const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: "/", component: ItemsPage });

const routeTree = rootRoute.addChildren([indexRoute]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
FILEEOF

tpl frontend/apps/web/src/AppShell.tsx <<'FILEEOF'
import type { ReactNode } from "react";

export function AppShell({ children }: { children: ReactNode }) {
  function toggleTheme() {
    const el = document.documentElement;
    const next = el.getAttribute("data-theme") === "light" ? "dark" : "light";
    el.setAttribute("data-theme", next);
    try { localStorage.setItem("__PROJECT_NAME__-theme", next); } catch (e) {}
  }
  return (
    <div className="shell">
      <header className="shell-header">
        <strong>__TITLE__</strong>
        <button className="ui-chip" onClick={toggleTheme}>◐ theme</button>
      </header>
      <main className="shell-main">{children}</main>
    </div>
  );
}
FILEEOF

tpl frontend/apps/web/src/pages/ItemsPage.tsx <<'FILEEOF'
import { useQuery } from "@tanstack/react-query";
import { Card, Badge, fmtNum, fmtPct, timeAgo, tone } from "__SCOPE__/ui";
import { api } from "../lib/api";

export function ItemsPage() {
  const { data, isLoading, error } = useQuery({ queryKey: ["items"], queryFn: () => api.getItems() });

  if (isLoading) return <p className="muted">Loading…</p>;
  if (error) return <p className="danger">Failed to load: {(error as Error).message}</p>;

  return (
    <>
      <div className="row-between">
        <h1>Items</h1>
        <span className="muted">Updated {timeAgo(data!.lastUpdated)}</span>
      </div>
      <div className="grid">
        {data!.items.map((it) => (
          <Card key={it.id}>
            <div className="row-between">
              <span className="item-name">{it.emoji} {it.name}</span>
              <Badge tone={tone(it.changePercent)}>{fmtPct(it.changePercent)}</Badge>
            </div>
            <div className="item-value">{fmtNum(it.value)}</div>
          </Card>
        ))}
      </div>
    </>
  );
}
FILEEOF

tpl frontend/apps/web/src/styles.css <<'FILEEOF'
body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}
.shell { max-width: 880px; margin: 0 auto; padding: var(--s5); }
.shell-header {
  display: flex; align-items: center; justify-content: space-between;
  padding-bottom: var(--s5); border-bottom: 1px solid var(--border); margin-bottom: var(--s6);
}
.shell-main { display: block; }
.row-between { display: flex; align-items: center; justify-content: space-between; gap: var(--s4); }
h1 { font-size: 20px; margin: 0 0 var(--s5); }
.muted { color: var(--text-dim); font-size: 13px; }
.danger { color: var(--danger); }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: var(--s4); }
.item-name { font-weight: 600; }
.item-value { margin-top: var(--s3); font-size: 22px; font-weight: 700; font-variant-numeric: tabular-nums; }
FILEEOF

tpl frontend/apps/web/src/main.tsx <<'FILEEOF'
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { queryClient } from "./lib/api";
import { router } from "./router";
import "__SCOPE__/ui/tokens.css";
import "__SCOPE__/ui/ui.css";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
FILEEOF

# ── apps/admin (ops portal) ─────────────────────────────────────────────────

tpl frontend/apps/admin/package.json <<'FILEEOF'
{
  "name": "__SCOPE__/admin",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "__SCOPE__/ui": "workspace:*",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.3.4",
    "typescript": "^5.6.0",
    "vite": "^6.0.0"
  }
}
FILEEOF

tpl frontend/apps/admin/tsconfig.json <<'FILEEOF'
{ "extends": "../../tsconfig.base.json", "include": ["src", "vite.config.ts"] }
FILEEOF

tpl frontend/apps/admin/vite.config.ts <<'FILEEOF'
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Standalone local ops tool — never served by the API. Fixed port so the
// API's CORS allow-list can whitelist exactly this origin.
export default defineConfig({
  plugins: [react()],
  server: { port: __ADMIN_PORT__, strictPort: true },
  build: { outDir: "dist" },
});
FILEEOF

tpl frontend/apps/admin/index.html <<'FILEEOF'
<!doctype html>
<html lang="en" data-theme="dark">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>__TITLE__ · Admin</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
FILEEOF

tpl frontend/apps/admin/src/vite-env.d.ts <<'FILEEOF'
/// <reference types="vite/client" />
FILEEOF

tpl frontend/apps/admin/src/main.tsx <<'FILEEOF'
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "__SCOPE__/ui/tokens.css";
import "__SCOPE__/ui/ui.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
FILEEOF

tpl frontend/apps/admin/src/App.tsx <<'FILEEOF'
import { useState } from "react";

// This portal targets your API directly. In production, point it at your
// deployed API (VITE_API_BASE_URL); locally it hits the dev server.
const BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:__API_PORT__";

export function App() {
  const [token, setToken] = useState(() => localStorage.getItem("admin-token") || "");
  const [out, setOut] = useState("Run a check to see output.");

  async function call(path: string) {
    try {
      const res = await fetch(`${BASE}${path}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const body = await res.json().catch(() => ({}));
      setOut(`status ${res.status}\n\n${JSON.stringify(body, null, 2)}`);
    } catch (e) {
      setOut(`Request failed: ${(e as Error).message}`);
    }
  }

  return (
    <div style={{ maxWidth: 720, margin: "40px auto", padding: 24, color: "var(--text)", fontFamily: "system-ui" }}>
      <h1>__TITLE__ · Ops</h1>
      <p style={{ color: "var(--text-dim)" }}>Target: <code>{BASE}</code></p>

      <label className="ui-card" style={{ display: "block", marginBottom: 16 }}>
        <div style={{ marginBottom: 8, color: "var(--text-dim)" }}>ADMIN_SECRET (Bearer token)</div>
        <input
          value={token}
          onChange={(e) => { setToken(e.target.value); localStorage.setItem("admin-token", e.target.value); }}
          placeholder="paste ADMIN_SECRET"
          style={{ width: "100%", padding: 8, background: "var(--bg)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 8 }}
        />
      </label>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button className="ui-chip" onClick={() => call("/api/health")}>GET /api/health</button>
        <button className="ui-chip" onClick={() => call("/api/admin/ping")}>GET /api/admin/ping</button>
        <button className="ui-chip" onClick={() => call("/api/admin/plans")}>GET /api/admin/plans</button>
      </div>

      <pre className="ui-card" style={{ whiteSpace: "pre-wrap", fontSize: 13 }}>{out}</pre>
    </div>
  );
}
FILEEOF

# ════════════════════════════════════════════════════════════════════════════
#  OPS SCRIPTS
# ════════════════════════════════════════════════════════════════════════════

tpl dev.sh <<'FILEEOF'
#!/usr/bin/env bash
# Runs the API (:__API_PORT__) and web client (:__WEB_PORT__) together.
# Logs are prefixed: [API] cyan, [WEB] green. Ctrl+C stops both.
set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"
CYAN='\033[0;36m'; GREEN='\033[0;32m'; RESET='\033[0m'

prefix() { local l="$1" c="$2"; while IFS= read -r line; do printf "${c}[%s]${RESET} %s\n" "$l" "$line"; done; }
cleanup() { echo; echo "Stopping…"; kill "$API_PID" "$WEB_PID" 2>/dev/null; wait 2>/dev/null; exit 0; }
trap cleanup INT TERM

(cd "$ROOT" && npm run server:dev 2>&1) | prefix "API" "$CYAN" &
API_PID=$!
(cd "$ROOT/frontend" && pnpm dev 2>&1) | prefix "WEB" "$GREEN" &
WEB_PID=$!

echo "API  → http://localhost:__API_PORT__"
echo "WEB  → http://localhost:__WEB_PORT__"
echo "Press Ctrl+C to stop both."
wait "$API_PID" "$WEB_PID"
FILEEOF

tpl admin.sh <<'FILEEOF'
#!/usr/bin/env bash
# Launches the local ops/admin portal on :__ADMIN_PORT__. It talks directly to
# your API (local by default; point at prod via VITE_API_BASE_URL). Never
# served by the API itself. Ctrl+C stops it.
set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"
kill_port() { local p="$1" pids; pids="$(lsof -ti:"$p" 2>/dev/null)" || true; [ -n "$pids" ] && kill $pids 2>/dev/null || true; }
kill_port __ADMIN_PORT__
(cd "$ROOT/frontend" && pnpm --filter __SCOPE__/admin dev) &
PID=$!
echo "Admin → http://localhost:__ADMIN_PORT__"
command -v open >/dev/null 2>&1 && (sleep 2 && open "http://localhost:__ADMIN_PORT__") &
trap 'kill "$PID" 2>/dev/null; exit 0' INT TERM
wait "$PID"
FILEEOF

tpl deploy_api.sh <<'FILEEOF'
#!/usr/bin/env bash
# Deploy the API to Fly.io. First time: `fly launch --no-deploy` (or `fly apps
# create __FLY_APP__`), then set secrets, then run this.
set -euo pipefail
command -v fly >/dev/null 2>&1 || { echo "flyctl not found — https://fly.io/docs/flyctl/install/"; exit 1; }
echo "Deploying __FLY_APP__ …"
fly deploy
echo "Done. Set production secrets with:"
echo "  fly secrets set APP_SIGNING_SECRET=... ADMIN_SECRET=... ALLOWED_ORIGINS=https://your-web-domain"
FILEEOF

tpl deploy_web.sh <<'FILEEOF'
#!/usr/bin/env bash
# Build the web SPA and deploy the finished dist/ to Vercel. Building locally
# means Vercel never has to resolve the pnpm workspace. Pass --preview for a
# throwaway URL instead of promoting to production.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WEB_DIR="$SCRIPT_DIR/frontend/apps/web"

PROD=true
for a in "$@"; do [ "$a" = "--preview" ] && PROD=false; done

command -v pnpm >/dev/null 2>&1 || { echo "pnpm not found (repo uses pnpm 9)."; exit 1; }
VERCEL="vercel"; command -v vercel >/dev/null 2>&1 || VERCEL="npx --yes vercel@latest"

echo "Building web…"
( cd "$SCRIPT_DIR/frontend" && [ -d node_modules ] || pnpm install )
( cd "$SCRIPT_DIR/frontend" && VITE_API_BASE_URL="${VITE_API_BASE_URL:-}" pnpm --filter __SCOPE__/web build )

echo "Deploying dist/ to Vercel…"
cd "$WEB_DIR/dist"
if [ "$PROD" = true ]; then
  $VERCEL deploy --prod --yes
else
  $VERCEL deploy --yes
fi
FILEEOF

# ════════════════════════════════════════════════════════════════════════════
#  DOCS
# ════════════════════════════════════════════════════════════════════════════

tpl README.md <<'FILEEOF'
# __TITLE__

Full-stack app: a modular **Express + TypeScript** API and a **pnpm monorepo**
web client (typed `contracts` → `api-client` → `ui` → app), plus a local
ops/admin portal. Scaffolded from a reusable template.

## Quick start

```bash
# 1. API deps (root)
npm install

# 2. Web deps (monorepo — needs pnpm 9)
cd frontend && pnpm install && cd ..

# 3. env
cp .env.example .env

# 4. run API + web together
./dev.sh
#   API → http://localhost:__API_PORT__
#   WEB → http://localhost:__WEB_PORT__
```

Ops portal: `./admin.sh` → http://localhost:__ADMIN_PORT__

## Layout

```
server/            Express API (modular routes, caching, plan gates, leader election)
  index.ts         bootstrap: CORS, logging, rate-limit, HMAC signing, SPA serving
  routes.ts        route registry
  routes/          one file per feature (items = worked example)
  lib/             cache.ts, leader.ts, admin-auth.ts
  plan-enforcement.ts   free|pro gating
frontend/          pnpm workspace
  packages/contracts     zod schemas — the single source of truth for API shapes
  packages/api-client    typed fetch; every method parses its contract
  packages/ui            design tokens + primitives
  apps/web               Vite + React 19 + TanStack Router/Query
  apps/admin             local ops portal (port __ADMIN_PORT__)
dev.sh  admin.sh  deploy_api.sh  deploy_web.sh   ops scripts
Dockerfile  fly.toml                            API deploy (Fly.io)
```

## Add a feature (the recipe)

1. **Contract** — add `frontend/packages/contracts/src/<feature>.ts` (zod) and re-export it from `index.ts`.
2. **Server** — copy `server/routes/items.ts` → `<feature>.ts`, swap the data source, register it in `server/routes.ts`.
3. **Client** — add a `get<Feature>()` method to `packages/api-client/src/index.ts` that parses your new schema.
4. **UI** — add a page under `apps/web/src/pages/` and a route in `router.tsx`.

Deploy: `./deploy_api.sh` (Fly) · `./deploy_web.sh` (Vercel).

See `CLAUDE.md` for the AI-oriented architecture notes.
FILEEOF

tpl CLAUDE.md <<'FILEEOF'
# __TITLE__ — Claude Code Index

Front-loads the non-obvious facts an AI assistant needs before editing. Loaded
automatically at session start.

## Overview

Modular **Express + TypeScript** API + a **pnpm monorepo** web client. One API,
one web app, one local ops portal. Scaffolded from a reusable template.

## Ports (important)

- API: **__API_PORT__** — NOT 5000 (macOS AirPlay owns 5000).
- Web: **__WEB_PORT__**   Admin/ops portal: **__ADMIN_PORT__**.

## Backend (`server/`)

```
index.ts              bootstrap — CORS, body parsing, [TIMING] logging, rate limiting,
                      HMAC request signing, SPA static serving, leader election, listen
routes.ts             registerRoutes() — the route registry; add new features here
plan-enforcement.ts   DevicePlan "free"|"pro"; getDevicePlan/isPro/requirePro
routes/
  items.ts            WORKED EXAMPLE — cache + Cache-Control + Pro gate. Copy this.
  billing.ts          POST /api/billing/webhook → updates devicePlanMap (identifier-agnostic)
  admin.ts            /api/admin/* — Bearer ADMIN_SECRET guarded ops endpoints
lib/
  cache.ts            createCache<T>(ttl) + setCacheHeaders(res, ttl, {private?})
  leader.ts           isLeader() — gate background jobs to one machine (Upstash lease)
  admin-auth.ts       adminAuth middleware (Bearer ADMIN_SECRET)
data/items.ts         static seed for the example feature
```

### Caching pattern (reuse everywhere)
Per-route `createCache<T>(ttlMs)` in-process Map + `setCacheHeaders(res, ttlMs)`
so a CDN edge absorbs concurrent traffic (`max-age` ≈ ½ TTL, `stale-while-revalidate`
≈ full TTL). Mark plan-gated responses `{ private: true }` so an edge can't leak
one device's payload to another.

### Plan enforcement
Two tiers only: `free` | `pro`. `requirePro` guards gated routes (→ 403
`{ code: "PLAN_REQUIRED" }`). **Dev mode** (no `APP_SIGNING_SECRET`) = every
device is `pro`, so no gate fires while building. The billing webhook is
identifier-agnostic: ANY active entitlement → `pro`.

### HMAC signing
`SIGNED_ROUTES` in `index.ts` is empty by default; add expensive/abusable paths
to require an `X-Signature: <ts>.<hmac>` header (5-min replay window). Absent
`APP_SIGNING_SECRET` disables signing (dev).

## Frontend (`frontend/` — pnpm 9, Node 20)

Workspace packages export raw TS (`"main": "./src/index.ts"`) — Vite compiles
them, no per-package build step. Contracts-first is a hard rule:

- `packages/contracts` — zod schema per API response. **Change response shapes here first**; the web build fails at compile time otherwise.
- `packages/api-client` — typed fetch; every method `.parse()`s its contract.
- `packages/ui` — `tokens.css` (dark default, light via `[data-theme]`) + primitives + formatters.
- `apps/web` — Vite + React 19 + TanStack Router (code-based) + Query.
- `apps/admin` — standalone ops portal; **never** served by the API.

## Ops

- `./dev.sh` — API + web together.  `./admin.sh` — ops portal.
- `./deploy_api.sh` — Fly.io (`Dockerfile` runs `tsx server/index.ts`).
- `./deploy_web.sh` — build `dist/` locally, deploy to Vercel (`--preview` for throwaway URL).

## Known pitfalls

| Pitfall | Right |
|---------|-------|
| Server port | __API_PORT__, never 5000 |
| pnpm version | 9 (Node 20 can't run pnpm 11) |
| Changing an API response | update `packages/contracts` FIRST |
| Admin portal in prod | it's local-only; never mount it on the API (`.dockerignore` blocks its dist) |
| Plan gate in dev | dev mode = pro; set `APP_SIGNING_SECRET` to exercise real gating |
| Background job on multi-machine | gate with `isLeader()` |

## Add a feature
contract (zod) → server route (copy `routes/items.ts`, register in `routes.ts`)
→ api-client method (parse the schema) → web page + route. Keep web and any
future clients at data parity.
FILEEOF

# ── Post-generation: executables, git, install ──────────────────────────────
echo ""
info "Finalizing…"
find "$DEST" -maxdepth 1 -name '*.sh' -exec chmod +x {} +
ok "  chmod +x on ops scripts"

if [ "$DO_GIT" = true ] && command -v git >/dev/null 2>&1; then
  ( cd "$DEST" && git init -q && git add -A && git commit -qm "Initial scaffold from create-project.sh" ) \
    && ok "  git repo initialized + first commit"
fi

if [ "$DO_INSTALL" = true ]; then
  info "Installing API deps (npm)…"
  ( cd "$DEST" && npm install ) && ok "  npm install done"
  if command -v pnpm >/dev/null 2>&1; then
    info "Installing web deps (pnpm)…"
    ( cd "$DEST/frontend" && pnpm install ) && ok "  pnpm install done"
  else
    echo -e "${YELLOW}  pnpm not found — skipped web install. Install pnpm 9, then: cd frontend && pnpm install${NC}"
  fi
fi

# ── Next steps ──────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}${BOLD}✓ Created ${TITLE} at ${DEST}${NC}"
echo ""
echo -e "${BOLD}Next steps:${NC}"
echo -e "  ${CYAN}cd $DEST${NC}"
if [ "$DO_INSTALL" != true ]; then
  echo -e "  ${CYAN}npm install${NC}                      ${DIM}# API deps${NC}"
  echo -e "  ${CYAN}cd frontend && pnpm install && cd ..${NC}  ${DIM}# web deps (needs pnpm 9)${NC}"
fi
echo -e "  ${CYAN}cp .env.example .env${NC}"
echo -e "  ${CYAN}./dev.sh${NC}                         ${DIM}# API :$API_PORT + web :$WEB_PORT${NC}"
echo ""
echo -e "  ${DIM}ops portal:${NC} ${CYAN}./admin.sh${NC}   ${DIM}deploy:${NC} ${CYAN}./deploy_api.sh${NC} · ${CYAN}./deploy_web.sh${NC}"
echo -e "  ${DIM}add a feature: see the recipe in README.md / CLAUDE.md${NC}"
echo ""
