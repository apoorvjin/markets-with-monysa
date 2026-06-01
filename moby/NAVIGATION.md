# Moby — App Navigation Flow (Developer Reference)

> **Purpose**: Quick reference for developers to understand how users traverse the app — every route, modal, entitlement gate, and navigation convention in one place.

---

## 1. App Launch Flow

```
App Start → /splash (SplashScreen)
  │
  ├── First launch  (hasSeenOnboarding = false in SharedPreferences)
  │     └── /onboarding (OnboardingScreen — 3-slide PageView)
  │           ├── "Skip" button (top-right, any slide) ──────────┐
  │           └── "Get Started" button (last slide only) ─────────┤
  │                                                               ↓
  └── Returning user (cold restart)                         /markets
        └── lastTab from SharedPreferences (default: /markets)
```

---

## 2. Bottom Navigation Shell (AppShell)

A `ShellRoute` wraps all main screens. The bottom nav bar is a frosted-glass pill with 6 tabs. Tab index is persisted to `SharedPreferences` as `lastTab`.

| # | Label | Icon | Route | Badge |
|---|-------|------|-------|-------|
| 0 | Markets | `bar_chart_rounded` | `/markets` | — |
| 1 | Trading | `candlestick_chart_rounded` | `/trading` | 🔴 active alert count |
| 2 | Exposure | `public_rounded` | `/exposure` | — |
| 3 | Macro | `bolt_rounded` | `/volatility` | — |
| 4 | Debt | `account_balance_rounded` | `/debt` | — |
| 5 | Profile | `person_rounded` | `/profile` | — |

Tab switches use `context.go(path)`. Detail screens use `context.push(path)` (preserves back stack).

---

## 3. Screen-by-Screen Navigation Map

### 📊 Markets — `/markets`
Sub-tabs: **Indices / Commodities / Forex**

| Action | Destination | Type | Notes |
|--------|-------------|------|-------|
| Tap any market row | `ChartModal` | Bottom sheet | `enableDrag: false` — required to prevent chart pan from dismissing |
| Search icon (AppBar) | `_GlobalSearchSheet` | Bottom sheet | Full-screen search across all assets |
| About icon (AppBar) | About modal | Bottom sheet | App info / privacy |

Forex tab: grouped by region when idle, flat list during search. CFTC metals section hides during search.

---

### 🕯 Trading — `/trading`
Sub-tabs: **Dashboard / AI Signals / Alerts**

#### Dashboard tab
| Action | Destination | Type | Notes |
|--------|-------------|------|-------|
| Category chip (any except Stocks) | Asset list (inline) | State change | 30s auto-refresh |
| "Stocks" chip | Search mode (inline) | State change | Debounced 400ms, calls `/api/search` |
| Tap asset row | `/asset/:symbol?name=` | `context.push` | Symbol URL-encoded |
| Tap stock search result | `/asset/:symbol?name=` | `context.push` | Symbol URL-encoded |
| 10X scanner backtest icon | `/trading/10x-backtest?version=v1&type=assets` | `context.push` | |

#### AI Signals tab
| Action | Destination | Type | Notes |
|--------|-------------|------|-------|
| Strategy info icon (AppBar right) | Strategy info sheet | Bottom sheet | Explains S1/S2/S3 |
| Locked strategy chip | `UpgradeSheet` | Bottom sheet | `feature: 'signals_advanced'` — Pro+ |
| AI briefing button | `UpgradeSheet` OR inline | Bottom sheet / state | `feature: 'analyst_notes_unlimited'` — Pro+ |

#### Alerts tab
| Action | Destination | Type | Notes |
|--------|-------------|------|-------|
| Alert limit reached | `UpgradeSheet` | Bottom sheet | `feature: 'alerts_unlimited'` — Pro+ |

---

### 🌐 Exposure — `/exposure`
Tariff impact ranked across 113 countries.

| Action | Destination | Type | Notes |
|--------|-------------|------|-------|
| Tap country row | `/country/:code` | `context.push` | Country code (e.g. `CN`, `IN`) |

---

### ⚡ Macro — `/volatility`
Market Stress Meter, VIX, crisis assets, yield curve, AI briefing.

| Action | Destination | Type | Notes |
|--------|-------------|------|-------|
| AI briefing button | `UpgradeSheet` OR requests | Bottom sheet / state | `feature: 'analyst_notes_unlimited'` — Pro+ |
| Yield curve info icon | Yield curve explanation | Bottom sheet | Normal / Flat / Inverted |
| Economic calendar info icon | Calendar guide | Bottom sheet | FOMC / CPI / NFP / Jackson Hole |

