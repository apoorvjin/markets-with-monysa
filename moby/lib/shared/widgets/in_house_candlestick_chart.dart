import 'dart:async';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:syncfusion_flutter_charts/charts.dart';
import '../../core/theme/app_palette.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/theme/app_typography.dart';
import '../../data/models/candle.dart';
import '../../data/repositories/trading_repository.dart';
import '../../providers/indicator_prefs_provider.dart';
import '../../utils/indicators.dart';
import 'indicator_settings_sheet.dart';

class InHouseCandlestickChart extends ConsumerStatefulWidget {
  const InHouseCandlestickChart({
    super.key,
    required this.symbol,
    required this.name,
    this.initialRange = '1M',
    this.showRangeBar = true,
    this.showVolume = true,
    this.showSettingsButton = true,
    this.showFullscreenButton = false,
    this.onFullscreen,
  });

  final String symbol;
  final String name;
  final String initialRange;
  final bool showRangeBar;
  final bool showVolume;
  final bool showSettingsButton;
  final bool showFullscreenButton;
  final VoidCallback? onFullscreen;

  @override
  ConsumerState<InHouseCandlestickChart> createState() =>
      _InHouseCandlestickChartState();
}

// AppShell uses extendBody:true with a 58px glass pill nav; reserve the
// matching bottom inset so the volume bars + axis labels stay visible.
const double _appShellNavInset = 58.0;

// User-specified S/R colors.
const Color _srResistance = Color(0xFFD22B2B);
const Color _srSupport = Color(0xFF77C412);

