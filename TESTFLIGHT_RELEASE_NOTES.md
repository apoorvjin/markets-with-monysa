# FinBrio — Customer Release Notes
_Covers changes since the last submitted build (1.1.1, build 202608150804, submitted 2026-08-15 08:04 AM)_

---

## Part 1 — Mobile app (iOS)
Copy-paste ready text for App Store Connect → TestFlight → "What to Test" below the divider.

---

**New**
🌏 **Markets just went more global.** The CFTC positioning tracker (Markets → CFTC → Indices & Rates) now follows **Nikkei 225** right alongside the US benchmarks — same hedge-fund long/short data you already trust, one more major market covered. And it's joined by a brand-new **Regional Flows** section: India's daily foreign-vs-domestic institutional buying and selling, straight from the NSE, updated every trading day — free for every user, no Pro gate.
_Please test:_ Markets → CFTC → tap "Regional Flows" and confirm the India card loads with today's buy/sell/net figures.

**Improved / Fixed**
• **More room to breathe.** Filter chips on Trading → Signals and Markets → Heatmap now scroll away with your results instead of pinning a fixed strip across the top — less chrome, more chart.
_Please test:_ scroll down either screen and confirm the chips move naturally with the list instead of staying stuck.
• Fixed a keyboard-overlap bug on Multibaggers where searching for a stock could let the keyboard cover the field you were typing into.
• The Backtest link from Multibaggers now correctly titles itself "Multibagger Backtest" when you open it (was showing a generic title).
• Multibaggers' own version toggle and info sheet now say **"Early Setup"** / **"Confirmed Breakout"**, matching the naming used everywhere else in the app.

---

## Part 2 — Introducing FinBrio Terminal (web)
_New this period on the web app (app.finbrio.net) — not part of the iOS TestFlight build, but worth telling every customer about._

**FinBrio Terminal** is a new, full-bleed trading desk at **app.finbrio.net/terminal** — a Bloomberg-style, build-your-own multi-panel workspace. It's designed for desktop, laptop, and iPad; on a phone, Terminal points you back to the regular Markets/Trading/Investing/Macro/Wire tabs, which stay fully phone-ready. Free for every signed-in user.

• **Build your own desk.** Add, remove, resize, and reorder panels from **17 live widgets**; save multiple named layouts and switch between them instantly — your layout is yours, not a fixed dashboard.
• **Markets panels** — Chart, Watchlist, Treemap, Movers, Market Board (live quotes).
• **Macro panels** — Macro dashboard, Correlation matrix, Economic Calendar, CFTC COT positioning.
• **Trading panels** — Signals, Compare, and a Portfolio panel to paper-track your own positions.
• **Intel panels** — Wire, Breaking, Geo-Intel (earthquakes, prediction markets, maritime and airspace activity), Institutional Flow, and Smart Money.
• A live ticker tape runs across the top of every layout; a status bar at the bottom shows stream/poll connection state, the UTC clock, your live feed count, and whichever symbol you currently have focused.

**New: Data Centers** — **app.finbrio.net/datacenters**
A first-of-its-kind AI-infrastructure tracker, also free to everyone:
• **Facilities layer** — roughly 4,500 existing data centers worldwide, mapped from OpenStreetMap.
• **Pipeline layer** — US & Canada data-center buildout tracked through power-grid interconnection filings, grouped by county and colored by status (Proposed / Under Construction / Operational) — a forward-looking read on where AI capex is actually landing, ahead of it showing up in any earnings report.
• **Announcements** — recent hyperscaler press releases, tagged with the tickers they mention.
• Search by facility, operator, or county; click any pin or list row to fly the map straight to it.

---

_Also underway this period, on the web app (not covered above):_ mandatory sign-in and a server-verified Pro entitlement check for app.finbrio.net.
