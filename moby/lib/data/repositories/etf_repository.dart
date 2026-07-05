import '../models/etf.dart';
import '../../core/cache/disk_cache.dart';
import '../../core/network/api_client.dart';
import '../../core/network/api_endpoints.dart';

class EtfRepository {
  EtfRepository._();
  static final EtfRepository instance = EtfRepository._();

  final Map<String, EtfListData> _listCache = {};
  final Map<String, DateTime> _listFetchedAt = {};
  static const _listTtl = Duration(minutes: 10);

  Future<EtfListData> fetchList({String? category}) async {
    final cacheKey = category ?? 'all';
    final cached = _listCache[cacheKey];
    final fetchedAt = _listFetchedAt[cacheKey];
    if (cached != null &&
        fetchedAt != null &&
        DateTime.now().difference(fetchedAt) < _listTtl) {
      return cached;
    }

    final diskKey = 'etf.list.$cacheKey';
    if (cached == null) {
      final disk = await DiskCache.instance.read<Map<String, dynamic>>(
        diskKey,
        ttl: const Duration(minutes: 30),
        decode: (j) => Map<String, dynamic>.from(j as Map),
      );
      if (disk != null) {
        _listCache[cacheKey] = EtfListData.fromJson(disk);
        _listFetchedAt[cacheKey] = DateTime.now().subtract(_listTtl);
      }
    }

    try {
      final data = await ApiClient.instance.get(
        ApiEndpoints.etfList(category: category),
      ) as Map<String, dynamic>;
      final parsed = EtfListData.fromJson(data);
      _listCache[cacheKey] = parsed;
      _listFetchedAt[cacheKey] = DateTime.now();
      await DiskCache.instance.write(diskKey, data);
      return parsed;
    } catch (e) {
      final fallback = _listCache[cacheKey];
      if (fallback != null) return fallback;
      final stale = await DiskCache.instance.readStale<Map<String, dynamic>>(
        diskKey,
        decode: (j) => Map<String, dynamic>.from(j as Map),
      );
      if (stale != null) {
        final parsed = EtfListData.fromJson(stale);
        _listCache[cacheKey] = parsed;
        _listFetchedAt[cacheKey] = DateTime.now().subtract(_listTtl);
        return parsed;
      }
      rethrow;
    }
  }

  final Map<String, EtfProfile> _profileCache = {};
  final Map<String, DateTime> _profileFetchedAt = {};
  static const _profileTtl = Duration(hours: 24);

  Future<EtfProfile> fetchProfile(String symbol) async {
    final cached = _profileCache[symbol];
    final fetchedAt = _profileFetchedAt[symbol];
    if (cached != null &&
        fetchedAt != null &&
        DateTime.now().difference(fetchedAt) < _profileTtl) {
      return cached;
    }

    final diskKey = 'etf.profile.$symbol';
    if (cached == null) {
      final disk = await DiskCache.instance.read<Map<String, dynamic>>(
        diskKey,
        ttl: const Duration(days: 2),
        decode: (j) => Map<String, dynamic>.from(j as Map),
      );
      if (disk != null) {
        _profileCache[symbol] = EtfProfile.fromJson(disk);
        _profileFetchedAt[symbol] = DateTime.now().subtract(_profileTtl);
      }
    }

    try {
      final data = await ApiClient.instance.get(
        ApiEndpoints.etfProfile(symbol),
      ) as Map<String, dynamic>;
      final parsed = EtfProfile.fromJson(data);
      _profileCache[symbol] = parsed;
      _profileFetchedAt[symbol] = DateTime.now();
      await DiskCache.instance.write(diskKey, data);
      return parsed;
    } catch (e) {
      final fallback = _profileCache[symbol];
      if (fallback != null) return fallback;
      final stale = await DiskCache.instance.readStale<Map<String, dynamic>>(
        diskKey,
        decode: (j) => Map<String, dynamic>.from(j as Map),
      );
      if (stale != null) {
        final parsed = EtfProfile.fromJson(stale);
        _profileCache[symbol] = parsed;
        _profileFetchedAt[symbol] = DateTime.now().subtract(_profileTtl);
        return parsed;
      }
      rethrow;
    }
  }

  EtfRotationData? _rotationCache;
  DateTime? _rotationFetchedAt;
  static const _rotationTtl = Duration(minutes: 15);
  static const _rotationDiskKey = 'etf.rotation';

  Future<EtfRotationData> fetchRotation() async {
    if (_rotationCache != null &&
        _rotationFetchedAt != null &&
        DateTime.now().difference(_rotationFetchedAt!) < _rotationTtl) {
      return _rotationCache!;
    }

    if (_rotationCache == null) {
      final disk = await DiskCache.instance.read<Map<String, dynamic>>(
        _rotationDiskKey,
        ttl: const Duration(minutes: 30),
        decode: (j) => Map<String, dynamic>.from(j as Map),
      );
      if (disk != null) {
        _rotationCache = EtfRotationData.fromJson(disk);
        _rotationFetchedAt = DateTime.now().subtract(_rotationTtl);
      }
    }

    try {
      final data = await ApiClient.instance.get(ApiEndpoints.etfRotation)
          as Map<String, dynamic>;
      final parsed = EtfRotationData.fromJson(data);
      _rotationCache = parsed;
      _rotationFetchedAt = DateTime.now();
      await DiskCache.instance.write(_rotationDiskKey, data);
      return parsed;
    } catch (e) {
      if (_rotationCache != null) return _rotationCache!;
      final stale = await DiskCache.instance.readStale<Map<String, dynamic>>(
        _rotationDiskKey,
        decode: (j) => Map<String, dynamic>.from(j as Map),
      );
      if (stale != null) {
        final parsed = EtfRotationData.fromJson(stale);
        _rotationCache = parsed;
        _rotationFetchedAt = DateTime.now().subtract(_rotationTtl);
        return parsed;
      }
      rethrow;
    }
  }
}
