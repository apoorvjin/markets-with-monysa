import 'package:url_launcher/url_launcher.dart';

abstract final class TvSymbol {
  // ── Symbol catalog ────────────────────────────────────────────────────────
  // Three columns: Yahoo Finance symbol | Yahoo Finance name | TradingView symbol
  // ┌──────────────────┬─────────────────────────────────┬──────────────────────────┐
  // │ Yahoo Symbol     │ Yahoo Finance Name              │ TradingView Symbol        │
  // ├──────────────────┼─────────────────────────────────┼──────────────────────────┤
  static const _catalog = <String, ({String yahooName, String tvSymbol})>{
    // ── Indices ────────────────────────────────────────────────────────────
    // TradingView embedded widget requires a paid subscription for ALL index
    // symbols (including TVC: namespace). Indices are kept in the catalog only
    // for the yahooName() lookup; resolveForTv() blocks all ^ symbols, so they
    // always fall back to Yahoo Finance LWC when TradingView mode is active.
    '^GSPC':     (yahooName: 'S&P 500',                   tvSymbol: 'TVC:SPX'),
    '^DJI':      (yahooName: 'Dow Jones Industrial Avg',  tvSymbol: 'TVC:DJI'),
    '^IXIC':     (yahooName: 'NASDAQ Composite',          tvSymbol: 'TVC:NDX'),
    '^RUT':      (yahooName: 'Russell 2000',              tvSymbol: 'TVC:RUT'),
    '^VIX':      (yahooName: 'CBOE Volatility Index',     tvSymbol: 'TVC:VIX'),
    '^FTSE':     (yahooName: 'FTSE 100',                  tvSymbol: 'TVC:UK100'),
    '^GDAXI':    (yahooName: 'DAX',                       tvSymbol: 'TVC:DEU40'),
    '^FCHI':     (yahooName: 'CAC 40',                    tvSymbol: 'TVC:FRA40'),
    '^STOXX50E': (yahooName: 'EURO STOXX 50',             tvSymbol: 'TVC:SX5E'),
    '^IBEX':     (yahooName: 'IBEX 35',                   tvSymbol: 'TVC:ESP35'),
    '^AEX':      (yahooName: 'AEX',                       tvSymbol: 'TVC:AEX'),
    '^SSMI':     (yahooName: 'SMI',                       tvSymbol: 'TVC:SMI'),
    '^N225':     (yahooName: 'Nikkei 225',                tvSymbol: 'TVC:NI225'),
    '^HSI':      (yahooName: 'Hang Seng Index',           tvSymbol: 'TVC:HSI'),
    '^NSEI':     (yahooName: 'NIFTY 50',                  tvSymbol: 'TVC:NIFTY50'),
    '^BSESN':    (yahooName: 'BSE SENSEX',                tvSymbol: 'TVC:SENSEX'),
    '^AORD':     (yahooName: 'All Ordinaries',            tvSymbol: 'TVC:ASX200'),
    '^KS11':     (yahooName: 'KOSPI Composite',           tvSymbol: 'TVC:KOSPI'),
    '^TWII':     (yahooName: 'Taiwan Weighted Index',     tvSymbol: 'TVC:TWII'),
    '^SSEC':     (yahooName: 'Shanghai Composite',        tvSymbol: 'TVC:SHCOMP'),
    '^STI':      (yahooName: 'STI Index',                 tvSymbol: 'TVC:STI'),
    '^BVSP':     (yahooName: 'IBOVESPA',                  tvSymbol: 'TVC:IBOV'),
    '^MXX':      (yahooName: 'IPC Mexico',                tvSymbol: 'TVC:MXX'),
    // ── Precious Metals — TVC CFD (free, no subscription required) ────────
    'GC=F':      (yahooName: 'Gold',                      tvSymbol: 'TVC:GOLD'),
    'SI=F':      (yahooName: 'Silver',                    tvSymbol: 'TVC:SILVER'),
    'PL=F':      (yahooName: 'Platinum',                  tvSymbol: 'TVC:PLATINUM'),
    'PA=F':      (yahooName: 'Palladium',                 tvSymbol: 'TVC:PALLADIUM'),
    // ── Energy — TVC CFD (free) ────────────────────────────────────────────
    'CL=F':      (yahooName: 'WTI Crude Oil',             tvSymbol: 'TVC:USOIL'),
    'BZ=F':      (yahooName: 'Brent Crude Oil',           tvSymbol: 'TVC:UKOIL'),
    'NG=F':      (yahooName: 'Natural Gas',               tvSymbol: 'TVC:NATGAS'),
    // RB=F (Gasoline) and HO=F (Heating Oil) have no free TVC equivalent
    // → they fall back to Yahoo Finance LWC chart automatically
    // ── Industrial / Agricultural — TVC CFD where available ───────────────
    'HG=F':      (yahooName: 'Copper',                    tvSymbol: 'TVC:COPPER'),
    'ZC=F':      (yahooName: 'Corn',                      tvSymbol: 'TVC:CORN'),
    'ZW=F':      (yahooName: 'Wheat',                     tvSymbol: 'TVC:WHEAT'),
    'SB=F':      (yahooName: 'Sugar #11',                 tvSymbol: 'TVC:SUGAR'),
    'CC=F':      (yahooName: 'Cocoa',                     tvSymbol: 'TVC:COCOA'),
    'KC=F':      (yahooName: 'Coffee',                    tvSymbol: 'TVC:COFFEE'),
    // ZS=F (Soybeans), CT=F (Cotton), LBS=F (Lumber) have no free TVC equivalent
    // → they fall back to Yahoo Finance LWC chart automatically
    // ── Cryptocurrency ─────────────────────────────────────────────────────
    'BTC-USD':   (yahooName: 'Bitcoin USD',               tvSymbol: 'BITSTAMP:BTCUSD'),
    'ETH-USD':   (yahooName: 'Ethereum USD',              tvSymbol: 'BITSTAMP:ETHUSD'),
    'SOL-USD':   (yahooName: 'Solana USD',                tvSymbol: 'COINBASE:SOLUSD'),
    'XRP-USD':   (yahooName: 'XRP USD',                   tvSymbol: 'BITSTAMP:XRPUSD'),
    'ADA-USD':   (yahooName: 'Cardano USD',               tvSymbol: 'BINANCE:ADAUSDT'),
    'DOGE-USD':  (yahooName: 'Dogecoin USD',              tvSymbol: 'BINANCE:DOGEUSDT'),
    'DOT-USD':   (yahooName: 'Polkadot USD',              tvSymbol: 'BINANCE:DOTUSDT'),
    'AVAX-USD':  (yahooName: 'Avalanche USD',             tvSymbol: 'COINBASE:AVAXUSD'),
    'LINK-USD':  (yahooName: 'Chainlink USD',             tvSymbol: 'COINBASE:LINKUSD'),
    'MATIC-USD': (yahooName: 'Polygon USD',               tvSymbol: 'COINBASE:MATICUSD'),
    // ── Major Forex ────────────────────────────────────────────────────────
    'EURUSD=X':  (yahooName: 'EUR/USD',                   tvSymbol: 'FX:EURUSD'),
    'GBPUSD=X':  (yahooName: 'GBP/USD',                   tvSymbol: 'FX:GBPUSD'),
    'USDJPY=X':  (yahooName: 'USD/JPY',                   tvSymbol: 'FX:USDJPY'),
    'AUDUSD=X':  (yahooName: 'AUD/USD',                   tvSymbol: 'FX:AUDUSD'),
    'USDCAD=X':  (yahooName: 'USD/CAD',                   tvSymbol: 'FX:USDCAD'),
    'USDCHF=X':  (yahooName: 'USD/CHF',                   tvSymbol: 'FX:USDCHF'),
    'NZDUSD=X':  (yahooName: 'NZD/USD',                   tvSymbol: 'FX:NZDUSD'),
    'EURGBP=X':  (yahooName: 'EUR/GBP',                   tvSymbol: 'FX:EURGBP'),
    'EURJPY=X':  (yahooName: 'EUR/JPY',                   tvSymbol: 'FX:EURJPY'),
    'GBPJPY=X':  (yahooName: 'GBP/JPY',                   tvSymbol: 'FX:GBPJPY'),
    'AUDJPY=X':  (yahooName: 'AUD/JPY',                   tvSymbol: 'FX:AUDJPY'),
    'CADJPY=X':  (yahooName: 'CAD/JPY',                   tvSymbol: 'FX:CADJPY'),
    'CHFJPY=X':  (yahooName: 'CHF/JPY',                   tvSymbol: 'FX:CHFJPY'),
    // ── EM & Minor Forex ───────────────────────────────────────────────────
    'USDINR=X':  (yahooName: 'USD/INR',                   tvSymbol: 'FX_IDC:USDINR'),
    'USDCNY=X':  (yahooName: 'USD/CNY',                   tvSymbol: 'FX_IDC:USDCNY'),
    'USDBRL=X':  (yahooName: 'USD/BRL',                   tvSymbol: 'FX_IDC:USDBRL'),
    'USDMXN=X':  (yahooName: 'USD/MXN',                   tvSymbol: 'FX:USDMXN'),
    'USDSGD=X':  (yahooName: 'USD/SGD',                   tvSymbol: 'FX_IDC:USDSGD'),
    'USDKRW=X':  (yahooName: 'USD/KRW',                   tvSymbol: 'FX_IDC:USDKRW'),
    'USDSEK=X':  (yahooName: 'USD/SEK',                   tvSymbol: 'FX:USDSEK'),
    'USDNOK=X':  (yahooName: 'USD/NOK',                   tvSymbol: 'FX:USDNOK'),
    // ── US Dollar Index ────────────────────────────────────────────────────
    'DX-Y.NYB':  (yahooName: 'US Dollar Index',           tvSymbol: 'TVC:DXY'),
  };
  // └──────────────────┴─────────────────────────────────┴──────────────────────────┘

