#!/usr/bin/env bash
set -euo pipefail

# ── Colors ────────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'; BLUE='\033[0;34m'; YELLOW='\033[1;33m'
RED='\033[0;31m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

APP="monysa-api"
NEW_ORIGIN="https://app.finbrio.net"

echo -e "${BOLD}${CYAN}  Add ${NEW_ORIGIN} to ALLOWED_ORIGINS on ${APP}${NC}"
echo ""

if ! command -v fly >/dev/null 2>&1; then
  echo -e "${RED}  ✗ fly CLI not found.${NC}"
  exit 1
fi

echo -e "${BLUE}▶ Reading current ALLOWED_ORIGINS from the running machine...${NC}"
CURRENT=$(fly ssh console -a "$APP" -C 'printenv ALLOWED_ORIGINS' 2>/dev/null | tr -d '\r' || true)

if [ -z "$CURRENT" ]; then
  echo -e "${RED}  ✗ Could not read the current value (SSH failed, or the var is unset).${NC}"
  echo -e "  Check manually with: ${CYAN}fly ssh console -a ${APP} -C 'printenv ALLOWED_ORIGINS'${NC}"
  exit 1
fi
echo -e "${GREEN}  ✓ Current: ${CURRENT}${NC}"
echo ""

# Idempotent: skip if it's already there so this is safe to re-run.
if echo ",$CURRENT," | grep -qF ",$NEW_ORIGIN,"; then
  echo -e "${YELLOW}  Already present — nothing to do.${NC}"
  exit 0
fi

NEW_VALUE="${CURRENT},${NEW_ORIGIN}"
echo -e "${BLUE}▶ Setting new value:${NC}"
echo -e "  ${CYAN}${NEW_VALUE}${NC}"
echo ""
echo -e "${YELLOW}  This triggers a rolling redeploy of ${APP} (brief restart, ~seconds).${NC}"
echo ""

fly secrets set "ALLOWED_ORIGINS=${NEW_VALUE}" -a "$APP"

echo ""
echo -e "${GREEN}${BOLD}  ✓ Done${NC} — ${NEW_ORIGIN} is now allow-listed."
