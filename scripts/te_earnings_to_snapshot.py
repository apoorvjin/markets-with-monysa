#!/usr/bin/env python3
"""Convert te_earnings_raw.csv (from te_earnings_parse.py) into the JSON
snapshot the live server serves from server/data/te_earnings_snapshot.json.

Still entirely local/manual — this does not touch the network or the live
server. You run this, review the diff, then commit + deploy by hand. See
Plan 3 in ~/.claude/plans/the-app-is-a-wiggly-conway.md for the full
refresh ritual and the licensing caveat that still applies.

Usage:
    python3 te_earnings_to_snapshot.py out/te_earnings_raw.csv \
        --out ../server/data/te_earnings_snapshot.json
"""

import argparse
import csv
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from te_earnings_parse import TIME_MAP, parse_money  # noqa: E402

# TE exchange-suffix -> Yahoo Finance suffix. Keyed by the part of the TE
# symbol AFTER the colon (e.g. "MC:FP" -> "FP"), which identifies which
# exchange THIS SPECIFIC listing trades on — confirmed against live data to
# be independent of, and sometimes different from, the company's home-
# country flag (e.g. Chinese/Swiss/German/Mexican ADRs all show ":US"; ":CN"
# means Toronto in every one of 54 observed rows, never China). Do not key
# this off country — see Plan 3's evidence table for the full reasoning.
#
# Confirmed against a real 688-row scrape (2026-07-27):
CONFIRMED_TE_SUFFIX_TO_YAHOO = {
    "US": "",       # incl. non-US companies' US ADRs — Yahoo also uses no suffix for these
    "LN": ".L",      # London
    "FP": ".PA",     # Paris
    "NA": ".AS",     # Amsterdam
    "CN": ".TO",     # Toronto (NOT China)
    "GR": ".DE",     # Xetra/Frankfurt
    "SM": ".MC",     # Madrid
    "PL": ".LS",     # Lisbon
    "IM": ".MI",     # Milan
    "JP": ".T",      # Tokyo
    "MM": ".MX",     # Mexico
    "TI": ".IS",     # Istanbul
    "SJ": ".JO",     # Johannesburg
    "SW": ".SW",     # Switzerland
    "AU": ".AX",     # ASX
    "IN": ".NS",     # India — defaults to NSE; TE doesn't distinguish NSE/BSE
    "BZ": ".SA",     # Brazil (B3/Sao Paulo) — e.g. SANB11:BZ, n=3 in the sample
    "BS": ".SA",     # Brazil, alternate TE code seen once (ABEV3:BS) — same exchange, mapped the same
}
# Standard Yahoo convention, NOT directly observed in the sample this table
# was built from — include but don't claim they're verified.
UNCONFIRMED_TE_SUFFIX_TO_YAHOO = {
    "HK": ".HK",     # Hong Kong
    "KS": ".KS",     # Korea (KRX)
    "KQ": ".KQ",     # Korea (KOSDAQ)
    "TW": ".TW",     # Taiwan
    "SI": ".SI",     # Singapore
}
TE_SUFFIX_TO_YAHOO = {**CONFIRMED_TE_SUFFIX_TO_YAHOO, **UNCONFIRMED_TE_SUFFIX_TO_YAHOO}


def te_symbol_to_yahoo(te_symbol: str) -> str | None:
    if ":" not in te_symbol:
        return None
    base, suffix = te_symbol.rsplit(":", 1)
    yahoo_suffix = TE_SUFFIX_TO_YAHOO.get(suffix.upper())
    if yahoo_suffix is None:
        return None  # unmapped exchange — row still ships, just won't deep-link
    return f"{base}{yahoo_suffix}"


def build_snapshot(rows: list[dict]) -> dict:
    items = []
    countries_seen: dict[str, str] = {}  # code -> name

    for r in rows:
        te_symbol = r["teSymbol"]
        yahoo_symbol = te_symbol_to_yahoo(te_symbol)
        eps_forecast = r.get("epsConsensus") or r.get("epsActual") or ""
        countries_seen[r["countryCode"]] = r["country"]

        items.append({
            "symbol": yahoo_symbol or te_symbol,
            "teSymbol": te_symbol,
            "name": r["name"],
            "sector": "",
            "earningsDate": r["date"],
            "marketCap": parse_money(r.get("marketCapRaw")),
            "marketCapFormatted": r.get("marketCapRaw") or None,
            "epsForecast": eps_forecast or None,
            "time": TIME_MAP.get(r.get("timeRaw") or "", ""),
            "country": r["country"],
            "countryCode": r["countryCode"],
        })

    countries = [{"code": code, "name": name} for code, name in sorted(countries_seen.items())]
    return {
        "generatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z"),
        "countries": countries,
        "items": items,
    }


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("raw_csv", type=Path)
    ap.add_argument("--out", type=Path, default=Path("server/data/te_earnings_snapshot.json"))
    args = ap.parse_args()

    if not args.raw_csv.exists():
        print(f"error: {args.raw_csv} not found — run te_earnings_scrape.sh first", file=sys.stderr)
        return 1

    with args.raw_csv.open(newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    if not rows:
        print("error: raw CSV is empty", file=sys.stderr)
        return 1

    snapshot = build_snapshot(rows)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(snapshot, indent=2), encoding="utf-8")

    mapped_count = sum(1 for i in snapshot["items"] if i["symbol"] != i["teSymbol"])
    unmapped_suffixes = sorted({
        r["teSymbol"].rsplit(":", 1)[1]
        for r in rows
        if ":" in r["teSymbol"] and r["teSymbol"].rsplit(":", 1)[1].upper() not in TE_SUFFIX_TO_YAHOO
    })

    print(f"wrote {len(snapshot['items'])} items, {len(snapshot['countries'])} countries to {args.out}")
    print(f"  Yahoo-symbol mapped: {mapped_count}/{len(snapshot['items'])}")
    if unmapped_suffixes:
        print(f"  unmapped TE suffixes (rows kept, won't deep-link): {', '.join(unmapped_suffixes)}", file=sys.stderr)
    print(f"\nnext: bump TE_EARNINGS_SNAPSHOT_AS_OF in server/trading.ts to \"{snapshot['generatedAt']}\", "
          f"review the diff, commit, and fly deploy.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
