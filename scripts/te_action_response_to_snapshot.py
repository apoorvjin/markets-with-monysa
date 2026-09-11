#!/usr/bin/env python3
"""Convert a raw TradingEconomics fetchEarningsAction response (Next.js
Server Action Flight-protocol body) into server/data/te_earnings_snapshot.json,
matching server/trading.ts's GlobalEarningsItem/GlobalEarningsSnapshot types
exactly (symbol, teSymbol, name, sector, earningsDate, marketCap,
marketCapFormatted, epsForecast, time, country, countryCode).

Companion to te_earnings_refresh_and_deploy.sh — not meant to be run standalone
against the old te_earnings_scrape.sh HTML-scrape output (different input shape).

Yahoo-symbol suffix map and marketCap parsing are copied from
te_earnings_to_snapshot.py to keep both pipelines producing identical shapes;
see that file for the suffix-mapping evidence/reasoning.

Usage:
    python3 te_action_response_to_snapshot.py <raw_response_file> --out <snapshot.json>
"""

import argparse
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

CONFIRMED_TE_SUFFIX_TO_YAHOO = {
    "US": "", "LN": ".L", "FP": ".PA", "NA": ".AS", "CN": ".TO", "GR": ".DE",
    "SM": ".MC", "PL": ".LS", "IM": ".MI", "JP": ".T", "MM": ".MX", "TI": ".IS",
    "SJ": ".JO", "SW": ".SW", "AU": ".AX", "IN": ".NS", "BZ": ".SA", "BS": ".SA",
}
UNCONFIRMED_TE_SUFFIX_TO_YAHOO = {
    "HK": ".HK", "KS": ".KS", "KQ": ".KQ", "TW": ".TW", "SI": ".SI",
}
TE_SUFFIX_TO_YAHOO = {**CONFIRMED_TE_SUFFIX_TO_YAHOO, **UNCONFIRMED_TE_SUFFIX_TO_YAHOO}

NUMBER_RE = re.compile(r"-?\d[\d,]*\.?\d*")
UNIT_MULTIPLIERS = {"K": 1e3, "M": 1e6, "B": 1e9, "T": 1e12}
TIME_MAP = {"AM": "pre-market", "PM": "after-hours"}


def te_symbol_to_yahoo(te_symbol: str) -> str | None:
    if ":" not in te_symbol:
        return None
    base, suffix = te_symbol.rsplit(":", 1)
    yahoo_suffix = TE_SUFFIX_TO_YAHOO.get(suffix.upper())
    if yahoo_suffix is None:
        return None
    return f"{base}{yahoo_suffix}"


def parse_money(raw: str | None) -> float | None:
    """Handles the API's observed double-'$' artifact ('$$28.25B') the same
    way as te_earnings_to_snapshot.py's parse_money: lstrip('$') strips all
    leading '$' chars regardless of count."""
    if not raw or raw.strip() in ("-", ""):
        return None
    text = raw.strip().lstrip("$").replace(",", "")
    unit = text[-1:].upper()
    mult = UNIT_MULTIPLIERS.get(unit)
    if mult:
        text = text[:-1]
    else:
        mult = 1.0
    m = NUMBER_RE.search(text)
    if not m:
        return None
    try:
        return float(m.group(0)) * mult
    except ValueError:
        return None


def clean_market_cap_formatted(raw: str | None) -> str | None:
    if not raw or raw.strip() in ("-", ""):
        return None
    return "$" + raw.strip().lstrip("$")


def extract_flight_array(raw_text: str) -> list[dict]:
    """The Flight-protocol response is line-oriented: '0:{...}\\n1:[...]'.
    We want the '1:' line's JSON array — find it directly rather than
    assuming it's the last line (the protocol can emit more lines after it)."""
    for line in raw_text.splitlines():
        if line.startswith("1:["):
            return json.loads(line[2:])
    raise ValueError("no '1:[' line found in response")


def build_snapshot(items_raw: list[dict]) -> dict:
    items = []
    countries_seen: dict[str, str] = {}

    for r in items_raw:
        te_symbol = r.get("symbol") or ""
        if not te_symbol or not r.get("date") or not r.get("country") or not r.get("iso2"):
            continue  # malformed row — skip rather than ship a broken entry
        yahoo_symbol = te_symbol_to_yahoo(te_symbol)
        eps = r.get("eps") or {}
        eps_forecast = eps.get("forecast") or eps.get("actual") or None
        country_code = str(r["iso2"]).upper()
        countries_seen[country_code] = r["country"]

        market_cap_raw = r.get("marketCap")
        items.append({
            "symbol": yahoo_symbol or te_symbol,
            "teSymbol": te_symbol,
            "name": r.get("name") or te_symbol,
            "sector": "",
            "earningsDate": r["date"],
            "marketCap": parse_money(market_cap_raw),
            "marketCapFormatted": clean_market_cap_formatted(market_cap_raw),
            "epsForecast": eps_forecast,
            "time": TIME_MAP.get(r.get("session") or "", ""),
            "country": r["country"],
            "countryCode": country_code,
        })

    countries = [{"code": code, "name": name} for code, name in sorted(countries_seen.items())]
    return {
        "generatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z"),
        "countries": countries,
        "items": items,
    }


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("raw_response_file", type=Path)
    ap.add_argument("--out", type=Path, required=True)
    args = ap.parse_args()

    raw_text = args.raw_response_file.read_text(encoding="utf-8", errors="ignore")
    try:
        items_raw = extract_flight_array(raw_text)
    except (ValueError, json.JSONDecodeError) as e:
        print(f"error: failed to parse TE response: {e}", file=sys.stderr)
        return 1

    if not items_raw:
        print("error: TE returned zero items for the requested window — refusing to overwrite "
              "the existing snapshot with an empty one", file=sys.stderr)
        return 1

    snapshot = build_snapshot(items_raw)
    if not snapshot["items"]:
        print("error: all rows were malformed/skipped — refusing to write an empty snapshot", file=sys.stderr)
        return 1

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(snapshot, indent=2) + "\n", encoding="utf-8")

    dates = sorted({i["earningsDate"] for i in snapshot["items"]})
    mapped_count = sum(1 for i in snapshot["items"] if i["symbol"] != i["teSymbol"])
    print(f"wrote {len(snapshot['items'])} items, {len(snapshot['countries'])} countries, "
          f"dates {dates[0]}..{dates[-1]} to {args.out}")
    print(f"  Yahoo-symbol mapped: {mapped_count}/{len(snapshot['items'])}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
