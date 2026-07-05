import 'dart:convert';
import 'package:flutter/material.dart' show Color;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'strategy_provider.dart';

// ─── Per-indicator config classes ────────────────────────────────────────────

class SmaConfig {
  const SmaConfig({
    required this.period,
    required this.colorValue,
    required this.visible,
  });
  final int period;
  final int colorValue;
  final bool visible;
  Color get color => Color(colorValue);
  SmaConfig copyWith({int? period, int? colorValue, bool? visible}) =>
      SmaConfig(
        period: period ?? this.period,
        colorValue: colorValue ?? this.colorValue,
        visible: visible ?? this.visible,
      );
  Map<String, dynamic> toJson() =>
      {'period': period, 'color': colorValue, 'visible': visible};
  factory SmaConfig.fromJson(Map<String, dynamic> j) => SmaConfig(
        period: (j['period'] as num).toInt(),
        colorValue: (j['color'] as num).toInt(),
        visible: j['visible'] as bool? ?? true,
      );
}

class EmaConfig {
  const EmaConfig({
    required this.period,
    required this.colorValue,
    required this.visible,
  });
  final int period;
  final int colorValue;
  final bool visible;
  Color get color => Color(colorValue);
  EmaConfig copyWith({int? period, int? colorValue, bool? visible}) =>
      EmaConfig(
        period: period ?? this.period,
        colorValue: colorValue ?? this.colorValue,
        visible: visible ?? this.visible,
      );
  Map<String, dynamic> toJson() =>
      {'period': period, 'color': colorValue, 'visible': visible};
  factory EmaConfig.fromJson(Map<String, dynamic> j) => EmaConfig(
        period: (j['period'] as num).toInt(),
        colorValue: (j['color'] as num).toInt(),
        visible: j['visible'] as bool? ?? true,
      );
}

class BollingerConfig {
  const BollingerConfig({
    required this.period,
    required this.stddev,
    required this.colorValue,
    required this.visible,
  });
  final int period;
  final double stddev;
  final int colorValue;
  final bool visible;
  Color get color => Color(colorValue);
  BollingerConfig copyWith(
          {int? period, double? stddev, int? colorValue, bool? visible}) =>
      BollingerConfig(
        period: period ?? this.period,
        stddev: stddev ?? this.stddev,
        colorValue: colorValue ?? this.colorValue,
        visible: visible ?? this.visible,
      );
  Map<String, dynamic> toJson() => {
        'period': period,
        'stddev': stddev,
        'color': colorValue,
        'visible': visible,
      };
  factory BollingerConfig.fromJson(Map<String, dynamic> j) => BollingerConfig(
        period: (j['period'] as num?)?.toInt() ?? 20,
        stddev: (j['stddev'] as num?)?.toDouble() ?? 2.0,
        colorValue: (j['color'] as num?)?.toInt() ?? 0xFF9C88FF,
        visible: j['visible'] as bool? ?? false,
      );
}

class RsiConfig {
  const RsiConfig({
    required this.period,
    required this.overbought,
    required this.oversold,
    required this.colorValue,
    required this.visible,
  });
  final int period;
  final double overbought;
  final double oversold;
  final int colorValue;
  final bool visible;
  Color get color => Color(colorValue);
  RsiConfig copyWith(
          {int? period,
          double? overbought,
          double? oversold,
          int? colorValue,
          bool? visible}) =>
      RsiConfig(
        period: period ?? this.period,
        overbought: overbought ?? this.overbought,
        oversold: oversold ?? this.oversold,
        colorValue: colorValue ?? this.colorValue,
        visible: visible ?? this.visible,
      );
  Map<String, dynamic> toJson() => {
        'period': period,
        'overbought': overbought,
        'oversold': oversold,
        'color': colorValue,
        'visible': visible,
      };
  factory RsiConfig.fromJson(Map<String, dynamic> j) => RsiConfig(
        period: (j['period'] as num?)?.toInt() ?? 14,
        overbought: (j['overbought'] as num?)?.toDouble() ?? 70,
        oversold: (j['oversold'] as num?)?.toDouble() ?? 30,
        colorValue: (j['color'] as num?)?.toInt() ?? 0xFFFFA56B,
        visible: j['visible'] as bool? ?? false,
      );
}

