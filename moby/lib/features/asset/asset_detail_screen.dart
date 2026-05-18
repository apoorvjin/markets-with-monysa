import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:fl_chart/fl_chart.dart';
import 'package:webview_flutter/webview_flutter.dart';
import '../../core/network/api_client.dart';
import '../../core/network/api_endpoints.dart';
import '../../core/theme/app_palette.dart';
import '../../core/theme/app_typography.dart';
import '../../core/theme/app_spacing.dart';
import '../../data/models/trading_signal.dart';
import '../../data/repositories/trading_repository.dart';
import '../../providers/strategy_provider.dart';
import '../../shared/widgets/signal_badge.dart';
import '../../shared/widgets/glass_card.dart';
import '../../shared/widgets/error_view.dart';
import '../../shared/widgets/chart_modal.dart';
import '../../utils/tv_symbol.dart';
import '../../providers/watchlist_provider.dart';

// ── Providers ─────────────────────────────────────────────────────────────────

final _signalProvider = FutureProvider.autoDispose
    .family<TradingSignal, ({String symbol, String tf, String strategy})>(
  (ref, args) => TradingRepository.instance.fetchSignal(
    args.symbol,
    timeframe: args.tf,
    strategy: args.strategy,
  ),
);

final _backtestProvider = FutureProvider.autoDispose
    .family<List<BacktestResult>, String>(
  (ref, symbol) => TradingRepository.instance.fetchBacktest(symbol),
);

final _newsProvider = FutureProvider.autoDispose
    .family<List<NewsArticle>, String>(
  (ref, symbol) => TradingRepository.instance.fetchNews(symbol),
);

// ── Screen ────────────────────────────────────────────────────────────────────

class AssetDetailScreen extends StatefulWidget {
  const AssetDetailScreen({
    super.key,
    required this.symbol,
    required this.name,
  });

  final String symbol;
  final String name;

  @override
  State<AssetDetailScreen> createState() => _AssetDetailScreenState();
}

class _AssetDetailScreenState extends State<AssetDetailScreen>
    with SingleTickerProviderStateMixin {
  late final TabController _tab;
  String _timeframe = '1d';

  static const _tabs = ['Chart', 'Signal', 'Indicators', 'Backtest', 'News'];
  static const _timeframes = ['1m', '1h', '4h', '1d'];

  @override
  void initState() {
    super.initState();
    _tab = TabController(length: _tabs.length, vsync: this);
  }

  @override
  void dispose() {
    _tab.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Scaffold(
      backgroundColor: c.background,
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(widget.name,
                style: AppTypography.headingMd.copyWith(color: c.textPrimary),
                maxLines: 1,
                overflow: TextOverflow.ellipsis),
            Text(widget.symbol,
                style: AppTypography.sm.copyWith(color: c.textMuted)),
          ],
        ),
        backgroundColor: c.headerBg,
        actions: [
          // Watchlist star button
          Consumer(
            builder: (ctx, ref, _) {
              final watched = ref.watch(watchlistProvider).contains(widget.symbol);
              return IconButton(
                icon: Icon(
                  watched ? Icons.bookmark : Icons.bookmark_border,
                  color: watched ? c.accent : c.textMuted,
                ),
                tooltip: watched ? 'Remove from watchlist' : 'Add to watchlist',
                onPressed: () => ref.read(watchlistProvider.notifier).toggle(widget.symbol),
              );
            },
          ),
          // TradingView deep link
          IconButton(
            icon: Icon(Icons.open_in_browser_rounded, color: context.colors.textMuted, size: 20),
            tooltip: 'Open in TradingView',
            onPressed: () => TvSymbol.open(widget.symbol),
          ),
          // Timeframe selector
          PopupMenuButton<String>(
            initialValue: _timeframe,
            onSelected: (tf) => setState(() => _timeframe = tf),
            color: c.surface,
            icon: Container(
              padding:
                  const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              decoration: BoxDecoration(
                border: Border.all(color: c.border),
                borderRadius: BorderRadius.circular(AppRadius.xs),
              ),
              child: Text(_timeframe,
                  style: AppTypography.sm.copyWith(
                      color: c.accent, fontWeight: FontWeight.w600)),
            ),
            itemBuilder: (_) => _timeframes
                .map((tf) => PopupMenuItem(
                      value: tf,
                      child: Text(tf,
                          style: AppTypography.md.copyWith(
                              color: _timeframe == tf
                                  ? c.accent
                                  : c.textPrimary)),
                    ))
                .toList(),
          ),
          const SizedBox(width: AppSpacing.s3),
        ],
        bottom: TabBar(
          controller: _tab,
          tabs: _tabs.map((t) => Tab(text: t)).toList(),
          isScrollable: true,
          tabAlignment: TabAlignment.start,
        ),
      ),
      body: TabBarView(
        controller: _tab,
        children: [
          _ChartTab(symbol: widget.symbol, name: widget.name),
          _SignalTab(
              symbol: widget.symbol, name: widget.name, timeframe: _timeframe),
          _IndicatorsTab(
              symbol: widget.symbol, timeframe: _timeframe),
          _BacktestTab(symbol: widget.symbol),
          _NewsTab(symbol: widget.symbol),
        ],
      ),
    );
  }
}

