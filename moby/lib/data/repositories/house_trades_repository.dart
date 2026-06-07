import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/network/api_client.dart';
import '../../core/network/api_endpoints.dart';
import '../models/house_trade.dart';

// ── Notifier ──────────────────────────────────────────────────────────────────

class HouseTradesNotifier extends AsyncNotifier<HouseTradesResult> {
  @override
  Future<HouseTradesResult> build() => _fetch();

  Future<void> refresh() async {
    state = const AsyncLoading();
    state = await AsyncValue.guard(_fetch);
  }

  Future<HouseTradesResult> _fetch() async {
    final data = await ApiClient.instance.get(ApiEndpoints.houseTrades)
        as Map<String, dynamic>;
    final list = data['trades'] as List<dynamic>;
    final trades = list
        .map((e) => EnrichedHouseTrade.enrich(
            HouseTradeRecord.fromJson(e as Map<String, dynamic>)))
        .toList();
    return HouseTradesResult(
      trades:    trades,
      lastFetch: DateTime.now(),
    );
  }
}

final houseTradesProvider =
    AsyncNotifierProvider<HouseTradesNotifier, HouseTradesResult>(
  HouseTradesNotifier.new,
);