class MacdConfig {
  const MacdConfig({
    required this.fast,
    required this.slow,
    required this.signal,
    required this.macdColorValue,
    required this.signalColorValue,
    required this.visible,
  });
  final int fast;
  final int slow;
  final int signal;
  final int macdColorValue;
  final int signalColorValue;
  final bool visible;
  Color get macdColor => Color(macdColorValue);
  Color get signalColor => Color(signalColorValue);
  MacdConfig copyWith(
          {int? fast,
          int? slow,
          int? signal,
          int? macdColorValue,
          int? signalColorValue,
          bool? visible}) =>
      MacdConfig(
        fast: fast ?? this.fast,
        slow: slow ?? this.slow,
        signal: signal ?? this.signal,
        macdColorValue: macdColorValue ?? this.macdColorValue,
        signalColorValue: signalColorValue ?? this.signalColorValue,
        visible: visible ?? this.visible,
      );
  Map<String, dynamic> toJson() => {
        'fast': fast,
        'slow': slow,
        'signal': signal,
        'macdColor': macdColorValue,
        'signalColor': signalColorValue,
        'visible': visible,
      };
  factory MacdConfig.fromJson(Map<String, dynamic> j) => MacdConfig(
        fast: (j['fast'] as num?)?.toInt() ?? 12,
        slow: (j['slow'] as num?)?.toInt() ?? 26,
        signal: (j['signal'] as num?)?.toInt() ?? 9,
        macdColorValue: (j['macdColor'] as num?)?.toInt() ?? 0xFF5B9CFF,
        signalColorValue: (j['signalColor'] as num?)?.toInt() ?? 0xFFFFA56B,
        visible: j['visible'] as bool? ?? false,
      );
}

class AnchoredVwapConfig {
  const AnchoredVwapConfig({
    required this.anchorMs,
    required this.colorValue,
    required this.visible,
  });

  /// Anchor time as Unix ms. null when no anchor has been set yet
  /// (the user must long-press a candle to anchor).
  final int? anchorMs;
  final int colorValue;
  final bool visible;
  Color get color => Color(colorValue);
  DateTime? get anchor =>
      anchorMs == null ? null : DateTime.fromMillisecondsSinceEpoch(anchorMs!, isUtc: true);

  AnchoredVwapConfig copyWith(
          {int? anchorMs,
          bool clearAnchor = false,
          int? colorValue,
          bool? visible}) =>
      AnchoredVwapConfig(
        anchorMs: clearAnchor ? null : (anchorMs ?? this.anchorMs),
        colorValue: colorValue ?? this.colorValue,
        visible: visible ?? this.visible,
      );
  Map<String, dynamic> toJson() => {
        'anchorMs': anchorMs,
        'color': colorValue,
        'visible': visible,
      };
  factory AnchoredVwapConfig.fromJson(Map<String, dynamic> j) =>
      AnchoredVwapConfig(
        anchorMs: (j['anchorMs'] as num?)?.toInt(),
        colorValue: (j['color'] as num?)?.toInt() ?? 0xFF00D4AA,
        visible: j['visible'] as bool? ?? false,
      );
}

class IchimokuConfig {
  const IchimokuConfig({
    required this.tenkanPeriod,
    required this.kijunPeriod,
    required this.senkouBPeriod,
    required this.displacement,
    required this.tenkanColorValue,
    required this.kijunColorValue,
    required this.cloudUpColorValue,
    required this.cloudDownColorValue,
    required this.visible,
  });
  final int tenkanPeriod;
  final int kijunPeriod;
  final int senkouBPeriod;
  final int displacement;
  final int tenkanColorValue;
  final int kijunColorValue;
  final int cloudUpColorValue;
  final int cloudDownColorValue;
  final bool visible;
  Color get tenkanColor => Color(tenkanColorValue);
  Color get kijunColor => Color(kijunColorValue);
  Color get cloudUpColor => Color(cloudUpColorValue);
  Color get cloudDownColor => Color(cloudDownColorValue);

