# FinBrio — TestFlight Release Notes
_Covers changes from 2026-07-17 to 2026-07-26_

Copy-paste ready text for App Store Connect → TestFlight → "What to Test" below the divider.

---

**New**
• **Manage Subscription** (Profile) — cancel, request a refund, restore a purchase, or reach support directly from the app via a new in-app Customer Center. No more emailing support to cancel.
• **Delete Account** (Profile) — remove your account and its data from within the app.
• Upgrade screen now shows a live, remotely-configured paywall (monthly or annual, whichever your offer includes) instead of a fixed in-app design — pricing/copy can now change without an app update, and it falls back gracefully if purchases are briefly unavailable.
• Sign-up with email now asks for your name.
• **Earnings Calendar** (Investing) — pick S&P 500, Nasdaq 100, or Dow Jones; filter to the next 7/15/30 days; toggle mega-caps only; filter by sector; search by symbol/name. Each entry now shows market cap, EPS estimate, a YoY growth badge, and a pre/after-market timing icon, grouped under sticky per-day headers with a "N reporting · Busiest day" summary.
• **ETF Explorer** (Investing) — every ETF now shows a MoM / QoQ / YoY performance strip (Pro; one ETF is always shown free, moved to the top of the list).
• **Country Detail** (Investing → Exposure → tap a country) — new "View Top Listed Stocks" button for every one of the 113+ countries (Pro; free users see a lock icon and a paywall prompt).
• **Markets → Heatmap** — top tiles now show a gold ring when there's been strong buying pressure in the last 30 minutes during regular market hours.
• Profile → About now shows your actual installed app version and build number instead of a fixed label.

**Improved**
• **Markets → Heatmap tab is now completely free** — all 9 indices and the 1-Day view are open to everyone. Only the zoomed-out 1W/1M/YTD views require Pro (the whole tab used to be Pro-only).
• Switching chart provider in Profile now applies instantly — removed the old "restart required" confirmation, which didn't actually restart anything.
• Subscription plans simplified to **Free** and **Pro** only.
• Google Sign-In now reliably shows your name on your profile even when Google doesn't hand it over automatically.
• Loading skeletons for Multibaggers, Power Moves, Presidential, and Smart $ are more consistent (shared shimmer + filter-chip components across screens).

**New Pro previews** _(existing content is now partially visible for Free, blurred/teased rather than fully hidden)_
• Markets → Forex rows show a central-bank rate-comparison note (Pro; blurred preview for Free).
• Markets → CFTC shows one asset per category free; the rest are Pro.
• Investing → Presidential — the newest filing batch collapses into a single "N latest filings — Upgrade to Pro" row; every earlier filing stays free.
• Macro → Dashboard performance heatmap — 1D/1W stay free; 1M/3M/6M/1Y/3Y/5Y require Pro.
• Macro → Correlation — the 1M window stays free; 3M/6M/1Y require Pro.

---

_Also shipped this period, but on the web (not part of this TestFlight build):_ the finbrio.net marketing site went live, and the web app at app.finbrio.net picked up matching filter and Free/Pro preview fixes across Markets, Investing, and Macro.