---

### 🏛 Debt — `/debt`
US National Debt visualiser. **Self-contained — no outbound navigation.**

4 category tabs: **Big Picture / Personal / Foreign Holders / Spending**

Custom hero layout with no AppBar. `ThemeToggleButton` is a `Positioned` widget inside a `Stack`.

---

### Country Detail — `/country/:code`

| Action | Destination | Type | Notes |
|--------|-------------|------|-------|
| Back button | Previous screen | `context.pop()` | Only screen with explicit pop |
| "View Stocks" button | `/country/:code/stocks?name=` | `context.push` | Country name URL-encoded |
| Sector AI button (entitled) | `showSectorImpactSheet()` | Custom sheet | Passes `countryCode`, `countryName`, `sectorName`, `tariffRate` |
| Sector AI button (not entitled) | `UpgradeSheet` | Bottom sheet | `feature: 'exposure_ai'` — Insight+ |

---

### Country Stocks — `/country/:code/stocks`

| Action | Destination | Type | Notes |
|--------|-------------|------|-------|
| Tap stock row | `/asset/:symbol?name=` | `context.push` | Full 5-tab Asset Detail (not a modal) |

India flag: NSE / BSE exchange sub-tabs.

---

### Asset Detail — `/asset/:symbol`
5 sub-tabs: **Chart / Signal / Indicators / Backtest / News**

| Action | Destination | Type | Notes |
|--------|-------------|------|-------|
| TradingView icon (AppBar) | TradingView / Yahoo Finance | External browser | `TvSymbol.open(symbol)` via `url_launcher` |
| Chart tab fullscreen icon | `ChartModal` | Bottom sheet | Opens on top of the inline chart |
| Signal tab info icon | Strategy info sheet | Bottom sheet | Explains S1/S2/S3 |
| AI analyst note (entitled) | Inline note | State change | — |
| AI analyst note (not entitled) | `UpgradeSheet` | Bottom sheet | `feature: 'analyst_notes_unlimited'` — Pro+ |
| Star icon (AppBar) | Watchlist toggle | Internal state | Persisted via `watchlistProvider` |

Chart sub-tab uses inline `WebViewController` (not a modal). AppBar has timeframe selector.

---

### 👤 Profile — `/profile`
Identity, subscription, theme, chart provider, about.

| Action | Destination | Type | Notes |
|--------|-------------|------|-------|
| Theme toggle (in-body) | Dark / Light | State change | `ThemeModeNotifier` in `_ThemeSection` — **not in AppBar** |
| Chart provider dropdown | Confirmation dialog | `showDialog` | Warns about app restart |
| Dialog confirmed | App restarts | `RestartWidget.restartApp()` | Saves provider choice then full restart |
| Sign In / Upgrade buttons | Snackbar | Notification | "Account features coming soon" |

---

### 10X Backtest — `/trading/10x-backtest`
Query params: `version` (`v1` | `v2`), `type` (`assets` | `stocks`)

| Action | Destination | Type | Notes |
|--------|-------------|------|-------|
| "How it works" link | Backtest info sheet | Bottom sheet | Explains walk-forward methodology |
| Filter chip (entitled) | Filter UI | State change | — |
| Filter chip (not entitled) | `UpgradeSheet` | Bottom sheet | `feature: 'backtest_filter'` — Insight+ |

v1/v2 selector and assets/stocks toggle are in-page state — no route change.

---

## 4. Visual Flow Diagram