// ── Chart Tab ─────────────────────────────────────────────────────────────────

class _ChartTab extends StatefulWidget {
  const _ChartTab({required this.symbol, required this.name});
  final String symbol;
  final String name;

  @override
  State<_ChartTab> createState() => _ChartTabState();
}

class _ChartTabState extends State<_ChartTab> {
  String _range = '1M';
  late final WebViewController _controller;
  bool _loading = true;
  String? _error;

  static const _ranges = ['1M', '3M', '6M', '1Y', '5Y'];
  static const _rangeMap = {
    '1M': '1mo',
    '3M': '3mo',
    '6M': '6mo',
    '1Y': '1y',
    '5Y': '5y',
  };

  @override
  void initState() {
    super.initState();
    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(const Color(0xFF0A0A0A));
    _loadChart();
  }

  Future<void> _loadChart() async {
    if (mounted) setState(() { _loading = true; _error = null; });
    try {
      final range = _rangeMap[_range] ?? '1mo';
      final data = await ApiClient.instance.get(
        ApiEndpoints.chart(widget.symbol),
        params: {'range': range},
      ) as Map<String, dynamic>;
      final candles = data['candles'] as List? ?? [];
      if (!mounted) return;
      await _controller.loadHtmlString(_buildHtml(jsonEncode(candles)));
    } catch (e) {
      if (mounted) setState(() => _error = 'Failed to load chart data');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  String _buildHtml(String candleJson) {
    return '''
<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { background:#0a0a0a; color:#fff; font-family:sans-serif; }
  #chart { width:100%; height:100vh; }
</style>
</head>
<body>
<div id="chart"></div>
<script src="https://unpkg.com/lightweight-charts@4.1.1/dist/lightweight-charts.standalone.production.js"></script>
<script>
const chart = LightweightCharts.createChart(document.getElementById('chart'), {
  layout: { background: { color: '#0a0a0a' }, textColor: '#adb5bd' },
  grid: { vertLines: { color: 'rgba(255,255,255,0.06)' }, horzLines: { color: 'rgba(255,255,255,0.06)' } },
  crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
  rightPriceScale: { borderColor: 'rgba(255,255,255,0.12)' },
  timeScale: { borderColor: 'rgba(255,255,255,0.12)', timeVisible: true },
  handleScroll: true,
  handleScale: true,
});

const candleSeries = chart.addCandlestickSeries({
  upColor: '#00D4AA', downColor: '#FF4D6A',
  borderUpColor: '#00D4AA', borderDownColor: '#FF4D6A',
  wickUpColor: '#00D4AA', wickDownColor: '#FF4D6A',
});

const volumeSeries = chart.addHistogramSeries({
  color: 'rgba(0,212,170,0.2)',
  priceFormat: { type: 'volume' },
  priceScaleId: '',
});

chart.priceScale('').applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });

const raw = $candleJson;
candleSeries.setData(raw.map(c => ({ time: c.time, open: c.open, high: c.high, low: c.low, close: c.close })));
volumeSeries.setData(raw.map(c => ({ time: c.time, value: c.volume || 0, color: c.close >= c.open ? 'rgba(0,212,170,0.3)' : 'rgba(255,77,106,0.3)' })));

// VWAP (Volume Weighted Average Price)
const vwapData = [];
let cumPV = 0, cumVol = 0;
for (const candle of raw) {
  const typical = (candle.high + candle.low + candle.close) / 3;
  cumPV += typical * (candle.volume || 0);
  cumVol += candle.volume || 0;
  if (cumVol > 0) vwapData.push({ time: candle.time, value: cumPV / cumVol });
}
if (vwapData.length > 0) {
  const vwapSeries = chart.addLineSeries({ color: '#FFB84D', lineWidth: 1.5, priceLineVisible: false, lastValueVisible: false });
  vwapSeries.setData(vwapData);
}

chart.timeScale().fitContent();

window.addEventListener('resize', () => chart.resize(window.innerWidth, window.innerHeight));
</script>
</body>
</html>
''';
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Column(
      children: [
        // Range selector row with fullscreen button
        Row(
          children: [
            Expanded(
              child: SizedBox(
                height: 40,
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: _ranges.map((r) {
                    final isActive = r == _range;
                    return GestureDetector(
                      onTap: () {
                        setState(() => _range = r);
                        _loadChart();
                      },
                      child: Container(
                        margin: const EdgeInsets.symmetric(horizontal: 4, vertical: 6),
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
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
              ),
            ),
            IconButton(
              icon: Icon(Icons.open_in_full, color: c.textMuted, size: 18),
              tooltip: 'Open fullscreen',
              onPressed: () =>
                  ChartModal.show(context, symbol: widget.symbol, name: widget.name),
            ),
          ],
        ),
        Divider(height: 1, color: c.border),
        Expanded(
          child: _loading
              ? Center(child: CircularProgressIndicator(color: c.accent))
              : _error != null
                  ? Center(
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(_error!,
                              style: AppTypography.md.copyWith(color: c.textMuted)),
                          const SizedBox(height: AppSpacing.s4),
                          FilledButton(
                            onPressed: _loadChart,
                            style: FilledButton.styleFrom(
                              backgroundColor: c.accent,
                              foregroundColor: c.background,
                            ),
                            child: const Text('Retry'),
                          ),
                        ],
                      ),
                    )
                  : WebViewWidget(controller: _controller),
        ),
      ],
    );
  }
}

// ── Signal Tab ────────────────────────────────────────────────────────────────

String _signalError(Object e) {
  final s = e.toString();
  if (s.startsWith('Exception: ')) return s.substring(11);
  if (s.contains('insufficient') || s.contains('Insufficient')) return 'Insufficient historical data for this symbol';
  if (s.contains('503')) return 'Signal unavailable — try a different symbol';
  return 'Failed to load signal';
}

class _SignalTab extends ConsumerWidget {
  const _SignalTab({
    required this.symbol,
    required this.name,
    required this.timeframe,
  });

  final String symbol;
  final String name;
  final String timeframe;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final strategy = ref.watch(strategyProvider);
    final args = (symbol: symbol, tf: timeframe, strategy: strategy.serverParam);
    final async = ref.watch(_signalProvider(args));

    return async.when(
      loading: () => Center(
          child: CircularProgressIndicator(color: c.accent)),
      error: (e, _) => ErrorView(
        message: _signalError(e),
        onRetry: () => ref.invalidate(_signalProvider(args)),
      ),
      data: (signal) => _SignalContent(signal: signal, strategy: strategy),
    );
  }
}

class _SignalContent extends StatelessWidget {
  const _SignalContent({required this.signal, required this.strategy});
  final TradingSignal signal;
  final TradingStrategy strategy;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final color = c.signalColor(signal.direction);

    return ListView(
      padding: const EdgeInsets.all(AppSpacing.s5),
      children: [
        GlassCard(
          child: Column(
            children: [
              Row(
                children: [
                  SignalBadge(direction: signal.direction),
                  const SizedBox(width: AppSpacing.s3),
                  Text(
                    '${signal.confidence.toInt()}% Confidence',
                    style: AppTypography.xl.copyWith(
                        color: color, fontWeight: FontWeight.w700),
                  ),
                  const Spacer(),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                    decoration: BoxDecoration(
                      color: c.accentDim,
                      borderRadius: BorderRadius.circular(AppRadius.full),
                    ),
                    child: Text(strategy.label,
                        style: AppTypography.sm.copyWith(
                            color: c.accent,
                            fontWeight: FontWeight.w700)),
                  ),
                ],
              ),
              const SizedBox(height: AppSpacing.s4),
              ClipRRect(
                borderRadius: BorderRadius.circular(4),
                child: LinearProgressIndicator(
                  value: signal.confidence / 100,
                  backgroundColor: c.border,
                  valueColor: AlwaysStoppedAnimation(color),
                  minHeight: 6,
                ),
              ),
              const SizedBox(height: AppSpacing.s5),
              Row(
                children: [
                  Expanded(
                    child: _KeyStat('Entry', _fmt(signal.entry),
                        c.textPrimary, c),
                  ),
                  Expanded(
                    child: _KeyStat(
                        'Stop Loss', _fmt(signal.stopLoss), c.danger, c),
                  ),
                  Expanded(
                    child: _KeyStat('Take Profit', _fmt(signal.takeProfit),
                        c.positive, c),
                  ),
                  Expanded(
                    child: _KeyStat('R:R',
                        signal.riskReward.toStringAsFixed(2), c.accent, c),
                  ),
                ],
              ),
              const SizedBox(height: AppSpacing.s4),
              Row(
                children: [
                  Icon(Icons.schedule_rounded, size: 12, color: c.textFaint),
                  const SizedBox(width: 4),
                  Text(
                    'Signal generated at ${_fmtTime(signal.generatedAt)}',
                    style: AppTypography.xs.copyWith(color: c.textFaint),
                  ),
                ],
              ),
            ],
          ),
        ),
        const SizedBox(height: AppSpacing.s5),
        Text('Analysis',
            style: AppTypography.headingSm.copyWith(color: c.textPrimary)),
        const SizedBox(height: AppSpacing.s3),
        ...signal.reasoning.map((r) => Padding(
              padding: const EdgeInsets.only(bottom: AppSpacing.s3),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    margin: const EdgeInsets.only(top: 5),
                    width: 6,
                    height: 6,
                    decoration: BoxDecoration(
                      color: color,
                      shape: BoxShape.circle,
                    ),
                  ),
                  const SizedBox(width: AppSpacing.s3),
                  Expanded(
                    child: Text(r,
                        style: AppTypography.lg.copyWith(
                            color: c.textSecondary, height: 1.5)),
                  ),
                ],
              ),
            )),
        const SizedBox(height: AppSpacing.s5),
        _MultiTfMatrix(symbol: signal.symbol, strategy: strategy.serverParam),
        const SizedBox(height: AppSpacing.s4),
        _PositionSizingCalculator(
          entry: signal.entry,
          stopLoss: signal.stopLoss,
          direction: signal.direction,
        ),
        const SizedBox(height: AppSpacing.s5),
        Text('Timeframe: ${signal.timeframe}',
            style: AppTypography.sm.copyWith(color: c.textMuted)),
      ],
    );
  }

  String _fmt(double v) {
    if (v > 1000) return v.toStringAsFixed(0);
    if (v < 1) return v.toStringAsFixed(4);
    return v.toStringAsFixed(2);
  }

  String _fmtTime(DateTime dt) {
    final h = dt.hour.toString().padLeft(2, '0');
    final m = dt.minute.toString().padLeft(2, '0');
    return '$h:$m';
  }
}

