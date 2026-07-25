#!/usr/bin/env bash
set -euo pipefail

# ── Colors ────────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'; BLUE='\033[0;34m'; YELLOW='\033[1;33m'
RED='\033[0;31m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# ── Flags ─────────────────────────────────────────────────────────────────────
DO_CLEAN=false
for arg in "$@"; do
  case "$arg" in
    --clean) DO_CLEAN=true ;;
  esac
done

# ── Read current marketing version from pubspec (for display + bump baseline) ──
PUBSPEC="moby/pubspec.yaml"
CURRENT_VERSION=$(grep '^version:' "$PUBSPEC" | head -1 | sed 's/version:[[:space:]]*//' | cut -d'+' -f1)

# ── Banner ────────────────────────────────────────────────────────────────────
echo -e "${BOLD}${CYAN}"
echo "  ███████╗██╗███╗   ██╗██████╗ ██████╗ ██╗ ██████╗ "
echo "  ██╔════╝██║████╗  ██║██╔══██╗██╔══██╗██║██╔═══██╗"
echo "  █████╗  ██║██╔██╗ ██║██████╔╝██████╔╝██║██║   ██║"
echo "  ██╔══╝  ██║██║╚██╗██║██╔══██╗██╔══██╗██║██║   ██║"
echo "  ██║     ██║██║ ╚████║██████╔╝██║  ██║██║╚██████╔╝"
echo "  ╚═╝     ╚═╝╚═╝  ╚═══╝╚═════╝ ╚═╝  ╚═╝╚═╝ ╚═════╝ "
echo -e "${NC}"
echo -e "${BOLD}  FinBrio — TestFlight Build & Upload${NC}"
echo -e "  App: ${CYAN}FinBrio (com.monysa.moby)${NC}  Current version: ${CYAN}${CURRENT_VERSION}${NC}"
echo -e "  Backend: ${CYAN}https://monysa-api.fly.dev${NC}"
echo ""

# ── Collect Secrets ───────────────────────────────────────────────────────────
echo -e "${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}  Build Configuration${NC}"
echo -e "${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Release type — bumps the marketing version (CFBundleShortVersionString).
# The build number (CFBundleVersion) is always a fresh timestamp so TestFlight
# never rejects a duplicate, independent of the marketing version.
IFS='.' read -r VMAJOR VMINOR VPATCH <<< "$CURRENT_VERSION"
echo -e "  ${BOLD}Release type${NC} (current: ${CYAN}${CURRENT_VERSION}${NC}):"
echo -e "    ${BOLD}1)${NC} Bug fix   → ${CYAN}${VMAJOR}.${VMINOR}.$((VPATCH + 1))${NC}"
echo -e "    ${BOLD}2)${NC} Feature   → ${CYAN}${VMAJOR}.$((VMINOR + 1)).0${NC}"
echo -e "    ${BOLD}3)${NC} Keep      → ${CYAN}${CURRENT_VERSION}${NC}"
echo -e -n "  > "
read -r REL_TYPE

case "$REL_TYPE" in
  1) NEW_VERSION="${VMAJOR}.${VMINOR}.$((VPATCH + 1))" ;;
  2) NEW_VERSION="${VMAJOR}.$((VMINOR + 1)).0" ;;
  3) NEW_VERSION="${CURRENT_VERSION}" ;;
  *) echo -e "${RED}  ✗ Invalid choice — enter 1, 2, or 3.${NC}"; exit 1 ;;
esac

BUILD_NUMBER=$(date +%Y%m%d%H%M)
# Persist the new marketing version so the next run bumps from here; the build
# number stays out of pubspec's committed history via the flag below.
sed -i '' "s/^version:.*/version: ${NEW_VERSION}+${BUILD_NUMBER}/" "$PUBSPEC"
echo -e "  ${GREEN}✓ Building ${BOLD}${NEW_VERSION} (${BUILD_NUMBER})${NC}"
echo ""

# RevenueCat iOS key (optional — skip to build without in-app purchases)
echo -e "  ${BOLD}RevenueCat iOS Key${NC} (press Enter to skip):"
echo -e -n "  > "
read -r RC_KEY

if [ -n "$RC_KEY" ]; then
  echo -e "  ${GREEN}✓ RevenueCat key provided${NC}"
