// Monysa — App Screen Generator
// Puts all screens on the CURRENT PAGE. No page switching, no font loading.

figma.showUI(__html__, { width: 280, height: 80, title: 'Monysa' });
figma.ui.postMessage({ text: 'Building screens…', pct: 10 });

const W = 393, H = 852, GAP = 80;
const page = figma.currentPage;

const C = {
  bg:      { r: 0.04, g: 0.04, b: 0.04 },
  surface: { r: 0.08, g: 0.08, b: 0.08 },
  card:    { r: 0.12, g: 0.12, b: 0.12 },
  border:  { r: 0.20, g: 0.20, b: 0.20 },
  accent:  { r: 0.00, g: 0.83, b: 0.67 },
  danger:  { r: 1.00, g: 0.30, b: 0.42 },
  warn:    { r: 1.00, g: 0.72, b: 0.30 },
  white:   { r: 1.00, g: 1.00, b: 1.00 },
  grey:    { r: 0.50, g: 0.50, b: 0.50 },
};

function box(parent, name, x, y, w, h, fill, radius) {
  const n = figma.createRectangle();
  n.name = name;
  n.x = x; n.y = y;
  n.resize(Math.max(w, 1), Math.max(h, 1));
  n.fills = [{ type: 'SOLID', color: fill }];
  if (radius) n.cornerRadius = radius;
  parent.appendChild(n);
  return n;
}

function frame(name, col) {
  const f = figma.createFrame();
  f.name = name;
  f.resize(W, H);
  f.fills = [{ type: 'SOLID', color: C.bg }];
  f.clipsContent = true;
  f.cornerRadius = 40;
  // status bar
  box(f, 'status-bar', 0, 0, W, 44, C.bg, 0);
  // colored top accent stripe so each screen is obviously distinct
  box(f, 'accent-stripe', 0, 0, W, 4, col, 0);
  return f;
}

function appbar(f, label) {
  box(f, 'appbar', 0, 44, W, 52, C.bg, 0);
  box(f, `title·${label}`, 16, 62, Math.round(label.length * 9), 14, C.white, 3);
  box(f, 'border', 0, 95, W, 1, C.border, 0);
}

function chips(f, y, items, activeI) {
  box(f, 'chips-bg', 0, y, W, 40, C.surface, 0);
  let cx = 12;
  items.forEach((t, i) => {
    const cw = Math.round(t.length * 7.5 + 24);
    const active = i === activeI;
    box(f, active ? `chip·ACTIVE·${t}` : `chip·${t}`,
        cx, y + 8, cw, 24,
        active ? C.accent : C.card, 12);
    cx += cw + 8;
  });
  return y + 40;
}

function tabbar(f, activeI) {
  box(f, 'tabbar', 0, H - 72, W, 72, C.surface, 0);
  box(f, 'tabbar-border', 0, H - 72, W, 1, C.border, 0);
  const labels = ['Markets', 'Trading', 'Investing', 'Macro', 'Profile'];
  labels.forEach((t, i) => {
    const cx = Math.round(i * (W / 5) + W / 10);
    const active = i === activeI;
    box(f, active ? `tab·ACTIVE·${t}` : `tab·${t}`,
        cx - 24, H - 68, 48, 56,
        active ? C.accent : C.grey, 8, active ? 0.15 : 0.08);
    if (active) box(f, `tab-bar·${t}`, cx - 16, H - 71, 32, 3, C.accent, 2);
  });
}

function cards(f, y, items) {
  items.forEach(([label, h, color]) => {
    box(f, label, 14, y, W - 28, h, color || C.card, 8);
    y += h + 8;
  });
  return y;
}

function rows(f, y, items, rowH) {
  items.forEach(label => {
    box(f, label, 14, y, W - 28, rowH || 44, C.card, 8);
    y += (rowH || 44) + 6;
  });
  return y;
}

// ── Screen 1: Markets Heatmap ─────────────────────────────
function makeMarkets(x) {
  const f = frame('Markets · Heatmap', C.accent);
  f.x = x;
  appbar(f, 'Markets');
  let y = chips(f, 96, ['Heatmap', 'Indices', 'Commodities', 'Forex', 'CFTC'], 0);
  y = chips(f, y, ['S&P500','NDX','DJI','R2K','FTSE','DAX','Nikkei','HSI','Nifty50'], 0);
  y = chips(f, y, ['1D','1W','1M','YTD'], 0);
  // treemap tiles
  const cols = [C.accent, C.danger, C.accent, C.warn, C.danger, C.accent, C.accent, C.danger, C.accent];
  const sizes = [110,80,90,70,100,60,80,70,105];
  let tx = 14, ty = y + 8, rh = 0;
  sizes.forEach((sz, i) => {
    if (tx + sz > W - 14) { tx = 14; ty += rh + 4; rh = 0; }
    box(f, `tile·stock·${i}`, tx, ty, sz - 4, sz - 4, cols[i], 4);
    rh = Math.max(rh, sz);
    tx += sz;
  });
  box(f, 'note·Pro+ · effectiveMarketCap = marketCapUsd ?? marketCap', 14, ty+120, W-28, 20, C.surface, 4);
  tabbar(f, 0);
  page.appendChild(f);
  return f;
}

