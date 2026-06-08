abstract final class ApiEndpoints {
  static const String baseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'https://monysa-api.fly.dev',
  );

  static String get indicesFutures => '$baseUrl/api/futures/indices';
  static String get commoditiesFutures => '$baseUrl/api/futures/commodities';
  static String get forexFutures => '$baseUrl/api/futures/forex';
  static String get cotMetals => '$baseUrl/api/futures/cot-metals';
  static String get centralBankRates => '$baseUrl/api/central-bank-rates';

  static String stocksByCountry(String code) => '$baseUrl/api/stocks/$code';
  static String chart(String symbol) => '$baseUrl/api/chart/$symbol';

  static String get tradingStrategies => '$baseUrl/api/trading/strategies';
  static String get tradingQuotes => '$baseUrl/api/trading/quotes';
  static String tradingSignal(String symbol) =>
      '$baseUrl/api/trading/signals/$symbol';
  static String tradingHistory(String symbol) =>
      '$baseUrl/api/trading/history/$symbol';
  static String tradingBacktest(String symbol) =>
      '$baseUrl/api/trading/backtest/$symbol';
  static String tradingNews(String symbol) =>
      '$baseUrl/api/trading/news/$symbol';
  static String tradingAnalystNote(String symbol) =>
      '$baseUrl/api/trading/analyst-note/$symbol';
  static String tradingFundamentals(String symbol) =>
      '$baseUrl/api/trading/fundamentals/$symbol';
  static String get tenXAssets => '$baseUrl/api/trading/scanner/10x/assets';
  static String get tenXStocks => '$baseUrl/api/trading/scanner/10x/stocks';
  static String get tenXIndiaStocks => '$baseUrl/api/trading/scanner/10x/india';
  static String get tenXV2IndiaStocks => '$baseUrl/api/trading/scanner/10x-v2/india';
  static String get tenXUKStocks         => '$baseUrl/api/trading/scanner/10x/uk';
  static String get tenXV2UKStocks       => '$baseUrl/api/trading/scanner/10x-v2/uk';
  static String get tenXJapanStocks      => '$baseUrl/api/trading/scanner/10x/japan';
  static String get tenXV2JapanStocks    => '$baseUrl/api/trading/scanner/10x-v2/japan';
  static String get tenXHKStocks         => '$baseUrl/api/trading/scanner/10x/hongkong';
  static String get tenXV2HKStocks       => '$baseUrl/api/trading/scanner/10x-v2/hongkong';
  static String get tenXChinaStocks      => '$baseUrl/api/trading/scanner/10x/china';
  static String get tenXV2ChinaStocks    => '$baseUrl/api/trading/scanner/10x-v2/china';
  static String get tenXEuronextStocks   => '$baseUrl/api/trading/scanner/10x/euronext';
  static String get tenXV2EuronextStocks => '$baseUrl/api/trading/scanner/10x-v2/euronext';
  static String get tenXV2Assets => '$baseUrl/api/trading/scanner/10x-v2/assets';
  static String get tenXV3Assets => '$baseUrl/api/trading/scanner/10x-v3/assets';
  static String get tenXV3CommoditiesAssets => '$baseUrl/api/trading/scanner/10x-v3/commodities';
  static String get tenXV3ForexAssets => '$baseUrl/api/trading/scanner/10x-v3/forex';
  static String get tenXV3CryptoAssets => '$baseUrl/api/trading/scanner/10x-v3/crypto';
  static String get tenXV2Stocks => '$baseUrl/api/trading/scanner/10x-v2/stocks';
  static String tenXSingleScan({required String symbol, String? name}) =>
      '$baseUrl/api/trading/scanner/10x/single?symbol=${Uri.encodeComponent(symbol)}'
      '${(name != null && name.isNotEmpty) ? "&name=${Uri.encodeComponent(name)}" : ""}';
  static String tenXBacktest({required String type, required String version}) =>
      '$baseUrl/api/trading/scanner/backtest/$type?version=$version';
  static String bestSetups({required String version, required String type}) =>
      '$baseUrl/api/trading/scanner/best-setups?version=$version&type=$type';

  static String bestSetupsSector({required String version}) =>
      '$baseUrl/api/trading/best-setups-sector?version=$version';

  static String get volatilityAssets => '$baseUrl/api/volatility/assets';
  static String get volatilityBriefing => '$baseUrl/api/volatility/briefing';

  static String get usaDebt => '$baseUrl/api/usa-debt';

  static String get stockSearch => '$baseUrl/api/search';

  static String get bonds => '$baseUrl/api/bonds';
  static String get sectors => '$baseUrl/api/sectors';
  static String get crises => '$baseUrl/api/crises';
  static String get heatmap => '$baseUrl/api/heatmap';
  static String get heatmapAssets => '$baseUrl/api/heatmap/assets';
  static String heatmapTreemap({
    String index = 'sp500',
    int limit = 100,
    String timeframe = '1d',
  }) =>
      '$baseUrl/api/heatmap/treemap?index=$index&limit=$limit&timeframe=$timeframe';

  static String get quiverCongress         => '$baseUrl/api/quiver/congress';
  static String get quiverLobbying         => '$baseUrl/api/quiver/lobbying';
  static String get quiverInsider          => '$baseUrl/api/quiver/insider';
  static String get quiverCongressTrades   => '$baseUrl/api/quiver/congress-trades';
  static String congressTradesByMember(String name) =>
      '$baseUrl/api/quiver/congress-trades?memberName=${Uri.encodeComponent(name)}';
  static String get ogeTrumpTransactions   => '$baseUrl/api/oge/trump-transactions';
  static String get houseTrades            => '$baseUrl/api/house-trades';

  static String get regimeSummary    => '$baseUrl/api/trading/regime-summary';
  static String get earningsCalendar => '$baseUrl/api/trading/earnings-calendar?days=15';
  static String get correlation      => '$baseUrl/api/trading/correlation';
  static String copyTrades(String memberName) =>
      '$baseUrl/api/trading/copy-trades?memberName=${Uri.encodeComponent(memberName)}';
  static String get yieldCurveHistory => '$baseUrl/api/economy/yield-curve-history';
  static String get economyEvents     => '$baseUrl/api/economy/events';
  static String get tariffs           => '$baseUrl/api/tariffs';
  static String get fearGreed         => '$baseUrl/api/volatility/fear-greed';

  static String exposureAnalysis({
    required String country,
    required String sector,
    required double tariffRate,
  }) =>
      '$baseUrl/api/exposure/analysis'
      '?country=${Uri.encodeComponent(country)}'
      '&sector=${Uri.encodeComponent(sector)}'
      '&tariffRate=$tariffRate';
}