else
  echo -e "  ${YELLOW}⚠  No RevenueCat key — in-app purchases will be unavailable${NC}"
fi
echo ""

# App Store Connect credentials
echo -e "  ${BOLD}App Store Connect Apple ID${NC} (e.g. you@example.com):"
echo -e -n "  > "
read -r APPLE_ID

echo ""
echo -e "  ${BOLD}App-Specific Password${NC} (generate at appleid.apple.com → Security):"
echo -e -n "  > "
read -rs APP_SPECIFIC_PASSWORD
echo ""
echo ""

if [ -z "$APPLE_ID" ] || [ -z "$APP_SPECIFIC_PASSWORD" ]; then
  echo -e "${RED}  ✗ Apple ID and password are required for upload.${NC}"
  exit 1
fi

echo -e "  ${GREEN}✓ Credentials accepted${NC}"
echo ""

# ── Build dart-defines ────────────────────────────────────────────────────────
DART_DEFINES=""
if [ -n "$RC_KEY" ]; then
  DART_DEFINES="--dart-define=REVENUECAT_IOS_KEY=${RC_KEY}"
fi
# No APP_SIGNING_SECRET → dev mode (all plans unlocked, no HMAC gate)

# ── Step 1: Flutter dependencies ──────────────────────────────────────────────
echo -e "${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}  Step 1 / 4 — Dependencies${NC}"
echo -e "${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

cd moby

if [ "$DO_CLEAN" = true ]; then
  echo -e "${YELLOW}▶ Full clean requested — wiping build artifacts...${NC}"
  flutter clean
  echo ""
fi

echo -e "${BLUE}▶ Fetching Dart dependencies...${NC}"
flutter pub get
echo ""

echo -e "${BLUE}▶ Syncing CocoaPods...${NC}"
cd ios && LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 pod install --silent && cd ..
echo ""

# ── Step 2: Build IPA ─────────────────────────────────────────────────────────
echo -e "${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}  Step 2 / 4 — Building IPA (release)${NC}"
echo -e "${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "${BLUE}▶ Running flutter build ipa...${NC}"
echo ""

# shellcheck disable=SC2086
flutter build ipa --release ${DART_DEFINES} \
  --build-name="${NEW_VERSION}" \
  --build-number="${BUILD_NUMBER}"

IPA_PATH=$(find build/ios/ipa -name "*.ipa" | head -1)
if [ -z "$IPA_PATH" ]; then
  echo -e "${RED}  ✗ IPA not found after build. Check Xcode signing / provisioning.${NC}"
  exit 1
fi

echo ""
echo -e "${GREEN}  ✓ IPA built: ${BOLD}${IPA_PATH}${NC}"
IPA_SIZE=$(du -sh "$IPA_PATH" | cut -f1)
echo -e "    Size: ${IPA_SIZE}"
echo ""

# ── Step 3: Validate ──────────────────────────────────────────────────────────
echo -e "${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}  Step 3 / 4 — Validating with App Store Connect${NC}"
echo -e "${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "${BLUE}▶ Validating IPA...${NC}"

xcrun altool --validate-app \
  -f "$IPA_PATH" \
  -t ios \
  -u "$APPLE_ID" \
  -p "$APP_SPECIFIC_PASSWORD" \
  --output-format normal

echo ""
echo -e "${GREEN}  ✓ Validation passed${NC}"
echo ""

# ── Step 4: Upload ────────────────────────────────────────────────────────────
echo -e "${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}  Step 4 / 4 — Uploading to App Store Connect${NC}"
echo -e "${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "${BLUE}▶ Uploading IPA to TestFlight...${NC}"

xcrun altool --upload-app \
  -f "$IPA_PATH" \
  -t ios \
  -u "$APPLE_ID" \
  -p "$APP_SPECIFIC_PASSWORD" \
  --output-format normal

echo ""
echo -e "${GREEN}${BOLD}  ✓ Upload complete!${NC}"
echo ""
echo -e "  ${BOLD}Next steps:${NC}"
echo -e "  1. Open ${CYAN}appstoreconnect.apple.com${NC} → TestFlight"
echo -e "  2. Wait ~10 min for Apple to process the build"
echo -e "  3. Add testers and submit for external testing (first time requires Beta App Review)"
echo ""