class _KeyStat extends StatelessWidget {
  const _KeyStat(this.label, this.value, this.color, this.palette);
  final String label;
  final String value;
  final Color color;
  final AppPalette palette;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Text(label,
            style: AppTypography.xs.copyWith(color: palette.textMuted, letterSpacing: 0.8)),
        const SizedBox(height: 3),
        Text(value,
            style: AppTypography.numericXl.copyWith(color: color)),
      ],
    );
  }
}

// ── Multi-Timeframe Matrix ────────────────────────────────────────────────────

class _MultiTfMatrix extends ConsumerWidget {
  const _MultiTfMatrix({required this.symbol, required this.strategy});
  final String symbol;
  final String strategy;

  static const _tfs = ['1m', '1h', '4h', '1d'];

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    return GlassCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Multi-Timeframe', style: AppTypography.labelMd.copyWith(color: c.textPrimary)),
          const SizedBox(height: 12),
          Row(
            children: _tfs.map((tf) {
              final async = ref.watch(_signalProvider((symbol: symbol, tf: tf, strategy: strategy)));
              return Expanded(
                child: Column(
                  children: [
                    Text(tf.toUpperCase(), style: AppTypography.xs.copyWith(color: c.textMuted)),
                    const SizedBox(height: 6),
                    async.when(
                      loading: () => SizedBox(
                        height: 28,
                        child: Center(
                          child: SizedBox(
                            width: 14,
                            height: 14,
                            child: CircularProgressIndicator(strokeWidth: 2, color: c.accent),
                          ),
                        ),
                      ),
                      error: (_, __) => Text('--', style: AppTypography.sm.copyWith(color: c.textMuted)),
                      data: (sig) {
                        final col = c.signalColor(sig.direction);
                        return Container(
                          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 4),
                          decoration: BoxDecoration(
                            color: col.withAlpha(30),
                            borderRadius: BorderRadius.circular(6),
                            border: Border.all(color: col.withAlpha(80)),
                          ),
                          child: Text(
                            sig.direction,
                            style: AppTypography.xs.copyWith(color: col, fontWeight: FontWeight.w700),
                            textAlign: TextAlign.center,
                          ),
                        );
                      },
                    ),
                  ],
                ),
              );
            }).toList(),
          ),
        ],
      ),
    );
  }
}

