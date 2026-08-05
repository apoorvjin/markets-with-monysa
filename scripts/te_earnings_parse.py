#!/usr/bin/env python3
"""Parse a saved tradingeconomics.com/earnings HTML page into CSVs.

Local, personal-use tool only (see scripts/te_earnings_scrape.sh header).
Stdlib only — no pip install required.

Usage:
    python3 te_earnings_parse.py <html_file> --out-dir out [--country "India"]
"""

import argparse
import csv
import html
import re
import sys
from pathlib import Path

TABLE_MARKER = "calendar-events-table"
DATE_HEADER_RE = re.compile(r'data-date-header="(\d{4}-\d{2}-\d{2})"')
TR_RE = re.compile(r"<tr.*?</tr>", re.S)
TD_RE = re.compile(r"<td[^>]*>.*?</td>", re.S)
TAG_RE = re.compile(r"<[^>]+>")
FLAG_RE = re.compile(r'title="([^"]*)"\s+class="flag flag-([a-zA-Z]+)"')
SYMBOL_RE = re.compile(r'class="calendar-event-link[^"]*"[^>]*href="[^"]*">([^<]+)</a>')
NAME_RE = re.compile(r'class="text-xs text-gray-500[^"]*">([^<]+)</div>')
IMPACT_TITLE_RE = re.compile(r'title="([^"]*)"')
NUMBER_RE = re.compile(r"-?\d[\d,]*\.?\d*")

# Column order confirmed against the live page's own <th> header row:
# 0=symbol/name/country, 1=EPS actual/consensus, 2=EPS previous, 3=Revenue
# actual/consensus, 4=Revenue previous, 5=MarketCap, 6=Fiscal, 7=Time,
# 8=Impact star, 9=alert bell (not data).
COL_EPS = 1
COL_EPS_PREV = 2
COL_REV = 3
COL_REV_PREV = 4
COL_MKTCAP = 5
COL_FISCAL = 6
COL_TIME = 7
COL_IMPACT = 8
MIN_TDS = 9

UNIT_MULTIPLIERS = {"K": 1e3, "M": 1e6, "B": 1e9, "T": 1e12}

# TE's own Time convention (AM/PM), confirmed live — distinct from Nasdaq's
# "pre-market"/"after-hours" strings and FMP's "bmo"/"amc". Do not assume
# these are interchangeable with the app's own normEarningsTime() helper,
# which expects different input text.
TIME_MAP = {"AM": "pre-market", "PM": "after-hours"}


def cell_text(td_html: str) -> str:
    return html.unescape(TAG_RE.sub("", td_html)).strip()


def parse_pair(td_html: str) -> tuple[str | None, str | None]:
    """'EPS/Consensus'-style cell: '- / 14.95' -> (None, '14.95');
    a bare already-reported value has no ' / ' -> (value, None)."""
    text = cell_text(td_html)
    if not text:
        return None, None
    if " / " in text:
        left, right = text.split(" / ", 1)
        left = left.strip()
        right = right.strip()
        return (None if left in ("-", "") else left, None if right in ("-", "") else right)
    return (None if text == "-" else text, None)


def parse_number(raw: str | None) -> float | None:
    """Preserves a leading '-' (TE uses plain minus signs for negative EPS,
    confirmed live against real rows, e.g. Indian Oil's -5.40 consensus) —
    deliberately NOT reusing the app's parseEps(), which assumes parentheses
    mark negatives and would silently strip a leading '-', flipping the sign."""
    if not raw:
        return None
    m = NUMBER_RE.search(raw.replace(",", ""))
    if not m:
        return None
    try:
        return float(m.group(0))
    except ValueError:
        return None


def parse_money(raw: str | None) -> float | None:
    """'$287.61B' -> 287610000000.0. Deliberately NOT reusing the app's
    parseMarketCap(), which strips all non-digit characters including the
    unit suffix letter and would silently return 287.61 instead — 9 orders
    of magnitude wrong."""
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


