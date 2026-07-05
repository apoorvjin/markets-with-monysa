import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:fl_chart/fl_chart.dart';
import '../../core/network/api_client.dart';
import '../../core/network/api_endpoints.dart';
import '../../core/theme/app_palette.dart';
import '../../core/theme/app_typography.dart';
import '../../core/theme/app_spacing.dart';
import '../../data/models/trading_signal.dart';
import '../../data/repositories/trading_repository.dart';
import '../../providers/strategy_provider.dart';
import '../../providers/chart_provider_provider.dart';
import '../../shared/widgets/signal_badge.dart';
import '../../shared/widgets/glass_card.dart';
import '../../shared/widgets/error_view.dart';
import '../../shared/widgets/chart_host.dart';
import '../../shared/widgets/chart_modal.dart';
import '../../utils/tv_symbol.dart';
import '../../providers/watchlist_provider.dart';
import '../../services/entitlement_service.dart';
import '../../shared/widgets/upgrade_sheet.dart';
import '../../shared/widgets/shimmer_list.dart';
import '../../shared/widgets/app_shell_insets.dart';

// ── Providers ─────────────────────────────────────────────────────────────────

final _signalProvider = FutureProvider.autoDispose
    .family<TradingSignal, ({String symbol, String tf, String strategy})>(
  (ref, args) {
    // Keep alive across tab switches within the same asset detail session.
    ref.keepAlive();
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

// Keyed by (symbol, timeframe) — used by Backtest tab.
final _backtestProvider = FutureProvider.autoDispose
    .family<List<BacktestResult>, ({String symbol, String tf})>(
  (ref, args) {
    ref.keepAlive();
    return TradingRepository.instance.fetchBacktest(args.symbol, timeframe: args.tf);
  },
);

// Runs all 4 relevant TF backtests in parallel — used by Trace tab for per-TF win%/ret%.
final _traceBacktestProvider = FutureProvider.autoDispose
    .family<Map<String, List<BacktestResult>>, String>(
  (ref, symbol) async {
    ref.keepAlive();
    const tfs = ['1h', '4h', '1d', '1w'];
    final results = await Future.wait(
      tfs.map((tf) => TradingRepository.instance.fetchBacktest(symbol, timeframe: tf)),
    );
    return Map.fromIterables(tfs, results);
  },
);

final _signalTraceProvider = FutureProvider.autoDispose
    .family<Map<String, List<SignalTracePair>>, String>(
  (ref, symbol) async {
    ref.keepAlive();
    const tfs = ['1h', '4h', '1d', '1w'];
    // Use error-tolerant approach: a single failed TF should not crash the whole trace.
    final settled = await Future.wait(
      tfs.map((tf) => TradingRepository.instance
          .fetchSignalsCompare(symbol, timeframe: tf)
          .then<List<SignalTracePair>?>((v) => v)
          .catchError((_) => null)),
    );
    final out = <String, List<SignalTracePair>>{};
    for (int i = 0; i < tfs.length; i++) {
      final v = settled[i];
      if (v != null) out[tfs[i]] = v;
    }
    if (out.isEmpty) throw Exception('No trace data available');
    return out;
  },
);

final _newsProvider = FutureProvider.autoDispose
    .family<NewsResult, String>(
  (ref, symbol) {
    ref.keepAlive();
    return TradingRepository.instance.fetchNews(symbol);
  },
);

final _noteProvider = FutureProvider.autoDispose
    .family<String?, ({String symbol, String strategy, String direction, double confidence})>(
  (ref, args) {
    ref.keepAlive();
    return TradingRepository.instance.fetchAnalystNote(
      args.symbol,
      strategy: args.strategy,
      direction: args.direction,
      confidence: args.confidence,
    );
  },
);

final _fundamentalsProvider = FutureProvider.autoDispose
    .family<Map<String, dynamic>?, String>(
  (ref, symbol) async {
    ref.keepAlive();
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

  static const _tabs = ['Chart', 'Signal', 'Trace', 'Indicators', 'Backtest', 'News'];
  static const _timeframes = ['1h', '4h', '1d', '1w'];

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
          _WatchlistButton(symbol: widget.symbol),
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
          _ChartTab(
              symbol: widget.symbol,
              name: widget.name,
              timeframe: _timeframe),
          _SignalTab(
              symbol: widget.symbol, name: widget.name, timeframe: _timeframe),
          _SignalTraceTab(symbol: widget.symbol, name: widget.name),
          _IndicatorsTab(
              symbol: widget.symbol, timeframe: _timeframe),
          _BacktestTab(symbol: widget.symbol, initialTf: _timeframe),
          _NewsTab(symbol: widget.symbol),
        ],
      ),
    );
  }
}

// ── Watchlist Button with bounce animation ────────────────────────────────────

class _WatchlistButton extends ConsumerStatefulWidget {
  const _WatchlistButton({required this.symbol});
  final String symbol;

  @override
  ConsumerState<_WatchlistButton> createState() => _WatchlistButtonState();
}

class _WatchlistButtonState extends ConsumerState<_WatchlistButton>
    with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl;
  late final Animation<double> _scale;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 300),
    );
    _scale = TweenSequence<double>([
      TweenSequenceItem(tween: Tween(begin: 1.0, end: 1.45), weight: 40),
      TweenSequenceItem(tween: Tween(begin: 1.45, end: 0.9), weight: 30),
      TweenSequenceItem(tween: Tween(begin: 0.9, end: 1.0), weight: 30),
    ]).animate(CurvedAnimation(parent: _ctrl, curve: Curves.easeOut));
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final watched = ref.watch(watchlistProvider).contains(widget.symbol);
    return ScaleTransition(
      scale: _scale,
      child: IconButton(
        icon: Icon(
          watched ? Icons.bookmark_rounded : Icons.bookmark_border_rounded,
          color: watched ? c.accent : c.textMuted,
        ),
        tooltip: watched ? 'Remove from watchlist' : 'Add to watchlist',
        onPressed: () {
          ref.read(watchlistProvider.notifier).toggle(widget.symbol);
          HapticFeedback.lightImpact();
          _ctrl.forward(from: 0);
        },
      ),
    );
  }
}

