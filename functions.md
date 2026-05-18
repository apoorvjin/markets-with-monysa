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

---

## STRATEGY — All Trading Strategies

The app exposes **8 strategies** (server params `"1"`–`"8"`). They share the same indicator pipeline (§2 above) but differ in how the score is computed, what threshold triggers a signal, and how SL/TP are set. All strategies use the same candle source (4h bars aggregated from 1h Yahoo Finance data by default).

---

### S1 — Pure Technical

**Server param**: `"1"` | **Function**: `strategyS1()` → `scoreIndicators()`

The baseline strategy. Applies all 6 indicators (RSI, MACD histogram, EMA50, EMA200, Bollinger Bands, ROC) with fixed weights and normalises the composite score to **[-1, +1]**.

| Indicator | BUY contribution | SELL contribution |
|-----------|-----------------|-----------------|
| RSI < 30 (oversold) | +1.0 | — |
| RSI > 70 (overbought) | — | −1.0 |
| RSI 45–55 (lean) | ±0.3 | — |
| MACD histogram positive | +0.6 | — |
| MACD histogram negative | — | −0.6 |
| Price above EMA-50 | +0.5 | — |
| Price below EMA-50 | — | −0.5 |
| Price above EMA-200 | +0.8 | — |
| Price below EMA-200 | — | −0.8 |
| BB position < 20% of band | +0.7 | — |
| BB position > 80% of band | — | −0.7 |
| ROC > 5% | +0.4 | — |
| ROC < −5% | — | −0.4 |

**Normalisation**: `score / (factors × 0.7)`, clamped to [-1, +1].

**Signal thresholds**: score > 0.25 → BUY · score < -0.25 → SELL · otherwise HOLD.

**Confidence**: `50 + |score| × 45` → range 50%–95%.

**Risk levels**: `SL = ATR × 1.5`, `TP = ATR × 3.75` (fixed 2.5 R:R). Falls back to `price × 2%` if ATR unavailable.

---

### S2 — Multi-Factor / Volatility-Adaptive

**Server param**: `"2"` | **Function**: `strategyS2()`

Same indicator scoring as S1 but multiplies the final score by a **volatility dampener** derived from ATR%:

| ATR% (ATR ÷ price × 100) | Score multiplier | Reasoning |
|--------------------------|-----------------|-----------|
| > 3% | × 0.75 | High volatility → reduce confidence |
| 1.5%–3% | × 0.9 | Moderate volatility → slight reduction |
| < 0.8% | × 1.1 | Low volatility → signals more reliable |
| 0.8%–1.5% | × 1.0 | Neutral zone |

Adds an extra bullet ("High volatility detected — position sizing should be reduced" or "Low volatility environment") when the multiplier fires.

**Thresholds, confidence, and SL/TP**: identical to S1.

---

### S3 — Hybrid Technical + News Sentiment

**Server param**: `"3"` | **Function**: `strategyS3()`

Blends S1's technical score with a **news sentiment score** fetched at signal time:

```
blended = techScore × 0.65 + (sentimentRaw / 100) × 0.35
```

**Sentiment scoring** (`scoreSentiment()`): counts matches from two hardcoded keyword lists (~26 bullish, ~30 bearish words) against article title + summary, then:

```
score = (bullishCount − bearishCount) / (bullishCount + bearishCount) × 100
```

Aggregate sentiment is the arithmetic mean of per-article scores across up to 8 articles. Returns 0 if no keywords match.

**Sentiment label**: > 30 → "positive", < -30 → "negative", else "neutral". The sentiment bullet is always placed first in the reasoning list.

**Backtest note**: News cannot be replayed historically. In walk-forward backtest, S3 falls back to the pure S1 score (no sentiment adjustment). Backtest results for S3 are therefore equivalent to S1.

**Thresholds, confidence, and SL/TP**: same as S1 (±0.25, fixed 2.5 R:R).

---

### S4 — Regime-Adaptive

**Server param**: `"4"` | **Function**: `strategyS4()`

Uses **ADX-14** to detect the current market regime and activates a purpose-built engine for each:

