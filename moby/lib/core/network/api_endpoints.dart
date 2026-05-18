abstract final class ApiEndpoints {
  static const String baseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'https://monysa-api.fly.dev',
  );

  static String get indicesFutures => '$baseUrl/api/futures/indices';
  static String get commoditiesFutures => '$baseUrl/api/futures/commodities';
  static String get forexFutures => '$baseUrl/api/futures/forex';
  static String get cotMetals => '$baseUrl/api/futures/cot-metals';

  static String stocksByCountry(String code) => '$baseUrl/api/stocks/$code';
  static String chart(String symbol) => '$baseUrl/api/chart/$symbol';

  static String get tradingQuotes => '$baseUrl/api/trading/quotes';
  static String tradingSignal(String symbol) =>
      '$baseUrl/api/trading/signals/$symbol';
  static String tradingHistory(String symbol) =>
      '$baseUrl/api/trading/history/$symbol';
  static String tradingBacktest(String symbol) =>
      '$baseUrl/api/trading/backtest/$symbol';
  static String tradingNews(String symbol) =>
      '$baseUrl/api/trading/news/$symbol';

  static String get volatilityAssets => '$baseUrl/api/volatility/assets';
  static String get volatilityBriefing => '$baseUrl/api/volatility/briefing';

  static String get usaDebt => '$baseUrl/api/usa-debt';

  static String get stockSearch => '$baseUrl/api/search';

  static String get bonds => '$baseUrl/api/bonds';
  static String get sectors => '$baseUrl/api/sectors';
}
