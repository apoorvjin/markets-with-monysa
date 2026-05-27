import 'dart:async';
import 'dart:convert';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
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
import '../../providers/chart_provider_provider.dart';
import '../../providers/watchlist_provider.dart';
import '../../services/entitlement_service.dart';
import '../../shared/widgets/upgrade_sheet.dart';

// ── Providers ─────────────────────────────────────────────────────────────────

final _signalProvider = FutureProvider.autoDispose
    .family<TradingSignal, ({String symbol, String tf, String strategy})>(
  (ref, args) {
    final cancelToken = CancelToken();
    ref.onDispose(cancelToken.cancel);
    return TradingRepository.instance.fetchSignal(
      args.symbol,
      timeframe: args.tf,
      strategy: args.strategy,
      cancelToken: cancelToken,
    );
  },
);

final _backtestProvider = FutureProvider.autoDispose
    .family<List<BacktestResult>, String>(
  (ref, symbol) => TradingRepository.instance.fetchBacktest(symbol),
);

final _newsProvider = FutureProvider.autoDispose
    .family<List<NewsArticle>, String>(
  (ref, symbol) => TradingRepository.instance.fetchNews(symbol),
);

final _noteProvider = FutureProvider.autoDispose
    .family<String?, ({String symbol, String strategy, String direction, double confidence})>(
  (ref, args) => TradingRepository.instance.fetchAnalystNote(
    args.symbol,
    strategy: args.strategy,
    direction: args.direction,
    confidence: args.confidence,
  ),
);

