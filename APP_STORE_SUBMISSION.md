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
NEW: FinBrio is now on the web at app.finbrio.net — sign in once and your account, watchlist, and Pro plan follow you across devices, no install required.
```
(156/170). This field is the fastest way to reach people who already have the app installed — Apple lets you change it anytime without a new build or review, so it doesn't have to wait for the next version to go live. Swap it back to the original markets/signals/macro copy (below) once the web-app announcement has had a couple of weeks of visibility:
```
Live global markets, AI trading signals, tariff exposure, and macro dashboards in one app. Track ETFs, smart money flows, and crisis playbooks in real time.
```

## What's New in This Version (App Store Connect → version page → "What's New in This Version")
```
🌏 Markets just went more global. Our hedge-fund positioning tracker (Markets → CFTC) now follows Nikkei 225 right alongside the US benchmarks — plus a brand-new Regional Flows view: India's daily foreign-vs-domestic institutional buying and selling, updated every trading day. Free for everyone, no subscription required.

Also in this update:
• More room to see the data — filter chips on Signals and Heatmap now scroll away with your results instead of pinning a strip across the top.
• Fixed a keyboard overlap on Multibaggers that could cover the search field while you typed.
• Small naming and polish fixes throughout Multibaggers.
```
This mirrors [TESTFLIGHT_RELEASE_NOTES.md](TESTFLIGHT_RELEASE_NOTES.md)'s feature list, rewritten for customers rather than beta testers (benefit-first, no internal jargon like "Pro-gated," "FII/DII," or version numbers) — keep the two in sync when either changes before submission.

## Keywords (100 chars max, comma-separated)
```
markets,trading,signals,macro,stocks,forex,etf,tariffs,VIX,investing,indices,commodities,ai
```

## Description (4000 chars max)

```
FinBrio brings professional-grade market intelligence to your pocket — live global markets, AI-generated trading signals, and macro risk analysis in one clean, fast app.

LIVE MARKETS
Track 46 global indices, 23 commodities, and 44 forex pairs with real-time candlestick charts. See the whole market at a glance with a market-cap-weighted heatmap across 9 major indices — S&P 500, NASDAQ 100, Dow Jones, Russell 2000, FTSE 100, DAX 40, Nikkei 225, Hang Seng, and Nifty 50 — with a gold-ring alert on tiles showing strong buying pressure in the last 30 minutes.

AI TRADING SIGNALS
Get BUY / HOLD / SELL signals with entry price, stop-loss, take-profit, and plain-English reasoning across 49+ assets. Choose from multiple built-in strategies, compare a strategy's standard signal against its enhanced version, and review walk-forward backtests before you trust any signal.

INVESTING
Discover Best Setups and Multibaggers screens across US, India, UK, Japan, Hong Kong, China, and Euronext equities. Track upcoming reports with a filterable Earnings Calendar (market cap, EPS estimates, YoY growth), follow Presidential trading disclosures, lobbying-growth and insider-buying activity ("Smart Money"), and explore an ETF universe of 42 curated funds with holdings, sector weights, expense ratios, performance, and rotation analysis.

TARIFF EXPOSURE
Browse US tariff impact across 113+ countries with sector-level breakdowns and an at-a-glance impact score, then drill into any country's top listed stocks — built for anyone tracking trade policy risk.

MACRO
Monitor the Market Stress Meter, VIX, Fear & Greed Index, yield curve, sector rotation, and a correlation matrix with rolling history. Read the historical crisis playbook, get an AI-generated macro briefing, and track the US federal debt clock with live Treasury and World Bank data.

Built for macro-minded investors, active traders, and anyone who wants to understand what's actually moving markets — not just headlines.

Also on the web — sign in at app.finbrio.net and your account, watchlist, and Pro plan carry over across devices.

FinBrio is free to start. Pro unlocks advanced signal strategies, unlimited price alerts, deeper backtests, extended timeframes, and AI-driven analysis — manage or cancel your subscription anytime, right in the app.

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
- Subscription tiers (Free / Pro) are managed via RevenueCat + StoreKit; no external payment links are used anywhere in the app.
- Subscriptions can be managed, cancelled, or refund-requested in-app via Profile → Manage Subscription (Customer Center), and the account itself can be deleted in-app via Profile → Delete Account.
```

---

### ⚠️ Action needed before you submit
1. ~~Create a demo account~~ — done: `test@finbrio.net` was created in Firebase Auth via `server/scripts/create-demo-account.ts`, pre-verified (`emailVerified: true`). Confirm it can sign in on a real device/simulator build before submitting.
2. ~~Double-check the description's tier language against ASC subscription product names~~ — done: tiers simplified to Free/Pro only (Insight was retired); description and review notes updated to match.

#### Guideline 3.1.2(c) fix (subscription rejection, 2026-08)

**In-app paywall — DONE in code.** `UpgradeSheet.show()` no longer calls `RevenueCatUI.presentPaywall()`. RevenueCat has **zero paywalls configured** (verified in the dashboard: Paywalls → "No paywalls yet"), so `presentPaywall()` was rendering RevenueCat's **auto-generated default paywall** — logo + price + Continue only, with no feature list and no Terms/Privacy links — which is the exact screen App Review rejected. The app now **always** shows the custom `UpgradeSheet` ([moby/lib/shared/widgets/upgrade_sheet.dart](moby/lib/shared/widgets/upgrade_sheet.dart)), which states the plan **title** ("FinBrio Pro — Monthly"), **length + price** ("7-day free trial, then $12.99/month. Renews automatically every month until canceled."), **what Pro includes** (Free vs Pro comparison), and **functional Terms of Use + Privacy Policy links**. Purchases still run through RevenueCat/StoreKit via `_onPurchaseTap` (`getOfferings()` + `purchasePackage()`); restore unaffected. → **Requires a fresh build** (`./build_testflight.sh`); a hot restart won't ship it.

3. **Set the Terms of Use (EULA) link in App Store Connect.** Apple checks metadata separately from the in-app screen. Easiest reliable method: add a line at the bottom of the **Description** (App version → Prepare for Submission → Description): `Terms of Use (EULA): https://www.finbrio.net/terms`. (Optional alternative/addition: App Information → License Agreement → Custom License Agreement → paste the full text of finbrio.net/terms — that field takes text, not a URL.)
4. **Confirm the Privacy Policy field in App Store Connect** (App Information → Privacy Policy URL) points to `https://www.finbrio.net/privacy`.
5. **RevenueCat dashboard paywall — NOT needed.** Leave the Paywalls section empty. The app uses its own in-app sheet (item above), so no dashboard paywall has to be built or maintained. (If one is ever created and attached to the `default` offering, switch the code back to `presentPaywall()` and make sure that paywall carries the same title/length/price/benefits + Terms/Privacy footer links.)
6. **Confirm the subscription product's display name** (Monetization → Subscriptions → `finbrio_pro_monthly`) reads "FinBrio Pro" (verified in dashboard) — this surfaces on Apple's native purchase-confirmation sheet, so keep it human-readable, not an internal SKU.
7. **Verify on a Sandbox build before submitting:** trigger a Pro feature (e.g. Trading → Signals → S4) and confirm the **custom** sheet appears (Free/Pro comparison + "FinBrio Pro — Monthly" disclosure + Terms/Privacy links), NOT the old logo/price/Continue screen. Tap both legal links to confirm they open finbrio.net.
