# Core Business Logic — Monysa / Moby

---

## 1. Domain Concepts

**Two tiers of assets:**

- **Pre-catalogued** (49 in `TRADING_ASSETS`): Commodities (14), Indices (15), Crypto (10), Forex (10) — each has name, category, flag, currency. Crypto assets also carry a Finnhub symbol for real-time feeds.
- **Arbitrary equities**: Any valid Yahoo Finance ticker (e.g. `RELIANCE.NS`, `AAPL`). These work on all trading endpoints but have no metadata in the catalogue — name falls back to the symbol string.

**Country tariff model** (hardcoded, April 2025): 113 countries, each with:
- A top-level tariff rate (US rate applied to that country's exports)
- 5 sectors with individual sector rates + USTR source links
- Financial exposure data (Treasury holdings, trade deficit, FDI)

---

## 2. Signal Generation — The Core Algorithm

The entire trading module (`server/trading.ts`) is built around a multi-step pipeline:

### Step 1 — Fetch & Aggregate Candles
Yahoo Finance doesn't serve 4h bars natively. The server fetches 1h bars for 3 months and **aggregates every 4 consecutive 1h bars** into 4h bars: `open = group[0].open`, `high = max(highs)`, `low = min(lows)`, `close = group[-1].close`, `volume = sum(volumes)`.

### Step 2 — Calculate 10 Indicators
From the close prices and OHLCV data: RSI-14, MACD (EMA12−EMA26, signal=EMA9 of MACD series), EMA-12/26/50/200, Bollinger Bands (20-period, 2 std), ATR-14, ROC-14.

All EMAs are seeded with SMA for the first value, then the standard EMA formula: `k = 2/(period+1)`.

### Step 3 — Score Indicators

`scoreIndicators()` returns a composite in **[-1, +1]**. Each factor contributes a signed score:

| Indicator | BUY contribution | SELL contribution |
|-----------|-----------------|-----------------|
| RSI < 30 (oversold) | +1.0 | — |
| RSI > 70 (overbought) | — | −1.0 |
| RSI 45–55 (mild lean) | ±0.3 | — |
| MACD histogram positive | +0.6 | — |
| MACD histogram negative | — | −0.6 |
| Price above EMA-50 | +0.5 | — |
| Price below EMA-50 | — | −0.5 |
| Price above EMA-200 | +0.8 | — |
| Price below EMA-200 | — | −0.8 |
| BB position < 20% of range | +0.7 | — |
| BB position > 80% of range | — | −0.7 |
| ROC > 5% | +0.4 | — |
| ROC < −5% | — | −0.4 |

Normalisation: `score / (factors × 0.7)`, clamped to [-1, +1]. Dividing by `factors × 0.7` scales relative to how many indicators were available.

### Step 4 — Apply Strategy

- **S1 (Technical)**: score = raw indicator score, unchanged.
- **S2 (Multi-factor)**: volatility-dampened. `ATR% = ATR/price × 100`. If ATR% > 3%: multiply score by **0.75** (high volatility → less confidence). If ATR% 1.5–3%: × **0.9**. If ATR% < 0.8%: × **1.1** (low volatility → more reliable signals).
- **S3 (Hybrid)**: blends technical + news sentiment: `blended = techScore × 0.65 + newsSentiment × 0.35`. News sentiment is itself scored −100..+100 by keyword counting.

### Step 5 — Signal Decision & Risk Levels

```
score > 0.25  → BUY
score < -0.25 → SELL
otherwise     → HOLD

confidence = 50 + |score| × 45   → range: 50%–95%

risk   = ATR × 1.5   (or price × 2% if no ATR)
reward = risk × 2.5  (fixed 2.5:1 R:R)

BUY:  SL = price − risk,  TP = price + reward
SELL: SL = price + risk,  TP = price − reward
```

**Key constraint**: signal requires ≥ 30 candles; backtest requires ≥ 60.

---

## 3. News Sentiment — Keyword Voting

`scoreSentiment()` in `server/trading.ts`:
```
score = (bullishCount − bearishCount) / (bullishCount + bearishCount) × 100
```
Uses two hardcoded word lists (~26 bullish, ~30 bearish words) scanned on title + summary text. Returns 0 if no matching words. The aggregate sentiment across up to 8 articles is a simple arithmetic mean.

---

## 4. Backtest Engine — Walk-Forward

Not a simple historical replay. Walk-forward simulation:

1. Split series into train (first 70%) and test (last 30%).
2. For each bar in the test window: compute indicators on the **slice of data up to that bar** (new `calculateIndicators()` call per bar — no lookahead).
3. On a non-HOLD signal: enter at that bar's close, exit exactly **5 bars later**.
4. Compound equity: `equity *= (1 + returnPct)`.
5. Track peak equity for drawdown calculation.

**Metrics**:
- Win rate: `wins / totalTrades × 100`
- Total return: `(equity − 1) × 100` (compounded, not annualised)
- Max drawdown: `max((peak − equity) / peak)`
- Sharpe: `(avgReturn / stdReturn) × √252` (annualised, no risk-free rate subtracted)

**S3 in backtest uses no news** — the `getSignal()` function inside `runBacktest()` falls back to pure S1 score for strategy 3, since news cannot be replayed historically.

---

## 5. CFTC COT Sentiment Classification

Hedge fund positioning from the CFTC Disaggregated COT report (published Fridays). Only 5 metals tracked (Gold, Silver, Copper, Platinum, Palladium) by contract market code.

Sentiment label based on **long percentage** of managed money:
```
longPct = long / (long + short) × 100

longPct ≥ 70  → Strongly Bullish
longPct ≥ 58  → Bullish
longPct ≥ 42  → Neutral
longPct ≥ 30  → Bearish
longPct < 30  → Strongly Bearish
```

Week-over-week change: `weekNetChange = netCurrent − netPrev` (two most-recent rows fetched).

---

## 6. VIX and Yield Curve Classification

**VIX bands** (Market Stress Meter):
```
VIX ≥ 35    → crisis
VIX ≥ 25    → elevated fear
VIX ≥ 15    → nervous
VIX < 15    → calm
```

**Yield curve status** (3M−10Y spread in percentage points):
```
spread < -0.20  → inverted  (recession signal)
spread ≤  0.20  → flat
spread >  0.20  → normal
```

---

## 7. US Debt — Live vs. Hardcoded

**Live from Treasury API** (`fiscaldata.treasury.gov`):
- `totalDebt = debtHeldPublic + intraGovernmentHoldings`
- `recordDate`

**Derived with hardcoded denominators**:
- `debtPerCitizen = totalDebt / 335,000,000`
- `debtPerTaxpayer = totalDebt / 150,000,000`
- `debtToGDP = totalDebt / $29.2T`

**Fully hardcoded strings** (not computed at runtime): annual deficit, interest payments, foreign holders breakdown (Japan, China, UK…), spending categories, Social Security/Medicare unfunded obligations. These are editorial constants, not fetched data.

---

## 8. Price Alert System

Entirely **client-side**. No server involvement:
- Stored in SharedPreferences as JSON
- Schema: `{ id, symbol, name, targetPrice, direction: 'above' | 'below' }`
- Polling: the Flutter client checks live quotes every 10 seconds and compares against stored alerts
- No push notifications, no server-side evaluation, no deduplication or auto-dismiss logic

---

## 9. Validation Logic (server-side)

| Input | Rule | On failure |
|-------|------|------------|
| Timeframe | Must be one of `1m/5m/1h/4h/1d` | 400 |
| Strategy | Must be `"1"`, `"2"`, or `"3"` | 400 |
| Chart range | Whitelist `1mo/3mo/6mo/1y/5y` | Silently defaults to `3mo` |
| Search limit | Capped at 20 | Silently capped |
| Candle count for signals | ≥ 30 candles | 503 |
| Candle count for backtest | ≥ 60 candles | 503 |
| Bonds | Fixed 4 tickers only (`^IRX/^FVX/^TNX/^TYX`) | N/A |

---

## 10. Permissions and Authorization

**None.** There is no authentication, no user sessions, no API keys required for consumers, and no rate limiting. The server accepts any request from any `http://localhost:*` origin.

---

## 11. Cache TTLs

| Data | TTL |
|------|-----|
| Live price polling | 10s interval |
| Signal cache | 30s |
| History cache | 5 minutes |
| Backtest cache | 10 minutes |
| Volatility assets | 10 minutes |
| Sectors ETF | 15 minutes |
| News (trading module) | 15 minutes |
| AI briefing | 30 minutes |
| Bonds / yield curve | 30 minutes |
| News (futures module) | 30 minutes |
| COT metals | 4 hours |
| Country stocks | 4 hours |
| US debt | 12 hours |

---

## 12. Business Logic vs. Framework

| Code | Classification |
|------|---------------|
| `calcEma()`, `calcRsi()`, `calcBollinger()`, `calcAtr()` | Business logic — the math is the product |
| `scoreIndicators()`, `strategyS2()`, `strategyS3()` | Business logic — strategy differentiators |
| `runBacktestOnSeries()` | Business logic |
| `scoreSentiment()` + word lists | Business logic |
| COT sentiment thresholds (70/58/42/30) | Business logic |
| VIX band thresholds (35/25/15) | Business logic |
| Yield curve thresholds (±0.20) | Business logic |
| `pollAllPrices()` / `startFinnhubWebSocket()` | Infrastructure (data plumbing) |
| `historyCache`, `signalCache`, `backtestCache` | Infrastructure (TTL caching) |
| Express Router, Riverpod providers, Dio | Pure framework |
| `yfFetch()`, Yahoo Finance URL builders | Infrastructure (API adapter) |