// ── Position Sizing Calculator ────────────────────────────────────────────────

class _PositionSizingCalculator extends StatefulWidget {
  const _PositionSizingCalculator({
    required this.entry,
    required this.stopLoss,
    required this.direction,
  });
  final double entry;
  final double stopLoss;
  final String direction;

  @override
  State<_PositionSizingCalculator> createState() => _PositionSizingCalculatorState();
}

class _PositionSizingCalculatorState extends State<_PositionSizingCalculator> {
  final _accountCtrl = TextEditingController(text: '10000');
  double _riskPct = 1.0;

  @override
  void dispose() {
    _accountCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final accountSize = double.tryParse(_accountCtrl.text.replaceAll(',', '')) ?? 10000;
    final dollarRisk = accountSize * (_riskPct / 100);
    final riskPerUnit = (widget.entry - widget.stopLoss).abs();
    final units = riskPerUnit > 0 ? dollarRisk / riskPerUnit : 0;

    return GlassCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Position Sizing', style: AppTypography.labelMd.copyWith(color: c.textPrimary)),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Account Size (\$)', style: AppTypography.xs.copyWith(color: c.textMuted)),
                    const SizedBox(height: 4),
                    TextField(
                      controller: _accountCtrl,
                      keyboardType: TextInputType.number,
                      style: AppTypography.sm.copyWith(color: c.textPrimary),
                      decoration: InputDecoration(
                        isDense: true,
                        contentPadding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
                        filled: true,
                        fillColor: c.surface,
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(8),
                          borderSide: BorderSide(color: c.border),
                        ),
                        enabledBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(8),
                          borderSide: BorderSide(color: c.border),
                        ),
                      ),
                      onChanged: (_) => setState(() {}),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Risk: ${_riskPct.toStringAsFixed(1)}%', style: AppTypography.xs.copyWith(color: c.textMuted)),
                    Slider(
                      value: _riskPct,
                      min: 0.5,
                      max: 5.0,
                      divisions: 9,
                      activeColor: c.accent,
                      inactiveColor: c.border,
                      onChanged: (v) => setState(() => _riskPct = v),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              _CalcStat(label: 'Dollar Risk', value: '\$${dollarRisk.toStringAsFixed(0)}', palette: c),
              const SizedBox(width: 16),
              _CalcStat(label: 'Units / Shares', value: units.toStringAsFixed(2), palette: c),
              const SizedBox(width: 16),
              _CalcStat(label: 'Risk/Unit', value: '\$${riskPerUnit.toStringAsFixed(4)}', palette: c),
            ],
          ),
        ],
      ),
    );
  }
}

