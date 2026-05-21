#!/usr/bin/env bash
set -euo pipefail

# ── Config ────────────────────────────────────────────────────────────────────
DEFAULT_IOS_DEVICE="iPhone 17 Pro"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$SCRIPT_DIR"
BACKEND_PORT=5001
PROD_BACKEND="https://monysa-api.fly.dev"
LOCAL_BACKEND="http://localhost:$BACKEND_PORT"

# ── Colours ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

info()    { echo -e "${CYAN}▶ $*${RESET}"; }
success() { echo -e "${GREEN}✓ $*${RESET}"; }
warn()    { echo -e "${YELLOW}⚠ $*${RESET}"; }
error()   { echo -e "${RED}✗ $*${RESET}" >&2; }
header()  { echo -e "\n${BOLD}$*${RESET}"; }

# ── Parse flags ───────────────────────────────────────────────────────────────
PLATFORM="ios"
DEVICE="${DEFAULT_IOS_DEVICE}"
NO_HOT_RELOAD=false

usage() {
  cat <<EOF
Usage: $(basename "$0") [OPTIONS]

Build and run Moby in a simulator/emulator.

Options:
  -p, --platform   ios | android   (default: ios)
  -d, --device     device name or ID (default: "$DEFAULT_IOS_DEVICE")
  --release        run in release mode (no hot reload)
  -h, --help       show this help

Examples:
  ./run_simulator.sh
  ./run_simulator.sh -p android
  ./run_simulator.sh -d "iPhone 16e"
  ./run_simulator.sh --release
EOF
  exit 0
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -p|--platform) PLATFORM="$2"; shift 2 ;;
    -d|--device)   DEVICE="$2";   shift 2 ;;
    --release)     NO_HOT_RELOAD=true; shift ;;
    -h|--help)     usage ;;
    *) error "Unknown option: $1"; usage ;;
  esac
done

# ── Banner ────────────────────────────────────────────────────────────────────
header "Moby — Flutter Simulator Runner"

# Flutter check
if ! command -v flutter &>/dev/null; then
  error "Flutter not found in PATH. Install from https://flutter.dev"
  exit 1
fi
FLUTTER_VERSION=$(flutter --version 2>/dev/null | head -1)
success "Flutter: $FLUTTER_VERSION"

cd "$SCRIPT_DIR/moby"

# ── Backend selection ─────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}  Which backend do you want to use?${RESET}"
echo -e "  ${CYAN}[L]${RESET} Local   — http://localhost:$BACKEND_PORT"
echo -e "  ${CYAN}[S]${RESET} Server  — $PROD_BACKEND"
echo ""
read -rp "  Enter choice [L/S]: " BACKEND_CHOICE

case "$(echo "$BACKEND_CHOICE" | tr '[:lower:]' '[:upper:]')" in
  L|LOCAL)
    BACKEND_URL="$LOCAL_BACKEND"
    USE_LOCAL=true
    ;;
  S|SERVER)
    BACKEND_URL="$PROD_BACKEND"
    USE_LOCAL=false
    ;;
  *)
    error "Invalid choice \"$BACKEND_CHOICE\" — enter L or S"
    exit 1
    ;;
esac

echo ""
success "Backend: $BACKEND_URL"

# ── Start local backend if needed ─────────────────────────────────────────────
if [[ "$USE_LOCAL" == true ]]; then
  if curl -sf "http://localhost:$BACKEND_PORT/" -o /dev/null --max-time 2; then
    success "Local backend already running on :$BACKEND_PORT"
  else
    info "Local backend not running — starting it now..."
    if command -v osascript &>/dev/null; then
      # macOS: open a dedicated Terminal window for the server
      osascript - "$REPO_DIR" 2>/dev/null <<'APPLESCRIPT'
on run argv
  set repoDir to item 1 of argv
  tell application "Terminal"
    activate
    do script "cd " & quoted form of repoDir & " && npm run server:dev"
  end tell