def parse_rows(page_html: str) -> tuple[list[dict], int]:
    idx = page_html.find(TABLE_MARKER)
    if idx == -1:
        return [], 0
    region = page_html[idx:]
    current_date: str | None = None
    rows: list[dict] = []
    skipped = 0

    for tr in TR_RE.findall(region):
        date_m = DATE_HEADER_RE.search(tr)
        if date_m:
            current_date = date_m.group(1)
            continue
        if "calendar-event-link" not in tr:
            continue  # header row or non-data row

        tds = TD_RE.findall(tr)
        if len(tds) < MIN_TDS:
            skipped += 1
            continue

        flag_m = FLAG_RE.search(tds[0])
        symbol_m = SYMBOL_RE.search(tds[0])
        name_m = NAME_RE.search(tds[0])
        if not (flag_m and symbol_m and current_date):
            skipped += 1
            continue

        eps_actual, eps_consensus = parse_pair(tds[COL_EPS])
        rev_actual, rev_consensus = parse_pair(tds[COL_REV])
        impact_m = IMPACT_TITLE_RE.search(tds[COL_IMPACT]) if len(tds) > COL_IMPACT else None
        time_raw = cell_text(tds[COL_TIME])

        rows.append({
            "date": current_date,
            "country": flag_m.group(1),
            "countryCode": flag_m.group(2).upper(),
            "teSymbol": symbol_m.group(1),
            "name": html.unescape(name_m.group(1) if name_m else symbol_m.group(1)).strip(),
            "epsActual": eps_actual,
            "epsConsensus": eps_consensus,
            "epsPreviousPeriod": cell_text(tds[COL_EPS_PREV]) or None,
            "revenueActual": rev_actual,
            "revenueConsensus": rev_consensus,
            "revenuePreviousPeriod": cell_text(tds[COL_REV_PREV]) or None,
            "marketCapRaw": cell_text(tds[COL_MKTCAP]) or None,
            "fiscal": cell_text(tds[COL_FISCAL]) or None,
            "timeRaw": time_raw or None,
            "impact": impact_m.group(1) if impact_m else None,
        })

    return rows, skipped


def map_to_app_schema(row: dict) -> dict:
    """Maps onto server/trading.ts's EarningsRow shape (symbol, name, sector,
    earningsDate, marketCap, marketCapFormatted, epsForecast, lastYearEps,
    epsGrowthPct, numEstimates, time), plus country/countryCode for filtering.

    NOTE on lastYearEps/epsGrowthPct: TE's "previous" EPS column is the prior
    REPORTING PERIOD (usually last quarter), not the prior YEAR's same-quarter
    actual that the app's lastYearEps/epsGrowthPct fields assume (that's how
    Nasdaq's source defines them). Mapping TE's previous-quarter value into
    lastYearEps would silently produce a QoQ delta mislabeled as YoY growth —
    left null here rather than shipping a misleading number.
    """
    return {
        "symbol": row["teSymbol"],  # TE-native format (e.g. "MC:FP"), not Yahoo's ".PA" — see plan's follow-up note
        "name": row["name"],
        "sector": "",  # unavailable from TE's earnings table
        "earningsDate": row["date"],
        "marketCap": parse_money(row["marketCapRaw"]),
        "marketCapFormatted": row["marketCapRaw"],  # already "$X.XXB"-formatted by TE
        "epsForecast": row["epsConsensus"] or row["epsActual"],
        "lastYearEps": "",  # deliberately left blank — see docstring above
        "epsGrowthPct": "",  # deliberately left blank — see docstring above
        "numEstimates": "",  # unavailable from TE (same known gap as the app's existing AV fallback)
        "time": TIME_MAP.get(row["timeRaw"] or "", ""),
        "country": row["country"],
        "countryCode": row["countryCode"],
    }


RAW_FIELDS = [
    "date", "country", "countryCode", "teSymbol", "name",
    "epsActual", "epsConsensus", "epsPreviousPeriod",
    "revenueActual", "revenueConsensus", "revenuePreviousPeriod",
    "marketCapRaw", "fiscal", "timeRaw", "impact",
]
MAPPED_FIELDS = [
    "symbol", "name", "sector", "earningsDate", "marketCap", "marketCapFormatted",
    "epsForecast", "lastYearEps", "epsGrowthPct", "numEstimates", "time",
    "country", "countryCode",
]


def write_csv(path: Path, fieldnames: list[str], rows: list[dict]) -> None:
    with path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("html_file", type=Path)
    ap.add_argument("--out-dir", type=Path, default=Path("out"))
    ap.add_argument("--country", type=str, default=None,
                     help="Case-insensitive filter on country name, e.g. 'India'")
    args = ap.parse_args()

    if not args.html_file.exists():
        print(f"error: {args.html_file} not found", file=sys.stderr)
        return 1

    page_html = args.html_file.read_text(encoding="utf-8", errors="ignore")
    rows, skipped = parse_rows(page_html)
    if not rows:
        print("error: 0 rows parsed — page structure may have changed (see plan's fragility note)", file=sys.stderr)
        return 1

    args.out_dir.mkdir(parents=True, exist_ok=True)
    write_csv(args.out_dir / "te_earnings_raw.csv", RAW_FIELDS, rows)

    mapped = [map_to_app_schema(r) for r in rows]
    if args.country:
        needle = args.country.strip().lower()
        mapped = [m for m in mapped if m["country"].lower() == needle]
        if not mapped:
            print(f"warning: 0 rows matched --country {args.country!r}", file=sys.stderr)
    write_csv(args.out_dir / "te_earnings_mapped.csv", MAPPED_FIELDS, mapped)

    dates = sorted({r["date"] for r in rows})
    countries = sorted({r["country"] for r in rows})
    print(f"parsed {len(rows)} rows ({skipped} skipped), dates {dates[0]}..{dates[-1]}, "
          f"{len(countries)} countries: {', '.join(countries)}")
    if args.country:
        print(f"--country {args.country!r}: {len(mapped)} rows written to te_earnings_mapped.csv")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