class _CalcStat extends StatelessWidget {
  const _CalcStat({required this.label, required this.value, required this.palette});
  final String label;
  final String value;
  final AppPalette palette;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: AppTypography.xs.copyWith(color: palette.textMuted)),
        Text(value, style: AppTypography.labelMd.copyWith(color: palette.textPrimary)),
      ],
    );
  }
}

// ── Indicators Tab ────────────────────────────────────────────────────────────

class _IndicatorsTab extends ConsumerWidget {
  const _IndicatorsTab({required this.symbol, required this.timeframe});
  final String symbol;
  final String timeframe;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final strategy = ref.watch(strategyProvider);
    final args = (symbol: symbol, tf: timeframe, strategy: strategy.serverParam);
    final async = ref.watch(_signalProvider(args));

    return async.when(
      loading: () => Center(
          child: CircularProgressIndicator(color: c.accent)),
      error: (_, __) =>
          const ErrorView(message: 'Failed to load indicators'),
      data: (signal) {
        final inds = signal.indicators;
        return ListView(
          padding: const EdgeInsets.all(AppSpacing.s5),
          children: [
            _IndicatorGroup('Momentum', [
              _IndRow('RSI-14', inds['rsi'], _rsiInterp),
              _IndRow('MACD', inds['macd'], _macdInterp),
              _IndRow('ROC', inds['roc'], _rocInterp),
            ]),
            const SizedBox(height: AppSpacing.s4),
            _IndicatorGroup('Trend', [
              _IndRow('EMA-12', inds['ema12'], (_) => 'Short-term trend'),
              _IndRow('EMA-26', inds['ema26'], (_) => 'Medium-term trend'),
              _IndRow('EMA-50', inds['ema50'], (_) => 'Medium-term trend'),
              _IndRow('EMA-200', inds['ema200'], (_) => 'Long-term trend'),
            ]),
            const SizedBox(height: AppSpacing.s4),
            _IndicatorGroup('Volatility', [
              _IndRow('Bollinger Upper', inds['bbUpper'], (_) => 'Upper band'),
              _IndRow('Bollinger Lower', inds['bbLower'], (_) => 'Lower band'),
              _IndRow('ATR', inds['atr'], (_) => 'Average True Range'),
            ]),
            const SizedBox(height: AppSpacing.s4),
            _IndicatorGroup('Regime (S4)', [
              _IndRow('ADX-14', inds['adx'], _adxInterp),
              _IndRow('BB Width', inds['bbWidth'], _bbWidthInterp),
            ]),
          ],
        );
      },
    );
  }

  String _rsiInterp(double? v) {
    if (v == null) return '--';
    if (v > 70) return 'Overbought';
    if (v < 30) return 'Oversold';
    return 'Neutral';
  }

  String _macdInterp(double? v) {
    if (v == null) return '--';
    if (v > 0) return 'Bullish';
    return 'Bearish';
  }

  String _rocInterp(double? v) {
    if (v == null) return '--';
    if (v > 0) return 'Positive momentum';
    return 'Negative momentum';
  }

  String _adxInterp(double? v) {
    if (v == null) return '--';
    if (v > 25) return 'Trending';
    if (v < 18) return 'Ranging';
    return 'Transitioning';
  }

  String _bbWidthInterp(double? v) {
    if (v == null) return '--';
    if (v > 0.07) return 'Expanding';
    if (v < 0.04) return 'Contracting';
    return 'Neutral';
  }
}

