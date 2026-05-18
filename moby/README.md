# Moby — Flutter port of Monysa

Production-ready Flutter rewrite of the Monysa global financial intelligence dashboard.

## Features

| Screen | Details |
|--------|---------|
| **Splash** | 3.2s animated intro, randomly navigates to one of 5 tabs |
| **Markets** | Indices / Commodities / Forex with CFTC COT metals positioning |
| **Trading** | Dashboard / AI Signals / Alerts with 49 assets |
| **Exposure** | 111 countries ranked by US tariff rate, searchable & sortable |
| **Volatility** | Market Stress Meter, VIX Gauge, Crisis Playbook, AI Briefing |
| **US Debt** | Live Treasury data with plain-English explanations |
| **Country Detail** | Flag, tariff rate, sector breakdown, financial exposure |
| **Country Stocks** | Live top stocks for any country |
| **Asset Detail** | Chart / Signal / Indicators / Backtest / News (5 tabs) |

## Architecture

```
lib/
├── main.dart              # Entry point
├── app.dart               # MaterialApp.router + bottom nav shell
├── core/
│   ├── theme/             # Colors, Typography, Spacing, AppTheme
│   ├── network/           # Dio-based ApiClient + endpoints
│   └── router/            # GoRouter configuration
├── data/
│   ├── models/            # Dart models (MarketItem, TradingSignal, etc.)
│   ├── repositories/      # Data access layer
│   └── sources/           # Hardcoded data (tariffs.json)
├── features/              # Screen-per-feature (splash, markets, trading, …)
├── providers/             # Riverpod global providers (strategy, alerts)
└── shared/widgets/        # Reusable widgets (GlassCard, SignalBadge, ChartModal, …)
```

## Tech Stack

| Concern | Library |
|---------|---------|
| Navigation | `go_router` |
| State | `flutter_riverpod` |
| HTTP | `dio` |
| Storage | `shared_preferences` |
| Font | `google_fonts` (Inter) |
| Charts | `fl_chart` (sparklines) + `webview_flutter` (Lightweight Charts v4 candlesticks) |
| Number fmt | `intl` |

## Setup

1. **Install Flutter** ≥ 3.22 (Dart ≥ 3.3)

2. **Start the backend** (from repo root):
   ```bash
   cd .. && ./start.sh          # or: npm run dev
   ```
   Backend runs on `http://localhost:5000`.

3. **Install dependencies**:
   ```bash
   flutter pub get
   ```

4. **Run**:
   ```bash
   flutter run                  # mobile/desktop
   flutter run -d chrome        # web
   ```

5. **(Optional) Set a custom backend host**:
   Edit `lib/core/network/api_endpoints.dart` and change `baseUrl`.

## Design System

| Token | Value |
|-------|-------|
| Background | `#000000` |
| Accent | `#00D4AA` (teal) |
| Danger | `#FF4D6A` (red) |
| Warning | `#FFB84D` (amber) |
| Font | Inter (Google Fonts) |

Dark theme only — matches the Expo/React Native original exactly.

## Production Notes

- **No database required** — tariff data is bundled as `assets/data/tariffs.json`
- **Backend optional features**: set `OPENAI_API_KEY` for AI briefings, `FINNHUB_API_KEY` for sub-second crypto
- **Candlestick charts** use Lightweight Charts v4 via WebView (same CDN as original)
- **Offline-safe**: the app gracefully shows error states when the backend is unreachable
