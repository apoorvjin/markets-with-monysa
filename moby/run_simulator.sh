#!/usr/bin/env bash
set -euo pipefail

# ── Config ────────────────────────────────────────────────────────────────────
DEFAULT_IOS_DEVICE="iPhone 17 Pro"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_PORT=5001

# ── Colours ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

info()    { echo -e "${CYAN}▶ $*${RESET}"; }
success() { echo -e "${GREEN}✓ $*${RESET}"; }
warn()    { echo -e "${YELLOW}⚠ $*${RESET}"; }
error()   { echo -e "${RED}✗ $*${RESET}" >&2; }
header()  { echo -e "\n${BOLD}$*${RESET}"; }

# ── Parse flags ───────────────────────────────────────────────────────────────
PLATFORM="ios"         # ios | android
DEVICE="${DEFAULT_IOS_DEVICE}"
SKIP_BACKEND=false
NO_HOT_RELOAD=false

usage() {
  cat <<EOF
Usage: $(basename "$0") [OPTIONS]

Build and run Moby in a simulator/emulator.

Options:
  -p, --platform   ios | android   (default: ios)
  -d, --device     device name or ID (default: "$DEFAULT_IOS_DEVICE")
  --no-backend     skip backend health check
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
    --no-backend)  SKIP_BACKEND=true; shift ;;
    --release)     NO_HOT_RELOAD=true; shift ;;
    -h|--help)     usage ;;
    *) error "Unknown option: $1"; usage ;;
  esac
done

# ── Pre-flight ────────────────────────────────────────────────────────────────
header "Moby — Flutter Simulator Runner"

# Flutter
if ! command -v flutter &>/dev/null; then
  error "Flutter not found in PATH. Install from https://flutter.dev"
  exit 1
fi
FLUTTER_VERSION=$(flutter --version 2>/dev/null | head -1)
success "Flutter: $FLUTTER_VERSION"

cd "$SCRIPT_DIR"

# ── Backend health check ──────────────────────────────────────────────────────
if [[ "$SKIP_BACKEND" == false ]]; then
  info "Checking backend on port $BACKEND_PORT..."
  if curl -sf "http://localhost:$BACKEND_PORT/api/usa-debt" -o /dev/null --max-time 3; then
    success "Local backend running on :$BACKEND_PORT"
  else
    warn "Local backend not detected on :$BACKEND_PORT"
    warn "App will use production backend: https://monysa-api.fly.dev"
    warn "To test local changes: ./start.sh first, then re-run this script"
  fi
fi

# ── Dependencies ──────────────────────────────────────────────────────────────
header "1/3 — Installing dependencies"
flutter pub get
success "Dependencies ready"

# ── Simulator / Emulator ──────────────────────────────────────────────────────
header "2/3 — Starting simulator"

if [[ "$PLATFORM" == "ios" ]]; then
  # Verify xcrun is available
  if ! command -v xcrun &>/dev/null; then
    error "xcrun not found — Xcode required for iOS simulator"
    exit 1
  fi

  # Check for an already-booted simulator first (unless -d was explicitly passed)
  BOOTED_UDID=$(xcrun simctl list devices booted 2>/dev/null \
    | grep -oE '[A-F0-9-]{36}' | head -1)
  BOOTED_NAME=$(xcrun simctl list devices booted 2>/dev/null \
    | grep -oE '.+\(' | head -1 | sed 's/ ($//')

  if [[ -n "$BOOTED_UDID" ]]; then
    info "Using already-booted simulator: ${BOOTED_NAME} ($BOOTED_UDID)"
    UDID="$BOOTED_UDID"
  else
    # No simulator running — boot the requested (or default) device
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

  # List AVDs
  AVDS=$(emulator -list-avds 2>/dev/null || avdmanager list avd -c 2>/dev/null)
  if [[ -z "$AVDS" ]]; then
    error "No Android Virtual Devices found. Create one in Android Studio."
    exit 1
  fi

  # Pick device (exact match or first available)
  if echo "$AVDS" | grep -qF "$DEVICE"; then
    AVD_NAME=$(echo "$AVDS" | grep -F "$DEVICE" | head -1)
  else
    AVD_NAME=$(echo "$AVDS" | head -1)
    warn "Device \"$DEVICE\" not found — using: $AVD_NAME"
  fi

  # Start emulator in background if not running
  if ! flutter devices 2>/dev/null | grep -qi "emulator"; then
    info "Launching Android emulator: $AVD_NAME..."
    nohup emulator -avd "$AVD_NAME" -no-audio -no-boot-anim \
      &>/tmp/moby_emulator.log &
    info "Waiting for emulator to boot (this may take ~30s)..."
    adb wait-for-device
    # Wait for boot complete
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
header "3/3 — Launching Moby"

BUILD_MODE=""
if [[ "$NO_HOT_RELOAD" == true ]]; then
  BUILD_MODE="--release"
  info "Running in release mode"
else
  info "Running in debug mode (hot reload enabled — press 'r' to reload, 'R' to restart)"
fi

flutter run \
  --device-id "$FLUTTER_DEVICE" \
  $BUILD_MODE

success "Done."
