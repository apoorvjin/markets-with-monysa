# Monysa — Product Roadmap

**Based on**: product.md and manual.md  
**Perspective**: Strategic feature development to extend core capabilities  

---

## Roadmap Philosophy

Monysa's current foundation covers global tariff intelligence, live market data, and real-time crisis analysis. The roadmap below builds on these pillars to deepen analytical value, broaden user engagement, and move the app toward a personalized, actionable intelligence platform.

---

## Phase 1 — Depth & Engagement (Near-Term)

### 1.1 Push Notifications for Market Alerts
**What**: Allow users to set threshold alerts for any index, commodity, forex pair, or crisis asset. Trigger push notifications when:
- A price moves more than X% in a session
- VIX crosses into a new band (e.g., crosses from Caution into Elevated)
- The Market Stress Score exceeds a user-defined threshold

**Why**: Transforms Monysa from a passive lookup tool to an active intelligence companion. Investors don't want to open the app to know when markets are moving — they want to be told.

**Dependencies**: Expo Notifications (expo-notifications), backend alert scheduler, user alert preference storage (PostgreSQL).

---

### 1.2 Watchlist / Favourites
**What**: Let users pin specific countries, stocks, indices, commodities, or forex pairs to a personalised "Watchlist" tab. The watchlist updates live and is persisted across sessions.

**Why**: Power users frequently return to the same set of assets. A watchlist eliminates the friction of searching repeatedly and creates a personalised home screen.

**Dependencies**: AsyncStorage or PostgreSQL user preferences table, watchlist tab in tab bar.

---

### 1.3 Tariff Change History Timeline
**What**: For each country, display a visual timeline of tariff rate changes over time (e.g., pre-April 2025 rates, April 2025 action, any subsequent changes). Show percentage change between periods.

**Why**: Tariff rates are not static — they are a policy lever. Understanding trajectory is as important as knowing the current rate. A timeline gives context to current rates and supports trend analysis.

**Dependencies**: Historical tariff data collection (manual curation initially), timeline UI component.

---

### 1.4 Sector-Level News Feed
**What**: For each country's sector tariff breakdown (Manufacturing, Agriculture, Technology, Energy, Services), surface relevant news headlines from a news API (e.g., NewsAPI, GNews, or Yahoo Finance RSS). 

**Why**: Tariff rates are meaningful only in context. A news item explaining why the Agriculture rate spiked adds analytical depth that raw numbers cannot.

**Dependencies**: News API integration, per-sector keyword mapping, news cache layer.

---

### 1.5 TradingView Chart Improvements
**What**:
- Add a timeframe selector (1D / 1W / 1M / 3M / 1Y) within the TradingView chart modal
- Allow users to add basic annotations or screenshot the chart
- Show related news headlines within the chart panel

**Why**: Users who open a chart want to do more than view the default view. Timeframe control and contextual news make the chart panel a self-contained research tool.

---

## Phase 2 — Personalisation & Portfolio Intelligence

### 2.1 Portfolio Tracker
**What**: Let users manually enter their holdings (stock tickers, quantities, entry prices). Monysa calculates:
- Current portfolio value (live prices)
- Daily / weekly / monthly % gain/loss
- Portfolio exposure by sector and country
- Tariff risk score for the portfolio (based on country exposure)

**Why**: Most portfolio apps show holdings but not geopolitical context. Monysa's unique value is connecting market holdings to tariff and crisis risk — no mainstream app does this.

**Dependencies**: User account system (authentication), portfolio data schema in PostgreSQL, holding input UI.

---

### 2.2 Tariff Risk Scoring for Portfolios
**What**: Automatically calculate a "Tariff Risk Score" for a user's portfolio based on:
- Countries of revenue exposure for each held company
- Sector tariff rates for those countries
- Portfolio weighting

Surface a single composite score and breakdown by country and sector.

**Why**: Institutional investors use tariff exposure analysis routinely. Making this available at the retail level — automatically, for any portfolio — is a significant differentiator.

**Dependencies**: Company-country revenue exposure data (requires an external data source or enrichment model), Portfolio Tracker (2.1).

---

### 2.3 Scenario Analysis / What-If Tool
**What**: A simulation tool where users can input hypothetical tariff changes (e.g., "What if China tariffs increase from 25% to 50%?") and see:
- Estimated impact on sector-specific import costs
- Historical precedents from the Crisis Playbook
- Which assets in the Markets tab have historically responded to similar events

**Why**: Analysts and portfolio managers use scenario planning constantly. Monysa already has all the underlying data — this feature connects tariff changes to market outcomes.

**Dependencies**: Scenario engine (rules-based initially), historical asset response data, scenario input UI.

---

### 2.4 Personalised AI Morning Briefing
**What**: A daily push notification and in-app "Morning Briefing" generated by GPT-4o-mini (or GPT-4o) each morning that covers:
- Overnight market moves in the user's watchlist
- Changes in the Market Stress Score since yesterday
- Any countries in the user's portfolio/watchlist that had significant tariff-related news
- 5 bullet points, plain English