  /// TradingView symbol from catalog (e.g. 'COMEX:GC1!'), or null if not listed.
  static String? tvSymbol(String yahooSymbol) => _catalog[yahooSymbol]?.tvSymbol;

  /// Yahoo Finance display name from catalog, or null if not listed.
  static String? yahooName(String yahooSymbol) => _catalog[yahooSymbol]?.yahooName;

  /// Resolves a symbol for the *embedded* TradingView widget (in-app WebView).
  ///
  /// Catalog hits only — no suffix or bare-ticker guessing. The free embed
  /// widget shows an in-widget "chart available only on TradingView" paywall
  /// card for symbols outside its free data feeds, and that failure is
  /// undetectable from Flutter (it renders inside the loaded page). Guessed
  /// symbols are exactly the class that hits it, so they are never eligible
  /// here; callers fall back to the Yahoo/LWC chart on null.
  static String? resolveForEmbeddedWidget(String yahooSymbol) {
    if (yahooSymbol.startsWith('^')) return null; // all indices are paywalled
    final hit = tvSymbol(yahooSymbol);
    if (hit == null) return null;
    return hit.contains('!') ? null : hit; // continuous futures need TV Pro
  }

  /// Resolves a Yahoo Finance symbol to a TradingView-compatible identifier.
  ///
  /// Returns null when no reliable mapping exists (unmapped futures/forex/crypto
  /// with Yahoo-specific suffixes like =F, =X, -USD, ^). In that case, callers
  /// should fall back to the Yahoo Finance / LWC chart path.
  ///
  /// Guessed mappings (exchange-suffix and bare-ticker rules) are safe for
  /// external browser deep-links only — do NOT feed them to the embedded
  /// widget; use [resolveForEmbeddedWidget] for that.
  static String? resolveForTv(String yahooSymbol) {
    // Indices (^ prefix) are NEVER shown in TradingView embedded widget — all
    // require a paid subscription regardless of namespace. Always fall back to LWC.
    if (yahooSymbol.startsWith('^')) return null;

    // 1. Catalog — exact match wins.
    //    Guard: reject ! (continuous futures) — requires TV Pro subscription.
    final catalogHit = tvSymbol(yahooSymbol);
    if (catalogHit != null) {
      return catalogHit.contains('!') ? null : catalogHit;
    }

    // 2. International equity exchange suffixes → exchange:ticker format
    const suffixToExchange = <String, String>{
      '.NS': 'NSE',  '.BO': 'BSE',
      '.L':  'LSE',  '.TO': 'TSX',
      '.HK': 'HKEX', '.AX': 'ASX',
      '.PA': 'EURONEXT', '.DE': 'XETR',
      '.MI': 'MIL',  '.MC': 'BME',
      '.BR': 'EURONEXT', '.AS': 'EURONEXT',
    };
    for (final entry in suffixToExchange.entries) {
      if (yahooSymbol.endsWith(entry.key)) {
        final base = yahooSymbol.substring(0, yahooSymbol.length - entry.key.length);
        return '${entry.value}:$base';
      }
    }

    // 3. US bare equity tickers (no special chars) — TradingView resolves NASDAQ/NYSE
    if (!yahooSymbol.contains('=') && !yahooSymbol.contains('-')) {
      return yahooSymbol;
    }

    // 4. Unmapped =F futures, =X forex, -USD crypto — no reliable mapping
    return null;
  }

  /// Opens the asset in TradingView (mapped symbols) or Yahoo Finance (fallback).
  static Future<void> open(String yahooSymbol) async {
    final tv = tvSymbol(yahooSymbol);
    final uri = tv != null
        ? Uri.parse('https://www.tradingview.com/chart/?symbol=${Uri.encodeComponent(tv)}')
        : Uri.parse('https://finance.yahoo.com/quote/${Uri.encodeComponent(yahooSymbol)}');
    if (await canLaunchUrl(uri)) await launchUrl(uri, mode: LaunchMode.externalApplication);
  }
}
