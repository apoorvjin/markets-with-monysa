import '../../core/cache/disk_cache.dart';
import '../../core/network/api_client.dart';
import '../../core/network/api_endpoints.dart';

class SectorTariff {
  const SectorTariff({
    required this.sectorName,
    required this.tariffRate,
    required this.sourceURL,
  });

  final String sectorName;
  final double tariffRate;
  final String sourceURL;

  factory SectorTariff.fromJson(Map<String, dynamic> j) => SectorTariff(
        sectorName: j['sectorName'] as String,
        tariffRate: (j['tariffRate'] as num).toDouble(),
        sourceURL: j['sourceURL'] as String? ?? '',
      );
}

class DebtDetail {
  const DebtDetail({
    required this.category,
    required this.amountBillions,
    required this.notes,
  });

  final String category;
  final double amountBillions;
  final String notes;

  factory DebtDetail.fromJson(Map<String, dynamic> j) => DebtDetail(
        category: j['category'] as String,
        amountBillions: (j['amountBillions'] as num).toDouble(),
        notes: j['notes'] as String? ?? '',
      );
}

class CountryTariff {
  const CountryTariff({
    required this.countryName,
    required this.countryCode,
    required this.tariffRate,
    required this.sectors,
    required this.debtToUSA,
    required this.laymanExplanation,
    this.lastUpdated = '',
  });

  final String countryName;
  final String countryCode;
  final double tariffRate;
  final List<SectorTariff> sectors;
  final List<DebtDetail> debtToUSA;
  final String laymanExplanation;
  final String lastUpdated;

  factory CountryTariff.fromJson(Map<String, dynamic> j) => CountryTariff(
        countryName: j['countryName'] as String,
        countryCode: j['countryCode'] as String,
        tariffRate: (j['tariffRate'] as num).toDouble(),
        sectors: (j['sectors'] as List)
            .map((s) => SectorTariff.fromJson(s as Map<String, dynamic>))
            .toList(),
        debtToUSA: (j['debtToUSA'] as List? ?? [])
            .map((d) => DebtDetail.fromJson(d as Map<String, dynamic>))
            .toList(),
        laymanExplanation: j['laymanExplanation'] as String? ?? '',
        lastUpdated: j['lastUpdated'] as String? ?? '',
      );

  String get flag {
    if (countryCode.length != 2) return '';
    const base = 0x1F1E6 - 0x41;
    return String.fromCharCode(base + countryCode.codeUnitAt(0)) +
        String.fromCharCode(base + countryCode.codeUnitAt(1));
  }
}

class TariffsData {
  TariffsData._();
  static final TariffsData _instance = TariffsData._();
  static TariffsData get instance => _instance;

  // Refresh tariff data every 24h within a long-running session. Server cache
  // is 24h server-side, so this aligns with upstream cadence without forcing
  // an extra fetch on every tab open.
  static const _ttl = Duration(hours: 24);
  static const _diskKey = 'tariffs';

  List<CountryTariff>? _countries;
  DateTime? _fetchedAt;
  String lastUpdated = '';
  String dataAsOf = '';

  Future<List<CountryTariff>> load() async {
    final cached = _countries;
    final fetchedAt = _fetchedAt;
    if (cached != null && fetchedAt != null &&
        DateTime.now().difference(fetchedAt) < _ttl) {
      return cached;
    }

    // Try disk cache before hitting the network — first launch after install
    // still needs the network, but subsequent launches paint instantly.
    if (cached == null) {
      final disk = await DiskCache.instance.read<Map<String, dynamic>>(
        _diskKey,
        ttl: _ttl,
        decode: (j) => j as Map<String, dynamic>,
      );
      if (disk != null) {
        _hydrateFrom(disk);
      }
    }

    try {
      final data = await ApiClient.instance.get(ApiEndpoints.tariffs)
          as Map<String, dynamic>;
      _hydrateFrom(data);
      // Persist for next cold start + offline fallback.
      await DiskCache.instance.write(_diskKey, data);
      return _countries!;
    } catch (e) {
      // Network failed — return whatever we have (disk or memory) so the UI
      // can still render with a staleness indicator instead of an error.
      if (_countries != null) return _countries!;
      final stale = await DiskCache.instance.readStale<Map<String, dynamic>>(
        _diskKey,
        decode: (j) => j as Map<String, dynamic>,
      );
      if (stale != null) {
        _hydrateFrom(stale);
        return _countries!;
      }
      rethrow;
    }
  }

  void _hydrateFrom(Map<String, dynamic> data) {
    lastUpdated = data['lastUpdated'] as String? ?? '';
    dataAsOf = data['dataAsOf'] as String? ?? '';
    final list = data['countries'] as List;
    _countries = list
        .map((e) => CountryTariff.fromJson(e as Map<String, dynamic>))
        .toList();
    _fetchedAt = DateTime.now();
  }

  void invalidate() {
    _countries = null;
    _fetchedAt = null;
  }
}
