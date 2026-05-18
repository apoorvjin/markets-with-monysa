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
echo ""

# ── Step 1: Detect WiFi IP ────────────────────────────────────────────────────
echo -e "${BLUE}▶ Detecting WiFi IP...${NC}"

WIFI_IP=""
for iface in en0 en1 en2; do
  WIFI_IP=$(ipconfig getifaddr "$iface" 2>/dev/null || true)
  [ -n "$WIFI_IP" ] && break
done

if [ -z "$WIFI_IP" ]; then
  echo -e "${RED}  ✗ Could not detect WiFi IP. Are you connected to WiFi?${NC}"
  exit 1
fi

echo -e "${GREEN}  ✓ WiFi IP: ${BOLD}${WIFI_IP}${NC}"

# ── Step 2: Patch baseUrl in api_endpoints.dart ───────────────────────────────
ENDPOINTS="moby/lib/core/network/api_endpoints.dart"
echo -e "${BLUE}▶ Patching baseUrl → http://${WIFI_IP}:5001 ...${NC}"

sed -i '' \
  "s|static String baseUrl = 'http://[^']*';|static String baseUrl = 'http://${WIFI_IP}:5001';|" \
  "$ENDPOINTS"

PATCHED=$(grep "baseUrl" "$ENDPOINTS")
echo -e "${GREEN}  ✓ ${PATCHED// /}${NC}"

# ── Step 3: Ensure backend is running ────────────────────────────────────────
echo -e "${BLUE}▶ Checking backend on port 5001...${NC}"

if nc -z localhost 5001 2>/dev/null; then
  echo -e "${GREEN}  ✓ Backend already running${NC}"
else
  echo -e "${YELLOW}  ⚡ Starting backend in a new Terminal window...${NC}"

  if command -v osascript &>/dev/null; then
    osascript - "$SCRIPT_DIR" <<'APPLESCRIPT'
on run argv
  set scriptDir to item 1 of argv
  tell application "Terminal"
    activate
    do script "cd " & quoted form of scriptDir & " && npm run server:dev"
  end tell
end run
APPLESCRIPT
  else
    SERVER_LOG="/tmp/moby-server.log"
    npm run server:dev > "$SERVER_LOG" 2>&1 &
    echo -e "  Server started in background (logs: ${SERVER_LOG})"
  fi

  echo -ne "  Waiting for backend"
  for i in $(seq 1 40); do
    if nc -z localhost 5001 2>/dev/null; then
      echo -e " ${GREEN}ready!${NC}"
      break
    fi
    if [ "$i" -eq 40 ]; then
      echo -e " ${RED}timed out! Check that the server started correctly.${NC}"
      exit 1
    fi
    echo -n "."
    sleep 0.5
  done
fi

# ── Step 4: Find connected iPhone ─────────────────────────────────────────────
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

# ── Step 5: Build & install release ───────────────────────────────────────────
echo ""
echo -e "${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}  Building release and installing on ${DEVICE_NAME}...${NC}"
echo -e "${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

flutter run --release -d "$DEVICE_ID"

echo ""
echo -e "${GREEN}${BOLD}  ✓ Done! Moby is installed and running on ${DEVICE_NAME}.${NC}"
echo -e "${CYAN}  Backend: http://${WIFI_IP}:5001${NC}"
echo ""