// ── Chart Tab ─────────────────────────────────────────────────────────────────

class _ChartTab extends ConsumerStatefulWidget {
  const _ChartTab({
    required this.symbol,
    required this.name,
    required this.timeframe,
  });
  final String symbol;
  final String name;
  final String timeframe;

  @override
  ConsumerState<_ChartTab> createState() => _ChartTabState();
}

class _ChartTabState extends ConsumerState<_ChartTab> {
  bool _showSignal = true;
  bool _showTrades = false;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    // Signal/trade overlays render on the in-house chart and the LWC WebView.
    // The real TradingView embed (mapped symbol in tradingView mode) is a
    // sealed widget — skip the fetches there since nothing can render them.
    final provider = ref.watch(chartProviderProvider);
    final overlaysSupported = switch (provider) {
      ChartDataProvider.inHouse || ChartDataProvider.yahoo => true,
      ChartDataProvider.tradingView =>
        TvSymbol.resolveForEmbeddedWidget(widget.symbol) == null,
    };
    final strategy = ref.watch(strategyProvider);

    SignalLevels? levels;
    List<TradeMarker>? markers;
    if (overlaysSupported && _showSignal) {
      final signal = ref
          .watch(_signalProvider((
            symbol: widget.symbol,
            tf: widget.timeframe,
            strategy: strategy.serverParam,
          )))
          .valueOrNull;
      if (signal != null && signal.direction != 'HOLD') {
        levels = SignalLevels(
          entry: signal.entry,
          stopLoss: signal.stopLoss,
          takeProfit: signal.takeProfit,
          direction: signal.direction,
        );
      }
    }
    if (overlaysSupported && _showTrades) {
      final results = ref
          .watch(_backtestProvider(
              (symbol: widget.symbol, tf: widget.timeframe)))
          .valueOrNull;
      final result = results?.where((r) => r.strategy == strategy.label);
      if (result != null && result.isNotEmpty) {
        markers = [
          for (final t in result.first.tradeLog)
            if (t.date != null)
              TradeMarker(
                date: DateTime.parse(t.date!).toUtc(),
                price: t.entryPrice,
                direction: t.direction,
                win: t.win,
              ),
        ];
      }
    }

    Widget chip(String label, bool active, VoidCallback onTap) =>
        GestureDetector(
          onTap: onTap,
          child: Container(
            padding: const EdgeInsets.symmetric(
                horizontal: AppSpacing.s4, vertical: 4),
            decoration: BoxDecoration(
              color: active ? c.accentDim : Colors.transparent,
              borderRadius: BorderRadius.circular(AppRadius.full),
              border: Border.all(color: active ? c.accent : c.border),
            ),
            child: Text(label,
                style: AppTypography.sm.copyWith(
                    color: active ? c.accent : c.textMuted,
                    fontWeight: FontWeight.w600)),
          ),
        );