class _IndicatorGroup extends StatelessWidget {
  const _IndicatorGroup(this.title, this.rows);
  final String title;
  final List<_IndRow> rows;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(title.toUpperCase(),
            style: AppTypography.labelSm.copyWith(
                color: c.textMuted, letterSpacing: 1.2)),
        const SizedBox(height: AppSpacing.s2),
        Container(
          decoration: BoxDecoration(
            color: c.surfaceCard,
            borderRadius: BorderRadius.circular(AppRadius.md),
            border: Border.all(color: c.border),
          ),
          child: Column(
            children: rows
                .map((r) => _IndicatorRow(row: r))
                .toList(),
          ),
        ),
      ],
    );
  }
}

class _IndRow {
  const _IndRow(this.label, this.value, this.interpret);
  final String label;
  final double? value;
  final String Function(double?) interpret;
}

class _IndicatorRow extends StatelessWidget {
  const _IndicatorRow({required this.row});
  final _IndRow row;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final interp = row.interpret(row.value);
    final isBull = interp.toLowerCase().contains('bull') ||
        interp.toLowerCase().contains('neutral') ||
        interp.toLowerCase().contains('positive');
    final color = row.value == null
        ? c.textMuted
        : isBull
            ? c.positive
            : c.danger;

    return Container(
      padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.s4, vertical: AppSpacing.s3),
      decoration: BoxDecoration(
          border: Border(bottom: BorderSide(color: c.border, width: 0.5))),
      child: Row(
        children: [
          Expanded(
            child: Text(row.label,
                style: AppTypography.labelMd.copyWith(color: c.textPrimary)),
          ),
          Text(
            row.value == null ? '--' : row.value!.toStringAsFixed(2),
            style: AppTypography.numericLg.copyWith(color: c.textPrimary),
          ),
          const SizedBox(width: AppSpacing.s3),
          SizedBox(
            width: 80,
            child: Text(
              interp,
              style: AppTypography.xs.copyWith(color: color),
              textAlign: TextAlign.end,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ),
        ],
      ),
    );
  }
}

// ── Backtest Tab ──────────────────────────────────────────────────────────────

class _BacktestTab extends ConsumerWidget {
  const _BacktestTab({required this.symbol});
  final String symbol;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final async = ref.watch(_backtestProvider(symbol));

    return async.when(
      loading: () => Center(
          child: CircularProgressIndicator(color: c.accent)),
      error: (e, _) => ErrorView(
        message: e.toString().contains('Unknown symbol')
            ? 'Symbol not available for backtesting'
            : 'Backtest data unavailable',
        onRetry: () => ref.invalidate(_backtestProvider(symbol)),
      ),
      data: (results) => ListView(
        padding: const EdgeInsets.all(AppSpacing.s5),
        children: [
          Text('Walk-Forward Backtest',
              style: AppTypography.headingSm.copyWith(color: c.textPrimary)),
          const SizedBox(height: AppSpacing.s2),
          Text(
            '70% train / 30% test split — 5-bar hold period',
            style: AppTypography.md.copyWith(color: c.textMuted),
          ),
          const SizedBox(height: AppSpacing.s5),
          ...results.map((r) => _BacktestCard(result: r)),
        ],
      ),
    );
  }
}

class _BacktestCard extends StatefulWidget {
  const _BacktestCard({required this.result});
  final BacktestResult result;

  @override
  State<_BacktestCard> createState() => _BacktestCardState();
}

class _BacktestCardState extends State<_BacktestCard> {
  bool _expanded = false;

  BacktestResult get r => widget.result;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final returnColor = r.totalReturn >= 0 ? c.positive : c.danger;
    final winColor = r.winRate >= 50 ? c.positive : c.danger;

