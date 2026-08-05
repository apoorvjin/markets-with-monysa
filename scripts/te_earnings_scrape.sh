#!/usr/bin/env bash
# Local, personal-use tool: downloads tradingeconomics.com/earnings and turns
# it into CSVs mapped onto this app's EarningsRow schema. See Plan 2 in
# ~/.claude/plans/the-app-is-a-wiggly-conway.md for the full writeup —
# in particular, why this stays a local script and isn't wired into the
# shipped app without a separate licensing decision first.
#
# Usage:
#   ./te_earnings_scrape.sh [--country "India"] [--out-dir ./out] [--use-cached path/to.html]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT_DIR="$SCRIPT_DIR/out"
COUNTRY=""
CACHED_HTML=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --country)
      COUNTRY="$2"; shift 2 ;;
    --out-dir)
      OUT_DIR="$2"; shift 2 ;;
    --use-cached)
      CACHED_HTML="$2"; shift 2 ;;
    -h|--help)
      grep '^#' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *)
      echo "unknown argument: $1" >&2; exit 1 ;;
  esac
done

mkdir -p "$OUT_DIR"

if [[ -n "$CACHED_HTML" ]]; then
  if [[ ! -f "$CACHED_HTML" ]]; then
    echo "error: --use-cached file not found: $CACHED_HTML" >&2
    exit 1
  fi
  HTML_FILE="$CACHED_HTML"
  echo "using cached HTML: $HTML_FILE"
else
  TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
  HTML_FILE="$OUT_DIR/te_earnings_raw_${TIMESTAMP}.html"
  echo "fetching https://tradingeconomics.com/earnings ..."
  HTTP_CODE=$(curl -s -o "$HTML_FILE" -w "%{http_code}" \
    -A "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36" \
    "https://tradingeconomics.com/earnings")

  if [[ "$HTTP_CODE" != "200" ]]; then
    echo "error: fetch failed with HTTP $HTTP_CODE" >&2
    exit 1
  fi

  SIZE=$(wc -c < "$HTML_FILE" | tr -d ' ')
  if [[ "$SIZE" -lt 100000 ]]; then
    echo "error: response looks too small ($SIZE bytes) — likely blocked or an error page, not the real earnings page" >&2
    exit 1
  fi
  echo "saved $SIZE bytes to $HTML_FILE"
fi

PARSE_ARGS=("$HTML_FILE" --out-dir "$OUT_DIR")
if [[ -n "$COUNTRY" ]]; then
  PARSE_ARGS+=(--country "$COUNTRY")
fi

python3 "$SCRIPT_DIR/te_earnings_parse.py" "${PARSE_ARGS[@]}"

echo "done:"
echo "  raw:    $OUT_DIR/te_earnings_raw.csv"
echo "  mapped: $OUT_DIR/te_earnings_mapped.csv"