// ── Screen 2: Trading Signals ─────────────────────────────
function makeTrading(x) {
  const f = frame('Trading · Signals', C.warn);
  f.x = x;
  appbar(f, 'Trading');
  let y = chips(f, 96, ['Instruments','Dashboard','Power Moves','Signals','Alerts'], 3);
  y = chips(f, y, ['ALL','Commod.','Indices','Forex','Crypto'], 0);
  y = chips(f, y, ['S1','S2','S3','S4','S5','S6','S7','S8','S9'], 0);
  box(f, 'note·S9=Silver Liquidity Sweep·SI=F only', 14, y+4, W-28, 20, C.surface, 4);
  y += 32;
  const signals = [
    ['BUY · GC=F Gold', C.accent],
    ['SELL · EURUSD', C.danger],
    ['BUY · BTC-USD Bitcoin', C.accent],
    ['HOLD · SI=F Silver', C.warn],
    ['BUY · CL=F Oil', C.accent],
    ['BUY · SPX S&P500', C.accent],
  ];
  signals.forEach(([label, col]) => {
    box(f, `signal-stripe·${label}`, 14, y, 3, 44, col, 2);
    box(f, `signal·${label}`, 14, y, W - 28, 44, C.card, 8);
    y += 50;
  });
  tabbar(f, 1);
  page.appendChild(f);
  return f;
}

// ── Screen 3: Investing / Exposure ────────────────────────
function makeInvesting(x) {
  const f = frame('Investing · Exposure', C.danger);
  f.x = x;
  appbar(f, 'Investing');
  let y = chips(f, 96, ['Exposure','Dashboard','Multibaggers','Presidential','Congress','Smart $','House Trades','Earnings'], 0);
  box(f, 'search·113+ countries · /api/tariffs · Free · Sort: Market Size/Rate/Name', 14, y+8, W-28, 32, C.surface, 8);
  y += 48;
  const rates = [
    ['🇺🇸 United States · 10%', C.accent],
    ['🇨🇳 China · 145%', C.danger],
    ['🇪🇺 European Union · 20%', C.warn],
    ['🇯🇵 Japan · 24%', C.warn],
    ['🇮🇳 India · 26%', C.warn],
    ['🇬🇧 United Kingdom · 10%', C.accent],
    ['🇻🇳 Vietnam · 46%', C.danger],
    ['🇧🇷 Brazil · 10%', C.accent],
  ];
  rates.forEach(([label, badge]) => {
    box(f, `country·${label}`, 14, y, W - 28, 44, C.card, 8);
    box(f, `tariff-badge·${label}`, W - 70, y + 10, 50, 24, badge, 6);
    y += 50;
  });
  tabbar(f, 2);
  page.appendChild(f);
  return f;
}

// ── Screen 4: Macro / Dashboard ───────────────────────────
function makeMacro(x) {
  const f = frame('Macro · Dashboard', C.grey);
  f.x = x;
  appbar(f, 'Macro');
  let y = chips(f, 96, ['Dashboard','Crisis','Debt','Calendar','Correlation'], 0);
  const hw = Math.round((W - 42) / 2);
  // 2-col gauges
  [
    ['Market Stress · Low/Med/High', 14],
    ['Fear & Greed · CNN 0–100', 14 + hw + 14],
    ['VIX · Volatility Gauge', 14],
    ['Yield Curve · Normal/Flat/Inverted', 14 + hw + 14],
  ].forEach(([label, lx], i) => {
    box(f, `gauge·${label}`, lx, y + 8 + Math.floor(i / 2) * 78, hw, 70, C.card, 10);
    // gauge arc mock
    box(f, `gauge-arc·${i}`, lx + 12, y + 32 + Math.floor(i / 2) * 78, hw - 24, 24, C.accent, 12);
  });
  y += 168;
  box(f, 'sparklines·Gold·BTC·Oil·VIX · /api/volatility/assets', 14, y, W - 28, 68, C.card, 10);
  [C.warn, C.accent, C.danger, C.grey].forEach((col, i) => {
    box(f, `spark·${i}`, 28 + i * Math.round((W - 56) / 4), y + 22, Math.round((W - 56) / 4) - 8, 24, col, 3);
  });
  y += 76;
  box(f, 'rrg·Sector Rotation · rsRatio+rsMomentum (SPX-relative centred 100)', 14, y, W - 28, 90, C.card, 10);
  box(f, 'rrg-h', 28, y + 45, W - 56, 1, C.border, 0);
  box(f, 'rrg-v', W / 2, y + 8, 1, 74, C.border, 0);
  y += 98;
  box(f, 'ai-briefing·Pro+ · GPT-4o-mini · POST /api/volatility/briefing', 14, y, W - 28, 40, C.accent, 10);
  tabbar(f, 3);
  page.appendChild(f);
  return f;
}

