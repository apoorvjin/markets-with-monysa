import '../models/wire.dart';
import '../../core/network/api_client.dart';
import '../../core/network/api_endpoints.dart';

/// Fetches Wire desk items + the cross-desk breaking feed. Mirrors the server
/// cache windows (8 min items / 60 s breaking) so the client and the CDN edge
/// stay coherent, and falls back to the last good payload on a network error
/// (same hydrate-stale pattern as [MarketsRepository]).
class WireRepository {
  WireRepository._();
  static final WireRepository instance = WireRepository._();

  static const _itemsTtl = Duration(minutes: 8);
  static const _breakingTtl = Duration(seconds: 60);

  final Map<WireDesk, WireDeskItems> _itemsCache = {};
  final Map<WireDesk, DateTime> _itemsFetchedAt = {};

  WireDeskItems? _breakingCache;
  DateTime? _breakingFetchedAt;

  /// Aggregated, deduped, newest-first items for one desk.
  Future<WireDeskItems> fetchItems(WireDesk desk, {bool force = false}) async {
    final fetchedAt = _itemsFetchedAt[desk];
    if (!force &&
        _itemsCache[desk] != null &&
        fetchedAt != null &&
        DateTime.now().difference(fetchedAt) < _itemsTtl) {
      return _itemsCache[desk]!;
    }
    try {
      final data = await ApiClient.instance.get(ApiEndpoints.wireItems(desk.id))
          as Map<String, dynamic>;
      final items = (data['items'] as List? ?? const [])
          .map((e) => WireItem.fromJson(e as Map<String, dynamic>))
          .toList();
      final result =
          WireDeskItems(items: items, lastUpdated: data['lastUpdated'] as String?);
      _itemsCache[desk] = result;
      _itemsFetchedAt[desk] = DateTime.now();
      return result;
    } catch (_) {
      final stale = _itemsCache[desk];
      if (stale != null) return stale;
      rethrow;
    }
  }

  /// Recent breaking/alert items across every desk (feeds the alert banner).
  Future<WireDeskItems> fetchBreaking({bool force = false}) async {
    if (!force &&
        _breakingCache != null &&
        _breakingFetchedAt != null &&
        DateTime.now().difference(_breakingFetchedAt!) < _breakingTtl) {
      return _breakingCache!;
    }
    try {
      final data = await ApiClient.instance.get(ApiEndpoints.wireBreaking)
          as Map<String, dynamic>;
      final items = (data['items'] as List? ?? const [])
          .map((e) => WireItem.fromJson(e as Map<String, dynamic>))
          .toList();
      final result =
          WireDeskItems(items: items, lastUpdated: data['lastUpdated'] as String?);
      _breakingCache = result;
      _breakingFetchedAt = DateTime.now();
      return result;
    } catch (_) {
      if (_breakingCache != null) return _breakingCache!;
      rethrow;
    }
  }
}