  IchimokuConfig copyWith({
    int? tenkanPeriod,
    int? kijunPeriod,
    int? senkouBPeriod,
    int? displacement,
    int? tenkanColorValue,
    int? kijunColorValue,
    int? cloudUpColorValue,
    int? cloudDownColorValue,
    bool? visible,
  }) =>
      IchimokuConfig(
        tenkanPeriod: tenkanPeriod ?? this.tenkanPeriod,
        kijunPeriod: kijunPeriod ?? this.kijunPeriod,
        senkouBPeriod: senkouBPeriod ?? this.senkouBPeriod,
        displacement: displacement ?? this.displacement,
        tenkanColorValue: tenkanColorValue ?? this.tenkanColorValue,
        kijunColorValue: kijunColorValue ?? this.kijunColorValue,
        cloudUpColorValue: cloudUpColorValue ?? this.cloudUpColorValue,
        cloudDownColorValue: cloudDownColorValue ?? this.cloudDownColorValue,
        visible: visible ?? this.visible,
      );

  Map<String, dynamic> toJson() => {
        'tenkan': tenkanPeriod,
        'kijun': kijunPeriod,
        'senkouB': senkouBPeriod,
        'displacement': displacement,
        'tenkanColor': tenkanColorValue,
        'kijunColor': kijunColorValue,
        'cloudUpColor': cloudUpColorValue,
        'cloudDownColor': cloudDownColorValue,
        'visible': visible,
      };

  factory IchimokuConfig.fromJson(Map<String, dynamic> j) => IchimokuConfig(
        tenkanPeriod: (j['tenkan'] as num?)?.toInt() ?? 9,
        kijunPeriod: (j['kijun'] as num?)?.toInt() ?? 26,
        senkouBPeriod: (j['senkouB'] as num?)?.toInt() ?? 52,
        displacement: (j['displacement'] as num?)?.toInt() ?? 26,
        tenkanColorValue: (j['tenkanColor'] as num?)?.toInt() ?? 0xFF5B9CFF,
        kijunColorValue: (j['kijunColor'] as num?)?.toInt() ?? 0xFFD22B2B,
        cloudUpColorValue: (j['cloudUpColor'] as num?)?.toInt() ?? 0x4000D4AA,
        cloudDownColorValue:
            (j['cloudDownColor'] as num?)?.toInt() ?? 0x40FF4D6A,
        visible: j['visible'] as bool? ?? false,
      );
}

class StochasticConfig {
  const StochasticConfig({
    required this.kPeriod,
    required this.smooth,
    required this.dPeriod,
    required this.overbought,
    required this.oversold,
    required this.kColorValue,
    required this.dColorValue,
    required this.visible,
  });
  final int kPeriod;
  final int smooth;
  final int dPeriod;
  final double overbought;
  final double oversold;
  final int kColorValue;
  final int dColorValue;
  final bool visible;
  Color get kColor => Color(kColorValue);
  Color get dColor => Color(dColorValue);
  StochasticConfig copyWith(
          {int? kPeriod,
          int? smooth,
          int? dPeriod,
          double? overbought,
          double? oversold,
          int? kColorValue,
          int? dColorValue,
          bool? visible}) =>
      StochasticConfig(
        kPeriod: kPeriod ?? this.kPeriod,
        smooth: smooth ?? this.smooth,
        dPeriod: dPeriod ?? this.dPeriod,
        overbought: overbought ?? this.overbought,
        oversold: oversold ?? this.oversold,
        kColorValue: kColorValue ?? this.kColorValue,
        dColorValue: dColorValue ?? this.dColorValue,
        visible: visible ?? this.visible,
      );
  Map<String, dynamic> toJson() => {
        'kPeriod': kPeriod,
        'smooth': smooth,
        'dPeriod': dPeriod,
        'overbought': overbought,
        'oversold': oversold,
        'kColor': kColorValue,
        'dColor': dColorValue,
        'visible': visible,
      };
  factory StochasticConfig.fromJson(Map<String, dynamic> j) =>
      StochasticConfig(
        kPeriod: (j['kPeriod'] as num?)?.toInt() ?? 14,
        smooth: (j['smooth'] as num?)?.toInt() ?? 3,
        dPeriod: (j['dPeriod'] as num?)?.toInt() ?? 3,
        overbought: (j['overbought'] as num?)?.toDouble() ?? 80,
        oversold: (j['oversold'] as num?)?.toDouble() ?? 20,
        kColorValue: (j['kColor'] as num?)?.toInt() ?? 0xFF5B9CFF,
        dColorValue: (j['dColor'] as num?)?.toInt() ?? 0xFFFFA56B,
        visible: j['visible'] as bool? ?? false,
      );
}

