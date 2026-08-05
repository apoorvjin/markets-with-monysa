#!/usr/bin/env bash
# Starts the admin/ops portal frontend (port 5175). It always talks directly
# to the production Fly API (https://monysa-api.fly.dev) — see
# frontend/apps/admin/src/lib/api.ts — so no local backend is started here.
# Login requires the ADMIN_SECRET configured on the deployed Fly app
# (`fly secrets set ADMIN_SECRET=...`), not anything in a local .env.
# Any existing process on the port is killed first, then it's launched fresh.
# Press Ctrl+C to stop.

set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"

RED='\033[0;31m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
RESET='\033[0m'

# ── Cleanup on exit ────────────────────────────────────────────────────────────

ADMIN_PID=""

cleanup() {
  echo ""
  echo "Stopping…"
  [ -n "$ADMIN_PID" ] && kill "$ADMIN_PID" 2>/dev/null
  [ -n "$ADMIN_PID" ] && wait "$ADMIN_PID" 2>/dev/null
  exit 0
}
trap cleanup INT TERM

# ── Free port 5175 ─────────────────────────────────────────────────────────────

kill_port() {
  local port="$1"
  local pids
  pids="$(lsof -ti:"$port" 2>/dev/null)" || true
  if [ -n "$pids" ]; then
    echo -e "${YELLOW}⚠  Port $port is in use — killing existing process(es).${RESET}"
    kill $pids 2>/dev/null || true
    sleep 1
    pids="$(lsof -ti:"$port" 2>/dev/null)" || true
    [ -n "$pids" ] && { kill -9 $pids 2>/dev/null || true; }
  fi
  return 0
}

kill_port 5175

# ── Start admin Vite dev server ───────────────────────────────────────────────

(cd "$ROOT/frontend" && pnpm --filter @monysa/admin dev -- --strictPort) &
ADMIN_PID=$!

# ── Print URL ──────────────────────────────────────────────────────────────────

echo ""
echo -e "${BOLD}  Monysa Admin${RESET}"
echo -e "  Admin → ${RED}http://localhost:5175${RESET}  (talks to production: https://monysa-api.fly.dev)"
echo -e "  Press ${BOLD}Ctrl+C${RESET} to stop."
echo ""

# Open the admin portal in the default browser after 2 s (macOS only).
if command -v open &>/dev/null; then
  (sleep 2 && open "http://localhost:5175") &
fi

wait "$ADMIN_PID"
