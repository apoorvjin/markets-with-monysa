import '../models/market_item.dart';
import '../../core/network/api_client.dart';
import '../../core/network/api_endpoints.dart';

class MarketsRepository {
  const MarketsRepository();

  static const MarketsRepository instance = MarketsRepository();

  Future<List<MarketItem>> fetchIndices() async {
    final data = await ApiClient.instance.get(ApiEndpoints.indicesFutures);
    final items = (data['items'] as List);
    return items.map((e) => MarketItem.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<List<MarketItem>> fetchCommodities() async {
    final data = await ApiClient.instance.get(ApiEndpoints.commoditiesFutures);
    final items = (data['items'] as List);
    return items.map((e) => MarketItem.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<List<MarketItem>> fetchForex() async {
    final data = await ApiClient.instance.get(ApiEndpoints.forexFutures);
    final items = (data['items'] as List);
    return items.map((e) => MarketItem.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<List<CotMetal>> fetchCotMetals() async {
    final data = await ApiClient.instance.get(ApiEndpoints.cotMetals);
    final items = (data['metals'] as List);
    return items.map((e) => CotMetal.fromJson(e as Map<String, dynamic>)).toList();
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
    final data = await ApiClient.instance.get(ApiEndpoints.sectors) as Map<String, dynamic>;
    return List<Map<String, dynamic>>.from(data['sectors'] as List);
  }
}