    return Column(
      children: [
        if (overlaysSupported)
          Padding(
            padding: const EdgeInsets.symmetric(
                horizontal: AppSpacing.s5, vertical: AppSpacing.s2),
            child: Row(
              children: [
                chip('${strategy.label} entry/SL/TP', _showSignal,
                    () => setState(() => _showSignal = !_showSignal)),
                const SizedBox(width: AppSpacing.s3),
                chip('Backtest trades', _showTrades,
                    () => setState(() => _showTrades = !_showTrades)),
              ],
            ),
          ),
        Expanded(
          child: ChartHost(
            symbol: widget.symbol,
            name: widget.name,
            initialRange: '1M',
            withVwap: true,
            showFullscreenButton: true,
            onFullscreen: () => ChartModal.show(context,
                symbol: widget.symbol, name: widget.name),
            signalLevels: levels,
            tradeMarkers: markers,
          ),
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
      final isS9 = s == TradingStrategy.s9 || s == TradingStrategy.s9Plus;
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

    final base = all.sublist(0, 9);     // S1–S9
    final plus = all.sublist(9);        // S1+–S9+

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
          buildRow(base.sublist(0, 4)),
          const SizedBox(height: 5),
          buildRow(base.sublist(4, 8)),
          const SizedBox(height: 5),
          Row(
            children: [
              Expanded(child: chip(base[8])),
              const SizedBox(width: 5),
              const Expanded(child: SizedBox()),
              const SizedBox(width: 5),
              const Expanded(child: SizedBox()),
              const SizedBox(width: 5),
              const Expanded(child: SizedBox()),
            ],
          ),
          const SizedBox(height: AppSpacing.s3),
          Row(
            children: [
              Text('Enhanced',
                  style: AppTypography.xs.copyWith(
                      color: c.accent.withAlpha(180), letterSpacing: 0.5)),
              const SizedBox(width: 4),
              Icon(Icons.bolt_rounded, size: 11, color: c.accent.withAlpha(180)),
            ],
          ),
          const SizedBox(height: 5),
          buildRow(plus.sublist(0, 4)),
          const SizedBox(height: 5),
          buildRow(plus.sublist(4, 8)),
          const SizedBox(height: 5),
          Row(
            children: [
              Expanded(child: chip(plus[8])),
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
    final fundamentalsAsync = ref.watch(_fundamentalsProvider(symbol));

    return async.when(
      loading: () => Center(
          child: CircularProgressIndicator(color: c.accent)),
      error: (_, __) =>
          const ErrorView(message: 'Failed to load indicators'),
      data: (signal) {
        final inds = signal.indicators;
        final fundData = fundamentalsAsync.valueOrNull;
        final epsHistory = (fundData?['epsHistory'] as List?)
            ?.map((e) => (e as num).toDouble())
            .toList() ?? [];
        final epsApplicable = fundData?['epsApplicable'] == true;

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
            if (epsApplicable && epsHistory.isNotEmpty) ...[
              const SizedBox(height: AppSpacing.s4),
              _EpsSection(epsHistory: epsHistory),
            ],
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

class _EpsSection extends StatelessWidget {
  const _EpsSection({required this.epsHistory});
  final List<double> epsHistory;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final reversed = epsHistory.reversed.toList();
    final labels = ['Q-3', 'Q-2', 'Q-1', 'Q0'];
    final quarters = labels.length < reversed.length
        ? labels
        : labels.sublist(labels.length - reversed.length);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('EPS HISTORY',
            style: AppTypography.labelSm.copyWith(
                color: c.textMuted, letterSpacing: 1.2)),
        const SizedBox(height: AppSpacing.s2),
        Container(
          height: 120,
          padding: const EdgeInsets.fromLTRB(
              AppSpacing.s4, AppSpacing.s4, AppSpacing.s4, AppSpacing.s2),
          decoration: BoxDecoration(
            color: c.surfaceCard,
            borderRadius: BorderRadius.circular(AppRadius.md),
            border: Border.all(color: c.border),
          ),
          child: BarChart(
            BarChartData(
              alignment: BarChartAlignment.spaceAround,
              maxY: reversed
                  .map((v) => v > 0 ? v * 1.3 : 0.0)
                  .reduce((a, b) => a > b ? a : b)
                  .clamp(0.1, double.infinity),
              minY: reversed
                  .map((v) => v < 0 ? v * 1.3 : 0.0)
                  .reduce((a, b) => a < b ? a : b),
              barTouchData: BarTouchData(
                touchTooltipData: BarTouchTooltipData(
                  getTooltipItem: (group, groupIndex, rod, rodIndex) {
                    final val = reversed[groupIndex];
                    return BarTooltipItem(
                      '\$${val.toStringAsFixed(2)}',
                      AppTypography.xs.copyWith(color: c.textPrimary),
                    );
                  },
                ),
              ),
              titlesData: FlTitlesData(
                leftTitles: const AxisTitles(
                    sideTitles: SideTitles(showTitles: false)),
                rightTitles: const AxisTitles(
                    sideTitles: SideTitles(showTitles: false)),
                topTitles: const AxisTitles(
                    sideTitles: SideTitles(showTitles: false)),
                bottomTitles: AxisTitles(
                  sideTitles: SideTitles(
                    showTitles: true,
                    getTitlesWidget: (value, meta) {
                      final idx = value.toInt();
                      if (idx < 0 || idx >= quarters.length) {
                        return const SizedBox.shrink();
                      }
                      return Text(
                        quarters[idx],
                        style: AppTypography.xs.copyWith(color: c.textMuted),
                      );
                    },
                  ),
                ),
              ),
              gridData: const FlGridData(show: false),
              borderData: FlBorderData(show: false),
              barGroups: List.generate(reversed.length, (i) {
                final val = reversed[i];
                return BarChartGroupData(
                  x: i,
                  barRods: [
                    BarChartRodData(
                      toY: val,
                      color: val >= 0 ? c.positive : c.danger,
                      width: 20,
                      borderRadius: BorderRadius.circular(AppRadius.xs),
                    ),
                  ],
                );
              }),
            ),
          ),
        ),
      ],
    );
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

class _BacktestTab extends ConsumerStatefulWidget {
  const _BacktestTab({required this.symbol, required this.initialTf});
  final String symbol;
  final String initialTf;

  @override
  ConsumerState<_BacktestTab> createState() => _BacktestTabState();
}

class _BacktestTabState extends ConsumerState<_BacktestTab> {
  static const _tfs = ['1h', '4h', '1d', '1w'];
  late String _tf;

  @override
  void initState() {
    super.initState();
    _tf = _tfs.contains(widget.initialTf) ? widget.initialTf : '1d';
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final args = (symbol: widget.symbol, tf: _tf);
    final async = ref.watch(_backtestProvider(args));

    return Column(children: [
      // TF chip selector
      SizedBox(
        height: 44,
        child: ListView(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.symmetric(horizontal: AppSpacing.s4, vertical: AppSpacing.s2),
          children: _tfs.map((tf) {
            final sel = tf == _tf;
            return Padding(
              padding: const EdgeInsets.only(right: AppSpacing.s2),
              child: GestureDetector(
                onTap: () => setState(() => _tf = tf),
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
                  decoration: BoxDecoration(
                    color: sel ? c.accent : c.surfaceCard,
                    borderRadius: BorderRadius.circular(AppRadius.full),
                    border: Border.all(color: sel ? c.accent : c.border),
                  ),
                  child: Text(tf.toUpperCase(),
                      style: AppTypography.labelSm.copyWith(
                          color: sel ? c.background : c.textSecondary,
                          fontWeight: FontWeight.w700)),
                ),
              ),
            );
          }).toList(),
        ),
      ),
      Expanded(
        child: async.when(
          loading: () => Center(child: CircularProgressIndicator(color: c.accent)),
          error: (e, _) => ErrorView(
            message: e.toString().contains('Unknown symbol')
                ? 'Symbol not available for backtesting'
                : 'Backtest data unavailable',
            onRetry: () => ref.invalidate(_backtestProvider(args)),
          ),
          data: (results) => ListView(
            padding: EdgeInsets.fromLTRB(
              AppSpacing.s5, AppSpacing.s3, AppSpacing.s5,
              appShellBottomInset(context) + AppSpacing.s3,
            ),
            children: [
              Row(children: [
                Text('Historical Backtest · ${_tf.toUpperCase()}',
                    style: AppTypography.headingSm.copyWith(color: c.textPrimary)),
                const SizedBox(width: AppSpacing.s2),
                GestureDetector(
                  onTap: () => _showBacktestMethodInfo(context),
                  child: Icon(Icons.info_outline_rounded, size: 16, color: c.textMuted),
                ),
              ]),
              const SizedBox(height: AppSpacing.s2),
              GestureDetector(
                onTap: () => _showBacktestMethodInfo(context),
                child: Text('SL/TP exits · full history · tap for details',
                    style: AppTypography.sm.copyWith(color: c.textMuted)),
              ),
              const SizedBox(height: AppSpacing.s5),
              ...results.map((r) => _BacktestCard(result: r)),
            ],
          ),
        ),
      ),
    ]);
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
            icon: Icons.history_rounded,
            color: c.accent,
            title: 'Full History — No Train/Test Split',
            description: 'Every available candle is tested. These strategies use fixed indicator parameters (RSI 14, EMA 20, etc.) — there is nothing to fit or optimise on historical data, so withholding a training set would only reduce the sample size without adding protection against overfitting.',
          ),
          const SizedBox(height: AppSpacing.s4),
          _BacktestInfoRow(
            icon: Icons.flag_outlined,
            color: c.warning,
            title: 'SL/TP Exits — Bar-by-Bar',
            description: 'Each trade uses the same stop-loss and take-profit levels the strategy would set in live trading. Every subsequent bar checks whether its low hit the SL or its high hit the TP. The trade exits as soon as one is touched. If neither is hit within the max hold window (20 bars on 1D), the trade closes at the final bar close — shown as "TO" (timeout) in the trade log.',
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
                  width: 66,
                  child: Text('Date',
                      style: AppTypography.xs
                          .copyWith(color: c.textMuted))),
              SizedBox(
                  width: 38,
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
                  width: 38,
                  child: Text('Why',
                      style: AppTypography.xs
                          .copyWith(color: c.textMuted))),
              SizedBox(
                  width: 52,
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

    // Format YYYY-MM-DD → "Jun 6" style
    String dateLabel = '—';
    if (trade.date != null && trade.date!.length == 10) {
      final parts = trade.date!.split('-');
      if (parts.length == 3) {
        const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        final m = int.tryParse(parts[1]) ?? 0;
        final d = int.tryParse(parts[2]) ?? 0;
        final yy = parts[0].length >= 4 ? parts[0].substring(2) : parts[0];
        if (m >= 1 && m <= 12) dateLabel = "${months[m - 1]} $d '$yy";
      }
    }

    // Exit reason badge color
    Color reasonColor;
    String reasonLabel;
    switch (trade.exitReason) {
      case 'TP':
        reasonColor = c.positive;
        reasonLabel = 'TP';
      case 'SL':
        reasonColor = c.danger;
        reasonLabel = 'SL';
      default:
        reasonColor = c.textMuted;
        reasonLabel = 'TO';
    }

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
            width: 66,
            child: Text(dateLabel,
                style: AppTypography.xs
                    .copyWith(color: c.textSecondary)),
          ),
          SizedBox(
            width: 38,
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
            width: 38,
            child: Container(
              padding:
                  const EdgeInsets.symmetric(horizontal: 4, vertical: 1),
              decoration: BoxDecoration(
                color: reasonColor.withAlpha(30),
                borderRadius: BorderRadius.circular(3),
              ),
              child: Text(
                reasonLabel,
                style: AppTypography.xs.copyWith(
                    color: reasonColor, fontWeight: FontWeight.w700),
                textAlign: TextAlign.center,
              ),
            ),
          ),
          SizedBox(
            width: 52,
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

// ── Signal Trace Tab ──────────────────────────────────────────────────────────

// Flex weights: label=3 | 1m=3 | 1h=3 | 4h=3 | 1d=3 | win=2 | ret=3 (total 20)
const _kLabelFlex = 3;
const _kTfFlex    = 3;
const _kWinFlex   = 2;
const _kRetFlex   = 3;

class _SignalTraceTab extends ConsumerWidget {
  const _SignalTraceTab({required this.symbol, required this.name});
  final String symbol;
  final String name;

  // S9 / S9+ are only meaningful on 1h — return "—" on other TFs.
  static const _s9Ids = {'9', '18'};
  static const _tfs = ['1h', '4h', '1d', '1w'];

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;

    if (!EntitlementService.can('signals_advanced')) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.s6),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.lock_outline_rounded, color: c.textMuted, size: 40),
              const SizedBox(height: AppSpacing.s4),
              Text('Signal Trace requires Pro',
                  style: AppTypography.headingSm.copyWith(color: c.textPrimary)),
              const SizedBox(height: AppSpacing.s2),
              Text('Upgrade to see all 18 strategies across 4 timeframes.',
                  style: AppTypography.sm.copyWith(color: c.textSecondary),
                  textAlign: TextAlign.center),
              const SizedBox(height: AppSpacing.s5),
              FilledButton(
                onPressed: () => UpgradeSheet.show(context, feature: 'signals_advanced'),
                child: const Text('Upgrade to Pro'),
              ),
            ],
          ),
        ),
      );
    }

    final traceAsync    = ref.watch(_signalTraceProvider(symbol));
    final btTraceAsync  = ref.watch(_traceBacktestProvider(symbol));

    // Show shimmer until both loads complete.
    if (traceAsync.isLoading || btTraceAsync.isLoading) {
      return const Padding(
        padding: EdgeInsets.all(AppSpacing.s4),
        child: ShimmerList(count: 18),
      );
    }

    final traceError = traceAsync.error;
    if (traceError != null) {
      return ErrorView(
        message: 'Signal trace unavailable',
        onRetry: () {
          ref.invalidate(_signalTraceProvider(symbol));
          ref.invalidate(_traceBacktestProvider(symbol));
        },
      );
    }

    final traceData  = traceAsync.value!;   // Map<tf, List<SignalTracePair>>
    final btByTf     = btTraceAsync.value ?? {};  // Map<tf, List<BacktestResult>>
    // Per-TF lookup: btByTf[tf][stratId] → BacktestResult
    final btIndex    = <String, Map<String, BacktestResult>>{
      for (final tf in _tfs)
        tf: {
          for (final r in (btByTf[tf] ?? [])) _stratNumFromLabel(r.strategy): r,
        },
    };

    // Pair list from the 1d call (just for row ordering — 9 pairs, S1–S9).
    final pairs = traceData['1d'] ?? [];
    if (pairs.isEmpty) {
      return Center(
        child: Text('No signal data available.',
            style: AppTypography.sm.copyWith(color: c.textMuted)),
      );
    }

    return ListView(
      padding: EdgeInsets.fromLTRB(12, 12, 12, appShellBottomInset(context) + 12),
      children: [
        // Asset chip header + info icon
        Row(children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
            decoration: BoxDecoration(
              color: c.accent.withAlpha(22),
              borderRadius: BorderRadius.circular(AppRadius.full),
              border: Border.all(color: c.accent.withAlpha(70)),
            ),
            child: Text(name,
                style: AppTypography.labelSm.copyWith(color: c.accent)),
          ),
          const Spacer(),
          GestureDetector(
            onTap: () => _showTraceInfoSheet(context),
            child: Icon(Icons.info_outline_rounded, size: 18, color: c.textMuted),
          ),
        ]),
        const SizedBox(height: 12),
        // Column headers — matches flex layout of rows
        _TraceColumnHeaders(c: c),
        const SizedBox(height: 6),
        // 9 pair cards
        for (int i = 0; i < pairs.length; i++) ...[
          _TracePairCard(
            pair: pairs[i],
            traceData: traceData,
            btIndex: btIndex,
            tfs: _tfs,
            s9Ids: _s9Ids,
            c: c,
          ),
          if (i < pairs.length - 1) const SizedBox(height: 4),
        ],
      ],
    );
  }

  static String _stratNumFromLabel(String label) {
    if (label.endsWith('+')) {
      final n = int.tryParse(label.substring(1, label.length - 1)) ?? 1;
      return '${n + 9}';
    }
    return label.substring(1);
  }
}