// ── Screen 5: Asset Detail ────────────────────────────────
function makeAsset(x) {
  const f = frame('Asset Detail · Signal (BTC-USD)', C.accent);
  f.x = x;
  box(f, 'appbar', 0, 44, W, 52, C.bg, 0);
  box(f, 'back-btn', 14, 56, 22, 26, C.accent, 6);
  box(f, 'title·BTC-USD', W / 2 - 44, 62, 88, 14, C.white, 3);
  let y = chips(f, 96, ['Chart','Signal','Indicators','Backtest','News'], 1);
  // BUY signal card
  box(f, 'signal-stripe·BUY', 14, y + 8, 3, 72, C.accent, 2);
  box(f, 'signal-card·BUY · Confidence 78% · Entry $67420 · SL $64000 · TP $72000', 14, y + 8, W - 28, 72, C.card, 10);
  box(f, 'badge·BUY', W - 82, y + 22, 54, 28, C.accent, 8);
  y = chips(f, y + 88, ['S1','S2','S3'], 0);
  box(f, 'reasoning·RSI oversold · Golden cross · Volume surge on breakout', 14, y + 6, W - 28, 110, C.card, 10);
  box(f, 'analyst-note·Pro+ · Claude Haiku · /api/trading/analyst-note/:symbol', 14, y + 124, W - 28, 72, C.card, 10);
  box(f, 'pro-lock', W - 52, y + 136, 30, 28, C.accent, 8);
  page.appendChild(f);
  return f;
}

// ── Screen 6: Profile ─────────────────────────────────────
function makeProfile(x) {
  const f = frame('Profile', C.grey);
  f.x = x;
  appbar(f, 'Profile');
  let y = 104;
  y = cards(f, y, [
    ['identity·Email · Account coming soon', 64, C.card],
    ['subscription·RevenueCat · plan badge · Upgrade → paywall', 64, C.card],
    ['theme·_ThemeSection IN BODY (not AppBar!) · Dark/Light toggle pill', 64, C.card],
    ['font-size·Regular 0.9x / Enlarged 1.0x · fontSizeScaleProvider', 52, C.card],
    ['chart-provider·Yahoo / TradingView · restart required · RestartWidget', 52, C.card],
    ['about·Version · Links', 48, C.card],
  ]);
  tabbar(f, 4);
  page.appendChild(f);
  return f;
}

// ── Screen 7: Onboarding ──────────────────────────────────
function makeOnboarding(x) {
  const f = frame('Onboarding', C.accent);
  f.x = x;
  box(f, 'logo-glow', W/2-60, 160, 120, 120, C.accent, 60);
  box(f, 'logo', W/2-26, 186, 52, 52, C.accent, 12);
  box(f, 'app-name·Monysa', W/2-52, 300, 104, 18, C.white, 4);
  box(f, 'tagline·Global Markets & AI Signals', W/2-96, 328, 192, 12, C.grey, 3);
  cards(f, 380, [
    ['feature1·46 indices · 23 commodities · 44 forex', 52, C.card],
    ['feature2·AI Signals BUY/HOLD/SELL · S1–S9 strategies', 52, C.card],
    ['feature3·Tariff Exposure · 113+ countries · Free', 52, C.card],
    ['feature4·Multibaggers · Congress · OGE · Smart Money', 52, C.card],
  ]);
  box(f, 'cta·Get Started', 40, H - 144, W - 80, 48, C.accent, 12);
  page.appendChild(f);
  return f;
}

