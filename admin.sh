#!/usr/bin/env bash
# Starts the admin frontend (port 5175) and the backend (port 5001) in parallel.
# If the backend is already running on :5001, it is reused and not restarted.
# Logs are colour-coded: [API] in cyan, [ADMIN] in red.
# Press Ctrl+C to stop processes started by this script.

set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"

CYAN='\033[0;36m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
BOLD='\033[1m'
RESET='\033[0m'

# ── Prefixed log streaming ─────────────────────────────────────────────────────

prefix_output() {
  local label="$1" color="$2"
  while IFS= read -r line; do
    printf "${color}[%s]${RESET} %s\n" "$label" "$line"
  done
}

# ── Cleanup on exit ────────────────────────────────────────────────────────────

API_PID=""
ADMIN_PID=""

cleanup() {
  echo ""
  echo "Stopping…"
  [ -n "$API_PID" ]   && kill "$API_PID"   2>/dev/null
  [ -n "$ADMIN_PID" ] && kill "$ADMIN_PID" 2>/dev/null
  [ -n "$API_PID" ]   && wait "$API_PID"   2>/dev/null
  [ -n "$ADMIN_PID" ] && wait "$ADMIN_PID" 2>/dev/null
  exit 0
}
trap cleanup INT TERM

# ── Check ADMIN_SECRET ─────────────────────────────────────────────────────────

ENV_FILE="$ROOT/.env"
ADMIN_SECRET_SET=false

if [ -f "$ENV_FILE" ] && grep -q "^ADMIN_SECRET=" "$ENV_FILE" 2>/dev/null; then
  SECRET_VAL="$(grep "^ADMIN_SECRET=" "$ENV_FILE" | cut -d= -f2- | tr -d '[:space:]')"
  [ -n "$SECRET_VAL" ] && ADMIN_SECRET_SET=true
fi

if [ "$ADMIN_SECRET_SET" = false ]; then
  echo -e "${YELLOW}⚠  ADMIN_SECRET is not set in .env${RESET}"
  echo -e "   Add it to enable admin login:"
  echo -e "   ${BOLD}echo 'ADMIN_SECRET=your-secret-here' >> .env${RESET}"
  echo ""
fi

# ── Check port 5175 ───────────────────────────────────────────────────────────

if lsof -ti:5175 &>/dev/null; then
  echo -e "${YELLOW}⚠  Port 5175 is already in use.${RESET}"
  echo -e "   Run ${BOLD}lsof -ti:5175 | xargs kill${RESET} to free it, then retry."
  echo ""
  exit 1
fi

# ── Start API server (skip if already running) ────────────────────────────────

API_REUSED=false

if lsof -ti:5001 &>/dev/null; then
  echo -e "${GREEN}✓  API already running on :5001 — reusing it.${RESET}"
  API_REUSED=true
else
  (cd "$ROOT" && npm run server:dev 2>&1) | prefix_output "API  " "$CYAN" &
  API_PID=$!
fi

# ── Start admin Vite dev server ───────────────────────────────────────────────

(cd "$ROOT/frontend" && pnpm --filter @monysa/admin dev -- --strictPort 2>&1) | prefix_output "ADMIN" "$RED" &
ADMIN_PID=$!

# ── Print URLs ────────────────────────────────────────────────────────────────

echo ""
echo -e "${BOLD}  Monysa Admin${RESET}"
if [ "$API_REUSED" = true ]; then
  echo -e "  API    → ${CYAN}http://localhost:5001${RESET}  ${GREEN}(reused)${RESET}"
else
  echo -e "  API    → ${CYAN}http://localhost:5001${RESET}"
fi
echo -e "  Admin  → ${RED}http://localhost:5175${RESET}"
echo -e "  Press ${BOLD}Ctrl+C${RESET} to stop."
echo ""

# Open the admin portal in the default browser after 2 s (macOS only).
if command -v open &>/dev/null; then
  (sleep 2 && open "http://localhost:5175") &
fi

# Wait only on PIDs we own.
if [ "$API_REUSED" = true ]; then
  wait "$ADMIN_PID"
else
  wait "$API_PID" "$ADMIN_PID"
fi