void _showTraceInfoSheet(BuildContext context) {
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
      initialChildSize: 0.82,
      minChildSize: 0.4,
      maxChildSize: 0.95,
      builder: (ctx, scrollCtrl) => Column(children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 20, 20, 0),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Center(
              child: Container(
                width: 36, height: 4,
                decoration: BoxDecoration(
                  color: c.border,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            const SizedBox(height: 20),
            Row(children: [
              Icon(Icons.grid_view_rounded, color: c.accent, size: 20),
              const SizedBox(width: 8),
              Text('How to read Signal Trace',
                  style: AppTypography.headingMd.copyWith(color: c.textPrimary)),
            ]),
            const SizedBox(height: 6),
            Text(
              'Signal Trace shows every strategy\'s signal in one place — across all timeframes — so you can spot consensus at a glance.',
              style: AppTypography.sm.copyWith(color: c.textSecondary),
            ),
          ]),
        ),
        Expanded(
          child: ListView(
            controller: scrollCtrl,
            padding: EdgeInsets.fromLTRB(
                20, 16, 20, 24 + MediaQuery.of(ctx).padding.bottom),
            children: [
              // ── Columns explained ──
              _InfoSection(
                icon: Icons.view_column_rounded,
                title: 'Columns',
                color: c.accent,
                items: const [
                  _InfoItem('1H', 'Hourly signal — for active traders who check positions a few times a day.'),
                  _InfoItem('4H', '4-hour signal — swing traders\' sweet spot. Fewer signals, less noise.'),
                  _InfoItem('1D', 'Daily signal — one signal per day. Best for most investors.'),
                  _InfoItem('1W', 'Weekly signal — macro trend confirmation. Changes slowly; high quality.'),
                  _InfoItem('WIN (1D)',
                      'Win rate from daily backtests over the past year — % of trades that were profitable.'),
                  _InfoItem('RET (1D)',
                      'Compounded return from daily backtests over the past year. Positive = made money.'),
                ],
              ),
              const SizedBox(height: 16),

              // ── Signal badges ──
              _InfoSection(
                icon: Icons.label_rounded,
                title: 'Signal badges',
                color: c.textSecondary,
                items: [
                  _InfoItem('BUY', 'The strategy thinks price is likely to go up from here.', badgeDir: 'BUY', c: c),
                  _InfoItem('SELL', 'The strategy thinks price is likely to go down from here.', badgeDir: 'SELL', c: c),
                  _InfoItem('HOLD', 'No strong edge detected — stay flat or hold an existing position.', badgeDir: 'HOLD', c: c),
                  const _InfoItem('—', 'Not applicable for this timeframe (e.g. S9 only runs on 1H).'),
                ],
              ),
              const SizedBox(height: 16),

              // ── Strategies ──
              _InfoSection(
                icon: Icons.psychology_rounded,
                title: 'Strategies (S1 – S9)',
                color: c.textSecondary,
                items: const [
                  _InfoItem('S1 – S3', 'Foundation strategies: pure technical analysis, multi-factor, and a hybrid that blends charts with news sentiment.'),
                  _InfoItem('S4 – S6', 'Regime-aware strategies that detect whether the market is trending, ranging, or volatile before signalling.'),
                  _InfoItem('S7 – S8', 'Institutional-grade: APEX probabilistic engine (S7) and a consensus vote across S4/S5/S7 (S8).'),
                  _InfoItem('S9', 'Silver Liquidity Sweep — monitors large-order liquidity sweeps in silver futures. Only valid on 1H.'),
                ],
              ),
              const SizedBox(height: 16),

              // ── Enhanced ──
              _InfoSection(
                icon: Icons.bolt_rounded,
                title: 'Enhanced strategies (S1+ – S9+)',
                color: c.accent,
                items: const [
                  _InfoItem('What is S+?',
                      'Each S+ variant layers a higher-timeframe trend filter on top of the base strategy. A signal is only issued when the short-term setup AND the bigger-picture trend agree — this cuts false signals at the cost of fewer trades.'),
                  _InfoItem('When to prefer S+ over S',
                      'In choppy or sideways markets S+ stays quiet while S may fire too often. In strong trends both tend to agree, giving you extra confidence.'),
                ],
              ),
              const SizedBox(height: 16),

              // ── How to use ──
              _InfoSection(
                icon: Icons.lightbulb_rounded,
                title: 'How to use this table',
                color: c.warning,
                items: const [
                  _InfoItem('Look for consensus',
                      'When multiple strategies show the same direction across multiple timeframes, the signal is stronger.'),
                  _InfoItem('Timeframe alignment',
                      'A BUY on 1D confirmed by a BUY on 4H and 1H is more reliable than a lone 1M signal going the opposite way.'),
                  _InfoItem('Win% + Return together',
                      'High Win% with low Return can mean the wins are small. High Return with low Win% means big wins and big losses — higher risk. Look for both to be healthy.'),
                  _InfoItem('Small trade count warning',
                      'S9 may only have 5–15 trades in a year — treat its stats as illustrative, not statistically firm.'),
                ],
              ),
            ],
          ),
        ),
      ]),
    ),
  );
}