class AtrConfig {
  const AtrConfig({
    required this.period,
    required this.colorValue,
    required this.visible,
  });
  final int period;
  final int colorValue;
  final bool visible;
  Color get color => Color(colorValue);
  AtrConfig copyWith({int? period, int? colorValue, bool? visible}) =>
      AtrConfig(
        period: period ?? this.period,
        colorValue: colorValue ?? this.colorValue,
        visible: visible ?? this.visible,
      );
  Map<String, dynamic> toJson() =>
      {'period': period, 'color': colorValue, 'visible': visible};
  factory AtrConfig.fromJson(Map<String, dynamic> j) => AtrConfig(
        period: (j['period'] as num?)?.toInt() ?? 14,
        colorValue: (j['color'] as num?)?.toInt() ?? 0xFF9C88FF,
        visible: j['visible'] as bool? ?? false,
      );
}

class AdxConfig {
  const AdxConfig({
    required this.period,
    required this.colorValue,
    required this.visible,
  });
  final int period;
  final int colorValue; // ADX line; DI+ / DI− use palette positive/danger
  final bool visible;
  Color get color => Color(colorValue);
  AdxConfig copyWith({int? period, int? colorValue, bool? visible}) =>
      AdxConfig(
        period: period ?? this.period,
        colorValue: colorValue ?? this.colorValue,
        visible: visible ?? this.visible,
      );
  Map<String, dynamic> toJson() =>
      {'period': period, 'color': colorValue, 'visible': visible};
  factory AdxConfig.fromJson(Map<String, dynamic> j) => AdxConfig(
        period: (j['period'] as num?)?.toInt() ?? 14,
        colorValue: (j['color'] as num?)?.toInt() ?? 0xFFFFB84D,
        visible: j['visible'] as bool? ?? false,
      );
}

class PivotConfig {
  const PivotConfig({
    required this.camarilla,
    required this.colorValue,
    required this.visible,
  });
  final bool camarilla; // false = classic
  final int colorValue;
  final bool visible;
  Color get color => Color(colorValue);
  PivotConfig copyWith({bool? camarilla, int? colorValue, bool? visible}) =>
      PivotConfig(
        camarilla: camarilla ?? this.camarilla,
        colorValue: colorValue ?? this.colorValue,
        visible: visible ?? this.visible,
      );
  Map<String, dynamic> toJson() =>
      {'camarilla': camarilla, 'color': colorValue, 'visible': visible};
  factory PivotConfig.fromJson(Map<String, dynamic> j) => PivotConfig(
        camarilla: j['camarilla'] as bool? ?? false,
        colorValue: (j['color'] as num?)?.toInt() ?? 0xFF8B5CF6,
        visible: j['visible'] as bool? ?? false,
      );
}

// ─── Aggregate config ────────────────────────────────────────────────────────

class IndicatorConfig {
  const IndicatorConfig({
    required this.smas,
    required this.emas,
    required this.vwapVisible,
    required this.bollinger,
    required this.rsi,
    required this.macd,
    required this.anchoredVwap,
    required this.ichimoku,
    required this.srVisible,
    required this.srLookback,
    required this.stochastic,
    required this.atr,
    required this.adx,
    required this.pivots,
  });