**Why**: The AI Briefing in the Crisis tab is reactive — it runs when users tap a button. A proactive daily briefing turns Monysa into a daily financial habit, dramatically increasing retention.

**Dependencies**: Scheduled backend job (cron), push notifications (1.1), AI briefing endpoint extension, user preferences (watchlist + portfolio).

---

## Phase 3 — Analytics & Community

### 3.1 Crisis Correlation Heatmap
**What**: A visual heatmap showing how different asset classes (equities, gold, oil, bonds, forex) have historically correlated during each of the six crisis events in the Crisis Playbook. Users can filter by crisis type and see cross-asset correlations as a colour grid.

**Why**: Understanding correlation breakdown during stress is essential for portfolio construction. Most retail investors don't know that gold and equities can both fall in a liquidity crisis (e.g., March 2020). A heatmap teaches this visually.

**Dependencies**: Historical price data collection for crisis periods, heatmap UI component.

---

### 3.2 Country Comparison Tool
**What**: Side-by-side comparison of any two countries across:
- Tariff rates (overall and sector)
- Top traded stocks and performance
- Debt-to-USA relationship
- Trade volume context

**Why**: Investors and trade analysts constantly compare jurisdictions. Allowing direct side-by-side comparison saves time and surfaces differences that would be missed switching screens.

**Dependencies**: Country comparison UI, side-by-side layout, data normalization layer.

---

### 3.3 Live Economic Calendar
**What**: A calendar of upcoming macro events (Fed meetings, CPI releases, earnings dates, trade policy announcements) with:
- Countdown timers
- Historical impact on VIX and key assets
- Push notification reminders

**Why**: Major macro events are the primary driver of the VIX spikes and stress events that Monysa already tracks. Knowing what's coming next is the natural complement to understanding what has happened.

**Dependencies**: Economic calendar API (e.g., Tradingeconomics, Alpha Vantage), calendar UI, notification scheduling.

---

### 3.4 Tariff Exposure Screener
**What**: A reverse screener — instead of starting from a country and finding tariff rates, start from a sector (e.g., "Semiconductors") and surface:
- All countries with tariff rates above a threshold for that sector
- Estimated cost impact per $1M of imports
- Top companies most exposed to that tariff

**Why**: Corporate procurement teams, trade lawyers, and supply chain managers think in terms of sectors and inputs, not countries. A sector-first view opens Monysa to B2B use cases.

**Dependencies**: Sector-country tariff index, company-sector mapping data, screener UI.

---

## Phase 4 — Platform Expansion

### 4.1 Web Dashboard (Expanded)
**What**: A dedicated desktop web version of Monysa with a multi-panel layout (not just a responsive mobile site). Panels for: Country map, Markets watchlist, Crisis Meter, and AI Briefing — visible simultaneously.

**Why**: Financial professionals work on desktop. A multi-panel desktop layout makes Monysa usable in a professional research context alongside Bloomberg, Reuters, or Excel.

**Dependencies**: Expo Web (already supported), responsive layout system, desktop-specific navigation.

---

### 4.2 API Access (Developer Tier)
**What**: Expose Monysa's tariff data, stress scores, and crisis metrics via a REST API for developers and institutions. Rate-limited free tier + paid tier.

**Why**: The tariff data, stress composite, and VIX band classifications have value as standalone data feeds for quant models, dashboards, and trading systems. An API monetizes the data layer independently of the app.

**Dependencies**: API key management, rate limiting middleware, developer documentation portal.

---

### 4.3 Shareable Reports
**What**: Generate a shareable PDF or image "snapshot" of:
- A country's tariff profile
- The current Crisis Playbook state (stress score + AI briefing + VIX)
- A portfolio tariff risk summary

Shared via native share sheet (iOS/Android) or downloadable on web.

**Why**: Analysts need to share findings with clients, colleagues, or investment committees. One-tap sharing turns Monysa outputs into deliverables.

**Dependencies**: React Native PDF / image export library, Share API, report template design.

---

## Summary Table

| Feature | Phase | Effort | Business Impact |
|---|---|---|---|
| Push notifications / alerts | 1 | Medium | High retention |
| Watchlist / favourites | 1 | Low | High engagement |
| Tariff change timeline | 1 | Medium | High differentiation |
| Sector news feed | 1 | Medium | High context value |
| TradingView enhancements | 1 | Low | Medium UX improvement |
| Portfolio tracker | 2 | High | Very high — new user segment |
| Tariff risk scoring | 2 | High | Very high differentiation |
| Scenario / What-If tool | 2 | High | High — analyst segment |
| Personalised AI briefing | 2 | Medium | Very high retention |
| Crisis correlation heatmap | 3 | Medium | High — educational value |
| Country comparison tool | 3 | Medium | High — analyst segment |
| Live economic calendar | 3 | Medium | High engagement |
| Tariff exposure screener | 3 | High | B2B market entry |
| Desktop web dashboard | 4 | High | Professional segment |
| API access (developer tier) | 4 | High | New revenue stream |
| Shareable reports | 4 | Medium | Enterprise sales enablement |