class _InfoSection extends StatelessWidget {
  const _InfoSection({
    required this.icon,
    required this.title,
    required this.color,
    required this.items,
  });
  final IconData icon;
  final String title;
  final Color color;
  final List<_InfoItem> items;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Row(children: [
        Icon(icon, size: 14, color: color),
        const SizedBox(width: 6),
        Text(title,
            style: AppTypography.labelMd
                .copyWith(color: c.textPrimary, fontWeight: FontWeight.w700)),
      ]),
      const SizedBox(height: 8),
      Container(
        decoration: BoxDecoration(
          color: c.surfaceCard,
          borderRadius: BorderRadius.circular(AppRadius.md),
          border: Border.all(color: c.border),
        ),
        child: Column(children: [
          for (int i = 0; i < items.length; i++) ...[
            items[i],
            if (i < items.length - 1)
              Divider(height: 1, color: c.border),
          ],
        ]),
      ),
    ]);
  }
}

class _InfoItem extends StatelessWidget {
  const _InfoItem(this.term, this.definition, {this.badgeDir, this.c});
  final String term;
  final String definition;
  final String? badgeDir;
  final AppPalette? c;

  @override
  Widget build(BuildContext context) {
    final palette = c ?? context.colors;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        if (badgeDir != null) ...[
          _TraceBadge(direction: badgeDir, isDash: false, c: palette),
          const SizedBox(width: 10),
        ] else ...[
          SizedBox(
            width: 76,
            child: Text(term,
                style: AppTypography.labelSm
                    .copyWith(color: palette.textPrimary, fontWeight: FontWeight.w700)),
          ),
          const SizedBox(width: 8),
        ],
        Expanded(
          child: Text(definition,
              style: AppTypography.xs.copyWith(color: palette.textSecondary)),
        ),
      ]),
    );
  }
}

