#!/usr/bin/env bash
set -euo pipefail

# ── Colors ──────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'; BLUE='\033[0;34m'; YELLOW='\033[1;33m'
RED='\033[0;31m'; BOLD='\033[1m'; NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo -e "${BOLD}${BLUE}"
echo "  ███╗   ███╗ ██████╗ ███╗   ██╗██╗   ██╗███████╗ █████╗ "
echo "  ████╗ ████║██╔═══██╗████╗  ██║╚██╗ ██╔╝██╔════╝██╔══██╗"
echo "  ██╔████╔██║██║   ██║██╔██╗ ██║ ╚████╔╝ ███████╗███████║"
echo "  ██║╚██╔╝██║██║   ██║██║╚██╗██║  ╚██╔╝  ╚════██║██╔══██║"
echo "  ██║ ╚═╝ ██║╚██████╔╝██║ ╚████║   ██║   ███████║██║  ██║"
echo "  ╚═╝     ╚═╝ ╚═════╝ ╚═╝  ╚═══╝   ╚═╝   ╚══════╝╚═╝  ╚═╝"
echo -e "${NC}"
echo -e "${BOLD}  Global Markets Intelligence — Local Dev Launcher${NC}"
echo ""

# ── Load .env ────────────────────────────────────────────────────────────────
if [ -f ".env" ]; then
  echo -e "${GREEN}  Loading .env${NC}"
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
else
  echo -e "${YELLOW}  No .env found — using defaults (OpenAI/Finnhub features disabled)${NC}"
fi

# ── Config ───────────────────────────────────────────────────────────────────
export PORT="${PORT:-5001}"
export EXPO_PUBLIC_DOMAIN="${EXPO_PUBLIC_DOMAIN:-localhost:$PORT}"

echo ""
echo -e "  ${BOLD}Backend port:${NC}  ${PORT}"
echo -e "  ${BOLD}Frontend URL:${NC}  http://localhost:8081"
echo -e "  ${BOLD}API domain:${NC}    ${EXPO_PUBLIC_DOMAIN}"
echo ""

# ── Kill stale processes ──────────────────────────────────────────────────────
for port in "$PORT" 8081; do
  pid=$(lsof -ti ":$port" 2>/dev/null || true)
  if [ -n "$pid" ]; then
    echo -e "${YELLOW}  Clearing port $port (PID $pid)...${NC}"
    kill -9 "$pid" 2>/dev/null || true
    sleep 0.3
  fi
done

# ── Start Express backend ─────────────────────────────────────────────────────
echo -e "${BLUE}  Starting Express backend...${NC}"

SERVER_LOG="/tmp/monysa-server.log"

USING_OSASCRIPT=false

if command -v osascript &>/dev/null; then
  # macOS: open a dedicated Terminal window for the server.
  # Pass SCRIPT_DIR as an arg so the heredoc can be single-quoted (no bash expansion
  # inside AppleScript, which chokes on em dashes and unescaped special chars).
  osascript - "$SCRIPT_DIR" 2>/dev/null <<'APPLESCRIPT' && USING_OSASCRIPT=true || USING_OSASCRIPT=false
on run argv
  set scriptDir to item 1 of argv
  tell application "Terminal"
    activate
    do script "cd " & quoted form of scriptDir & " && npm run server:dev"
  end tell
end run
APPLESCRIPT
fi

if [ "$USING_OSASCRIPT" = false ]; then
  # Fallback: background process, logs to file
  npm run server:dev > "$SERVER_LOG" 2>&1 &
  SERVER_PID=$!
  echo -e "  Server PID: ${SERVER_PID}  (logs: ${SERVER_LOG})"
fi

# ── Wait for backend ──────────────────────────────────────────────────────────
echo -ne "  Waiting for backend"
for i in $(seq 1 40); do
  if nc -z localhost "$PORT" 2>/dev/null; then
    echo -e " ${GREEN}ready!${NC}"
    break
  fi
  if [ "$i" -eq 40 ]; then
    echo -e " ${RED}timed out!${NC}"
    if [ "${USING_OSASCRIPT:-false}" = false ]; then
      echo ""
      echo -e "${RED}  Server logs:${NC}"
      cat "$SERVER_LOG" 2>/dev/null || true
    fi
    exit 1
  fi
  echo -n "."
  sleep 0.5
done

# ── Cleanup trap (for background-mode only) ───────────────────────────────────
if [ "${USING_OSASCRIPT:-false}" = false ]; then
  cleanup() {
    echo -e "\n${YELLOW}  Shutting down...${NC}"
    kill "$SERVER_PID" 2>/dev/null || true
  }
  trap cleanup EXIT INT TERM
fi

# ── Start Expo ────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${GREEN}  Backend running. Starting Expo...${NC}"
echo -e "${BLUE}  Press ${BOLD}w${NC}${BLUE} → open in browser · ${BOLD}i${NC}${BLUE} → iOS Simulator · ${BOLD}a${NC}${BLUE} → Android emulator${NC}"
echo ""

EXPO_PUBLIC_DOMAIN="$EXPO_PUBLIC_DOMAIN" npx expo start --localhost
