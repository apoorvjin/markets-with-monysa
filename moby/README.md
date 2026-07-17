# Moby — Flutter port of FinBrio

Production-ready Flutter rewrite of the FinBrio global financial intelligence dashboard. Shares the same Express backend at `localhost:5001`.

## Features

| Screen | Details |
|--------|---------|
| **Splash** | Animated intro; restores the last-visited tab (defaults to Markets on first launch) |
| **Markets** | Indices / Commodities / Forex with inline search; CFTC COT metals positioning |
| **Trading** | Dashboard (49 assets + watchlist + stock search) / AI Signals / Price Alerts |
| **Exposure** | 113+ countries ranked by US tariff rate, searchable & sortable |
| **Volatility** | Market Stress Meter, VIX Gauge, Yield Curve, Crisis Playbook, Economic Calendar, AI Briefing |
| **US Debt** | Live Treasury data with plain-English explanations (4 category tabs) |
| **Country Detail** | Flag, tariff rate, sector breakdown, financial exposure |
| **Country Stocks** | Live top stocks for any country (India: NSE / BSE tabs) |
| **Asset Detail** | Chart / Signal / Indicators / Backtest / News — any Yahoo Finance ticker |

All screens support **dark and light themes** via a persistent toggle in each AppBar.

## Architecture

```
lib/
├── main.dart              # Entry point
├── app.dart               # MaterialApp.router + bottom nav shell (5 tabs)
├── core/
│   ├── theme/             # AppColors, AppPalette, AppTypography, AppSpacing, AppTheme
│   ├── network/           # Dio-based ApiClient + ApiEndpoints
│   └── router/            # GoRouter configuration
├── data/
│   ├── models/            # Dart models (MarketItem, TradingSignal, Candle, PriceAlert, …)
│   ├── repositories/      # Data access layer (markets, trading, volatility, debt)
│   └── sources/           # Hardcoded tariff data (113+ countries, April 2025)
├── features/              # One folder per screen (splash, markets, trading, …)
├── providers/             # Riverpod providers (strategy, theme, alerts)
├── shared/widgets/        # GlassCard, SignalBadge, ChartModal, SparklineChart, ThemeToggleButton, …
└── utils/                 # TradingView symbol mapper (tv_symbol.dart)
```

## Tech Stack

| Concern | Library |
|---------|---------|
| Navigation | `go_router` ^14.2.0 |
| State | `flutter_riverpod` ^2.5.1 |
| HTTP | `dio` ^5.4.3+1 |
| Storage | `shared_preferences` ^2.3.2 |
| Font | `google_fonts` ^6.2.1 (Inter) |
| Sparklines | `fl_chart` ^0.68.0 |
| Candlestick charts | `webview_flutter` ^4.8.0 (Lightweight Charts v4) |
| Number formatting | `intl` ^0.19.0 |
| Loading skeletons | `shimmer` ^3.0.0 |
| External links | `url_launcher` ^6.x |

## Setup

1. **Install Flutter** ≥ 3.22 (Dart ≥ 3.3)

2. **Start the backend** (from repo root):
   ```bash
   npm run server:dev          # http://localhost:5001
   # or on macOS:
   ./start.sh
   ```
   > macOS AirPlay occupies port 5000. The server always uses **port 5001** — do not change `baseUrl` to 5000.

3. **Install dependencies**:
   ```bash
   flutter pub get
   ```

4. **Run**:
   ```bash
   flutter run                  # iOS simulator / Android / desktop
   flutter run -d chrome        # web
   ```

5. **(Optional) Override the backend host**:
   Edit `lib/core/network/api_endpoints.dart` and change `baseUrl`.

## Design System

Theme is exposed via `context.colors` (`AppPaletteX` extension on `BuildContext`).

| Token | Dark | Light |
|-------|------|-------|
| `background` | `#000000` | `#FFFFFF` |
| `surface` | `#0A0A0A` | `#F5F7FA` |
| `accent` | `#00D4AA` | `#00C49A` |
| `danger` | `#FF4D6A` | `#E8384F` |
| `warning` | `#FFB84D` | `#E6952A` |
| Font | Inter (Google Fonts) | Inter (Google Fonts) |

`ThemeToggleButton` (sun / moon pill) lives in `AppBar(actions: [...])` on every screen except US Debt, where it floats top-right over a custom hero layout.

## Key Gotchas

| Symptom | Cause | Fix |
|---------|-------|-----|
| Charts blank in WebView | `fetch()` inside HTML blocked by null CORS origin | Fetch candle data in Dart, embed as `const raw = $json;` in the HTML |
| Signal API 404 | Passing strategy label | Use `strategy.serverParam` ("1"/"2"/"3"), not `strategy.label` ("S1"/"S2"/"S3") |
| Backtest fields missing | Wrong field names | Use `sharpe` and `trades`, not `sharpeRatio` / `totalTrades` |
| Server not reloading on save | `tsx watch` silent failure | Kill and restart `npm run server:dev` |
| Bottom sheet dismissed on chart pan | `enableDrag` default | Always set `enableDrag: false` in `showModalBottomSheet` for `ChartModal` |

## Production Notes

- **No database required** — tariff data is bundled in `data/sources/tariffs_data.dart`
- **Optional backend features**: set `OPENAI_API_KEY` for AI briefings, `FINNHUB_API_KEY` for sub-second crypto
- **Offline-safe**: all screens show error + retry widgets when the backend is unreachable
- **Analyze**: `flutter analyze --no-fatal-infos` — zero errors expected
