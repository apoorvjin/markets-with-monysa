#!/usr/bin/env bash
# Starts backend (port 5001) and frontend (port 5173) in parallel.
# Logs are colour-coded: [API] in cyan, [WEB] in green.
# Press Ctrl+C to stop both.

set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"

CYAN='\033[0;36m'
GREEN='\033[0;32m'
RESET='\033[0m'

prefix_output() {
  local label="$1" color="$2"
  while IFS= read -r line; do
    printf "${color}[%s]${RESET} %s\n" "$label" "$line"
  done
}

cleanup() {
  echo ""
  echo "Stopping servers..."
  kill "$API_PID" "$WEB_PID" 2>/dev/null
  wait "$API_PID" "$WEB_PID" 2>/dev/null
  exit 0
}
trap cleanup INT TERM

# Backend
(cd "$ROOT" && npm run server:dev 2>&1) | prefix_output "API" "$CYAN" &
API_PID=$!

# Frontend
(cd "$ROOT/frontend" && pnpm dev 2>&1) | prefix_output "WEB" "$GREEN" &
WEB_PID=$!

echo "API  → http://localhost:5001"
echo "WEB  → http://localhost:5173"
echo "Press Ctrl+C to stop both."
echo ""

wait "$API_PID" "$WEB_PID"
