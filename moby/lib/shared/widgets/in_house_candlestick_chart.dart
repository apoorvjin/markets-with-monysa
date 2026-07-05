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
import 'chart_overlay_models.dart';
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
    this.signalLevels,
    this.tradeMarkers,
  });

  final String symbol;
  final String name;
  final String initialRange;
  final bool showRangeBar;
  final bool showVolume;
  final bool showSettingsButton;
  final bool showFullscreenButton;
  final VoidCallback? onFullscreen;
  final SignalLevels? signalLevels;
  final List<TradeMarker>? tradeMarkers;

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

  // Compare-symbol overlay: second symbol's closes rebased to this chart's
  // first close (TradingView-style indexed compare). Fetch failures are
  // silent — the main chart must never break because of the overlay.
  String? _compareSymbol;
  List<Candle>? _compareCandles;

  // Log-scale y-axis; only applied on 1Y/5Y where linear distorts long moves.
  bool _logScale = false;
  bool get _logEligible => _range == '1Y' || _range == '5Y';

  // Cross-pane x-zoom sync: the main chart's ZoomPanBehavior drives the
  // sub-pane x-axes through their controllers (TradingView-style linked
  // panes). The y-axis needs no manual scaling — `anchorRangeToVisiblePoints`
  // (Syncfusion default) auto-fits the price range to the visible window,
  // which is how TradingView/Robinhood behave.
  double _xZoomFactor = 1.0;
  double _xZoomPosition = 0.0;
  ChartAxisController? _rsiXCtrl;
  ChartAxisController? _macdXCtrl;
  ChartAxisController? _stochXCtrl;
  ChartAxisController? _atrXCtrl;
  ChartAxisController? _adxXCtrl;

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
      // Hide on release — a lingering tooltip reads as lag.
      hideDelay: 0,
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

  /// Pushes the main chart's x-zoom state onto every visible sub-pane axis
  /// controller, so RSI/MACD/Stoch/ATR/ADX stay aligned with the candles
  /// while panning and pinching.
  void _applyXZoom(double factor, double position) {
    _xZoomFactor = factor;
    _xZoomPosition = position;
    final prefs = ref.read(indicatorPrefsProvider);
    for (final (visible, ctrl) in [
      (prefs.rsi.visible, _rsiXCtrl),
      (prefs.macd.visible, _macdXCtrl),
      (prefs.stochastic.visible, _stochXCtrl),
      (prefs.atr.visible, _atrXCtrl),
      (prefs.adx.visible, _adxXCtrl),
    ]) {
      if (visible && ctrl != null) {
        ctrl.zoomFactor = factor;
        ctrl.zoomPosition = position;
      }
    }
  }

  void _resetZoom() {
    _zoomPan.reset();
    _applyXZoom(1.0, 0.0);
  }

  /// Builds the OHLC + indicator card shown at the trackball position.
  /// The nearest point can belong to an indicator series whose list is
  /// offset from the candles (SMA starts at period − 1, etc.), so the candle
  /// is resolved by the tapped point's timestamp, not its raw index.
  Widget _buildTrackball(BuildContext context, TrackballDetails details) {
    final candles = _payload?.candles;
    final pointIdx = details.pointIndex;
    if (candles == null || pointIdx == null || pointIdx < 0) {
      return const SizedBox.shrink();
    }
    DateTime? t;
    final ds = (details.series as dynamic)?.dataSource as List<dynamic>?;
    if (ds != null && pointIdx < ds.length) {
      final item = ds[pointIdx];
      if (item is Candle) {
        t = item.time;
      } else if (item is IndicatorPoint) {
        t = item.time;
      }
    }
    final idx = t != null
        ? candles.indexWhere((c) => c.time == t)
        : (pointIdx < candles.length ? pointIdx : -1);
    if (idx < 0 || idx >= candles.length) {
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
      List<Candle>? compareCandles;
      if (_compareSymbol != null) {
        try {
          final cp = await TradingRepository.instance.fetchChart(
            _compareSymbol!,
            range: _rangeMap[_range] ?? '1mo',
          );
          compareCandles = cp.candles;
        } catch (_) {
          compareCandles = null;
        }
      }
      if (!mounted) return;
      setState(() {
        _payload = payload;
        _compareCandles = compareCandles;
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
    final hasData = _payload != null && _payload!.candles.isNotEmpty;
    final showRsi = prefs.rsi.visible && hasData;
    final showMacd = prefs.macd.visible && hasData;
    final showStoch = prefs.stochastic.visible && hasData;
    final showAtr = prefs.atr.visible && hasData;
    final showAdx = prefs.adx.visible && hasData;

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
                      // Top-right action row, right-to-left: ⚙ ⟲ ⇄ LOG ⛶
                      Positioned(
                        top: AppSpacing.s3,
                        right: AppSpacing.s3,
                        child: Row(
                          children: [
                            if (widget.showFullscreenButton &&
                                widget.onFullscreen != null) ...[
                              _IconPill(
                                icon: Icons.fullscreen_rounded,
                                onTap: widget.onFullscreen!,
                              ),
                              const SizedBox(width: AppSpacing.s2),
                            ],
                            if (_logEligible) ...[
                              _TextPill(
                                label: 'LOG',
                                active: _logScale,
                                onTap: () =>
                                    setState(() => _logScale = !_logScale),
                              ),
                              const SizedBox(width: AppSpacing.s2),
                            ],
                            _IconPill(
                              icon: Icons.stacked_line_chart_rounded,
                              onTap: _pickCompareSymbol,
                            ),
                            const SizedBox(width: AppSpacing.s2),
                            _IconPill(
                              icon: Icons.restart_alt_rounded,
                              onTap: _resetZoom,
                            ),
                            if (widget.showSettingsButton) ...[
                              const SizedBox(width: AppSpacing.s2),
                              _IconPill(
                                icon: Icons.tune_rounded,
                                onTap: () =>
                                    IndicatorSettingsSheet.show(context),
                              ),
                            ],
                          ],
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
                if (showStoch)
                  SizedBox(
                    height: 110,
                    child: _buildStochSubpane(
                        c, _payload!.candles, prefs.stochastic),
                  ),
                if (showAtr)
                  SizedBox(
                    height: 90,
                    child: _buildAtrSubpane(c, _payload!.candles, prefs.atr),
                  ),
                if (showAdx)
                  SizedBox(
                    height: 110,
                    child: _buildAdxSubpane(c, _payload!.candles, prefs.adx),
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

  /// Price axis: logarithmic for long ranges when the user toggles LOG,
  /// numeric otherwise. Both auto-fit the visible window
  /// (anchorRangeToVisiblePoints is the Syncfusion default).
  ChartAxis _buildYAxis(AppPalette c, bool useLog, List<PlotBand> bands) {
    if (useLog) {
      return LogarithmicAxis(
        opposedPosition: true,
        majorGridLines: MajorGridLines(width: 0.5, color: c.border),
        axisLine: AxisLine(width: 0, color: c.border),
        labelStyle: AppTypography.xs.copyWith(color: c.textMuted),
        plotBands: bands,
      );
    }
    return NumericAxis(
      opposedPosition: true,
      majorGridLines: MajorGridLines(width: 0.5, color: c.border),
      axisLine: AxisLine(width: 0, color: c.border),
      labelStyle: AppTypography.xs.copyWith(color: c.textMuted),
      plotBands: bands,
    );
  }

  Future<void> _pickCompareSymbol() async {
    final c = context.colors;
    final ctrl = TextEditingController(text: _compareSymbol ?? '');
    const suggestions = ['SPY', 'QQQ', '^GSPC', 'GC=F', 'BTC-USD'];
    final result = await showDialog<String?>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: c.surface,
        shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(AppRadius.md)),
        title: Text('Compare with',
            style: AppTypography.headingSm.copyWith(color: c.textPrimary)),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            TextField(
              controller: ctrl,
              autofocus: true,
              textCapitalization: TextCapitalization.characters,
              style: AppTypography.md.copyWith(color: c.textPrimary),
              decoration: InputDecoration(
                hintText: 'Yahoo symbol, e.g. SPY',
                hintStyle: AppTypography.md.copyWith(color: c.textMuted),
              ),
              onSubmitted: (v) => Navigator.of(ctx).pop(v.trim()),
            ),
            const SizedBox(height: AppSpacing.s4),
            Wrap(
              spacing: AppSpacing.s2,
              children: [
                for (final s in suggestions)
                  ActionChip(
                    label: Text(s,
                        style: AppTypography.sm.copyWith(color: c.accent)),
                    backgroundColor: c.accentDim,
                    side: BorderSide(color: c.accent.withAlpha(60)),
                    onPressed: () => Navigator.of(ctx).pop(s),
                  ),
              ],
            ),
          ],
        ),
        actions: [
          if (_compareSymbol != null)
            TextButton(
              onPressed: () => Navigator.of(ctx).pop(''),
              child: Text('Remove',
                  style: AppTypography.labelMd.copyWith(color: c.danger)),
            ),
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(ctrl.text.trim()),
            child: Text('Compare',
                style: AppTypography.labelMd.copyWith(color: c.accent)),
          ),
        ],
      ),
    );
    if (result == null) return; // dismissed
    setState(() {
      _compareSymbol = result.isEmpty ? null : result.toUpperCase();
      _compareCandles = null;
    });
    _load();
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

    final pivotLevels = prefs.pivots.visible
        ? pivotPoints(candles,
            type: prefs.pivots.camarilla
                ? PivotType.camarilla
                : PivotType.classic)
        : const <PivotLevel>[];

    final signal = widget.signalLevels;
    // Trade markers snapped to the nearest visible candle; outside-range
    // trades are dropped (DateTimeCategoryAxis only renders category hits).
    final buyMarkers = <({DateTime t, double p})>[];
    final sellMarkers = <({DateTime t, double p})>[];
    final markers = widget.tradeMarkers;
    if (markers != null && candles.isNotEmpty) {
      final first = candles.first.time;
      final last = candles.last.time;
      for (final m in markers) {
        if (m.date.isBefore(first) || m.date.isAfter(last)) continue;
        var nearest = candles.first;
        var best = (m.date.difference(nearest.time)).abs();
        for (final c in candles) {
          final d = (m.date.difference(c.time)).abs();
          if (d < best) {
            best = d;
            nearest = c;
          }
        }
        (m.direction == 'BUY' ? buyMarkers : sellMarkers)
            .add((t: nearest.time, p: m.price));
      }
    }

    // Compare overlay: align the second symbol's closes to this chart's
    // candle slots (DateTimeCategoryAxis renders the union of x-values, so
    // unaligned timestamps would inject phantom slots), then rebase to the
    // main chart's first aligned close so both start from the same point.
    final comparePoints = <IndicatorPoint>[];
    final comp = _compareCandles;
    if (comp != null && comp.isNotEmpty && candles.length > 1) {
      final toleranceMs = (candles.last.time.millisecondsSinceEpoch -
              candles.first.time.millisecondsSinceEpoch) ~/
          (candles.length - 1);
      var j = 0;
      final aligned = <({DateTime t, double mainClose, double compClose})>[];
      for (final m in candles) {
        while (j + 1 < comp.length &&
            comp[j + 1].time.difference(m.time).abs() <=
                comp[j].time.difference(m.time).abs()) {
          j++;
        }
        if (comp[j].time.difference(m.time).abs().inMilliseconds <=
            toleranceMs) {
          aligned.add((t: m.time, mainClose: m.close, compClose: comp[j].close));
        }
      }
      if (aligned.length > 1) {
        final base = aligned.first.mainClose / aligned.first.compClose;
        for (final a in aligned) {
          comparePoints.add(IndicatorPoint(a.t, a.compClose * base));
        }
      }
    }

    final useLog = _logScale && _logEligible;
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
      primaryYAxis: _buildYAxis(c, useLog, <PlotBand>[
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
          for (final pl in pivotLevels)
            PlotBand(
              start: pl.price,
              end: pl.price,
              borderColor: prefs.pivots.color,
              borderWidth: pl.label == 'P' ? 1.2 : 0.8,
              dashArray: const <double>[2, 2],
              text: pl.label,
              horizontalTextAlignment: TextAnchor.start,
              verticalTextAlignment: TextAnchor.middle,
              textStyle: AppTypography.xs.copyWith(
                color: prefs.pivots.color,
                fontSize: 9,
                fontWeight: FontWeight.w600,
              ),
            ),
          if (signal != null) ...[
            PlotBand(
              start: signal.entry,
              end: signal.entry,
              borderColor: c.accent,
              borderWidth: 1.2,
              dashArray: const <double>[5, 3],
            ),
            PlotBand(
              start: signal.stopLoss,
              end: signal.stopLoss,
              borderColor: c.danger,
              borderWidth: 1.2,
              dashArray: const <double>[5, 3],
            ),
            PlotBand(
              start: signal.takeProfit,
              end: signal.takeProfit,
              borderColor: c.positive,
              borderWidth: 1.2,
              dashArray: const <double>[5, 3],
            ),
          ],
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
      // zoomMode.x → only the x-axis emits zoom events; mirror them onto the
      // sub-pane axes so all panes scroll/zoom as one chart.
      onZooming: (args) =>
          _applyXZoom(args.currentZoomFactor, args.currentZoomPosition),
      onZoomEnd: (args) =>
          _applyXZoom(args.currentZoomFactor, args.currentZoomPosition),
      onZoomReset: (_) => _applyXZoom(1.0, 0.0),
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
        if (signal != null) ...[
          _pricePill(lastIdx, signal.entry, c.accent, 'ENTRY'),
          _pricePill(lastIdx, signal.stopLoss, c.danger, 'SL'),
          _pricePill(lastIdx, signal.takeProfit, c.positive, 'TP'),
        ],
        if (comparePoints.isNotEmpty)
          _pricePill(lastIdx, comparePoints.last.value, c.textSecondary,
              _compareSymbol ?? ''),
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
        if (comparePoints.isNotEmpty)
          LineSeries<IndicatorPoint, DateTime>(
            name: _compareSymbol ?? 'Compare',
            dataSource: comparePoints,
            xValueMapper: (p, _) => p.time,
            yValueMapper: (p, _) => p.value,
            color: c.textSecondary,
            width: 1.6,
            dashArray: const <double>[6, 3],
            animationDuration: 0,
          ),
        if (buyMarkers.isNotEmpty)
          ScatterSeries<({DateTime t, double p}), DateTime>(
            name: 'Buys',
            dataSource: buyMarkers,
            xValueMapper: (m, _) => m.t,
            yValueMapper: (m, _) => m.p,
            color: c.positive,
            markerSettings: const MarkerSettings(
              shape: DataMarkerType.triangle,
              width: 10,
              height: 10,
            ),
            animationDuration: 0,
          ),
        if (sellMarkers.isNotEmpty)
          ScatterSeries<({DateTime t, double p}), DateTime>(
            name: 'Sells',
            dataSource: sellMarkers,
            xValueMapper: (m, _) => m.t,
            yValueMapper: (m, _) => m.p,
            color: c.danger,
            markerSettings: const MarkerSettings(
              shape: DataMarkerType.invertedTriangle,
              width: 10,
              height: 10,
            ),
            animationDuration: 0,
          ),
      ],
    );
  }

  /// Hidden x-axis for sub-panes, pre-seeded with the main chart's current
  /// zoom window and registered for live zoom/pan sync via its controller.
  DateTimeCategoryAxis _subpaneXAxis(bool isIntraday,
      ValueChanged<DateTimeCategoryAxisController> onCreated) {
    return DateTimeCategoryAxis(
      isVisible: false,
      majorGridLines: const MajorGridLines(width: 0),
      dateFormat: isIntraday ? DateFormat('HH:mm') : DateFormat('MMM d'),
      initialZoomFactor: _xZoomFactor,
      initialZoomPosition: _xZoomPosition,
      onRendererCreated: onCreated,
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
        primaryXAxis: _subpaneXAxis(isIntraday, (ctrl) => _rsiXCtrl = ctrl),
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
        primaryXAxis: _subpaneXAxis(isIntraday, (ctrl) => _macdXCtrl = ctrl),
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

  Widget _buildStochSubpane(
      AppPalette c, List<Candle> candles, StochasticConfig cfg) {
    final s = stochastic(candles,
        kPeriod: cfg.kPeriod, smooth: cfg.smooth, dPeriod: cfg.dPeriod);
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
        primaryXAxis: _subpaneXAxis(isIntraday, (ctrl) => _stochXCtrl = ctrl),
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
              text: cfg.overbought.toStringAsFixed(0),
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
              text: cfg.oversold.toStringAsFixed(0),
              horizontalTextAlignment: TextAnchor.end,
              verticalTextAlignment: TextAnchor.middle,
              textStyle: AppTypography.xs.copyWith(
                  color: _srSupport, fontSize: 9),
            ),
          ],
        ),
        series: <CartesianSeries<IndicatorPoint, DateTime>>[
          LineSeries<IndicatorPoint, DateTime>(
            name: '%K',
            dataSource: s.k,
            xValueMapper: (p, _) => p.time,
            yValueMapper: (p, _) => p.value,
            color: cfg.kColor,
            width: 1.4,
            animationDuration: 0,
          ),
          LineSeries<IndicatorPoint, DateTime>(
            name: '%D',
            dataSource: s.d,
            xValueMapper: (p, _) => p.time,
            yValueMapper: (p, _) => p.value,
            color: cfg.dColor,
            width: 1.4,
            animationDuration: 0,
          ),
        ],
        annotations: <CartesianChartAnnotation>[
          if (s.k.isNotEmpty)
            CartesianChartAnnotation(
              widget: _PricePill(
                value: s.k.last.value,
                color: cfg.kColor,
                label: 'STOCH',
              ),
              x: candles.length - 1,
              y: s.k.last.value,
              coordinateUnit: CoordinateUnit.point,
              region: AnnotationRegion.plotArea,
              horizontalAlignment: ChartAlignment.far,
              verticalAlignment: ChartAlignment.center,
            ),
        ],
      ),
    );
  }

  Widget _buildAtrSubpane(AppPalette c, List<Candle> candles, AtrConfig cfg) {
    final points = atr(candles, period: cfg.period);
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
        primaryXAxis: _subpaneXAxis(isIntraday, (ctrl) => _atrXCtrl = ctrl),
        primaryYAxis: NumericAxis(
          opposedPosition: true,
          axisLine: AxisLine(width: 0, color: c.border),
          majorGridLines: MajorGridLines(width: 0.5, color: c.border),
          labelStyle:
              AppTypography.xs.copyWith(color: c.textMuted, fontSize: 9),
        ),
        series: <CartesianSeries<IndicatorPoint, DateTime>>[
          LineSeries<IndicatorPoint, DateTime>(
            name: 'ATR',
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
                label: 'ATR${cfg.period}',
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

  Widget _buildAdxSubpane(AppPalette c, List<Candle> candles, AdxConfig cfg) {
    final a = adx(candles, period: cfg.period);
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
        primaryXAxis: _subpaneXAxis(isIntraday, (ctrl) => _adxXCtrl = ctrl),
        primaryYAxis: NumericAxis(
          opposedPosition: true,
          minimum: 0,
          axisLine: AxisLine(width: 0, color: c.border),
          majorGridLines: MajorGridLines(width: 0.5, color: c.border),
          labelStyle:
              AppTypography.xs.copyWith(color: c.textMuted, fontSize: 9),
          plotBands: <PlotBand>[
            // 25 = conventional "trending market" threshold.
            PlotBand(
              start: 25,
              end: 25,
              borderColor: c.border,
              borderWidth: 0.8,
            ),
          ],
        ),
        series: <CartesianSeries<IndicatorPoint, DateTime>>[
          LineSeries<IndicatorPoint, DateTime>(
            name: 'DI+',
            dataSource: a.plusDi,
            xValueMapper: (p, _) => p.time,
            yValueMapper: (p, _) => p.value,
            color: c.positive.withAlpha(0xAA),
            width: 1.0,
            animationDuration: 0,
          ),
          LineSeries<IndicatorPoint, DateTime>(
            name: 'DI-',
            dataSource: a.minusDi,
            xValueMapper: (p, _) => p.time,
            yValueMapper: (p, _) => p.value,
            color: c.danger.withAlpha(0xAA),
            width: 1.0,
            animationDuration: 0,
          ),
          LineSeries<IndicatorPoint, DateTime>(
            name: 'ADX',
            dataSource: a.adx,
            xValueMapper: (p, _) => p.time,
            yValueMapper: (p, _) => p.value,
            color: cfg.color,
            width: 1.6,
            animationDuration: 0,
          ),
        ],
        annotations: <CartesianChartAnnotation>[
          if (a.adx.isNotEmpty)
            CartesianChartAnnotation(
              widget: _PricePill(
                value: a.adx.last.value,
                color: cfg.color,
                label: 'ADX${cfg.period}',
              ),
              x: candles.length - 1,
              y: a.adx.last.value,
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

class _TextPill extends StatelessWidget {
  const _TextPill({
    required this.label,
    required this.active,
    required this.onTap,
  });
  final String label;
  final bool active;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Material(
      color: active ? c.accent : c.surfaceElevated.withAlpha(220),
      shape: const StadiumBorder(),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 9),
          child: Text(
            label,
            style: AppTypography.xs.copyWith(
              color: active ? c.background : c.textPrimary,
              fontWeight: FontWeight.w700,
              letterSpacing: 0.5,
            ),
          ),
        ),
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