  final List<SmaConfig> smas;
  final List<EmaConfig> emas;
  final bool vwapVisible;
  final BollingerConfig bollinger;
  final RsiConfig rsi;
  final MacdConfig macd;
  final AnchoredVwapConfig anchoredVwap;
  final IchimokuConfig ichimoku;
  final bool srVisible;
  final int srLookback;
  final StochasticConfig stochastic;
  final AtrConfig atr;
  final AdxConfig adx;
  final PivotConfig pivots;

  static const defaults = IndicatorConfig(
    // Cohesive blue→purple ladder — shorter SMAs lighter, longer ones darker.
    smas: [
      SmaConfig(period: 20, colorValue: 0xFF8FCBFF, visible: true),
      SmaConfig(period: 50, colorValue: 0xFF5B9CFF, visible: true),
      SmaConfig(period: 150, colorValue: 0xFF6E7BF6, visible: true),
      SmaConfig(period: 200, colorValue: 0xFF8B5CF6, visible: true),
    ],
    emas: [],
    vwapVisible: false,
    bollinger: BollingerConfig(
      period: 20,
      stddev: 2.0,
      colorValue: 0xFF9C88FF,
      visible: false,
    ),
    rsi: RsiConfig(
      period: 14,
      overbought: 70,
      oversold: 30,
      colorValue: 0xFFFFA56B,
      visible: false,
    ),
    macd: MacdConfig(
      fast: 12,
      slow: 26,
      signal: 9,
      macdColorValue: 0xFF5B9CFF,
      signalColorValue: 0xFFFFA56B,
      visible: false,
    ),
    anchoredVwap: AnchoredVwapConfig(
      anchorMs: null,
      colorValue: 0xFF00D4AA,
      visible: false,
    ),
    ichimoku: IchimokuConfig(
      tenkanPeriod: 9,
      kijunPeriod: 26,
      senkouBPeriod: 52,
      displacement: 26,
      tenkanColorValue: 0xFF5B9CFF,
      kijunColorValue: 0xFFD22B2B,
      cloudUpColorValue: 0x4000D4AA,
      cloudDownColorValue: 0x40FF4D6A,
      visible: false,
    ),
    srVisible: false,
    srLookback: 5,
    stochastic: StochasticConfig(
      kPeriod: 14,
      smooth: 3,
      dPeriod: 3,
      overbought: 80,
      oversold: 20,
      kColorValue: 0xFF5B9CFF,
      dColorValue: 0xFFFFA56B,
      visible: false,
    ),
    atr: AtrConfig(period: 14, colorValue: 0xFF9C88FF, visible: false),
    adx: AdxConfig(period: 14, colorValue: 0xFFFFB84D, visible: false),
    pivots: PivotConfig(
        camarilla: false, colorValue: 0xFF8B5CF6, visible: false),
  );

  IndicatorConfig copyWith({
    List<SmaConfig>? smas,
    List<EmaConfig>? emas,
    bool? vwapVisible,
    BollingerConfig? bollinger,
    RsiConfig? rsi,
    MacdConfig? macd,
    AnchoredVwapConfig? anchoredVwap,
    IchimokuConfig? ichimoku,
    bool? srVisible,
    int? srLookback,
    StochasticConfig? stochastic,
    AtrConfig? atr,
    AdxConfig? adx,
    PivotConfig? pivots,
  }) =>
      IndicatorConfig(
        smas: smas ?? this.smas,
        emas: emas ?? this.emas,
        vwapVisible: vwapVisible ?? this.vwapVisible,
        bollinger: bollinger ?? this.bollinger,
        rsi: rsi ?? this.rsi,
        macd: macd ?? this.macd,
        anchoredVwap: anchoredVwap ?? this.anchoredVwap,
        ichimoku: ichimoku ?? this.ichimoku,
        srVisible: srVisible ?? this.srVisible,
        srLookback: srLookback ?? this.srLookback,
        stochastic: stochastic ?? this.stochastic,
        atr: atr ?? this.atr,
        adx: adx ?? this.adx,
        pivots: pivots ?? this.pivots,
      );