// Column header row — uses same flex weights as data rows so columns align.
class _TraceColumnHeaders extends StatelessWidget {
  const _TraceColumnHeaders({required this.c});
  final AppPalette c;

  @override
  Widget build(BuildContext context) {
    final s = AppTypography.xs.copyWith(
        color: c.textMuted, fontWeight: FontWeight.w700, letterSpacing: 0.6);
    return Padding(
      padding: const EdgeInsets.only(left: 3 + 10, right: 10), // left: accent border + padding
      child: Row(children: [
        Expanded(flex: _kLabelFlex, child: Text('STRAT', style: s)),
        Expanded(flex: _kTfFlex, child: Text('1H', style: s, textAlign: TextAlign.center)),
        Expanded(flex: _kTfFlex, child: Text('4H', style: s, textAlign: TextAlign.center)),
        Expanded(flex: _kTfFlex, child: Text('1D', style: s, textAlign: TextAlign.center)),
        Expanded(flex: _kTfFlex, child: Text('1W', style: s, textAlign: TextAlign.center)),
        Expanded(flex: _kWinFlex, child: Text('WIN', style: s, textAlign: TextAlign.center)),
        Expanded(flex: _kRetFlex, child: Text('RET(1D)', style: s, textAlign: TextAlign.end)),
      ]),
    );
  }
}

// Rounded card wrapping a base + enhanced row pair.
class _TracePairCard extends StatelessWidget {
  const _TracePairCard({
    required this.pair,
    required this.traceData,
    required this.btIndex,
    required this.tfs,
    required this.s9Ids,
    required this.c,
  });

  final SignalTracePair pair;
  final Map<String, List<SignalTracePair>> traceData;
  // btIndex[tf][stratId] → BacktestResult for that TF
  final Map<String, Map<String, BacktestResult>> btIndex;
  final List<String> tfs;
  final Set<String> s9Ids;
  final AppPalette c;