class _InHouseCandlestickChartState
    extends ConsumerState<InHouseCandlestickChart> {
  static const _ranges = ['1D', '1W', '1M', '3M', '6M', '1Y', '5Y'];
  static const _rangeMap = {
    '1D': '1d',
    '1W': '1wk',
    '1M': '1mo',
    '3M': '3mo',
    '6M': '6mo',
    '1Y': '1y',
    '5Y': '5y',
  };

  late String _range;
  ChartPayload? _payload;
  bool _loading = true;
  String? _error;
  CancelToken? _cancel;

  // Y-axis scale factor — 1.0 = auto-fit to data range, < 1 = compressed
  // (zoomed in vertically), > 1 = expanded. Mutated by dragging on the
  // right-edge price-label hit zone. Reset together with x-zoom.
  double _yZoom = 1.0;
  NumericAxisController? _yCtrl;
  bool _yZoomFrameScheduled = false;

  // Cached candle hi/lo midpoint + half-range, recomputed only when the
  // payload changes — keeps `_applyYZoom` O(1) on drag.
  double _yMid = 0;
  double _yHalfRange = 0;

  late final TrackballBehavior _trackball;
  late final ZoomPanBehavior _zoomPan;

  @override
  void initState() {
    super.initState();
    _range = widget.initialRange;
    _trackball = TrackballBehavior(
      enable: true,
      // Long-press activation: deliberate gesture, doesn't fire during pan.
      // The crosshair stays attached to the finger as it drags, so users can
      // scrub across candles for precise OHLC inspection.
      activationMode: ActivationMode.longPress,
      // nearestPoint + custom builder — group mode in Syncfusion 27 emits a
      // garbled multi-series format we can't override cleanly, so we render
      // our own OHLC + indicator card keyed off the touched candle index.
      tooltipDisplayMode: TrackballDisplayMode.nearestPoint,
      lineType: TrackballLineType.vertical,
      hideDelay: 2500,
      builder: _buildTrackball,
    );
    _zoomPan = ZoomPanBehavior(
      enablePinching: true,
      enablePanning: true,
      zoomMode: ZoomMode.x,
      enableDoubleTapZooming: true,
    );
    _load();
  }

  @override
  void dispose() {
    _cancel?.cancel();
    super.dispose();
  }

  /// Caches midpoint + half-range across the candle hi/lo, so `_applyYZoom`
  /// can be called O(1) on every drag event.
  void _recomputeYRange(List<Candle> candles) {
    if (candles.isEmpty) {
      _yMid = 0;
      _yHalfRange = 0;
      return;
    }
    var lo = double.infinity;
    var hi = -double.infinity;
    for (final candle in candles) {
      if (candle.low < lo) lo = candle.low;
      if (candle.high > hi) hi = candle.high;
    }
    _yMid = (lo + hi) / 2;
    _yHalfRange = (hi - lo) / 2;
  }

  /// Schedules a single y-axis controller update on the next frame. Multiple
  /// drag-update events coalesce into one Syncfusion redraw per vsync, which
  /// eliminates the choppy feel from 60+ setter calls per second.
  void _scheduleYZoom() {
    if (_yZoomFrameScheduled) return;
    _yZoomFrameScheduled = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _yZoomFrameScheduled = false;
      final ctrl = _yCtrl;
      if (ctrl == null) return;
      if (_yZoom == 1.0) {
        ctrl.visibleMinimum = null;
        ctrl.visibleMaximum = null;
        return;
      }
      final half = _yHalfRange * _yZoom;
      ctrl.visibleMinimum = _yMid - half;
      ctrl.visibleMaximum = _yMid + half;
    });
  }

  /// Builds the OHLC + indicator card shown at the trackball position.
  /// Called by `TrackballBehavior.builder` with the nearest data point's
  /// metadata. We resolve the candle by `pointIndex` (DateTimeCategoryAxis
  /// uses 0-based positions) and pull live SMA / VWAP values from the
  /// indicator engine.
  Widget _buildTrackball(BuildContext context, TrackballDetails details) {
    final candles = _payload?.candles;
    final idx = details.pointIndex;
    if (candles == null || idx == null || idx < 0 || idx >= candles.length) {
      return const SizedBox.shrink();
    }
    final candle = candles[idx];
    final prefs = ref.read(indicatorPrefsProvider);

    // Indicator values at this candle, computed locally.
    final smaRows = <({String label, double value, Color color})>[];
    for (final s in prefs.smas) {
      if (!s.visible) continue;
      if (idx < s.period - 1) continue; // not yet defined
      var sum = 0.0;
      for (var k = idx - s.period + 1; k <= idx; k++) {
        sum += candles[k].close;
      }
      smaRows.add((
        label: 'SMA${s.period}',
        value: sum / s.period,
        color: s.color,
      ));
    }

    final c = context.colors;
    final fmt = (_range == '1D' || _range == '1W')
        ? DateFormat('MMM d HH:mm')
        : DateFormat('MMM d, y');

    return _TrackballCard(
      title: fmt.format(candle.time),
      candle: candle,
      smaRows: smaRows,
      palette: c,
    );
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    _cancel?.cancel();
    _cancel = CancelToken();
    try {
      final payload = await TradingRepository.instance.fetchChart(
        widget.symbol,
        range: _rangeMap[_range] ?? '1mo',
      );
      if (!mounted) return;
      _recomputeYRange(payload.candles);
      setState(() {
        _payload = payload;
        _loading = false;
      });
    } on DioException catch (e) {
      if (CancelToken.isCancel(e)) return;
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = 'Failed to load chart';
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = 'Failed to load chart';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final prefs = ref.watch(indicatorPrefsProvider);
    // AppShell's bottom nav (extendBody:true) plus the device safe-area
    // would otherwise occlude the volume bars + bottom axis labels.
    final bottomInset =
        _appShellNavInset + MediaQuery.viewPaddingOf(context).bottom;
    final showRsi = prefs.rsi.visible && _payload != null && _payload!.candles.isNotEmpty;
    final showMacd = prefs.macd.visible && _payload != null && _payload!.candles.isNotEmpty;

    return Column(
      children: [
        if (widget.showRangeBar) _RangeChips(
          selected: _range,
          ranges: _ranges,
          onSelected: (r) {
            setState(() => _range = r);
            _load();
          },
        ),
        Expanded(
          child: Padding(
            padding: EdgeInsets.only(bottom: bottomInset),
            child: Column(
              children: [
                Expanded(
                  child: Stack(
                    children: [
                      Positioned.fill(child: _buildBody(c)),
                      // TradingView-style price-scale drag: vertical pan on the
                      // right ~44px (the y-axis label gutter) compresses or
                      // expands the visible price range.
                      if (_payload != null && !_loading && _error == null)
                        Positioned(
                          top: 0,
                          bottom: 0,
                          right: 0,
                          width: 44,
                          child: GestureDetector(
                            behavior: HitTestBehavior.translucent,
                            onVerticalDragUpdate: (details) {
                              final factor = 1.0 + details.delta.dy / 200;
                              _yZoom = (_yZoom * factor).clamp(0.1, 10.0);
                              _scheduleYZoom();
                            },
                            onDoubleTap: () {
                              _yZoom = 1.0;
                              _scheduleYZoom();
                            },
                            child: const SizedBox.expand(),
                          ),
                        ),
                      // Top-right action stack, right-to-left: ⚙ ⟲ ⛶
                      if (widget.showSettingsButton)
                        Positioned(
                          top: AppSpacing.s3,
                          right: AppSpacing.s3,
                          child: _IconPill(
                            icon: Icons.tune_rounded,
                            onTap: () =>
                                IndicatorSettingsSheet.show(context),
                          ),
                        ),
                      Positioned(
                        top: AppSpacing.s3,
                        right: widget.showSettingsButton
                            ? AppSpacing.s3 + 44
                            : AppSpacing.s3,
                        child: _IconPill(
                          icon: Icons.restart_alt_rounded,
                          onTap: () {
                            _zoomPan.reset();
                            _yZoom = 1.0;
                            _scheduleYZoom();
                          },
                        ),
                      ),
                      if (widget.showFullscreenButton &&
                          widget.onFullscreen != null)
                        Positioned(
                          top: AppSpacing.s3,
                          right: AppSpacing.s3 +
                              (widget.showSettingsButton ? 88 : 44),
                          child: _IconPill(
                            icon: Icons.fullscreen_rounded,
                            onTap: widget.onFullscreen!,
                          ),
                        ),
                    ],
                  ),
                ),
                if (showRsi)
                  SizedBox(
                    height: 110,
                    child: _buildRsiSubpane(c, _payload!.candles, prefs.rsi),
                  ),
                if (showMacd)
                  SizedBox(
                    height: 120,
                    child: _buildMacdSubpane(c, _payload!.candles, prefs.macd),
                  ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildBody(AppPalette c) {
    if (_loading) {
      return Center(child: CircularProgressIndicator(color: c.accent));
    }
    if (_error != null) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(_error!,
                style: AppTypography.md.copyWith(color: c.textMuted)),
            const SizedBox(height: AppSpacing.s4),
            TextButton.icon(
              onPressed: _load,
              icon: Icon(Icons.refresh_rounded, color: c.accent),
              label: Text('Retry',
                  style: AppTypography.labelMd.copyWith(color: c.accent)),
            ),
          ],
        ),
      );
    }
    final payload = _payload;
    if (payload == null || payload.candles.isEmpty) {
      return Center(
        child: Text('No data',
            style: AppTypography.md.copyWith(color: c.textMuted)),
      );
    }
    return _buildChart(c, payload);
  }

  Widget _buildChart(AppPalette c, ChartPayload payload) {
    final candles = payload.candles;
    final prefs = ref.watch(indicatorPrefsProvider);
    final isIntraday = _range == '1D' || _range == '1W';

    // Overlay indicators (share the price y-axis)
    final visibleSmas = [
      for (final s in prefs.smas)
        if (s.visible) (config: s, points: sma(candles, s.period)),
    ].where((p) => p.points.isNotEmpty).toList();

    final visibleEmas = [
      for (final e in prefs.emas)
        if (e.visible) (config: e, points: ema(candles, e.period)),
    ].where((p) => p.points.isNotEmpty).toList();

    final vwapPoints =
        prefs.vwapVisible ? vwap(candles) : const <IndicatorPoint>[];

    final bb = prefs.bollinger.visible
        ? bollinger(candles,
            period: prefs.bollinger.period, stddev: prefs.bollinger.stddev)
        : null;

    final avwapPoints = (prefs.anchoredVwap.visible &&
            prefs.anchoredVwap.anchor != null)
        ? anchoredVwap(candles, prefs.anchoredVwap.anchor!)
        : const <IndicatorPoint>[];

    final ichi = prefs.ichimoku.visible
        ? ichimoku(
            candles,
            tenkanPeriod: prefs.ichimoku.tenkanPeriod,
            kijunPeriod: prefs.ichimoku.kijunPeriod,
            senkouBPeriod: prefs.ichimoku.senkouBPeriod,
            displacement: prefs.ichimoku.displacement,
          )
        : null;

    final visibleLevels =
        prefs.srVisible ? payload.levels : const <SupportResistanceLevel>[];

    final lastIdx = candles.length - 1;

    return SfCartesianChart(
      backgroundColor: c.surface,
      plotAreaBorderWidth: 0,
      margin: const EdgeInsets.fromLTRB(0, 8, 8, 4),
      // DateTimeCategoryAxis treats every candle as a discrete slot, so
      // weekend / holiday non-trading days never reserve empty space — the
      // candles render contiguously as in TradingView et al.
      primaryXAxis: DateTimeCategoryAxis(
        majorGridLines: MajorGridLines(width: 0.5, color: c.border),
        axisLine: AxisLine(width: 0, color: c.border),
        labelStyle: AppTypography.xs.copyWith(color: c.textMuted),
        dateFormat: isIntraday
            ? DateFormat('HH:mm')
            : (_range == '5Y'
                ? DateFormat('MMM yy')
                : DateFormat('MMM d')),
        intervalType: isIntraday
            ? DateTimeIntervalType.hours
            : DateTimeIntervalType.auto,
      ),
      primaryYAxis: NumericAxis(
        opposedPosition: true,
        onRendererCreated: (controller) => _yCtrl = controller,
        majorGridLines: MajorGridLines(width: 0.5, color: c.border),
        axisLine: AxisLine(width: 0, color: c.border),
        labelStyle: AppTypography.xs.copyWith(color: c.textMuted),
        plotBands: <PlotBand>[
          for (final l in visibleLevels)
            PlotBand(
              start: l.price,
              end: l.price,
              borderColor:
                  l.type == SrType.support ? _srSupport : _srResistance,
              borderWidth: 1,
              text: l.type == SrType.support ? 'Sup' : 'Res',
              horizontalTextAlignment: TextAnchor.end,
              verticalTextAlignment: TextAnchor.middle,
              textStyle: AppTypography.xs.copyWith(
                color: l.type == SrType.support ? _srSupport : _srResistance,
                fontWeight: FontWeight.w600,
              ),
            ),
        ],
      ),
      axes: widget.showVolume
          ? <ChartAxis>[
              NumericAxis(
                name: 'volumeAxis',
                isVisible: false,
                opposedPosition: false,
                maximum: _volumeAxisMax(candles),
              ),
            ]
          : const <ChartAxis>[],
      trackballBehavior: _trackball,
      zoomPanBehavior: _zoomPan,
      annotations: <CartesianChartAnnotation>[
        _pricePill(lastIdx, candles.last.close, c.accent, 'PRICE'),
        for (final s in visibleSmas)
          _pricePill(lastIdx, s.points.last.value, s.config.color,
              'SMA${s.config.period}'),
        for (final e in visibleEmas)
          _pricePill(lastIdx, e.points.last.value, e.config.color,
              'EMA${e.config.period}'),
        if (bb != null && bb.mid.isNotEmpty)
          _pricePill(lastIdx, bb.upper.last.value, prefs.bollinger.color,
              'BB+'),
        if (vwapPoints.isNotEmpty)
          _pricePill(lastIdx, vwapPoints.last.value, c.warning, 'VWAP'),
        if (avwapPoints.isNotEmpty)
          _pricePill(lastIdx, avwapPoints.last.value,
              prefs.anchoredVwap.color, 'AVWAP'),
      ],
      series: <CartesianSeries<dynamic, DateTime>>[
        if (widget.showVolume)
          ColumnSeries<Candle, DateTime>(
            name: 'Volume',
            dataSource: candles,
            xValueMapper: (c, _) => c.time,
            yValueMapper: (c, _) => c.volume ?? 0,
            yAxisName: 'volumeAxis',
            pointColorMapper: (candle, _) => candle.isGreen
                ? c.positive.withAlpha(0xCC)
                : c.danger.withAlpha(0xCC),
            borderWidth: 0,
            width: 0.85,
            animationDuration: 0,
          ),
        CandleSeries<Candle, DateTime>(
          name: widget.symbol,
          dataSource: candles,
          xValueMapper: (c, _) => c.time,
          openValueMapper: (c, _) => c.open,
          highValueMapper: (c, _) => c.high,
          lowValueMapper: (c, _) => c.low,
          closeValueMapper: (c, _) => c.close,
          bullColor: c.positive,
          bearColor: c.danger,
          enableSolidCandles: true,
          animationDuration: 0,
        ),
        for (final s in visibleSmas)
          LineSeries<IndicatorPoint, DateTime>(
            name: 'SMA ${s.config.period}',
            dataSource: s.points,
            xValueMapper: (p, _) => p.time,
            yValueMapper: (p, _) => p.value,
            color: s.config.color,
            width: 1.6,
            animationDuration: 0,
          ),
        for (final e in visibleEmas)
          LineSeries<IndicatorPoint, DateTime>(
            name: 'EMA ${e.config.period}',
            dataSource: e.points,
            xValueMapper: (p, _) => p.time,
            yValueMapper: (p, _) => p.value,
            color: e.config.color,
            width: 1.6,
            animationDuration: 0,
          ),
        // Bollinger Bands: shaded RangeArea between upper and lower,
        // then upper/mid/lower lines on top.
        if (bb != null && bb.upper.isNotEmpty)
          RangeAreaSeries<({DateTime t, double up, double lo}), DateTime>(
            name: 'BB Range',
            dataSource: [
              for (var i = 0; i < bb.upper.length; i++)
                (
                  t: bb.upper[i].time,
                  up: bb.upper[i].value,
                  lo: bb.lower[i].value,
                ),
            ],
            xValueMapper: (p, _) => p.t,
            highValueMapper: (p, _) => p.up,
            lowValueMapper: (p, _) => p.lo,
            color: prefs.bollinger.color.withAlpha(0x18),
            borderWidth: 0,
            animationDuration: 0,
          ),
        if (bb != null && bb.upper.isNotEmpty) ...[
          LineSeries<IndicatorPoint, DateTime>(
            name: 'BB Upper',
            dataSource: bb.upper,
            xValueMapper: (p, _) => p.time,
            yValueMapper: (p, _) => p.value,
            color: prefs.bollinger.color,
            width: 1.2,
            animationDuration: 0,
          ),
          LineSeries<IndicatorPoint, DateTime>(
            name: 'BB Mid',
            dataSource: bb.mid,
            xValueMapper: (p, _) => p.time,
            yValueMapper: (p, _) => p.value,
            color: prefs.bollinger.color.withAlpha(0xAA),
            width: 1.0,
            dashArray: const <double>[3, 2],
            animationDuration: 0,
          ),
          LineSeries<IndicatorPoint, DateTime>(
            name: 'BB Lower',
            dataSource: bb.lower,
            xValueMapper: (p, _) => p.time,
            yValueMapper: (p, _) => p.value,
            color: prefs.bollinger.color,
            width: 1.2,
            animationDuration: 0,
          ),
        ],
        // Ichimoku Kumo (cloud) — drawn under all lines for clarity.
        if (ichi != null && ichi.senkouA.isNotEmpty)
          RangeAreaSeries<({DateTime t, double up, double lo}), DateTime>(
            name: 'Kumo',
            dataSource: _ichiCloudData(ichi),
            xValueMapper: (p, _) => p.t,
            highValueMapper: (p, _) => p.up,
            lowValueMapper: (p, _) => p.lo,
            // Average of up/down cloud tints — Syncfusion's RangeArea has
            // a single fill, so we can't switch tint per segment without
            // splitting into separate series. The blended colour reads as
            // "cloud" regardless of orientation.
            color: Color.lerp(prefs.ichimoku.cloudUpColor,
                    prefs.ichimoku.cloudDownColor, 0.5) ??
                prefs.ichimoku.cloudUpColor,
            borderWidth: 0,
            animationDuration: 0,
          ),
        if (ichi != null) ...[
          LineSeries<IndicatorPoint, DateTime>(
            name: 'Tenkan',
            dataSource: ichi.tenkan,
            xValueMapper: (p, _) => p.time,
            yValueMapper: (p, _) => p.value,
            color: prefs.ichimoku.tenkanColor,
            width: 1.2,
            animationDuration: 0,
          ),
          LineSeries<IndicatorPoint, DateTime>(
            name: 'Kijun',
            dataSource: ichi.kijun,
            xValueMapper: (p, _) => p.time,
            yValueMapper: (p, _) => p.value,
            color: prefs.ichimoku.kijunColor,
            width: 1.2,
            animationDuration: 0,
          ),
        ],
        if (vwapPoints.isNotEmpty)
          LineSeries<IndicatorPoint, DateTime>(
            name: 'VWAP',
            dataSource: vwapPoints,
            xValueMapper: (p, _) => p.time,
            yValueMapper: (p, _) => p.value,
            color: c.warning,
            width: 1.6,
            dashArray: const <double>[4, 3],
            animationDuration: 0,
          ),
        if (avwapPoints.isNotEmpty)
          LineSeries<IndicatorPoint, DateTime>(
            name: 'AVWAP',
            dataSource: avwapPoints,
            xValueMapper: (p, _) => p.time,
            yValueMapper: (p, _) => p.value,
            color: prefs.anchoredVwap.color,
            width: 1.8,
            animationDuration: 0,
          ),
      ],
    );
  }

  Widget _buildRsiSubpane(
      AppPalette c, List<Candle> candles, RsiConfig cfg) {
    final points = rsi(candles, period: cfg.period);
    final isIntraday = _range == '1D' || _range == '1W';
    return Container(
      decoration: BoxDecoration(
        color: c.surface,
        border: Border(top: BorderSide(color: c.border, width: 0.5)),
      ),
      child: SfCartesianChart(
        backgroundColor: c.surface,
        plotAreaBorderWidth: 0,
        margin: const EdgeInsets.fromLTRB(0, 4, 8, 0),
        primaryXAxis: DateTimeCategoryAxis(
          isVisible: false,
          majorGridLines: const MajorGridLines(width: 0),
          dateFormat: isIntraday ? DateFormat('HH:mm') : DateFormat('MMM d'),
        ),
        primaryYAxis: NumericAxis(
          opposedPosition: true,
          minimum: 0,
          maximum: 100,
          interval: 50,
          axisLine: AxisLine(width: 0, color: c.border),
          majorGridLines: MajorGridLines(width: 0.5, color: c.border),
          labelStyle:
              AppTypography.xs.copyWith(color: c.textMuted, fontSize: 9),
          plotBands: <PlotBand>[
            PlotBand(
              start: cfg.overbought,
              end: cfg.overbought,
              borderColor: _srResistance,
              borderWidth: 0.8,
              text: '${cfg.overbought.toStringAsFixed(0)}',
              horizontalTextAlignment: TextAnchor.end,
              verticalTextAlignment: TextAnchor.middle,
              textStyle: AppTypography.xs.copyWith(
                  color: _srResistance, fontSize: 9),
            ),
            PlotBand(
              start: cfg.oversold,
              end: cfg.oversold,
              borderColor: _srSupport,
              borderWidth: 0.8,
              text: '${cfg.oversold.toStringAsFixed(0)}',
              horizontalTextAlignment: TextAnchor.end,
              verticalTextAlignment: TextAnchor.middle,
              textStyle: AppTypography.xs.copyWith(
                  color: _srSupport, fontSize: 9),
            ),
          ],
        ),
        series: <CartesianSeries<IndicatorPoint, DateTime>>[
          LineSeries<IndicatorPoint, DateTime>(
            name: 'RSI',
            dataSource: points,
            xValueMapper: (p, _) => p.time,
            yValueMapper: (p, _) => p.value,
            color: cfg.color,
            width: 1.4,
            animationDuration: 0,
          ),
        ],
        annotations: <CartesianChartAnnotation>[
          if (points.isNotEmpty)
            CartesianChartAnnotation(
              widget: _PricePill(
                value: points.last.value,
                color: cfg.color,
                label: 'RSI${cfg.period}',
              ),
              x: candles.length - 1,
              y: points.last.value,
              coordinateUnit: CoordinateUnit.point,
              region: AnnotationRegion.plotArea,
              horizontalAlignment: ChartAlignment.far,
              verticalAlignment: ChartAlignment.center,
            ),
        ],
      ),
    );
  }

  Widget _buildMacdSubpane(
      AppPalette c, List<Candle> candles, MacdConfig cfg) {
    final m = macd(candles,
        fast: cfg.fast, slow: cfg.slow, signal: cfg.signal);
    final isIntraday = _range == '1D' || _range == '1W';
    return Container(
      decoration: BoxDecoration(
        color: c.surface,
        border: Border(top: BorderSide(color: c.border, width: 0.5)),
      ),
      child: SfCartesianChart(
        backgroundColor: c.surface,
        plotAreaBorderWidth: 0,
        margin: const EdgeInsets.fromLTRB(0, 4, 8, 0),
        primaryXAxis: DateTimeCategoryAxis(
          isVisible: false,
          majorGridLines: const MajorGridLines(width: 0),
          dateFormat: isIntraday ? DateFormat('HH:mm') : DateFormat('MMM d'),
        ),
        primaryYAxis: NumericAxis(
          opposedPosition: true,
          axisLine: AxisLine(width: 0, color: c.border),
          majorGridLines: MajorGridLines(width: 0.5, color: c.border),
          labelStyle:
              AppTypography.xs.copyWith(color: c.textMuted, fontSize: 9),
          plotBands: <PlotBand>[
            PlotBand(
              start: 0,
              end: 0,
              borderColor: c.border,
              borderWidth: 0.8,
            ),
          ],
        ),
        series: <CartesianSeries<IndicatorPoint, DateTime>>[
          ColumnSeries<IndicatorPoint, DateTime>(
            name: 'Hist',
            dataSource: m.histogram,
            xValueMapper: (p, _) => p.time,
            yValueMapper: (p, _) => p.value,
            pointColorMapper: (p, _) => p.value >= 0
                ? c.positive.withAlpha(0xAA)
                : c.danger.withAlpha(0xAA),
            borderWidth: 0,
            width: 0.7,
            animationDuration: 0,
          ),
          LineSeries<IndicatorPoint, DateTime>(
            name: 'MACD',
            dataSource: m.macd,
            xValueMapper: (p, _) => p.time,
            yValueMapper: (p, _) => p.value,
            color: cfg.macdColor,
            width: 1.4,
            animationDuration: 0,
          ),
          LineSeries<IndicatorPoint, DateTime>(
            name: 'Signal',
            dataSource: m.signal,
            xValueMapper: (p, _) => p.time,
            yValueMapper: (p, _) => p.value,
            color: cfg.signalColor,
            width: 1.4,
            animationDuration: 0,
          ),
        ],
        annotations: <CartesianChartAnnotation>[
          if (m.macd.isNotEmpty)
            CartesianChartAnnotation(
              widget: _PricePill(
                value: m.macd.last.value,
                color: cfg.macdColor,
                label: 'MACD',
              ),
              x: candles.length - 1,
              y: m.macd.last.value,
              coordinateUnit: CoordinateUnit.point,
              region: AnnotationRegion.plotArea,
              horizontalAlignment: ChartAlignment.far,
              verticalAlignment: ChartAlignment.center,
            ),
        ],
      ),
    );
  }

  List<({DateTime t, double up, double lo})> _ichiCloudData(
      IchimokuLines ichi) {
    // The cloud spans where both Senkou A and B are defined at the same time.
    // Both series share identical timestamps by construction, but the lengths
    // can differ if SenkouB requires more lookback. We align by timestamp.
    final aByTime = {for (final p in ichi.senkouA) p.time: p.value};
    final out = <({DateTime t, double up, double lo})>[];
    for (final b in ichi.senkouB) {
      final a = aByTime[b.time];
      if (a == null) continue;
      out.add((
        t: b.time,
        up: a > b.value ? a : b.value,
        lo: a < b.value ? a : b.value,
      ));
    }
    return out;
  }

  double _volumeAxisMax(List<Candle> candles) {
    var maxVol = 0.0;
    for (final c in candles) {
      final v = c.volume ?? 0;
      if (v > maxVol) maxVol = v;
    }
    // Pad to ~3.5x so volume bars occupy the bottom ~28% of the plot area —
    // visible without crowding the candles.
    return maxVol == 0 ? 1 : maxVol * 3.5;
  }

  // Note: x is the candle's integer index (DateTimeCategoryAxis uses
  // 0-based positions), NOT the underlying DateTime.
  CartesianChartAnnotation _pricePill(
      int xIndex, double y, Color color, String label) {
    return CartesianChartAnnotation(
      widget: _PricePill(value: y, color: color, label: label),
      x: xIndex,
      y: y,
      coordinateUnit: CoordinateUnit.point,
      region: AnnotationRegion.plotArea,
      horizontalAlignment: ChartAlignment.far,
      verticalAlignment: ChartAlignment.center,
    );
  }
}

class _TrackballCard extends StatelessWidget {
  const _TrackballCard({
    required this.title,
    required this.candle,
    required this.smaRows,
    required this.palette,
  });

  final String title;
  final Candle candle;
  final List<({String label, double value, Color color})> smaRows;
  final AppPalette palette;

  @override
  Widget build(BuildContext context) {
    final c = palette;
    final num4 = NumberFormat('#,##0.00');
    final volFmt = NumberFormat.compact();

    Widget kv(String k, String v, {Color? valueColor}) => Padding(
          padding: const EdgeInsets.symmetric(vertical: 1),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              SizedBox(
                width: 38,
                child: Text(k,
                    style: AppTypography.xs.copyWith(
                      color: c.textMuted,
                      fontSize: 9,
                      letterSpacing: 0.4,
                    )),
              ),
              const SizedBox(width: 6),
              Text(v,
                  style: AppTypography.xs.copyWith(
                    color: valueColor ?? c.textPrimary,
                    fontWeight: FontWeight.w600,
                  )),
            ],
          ),
        );

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: BoxDecoration(
        color: c.surfaceElevated.withAlpha(0xF0),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: c.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(title,
              style: AppTypography.xs.copyWith(
                color: c.textSecondary,
                fontWeight: FontWeight.w600,
              )),
          const SizedBox(height: 4),
          kv('OPEN', num4.format(candle.open)),
          kv('HIGH', num4.format(candle.high),
              valueColor: c.positive),
          kv('LOW', num4.format(candle.low), valueColor: c.danger),
          kv('CLOSE', num4.format(candle.close),
              valueColor: candle.isGreen ? c.positive : c.danger),
          if (candle.volume != null && candle.volume! > 0)
            kv('VOL', volFmt.format(candle.volume!)),
          if (smaRows.isNotEmpty) ...[
            const SizedBox(height: 4),
            for (final row in smaRows)
              kv(row.label, num4.format(row.value), valueColor: row.color),
          ],
        ],
      ),
    );
  }
}