  Map<String, dynamic> toJson() => {
        'smas': smas.map((s) => s.toJson()).toList(),
        'emas': emas.map((e) => e.toJson()).toList(),
        'vwap': vwapVisible,
        'bollinger': bollinger.toJson(),
        'rsi': rsi.toJson(),
        'macd': macd.toJson(),
        'avwap': anchoredVwap.toJson(),
        'ichimoku': ichimoku.toJson(),
        'sr': srVisible,
        'srLookback': srLookback,
        'stochastic': stochastic.toJson(),
        'atr': atr.toJson(),
        'adx': adx.toJson(),
        'pivots': pivots.toJson(),
      };

  factory IndicatorConfig.fromJson(Map<String, dynamic> j) => IndicatorConfig(
        smas: ((j['smas'] as List?) ?? const [])
            .map((e) => SmaConfig.fromJson(e as Map<String, dynamic>))
            .toList(),
        emas: ((j['emas'] as List?) ?? const [])
            .map((e) => EmaConfig.fromJson(e as Map<String, dynamic>))
            .toList(),
        vwapVisible: j['vwap'] as bool? ?? false,
        bollinger: j['bollinger'] is Map<String, dynamic>
            ? BollingerConfig.fromJson(j['bollinger'] as Map<String, dynamic>)
            : defaults.bollinger,
        rsi: j['rsi'] is Map<String, dynamic>
            ? RsiConfig.fromJson(j['rsi'] as Map<String, dynamic>)
            : defaults.rsi,
        macd: j['macd'] is Map<String, dynamic>
            ? MacdConfig.fromJson(j['macd'] as Map<String, dynamic>)
            : defaults.macd,
        anchoredVwap: j['avwap'] is Map<String, dynamic>
            ? AnchoredVwapConfig.fromJson(j['avwap'] as Map<String, dynamic>)
            : defaults.anchoredVwap,
        ichimoku: j['ichimoku'] is Map<String, dynamic>
            ? IchimokuConfig.fromJson(j['ichimoku'] as Map<String, dynamic>)
            : defaults.ichimoku,
        srVisible: j['sr'] as bool? ?? false,
        srLookback: (j['srLookback'] as num?)?.toInt() ?? 5,
        stochastic: j['stochastic'] is Map<String, dynamic>
            ? StochasticConfig.fromJson(j['stochastic'] as Map<String, dynamic>)
            : defaults.stochastic,
        atr: j['atr'] is Map<String, dynamic>
            ? AtrConfig.fromJson(j['atr'] as Map<String, dynamic>)
            : defaults.atr,
        adx: j['adx'] is Map<String, dynamic>
            ? AdxConfig.fromJson(j['adx'] as Map<String, dynamic>)
            : defaults.adx,
        pivots: j['pivots'] is Map<String, dynamic>
            ? PivotConfig.fromJson(j['pivots'] as Map<String, dynamic>)
            : defaults.pivots,
      );
}

// ─── Notifier ────────────────────────────────────────────────────────────────

class IndicatorPrefsNotifier extends Notifier<IndicatorConfig> {
  static const _key = 'indicator_prefs_v1';
  static const _maxSmas = 6;
  static const _maxEmas = 6;

  @override
  IndicatorConfig build() {
    final prefs = ref.watch(sharedPreferencesProvider);
    final raw = prefs.getString(_key);
    if (raw == null) return IndicatorConfig.defaults;
    try {
      return IndicatorConfig.fromJson(jsonDecode(raw) as Map<String, dynamic>);
    } catch (_) {
      return IndicatorConfig.defaults;
    }
  }

  Future<void> _save(IndicatorConfig next) async {
    state = next;
    final prefs = ref.read(sharedPreferencesProvider);
    await prefs.setString(_key, jsonEncode(next.toJson()));
  }