end run
APPLESCRIPT
    else
      # Fallback: background process
      npm --prefix "$REPO_DIR" run server:dev > /tmp/markets-server.log 2>&1 &
      echo -e "  Server log: /tmp/markets-server.log"
    fi

    # Wait for backend to be ready
    echo -ne "  Waiting for backend"
    for i in $(seq 1 40); do
      if curl -sf "http://localhost:$BACKEND_PORT/" -o /dev/null --max-time 1; then
        echo -e " ${GREEN}ready!${RESET}"
        break
      fi
      if [[ "$i" -eq 40 ]]; then
        echo -e " ${RED}timed out!${RESET}"
        error "Backend did not start in time. Check /tmp/markets-server.log"
        exit 1
      fi
      echo -n "."
      sleep 0.5
    done
    success "Local backend ready on :$BACKEND_PORT"
  fi
fi

# ── Dependencies ──────────────────────────────────────────────────────────────
header "1/3 — Installing dependencies"
flutter pub get
success "Dependencies ready"

# ── Simulator / Emulator ──────────────────────────────────────────────────────
header "2/3 — Starting simulator"

if [[ "$PLATFORM" == "ios" ]]; then
  if ! command -v xcrun &>/dev/null; then
    error "xcrun not found — Xcode required for iOS simulator"
    exit 1
  fi

  BOOTED_UDID=$(xcrun simctl list devices booted 2>/dev/null \
    | grep -oE '[A-F0-9-]{36}' | head -1)
  BOOTED_NAME=$(xcrun simctl list devices booted 2>/dev/null \
    | grep -oE '.+\(' | head -1 | sed 's/ ($//')

  if [[ -n "$BOOTED_UDID" ]]; then
    info "Using already-booted simulator: ${BOOTED_NAME} ($BOOTED_UDID)"
    UDID="$BOOTED_UDID"
  else
    UDID=$(xcrun simctl list devices available 2>/dev/null \
      | grep -F "$DEVICE" \
      | grep -oE '[A-F0-9-]{36}' \
      | head -1)

    if [[ -z "$UDID" ]]; then
      error "iOS simulator not found: \"$DEVICE\""
      echo ""
      info "Available devices:"
      xcrun simctl list devices available 2>/dev/null \
        | grep -E "iPhone|iPad" | sed 's/^/    /'
      exit 1
    fi

    info "No simulator running — booting \"$DEVICE\" ($UDID)..."
    xcrun simctl boot "$UDID"
    open -a Simulator 2>/dev/null || true
  fi

  success "Simulator ready: $UDID"
  FLUTTER_DEVICE="$UDID"

elif [[ "$PLATFORM" == "android" ]]; then
  if ! command -v emulator &>/dev/null && ! command -v avdmanager &>/dev/null; then
    error "Android emulator not found. Install Android Studio with an AVD."
    exit 1
  fi

  AVDS=$(emulator -list-avds 2>/dev/null || avdmanager list avd -c 2>/dev/null)
  if [[ -z "$AVDS" ]]; then
    error "No Android Virtual Devices found. Create one in Android Studio."
    exit 1
  fi

  if echo "$AVDS" | grep -qF "$DEVICE"; then
    AVD_NAME=$(echo "$AVDS" | grep -F "$DEVICE" | head -1)
  else
    AVD_NAME=$(echo "$AVDS" | head -1)
    warn "Device \"$DEVICE\" not found — using: $AVD_NAME"
  fi

  if ! flutter devices 2>/dev/null | grep -qi "emulator"; then
    info "Launching Android emulator: $AVD_NAME..."
    nohup emulator -avd "$AVD_NAME" -no-audio -no-boot-anim \
      &>/tmp/moby_emulator.log &
    info "Waiting for emulator to boot (this may take ~30s)..."
    adb wait-for-device
    until adb shell getprop sys.boot_completed 2>/dev/null | grep -q "^1$"; do
      sleep 2
    done
  fi

  success "Android emulator ready: $AVD_NAME"
  FLUTTER_DEVICE="emulator-5554"

else
  error "Unknown platform: $PLATFORM (use 'ios' or 'android')"
  exit 1
fi

# ── Run ───────────────────────────────────────────────────────────────────────
header "3/3 — Launching Moby → $BACKEND_URL"

BUILD_FLAGS=""
if [[ "$NO_HOT_RELOAD" == true ]]; then
  BUILD_FLAGS="--release"
  info "Running in release mode"
else
  info "Running in debug mode (hot reload enabled — press 'r' to reload, 'R' to restart)"
fi

flutter run \
  --device-id "$FLUTTER_DEVICE" \
  --dart-define=API_BASE_URL="$BACKEND_URL" \
  $BUILD_FLAGS

success "Done."
