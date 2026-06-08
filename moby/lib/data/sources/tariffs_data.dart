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

  List<CountryTariff>? _countries;
  String lastUpdated = '';
  String dataAsOf = '';

  Future<List<CountryTariff>> load() async {
    if (_countries != null) return _countries!;
    final data =
        await ApiClient.instance.get(ApiEndpoints.tariffs) as Map<String, dynamic>;
    lastUpdated = data['lastUpdated'] as String? ?? '';
    dataAsOf = data['dataAsOf'] as String? ?? '';
    final list = data['countries'] as List;
    _countries = list
        .map((e) => CountryTariff.fromJson(e as Map<String, dynamic>))
        .toList();
    return _countries!;
  }
}