class _PricePill extends StatelessWidget {
  const _PricePill({
    required this.value,
    required this.color,
    required this.label,
  });
  final double value;
  final Color color;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: color,
        borderRadius: BorderRadius.circular(4),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            label,
            style: AppTypography.xs.copyWith(
              color: Colors.white.withAlpha(0xCC),
              fontWeight: FontWeight.w600,
              fontSize: 9,
              letterSpacing: 0.3,
            ),
          ),
          const SizedBox(width: 4),
          Text(
            value.toStringAsFixed(2),
            style: AppTypography.xs.copyWith(
              color: Colors.white,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }
}

class _RangeChips extends StatelessWidget {
  const _RangeChips({
    required this.selected,
    required this.ranges,
    required this.onSelected,
  });

  final String selected;
  final List<String> ranges;
  final ValueChanged<String> onSelected;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return SizedBox(
      height: 40,
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: ranges.map((r) {
          final isActive = r == selected;
          return GestureDetector(
            onTap: () => onSelected(r),
            child: Container(
              margin:
                  const EdgeInsets.symmetric(horizontal: 4, vertical: 6),
              padding:
                  const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
              decoration: BoxDecoration(
                color: isActive ? c.accent : Colors.transparent,
                borderRadius: BorderRadius.circular(AppRadius.full),
              ),
              child: Text(
                r,
                style: AppTypography.sm.copyWith(
                  color: isActive ? c.background : c.textMuted,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          );
        }).toList(),
      ),
    );
  }
}

class _IconPill extends StatelessWidget {
  const _IconPill({required this.icon, required this.onTap});
  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Material(
      color: c.surfaceElevated.withAlpha(220),
      shape: const CircleBorder(),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(8),
          child: Icon(icon, size: 18, color: c.textPrimary),
        ),
      ),
    );
  }
}
