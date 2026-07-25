#!/usr/bin/env bash
set -euo pipefail

# ── Colors ────────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'; BLUE='\033[0;34m'; YELLOW='\033[1;33m'
RED='\033[0;31m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/frontend"

PORT=7777

# ── Flags ─────────────────────────────────────────────────────────────────────
# Default: production build + preview (what finbrio.net will actually serve).
# --dev:   astro dev server with hot reload (for iterating on the site).
DEV_MODE=false
for arg in "$@"; do
  case "$arg" in
    --dev) DEV_MODE=true ;;
  esac
done

# ── Banner ────────────────────────────────────────────────────────────────────
echo -e "${BOLD}${CYAN}"
echo "  ███████╗██╗███╗   ██╗██████╗ ██████╗ ██╗ ██████╗ "
echo "  ██╔════╝██║████╗  ██║██╔══██╗██╔══██╗██║██╔═══██╗"
echo "  █████╗  ██║██╔██╗ ██║██████╔╝██████╔╝██║██║   ██║"
echo "  ██╔══╝  ██║██║╚██╗██║██╔══██╗██╔══██╗██║██║   ██║"
echo "  ██║     ██║██║ ╚████║██████╔╝██║  ██║██║╚██████╔╝"
echo "  ╚═╝     ╚═╝╚═╝  ╚═══╝╚═════╝ ╚═╝  ╚═╝╚═╝ ╚═════╝ "
echo -e "${NC}"
echo -e "${BOLD}  FinBrio — Marketing Site (finbrio.net)${NC}"
if [ "$DEV_MODE" = true ]; then
  echo -e "  Mode: ${CYAN}dev (hot reload)${NC}  Port: ${CYAN}${PORT}${NC}"
else
  echo -e "  Mode: ${CYAN}build + preview${NC}  Port: ${CYAN}${PORT}${NC}"
fi
echo ""

# ── Preflight ─────────────────────────────────────────────────────────────────
if ! command -v pnpm >/dev/null 2>&1; then
  echo -e "${RED}  ✗ pnpm not found. Install it first (repo needs pnpm 9).${NC}"
  exit 1
fi

if [ ! -d node_modules ]; then
  echo -e "${BLUE}▶ Installing workspace dependencies (first run)...${NC}"
  pnpm install
  echo ""
fi

# Free the port if a previous run is still listening on it.
EXISTING_PID=$(lsof -ti tcp:${PORT} 2>/dev/null || true)
if [ -n "$EXISTING_PID" ]; then
  echo -e "${YELLOW}⚠  Port ${PORT} in use (pid ${EXISTING_PID}) — stopping previous server...${NC}"
  kill "$EXISTING_PID" 2>/dev/null || true
  sleep 1
fi

# ── Run ───────────────────────────────────────────────────────────────────────
# Invoke astro directly from the package dir — pnpm's `--` arg forwarding
# passes a literal `--` through to astro, which then ignores --port.
cd apps/site

if [ "$DEV_MODE" = true ]; then
  echo -e "${BLUE}▶ Starting dev server with hot reload...${NC}"
  echo -e "  Open ${BOLD}${CYAN}http://localhost:${PORT}${NC}  (Ctrl-C to stop)"
  echo ""
  exec npx astro dev --port "$PORT"
else
  echo -e "${BLUE}▶ Building production site (astro check && astro build)...${NC}"
  echo ""
  npx astro check && npx astro build
  echo ""
  echo -e "${GREEN}  ✓ Build complete${NC}"
  echo -e "${BLUE}▶ Serving dist/ ...${NC}"
  echo -e "  Open ${BOLD}${CYAN}http://localhost:${PORT}${NC}  (Ctrl-C to stop)"
  echo ""
  exec npx astro preview --port "$PORT"
fi
