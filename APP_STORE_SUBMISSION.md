# FinBrio — App Store Connect Submission Copy

Everything below is copy-paste ready into App Store Connect. Character counts noted where Apple enforces a hard limit.

---

## Subtitle (30 chars max)
```
Markets, Signals & Macro Intel
```
(30/30)

## Promotional Text (170 chars max — editable anytime without a new review)
```
Live global markets, AI trading signals, tariff exposure, and macro dashboards in one app. Track ETFs, smart money flows, and crisis playbooks in real time.
```

## Keywords (100 chars max, comma-separated)
```
markets,trading,signals,macro,stocks,forex,etf,tariffs,VIX,investing,indices,commodities,ai
```

## Description (4000 chars max)

```
FinBrio brings professional-grade market intelligence to your pocket — live global markets, AI-generated trading signals, and macro risk analysis in one clean, fast app.

LIVE MARKETS
Track 46 global indices, 23 commodities, and 44 forex pairs with real-time candlestick charts. See the whole market at a glance with a market-cap-weighted heatmap across 9 major indices — S&P 500, NASDAQ 100, Dow Jones, Russell 2000, FTSE 100, DAX 40, Nikkei 225, Hang Seng, and Nifty 50.

AI TRADING SIGNALS
Get BUY / HOLD / SELL signals with entry price, stop-loss, take-profit, and plain-English reasoning across 49+ assets. Choose from multiple built-in strategies, compare a strategy's standard signal against its enhanced version, and review walk-forward backtests before you trust any signal.

INVESTING
Discover Best Setups and Multibaggers screens across US, India, UK, Japan, Hong Kong, China, and Euronext equities. Follow Presidential trading disclosures, lobbying-growth and insider-buying activity ("Smart Money"), and an ETF Explorer covering 42 curated funds with holdings, sector weights, expense ratios, and rotation analysis.

TARIFF EXPOSURE
Browse US tariff impact across 113+ countries with sector-level breakdowns and an at-a-glance impact score — built for anyone tracking trade policy risk.

MACRO
Monitor the Market Stress Meter, VIX, Fear & Greed Index, yield curve, sector rotation, and a correlation matrix with rolling history. Read the historical crisis playbook, get an AI-generated macro briefing, and track the US federal debt clock with live Treasury and World Bank data.

Built for macro-minded investors, active traders, and anyone who wants to understand what's actually moving markets — not just headlines.

FinBrio is free to start. Pro and Insight tiers unlock advanced signal strategies, unlimited price alerts, deeper backtests, and AI-driven analysis.

All content is for informational purposes only and does not constitute financial or investment advice. Always do your own research before making investment decisions.
```

---

## Notes for App Review (App Store Connect → "App Review Information" → Notes)

```
FinBrio now requires a signed-in, verified account to access any part of the app (previously anonymous access was allowed). Please use the demo account below to review — do not use "Sign in with Google," as it requires a live Google account:

Demo login (email/password):
  Email:    test@finbrio.net
  Password: test@finbrio.net

This account is pre-verified so the reviewer can skip email verification. If verification is still triggered, the "Resend email" option on the verification screen will send a real email to the address above.

Notes on sign-in options:
- Email/password and Sign in with Google are both live.
- "Continue with Apple" is intentionally shown but disabled ("Coming Soon") — email/password satisfies Guideline 4.8's requirement for an alternative to third-party login, and Apple Sign-In will be enabled in a follow-up release.

Notes on content:
- All trading signals, backtests, and AI commentary are clearly labeled as informational only, not financial advice (see in-app disclaimers and the Support page).
- Market/trading data comes from third-party providers (Yahoo Finance, Treasury, World Bank, SEC EDGAR, Senate LDA) and may be briefly unavailable outside market hours — this is expected, not a bug.
- Subscription tiers (Pro / Insight) are managed via RevenueCat + StoreKit; no external payment links are used anywhere in the app.
```

---

### ⚠️ Action needed before you submit
1. ~~Create a demo account~~ — done: `test@finbrio.net` was created in Firebase Auth via `server/scripts/create-demo-account.ts`, pre-verified (`emailVerified: true`). Confirm it can sign in on a real device/simulator build before submitting.
2. Double-check the description's tier language ("Pro and Insight tiers unlock...") against whatever your actual App Store Connect subscription product names/descriptions are, so they match exactly.
