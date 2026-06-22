import 'dart:convert';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../data/models/price_alert.dart';
import '../services/entitlement_service.dart';
import '../services/firestore_service.dart';
import '../services/remote_config_service.dart';

enum AddAlertResult { added, limitReached }

class AlertNotifier extends Notifier<List<PriceAlert>> {
  static const _key = 'priceAlerts';

  @override
  List<PriceAlert> build() {
    _load();
    return [];
  }

  Future<void> _load() async {
    final prefs = await SharedPreferences.getInstance();
    final uid = FirebaseAuth.instance.currentUser?.uid;

    if (uid != null) {
      // Signed-in: pull from Firestore (source of truth) and refresh local cache.
      final fsAlerts = await FirestoreService.getAlerts(uid);
      if (fsAlerts.isNotEmpty) {
        state = fsAlerts
            .map((e) => PriceAlert.fromJson(e))
            .toList();
        await prefs.setString(_key, json.encode(state.map((a) => a.toJson()).toList()));
        return;
      }
    }

    // Fallback: local SharedPreferences cache (anonymous or Firestore empty).
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

  int get _freeLimit => RemoteConfigService.alertLimitFree;

  Future<AddAlertResult> addAlert(PriceAlert alert) async {
    if (!EntitlementService.can('alerts_unlimited') &&
        state.length >= _freeLimit) {
      return AddAlertResult.limitReached;
    }
    state = [...state, alert];
    await _save();
    FirestoreService.saveAlert(alert.toJson()); // fire-and-forget
    return AddAlertResult.added;
  }

  Future<void> removeAlert(String id) async {
    state = state.where((a) => a.id != id).toList();
    await _save();
    FirestoreService.deleteAlert(id); // fire-and-forget
  }

  Future<void> clearAll() async {
    final ids = state.map((a) => a.id).toList();
    state = [];
    await _save();
    for (final id in ids) {
      FirestoreService.deleteAlert(id);
    }
  }

  int get count => state.length;
}

final alertProvider =
    NotifierProvider<AlertNotifier, List<PriceAlert>>(AlertNotifier.new);