```
┌─────────────┐
│   /splash   │
└──────┬──────┘
       │
       ├─ First launch ──► /onboarding ──► (Skip / Get Started) ──┐
       │                    [3 slides]                             │
       └─ Returning user ──────────────────────────────────────────┤
                                                                   ▼
                            ╔══════════════════════════════════════╗
                            ║        AppShell (Bottom Nav)         ║
                            ║  Markets│Trading│Exposure│Macro│     ║
                            ║  Debt  │Profile                      ║
                            ╚══╤═════╤═══════╤══════╤══════════════╝
                               │     │       │      │
               ┌───────────────┘     │       │      └─────────────────────┐
               │                     │       │                             │
               ▼                     ▼       ▼                             ▼
          /markets              /trading  /exposure                  /volatility
          ─────────             ─────────  ─────────                 ─────────
          Indices/              Dashboard  Country                   Stress Meter
          Commodities/          AI Signals   list                    VIX / Crises
          Forex                 Alerts                               Yield Curve
               │                     │       │
               │                     │       ▼
               │                     │  /country/:code ────────────────────┐
               │                     │  CountryDetailScreen                │
               │                     │       │                             │
               │                     │       ├─ "View Stocks" ─────────────▼
               │                     │       │  /country/:code/stocks
               │                     │       │  CountryStocksScreen
               │                     │       │         │
               └─────────────────────┴───────┘         │
                                     │                 │
                                     ▼                 ▼
                              /asset/:symbol    (shared destination)
                              AssetDetailScreen
                              ─────────────────
                              Chart│Signal│Indicators
                              Backtest│News
                                     │
                                     └─► TradingView (external)

         /debt              /profile              /trading/10x-backtest
         ──────             ────────              ─────────────────────
         Self-contained     Theme toggle          v1/v2 selector
         4 tabs             Chart provider        Assets/Stocks toggle
                            (triggers restart)    Filter chips
```

---

## 5. Entitlement Gate Reference

All gates call `EntitlementService.can(key)`. When locked, `UpgradeSheet.show(context, feature: key)` is shown.

| Feature Key | Required Plan | Gate Location |
|---|---|---|
| `signals_advanced` | Pro+ | Trading → AI Signals — locked strategy chip |
| `alerts_unlimited` | Pro+ | Trading → Alerts tab — alert count limit |
| `analyst_notes_unlimited` | Pro+ | Trading AI briefing, Volatility AI briefing, Asset Detail AI note |
| `push_notifications` | Pro+ | (reserved — not yet in UI) |
| `exposure_ai` | Insight+ | Country Detail → Sector AI button |
| `backtest_filter` | Insight+ | 10X Backtest → filter chips |
| `api_access` | Insight+ | (reserved — not yet in UI) |

**Dev bypass**: pass `--dart-define=DEV_PLAN=insight` at build time → all gates open.  
**Local server mode**: when `APP_SIGNING_SECRET` is absent, server treats all devices as `enterprise`.

---

## 6. Key Navigation Conventions

| Convention | Rule |
|---|---|
| **Asset route** | Always `context.push('/asset/${Uri.encodeComponent(sym)}?name=${Uri.encodeComponent(name)}')` |
| **Tab switch** | `context.go(path)` — replaces the stack |
| **Detail push** | `context.push(path)` — adds to the stack (system back works) |
| **Explicit back** | Only `CountryDetailScreen` uses `context.pop()`. All others rely on system back gesture or tab switch |
| **ChartModal** | `enableDrag: false` is mandatory — chart pan/pinch gestures bubble up and dismiss the sheet otherwise |
| **WebView data** | All candle data fetched in Dart, embedded as `const raw = $json;` in HTML. Never `fetch()` inside WebView (CORS blocks null/opaque origins) |
| **Charts always dark** | WebView HTML uses `#0a0a0a` background regardless of app theme |
| **Country flow** | Linear push stack: Exposure → Country Detail → Country Stocks → Asset Detail |
| **`ThemeToggleButton`** | In AppBar actions on all main screens except Profile (it's in `_ThemeSection` body) and Debt (it's `Positioned` in a Stack) |

---

## 7. All Routes Quick Reference

| Route | Screen | Entry Points | Key Params |
|---|---|---|---|
| `/splash` | `SplashScreen` | App cold start | — |
| `/onboarding` | `OnboardingScreen` | Splash (first launch) | — |
| `/markets` | `MarketsScreen` | Bottom nav tab 0, onboarding finish | — |
| `/trading` | `TradingScreen` | Bottom nav tab 1 | — |
| `/exposure` | `ExposureScreen` | Bottom nav tab 2 | — |
| `/volatility` | `VolatilityScreen` | Bottom nav tab 3 | — |
| `/debt` | `UsaDebtScreen` | Bottom nav tab 4 | — |
| `/profile` | `ProfileScreen` | Bottom nav tab 5 | — |
| `/country/:code` | `CountryDetailScreen` | Exposure screen tap | `code` = ISO country code |
| `/country/:code/stocks` | `CountryStocksScreen` | Country Detail "View Stocks" | `code`, `?name=` |
| `/asset/:symbol` | `AssetDetailScreen` | Trading, Country Stocks, (any asset row) | `symbol` URL-encoded, `?name=` |
| `/trading/10x-backtest` | `TenXBacktestScreen` | Trading → 10X scanner icon | `?version=v1\|v2`, `?type=assets\|stocks` |