final _fundamentalsProvider = FutureProvider.autoDispose
    .family<Map<String, dynamic>?, String>(
  (ref, symbol) async {
    try {
      final data = await ApiClient.instance.get(
        ApiEndpoints.tradingFundamentals(symbol),
      );
      return data as Map<String, dynamic>;
    } catch (_) {
      return null;
    }
  },
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

class _ChartTab extends ConsumerStatefulWidget {
  const _ChartTab({required this.symbol, required this.name});
  final String symbol;
  final String name;

  @override
  ConsumerState<_ChartTab> createState() => _ChartTabState();
}

class _ChartTabState extends ConsumerState<_ChartTab> {
  String _range = '1M';
  late final WebViewController _controller;
  bool _loading = true;
  String? _error;
  Timer? _timeoutTimer;
  bool? _isDark;

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
      ..setJavaScriptMode(JavaScriptMode.unrestricted);
    // _loadChart() is deferred to didChangeDependencies so theme is available
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final isDark = Theme.of(context).brightness == Brightness.dark;
    if (_isDark != isDark) {
      _isDark = isDark;
      _controller.setBackgroundColor(
          isDark ? const Color(0xFF0A0A0A) : Colors.white);
      _loadChart();
    }
  }

  @override
  void dispose() {
    _timeoutTimer?.cancel();
    super.dispose();
  }

  Future<void> _loadChart() async {
    _timeoutTimer?.cancel();
    if (mounted) setState(() { _loading = true; _error = null; });
    _timeoutTimer = Timer(const Duration(seconds: 10), () {
      if (mounted && _loading) {
        setState(() {
          _loading = false;
          _error = 'Chart timed out — tap to retry';
        });
      }
    });
    try {
      final range = _rangeMap[_range] ?? '1mo';
      // Resolve TV symbol for watermark label when TradingView provider is active
      final provider = ref.read(chartProviderProvider);
      final tvLabel = provider == ChartDataProvider.tradingView
          ? TvSymbol.resolveForTv(widget.symbol)
          : null;
      final data = await ApiClient.instance.get(
        ApiEndpoints.chart(widget.symbol),
        params: {'range': range},
      ) as Map<String, dynamic>;
      final candles = data['candles'] as List? ?? [];
      if (!mounted) return;
      _timeoutTimer?.cancel();
      await _controller.loadHtmlString(
          _buildHtml(jsonEncode(candles), _isDark ?? false, tvLabel: tvLabel));
    } catch (e) {
      _timeoutTimer?.cancel();
      if (mounted) setState(() => _error = 'Failed to load chart data');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  String _buildHtml(String candleJson, bool isDark, {String? tvLabel}) {
    final bg          = isDark ? '#0a0a0a' : '#ffffff';
    final textColor   = isDark ? '#adb5bd'  : '#374151';
    final gridColor   = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
    final borderColor = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)';
    final upColor     = isDark ? '#00D4AA' : '#00C49A';
    final downColor   = isDark ? '#FF4D6A' : '#E8384F';
    final upVol       = isDark ? 'rgba(0,212,170,0.3)'  : 'rgba(0,196,154,0.3)';
    final downVol     = isDark ? 'rgba(255,77,106,0.3)' : 'rgba(232,56,79,0.3)';
    final vwapColor   = isDark ? '#FFB84D' : '#E6952A';
    final wmColor     = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)';
    // Watermark: shows TV symbol identifier (e.g. FX:EURUSD) when TV provider is active
    final watermarkJs = tvLabel != null
        ? "chart.applyOptions({ watermark: { color: '$wmColor', visible: true, text: '$tvLabel', fontSize: 18, horzAlign: 'center', vertAlign: 'center' } });"
        : '';

    return '''
<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { background:$bg; color:$textColor; font-family:sans-serif; }
  #chart { width:100%; height:100vh; }
</style>
</head>
<body>
<div id="chart"></div>
<script src="https://unpkg.com/lightweight-charts@4.1.1/dist/lightweight-charts.standalone.production.js"></script>
<script>
const chart = LightweightCharts.createChart(document.getElementById('chart'), {
  layout: { background: { color: '$bg' }, textColor: '$textColor' },
  grid: { vertLines: { color: '$gridColor' }, horzLines: { color: '$gridColor' } },
  crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
  rightPriceScale: { borderColor: '$borderColor' },
  timeScale: { borderColor: '$borderColor', timeVisible: true },
  handleScroll: true,
  handleScale: true,
});

const candleSeries = chart.addCandlestickSeries({
  upColor: '$upColor', downColor: '$downColor',
  borderUpColor: '$upColor', borderDownColor: '$downColor',
  wickUpColor: '$upColor', wickDownColor: '$downColor',
});

const volumeSeries = chart.addHistogramSeries({
  color: '$upVol',
  priceFormat: { type: 'volume' },
  priceScaleId: '',
});

chart.priceScale('').applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });

const raw = $candleJson;
candleSeries.setData(raw.map(c => ({ time: c.time, open: c.open, high: c.high, low: c.low, close: c.close })));
volumeSeries.setData(raw.map(c => ({ time: c.time, value: c.volume || 0, color: c.close >= c.open ? '$upVol' : '$downVol' })));

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
  const vwapSeries = chart.addLineSeries({ color: '$vwapColor', lineWidth: 1.5, priceLineVisible: false, lastValueVisible: false });
  vwapSeries.setData(vwapData);
}

$watermarkJs
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
        // Toolbar row: range chips + fullscreen button (always visible)
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

class _SignalTab extends ConsumerStatefulWidget {
  const _SignalTab({
    required this.symbol,
    required this.name,
    required this.timeframe,
  });

  final String symbol;
  final String name;
  final String timeframe;

  @override
  ConsumerState<_SignalTab> createState() => _SignalTabState();
}

class _SignalTabState extends ConsumerState<_SignalTab> {
  TradingStrategy? _localStrategy;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final globalStrategy = ref.watch(strategyProvider);
    final strategy = _localStrategy ?? globalStrategy;
    final args = (symbol: widget.symbol, tf: widget.timeframe, strategy: strategy.serverParam);
    final async = ref.watch(_signalProvider(args));

    return Column(
      children: [
        _StrategyPillRow(
          selected: strategy,
          onSelect: (s) => setState(() => _localStrategy = s),
        ),
        Expanded(
          child: async.when(
            loading: () => Center(
                child: CircularProgressIndicator(color: c.accent)),
            error: (e, _) => ErrorView(
              message: _signalError(e),
              onRetry: () => ref.invalidate(_signalProvider(args)),
            ),
            data: (signal) => _SignalContent(signal: signal, strategy: strategy),
          ),
        ),
      ],
    );
  }
}

class _StrategyPillRow extends StatelessWidget {
  const _StrategyPillRow({required this.selected, required this.onSelect});
  final TradingStrategy selected;
  final ValueChanged<TradingStrategy> onSelect;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final all = TradingStrategy.values;

    Widget chip(TradingStrategy s) {
      const silver = Color(0xFFC0C0C0);
      final isActive = s == selected;
      final isS9 = s == TradingStrategy.s9;
      final isAdvanced = int.parse(s.serverParam) >= 4;
      final isLocked = isAdvanced && !EntitlementService.can('signals_advanced');
      final chipColor = isS9 ? Color.lerp(c.accent, silver, 0.5)! : c.accent;
      final chipBg = isS9
          ? Color.lerp(c.accentDim, silver.withAlpha(30), 0.5)!
          : c.accentDim;

      return GestureDetector(
        onTap: () {
          if (isLocked) {
            UpgradeSheet.show(context, feature: 'signals_advanced');
          } else {
            onSelect(s);
          }
        },
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 5),
          decoration: BoxDecoration(
            color: isActive ? chipBg : Colors.transparent,
            borderRadius: BorderRadius.circular(AppRadius.full),
            border: Border.all(
              color: isActive
                  ? chipColor
                  : isLocked
                      ? c.border.withAlpha(120)
                      : c.border,
            ),
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              if (isLocked) ...[
                Icon(Icons.lock_rounded,
                    size: 9, color: c.textMuted.withAlpha(160)),
                const SizedBox(width: 3),
              ],
              Text(
                s.label,
                style: AppTypography.sm.copyWith(
                  color: isLocked
                      ? c.textMuted.withAlpha(160)
                      : isActive
                          ? chipColor
                          : c.textSecondary,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
        ),
      );
    }

    Row buildRow(List<TradingStrategy> row) {
      final items = <Widget>[];
      for (int i = 0; i < row.length; i++) {
        items.add(Expanded(child: chip(row[i])));
        if (i < row.length - 1) items.add(const SizedBox(width: 5));
      }
      return Row(children: items);
    }

    return Container(
      padding: const EdgeInsets.fromLTRB(
          AppSpacing.s4, AppSpacing.s3, AppSpacing.s4, AppSpacing.s3),
      decoration: BoxDecoration(
        border: Border(bottom: BorderSide(color: c.border, width: 0.5)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text('Strategy',
                  style: AppTypography.sm.copyWith(color: c.textMuted)),
              const SizedBox(width: AppSpacing.s2),
              GestureDetector(
                onTap: () => _showStrategyInfoModal(context),
                child: Icon(Icons.info_outline_rounded,
                    size: 14, color: c.textMuted),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.s2),
          buildRow(all.sublist(0, 4)),
          const SizedBox(height: 5),
          buildRow(all.sublist(4, 8)),
          const SizedBox(height: 5),
          Row(
            children: [
              Expanded(child: chip(all[8])),
              const SizedBox(width: 5),
              const Expanded(child: SizedBox()),
              const SizedBox(width: 5),
              const Expanded(child: SizedBox()),
              const SizedBox(width: 5),
              const Expanded(child: SizedBox()),
            ],
          ),
        ],
      ),
    );
  }
}

void _showStrategyInfoModal(BuildContext context) {
  final c = context.colors;
  showModalBottomSheet(
    context: context,
    backgroundColor: c.surface,
    isScrollControlled: true,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (_) => DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.75,
      minChildSize: 0.4,
      maxChildSize: 0.92,
      builder: (ctx, scrollController) => Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(
                AppSpacing.s5, AppSpacing.s5, AppSpacing.s5, 0),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Center(
                  child: Container(
                    width: 36,
                    height: 4,
                    decoration: BoxDecoration(
                      color: c.border,
                      borderRadius: BorderRadius.circular(2),
                    ),
                  ),
                ),
                const SizedBox(height: AppSpacing.s5),
                Text('Trading Strategies',
                    style: AppTypography.headingMd
                        .copyWith(color: c.textPrimary)),
                const SizedBox(height: AppSpacing.s4),
              ],
            ),
          ),
          Expanded(
            child: ListView(
              controller: scrollController,
              padding: EdgeInsets.fromLTRB(
                  AppSpacing.s5,
                  0,
                  AppSpacing.s5,
                  AppSpacing.s8 + MediaQuery.of(ctx).padding.bottom),
              children: [
                _AssetStrategyInfoRow(
                  label: 'S1', title: 'Technical Analysis',
                  description: 'Pure price-action signals using momentum and volatility indicators.',
                  detail: 'RSI-14 · MACD · EMA crossovers · Bollinger Bands · ATR · Rate of Change',
                  accentColor: c.accent,
                ),
                const SizedBox(height: AppSpacing.s4),
                _AssetStrategyInfoRow(
                  label: 'S2', title: 'Multi-Factor',
                  description: 'Builds on S1 with volatility-adaptive entry and exit thresholds.',
                  detail: 'All S1 indicators + dynamic thresholds calibrated to current market vol',
                  accentColor: c.warning,
                ),
                const SizedBox(height: AppSpacing.s4),
                _AssetStrategyInfoRow(
                  label: 'S3', title: 'Hybrid (Tech + Sentiment)',
                  description: 'Blends technical signals with real-time news sentiment scoring.',
                  detail: 'S1 signals (70%) + NLP sentiment from latest headlines (30%)',
                  accentColor: c.danger,
                ),
                const SizedBox(height: AppSpacing.s4),
                _AssetStrategyInfoRow(
                  label: 'S4', title: 'Regime-Adaptive',
                  description: 'Detects market regime first, then activates the right engine.',
                  detail: 'ADX > 25 → Trend Engine · ADX < 18 → Range Engine (RSI, Bollinger, ATR)',
                  accentColor: c.positive,
                ),
                const SizedBox(height: AppSpacing.s4),
                _AssetStrategyInfoRow(
                  label: 'S5', title: 'Professional Systematic',
                  description: 'Four-regime classification with dynamic indicator weights and consensus gate.',
                  detail: 'Quiet Trend · Quiet Range · Volatile Trend · Chaotic → No Trade · OBV confirmation',
                  accentColor: c.warning,
                ),
                const SizedBox(height: AppSpacing.s4),
                _AssetStrategyInfoRow(
                  label: 'S6', title: 'Adaptive Hybrid',
                  description: 'Regime-aware fusion of technical signals and news sentiment.',
                  detail: 'High-vol: tech 90% / news 10% · Strong-trend: 85/15 · Low-vol: 60/40',
                  accentColor: c.accent,
                ),
                const SizedBox(height: AppSpacing.s4),
                _AssetStrategyInfoRow(
                  label: 'S7', title: 'APEX — Adaptive Probabilistic EXecution',
                  description: 'Five-regime classifier with divergence veto and 0–100 quality gate (must hit 60).',
                  detail: 'Strong Trend · Weak Trend · Ranging · Volatile Breakout · Chaotic (no trade)',
                  accentColor: c.danger,
                ),
                const SizedBox(height: AppSpacing.s4),
                _AssetStrategyInfoRow(
                  label: 'S8', title: 'Ensemble — S4+S5+S7 Consensus',
                  description: 'Runs three strategies and weights their votes by per-regime accuracy.',
                  detail: 'Full size on 3/3 agreement · 60% size on 2/3 · No trade on split',
                  accentColor: c.positive,
                ),
              ],
            ),
          ),
        ],
      ),
    ),
  );
}

class _AssetStrategyInfoRow extends StatelessWidget {
  const _AssetStrategyInfoRow({
    required this.label,
    required this.title,
    required this.description,
    required this.detail,
    required this.accentColor,
  });
  final String label;
  final String title;
  final String description;
  final String detail;
  final Color accentColor;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: 32,
          height: 32,
          decoration: BoxDecoration(
            color: accentColor.withAlpha(30),
            borderRadius: BorderRadius.circular(AppRadius.sm),
            border: Border.all(color: accentColor.withAlpha(80)),
          ),
          child: Center(
            child: Text(label,
                style: AppTypography.labelSm.copyWith(
                    color: accentColor, fontWeight: FontWeight.w700)),
          ),
        ),
        const SizedBox(width: AppSpacing.s4),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title,
                  style: AppTypography.labelMd.copyWith(
                      color: c.textPrimary, fontWeight: FontWeight.w700)),
              const SizedBox(height: 2),
              Text(description,
                  style: AppTypography.sm.copyWith(color: c.textSecondary)),
              const SizedBox(height: 4),
              Text(detail,
                  style: AppTypography.xs.copyWith(color: c.textMuted)),
            ],
          ),
        ),
      ],
    );
  }
}

class _SignalContent extends ConsumerStatefulWidget {
  const _SignalContent({required this.signal, required this.strategy});
  final TradingSignal signal;
  final TradingStrategy strategy;

  @override
  ConsumerState<_SignalContent> createState() => _SignalContentState();
}

class _SignalContentState extends ConsumerState<_SignalContent> {
  bool _noteRequested = false;

  TradingSignal get signal => widget.signal;
  TradingStrategy get strategy => widget.strategy;

  void _copySignal(BuildContext context) {
    final text = '${signal.direction} ${signal.symbol} ${strategy.label} | '
        'Entry: ${_fmt(signal.entry)}  SL: ${_fmt(signal.stopLoss)}  '
        'TP: ${_fmt(signal.takeProfit)}  R:R: ${signal.riskReward.toStringAsFixed(2)} | '
        '${signal.confidence.toInt()}% confidence';
    Clipboard.setData(ClipboardData(text: text));
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('Signal copied to clipboard'),
        duration: Duration(seconds: 2),
        behavior: SnackBarBehavior.floating,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final color = c.signalColor(signal.direction);

    final fundamentalsAsync = ref.watch(_fundamentalsProvider(signal.symbol));

    return ListView(
      padding: EdgeInsets.fromLTRB(
        AppSpacing.s5,
        AppSpacing.s5,
        AppSpacing.s5,
        AppSpacing.s5 + MediaQuery.of(context).padding.bottom,
      ),
      children: [
        fundamentalsAsync.when(
          data: (f) => f != null
              ? Column(children: [_FundamentalBar(data: f), const SizedBox(height: AppSpacing.s3)])
              : const SizedBox.shrink(),
          loading: () => const SizedBox.shrink(),
          error: (_, __) => const SizedBox.shrink(),
        ),
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
                  const SizedBox(width: AppSpacing.s2),
                  GestureDetector(
                    onTap: () => _copySignal(context),
                    child: Icon(Icons.copy_outlined,
                        size: 16, color: c.textFaint),
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
              if (signal.ivPercentile != null) ...[
                const SizedBox(height: AppSpacing.s2),
                _VolatilityLine(ivPct: signal.ivPercentile!),
              ],
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
        ...signal.reasoning.map((r) {
          final label = _reasoningLabel(r);
          final labelColor = _labelColor(label, c);
          return Padding(
            padding: const EdgeInsets.only(bottom: AppSpacing.s4),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                  decoration: BoxDecoration(
                    color: labelColor.withAlpha(25),
                    borderRadius: BorderRadius.circular(AppRadius.full),
                    border: Border.all(color: labelColor.withAlpha(60)),
                  ),
                  child: Text(label,
                      style: AppTypography.xs.copyWith(
                          color: labelColor,
                          fontWeight: FontWeight.w600,
                          letterSpacing: 0.4)),
                ),
                const SizedBox(height: AppSpacing.s2),
                Text(r,
                    style: AppTypography.lg.copyWith(
                        color: c.textSecondary, height: 1.5)),
              ],
            ),
          );
        }),
        if (!_noteRequested)
          Padding(
            padding: const EdgeInsets.only(top: AppSpacing.s2),
            child: Builder(builder: (ctx) {
              final unlocked =
                  EntitlementService.can('analyst_notes_unlimited');
              return GestureDetector(
                onTap: () {
                  if (!unlocked) {
                    UpgradeSheet.show(ctx,
                        feature: 'analyst_notes_unlimited');
                  } else {
                    setState(() => _noteRequested = true);
                  }
                },
                child: Container(
                  width: double.infinity,
                  padding: const EdgeInsets.symmetric(
                      horizontal: AppSpacing.s4, vertical: AppSpacing.s3),
                  decoration: BoxDecoration(
                    color: c.accentDim,
                    borderRadius: BorderRadius.circular(AppRadius.md),
                    border: Border.all(color: c.accent.withAlpha(60)),
                  ),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(
                        unlocked
                            ? Icons.auto_awesome_rounded
                            : Icons.lock_rounded,
                        size: 15,
                        color: c.accent,
                      ),
                      const SizedBox(width: AppSpacing.s2),
                      Text('Generate Analyst Note',
                          style: AppTypography.labelMd
                              .copyWith(color: c.accent)),
                      if (!unlocked) ...[
                        const SizedBox(width: AppSpacing.s2),
                        Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 6, vertical: 2),
                          decoration: BoxDecoration(
                            color: c.accent.withAlpha(40),
                            borderRadius:
                                BorderRadius.circular(AppRadius.full),
                          ),
                          child: Text('Pro',
                              style: AppTypography.xs.copyWith(
                                  color: c.accent,
                                  fontWeight: FontWeight.w700)),
                        ),
                      ],
                    ],
                  ),
                ),
              );
            }),
          )
        else
          Builder(builder: (context) {
            final noteArgs = (
              symbol: signal.symbol,
              strategy: strategy.serverParam,
              direction: signal.direction,
              confidence: signal.confidence,
            );
            final noteAsync = ref.watch(_noteProvider(noteArgs));
            return noteAsync.when(
              loading: () => const Padding(
                padding: EdgeInsets.only(top: AppSpacing.s2),
                child: _NoteShimmer(),
              ),
              error: (_, __) => Padding(
                padding: const EdgeInsets.only(top: AppSpacing.s2),
                child: GestureDetector(
                  onTap: () {
                    ref.invalidate(_noteProvider(noteArgs));
                  },
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: AppSpacing.s4, vertical: AppSpacing.s3),
                    decoration: BoxDecoration(
                      color: c.dangerDim,
                      borderRadius: BorderRadius.circular(AppRadius.md),
                      border: Border.all(color: c.danger.withAlpha(60)),
                    ),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(Icons.refresh_rounded,
                            size: 15, color: c.danger),
                        const SizedBox(width: AppSpacing.s2),
                        Text('Failed to load — tap to retry',
                            style: AppTypography.labelMd
                                .copyWith(color: c.danger)),
                      ],
                    ),
                  ),
                ),
              ),
              data: (note) {
                if (note == TradingRepository.planLimitSentinel) {
                  return Padding(
                    padding: const EdgeInsets.only(top: AppSpacing.s2),
                    child: GestureDetector(
                      onTap: () => UpgradeSheet.show(context,
                          feature: 'analyst_notes_unlimited'),
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: AppSpacing.s4, vertical: AppSpacing.s3),
                        decoration: BoxDecoration(
                          color: c.accentDim,
                          borderRadius: BorderRadius.circular(AppRadius.md),
                          border: Border.all(color: c.accent.withAlpha(60)),
                        ),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(Icons.lock_rounded,
                                size: 14, color: c.accent),
                            const SizedBox(width: AppSpacing.s2),
                            Text('Upgrade to Pro for unlimited AI notes',
                                style: AppTypography.labelMd
                                    .copyWith(color: c.accent)),
                          ],
                        ),
                      ),
                    ),
                  );
                }
                return note != null && note.isNotEmpty
                    ? Padding(
                        padding: const EdgeInsets.only(top: AppSpacing.s2),
                        child: _AnalystNoteCard(note: note),
                      )
                    : const SizedBox.shrink();
              },
            );
          }),
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
        const SizedBox(height: AppSpacing.s5),
        Text(
          'Signals are for informational purposes only and do not constitute financial advice. Past performance does not guarantee future results.',
          style: AppTypography.xs.copyWith(color: c.textMuted),
          textAlign: TextAlign.center,
        ),
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

  String _reasoningLabel(String r) {
    final s = r.toLowerCase();
    if (s.contains('rsi') || s.contains('macd') || s.contains('volume') ||
        s.contains('momentum') || s.contains('crossover') || s.contains('oversold') ||
        s.contains('overbought') || s.contains('breakout') || s.contains('obv') ||
        s.contains('atr') || s.contains('stoch') || s.contains('ema') ||
        s.contains('sma') || s.contains('timeframe') || s.contains('higher timeframe') ||
        s.contains('trend') || s.contains('compression') || s.contains('squeeze')) {
      return 'Momentum';
    }
    if (s.contains('earn') || s.contains('revenue') || s.contains('p/e') ||
        s.contains('fundamental') || s.contains('valuation') || s.contains('fcf') ||
        s.contains('eps') || s.contains('guidance') || s.contains('sector') ||
        s.contains('peer') || s.contains('market cap') || s.contains('smart money')) {
      return 'Fundamentals';
    }
    if (s.contains('risk') || s.contains('resistance') || s.contains('support') ||
        s.contains('event') || s.contains('volatile') || s.contains('caution') ||
        s.contains('warning') || s.contains('weak') || s.contains('mixed') ||
        s.contains('ranging') || s.contains('dampens') || s.contains('low volatility') ||
        s.contains('high volatility')) {
      return 'Risk';
    }
    return 'Context';
  }

  Color _labelColor(String label, AppPalette c) {
    switch (label) {
      case 'Momentum':
        return c.accent;
      case 'Fundamentals':
        return c.warning;
      case 'Risk':
        return c.danger;
      default:
        return c.textMuted;
    }
  }
}

class _AnalystNoteCard extends StatelessWidget {
  const _AnalystNoteCard({required this.note});
  final String note;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final hasEarningsFlag = note.toLowerCase().contains('earn');
    return GlassCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.auto_awesome_rounded, size: 14, color: c.accent),
              const SizedBox(width: AppSpacing.s2),
              Text('Analyst Note',
                  style: AppTypography.labelMd.copyWith(color: c.textPrimary)),
              const Spacer(),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                decoration: BoxDecoration(
                  color: c.accentDim,
                  borderRadius: BorderRadius.circular(AppRadius.full),
                ),
                child: Text('AI',
                    style: AppTypography.xs.copyWith(
                        color: c.accent, fontWeight: FontWeight.w700)),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.s3),
          Text(note,
              style: AppTypography.md.copyWith(
                  color: c.textSecondary, height: 1.6)),
          if (hasEarningsFlag) ...[
            const SizedBox(height: AppSpacing.s3),
            Row(
              children: [
                Icon(Icons.warning_amber_rounded, size: 14, color: c.warning),
                const SizedBox(width: 4),
                Expanded(
                  child: Text(
                    'Earnings event detected — review position sizing',
                    style: AppTypography.sm.copyWith(color: c.warning),
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

class _NoteShimmer extends StatefulWidget {
  const _NoteShimmer();

  @override
  State<_NoteShimmer> createState() => _NoteShimmerState();
}

class _NoteShimmerState extends State<_NoteShimmer>
    with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl;
  late final Animation<double> _anim;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1200),
    )..repeat(reverse: true);
    _anim = CurvedAnimation(parent: _ctrl, curve: Curves.easeInOut);
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return AnimatedBuilder(
      animation: _anim,
      builder: (_, __) {
        final opacity = 0.3 + 0.4 * _anim.value;
        return GlassCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Icon(Icons.auto_awesome_rounded, size: 14, color: c.accent.withAlpha((opacity * 255).toInt())),
                  const SizedBox(width: AppSpacing.s2),
                  Container(
                    width: 90,
                    height: 12,
                    decoration: BoxDecoration(
                      color: c.textMuted.withAlpha((opacity * 255).toInt()),
                      borderRadius: BorderRadius.circular(4),
                    ),
                  ),
                  const Spacer(),
                  Container(
                    width: 24,
                    height: 18,
                    decoration: BoxDecoration(
                      color: c.accentDim.withAlpha((opacity * 255).toInt()),
                      borderRadius: BorderRadius.circular(AppRadius.full),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: AppSpacing.s3),
              ...List.generate(3, (i) => Padding(
                padding: const EdgeInsets.only(bottom: 6),
                child: Container(
                  width: i == 2 ? 120 : double.infinity,
                  height: 12,
                  decoration: BoxDecoration(
                    color: c.textMuted.withAlpha((opacity * 180).toInt()),
                    borderRadius: BorderRadius.circular(4),
                  ),
                ),
              )),
            ],
          ),
        );
      },
    );
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
          padding: EdgeInsets.fromLTRB(
            AppSpacing.s5,
            AppSpacing.s5,
            AppSpacing.s5,
            AppSpacing.s5 + MediaQuery.of(context).padding.bottom,
          ),
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
        padding: EdgeInsets.fromLTRB(
          AppSpacing.s5,
          AppSpacing.s5,
          AppSpacing.s5,
          AppSpacing.s5 + MediaQuery.of(context).padding.bottom,
        ),
        children: [
          Row(
            children: [
              Text('Walk-Forward Backtest',
                  style: AppTypography.headingSm.copyWith(color: c.textPrimary)),
              const SizedBox(width: AppSpacing.s2),
              GestureDetector(
                onTap: () => _showBacktestMethodInfo(context),
                child: Icon(Icons.info_outline_rounded,
                    size: 16, color: c.textMuted),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.s2),
          GestureDetector(
            onTap: () => _showBacktestMethodInfo(context),
            child: Text(
              '70% train / 30% test split · 5-bar hold · tap for details',
              style: AppTypography.sm.copyWith(color: c.textMuted),
            ),
          ),
          const SizedBox(height: AppSpacing.s5),
          ...results.map((r) => _BacktestCard(result: r)),
        ],
      ),
    );
  }
}

void _showBacktestMethodInfo(BuildContext context) {
  final c = context.colors;
  showModalBottomSheet(
    context: context,
    backgroundColor: c.surface,
    isScrollControlled: true,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (_) => DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.7,
      minChildSize: 0.4,
      maxChildSize: 0.92,
      builder: (ctx, scrollCtrl) => ListView(
        controller: scrollCtrl,
        padding: EdgeInsets.fromLTRB(
            AppSpacing.s5,
            AppSpacing.s5,
            AppSpacing.s5,
            AppSpacing.s8 + MediaQuery.of(ctx).padding.bottom),
        children: [
          Center(
            child: Container(
              width: 36, height: 4,
              decoration: BoxDecoration(
                color: c.border, borderRadius: BorderRadius.circular(2)),
            ),
          ),
          const SizedBox(height: AppSpacing.s5),
          Text('Backtest Methodology',
              style: AppTypography.headingMd.copyWith(color: c.textPrimary)),
          const SizedBox(height: AppSpacing.s4),
          _BacktestInfoRow(
            icon: Icons.call_split_rounded,
            color: c.accent,
            title: '70% Train / 30% Test Split',
            description: 'Historical data is divided into two parts. The strategy is calibrated on the first 70% (training set), then evaluated on the unseen 30% (test set). This simulates how the strategy would have performed on data it never "saw" during development — a more honest performance estimate.',
          ),
          const SizedBox(height: AppSpacing.s4),
          _BacktestInfoRow(
            icon: Icons.timer_outlined,
            color: c.warning,
            title: '5-Bar Hold Period',
            description: 'Each trade is held for exactly 5 bars (candles) after entry before exiting at market. On the 1D timeframe, this equals 5 trading days (~1 week). This fixed-duration approach removes discretionary exit bias and makes returns comparable across strategies.',
          ),
          const SizedBox(height: AppSpacing.s5),
          Text('STAT DEFINITIONS',
              style: AppTypography.labelXs.copyWith(
                  color: c.textMuted, letterSpacing: 1.2)),
          const SizedBox(height: AppSpacing.s3),
          _BacktestInfoRow(
            icon: Icons.trending_up_rounded,
            color: c.positive,
            title: 'Total Return (%)',
            description: 'The sum of all trade returns over the test period. A simple measure of overall profitability — how much you gained or lost in percentage terms if you had followed every signal.',
          ),
          const SizedBox(height: AppSpacing.s4),
          _BacktestInfoRow(
            icon: Icons.check_circle_outline_rounded,
            color: c.accent,
            title: 'Win Rate (%)',
            description: 'Percentage of trades that were profitable. A 60% win rate means 6 out of every 10 trades made money. Note: win rate alone doesn\'t tell you profitability — a strategy with 40% wins can still be profitable if average winners are much larger than losers.',
          ),
          const SizedBox(height: AppSpacing.s4),
          _BacktestInfoRow(
            icon: Icons.arrow_downward_rounded,
            color: c.danger,
            title: 'Max Drawdown (Max DD)',
            description: 'The largest peak-to-trough decline in the equity curve, expressed as a percentage. If your cumulative return reached +20% and then fell to +5%, the drawdown is 15%. Lower is better. Professional funds typically target Max DD below 20%.',
          ),
          const SizedBox(height: AppSpacing.s4),
          _BacktestInfoRow(
            icon: Icons.bar_chart_rounded,
            color: c.accent,
            title: 'Sharpe Ratio',
            description: 'A risk-adjusted return metric: return per unit of volatility. Sharpe > 1.0 is considered good; > 2.0 is excellent; < 0 means the strategy underperformed cash. Formula: (Return − Risk-free rate) ÷ Standard deviation of returns.',
          ),
          const SizedBox(height: AppSpacing.s5),
          Container(
            padding: const EdgeInsets.all(AppSpacing.s4),
            decoration: BoxDecoration(
              color: c.warning.withAlpha(15),
              borderRadius: BorderRadius.circular(AppRadius.md),
              border: Border.all(color: c.warning.withAlpha(50)),
            ),
            child: Text(
              'Past backtest results do not guarantee future performance. Backtests are subject to look-ahead bias, overfitting, and transaction cost assumptions. Use as one input among many.',
              style: AppTypography.xs.copyWith(color: c.textSecondary, height: 1.6),
            ),
          ),
        ],
      ),
    ),
  );
}

class _BacktestInfoRow extends StatelessWidget {
  const _BacktestInfoRow({
    required this.icon,
    required this.color,
    required this.title,
    required this.description,
  });
  final IconData icon;
  final Color color;
  final String title;
  final String description;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: 32, height: 32,
          decoration: BoxDecoration(
            color: color.withAlpha(30),
            borderRadius: BorderRadius.circular(AppRadius.sm),
          ),
          child: Icon(icon, color: color, size: 16),
        ),
        const SizedBox(width: AppSpacing.s4),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title,
                  style: AppTypography.labelSm.copyWith(
                      color: color, fontWeight: FontWeight.w700)),
              const SizedBox(height: 2),
              Text(description,
                  style: AppTypography.sm.copyWith(
                      color: c.textSecondary, height: 1.5)),
            ],
          ),
        ),
      ],
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
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        Text(
                          '${r.totalReturn >= 0 ? '+' : ''}${r.totalReturn.toStringAsFixed(1)}%',
                          style: AppTypography.xl.copyWith(
                              color: returnColor, fontWeight: FontWeight.w700),
                        ),
                        Text('Total Return',
                            style: AppTypography.xs.copyWith(color: c.textMuted)),
                      ],
                    ),
                  ],
                ),
                if (r.backtestNote != null) ...[
                  const SizedBox(height: AppSpacing.s3),
                  Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: AppSpacing.s3, vertical: AppSpacing.s2),
                    decoration: BoxDecoration(
                      color: c.warningDim,
                      borderRadius: BorderRadius.circular(AppRadius.sm),
                    ),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Icon(Icons.info_outline_rounded,
                            size: 13, color: c.warning),
                        const SizedBox(width: AppSpacing.s2),
                        Expanded(
                          child: Text(r.backtestNote!,
                              style: AppTypography.xs
                                  .copyWith(color: c.warning, height: 1.5)),
                        ),
                      ],
                    ),
                  ),
                ],
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
                          '-${r.maxDrawdown.toStringAsFixed(1)}%', c.danger, c,
                          tooltip: 'Max Drawdown: largest peak-to-trough loss'),
                    ),
                    Expanded(
                      child: _BacktestStat('Sharpe',
                          r.sharpeRatio.toStringAsFixed(2), c.accent, c,
                          tooltip: 'Sharpe Ratio: return per unit of risk (>1 = good)'),
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
  const _BacktestStat(this.label, this.value, this.color, this.palette,
      {this.tooltip});
  final String label;
  final String value;
  final Color color;
  final AppPalette palette;
  final String? tooltip;

  @override
  Widget build(BuildContext context) {
    final content = Column(
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(label,
                style: AppTypography.xs.copyWith(color: palette.textMuted)),
            if (tooltip != null) ...[
              const SizedBox(width: 2),
              Icon(Icons.help_outline_rounded,
                  size: 9, color: palette.textFaint),
            ],
          ],
        ),
        const SizedBox(height: 2),
        Text(value,
            style: AppTypography.labelMd
                .copyWith(color: color, fontWeight: FontWeight.w700)),
      ],
    );

    if (tooltip != null) {
      return Tooltip(
        message: tooltip!,
        triggerMode: TooltipTriggerMode.tap,
        child: content,
      );
    }
    return content;
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
        padding: EdgeInsets.fromLTRB(
          AppSpacing.s5,
          AppSpacing.s5,
          AppSpacing.s5,
          AppSpacing.s5 + MediaQuery.of(context).padding.bottom,
        ),
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

// ── Fundamental Bar ───────────────────────────────────────────────────────────

class _FundamentalBar extends StatelessWidget {
  const _FundamentalBar({required this.data});
  final Map<String, dynamic> data;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final sector = data['sector'] as String?;
    final industry = data['industry'] as String?;
    final high = data['week52High'] as num?;
    final low = data['week52Low'] as num?;
    final currency = data['currency'] as String?;

    // Nothing useful to show for non-equity asset types with no sector/range
    if (sector == null && (high == null || low == null)) {
      return const SizedBox.shrink();
    }

    final currencySymbol = _currencySymbol(currency);
    final rangePart = (high != null && low != null)
        ? '$currencySymbol${_fmtNum(low.toDouble())}–$currencySymbol${_fmtNum(high.toDouble())}'
        : null;

    final parts = <String>[
      if (sector != null) sector,
      if (industry != null && industry != sector) _shortIndustry(industry),
      if (rangePart != null) rangePart,
    ];

    if (parts.isEmpty) return const SizedBox.shrink();

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: c.surface,
        borderRadius: BorderRadius.circular(AppRadius.md),
        border: Border.all(color: c.border),
      ),
      child: Row(
        children: [
          if (sector != null) ...[
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
              decoration: BoxDecoration(
                color: _sectorColor(c, sector).withAlpha(30),
                borderRadius: BorderRadius.circular(AppRadius.full),
              ),
              child: Text(
                sector,
                style: AppTypography.xs.copyWith(
                    color: _sectorColor(c, sector), fontWeight: FontWeight.w700),
              ),
            ),
            const SizedBox(width: 8),
          ] else if (data['quoteType'] != null) ...[
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
              decoration: BoxDecoration(
                color: c.border,
                borderRadius: BorderRadius.circular(AppRadius.full),
              ),
              child: Text(
                _quoteTypeLabel(data['quoteType'] as String),
                style: AppTypography.xs.copyWith(
                    color: c.textMuted, fontWeight: FontWeight.w700),
              ),
            ),
            const SizedBox(width: 8),
          ],
          Expanded(
            child: Text(
              [
                if (industry != null && industry != sector) _shortIndustry(industry),
                if (rangePart != null) rangePart,
              ].join(' · '),
              style: AppTypography.xs.copyWith(color: c.textMuted),
              overflow: TextOverflow.ellipsis,
            ),
          ),
          const SizedBox(width: 6),
          GestureDetector(
            onTap: () => _showFundamentalInfo(context),
            child: Icon(Icons.info_outline_rounded, size: 16, color: c.textFaint),
          ),
        ],
      ),
    );
  }

  void _showFundamentalInfo(BuildContext context) {
    final c = context.colors;
    showModalBottomSheet(
      context: context,
      backgroundColor: c.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Center(
                child: Container(
                  width: 36, height: 4,
                  decoration: BoxDecoration(
                    color: c.border,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
              const SizedBox(height: 16),
              Text('About This Bar',
                  style: AppTypography.headingSm.copyWith(color: c.textPrimary)),
              const SizedBox(height: 16),
              _InfoRow(
                icon: Icons.category_outlined,
                color: c.accent,
                title: 'Sector & Industry',
                body: 'The sector (e.g. Energy, Technology) and specific industry the company operates in, sourced from Yahoo Finance. Useful for understanding macro sensitivity — Energy stocks move with oil prices, Tech stocks with rate expectations.',
              ),
              const SizedBox(height: 12),
              _InfoRow(
                icon: Icons.straighten_rounded,
                color: c.warning,
                title: '52-Week Range',
                body: 'The lowest and highest price the asset has traded at over the past year. If the current price is near the low end, the asset may be undervalued or in a downtrend. Near the high end suggests momentum or potential overextension.',
              ),
            ],
          ),
        ),
      ),
    );
  }

  Color _sectorColor(AppPalette c, String sector) {
    switch (sector) {
      case 'Technology': return c.accent;
      case 'Energy': return c.warning;
      case 'Healthcare': return const Color(0xFF6CB4E4);
      case 'Financial Services': return c.positive;
      case 'Consumer Cyclical': return const Color(0xFFBF7FFF);
      case 'Industrials': return c.textMuted;
      default: return c.textMuted;
    }
  }

  String _quoteTypeLabel(String quoteType) {
    switch (quoteType) {
      case 'CRYPTOCURRENCY': return 'Crypto';
      case 'FUTURE': return 'Futures';
      case 'CURRENCY': return 'Forex';
      case 'INDEX': return 'Index';
      case 'ETF': return 'ETF';
      default: return quoteType;
    }
  }

  String _shortIndustry(String industry) {
    // Trim verbose suffixes to keep it compact
    return industry
        .replaceAll('—NEC', '')
        .replaceAll('Refining & Marketing', 'Refining')
        .trim();
  }

  String _currencySymbol(String? currency) {
    switch (currency) {
      case 'INR': return '₹';
      case 'EUR': return '€';
      case 'GBP': return '£';
      case 'JPY': return '¥';
      case 'CNY': return '¥';
      case 'USD': return '';
      default: return '';
    }
  }

  String _fmtNum(double v) {
    if (v > 1000) return v.toStringAsFixed(0);
    if (v < 1) return v.toStringAsFixed(4);
    return v.toStringAsFixed(2);
  }
}

// ── Volatility Line ───────────────────────────────────────────────────────────

class _VolatilityLine extends StatelessWidget {
  const _VolatilityLine({required this.ivPct});
  final double ivPct;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final pct = (ivPct * 100).round();
    final Color color;
    final String suffix;
    if (ivPct > 0.75) {
      color = c.warning;
      suffix = ' — SL widened';
    } else if (ivPct < 0.25) {
      color = c.textMuted;
      suffix = ' — tight SL';
    } else {
      color = c.textFaint;
      suffix = '';
    }

    return Row(
      children: [
        Icon(Icons.show_chart_rounded, size: 11, color: color),
        const SizedBox(width: 4),
        Text(
          'Volatility: ${pct}th pct$suffix',
          style: AppTypography.xs.copyWith(color: color),
        ),
        const SizedBox(width: 4),
        GestureDetector(
          onTap: () => _showVolatilityInfo(context),
          child: Icon(Icons.info_outline_rounded, size: 14, color: c.textFaint),
        ),
      ],
    );
  }

  void _showVolatilityInfo(BuildContext context) {
    final c = context.colors;
    showModalBottomSheet(
      context: context,
      backgroundColor: c.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Center(
                child: Container(
                  width: 36, height: 4,
                  decoration: BoxDecoration(
                    color: c.border,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
              const SizedBox(height: 16),
              Text('Volatility Percentile',
                  style: AppTypography.headingSm.copyWith(color: c.textPrimary)),
              const SizedBox(height: 8),
              Text(
                'Compares the current ATR (Average True Range — the typical daily price swing) to the last 20 candles. A higher percentile means the market is moving more than usual.',
                style: AppTypography.sm.copyWith(color: c.textMuted, height: 1.5),
              ),
              const SizedBox(height: 16),
              _InfoRow(
                icon: Icons.show_chart_rounded,
                color: c.warning,
                title: 'Above 75th pct — High volatility',
                body: 'Unusually large price swings. Stop-loss is automatically widened to 2× ATR so normal chop does not stop you out prematurely.',
              ),
              const SizedBox(height: 12),
              _InfoRow(
                icon: Icons.show_chart_rounded,
                color: c.textMuted,
                title: '25th–75th pct — Normal',
                body: 'Typical market conditions. Standard stop-loss of 1.5× ATR applies.',
              ),
              const SizedBox(height: 12),
              _InfoRow(
                icon: Icons.show_chart_rounded,
                color: c.textFaint,
                title: 'Below 25th pct — Low volatility',
                body: 'Very quiet market. Stop-loss is tightened to 1.1× ATR for a better risk/reward. Watch for a volatility expansion that could break the range.',
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _InfoRow extends StatelessWidget {
  const _InfoRow({
    required this.icon,
    required this.color,
    required this.title,
    required this.body,
  });
  final IconData icon;
  final Color color;
  final String title;
  final String body;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          margin: const EdgeInsets.only(top: 2),
          padding: const EdgeInsets.all(6),
          decoration: BoxDecoration(
            color: color.withAlpha(30),
            borderRadius: BorderRadius.circular(AppRadius.sm),
          ),
          child: Icon(icon, size: 14, color: color),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title,
                  style: AppTypography.labelMd.copyWith(color: c.textPrimary)),
              const SizedBox(height: 3),
              Text(body,
                  style: AppTypography.xs.copyWith(
                      color: c.textMuted, height: 1.5)),
            ],
          ),
        ),
      ],
    );
  }
}