| ADX | Regime | Engine |
|-----|--------|--------|
| > 25 | Trending | Trend Engine |
| < 18 | Ranging | Mean Reversion Engine |
| 18–25 | Neutral | Falls back to S1 × 0.8 |

**Trend Engine** — weighted sum (normalised by totalWeight):

| Factor | Weight | Signal |
|--------|--------|--------|
| EMA200 | 1.2 | Price above/below |
| EMA50 | 0.8 | Price above/below |
| MACD histogram | 0.8 | Positive/negative |
| RSI | 0.2 | > 60 bull / < 40 bear (momentum, not oversold) |
| Volume vs 20-bar SMA | 1.0 | > 120% → confirms direction; < 70% → dampen score × 0.7; else use OBV slope |

**Mean Reversion Engine** — optimised for range-bound price:

| Factor | Weight | Signal |
|--------|--------|--------|
| RSI | 1.0 | < 30 oversold / > 70 overbought / < 40 mild / > 60 mild |
| Bollinger Bands | 1.0 | Position < 15% / > 85% / < 30% / > 70% of band |
| ATR% | modifier | < 0.8% → score ×1.2; > 3% → score ×0.6 (no weight change) |
| EMA200 | 0.3 | Bias only |
| MACD histogram | 0.2 | Bias only |

**Higher conviction threshold**: score > **0.55** → BUY · score < **-0.55** → SELL. Produces fewer signals but with higher specificity than S1–S3.

**Confidence and SL/TP**: same formula as S1. Reasoning capped at 6 bullets.

---

### S5 — Professional Systematic

**Server param**: `"5"` | **Function**: `strategyS5()`

Classifies the market into **4 regimes** using both ATR% and ADX, then applies a pre-defined weight table per regime. The most rules-heavy strategy.

**Regime classification** (`classifyRegimeS5()`):

| ATR% | ADX | Regime |
|------|-----|--------|
| ≥ 2.5% | > 25 | `volatile_trend` |
| ≥ 2.5% | ≤ 25 | `chaotic` → always HOLD |
| < 2.5% | > 25 | `quiet_trend` |
| < 2.5% | < 25 | `quiet_range` |

**Indicator weights per regime**:

| Indicator | quiet_trend | quiet_range | volatile_trend | chaotic |
|-----------|-------------|-------------|----------------|---------|
| EMA200 | 1.2 | 0.3 | 1.0 | 0 |
| EMA50 | 0.8 | 0.2 | 0.8 | 0 |
| MACD | 0.8 | 0.2 | 0.5 | 0 |
| RSI | 0.2 | 1.0 | 0.1 | 0 |
| Bollinger | 0.1 | 1.0 | 0.3 | 0 |
| Volume + OBV | 0.8 | 0.5 | 1.2 | 0 |

RSI and Bollinger are interpreted differently by regime:
- `quiet_range`: RSI < 30 / > 70 = oversold/overbought (mean reversion); BB extremes are reversal signals.
- `quiet_trend` / `volatile_trend`: RSI > 55 = bullish momentum (continuation); BB position only lightly penalised.

**Signal Consensus Gate**: after weighting, counts bull factors vs bear factors. If `max(bullCount, bearCount) / totalFactors < 60%`, score is dampened to 55% or 25%. This forces signals to require multi-indicator agreement.

**Quality penalty**: if `|price − EMA200| / EMA200 > 8%`, subtract 0.15 from final score (extended stretch = exhaustion risk).

**Regime-specific thresholds** (varying by certainty of regime):

| Regime | Threshold |
|--------|-----------|
| `quiet_trend` | 0.45 |
| `quiet_range` | 0.60 |
| `volatile_trend` | 0.65 |
| `chaotic` | ∞ (always HOLD) |

**Confidence**: step function `calibrateConfidenceS5()` based on |score|: ≥0.8→85%, ≥0.65→78%, ≥0.5→70%, ≥0.3→60%, else 52%.

**SL/TP**: same formula as S1 (ATR × 1.5 / × 3.75, fixed 2.5 R:R).

---

### S6 — Adaptive Hybrid

**Server param**: `"6"` | **Function**: `strategyS6()`

