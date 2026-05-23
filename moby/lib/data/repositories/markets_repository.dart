import '../models/market_item.dart';
import '../../core/network/api_client.dart';
import '../../core/network/api_endpoints.dart';

class MarketsRepository {
  MarketsRepository._();
  static final MarketsRepository instance = MarketsRepository._();

  // ── Stale-cache state per data type ─────────────────────────────────────────

  List<MarketItem>? _indicesCache;
  String? _indicesLastUpdated;
  bool _indicesStale = false;

  List<MarketItem>? _commoditiesCache;
  String? _commoditiesLastUpdated;
  bool _commoditiesStale = false;

  List<MarketItem>? _forexCache;
  String? _forexLastUpdated;
  bool _forexStale = false;

  // Accessors read by the UI after a provider resolves.
  String? get indicesLastUpdated => _indicesLastUpdated;
  bool get isIndicesStale => _indicesStale;

  String? get commoditiesLastUpdated => _commoditiesLastUpdated;
  bool get isCommoditiesStale => _commoditiesStale;

  String? get forexLastUpdated => _forexLastUpdated;
  bool get isForexStale => _forexStale;

  // ── Central bank rates cache (6 h TTL) ──────────────────────────────────────

  Map<String, CbRateInfo>? _cbRatesCache;
  DateTime? _cbRatesFetchedAt;
  static const _cbRatesTtl = Duration(hours: 6);

  List<Map<String, dynamic>>? _sectorsCache;
  DateTime? _sectorsFetchedAt;
  static const _sectorsTtl = Duration(minutes: 15);

  // ── Fetch methods ────────────────────────────────────────────────────────────

  Future<List<MarketItem>> fetchIndices() async {
    try {
      final data = await ApiClient.instance.get(ApiEndpoints.indicesFutures);
      final items = (data['items'] as List)
          .map((e) => MarketItem.fromJson(e as Map<String, dynamic>))
          .toList();
      _indicesLastUpdated = data['lastUpdated'] as String?;
      _indicesCache = items;
      _indicesStale = false;
      return items;
    } catch (_) {
      if (_indicesCache != null) {
        _indicesStale = true;
        return _indicesCache!;
      }
      rethrow;
    }
  }

  Future<List<MarketItem>> fetchCommodities() async {
    try {
      final data = await ApiClient.instance.get(ApiEndpoints.commoditiesFutures);
      final items = (data['items'] as List)
          .map((e) => MarketItem.fromJson(e as Map<String, dynamic>))
          .toList();
      _commoditiesLastUpdated = data['lastUpdated'] as String?;
      _commoditiesCache = items;
      _commoditiesStale = false;
      return items;
    } catch (_) {
      if (_commoditiesCache != null) {
        _commoditiesStale = true;
        return _commoditiesCache!;
      }
      rethrow;
    }
  }

  Future<List<MarketItem>> fetchForex() async {
    try {
      final data = await ApiClient.instance.get(ApiEndpoints.forexFutures);
      final items = (data['items'] as List)
          .map((e) => MarketItem.fromJson(e as Map<String, dynamic>))
          .toList();
      _forexLastUpdated = data['lastUpdated'] as String?;
      _forexCache = items;
      _forexStale = false;
      return items;
    } catch (_) {
      if (_forexCache != null) {
        _forexStale = true;
        return _forexCache!;
      }
      rethrow;
    }
  }

  Future<Map<String, CbRateInfo>> fetchCentralBankRates() async {
    if (_cbRatesCache != null &&
        _cbRatesFetchedAt != null &&
        DateTime.now().difference(_cbRatesFetchedAt!) < _cbRatesTtl) {
      return _cbRatesCache!;
    }
    final data = await ApiClient.instance.get(ApiEndpoints.centralBankRates)
        as Map<String, dynamic>;
    final raw = data['rates'] as Map<String, dynamic>;
    _cbRatesCache = raw.map(
      (k, v) => MapEntry(k, CbRateInfo.fromJson(v as Map<String, dynamic>)),
    );
    _cbRatesFetchedAt = DateTime.now();
    return _cbRatesCache!;
  }

  Future<CotData> fetchCotData() async {
    final data = await ApiClient.instance.get(ApiEndpoints.cotMetals);
    return CotData.fromJson(data as Map<String, dynamic>);
  }

  Future<List<MarketItem>> fetchCountryStocks(String countryCode) async {
    final data = await ApiClient.instance.get(
      ApiEndpoints.stocksByCountry(countryCode),
    );
    final items = data['stocks'] as List? ?? data as List;
    return items.map((e) => MarketItem.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<Map<String, dynamic>> fetchBonds() async {
    return await ApiClient.instance.get(ApiEndpoints.bonds) as Map<String, dynamic>;
  }

  Future<List<Map<String, dynamic>>> fetchSectors() async {
    if (_sectorsCache != null &&
        _sectorsFetchedAt != null &&
        DateTime.now().difference(_sectorsFetchedAt!) < _sectorsTtl) {
      return _sectorsCache!;
    }
    final data = await ApiClient.instance.get(ApiEndpoints.sectors) as Map<String, dynamic>;
    _sectorsCache = List<Map<String, dynamic>>.from(data['sectors'] as List);
    _sectorsFetchedAt = DateTime.now();
    return _sectorsCache!;
  }

  void invalidateSectorsCache() {
    _sectorsFetchedAt = null;
  }
}