  // SMA
  Future<void> toggleSma(int index) {
    final smas = [...state.smas];
    smas[index] = smas[index].copyWith(visible: !smas[index].visible);
    return _save(state.copyWith(smas: smas));
  }
  Future<void> updateSmaPeriod(int index, int period) {
    if (period < 2) return Future.value();
    final smas = [...state.smas];
    smas[index] = smas[index].copyWith(period: period);
    return _save(state.copyWith(smas: smas));
  }
  Future<void> updateSmaColor(int index, int colorValue) {
    final smas = [...state.smas];
    smas[index] = smas[index].copyWith(colorValue: colorValue);
    return _save(state.copyWith(smas: smas));
  }
  Future<void> addSma(int period, int colorValue) {
    if (state.smas.length >= _maxSmas) return Future.value();
    return _save(state.copyWith(smas: [
      ...state.smas,
      SmaConfig(period: period, colorValue: colorValue, visible: true),
    ]));
  }
  Future<void> removeSma(int index) {
    final smas = [...state.smas]..removeAt(index);
    return _save(state.copyWith(smas: smas));
  }

  // EMA
  Future<void> toggleEma(int index) {
    final emas = [...state.emas];
    emas[index] = emas[index].copyWith(visible: !emas[index].visible);
    return _save(state.copyWith(emas: emas));
  }
  Future<void> updateEmaPeriod(int index, int period) {
    if (period < 2) return Future.value();
    final emas = [...state.emas];
    emas[index] = emas[index].copyWith(period: period);
    return _save(state.copyWith(emas: emas));
  }
  Future<void> updateEmaColor(int index, int colorValue) {
    final emas = [...state.emas];
    emas[index] = emas[index].copyWith(colorValue: colorValue);
    return _save(state.copyWith(emas: emas));
  }
  Future<void> addEma(int period, int colorValue) {
    if (state.emas.length >= _maxEmas) return Future.value();
    return _save(state.copyWith(emas: [
      ...state.emas,
      EmaConfig(period: period, colorValue: colorValue, visible: true),
    ]));
  }
  Future<void> removeEma(int index) {
    final emas = [...state.emas]..removeAt(index);
    return _save(state.copyWith(emas: emas));
  }

  // VWAP
  Future<void> setVwapVisible(bool v) => _save(state.copyWith(vwapVisible: v));

  // Bollinger
  Future<void> setBollingerVisible(bool v) =>
      _save(state.copyWith(bollinger: state.bollinger.copyWith(visible: v)));
  Future<void> setBollingerPeriod(int p) {
    if (p < 2) return Future.value();
    return _save(state.copyWith(bollinger: state.bollinger.copyWith(period: p)));
  }
  Future<void> setBollingerStddev(double s) =>
      _save(state.copyWith(bollinger: state.bollinger.copyWith(stddev: s)));
  Future<void> setBollingerColor(int v) =>
      _save(state.copyWith(bollinger: state.bollinger.copyWith(colorValue: v)));

  // RSI
  Future<void> setRsiVisible(bool v) =>
      _save(state.copyWith(rsi: state.rsi.copyWith(visible: v)));
  Future<void> setRsiPeriod(int p) {
    if (p < 2) return Future.value();
    return _save(state.copyWith(rsi: state.rsi.copyWith(period: p)));
  }
  Future<void> setRsiOverbought(double v) =>
      _save(state.copyWith(rsi: state.rsi.copyWith(overbought: v)));
  Future<void> setRsiOversold(double v) =>
      _save(state.copyWith(rsi: state.rsi.copyWith(oversold: v)));
  Future<void> setRsiColor(int v) =>
      _save(state.copyWith(rsi: state.rsi.copyWith(colorValue: v)));

  // MACD
  Future<void> setMacdVisible(bool v) =>
      _save(state.copyWith(macd: state.macd.copyWith(visible: v)));
  Future<void> setMacdFast(int p) {
    if (p < 2) return Future.value();
    return _save(state.copyWith(macd: state.macd.copyWith(fast: p)));
  }
  Future<void> setMacdSlow(int p) {
    if (p < 2) return Future.value();
    return _save(state.copyWith(macd: state.macd.copyWith(slow: p)));
  }
  Future<void> setMacdSignal(int p) {
    if (p < 2) return Future.value();
    return _save(state.copyWith(macd: state.macd.copyWith(signal: p)));
  }
  Future<void> setMacdColors({int? macd, int? signal}) =>
      _save(state.copyWith(
          macd: state.macd.copyWith(
              macdColorValue: macd, signalColorValue: signal)));