  String? _dirFor(String tf, String stratId) {
    final list = traceData[tf];
    if (list == null) return null;
    for (final p in list) {
      if (p.baseId == stratId) return p.baseDir;
      if (p.enhId  == stratId) return p.enhDir;
    }
    return null;
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: c.surface,
        borderRadius: BorderRadius.circular(AppRadius.md),
        border: Border.all(color: c.border),
      ),
      clipBehavior: Clip.hardEdge,
      child: Column(children: [
        _TraceDataRow(
          label: 'S${pair.baseId}',
          stratId: pair.baseId,
          isEnhanced: false,
          tfs: tfs,
          s9Ids: s9Ids,
          dirFor: _dirFor,
          btIndex: btIndex,
          c: c,
        ),
        Divider(height: 1, thickness: 1, color: c.border),
        _TraceDataRow(
          label: 'S${pair.baseId}+',
          stratId: pair.enhId,
          isEnhanced: true,
          tfs: tfs,
          s9Ids: s9Ids,
          dirFor: _dirFor,
          btIndex: btIndex,
          c: c,
        ),
      ]),
    );
  }
}

// Per-TF win%/ret% helper — computes stats from the backtest for the given TF and stratId.
({double? win, double? ret}) _tfStats(
    Map<String, Map<String, BacktestResult>> btIndex, String tf, String stratId) {
  final log = btIndex[tf]?[stratId]?.tradeLog ?? [];
  if (log.isEmpty) return (win: null, ret: null);
  final wins = log.where((t) => t.win).length;
  double equity = 1.0;
  for (final t in log) { equity *= 1 + t.returnPct / 100; }
  return (win: wins / log.length * 100, ret: (equity - 1) * 100);
}

// A single strategy row inside a card.
class _TraceDataRow extends StatelessWidget {
  const _TraceDataRow({
    required this.label,
    required this.stratId,
    required this.isEnhanced,
    required this.tfs,
    required this.s9Ids,
    required this.dirFor,
    required this.btIndex,
    required this.c,
  });

  final String label;
  final String stratId;
  final bool isEnhanced;
  final List<String> tfs;
  final Set<String> s9Ids;
  final String? Function(String tf, String stratId) dirFor;
  final Map<String, Map<String, BacktestResult>> btIndex;
  final AppPalette c;

  @override
  Widget build(BuildContext context) {
    final isS9 = s9Ids.contains(stratId);

    // For win/ret we show a single column pair — use 1D as the representative TF
    // (most data, most reliable) and label it clearly.
    final stats1d = _tfStats(btIndex, '1d', stratId);
    final winRate1y   = stats1d.win;
    final totalReturn = stats1d.ret;

    final retColor = totalReturn == null
        ? c.textFaint
        : totalReturn >= 0 ? c.positive : c.danger;
    final winColor = winRate1y == null
        ? c.textFaint
        : winRate1y >= 50 ? c.positive : c.danger;

    final retStr = totalReturn == null
        ? '—'
        : '${totalReturn >= 0 ? '+' : ''}${totalReturn.toStringAsFixed(0)}%';
    final winStr = winRate1y == null
        ? '—'
        : '${winRate1y.toStringAsFixed(0)}%';

    return IntrinsicHeight(
      child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        // Left accent rail
        Container(
          width: 3,
          color: isEnhanced ? c.accent : Colors.transparent,
        ),
        // Content
        Expanded(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 9),
            child: Row(children: [
              // Strategy label
              Expanded(
                flex: _kLabelFlex,
                child: Text(
                  label,
                  style: AppTypography.labelSm.copyWith(
                    color: isEnhanced ? c.accent : c.textPrimary,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
              // 4 timeframe signal badges
              for (final tf in tfs)
                Expanded(
                  flex: _kTfFlex,
                  child: Center(
                    child: _TraceBadge(
                      direction: (isS9 && tf != '1h') ? null : dirFor(tf, stratId),
                      isDash: isS9 && tf != '1h',
                      c: c,
                    ),
                  ),
                ),
              // Win%
              Expanded(
                flex: _kWinFlex,
                child: Text(winStr,
                    style: AppTypography.xs.copyWith(
                        color: winColor, fontWeight: FontWeight.w700),
                    textAlign: TextAlign.center),
              ),
              // Return%
              Expanded(
                flex: _kRetFlex,
                child: Text(retStr,
                    style: AppTypography.xs.copyWith(
                        color: retColor, fontWeight: FontWeight.w700),
                    textAlign: TextAlign.end),
              ),
            ]),
          ),
        ),
      ]),
    );
  }
}

// Signal direction badge — full word, vivid fill.
class _TraceBadge extends StatelessWidget {
  const _TraceBadge({required this.direction, required this.isDash, required this.c});
  final String? direction;
  final bool isDash;
  final AppPalette c;

  @override
  Widget build(BuildContext context) {
    if (isDash || direction == null) {
      return Text('—',
          style: AppTypography.xs.copyWith(color: c.textFaint),
          textAlign: TextAlign.center);
    }

    final Color fg;
    final Color bg;
    switch (direction!.toUpperCase()) {
      case 'BUY':
        fg = c.positive;
        bg = c.positive.withAlpha(50);
      case 'SELL':
        fg = c.danger;
        bg = c.danger.withAlpha(50);
      default:
        fg = c.warning;
        bg = c.warning.withAlpha(50);
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 3),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(5),
      ),
      child: Text(
        direction!,
        style: AppTypography.xs.copyWith(
            color: fg, fontWeight: FontWeight.w800, letterSpacing: 0.2),
        textAlign: TextAlign.center,
        maxLines: 1,
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
      loading: () => Center(child: CircularProgressIndicator(color: c.accent)),
      error: (_, __) => const ErrorView(message: 'News unavailable'),
      data: (result) => Column(
        children: [
          _NewsMoodBanner(
            score: result.aggregateSentiment,
            articleCount: result.articles.length,
            c: c,
          ),
          Expanded(
            child: ListView.builder(
              padding: EdgeInsets.fromLTRB(
                AppSpacing.s5,
                AppSpacing.s3,
                AppSpacing.s5,
                AppSpacing.s5 + MediaQuery.of(context).padding.bottom,
              ),
              itemCount: result.articles.length,
              itemBuilder: (ctx, i) => _NewsCard(article: result.articles[i]),
            ),
          ),
        ],
      ),
    );
  }
}

