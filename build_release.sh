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
echo -e "${BOLD}  Moby — iPhone Release Builder${NC}"
echo -e "  Backend: ${CYAN}https://monysa-api.fly.dev${NC}"
echo ""

# ── Step 1: Find connected iPhone ─────────────────────────────────────────────
echo -e "${BLUE}▶ Looking for connected iPhone...${NC}"

cd moby

# flutter devices outputs lines like:
#   apoorvjin (mobile)  • <UDID>  • ios  • iOS 26.x.x
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
echo -e "${BOLD}  Building release and installing on ${DEVICE_NAME}...${NC}"
echo -e "${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

flutter clean

echo ""
echo -e "${BLUE}▶ Reinstalling CocoaPods...${NC}"
cd ios && pod deintegrate --quiet && pod install --silent && cd ..

echo ""
flutter run --release -d "$DEVICE_ID"

echo ""
echo -e "${GREEN}${BOLD}  ✓ Done! Moby is installed and running on ${DEVICE_NAME}.${NC}"
echo -e "${CYAN}  Backend: https://monysa-api.fly.dev${NC}"
echo ""