  // Anchored VWAP
  Future<void> setAnchoredVwapVisible(bool v) => _save(
      state.copyWith(anchoredVwap: state.anchoredVwap.copyWith(visible: v)));
  Future<void> setAnchoredVwapAnchor(DateTime anchor) => _save(state.copyWith(
        anchoredVwap: state.anchoredVwap
            .copyWith(anchorMs: anchor.toUtc().millisecondsSinceEpoch),
      ));
  Future<void> clearAnchoredVwapAnchor() => _save(state.copyWith(
        anchoredVwap: state.anchoredVwap.copyWith(clearAnchor: true),
      ));
  Future<void> setAnchoredVwapColor(int v) => _save(
      state.copyWith(anchoredVwap: state.anchoredVwap.copyWith(colorValue: v)));

  // Ichimoku
  Future<void> setIchimokuVisible(bool v) =>
      _save(state.copyWith(ichimoku: state.ichimoku.copyWith(visible: v)));
  Future<void> setIchimokuTenkan(int p) {
    if (p < 2) return Future.value();
    return _save(state.copyWith(ichimoku: state.ichimoku.copyWith(tenkanPeriod: p)));
  }
  Future<void> setIchimokuKijun(int p) {
    if (p < 2) return Future.value();
    return _save(state.copyWith(ichimoku: state.ichimoku.copyWith(kijunPeriod: p)));
  }
  Future<void> setIchimokuSenkouB(int p) {
    if (p < 2) return Future.value();
    return _save(state.copyWith(ichimoku: state.ichimoku.copyWith(senkouBPeriod: p)));
  }
  Future<void> setIchimokuDisplacement(int p) {
    if (p < 1) return Future.value();
    return _save(state.copyWith(ichimoku: state.ichimoku.copyWith(displacement: p)));
  }

  // S/R
  Future<void> setSrVisible(bool v) => _save(state.copyWith(srVisible: v));
  Future<void> setSrLookback(int lookback) =>
      _save(state.copyWith(srLookback: lookback.clamp(3, 15)));

  // Stochastic
  Future<void> setStochasticVisible(bool v) =>
      _save(state.copyWith(stochastic: state.stochastic.copyWith(visible: v)));
  Future<void> setStochasticKPeriod(int p) {
    if (p < 2) return Future.value();
    return _save(
        state.copyWith(stochastic: state.stochastic.copyWith(kPeriod: p)));
  }
  Future<void> setStochasticSmooth(int p) {
    if (p < 1) return Future.value();
    return _save(
        state.copyWith(stochastic: state.stochastic.copyWith(smooth: p)));
  }
  Future<void> setStochasticDPeriod(int p) {
    if (p < 1) return Future.value();
    return _save(
        state.copyWith(stochastic: state.stochastic.copyWith(dPeriod: p)));
  }

  // ATR
  Future<void> setAtrVisible(bool v) =>
      _save(state.copyWith(atr: state.atr.copyWith(visible: v)));
  Future<void> setAtrPeriod(int p) {
    if (p < 2) return Future.value();
    return _save(state.copyWith(atr: state.atr.copyWith(period: p)));
  }

  // ADX
  Future<void> setAdxVisible(bool v) =>
      _save(state.copyWith(adx: state.adx.copyWith(visible: v)));
  Future<void> setAdxPeriod(int p) {
    if (p < 2) return Future.value();
    return _save(state.copyWith(adx: state.adx.copyWith(period: p)));
  }

  // Pivot Points
  Future<void> setPivotsVisible(bool v) =>
      _save(state.copyWith(pivots: state.pivots.copyWith(visible: v)));
  Future<void> setPivotsCamarilla(bool camarilla) =>
      _save(state.copyWith(pivots: state.pivots.copyWith(camarilla: camarilla)));
}

final indicatorPrefsProvider =
    NotifierProvider<IndicatorPrefsNotifier, IndicatorConfig>(
        IndicatorPrefsNotifier.new);