class _NewsMoodBanner extends StatelessWidget {
  const _NewsMoodBanner({
    required this.score,
    required this.articleCount,
    required this.c,
  });
  final double score;
  final int articleCount;
  final AppPalette c;

  @override
  Widget build(BuildContext context) {
    final (label, color) = score > 20
        ? ('BULLISH', c.positive)
        : score < -20
            ? ('BEARISH', c.danger)
            : ('NEUTRAL', c.warning);

    return Container(
      margin: const EdgeInsets.fromLTRB(
          AppSpacing.s5, AppSpacing.s5, AppSpacing.s5, 0),
      padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.s4, vertical: AppSpacing.s3),
      decoration: BoxDecoration(
        color: color.withAlpha(18),
        borderRadius: BorderRadius.circular(AppRadius.md),
        border: Border.all(color: color.withAlpha(60)),
      ),
      child: Row(
        children: [
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Text('News Mood',
                      style: AppTypography.xs.copyWith(color: c.textMuted)),
                  const SizedBox(width: 4),
                  GestureDetector(
                    onTap: () => _showNewsMoodInfoModal(context, c),
                    child: Icon(Icons.info_outline_rounded,
                        size: 12, color: c.textFaint),
                  ),
                ],
              ),
              const SizedBox(height: 2),
              Text(
                'Based on $articleCount article${articleCount == 1 ? '' : 's'}',
                style: AppTypography.xs.copyWith(color: c.textMuted),
              ),
            ],
          ),
          const Spacer(),
          Container(
            padding:
                const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
            decoration: BoxDecoration(
              color: color.withAlpha(30),
              borderRadius: BorderRadius.circular(AppRadius.full),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(label,
                    style: AppTypography.labelSm.copyWith(
                        color: color, fontWeight: FontWeight.w700)),
                const SizedBox(width: 6),
                Text(
                  '${score > 0 ? '+' : ''}${score.toStringAsFixed(0)}',
                  style: AppTypography.labelSm
                      .copyWith(color: color.withAlpha(180)),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

void _showNewsMoodInfoModal(BuildContext context, AppPalette c) {
  showModalBottomSheet(
    context: context,
    backgroundColor: c.surface,
    isScrollControlled: true,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (_) => DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.6,
      minChildSize: 0.4,
      maxChildSize: 0.85,
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
                Text('How News Mood Works',
                    style:
                        AppTypography.headingMd.copyWith(color: c.textPrimary)),
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
                AppSpacing.s8 + MediaQuery.of(ctx).padding.bottom,
              ),
              children: [
                _MoodInfoRow(
                  c: c,
                  title: 'What it measures',
                  body:
                      'The score averages the sentiment of the most recent headlines '
                      'for this asset. Each headline is scored from −100 (very bearish) '
                      'to +100 (very bullish), then averaged.',
                ),
                _MoodInfoRow(
                  c: c,
                  title: 'BULLISH / NEUTRAL / BEARISH thresholds',
                  body:
                      'Score above +20 → BULLISH. Score below −20 → BEARISH. '
                      'Everything in between is NEUTRAL. The wide neutral band accounts '
                      'for scoring noise.',
                ),
                _MoodInfoRow(
                  c: c,
                  title: 'Scoring method',
                  body:
                      'When a premium news data source is available, per-ticker NLP sentiment '
                      'is used and is reasonably accurate for clear headline language. '
                      'Without that source, scoring falls back to keyword matching '
                      '(e.g. "surge", "rally" vs "crash", "plunge") with no negation '
                      'handling — so "not rising" still scores as bullish. '
                      'Accuracy on nuanced or compound headlines is lower in that mode.',
                ),
                _MoodInfoRow(
                  c: c,
                  title: 'Small sample caveat',
                  body:
                      'Only 3–8 headlines are analysed. A single strongly-worded '
                      'headline can swing the score significantly. Treat the label as a '
                      'rough directional signal, not a statistically stable reading.',
                ),
                _MoodInfoRow(
                  c: c,
                  title: 'Not a buy or sell signal',
                  body:
                      'News Mood reflects recent media framing of an asset, not a '
                      'trading recommendation. Price action frequently diverges from '
                      'headline sentiment. Use this alongside technical signals and '
                      'your own analysis.',
                  isLast: true,
                ),
              ],
            ),
          ),
        ],
      ),
    ),
  );
}

class _MoodInfoRow extends StatelessWidget {
  const _MoodInfoRow({
    required this.c,
    required this.title,
    required this.body,
    this.isLast = false,
  });
  final AppPalette c;
  final String title;
  final String body;
  final bool isLast;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(bottom: isLast ? 0 : AppSpacing.s5),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title,
              style: AppTypography.labelMd
                  .copyWith(color: c.textPrimary, fontWeight: FontWeight.w600)),
          const SizedBox(height: AppSpacing.s2),
          Text(body,
              style:
                  AppTypography.sm.copyWith(color: c.textSecondary, height: 1.5)),
        ],
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