An enhanced hybrid that combines **S2's volatility-aware technical score** with **enhanced news sentiment**, where the blend ratio is itself regime-dependent:

| Condition (checked in order) | Tech weight | News weight |
|------------------------------|-------------|-------------|
| ATR% > 5% (chaotic volatility) | 90% | 10% |
| ADX > 30 (strong trend) | 85% | 15% |
| ATR% < 1% (quiet market) | 60% | 40% |
| Default | 70% | 30% |

**Enhanced sentiment scoring** (`aggregateSentimentV2()` / `scoreArticleEnhanced()`): upgrades S3's simple keyword counting with:
- **Negation handling**: words preceded by negation terms (not, doesn't, never, etc.) flip their polarity.
- **Freshness decay**: each article's score is multiplied by `exp(-hoursOld / 24)` — a 24h-old article contributes ~37% of a fresh one.
- **Source credibility**: Reuters/Bloomberg = 1.00, FT/WSJ = 0.95, CNBC/MarketWatch = 0.85, SeekingAlpha = 0.75, Yahoo Finance = 0.65, unknown = 0.55.
- Articles with relevance score < 0.2 are excluded from the aggregate entirely.

**Asymmetric thresholds**: score > **0.45** → BUY · score < **-0.35** → SELL. The BUY bar is higher than SELL to account for market asymmetry.

**Backtest note**: No historical news available. S6 in backtest applies the S2 score with S6's asymmetric thresholds (0.45 / -0.35).

**Confidence**: uses `calibrateConfidenceS5()` step function (same as S5).

**SL/TP**: same formula as S1.

---

### S7 — APEX (Adaptive Probabilistic EXecution)

**Server param**: `"7"` | **Function**: `strategyAPEX()`

The most sophisticated single strategy. Adds a **quality gate** (0–100 score), **higher-timeframe alignment check**, **cross-asset correlation**, and **RSI divergence detection** on top of regime-specific direction engines. Signals require quality ≥ 60 to be marked `tradeable`.

**Regime classification** (`classifyRegimeAPEX()` — 5 regimes):

| Condition | Regime |
|-----------|--------|
| ATR% > 5% OR BB width > 8% | `chaotic` → always HOLD |
| ATR% > 3.5% | `volatile_break` |
| ADX > 28 AND ATR% ≥ 1% | `strong_trend` |
| ADX ≥ 18 | `weak_trend` |
| ADX < 18 AND ATR% < 1.5% | `ranging` |
| Fallback | `ranging` or `weak_trend` by ATR% |

**Direction Engines** (one selected per regime):

*Trend Engine* (used for `strong_trend` and `weak_trend`):
- In **strict** mode (`strong_trend`): both EMA50 AND EMA200 must agree on direction — if they disagree, returns score = 0 and no signal.
- Weighted: EMA200 (1.5×w), EMA50 (1.0×w), MACD (0.8×w), VWAP-20 (0.7×w), Volume (1.0×w), RSI (0.2×w), where w=1.0 strict / 0.7 relaxed.
- Volume ≥ 150% avg → confirms direction; < 70% avg → dampens score × 0.8; otherwise uses OBV slope.

*Range Engine* (`ranging`):
- RSI (1.2×): < 30 / > 70 extreme; < 40 / > 60 mild.
- Bollinger (1.2×): < 15% / > 85% strong signals; < 30% / > 70% mild.
- EMA200 (0.3×) and MACD (0.2×) as bias.
- Low volume (< 80%) slightly amplifies score by 1.1× when signal is already directional (thin range = reliable mean reversion).

*Breakout Engine* (`volatile_break`):
- Requires volume ≥ **180%** of 20-bar average — if not met, returns score = 0 (no breakout without volume confirmation).
- MACD + EMA50 consensus determines direction (1.5×), OBV slope (1.0×), BB width expansion (0.8×), MACD (0.6×), EMA50 (0.5×).

*Chaotic*: always score = 0, always HOLD.

**Quality Score** (0–100 points):
| Component | Max points | Trigger |
|-----------|-----------|---------|
| Regime clarity (persistence) | 25 | ADX > 35 or ranging ADX < 12 → 25pts; moderate → 15pts; shifting → 5pts |
| HTF alignment | 20 | Confirmed → 20pts; neutral → 10pts; blocked → −30pts |
| RSI divergence | 20 | No divergence → 20pts; hidden (continuation) → 20pts + bullet; regular (exhaustion) → −35pts + bullet |
| Volume quality | 20 | ≥180% avg → 20pts; ≥120% → 12pts; 70%–120% → 5pts; < 70% → −10pts |
| Cross-asset correlation | 15 | Confirms → 15pts; contradicts → −10pts; N/A → 0pts |

**HTF alignment**: runs the full APEX direction engine on the **next higher timeframe** candles (fetched separately). If the HTF score points the same direction (> 0.3 both) → "confirmed"; opposite → "blocked" (which prevents a signal regardless of quality).

**Cross-asset pairs** (hardcoded, directional):

| Primary | Correlated | Relationship |
|---------|-----------|--------------|
| Gold (GC=F) | DXY | Inverse |
| Silver (SI=F) | Gold (GC=F) | Direct |
| Crude (CL=F, BZ=F) | XLE | Direct |
| BTC-USD | ETH-USD | Direct (bidirectional) |
| S&P/Dow/NASDAQ | VIX | Inverse |

**RSI Divergence** (`detectDivergence()`): detects swing highs/lows over the last 14 bars and checks for:
- **Regular bullish**: lower price low + higher RSI low → reversal upward (adds quality).
- **Regular bearish**: higher price high + lower RSI high → exhaustion, **vetoes the signal** (−35pts quality).
- **Hidden bullish/bearish**: continuation signals, add quality.

**Tradeable gate**: `quality ≥ 60 AND htfAlignment ≠ "blocked" AND engineActive AND regime ≠ "chaotic"`.

**Position risk %**: `qualityMult × regimeMult × 100`:
- qualityMult: ≥90 → 1.0; ≥75 → 0.85; ≥60 → 0.65; <60 → 0.
- regimeMult: strong_trend → 1.0; volatile_break → 0.6; ranging → 0.75; weak_trend → 0.5; chaotic → 0.

**Regime-specific thresholds** and **dynamic SL/TP**:

| Regime | Threshold | SL mult | TP mult | R:R |
|--------|-----------|---------|---------|-----|
| `strong_trend` | 0.45 | 2.0× ATR | 9.0× ATR | 4.5 |
| `weak_trend` | 0.65 | 1.5× ATR | 3.75× ATR | 2.5 |
| `ranging` | 0.55 | 1.0× ATR | 1.8× ATR | 1.8 |
| `volatile_break` | 0.60 | 2.5× ATR | 8.75× ATR | 3.5 |
| `chaotic` | ∞ | — | — | — |

**Confidence**: `calibrateConfidenceS5()` step function.

**Backtest note**: HTF candles and cross-asset candles are not available in the walk-forward backtest. S7 backtests with only the primary symbol's slice, producing more conservative (less quality-penalised) backtest signals than live signals.

---

### S8 — Ensemble Meta-Strategy

**Server param**: `"8"` | **Function**: `strategyEnsemble()`

Runs **S4, S5, and S7 in parallel** and combines their votes into a weighted consensus. S7 (APEX) runs first to determine the current regime, which in turn sets the vote weights.

**Regime-based vote weights**:

| Regime | S4 weight | S5 weight | S7 weight | Rationale |
|--------|-----------|-----------|-----------|-----------|
| `strong_trend` | 0.35 | 0.15 | 0.50 | APEX is best in clean trends |
| `weak_trend` | 0.25 | 0.35 | 0.40 | S5 Professional handles ambiguity |
| `ranging` | 0.20 | 0.45 | 0.35 | S5 range weights outperform |
| `volatile_break` | 0.35 | 0.10 | 0.55 | APEX breakout engine dominates |
| `chaotic` | 0.33 | 0.34 | 0.33 | Equal weight, always results in HOLD |

**Consensus score**: `buyWeight − sellWeight` across all three votes, where HOLDs contribute zero.

**Signal gate**: requires **≥ 2 engines to agree** on direction. If only 1 or 0 agree, score is forced to 0 → HOLD.

**Position risk scaling**: if all 3 engines agree → full `positionRiskPct` from APEX; if only 2 agree → × 0.6.

**Fixed threshold**: 0.40 (higher than S1–S3, lower than S4 in trending markets).

**Confidence**: `calibrateConfidenceS5()` step function.

**SL/TP**: uses APEX's regime-specific levels (same as S7).

**Backtest note**: HTF and cross-asset data are not available per-bar. S7's quality gate is effectively disabled in backtest (no HTF candles → "neutral" alignment, quality is reduced but not blocked). S8 backtest signals fire when ≥2 engines agree with consensus > 0.40.

---

### Strategy Comparison

| | S1 | S2 | S3 | S4 | S5 | S6 | S7 | S8 |
|--|----|----|----|----|----|----|----|----|
| Regime-aware | No | Partial (vol) | No | Yes (2) | Yes (4) | Partial (vol) | Yes (5) | Yes (5) |
| News-aware | No | No | Yes | No | No | Yes | No | No |
| HTF alignment | No | No | No | No | No | No | Yes | Yes (via S7) |
| Cross-asset | No | No | No | No | No | No | Yes | Yes (via S7) |
| RSI divergence | No | No | No | No | No | No | Yes | Yes (via S7) |
| Volume (OBV) | No | No | No | Yes | Yes | No | Yes | Yes |
| Quality gate | No | No | No | No | No | No | Yes (≥60) | Yes (via S7) |
| BUY threshold | ±0.25 | ±0.25 | ±0.25 | ±0.55 | regime | asymm | regime | 0.40 |
| R:R | 2.5 fixed | 2.5 fixed | 2.5 fixed | 2.5 fixed | 2.5 fixed | 2.5 fixed | regime | regime |
| Signal frequency | High | High | High | Low | Low–Med | Med | Low | Lowest |
| Target user | Beginner | Beginner+ | News-driven | Trend trader | Systematic | News+tech | Professional | Highest confidence |

---

## Changes Since This File Was Created

### v1.1.0 — Server cleanup (`92d48e3`, May 18 2026)

**Removed (Replit-specific infrastructure):**
- Entire `server/replit_integrations/` directory (audio, batch, chat, image Replit modules) — not part of the Moby product.
- `server/templates/landing-page.html` — Expo web landing page, no longer served.
- Expo manifest routing (`serveExpoManifest`, `configureExpoAndLanding`) removed from `server/index.ts`.

**CORS changed:** Previously read `REPLIT_DEV_DOMAIN` / `REPLIT_DOMAINS` env vars to build the allowed-origins set. Now reads a single generic `ALLOWED_ORIGINS` env var (comma-separated). Localhost origins still allowed unconditionally.

**Root endpoint changed:** `GET /` previously served an HTML landing page. Now returns:
```json
{ "status": "ok", "name": "Markets API", "version": "1.0.0" }
```

---

### Flutter — API base URL (`18d4f1f`, May 18 2026)

`ApiEndpoints.baseUrl` is now a **compile-time constant** resolved via `String.fromEnvironment`:
```dart
static const String baseUrl = String.fromEnvironment(
  'API_BASE_URL',
  defaultValue: 'https://monysa-api.fly.dev',
);
```
Local dev: pass `--dart-define=API_BASE_URL=http://localhost:5001`. Default in production builds is the Fly.io deployment.

---

### Flutter — Signal error propagation (`c927cea`, May 18 2026)

**`TradingRepository.fetchSignal()`** now catches `DioException` and surfaces the server's `error` field from the response body instead of rethrowing the raw HTTP exception. This means "Insufficient data" and similar 503 messages from the backend are readable in the UI.

**`_SignalTab` in `AssetDetailScreen`** now calls `_signalError(e)` to humanize the error message:
- Strips the leading `"Exception: "` prefix from exception `.toString()`.
- Maps "insufficient" / 503 to a user-friendly string.

**`_EmptySearch` and `_SearchResults` in `TradingScreen`** — empty/no-results states wrapped in `FittedBox(fit: BoxFit.scaleDown)` to prevent overflow on narrow screens.
