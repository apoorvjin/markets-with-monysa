#!/usr/bin/env bash
# Fetches the next 30 days of global (non-US) earnings from TradingEconomics
# and ships them live: writes server/data/te_earnings_snapshot.json, commits,
# and runs `fly deploy`. One command, no manual review step — see the
# 2026-09-08 conversation where this automation was explicitly requested
# over the previously "local, personal-use, manual-review, licensing
# decision pending" design in te_earnings_scrape.sh / te_earnings_to_snapshot.py.
# Those two scripts (HTML scrape of the public /earnings page) are left
# untouched — this is a separate, better data path discovered the same day.
#
# WHY NOT THE PUBLIC /earnings PAGE: tradingeconomics.com/earnings always
# server-renders only ~4 days ("this week" from real server time) no matter
# what query params are sent (d1/d2, from/to, start/end, date, week, offset,
# page — all tried, none change the range). The "Next Week" button is a
# Next.js Server Action, not a link.
#
# THE REAL MECHANISM: the page's client bundle calls fetchEarningsAction via
# Next.js's Server Action protocol (POST to the page URL with a `Next-Action`
# header set to a content-hash action id, body = JSON array of args). That
# action DOES accept an arbitrary {startDate, endDate} — confirmed against a
# 90-day window returning 1000 items (server-side cap) across 16 countries,
# matching real earnings-season seasonality. group/countries args in the
# payload are inert — TE's own client filters by country/importance LOCALLY
# in the browser after fetching the full unfiltered dataset for the date
# window, so this script does the same: take everything TE returns for the
# window, don't try to filter server-side.
#
# FRAGILITY: NEXT_ACTION_ID below is a content hash Next.js generates when
# TE last rebuilt their site. It has no stability guarantee and WILL break on
# TE's next redeploy (the failure mode is a small stub response like
# `0:{"a":"$@1",...}` with no `1:[` data line — this script detects that and
# fails loudly rather than shipping empty/garbage data). To re-derive it:
#   curl -s <TE's /earnings HTML> | grep -oE '_next/static/chunks/[a-z0-9]+\.js'
#   # download each chunk, grep for 'fetchEarningsAction' and the preceding
#   # createServerReference(...) call's first string argument.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
OUT_JSON="$REPO_ROOT/server/data/te_earnings_snapshot.json"
DAYS_AHEAD="${1:-30}"

NEXT_ACTION_ID="40406acdb34fc54cc0b2840debc97581eaef9696cf"
UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36"

START_DATE="$(date -u +%Y-%m-%d)"
END_DATE="$(date -u -v+"${DAYS_AHEAD}"d +%Y-%m-%d 2>/dev/null || date -u -d "+${DAYS_AHEAD} days" +%Y-%m-%d)"

echo "Fetching TradingEconomics earnings for ${START_DATE}..${END_DATE} ..."

RAW_RESPONSE="$(mktemp)"
trap 'rm -f "$RAW_RESPONSE"' EXIT

HTTP_CODE=$(curl -s -o "$RAW_RESPONSE" -w "%{http_code}" \
  -A "$UA" \
  -H "Next-Action: ${NEXT_ACTION_ID}" \
  -H "Content-Type: text/plain;charset=UTF-8" \
  -H "Accept: text/x-component" \
  --data-raw "[{\"startDate\":\"${START_DATE}\",\"endDate\":\"${END_DATE}\"}]" \
  "https://tradingeconomics.com/earnings")

if [[ "$HTTP_CODE" != "200" ]]; then
  echo "error: TradingEconomics returned HTTP $HTTP_CODE — aborting, nothing written" >&2
  exit 1
fi

if ! grep -q '^1:\[' "$RAW_RESPONSE"; then
  echo "error: response has no '1:[' data line — TE's Server Action protocol or NEXT_ACTION_ID" >&2
  echo "       has likely changed (see this script's FRAGILITY note). Aborting, nothing written." >&2
  echo "--- first 500 bytes of response ---" >&2
  head -c 500 "$RAW_RESPONSE" >&2
  exit 1
fi

python3 "$SCRIPT_DIR/te_action_response_to_snapshot.py" "$RAW_RESPONSE" --out "$OUT_JSON"

cd "$REPO_ROOT"
if git diff --quiet -- "$OUT_JSON" && git diff --cached --quiet -- "$OUT_JSON"; then
  echo "No change in $OUT_JSON — skipping commit and deploy."
  exit 0
fi

git add "$OUT_JSON"
git commit -m "$(cat <<EOF
Refresh global earnings snapshot (${START_DATE}..${END_DATE})

Automated fetch via the TradingEconomics fetchEarningsAction Server Action.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"

echo "Deploying to Fly (monysa-api) ..."
fly deploy --app monysa-api

echo "Done: snapshot refreshed, committed, and deployed."