    return Container(
      margin: const EdgeInsets.only(bottom: AppSpacing.s4),
      decoration: BoxDecoration(
        color: c.surfaceCard,
        borderRadius: BorderRadius.circular(AppRadius.md),
        border: Border.all(color: c.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.all(AppSpacing.s4),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Header
                Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                      decoration: BoxDecoration(
                        color: c.accentDim,
                        borderRadius: BorderRadius.circular(AppRadius.full),
                      ),
                      child: Text(r.strategy,
                          style: AppTypography.labelMd.copyWith(color: c.accent)),
                    ),
                    const Spacer(),
                    Text(
                      '${r.totalReturn >= 0 ? '+' : ''}${r.totalReturn.toStringAsFixed(1)}%',
                      style: AppTypography.xl.copyWith(
                          color: returnColor, fontWeight: FontWeight.w700),
                    ),
                  ],
                ),
                const SizedBox(height: AppSpacing.s4),
                // Stats row
                Row(
                  children: [
                    Expanded(
                      child: _BacktestStat('Win Rate',
                          '${r.winRate.toStringAsFixed(0)}%', winColor, c),
                    ),
                    Expanded(
                      child: _BacktestStat('Max DD',
                          '-${r.maxDrawdown.toStringAsFixed(1)}%', c.danger, c),
                    ),
                    Expanded(
                      child: _BacktestStat('Sharpe',
                          r.sharpeRatio.toStringAsFixed(2), c.accent, c),
                    ),
                    Expanded(
                      child: _BacktestStat('Trades',
                          r.totalTrades.toString(), c.textSecondary, c),
                    ),
                  ],
                ),
                const SizedBox(height: AppSpacing.s3),
                // Win-rate progress bar
                ClipRRect(
                  borderRadius: BorderRadius.circular(4),
                  child: LinearProgressIndicator(
                    value: r.winRate / 100,
                    backgroundColor: c.dangerDim,
                    valueColor: AlwaysStoppedAnimation(winColor),
                    minHeight: 6,
                  ),
                ),
                const SizedBox(height: AppSpacing.s2),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      '${r.winRate.toStringAsFixed(0)}% wins',
                      style: AppTypography.xs.copyWith(color: c.textMuted),
                    ),
                    Text(
                      '${(100 - r.winRate).toStringAsFixed(0)}% losses',
                      style: AppTypography.xs.copyWith(color: c.textMuted),
                    ),
                  ],
                ),
              ],
            ),
          ),
          if (r.tradeLog.isNotEmpty) ...[
            Divider(height: 1, color: c.border),
            // Equity curve
            Builder(builder: (context) {
              double cum = 0;
              final spots = r.tradeLog.map((t) {
                cum += t.returnPct;
                return FlSpot(t.n.toDouble(), cum);
              }).toList();
              if (spots.length >= 2) {
                final finalCum = spots.last.y;
                final lineColor = finalCum >= 0 ? c.accent : c.danger;
                return Padding(
                  padding: const EdgeInsets.fromLTRB(
                      AppSpacing.s4, AppSpacing.s3, AppSpacing.s4, 0),
                  child: Semantics(
                    label: 'Equity curve — shows cumulative P&L across backtest trades',
                    excludeSemantics: true,
                    child: SizedBox(
                    height: 120,
                    child: LineChart(
                      LineChartData(
                        gridData: const FlGridData(show: false),
                        titlesData: const FlTitlesData(show: false),
                        borderData: FlBorderData(show: false),
                        lineBarsData: [
                          LineChartBarData(
                            spots: spots,
                            isCurved: true,
                            color: lineColor,
                            barWidth: 2,
                            dotData: const FlDotData(show: false),
                            belowBarData: BarAreaData(
                              show: true,
                              color: lineColor.withAlpha(51),
                            ),
                          ),
                        ],
                      ),
                    ),
                    ),
                  ),
                );
              }
              return const SizedBox.shrink();
            }),
            InkWell(
              onTap: () => setState(() => _expanded = !_expanded),
              child: Padding(
                padding: const EdgeInsets.symmetric(
                    horizontal: AppSpacing.s4, vertical: AppSpacing.s3),
                child: Row(
                  children: [
                    Text(
                      'Trade Log (${r.tradeLog.length})',
                      style: AppTypography.sm.copyWith(color: c.textSecondary),
                    ),
                    const Spacer(),
                    Icon(
                      _expanded ? Icons.expand_less : Icons.expand_more,
                      color: c.textMuted,
                      size: 18,
                    ),
                  ],
                ),
              ),
            ),
            if (_expanded) _TradeLogTable(trades: r.tradeLog),
          ],
        ],
      ),
    );
  }
}

class _BacktestStat extends StatelessWidget {
  const _BacktestStat(this.label, this.value, this.color, this.palette);
  final String label;
  final String value;
  final Color color;
  final AppPalette palette;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Text(label,
            style: AppTypography.xs.copyWith(color: palette.textMuted)),
        const SizedBox(height: 2),
        Text(value,
            style: AppTypography.labelMd
                .copyWith(color: color, fontWeight: FontWeight.w700)),
      ],
    );
  }
}

class _TradeLogTable extends StatelessWidget {
  const _TradeLogTable({required this.trades});
  final List<TradeRecord> trades;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Column(
      children: [
        // Column headers
        Container(
          padding: const EdgeInsets.symmetric(
              horizontal: AppSpacing.s4, vertical: AppSpacing.s2),
          color: c.surface,
          child: Row(
            children: [
              SizedBox(
                  width: 24,
                  child: Text('#',
                      style: AppTypography.xs
                          .copyWith(color: c.textMuted))),
              SizedBox(
                  width: 44,
                  child: Text('Dir',
                      style: AppTypography.xs
                          .copyWith(color: c.textMuted))),
              Expanded(
                  child: Text('Entry',
                      style: AppTypography.xs
                          .copyWith(color: c.textMuted))),
              Expanded(
                  child: Text('Exit',
                      style: AppTypography.xs
                          .copyWith(color: c.textMuted))),
              SizedBox(
                  width: 64,
                  child: Text('Return',
                      style: AppTypography.xs
                          .copyWith(color: c.textMuted),
                      textAlign: TextAlign.end)),
            ],
          ),
        ),
        Divider(height: 1, color: c.border),
        ...trades.map((t) => _TradeRow(trade: t)),
        const SizedBox(height: AppSpacing.s2),
      ],
    );
  }
}

