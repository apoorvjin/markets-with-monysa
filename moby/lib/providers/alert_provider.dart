import 'dart:convert';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../data/models/price_alert.dart';

class AlertNotifier extends Notifier<List<PriceAlert>> {
  static const _key = 'priceAlerts';
  @override
  List<PriceAlert> build() {
    _load();
    return [];
  }

  Future<void> _load() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_key);
    if (raw != null) {
      final list = json.decode(raw) as List;
      state = list
          .map((e) => PriceAlert.fromJson(e as Map<String, dynamic>))
          .toList();
    }
  }

  Future<void> _save() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_key, json.encode(state.map((a) => a.toJson()).toList()));
  }

  Future<void> addAlert(PriceAlert alert) async {
    state = [...state, alert];
    await _save();
  }

  Future<void> removeAlert(String id) async {
    state = state.where((a) => a.id != id).toList();
    await _save();
  }

  Future<void> clearAll() async {
    state = [];
    await _save();
  }

  int get count => state.length;
}

final alertProvider =
    NotifierProvider<AlertNotifier, List<PriceAlert>>(AlertNotifier.new);
