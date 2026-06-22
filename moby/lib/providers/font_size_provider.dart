import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../services/firestore_service.dart';

enum FontSizeScale {
  regular(0.9, 'Regular', 'R'),
  enlarged(1.0, 'Enlarged', 'E');

  const FontSizeScale(this.scaleFactor, this.label, this.chip);
  final double scaleFactor;
  final String label;
  final String chip;
}

class FontSizeScaleNotifier extends Notifier<FontSizeScale> {
  static const _key = 'font_size_scale';

  @override
  FontSizeScale build() {
    _load();
    return FontSizeScale.regular;
  }

  Future<void> _load() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_key);
    if (raw == null) return;
    final match = FontSizeScale.values.where((e) => e.name == raw).firstOrNull;
    if (match != null) state = match;
  }

  Future<void> setScale(FontSizeScale scale) async {
    state = scale;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_key, scale.name);
    FirestoreService.updatePrefs({'fontSize': scale.name});
  }
}

final fontSizeScaleProvider =
    NotifierProvider<FontSizeScaleNotifier, FontSizeScale>(
        FontSizeScaleNotifier.new);