// ── Screen 8: Country Detail ──────────────────────────────
function makeCountry(x) {
  const f = frame('Country Detail · United States', C.warn);
  f.x = x;
  appbar(f, '← United States');
  let y = 104;
  cards(f, y, [
    ['overview·GDP $28.7T · Trade –$67B/mo · Tariff 10% · /api/country-data/:code', 82, C.card],
    ['sectors·Technology 25% · Finance 20% · Auto 12% · /api/tariffs→sectors[]', 64, C.card],
    ['military·Budget $916B · Active 1.4M · World Bank', 64, C.card],
    ['debt-to-usa·US Treasuries $1.07T · laymanExplanation', 90, C.card],
  ]);
  box(f, 'cta·View US Stocks →', 40, H - 144, W - 80, 46, C.accent, 12);
  page.appendChild(f);
  return f;
}

// ── Screen 9: Macro Calendar ──────────────────────────────
function makeMacroCalendar(x) {
  const f = frame('Macro · Calendar', C.grey);
  f.x = x;
  appbar(f, 'Macro');
  let y = chips(f, 96, ['Dashboard','Crisis','Debt','Calendar','Correlation'], 3);
  box(f, 'note·FF Calendar · /api/economy/events · FOMC static fallback', 14, y + 6, W - 28, 24, C.surface, 6);
  y += 38;
  rows(f, y, [
    'event·FOMC Meeting Jun 17–18 · High impact USD',
    'event·CPI Report Jul 11 · High impact USD',
    'event·NFP Jobs Jul 4 · High impact USD',
    'event·PCE Deflator May 31 · Medium impact',
    'event·GDP Q1 Final Jun 27 · High impact',
    'event·Jackson Hole Aug 21–23 · High impact',
    'event·FOMC Minutes Jul 9 · High impact',
  ], 46);
  tabbar(f, 3);
  page.appendChild(f);
  return f;
}

// ── Screen 10: Trading Power Moves ────────────────────────
function makePowerMoves(x) {
  const f = frame('Trading · Power Moves', C.warn);
  f.x = x;
  appbar(f, 'Trading');
  let y = chips(f, 96, ['Instruments','Dashboard','Power Moves','Signals','Alerts'], 2);
  y = chips(f, y, ['Indices','Forex','Commodities','Crypto'], 0);
  y = chips(f, y, ['v1','v2','v3 Pine'], 2);
  box(f, 'note·v3: Thrust·Base·Uptrend·NewHigh·RegimeBreak · auto v3 fork per type', 14, y + 4, W - 28, 22, C.surface, 6);
  y += 34;
  rows(f, y, [
    'row·SPX 8/10 RegimeBreak · /api/trading/scanner/10x-v3/assets',
    'row·NDX 7/10 Thrust',
    'row·DAX 6/10 Uptrend',
    'row·DXY 5/10 Base',
    'row·Gold GC=F 6/10 NewHigh',
    'row·Oil CL=F 4/10 Base',
    'row·Nikkei 5/10 Uptrend',
  ], 50);
  tabbar(f, 1);
  page.appendChild(f);
  return f;
}

// ── Build all and wire flows ──────────────────────────────
figma.ui.postMessage({ text: 'Building screens…', pct: 40 });

const s1  = makeMarkets(0 * (W + GAP));
const s2  = makeTrading(1 * (W + GAP));
const s3  = makeInvesting(2 * (W + GAP));
const s4  = makeMacro(3 * (W + GAP));
const s5  = makeAsset(4 * (W + GAP));
const s6  = makeProfile(5 * (W + GAP));
const s7  = makeOnboarding(6 * (W + GAP));
const s8  = makeCountry(7 * (W + GAP));
const s9  = makeMacroCalendar(8 * (W + GAP));
const s10 = makePowerMoves(9 * (W + GAP));

figma.ui.postMessage({ text: 'Wiring flows…', pct: 80 });

function flow(a, b) {
  if (!a || !b) return;
  a.reactions = [...(a.reactions || []), {
    action: { type: 'NODE', destinationId: b.id, navigation: 'NAVIGATE',
              transition: { type: 'SMART_ANIMATE', easing: { type: 'EASE_OUT' }, duration: 280 },
              preserveScrollPosition: false },
    trigger: { type: 'ON_CLICK' },
  }];
}

flow(s7, s1);   // Onboarding → Markets
flow(s1, s2);   flow(s2, s3);   flow(s3, s4);
flow(s4, s5);   flow(s5, s6);   flow(s6, s7);
flow(s3, s8);   // Investing → Country Detail
flow(s4, s9);   // Macro → Calendar
flow(s2, s10);  // Trading → Power Moves

figma.ui.postMessage({ text: 'Done!', pct: 100 });
figma.viewport.scrollAndZoomIntoView([s1, s2, s3, s4, s5]);
figma.closePlugin('✅ 10 screens on this page — check layers panel for all labels');
