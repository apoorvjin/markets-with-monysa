#!/usr/bin/env bash
set -euo pipefail

# ── Colors ────────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'; BLUE='\033[0;34m'; YELLOW='\033[1;33m'
RED='\033[0;31m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="$SCRIPT_DIR/frontend"
SITE_DIR="$FRONTEND_DIR/apps/site"
DIST_DIR="$SITE_DIR/dist"

PRIMARY_DOMAIN="www.finbrio.net"
APEX_DOMAIN="finbrio.net"

# ── Flags ─────────────────────────────────────────────────────────────────────
# Default: production deploy to the linked project.
# --preview: push a throwaway preview URL instead of promoting to production.
PROD=true
for arg in "$@"; do
  case "$arg" in
    --preview) PROD=false ;;
  esac
done

# vercel CLI: prefer a global install, fall back to npx (no global needed).
if command -v vercel >/dev/null 2>&1; then
  VERCEL="vercel"
else
  VERCEL="npx --yes vercel@latest"
fi

# Optional non-interactive auth for CI (VERCEL_TOKEN in the environment).
TOKEN_ARG=""
if [ -n "${VERCEL_TOKEN:-}" ]; then
  TOKEN_ARG="--token ${VERCEL_TOKEN}"
fi

# ── Banner ────────────────────────────────────────────────────────────────────
echo -e "${BOLD}${CYAN}"
echo "  ███████╗██╗███╗   ██╗██████╗ ██████╗ ██╗ ██████╗ "
echo "  ██╔════╝██║████╗  ██║██╔══██╗██╔══██╗██║██╔═══██╗"
echo "  █████╗  ██║██╔██╗ ██║██████╔╝██████╔╝██║██║   ██║"
echo "  ██╔══╝  ██║██║╚██╗██║██╔══██╗██╔══██╗██║██║   ██║"
echo "  ██║     ██║██║ ╚████║██████╔╝██║  ██║██║╚██████╔╝"
echo "  ╚═╝     ╚═╝╚═╝  ╚═══╝╚═════╝ ╚═╝  ╚═╝╚═╝ ╚═════╝ "
echo -e "${NC}"
echo -e "${BOLD}  FinBrio — Marketing Site Deploy (Vercel)${NC}"
if [ "$PROD" = true ]; then
  echo -e "  Target: ${CYAN}production → https://${PRIMARY_DOMAIN}${NC}"
else
  echo -e "  Target: ${CYAN}preview (throwaway URL)${NC}"
fi
echo ""

# ── Preflight ─────────────────────────────────────────────────────────────────
if ! command -v pnpm >/dev/null 2>&1; then
  echo -e "${RED}  ✗ pnpm not found. Install it first (repo uses pnpm 9).${NC}"
  exit 1
fi

# ── Step 1: Build the static site locally ─────────────────────────────────────
# We build here and upload the finished dist/ so Vercel never has to resolve the
# pnpm monorepo (workspace:* deps) on its side — the most deterministic path.
echo -e "${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}  Step 1 / 2 — Build${NC}"
echo -e "${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

cd "$FRONTEND_DIR"
if [ ! -d node_modules ]; then
  echo -e "${BLUE}▶ Installing workspace dependencies (first run)...${NC}"
  pnpm install
  echo ""
fi

echo -e "${BLUE}▶ Building @monysa/site (astro check && astro build)...${NC}"
pnpm --filter @monysa/site build

if [ ! -f "$DIST_DIR/index.html" ]; then
  echo -e "${RED}  ✗ Build produced no dist/index.html — aborting.${NC}"
  exit 1
fi
echo -e "${GREEN}  ✓ Built → ${DIST_DIR}${NC}"
echo ""

# ── Step 2: Deploy the prebuilt dist to Vercel ────────────────────────────────
echo -e "${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}  Step 2 / 2 — Deploy${NC}"
echo -e "${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Run vercel from the site dir so the project link (.vercel/) persists across
# rebuilds — dist/ is regenerated each time, so the link must live one level up.
cd "$SITE_DIR"

FIRST_RUN=false
if [ ! -d "$SITE_DIR/.vercel" ] && [ -z "${VERCEL_PROJECT_ID:-}" ]; then
  FIRST_RUN=true
  echo -e "${YELLOW}  First deploy — Vercel will walk you through a one-time setup.${NC}"
  echo -e "  When prompted:"
  echo -e "    • Set up and deploy? ${BOLD}yes${NC}"
  echo -e "    • Link to existing project? ${BOLD}no${NC} (create a new one)"
  echo -e "    • Project name? ${BOLD}finbrio${NC}"
  echo -e "    • In which directory is your code? ${BOLD}./${NC}  (press Enter — it's the dist you're in)"
  echo -e "    • Want to modify build settings? ${BOLD}no${NC}  (it's prebuilt static)"
  echo ""
fi

# Deploy the already-built dist directory. Because dist/ is plain static files
# (+ vercel.json), Vercel serves it as-is with no build step on their side.
if [ "$PROD" = true ]; then
  # shellcheck disable=SC2086
  DEPLOY_URL=$($VERCEL deploy "$DIST_DIR" --prod --yes $TOKEN_ARG | tail -1)
else
  # shellcheck disable=SC2086
  DEPLOY_URL=$($VERCEL deploy "$DIST_DIR" --yes $TOKEN_ARG | tail -1)
fi

echo ""
echo -e "${GREEN}${BOLD}  ✓ Deployed${NC}"
echo -e "  Deployment URL: ${CYAN}${DEPLOY_URL}${NC}"
echo ""

# ── Domain guidance ───────────────────────────────────────────────────────────
if [ "$PROD" = true ]; then
  echo -e "${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${BOLD}  Custom domain — ${PRIMARY_DOMAIN}${NC}"
  echo -e "${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo ""
  if [ "$FIRST_RUN" = true ]; then
    echo -e "  ${BOLD}One-time domain setup (do this once):${NC}"
    echo -e "  1. Attach both domains to the project:"
    echo -e "       ${CYAN}${VERCEL} domains add ${PRIMARY_DOMAIN} finbrio${NC}"
    echo -e "       ${CYAN}${VERCEL} domains add ${APEX_DOMAIN} finbrio${NC}"
    echo -e "     (Vercel will make ${APEX_DOMAIN} redirect to ${PRIMARY_DOMAIN}.)"
    echo ""
    echo -e "  2. At your DNS host for ${BOLD}${APEX_DOMAIN}${NC}, add:"
    echo -e "       ${BOLD}CNAME${NC}  www   →  ${CYAN}cname.vercel-dns.com${NC}"
    echo -e "       ${BOLD}A${NC}      @     →  ${CYAN}76.76.21.21${NC}   (apex → redirect to www)"
    echo ""
    echo -e "  3. Wait for DNS to propagate; Vercel issues the TLS cert automatically."
    echo ""
    echo -e "  After that, every ${BOLD}./deploy_site.sh${NC} promotes straight to"
    echo -e "  ${CYAN}https://${PRIMARY_DOMAIN}${NC} — no further steps."
  else
    echo -e "  Production is live at ${CYAN}https://${PRIMARY_DOMAIN}${NC}"
    echo -e "  (This deploy was promoted to the project's production domain automatically.)"
  fi
  echo ""
fi
