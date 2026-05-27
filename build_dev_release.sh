#!/usr/bin/env bash
set -euo pipefail

# ── Colors ────────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'; BLUE='\033[0;34m'; YELLOW='\033[1;33m'
RED='\033[0;31m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# ── Banner ────────────────────────────────────────────────────────────────────
echo -e "${BOLD}${CYAN}"
echo "  ███╗   ███╗ ██████╗ ██████╗ ██╗   ██╗"
echo "  ████╗ ████║██╔═══██╗██╔══██╗╚██╗ ██╔╝"
echo "  ██╔████╔██║██║   ██║██████╔╝ ╚████╔╝ "
echo "  ██║╚██╔╝██║██║   ██║██╔══██╗  ╚██╔╝  "
echo "  ██║ ╚═╝ ██║╚██████╔╝██████╔╝   ██║   "
echo "  ╚═╝     ╚═╝ ╚═════╝ ╚═════╝    ╚═╝   "
echo -e "${NC}"
echo -e "${BOLD}  Moby — iPhone Dev Release Builder${NC}"
echo -e "  Backend: ${CYAN}https://monysa-api.fly.dev${NC}"
echo ""

# ── Plan Selection ────────────────────────────────────────────────────────────
echo -e "${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}  Select Dev Plan${NC}"
echo -e "${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "  ${BOLD}1) Free${NC}    — All paywalls active; simulate a new user with no subscription"
echo -e "             Gated: AI Signals, Analyst Notes, Alerts, Best Setups, AI Exposure,"
echo -e "             Backtest Filter"
echo ""
echo -e "  ${BOLD}2) Pro${NC}     — Unlocks: AI Signals, Analyst Notes (unlimited), Alerts (unlimited),"
echo -e "             Best Setups, Push Notifications"
echo -e "             Still gated: AI Tariff Exposure, Backtest Filter ${YELLOW}(Insight only)${NC}"
echo ""
echo -e "  ${BOLD}3) Insight${NC} — Unlocks everything: all Pro features + AI Tariff Exposure Analysis,"
echo -e "             Backtest Filter, API Access"
echo ""
echo -e -n "  ${BOLD}Enter plan [1/2/3]:${NC} "

DEV_PLAN_VALUE=""
DEV_PLAN_LABEL=""
DEV_PLAN_DART_DEFINE=""

while true; do
  read -r PLAN_CHOICE
  case "$PLAN_CHOICE" in
    1)
      DEV_PLAN_VALUE="free"
      DEV_PLAN_LABEL="Free (all paywalls active)"
      DEV_PLAN_DART_DEFINE=""        # No dart-define → falls back to Plan.free at runtime
      break
      ;;
    2)
      DEV_PLAN_VALUE="pro"
      DEV_PLAN_LABEL="Pro"
      DEV_PLAN_DART_DEFINE="--dart-define=DEV_PLAN=pro"
      break
      ;;
    3)
      DEV_PLAN_VALUE="insight"
      DEV_PLAN_LABEL="Insight (all features unlocked)"
      DEV_PLAN_DART_DEFINE="--dart-define=DEV_PLAN=insight"
      break
      ;;
    *)
      echo -e "  ${RED}Invalid choice '${PLAN_CHOICE}'. Please enter 1, 2, or 3:${NC} "
      echo -e -n "  ${BOLD}Enter plan [1/2/3]:${NC} "
      ;;
  esac
done

echo ""
echo -e "  ${GREEN}✓ Building with plan: ${BOLD}${DEV_PLAN_LABEL}${NC}"
echo ""

# ── Step 1: Find connected iPhone ─────────────────────────────────────────────
echo -e "${BLUE}▶ Looking for connected iPhone...${NC}"

cd moby

DEVICE_LINE=$(flutter devices 2>/dev/null \
  | grep -E "• ios +•" \
  | grep -v "simulator" \
  | head -1 || true)

if [ -z "$DEVICE_LINE" ]; then
  echo -e "${RED}  ✗ No iPhone found.${NC}"
  echo ""
  echo -e "  Make sure your iPhone is:"
  echo -e "  ${BOLD}1.${NC} Connected via USB cable"
  echo -e "  ${BOLD}2.${NC} Shows 'Trust' prompt → tap Trust"
  echo -e "  ${BOLD}3.${NC} Unlocked (screen on)"
  echo ""
  echo -e "  Then re-run this script."
  exit 1
fi

DEVICE_NAME=$(echo "$DEVICE_LINE" | awk -F'•' '{print $1}' | xargs)
DEVICE_ID=$(echo "$DEVICE_LINE" | awk -F'•' '{print $2}' | xargs)
IOS_VERSION=$(echo "$DEVICE_LINE" | awk -F'•' '{print $4}' | xargs)

echo -e "${GREEN}  ✓ Found: ${BOLD}${DEVICE_NAME}${NC}${GREEN} (${IOS_VERSION})${NC}"
echo -e "    ID: ${DEVICE_ID}"

# ── Step 2: Build & install release ───────────────────────────────────────────
echo ""
echo -e "${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}  Building dev release [${DEV_PLAN_LABEL}] and installing on ${DEVICE_NAME}...${NC}"
echo -e "${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

flutter clean

echo ""
echo -e "${BLUE}▶ Reinstalling CocoaPods...${NC}"
cd ios && pod deintegrate --quiet && pod install --silent && cd ..

echo ""
flutter run --release -d "$DEVICE_ID" \
  ${DEV_PLAN_DART_DEFINE}

echo ""
echo -e "${GREEN}${BOLD}  ✓ Done! Moby is installed and running on ${DEVICE_NAME}.${NC}"
echo -e "${YELLOW}  Active plan: ${BOLD}${DEV_PLAN_LABEL}${NC}"
echo -e "${CYAN}  Backend: https://monysa-api.fly.dev${NC}"
echo ""