class _TradeRow extends StatelessWidget {
  const _TradeRow({required this.trade});
  final TradeRecord trade;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final isBuy = trade.direction == 'BUY';
    final returnColor = trade.win ? c.positive : c.danger;
    final dirColor = isBuy ? c.positive : c.danger;

    return Container(
      padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.s4, vertical: 5),
      decoration: BoxDecoration(
        color: trade.win
            ? c.positiveDim.withAlpha(40)
            : c.dangerDim.withAlpha(40),
        border: Border(
            bottom: BorderSide(color: c.border.withAlpha(60))),
      ),
      child: Row(
        children: [
          SizedBox(
            width: 24,
            child: Text('${trade.n}',
                style: AppTypography.xs
                    .copyWith(color: c.textMuted)),
          ),
          SizedBox(
            width: 44,
            child: Container(
              padding:
                  const EdgeInsets.symmetric(horizontal: 4, vertical: 1),
              decoration: BoxDecoration(
                color: dirColor.withAlpha(30),
                borderRadius: BorderRadius.circular(3),
              ),
              child: Text(
                trade.direction,
                style: AppTypography.xs.copyWith(
                    color: dirColor, fontWeight: FontWeight.w700),
              ),
            ),
          ),
          Expanded(
            child: Text(
              trade.entryPrice < 10
                  ? trade.entryPrice.toStringAsFixed(4)
                  : trade.entryPrice.toStringAsFixed(2),
              style: AppTypography.xs
                  .copyWith(color: c.textSecondary),
            ),
          ),
          Expanded(
            child: Text(
              trade.exitPrice < 10
                  ? trade.exitPrice.toStringAsFixed(4)
                  : trade.exitPrice.toStringAsFixed(2),
              style: AppTypography.xs
                  .copyWith(color: c.textSecondary),
            ),
          ),
          SizedBox(
            width: 64,
            child: Text(
              '${trade.returnPct >= 0 ? '+' : ''}${trade.returnPct.toStringAsFixed(2)}%',
              style: AppTypography.xs.copyWith(
                  color: returnColor, fontWeight: FontWeight.w600),
              textAlign: TextAlign.end,
            ),
          ),
        ],
      ),
    );
  }
}

// ── News Tab ──────────────────────────────────────────────────────────────────

class _NewsTab extends ConsumerWidget {
  const _NewsTab({required this.symbol});
  final String symbol;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final async = ref.watch(_newsProvider(symbol));

    return async.when(
      loading: () => Center(
          child: CircularProgressIndicator(color: c.accent)),
      error: (_, __) =>
          const ErrorView(message: 'News unavailable'),
      data: (articles) => ListView.builder(
        padding: const EdgeInsets.all(AppSpacing.s5),
        itemCount: articles.length,
        itemBuilder: (ctx, i) => _NewsCard(article: articles[i]),
      ),
    );
  }
}

class _NewsCard extends StatelessWidget {
  const _NewsCard({required this.article});
  final NewsArticle article;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;

    Color sentimentColor(double? s) {
      if (s == null) return c.textMuted;
      if (s > 20) return c.positive;
      if (s < -20) return c.danger;
      return c.warning;
    }

    final sentiment = article.sentiment;
    final sentColor = sentimentColor(sentiment);

    return Container(
      margin: const EdgeInsets.only(bottom: AppSpacing.s3),
      padding: const EdgeInsets.all(AppSpacing.s4),
      decoration: BoxDecoration(
        color: c.surfaceCard,
        borderRadius: BorderRadius.circular(AppRadius.md),
        border: Border.all(color: c.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(article.publisher,
                    style: AppTypography.sm.copyWith(
                        color: c.accent, fontWeight: FontWeight.w600)),
              ),
              if (sentiment != null)
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                  decoration: BoxDecoration(
                    color: sentColor.withAlpha(30),
                    borderRadius: BorderRadius.circular(AppRadius.full),
                  ),
                  child: Text(
                    '${sentiment > 0 ? '+' : ''}${sentiment.toStringAsFixed(0)}',
                    style: AppTypography.xs.copyWith(
                        color: sentColor, fontWeight: FontWeight.w700),
                  ),
                ),
            ],
          ),
          const SizedBox(height: AppSpacing.s2),
          Text(article.title,
              style: AppTypography.labelMd.copyWith(
                  color: c.textPrimary, height: 1.4)),
          if (article.publishedAt != null) ...[
            const SizedBox(height: AppSpacing.s2),
            Text(article.publishedAt!,
                style: AppTypography.xs.copyWith(color: c.textMuted)),
          ],
        ],
      ),
    );
  }
}
