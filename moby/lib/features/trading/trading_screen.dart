import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/network/api_client.dart';
import '../../core/network/api_endpoints.dart';
import '../../core/theme/app_palette.dart';
import '../../services/entitlement_service.dart';
import '../../shared/widgets/upgrade_sheet.dart';
import '../../core/theme/app_typography.dart';
import '../../core/theme/app_spacing.dart';
import '../../data/models/trading_signal.dart';
import '../../data/models/price_alert.dart';
import '../../data/repositories/trading_repository.dart';
import '../../providers/strategy_provider.dart';
import '../../providers/alert_provider.dart';
import '../../shared/widgets/signal_badge.dart';
import '../../shared/widgets/error_view.dart';
import '../../shared/widgets/freshness_bar.dart';
import '../../shared/widgets/glass_card.dart';
import '../../shared/widgets/max_width_layout.dart';
import '../../shared/widgets/theme_toggle.dart';
import '../../providers/watchlist_provider.dart';

// ── Providers ─────────────────────────────────────────────────────────────────

final _quotesProvider = FutureProvider.autoDispose<List<QuoteItem>>(
    (_) => TradingRepository.instance.fetchQuotes());

final _stockSearchProvider = FutureProvider.autoDispose
    .family<List<StockSearchResult>, String>(
  (_, query) => TradingRepository.instance.searchStocks(query),
);

final _tenXAssetScannerProvider = FutureProvider.autoDispose<List<TenXScanResult>>(
  (_) => TradingRepository.instance.fetchTenXAssets(),
);

final _tenXStockScannerProvider = FutureProvider.autoDispose<List<TenXScanResult>>(
  (_) => TradingRepository.instance.fetchTenXStocks(),
);

final _tenXV2AssetScannerProvider = FutureProvider.autoDispose<List<TenXScanResult>>(
  (_) => TradingRepository.instance.fetchTenXV2Assets(),
);

final _tenXV2StockScannerProvider = FutureProvider.autoDispose<List<TenXScanResult>>(
  (_) => TradingRepository.instance.fetchTenXV2Stocks(),
);

final _bestSetupsProvider = FutureProvider.autoDispose
    .family<BestSetupsResponse, ({String version, String type})>(
  (_, args) => TradingRepository.instance.fetchBestSetups(
    version: args.version,
    type: args.type,
  ),
);

final _signalProvider = FutureProvider.autoDispose
    .family<TradingSignal, ({String symbol, String tf, String strategy})>(
  (ref, args) async {
    // Keep the result alive so ListView.builder scroll doesn't re-fetch
    // when items scroll off and back into view.
    final link = ref.keepAlive();
    try {
      return await TradingRepository.instance.fetchSignal(
        args.symbol,
        timeframe: args.tf,
        strategy: args.strategy,
      );
    } catch (_) {
      link.close(); // don't cache errors — allow retry on next watch
      rethrow;
    }
  },
);

// ── Strategy definitions (fetched from server, fallback to hardcoded) ─────────

class _StrategyDef {
  const _StrategyDef({
    required this.label,
    required this.title,
    required this.description,
    required this.detail,
    required this.accentHex,
  });
  final String label;
  final String title;
  final String description;
  final String detail;
  final String accentHex;

  factory _StrategyDef.fromJson(Map<String, dynamic> j) => _StrategyDef(
        label: j['label'] as String,
        title: j['title'] as String,
        description: j['description'] as String,
        detail: j['detail'] as String,
        accentHex: j['accentHex'] as String,
      );

  Color get accentColor {
    final hex = accentHex.replaceAll('#', '');
    return Color(int.parse('FF$hex', radix: 16));
  }
}

const _fallbackStrategies = [
  _StrategyDef(label: 'S1', title: 'Technical Analysis', description: 'Pure price-action signals using momentum and volatility indicators.', detail: 'RSI-14 · MACD · EMA crossovers · Bollinger Bands · ATR · Rate of Change', accentHex: '00D4AA'),
  _StrategyDef(label: 'S2', title: 'Multi-Factor', description: 'Builds on S1 with volatility-adaptive entry and exit thresholds.', detail: 'All S1 indicators + dynamic thresholds calibrated to current market vol', accentHex: 'FFB84D'),
  _StrategyDef(label: 'S3', title: 'Hybrid (Tech + Sentiment)', description: 'Blends technical signals with real-time news sentiment scoring.', detail: 'S1 signals (65%) + NLP sentiment from latest headlines (35%)', accentHex: 'FF4D6A'),
  _StrategyDef(label: 'S4', title: 'Regime-Adaptive', description: 'Detects market regime first, then activates the right engine — Trend or Mean Reversion.', detail: 'ADX > 25 → Trend Engine (EMA200 1.2×, MACD, Volume) · ADX < 18 → Range Engine (RSI, Bollinger, ATR) · High-conviction threshold (0.55)', accentHex: '00C49A'),
  _StrategyDef(label: 'S5', title: 'Professional Systematic', description: 'Four-regime classification with dynamic indicator weights, consensus gate, and calibrated confidence — built for high-probability setups.', detail: 'Quiet Trend (0.45) · Quiet Range (0.60) · Volatile Trend (0.65) · Chaotic → No Trade · ≥60% consensus required · OBV + volume confirmation · score-to-win-rate calibration', accentHex: 'FFB84D'),
  _StrategyDef(label: 'S6', title: 'Adaptive Hybrid', description: 'Regime-aware fusion of S2 technical signals and enhanced news sentiment — weights shift automatically based on volatility and trend strength.', detail: 'High-vol: tech 90% / news 10% · Strong-trend: 85/15 · Low-vol: 60/40 · Default: 70/30 · Freshness decay · Source credibility · Negation detection · BUY >0.45 / SELL <−0.35', accentHex: '00D4AA'),
  _StrategyDef(label: 'S7', title: 'APEX — Adaptive Probabilistic EXecution', description: 'Five-regime classifier with regime-specific direction engines, divergence veto, higher-timeframe permission layer, and a 0–100 quality gate that must hit 60 before any trade fires.', detail: 'Strong Trend · Weak Trend · Ranging · Volatile Breakout · Chaotic (no trade) · VWAP · OBV · Divergence veto · HTF alignment · Cross-asset confirmation · Regime-aware SL/TP (1:1.8 → 2:4.5)', accentHex: 'FF4D6A'),
  _StrategyDef(label: 'S8', title: 'Ensemble — S4 + S5 + S7 Weighted Consensus', description: 'Runs three strategies simultaneously and weights their votes by per-regime historical accuracy. Requires 2 of 3 to agree before firing — when engines split, the answer is HOLD.', detail: 'Strong Trend: S7 50% · S4 35% · S5 15% · Ranging: S5 45% · S7 35% · S4 20% · Volatile Break: S7 55% · S4 35% · S5 10% · Full position on 3/3 · 60% size on 2/3 · No trade on 1/3 or split', accentHex: '00C49A'),
  _StrategyDef(label: 'S9', title: 'Silver Liquidity Sweep', description: 'Session-gated stop-hunt entries at Fibonacci confluence — optimised for Silver (SI=F) intraday. Fires only when all four conditions align simultaneously.', detail: 'London KZ (02:00–05:00 ET) · NY KZ (07:00–10:00 ET) · Liquidity sweep (wick beyond recent H/L, close back inside) · 9 EMA power candle (body >60% of range) · Fib 0.618/0.786 long · Fib 0.236/0.382 short', accentHex: 'C0C0C0'),
];

final _strategiesProvider = FutureProvider<List<_StrategyDef>>((ref) async {
  try {
    final data = await ApiClient.instance.get(ApiEndpoints.tradingStrategies) as Map<String, dynamic>;
    final list = data['strategies'] as List;
    return list.map((e) => _StrategyDef.fromJson(e as Map<String, dynamic>)).toList();
  } catch (_) {
    return _fallbackStrategies;
  }
});

// ── Screen ────────────────────────────────────────────────────────────────────

class TradingScreen extends StatefulWidget {
  const TradingScreen({super.key});

  @override
  State<TradingScreen> createState() => _TradingScreenState();
}

class _TradingScreenState extends State<TradingScreen>
    with SingleTickerProviderStateMixin {
  late final TabController _tab;
  @override
  void initState() {
    super.initState();
    _tab = TabController(length: 4, vsync: this);
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
      resizeToAvoidBottomInset: false,
      backgroundColor: c.background,
      appBar: AppBar(
        title: Text('Trading',
            style: AppTypography.headingMd.copyWith(color: c.textPrimary)),
        backgroundColor: c.headerBg,
        actions: const [ThemeToggleButton()],
        bottom: TabBar(
          controller: _tab,
          tabs: const [
            Tab(text: 'Dashboard'),
            Tab(text: 'Signals'),
            Tab(text: 'Alerts'),
            Tab(text: '10X'),
          ],
        ),
      ),
      body: MaxWidthLayout(
        child: TabBarView(
          controller: _tab,
          children: const [
            _DashboardTab(),
            _SignalsTab(),
            _AlertsTab(),
            _ScannerTab(),
          ],
        ),
      ),
    );
  }
}

// ── Dashboard Tab ─────────────────────────────────────────────────────────────

class _DashboardTab extends ConsumerStatefulWidget {
  const _DashboardTab();

  @override
  ConsumerState<_DashboardTab> createState() => _DashboardTabState();
}

class _DashboardTabState extends ConsumerState<_DashboardTab>
    with WidgetsBindingObserver {
  String _category = 'All';
  Timer? _refreshTimer;
  DateTime _lastQuotesUpdate = DateTime.now();

  static const _categories = ['Watchlist', 'Commodities', 'Indices', 'Stocks', 'Forex', 'Crypto', 'All'];

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _startTimer();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _refreshTimer?.cancel();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.paused) {
      _refreshTimer?.cancel();
    } else if (state == AppLifecycleState.resumed) {
      _startTimer();
    }
  }

  void _startTimer() {
    _refreshTimer?.cancel();
    _refreshTimer = Timer.periodic(const Duration(seconds: 15), (_) {
      ref.invalidate(_quotesProvider);
      setState(() => _lastQuotesUpdate = DateTime.now());
    });
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;

    // Stocks mode: bypass quotes provider and show search UI
    if (_category == 'Stocks') {
      return Column(
        children: [
          _CategoryFilter(
            selected: _category,
            categories: _categories,
            onSelect: (cat) => setState(() => _category = cat),
          ),
          const Expanded(child: _StocksSearchView()),
        ],
      );
    }

    // Watchlist mode: filter to only watched symbols
    if (_category == 'Watchlist') {
      final watchlist = ref.watch(watchlistProvider);
      if (watchlist.isEmpty) {
        return Column(
          children: [
            _CategoryFilter(
              selected: _category,
              categories: _categories,
              onSelect: (cat) => setState(() => _category = cat),
            ),
            Expanded(
              child: Center(
                child: Padding(
                  padding: const EdgeInsets.all(AppSpacing.s8),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.star_border_rounded,
                          size: 48, color: c.textFaint),
                      const SizedBox(height: AppSpacing.s4),
                      Text('No assets in watchlist.',
                          style: AppTypography.md
                              .copyWith(color: c.textSecondary),
                          textAlign: TextAlign.center),
                      const SizedBox(height: AppSpacing.s2),
                      Text(
                          'Tap ★ on any asset page to add.',
                          style: AppTypography.sm.copyWith(color: c.textMuted),
                          textAlign: TextAlign.center),
                    ],
                  ),
                ),
              ),
            ),
          ],
        );
      }

      final async = ref.watch(_quotesProvider);
      return async.when(
        loading: () =>
            Center(child: CircularProgressIndicator(color: c.accent)),
        error: (e, _) => ErrorView(
          message: 'Failed to load quotes',
          onRetry: () => ref.invalidate(_quotesProvider),
        ),
        data: (quotes) {
          final watchSet = watchlist.toSet();
          final filtered =
              quotes.where((q) => watchSet.contains(q.symbol)).toList();
          return Column(
            children: [
              _CategoryFilter(
                selected: _category,
                categories: _categories,
                onSelect: (cat) => setState(() => _category = cat),
              ),
              FreshnessBar(lastUpdated: _lastQuotesUpdate.toIso8601String()),
              Expanded(
                child: RefreshIndicator(
                  color: c.accent,
                  backgroundColor: c.surface,
                  onRefresh: () => ref.refresh(_quotesProvider.future),
                  child: ListView.builder(
                    padding: EdgeInsets.only(bottom: MediaQuery.of(context).padding.bottom),
                    itemCount: filtered.length,
                    itemBuilder: (ctx, i) => _AssetRow(item: filtered[i]),
                  ),
                ),
              ),
            ],
          );
        },
      );
    }

    final async = ref.watch(_quotesProvider);
    return async.when(
      loading: () => Center(
          child: CircularProgressIndicator(color: c.accent)),
      error: (e, _) => ErrorView(
        message: 'Failed to load quotes',
        onRetry: () => ref.invalidate(_quotesProvider),
      ),
      data: (quotes) {
        final filtered = _category == 'All'
            ? quotes
            : quotes.where((q) => q.category == _category).toList();

        return Column(
          children: [
            _CategoryFilter(
              selected: _category,
              categories: _categories,
              onSelect: (cat) => setState(() => _category = cat),
            ),
            FreshnessBar(lastUpdated: _lastQuotesUpdate.toIso8601String()),
            if (_category == 'All')
              const _BestSetupsCard(type: 'assets'),
            Expanded(
              child: RefreshIndicator(
                color: c.accent,
                backgroundColor: c.surface,
                onRefresh: () => ref.refresh(_quotesProvider.future),
                child: ListView.builder(
                  padding: EdgeInsets.only(bottom: MediaQuery.of(context).padding.bottom),
                  itemCount: filtered.length,
                  itemBuilder: (ctx, i) => _AssetRow(item: filtered[i]),
                ),
              ),
            ),
          ],
        );
      },
    );
  }
}

class _CategoryFilter extends StatelessWidget {
  const _CategoryFilter({
    required this.selected,
    required this.categories,
    required this.onSelect,
  });

  final String selected;
  final List<String> categories;
  final ValueChanged<String> onSelect;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return SizedBox(
      height: 44,
      child: ListView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.s5, vertical: AppSpacing.s2),
        children: categories.map((cat) {
          final isActive = cat == selected;
          return GestureDetector(
            onTap: () => onSelect(cat),
            child: Container(
              margin: const EdgeInsets.only(right: AppSpacing.s2),
              padding: cat == 'Watchlist'
                  ? const EdgeInsets.symmetric(horizontal: 10, vertical: 4)
                  : const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
              decoration: BoxDecoration(
                color: isActive ? c.accent : c.surfaceCard,
                borderRadius: BorderRadius.circular(AppRadius.full),
                border: Border.all(
                    color: isActive ? c.accent : c.border),
              ),
              child: cat == 'Watchlist'
                  ? Icon(
                      Icons.star_rounded,
                      size: 16,
                      color: isActive ? c.background : c.warning,
                    )
                  : Text(
                      cat,
                      style: AppTypography.sm.copyWith(
                        color: isActive ? c.background : c.textSecondary,
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

// ── Stocks Search ─────────────────────────────────────────────────────────────

class _StocksSearchView extends ConsumerStatefulWidget {
  const _StocksSearchView();

  @override
  ConsumerState<_StocksSearchView> createState() => _StocksSearchViewState();
}

class _StocksSearchViewState extends ConsumerState<_StocksSearchView> {
  final _controller = TextEditingController();
  final _focus = FocusNode();
  String _query = '';
  Timer? _debounce;

  @override
  void initState() {
    super.initState();
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _controller.dispose();
    _focus.dispose();
    super.dispose();
  }

  void _onChanged(String v) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 400), () {
      if (mounted) setState(() => _query = v.trim());
    });
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;

    return Column(
      children: [
        // Search input
        Padding(
          padding: const EdgeInsets.fromLTRB(
              AppSpacing.s5, AppSpacing.s4, AppSpacing.s5, AppSpacing.s3),
          child: TextField(
            controller: _controller,
            focusNode: _focus,
            onChanged: _onChanged,
            style: AppTypography.md.copyWith(color: c.textPrimary),
            decoration: InputDecoration(
              hintText: 'Search by name or ticker (e.g. AAPL, Tesla)',
              hintStyle: AppTypography.md.copyWith(color: c.textMuted),
              prefixIcon: Icon(Icons.search_rounded, color: c.textMuted, size: 20),
              suffixIcon: _controller.text.isNotEmpty
                  ? IconButton(
                      icon: Icon(Icons.clear_rounded, color: c.textMuted, size: 18),
                      onPressed: () {
                        _controller.clear();
                        setState(() => _query = '');
                      },
                    )
                  : null,
              filled: true,
              fillColor: c.searchBg,
              contentPadding: const EdgeInsets.symmetric(
                  horizontal: AppSpacing.s4, vertical: AppSpacing.s3),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(AppRadius.sm),
                borderSide: BorderSide(color: c.border),
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(AppRadius.sm),
                borderSide: BorderSide(color: c.border),
              ),
              focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(AppRadius.sm),
                borderSide: BorderSide(color: c.accent, width: 1.5),
              ),
            ),
          ),
        ),

        // Results
        Expanded(child: _query.isEmpty
            ? _EmptySearch()
            : _SearchResults(query: _query)),
      ],
    );
  }
}

class _EmptySearch extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Align(
      alignment: Alignment.topCenter,
      child: Padding(
        padding: const EdgeInsets.only(top: 60),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.manage_search_rounded, size: 48, color: c.textFaint),
            const SizedBox(height: 12),
            Text('Search any stock worldwide',
                style: AppTypography.md.copyWith(color: c.textMuted)),
            const SizedBox(height: 4),
            Text('Tap a result to view Chart, Signal & more',
                style: AppTypography.sm.copyWith(color: c.textFaint)),
          ],
        ),
      ),
    );
  }
}

class _SearchResults extends ConsumerWidget {
  const _SearchResults({required this.query});
  final String query;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final async = ref.watch(_stockSearchProvider(query));

    return async.when(
      loading: () => Center(
          child: CircularProgressIndicator(color: c.accent)),
      error: (_, __) => Center(
          child: Text('Search failed', style: AppTypography.md.copyWith(color: c.textMuted))),
      data: (results) {
        if (results.isEmpty) {
          return Center(
            child: FittedBox(
              fit: BoxFit.scaleDown,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.search_off_rounded, size: 40, color: c.textFaint),
                  const SizedBox(height: 8),
                  Text('No results for "$query"',
                      style: AppTypography.md.copyWith(color: c.textMuted)),
                ],
              ),
            ),
          );
        }
        return ListView.builder(
          padding: EdgeInsets.only(
              bottom: MediaQuery.of(context).padding.bottom +
                  MediaQuery.of(context).viewInsets.bottom),
          itemCount: results.length,
          itemBuilder: (_, i) => _StockResultRow(result: results[i]),
        );
      },
    );
  }
}

class _StockResultRow extends StatelessWidget {
  const _StockResultRow({required this.result});
  final StockSearchResult result;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return InkWell(
      onTap: () => context.push(
          '/asset/${Uri.encodeComponent(result.symbol)}?name=${Uri.encodeComponent(result.name)}'),
      child: Container(
        padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.s5, vertical: AppSpacing.s4),
        decoration: BoxDecoration(
          border: Border(bottom: BorderSide(color: c.border)),
        ),
        child: Row(
          children: [
            // Symbol badge
            Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(
                color: c.accentDim,
                borderRadius: BorderRadius.circular(AppRadius.sm),
              ),
              child: Center(
                child: Text(
                  result.symbol.length > 4
                      ? result.symbol.substring(0, 4)
                      : result.symbol,
                  style: AppTypography.labelSm.copyWith(
                      color: c.accent, fontWeight: FontWeight.w700),
                  textAlign: TextAlign.center,
                ),
              ),
            ),
            const SizedBox(width: AppSpacing.s4),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(result.symbol,
                      style: AppTypography.labelLg
                          .copyWith(color: c.textPrimary,
                              fontWeight: FontWeight.w600)),
                  const SizedBox(height: 2),
                  Text(result.name,
                      style: AppTypography.sm.copyWith(color: c.textSecondary),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis),
                ],
              ),
            ),
            const SizedBox(width: AppSpacing.s3),
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                  decoration: BoxDecoration(
                    color: c.surfaceCard,
                    borderRadius: BorderRadius.circular(AppRadius.xs),
                    border: Border.all(color: c.border),
                  ),
                  child: Text(result.exchange,
                      style: AppTypography.xs.copyWith(color: c.textMuted)),
                ),
                const SizedBox(height: 4),
                Text(result.type,
                    style: AppTypography.xs.copyWith(color: c.textFaint)),
              ],
            ),
            const SizedBox(width: AppSpacing.s3),
            Icon(Icons.chevron_right_rounded, color: c.textFaint, size: 18),
          ],
        ),
      ),
    );
  }
}

// ── Asset Rows ────────────────────────────────────────────────────────────────

class _AssetRow extends StatelessWidget {
  const _AssetRow({required this.item});
  final QuoteItem item;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final pct = item.changePercent;
    final isUp = (pct ?? 0) >= 0;
    final pctColor = isUp ? c.positive : c.danger;
    final pctStr = pct == null
        ? '--'
        : '${isUp ? '+' : ''}${pct.toStringAsFixed(2)}%';

    return InkWell(
      onTap: () => context.push(
          '/asset/${Uri.encodeComponent(item.symbol)}?name=${Uri.encodeComponent(item.name)}'),
      child: Container(
        padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.s5, vertical: AppSpacing.s4),
        decoration: BoxDecoration(
          border: Border(bottom: BorderSide(color: c.border, width: 0.5)),
        ),
        child: Row(
          children: [
            if (item.flag.isNotEmpty) ...[
              Text(item.flag, style: const TextStyle(fontSize: 18)),
              const SizedBox(width: AppSpacing.s3),
            ],
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(item.name,
                      style: AppTypography.labelLg.copyWith(color: c.textPrimary),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis),
                  const SizedBox(height: 2),
                  Text(item.symbol,
                      style: AppTypography.sm.copyWith(color: c.textMuted)),
                ],
              ),
            ),
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(
                  _formatPrice(item.price),
                  style: AppTypography.numericLg.copyWith(color: c.textPrimary),
                ),
                const SizedBox(height: 2),
                Text(pctStr,
                    style: AppTypography.sm.copyWith(
                        color: pctColor, fontWeight: FontWeight.w600)),
                if (item.preMarketChangePercent != null) ...[
                  const SizedBox(height: 2),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
                    decoration: BoxDecoration(
                      color: c.warning.withAlpha(25),
                      borderRadius: BorderRadius.circular(4),
                      border: Border.all(color: c.warning.withAlpha(60)),
                    ),
                    child: Text(
                      'PRE: ${item.preMarketChangePercent! >= 0 ? '+' : ''}${item.preMarketChangePercent!.toStringAsFixed(2)}%',
                      style: AppTypography.xs.copyWith(
                          color: c.warning, fontWeight: FontWeight.w600),
                    ),
                  ),
                ],
              ],
            ),
          ],
        ),
      ),
    );
  }

  String _formatPrice(double? price) {
    if (price == null) return '--';
    if (price > 1000) return price.toStringAsFixed(0);
    if (price < 1) return price.toStringAsFixed(4);
    return price.toStringAsFixed(2);
  }
}

void _showStrategyInfo(BuildContext context) {
  final c = context.colors;
  showModalBottomSheet(
    context: context,
    backgroundColor: c.surface,
    isScrollControlled: true,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (_) => Consumer(
      builder: (ctx, ref, __) {
        final strategiesAsync = ref.watch(_strategiesProvider);
        final strategies = strategiesAsync.valueOrNull ?? _fallbackStrategies;
        return DraggableScrollableSheet(
          expand: false,
          initialChildSize: 0.75,
          minChildSize: 0.4,
          maxChildSize: 0.92,
          builder: (ctx, scrollController) => ListView(
            controller: scrollController,
            padding: EdgeInsets.fromLTRB(
                AppSpacing.s5,
                AppSpacing.s5,
                AppSpacing.s5,
                AppSpacing.s8 + MediaQuery.of(ctx).padding.bottom),
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
                  style: AppTypography.headingMd.copyWith(color: c.textPrimary)),
              const SizedBox(height: AppSpacing.s4),
              ...strategies.expand((s) => [
                _StrategyInfoRow(
                  label: s.label,
                  title: s.title,
                  description: s.description,
                  detail: s.detail,
                  accentColor: s.accentColor,
                ),
                const SizedBox(height: AppSpacing.s4),
              ]),
            ],
          ),
        );
      },
    ),
  );
}

class _StrategyInfoRow extends StatelessWidget {
  const _StrategyInfoRow({
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
                  style: AppTypography.labelMd
                      .copyWith(color: c.textPrimary, fontWeight: FontWeight.w700)),
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

// ── Signals Tab ───────────────────────────────────────────────────────────────

class _SignalsTab extends ConsumerStatefulWidget {
  const _SignalsTab();

  @override
  ConsumerState<_SignalsTab> createState() => _SignalsTabState();
}

class _SignalsTabState extends ConsumerState<_SignalsTab> {
  String _timeframe = '1d';
  String _direction = 'ALL';
  String _type = 'ALL';

  static const _timeframes = ['1m', '1h', '4h', '1d'];
  static const _directions = ['ALL', 'BUY', 'HOLD', 'SELL'];
  static const _types = ['ALL', 'Commodities', 'Indices', 'Forex', 'Crypto'];

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final strategy = ref.watch(strategyProvider);
    final quotesAsync = ref.watch(_quotesProvider);
    final isS9 = strategy == TradingStrategy.s9;
    final effectiveType = isS9 ? 'Commodities' : _type;

    return Column(
      children: [
        _SignalFilters(
          type: effectiveType,
          timeframe: _timeframe,
          direction: _direction,
          strategy: strategy,
          onType: isS9 ? (_) {} : (t) => setState(() => _type = t),
          onTimeframe: (t) => setState(() => _timeframe = t),
          onDirection: (d) => setState(() => _direction = d),
          onStrategy: (s) => ref.read(strategyProvider.notifier).setStrategy(s),
          types: _types,
          timeframes: _timeframes,
          directions: _directions,
        ),
        if (isS9)
          Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(
                horizontal: AppSpacing.s4, vertical: AppSpacing.s3),
            decoration: BoxDecoration(
              color: const Color(0xFFC0C0C0).withAlpha(18),
              border: Border(
                  bottom: BorderSide(color: const Color(0xFFC0C0C0).withAlpha(50))),
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Icon(Icons.info_outline_rounded,
                    size: 14, color: Color(0xFFC0C0C0)),
                const SizedBox(width: AppSpacing.s2),
                Expanded(
                  child: Text(
                    'S9 targets Silver (SI=F) on 1h — signals fire only during London (02:00–05:00 ET) or NY (07:00–10:00 ET) kill zones when a liquidity sweep, 9 EMA power candle, and Fibonacci confluence all align simultaneously.',
                    style: AppTypography.xs.copyWith(
                      color: const Color(0xFFC0C0C0),
                      height: 1.5,
                      fontWeight: FontWeight.w700,
                      letterSpacing: 0.1,
                    ),
                  ),
                ),
              ],
            ),
          ),
        Expanded(
          child: quotesAsync.when(
            loading: () => Center(
                child: CircularProgressIndicator(color: c.accent)),
            error: (e, _) => const ErrorView(message: 'Failed to load assets'),
            data: (quotes) {
              final filtered = isS9
                  ? quotes.where((q) => q.symbol == 'SI=F').toList()
                  : (effectiveType == 'ALL'
                      ? quotes
                      : quotes.where((q) => q.category == effectiveType).toList());

              return ListView.builder(
                padding: EdgeInsets.only(top: AppSpacing.s3, bottom: AppSpacing.s3 + MediaQuery.of(context).padding.bottom),
                itemCount: filtered.length + 1,
                itemBuilder: (ctx, i) {
                  if (i == filtered.length) return const _DisclaimerBar();
                  return _SignalCard(
                    quote: filtered[i],
                    timeframe: _timeframe,
                    strategy: strategy.serverParam,
                    directionFilter: _direction,
                  );
                },
              );
            },
          ),
        ),
      ],
    );
  }
}

class _SignalFilters extends StatelessWidget {
  const _SignalFilters({
    required this.type,
    required this.timeframe,
    required this.direction,
    required this.strategy,
    required this.onType,
    required this.onTimeframe,
    required this.onDirection,
    required this.onStrategy,
    required this.types,
    required this.timeframes,
    required this.directions,
  });

  final String type;
  final String timeframe;
  final String direction;
  final TradingStrategy strategy;
  final ValueChanged<String> onType;
  final ValueChanged<String> onTimeframe;
  final ValueChanged<String> onDirection;
  final ValueChanged<TradingStrategy> onStrategy;
  final List<String> types;
  final List<String> timeframes;
  final List<String> directions;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Container(
      padding: const EdgeInsets.all(AppSpacing.s4),
      decoration: BoxDecoration(
        border: Border(bottom: BorderSide(color: c.border)),
      ),
      child: Column(
        children: [
          _ChipRow(
            label: 'Type',
            items: types,
            selected: type,
            onSelect: onType,
          ),
          const SizedBox(height: AppSpacing.s3),
          _ChipRow(
            label: 'Timeframe',
            items: timeframes,
            selected: timeframe,
            onSelect: onTimeframe,
          ),
          const SizedBox(height: AppSpacing.s3),
          _ChipRow(
            label: 'Direction',
            items: directions,
            selected: direction,
            onSelect: onDirection,
            getColor: (item) => item == 'BUY'
                ? c.positive
                : item == 'SELL'
                    ? c.danger
                    : item == 'HOLD'
                        ? c.warning
                        : null,
          ),
          const SizedBox(height: AppSpacing.s3),
          _StrategyGrid(
            strategy: strategy,
            type: type,
            onStrategy: onStrategy,
            onInfo: () => _showStrategyInfo(context),
          ),
        ],
      ),
    );
  }
}

// Strategy pill grid: S1-S4 / S5-S8 / S9 rows, each chip equal-width.
// "Strategy" label + info icon sit above the chip rows.
class _StrategyGrid extends StatelessWidget {
  const _StrategyGrid({
    required this.strategy,
    required this.onStrategy,
    required this.onInfo,
    this.type,
  });

  final TradingStrategy strategy;
  final ValueChanged<TradingStrategy> onStrategy;
  final VoidCallback onInfo;
  // When set, S9 row is hidden unless type allows Commodities or S9 is active.
  final String? type;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final all = TradingStrategy.values;
    final showS9 = type == null ||
        type == 'ALL' ||
        type == 'Commodities' ||
        strategy == TradingStrategy.s9;

    Widget chip(TradingStrategy s) {
      const silver = Color(0xFFC0C0C0);
      final isSelected = strategy == s;
      final isS9Chip = s == TradingStrategy.s9;
      final isAdvanced = int.parse(s.serverParam) >= 4;
      final isLocked = isAdvanced && !EntitlementService.can('signals_advanced');
      final chipColor =
          isS9Chip ? Color.lerp(c.accent, silver, 0.5)! : c.accent;
      final chipDim = isS9Chip
          ? Color.lerp(c.accentDim, silver.withAlpha(30), 0.5)!
          : c.accentDim;

      return GestureDetector(
        onTap: () {
          if (isLocked) {
            UpgradeSheet.show(context, feature: 'signals_advanced');
          } else {
            onStrategy(s);
          }
        },
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 5),
          decoration: BoxDecoration(
            color: isSelected ? chipDim : Colors.transparent,
            borderRadius: BorderRadius.circular(AppRadius.full),
            border: Border.all(
              color: isSelected
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
                      : isSelected
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

    // Builds a Row of equal-width chips with 5px gaps between them.
    Row buildRow(List<TradingStrategy> row) {
      final items = <Widget>[];
      for (int i = 0; i < row.length; i++) {
        items.add(Expanded(child: chip(row[i])));
        if (i < row.length - 1) items.add(const SizedBox(width: 5));
      }
      return Row(children: items);
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Text('Strategy',
                style: AppTypography.sm.copyWith(color: c.textMuted)),
            const SizedBox(width: AppSpacing.s2),
            GestureDetector(
              onTap: onInfo,
              child: Icon(Icons.info_outline_rounded,
                  size: 14, color: c.textMuted),
            ),
          ],
        ),
        const SizedBox(height: AppSpacing.s2),
        buildRow(all.sublist(0, 4)),
        const SizedBox(height: 5),
        buildRow(all.sublist(4, 8)),
        if (showS9) ...[
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
      ],
    );
  }
}

class _ChipRow extends StatelessWidget {
  const _ChipRow({
    required this.label,
    required this.items,
    required this.selected,
    required this.onSelect,
    this.getColor,
  });

  final String label;
  final List<String> items;
  final String selected;
  final ValueChanged<String> onSelect;
  final Color? Function(String)? getColor;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final chips = <Widget>[];
    for (int i = 0; i < items.length; i++) {
      final item = items[i];
      final isActive = item == selected;
      final accent = getColor?.call(item);
      chips.add(Expanded(
        child: GestureDetector(
          onTap: () => onSelect(item),
          child: Container(
            padding: const EdgeInsets.symmetric(vertical: 5),
            decoration: BoxDecoration(
              color: isActive
                  ? (accent ?? c.accent).withAlpha(30)
                  : Colors.transparent,
              borderRadius: BorderRadius.circular(AppRadius.full),
              border: Border.all(
                color: isActive ? (accent ?? c.accent) : c.border,
              ),
            ),
            child: Text(
              item,
              textAlign: TextAlign.center,
              style: AppTypography.sm.copyWith(
                color: isActive ? (accent ?? c.accent) : c.textSecondary,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
        ),
      ));
      if (i < items.length - 1) chips.add(const SizedBox(width: 5));
    }
    return Row(
      children: [
        Text(label,
            style: AppTypography.sm.copyWith(
              color: c.textMuted,
              fontWeight: FontWeight.w600,
            )),
        const SizedBox(width: AppSpacing.s3),
        Expanded(child: Row(children: chips)),
      ],
    );
  }
}

class _SignalErrorRow extends StatelessWidget {
  const _SignalErrorRow({required this.quote, required this.onRetry});
  final QuoteItem quote;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return GestureDetector(
      onTap: onRetry,
      child: Container(
        margin: const EdgeInsets.symmetric(
            horizontal: AppSpacing.s5, vertical: AppSpacing.s2),
        padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.s4, vertical: AppSpacing.s3),
        decoration: BoxDecoration(
          color: c.surfaceCard,
          borderRadius: BorderRadius.circular(AppRadius.md),
          border: Border.all(color: c.border),
        ),
        child: Row(
          children: [
            if (quote.flag.isNotEmpty)
              Text(quote.flag, style: const TextStyle(fontSize: 16)),
            const SizedBox(width: AppSpacing.s2),
            Expanded(
              child: Text(quote.name,
                  style: AppTypography.labelMd
                      .copyWith(color: c.textMuted),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis),
            ),
            Icon(Icons.refresh_rounded, size: 16, color: c.textFaint),
          ],
        ),
      ),
    );
  }
}

class _SignalCard extends ConsumerWidget {
  const _SignalCard({
    required this.quote,
    required this.timeframe,
    required this.strategy,
    required this.directionFilter,
  });

  final QuoteItem quote;
  final String timeframe;
  final String strategy;
  final String directionFilter;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final args = (symbol: quote.symbol, tf: timeframe, strategy: strategy);
    final signalAsync = ref.watch(_signalProvider(args));

    return signalAsync.when(
      loading: () => _LoadingRow(name: quote.name),
      error: (_, __) => _SignalErrorRow(
        quote: quote,
        onRetry: () => ref.invalidate(_signalProvider(args)),
      ),
      data: (signal) {
        if (directionFilter != 'ALL' &&
            signal.direction.toUpperCase() != directionFilter) {
          return const SizedBox.shrink();
        }
        return _SignalCardContent(quote: quote, signal: signal);
      },
    );
  }
}

class _SignalCardContent extends StatelessWidget {
  const _SignalCardContent({required this.quote, required this.signal});
  final QuoteItem quote;
  final TradingSignal signal;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final confColor = c.signalColor(signal.direction);
    return InkWell(
      onTap: () => context.push(
          '/asset/${Uri.encodeComponent(quote.symbol)}?name=${Uri.encodeComponent(quote.name)}'),
      child: Container(
        margin: const EdgeInsets.symmetric(
            horizontal: AppSpacing.s5, vertical: AppSpacing.s2),
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
                if (quote.flag.isNotEmpty)
                  Text(quote.flag, style: const TextStyle(fontSize: 16)),
                const SizedBox(width: AppSpacing.s2),
                Expanded(
                  child: Text(quote.name,
                      style: AppTypography.labelLg.copyWith(color: c.textPrimary),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis),
                ),
                SignalBadge(direction: signal.direction),
                const SizedBox(width: AppSpacing.s3),
                Text(
                  '${signal.confidence.toInt()}%',
                  style: AppTypography.sm.copyWith(
                      color: confColor, fontWeight: FontWeight.w700),
                ),
              ],
            ),
            const SizedBox(height: AppSpacing.s3),
            // Confidence bar
            ClipRRect(
              borderRadius: BorderRadius.circular(2),
              child: LinearProgressIndicator(
                value: signal.confidence / 100,
                backgroundColor: c.border,
                valueColor: AlwaysStoppedAnimation(confColor),
                minHeight: 4,
              ),
            ),
            const SizedBox(height: AppSpacing.s3),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                _SignalStat('Entry', _fmt(signal.entry), c.textPrimary, c),
                _SignalStat('SL', _fmt(signal.stopLoss), c.danger, c),
                _SignalStat('TP', _fmt(signal.takeProfit), c.positive, c),
                _SignalStat('R:R',
                    signal.riskReward.toStringAsFixed(2), c.accent, c),
              ],
            ),
            const SizedBox(height: AppSpacing.s3),
            ...signal.reasoning.take(2).map((r) => Padding(
                  padding: const EdgeInsets.only(bottom: 2),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('• ',
                          style: TextStyle(
                              color: c.textMuted, fontSize: 12)),
                      Expanded(
                        child: Text(r,
                            style: AppTypography.xs.copyWith(
                                color: c.textSecondary)),
                      ),
                    ],
                  ),
                )),
          ],
        ),
      ),
    );
  }

  String _fmt(double v) {
    if (v > 1000) return v.toStringAsFixed(0);
    if (v < 1) return v.toStringAsFixed(4);
    return v.toStringAsFixed(2);
  }
}

class _SignalStat extends StatelessWidget {
  const _SignalStat(this.label, this.value, this.color, this.palette);
  final String label;
  final String value;
  final Color color;
  final AppPalette palette;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label,
            style: AppTypography.xs.copyWith(color: palette.textMuted)),
        Text(value,
            style: AppTypography.sm.copyWith(
                color: color, fontWeight: FontWeight.w600)),
      ],
    );
  }
}

class _LoadingRow extends StatelessWidget {
  const _LoadingRow({required this.name});
  final String name;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Container(
      margin: const EdgeInsets.symmetric(
          horizontal: AppSpacing.s5, vertical: AppSpacing.s2),
      padding: const EdgeInsets.all(AppSpacing.s4),
      decoration: BoxDecoration(
        color: c.surfaceCard,
        borderRadius: BorderRadius.circular(AppRadius.md),
        border: Border.all(color: c.border),
      ),
      child: Row(
        children: [
          Expanded(
              child: Text(name,
                  style: AppTypography.labelLg.copyWith(
                      color: c.textMuted))),
          SizedBox(
              width: 14,
              height: 14,
              child: CircularProgressIndicator(
                  strokeWidth: 1.5, color: c.accent)),
        ],
      ),
    );
  }
}

// ── Disclaimer Bar ────────────────────────────────────────────────────────────

class _DisclaimerBar extends StatelessWidget {
  const _DisclaimerBar();

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Padding(
      padding: const EdgeInsets.fromLTRB(
          AppSpacing.s5, AppSpacing.s4, AppSpacing.s5, AppSpacing.s7),
      child: Text(
        'Signals are for informational purposes only and do not constitute financial advice. Past performance does not guarantee future results.',
        style: AppTypography.xs.copyWith(color: c.textMuted),
        textAlign: TextAlign.center,
      ),
    );
  }
}

// ── Alerts Tab ────────────────────────────────────────────────────────────────

class _AlertsTab extends ConsumerStatefulWidget {
  const _AlertsTab();

  @override
  ConsumerState<_AlertsTab> createState() => _AlertsTabState();
}

class _AlertsTabState extends ConsumerState<_AlertsTab> {
  final _symbolCtrl = TextEditingController();
  final _nameCtrl = TextEditingController();
  final _priceCtrl = TextEditingController();
  String _dir = 'above';

  @override
  void dispose() {
    _symbolCtrl.dispose();
    _nameCtrl.dispose();
    _priceCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final alerts = ref.watch(alertProvider);

    return ListView(
      padding: EdgeInsets.fromLTRB(AppSpacing.s5, AppSpacing.s5, AppSpacing.s5,
          AppSpacing.s5 + MediaQuery.of(context).padding.bottom + MediaQuery.of(context).viewInsets.bottom),
      children: [
        // Add new alert
        Container(
          padding: const EdgeInsets.all(AppSpacing.s4),
          decoration: BoxDecoration(
            color: c.surfaceCard,
            borderRadius: BorderRadius.circular(AppRadius.md),
            border: Border.all(color: c.border),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('New Alert',
                  style: AppTypography.headingSm.copyWith(color: c.textPrimary)),
              const SizedBox(height: AppSpacing.s4),
              TextField(
                controller: _symbolCtrl,
                decoration:
                    const InputDecoration(hintText: 'Symbol (e.g. AAPL)'),
                style: AppTypography.lg,
              ),
              const SizedBox(height: AppSpacing.s3),
              TextField(
                controller: _nameCtrl,
                decoration: const InputDecoration(hintText: 'Name'),
                style: AppTypography.lg,
              ),
              const SizedBox(height: AppSpacing.s3),
              Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _priceCtrl,
                      decoration:
                          const InputDecoration(hintText: 'Target price'),
                      keyboardType: TextInputType.number,
                      style: AppTypography.lg,
                    ),
                  ),
                  const SizedBox(width: AppSpacing.s3),
                  DropdownButton<String>(
                    value: _dir,
                    dropdownColor: c.surface,
                    style: AppTypography.lg.copyWith(color: c.textPrimary),
                    items: const [
                      DropdownMenuItem(value: 'above', child: Text('Above')),
                      DropdownMenuItem(value: 'below', child: Text('Below')),
                    ],
                    onChanged: (v) => setState(() => _dir = v!),
                  ),
                ],
              ),
              const SizedBox(height: AppSpacing.s4),
              SizedBox(
                width: double.infinity,
                child: FilledButton(
                  onPressed: _addAlert,
                  style: FilledButton.styleFrom(
                    backgroundColor: c.accent,
                    foregroundColor: c.background,
                  ),
                  child: const Text('Set Alert'),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: AppSpacing.s5),
        if (alerts.isEmpty)
          Center(
            child: Padding(
              padding: const EdgeInsets.all(AppSpacing.s8),
              child: Column(
                children: [
                  Icon(Icons.notifications_none,
                      color: c.textMuted, size: 48),
                  const SizedBox(height: AppSpacing.s4),
                  Text('No active alerts',
                      style: AppTypography.lg.copyWith(
                          color: c.textSecondary)),
                ],
              ),
            ),
          )
        else
          ...alerts.map((alert) => _AlertRow(
                alert: alert,
                onDelete: () =>
                    ref.read(alertProvider.notifier).removeAlert(alert.id),
              )),
      ],
    );
  }

  Future<void> _addAlert() async {
    final price = double.tryParse(_priceCtrl.text);
    if (_symbolCtrl.text.isEmpty || price == null) return;
    final result = await ref.read(alertProvider.notifier).addAlert(PriceAlert(
          id: DateTime.now().millisecondsSinceEpoch.toString(),
          symbol: _symbolCtrl.text.toUpperCase(),
          name: _nameCtrl.text.isEmpty ? _symbolCtrl.text : _nameCtrl.text,
          targetPrice: price,
          direction: _dir,
        ));
    if (result == AddAlertResult.limitReached) {
      if (mounted) UpgradeSheet.show(context, feature: 'alerts_unlimited');
      return;
    }
    _symbolCtrl.clear();
    _nameCtrl.clear();
    _priceCtrl.clear();
  }
}

class _AlertRow extends StatelessWidget {
  const _AlertRow({required this.alert, required this.onDelete});
  final PriceAlert alert;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final isAbove = alert.direction == 'above';
    return Container(
      margin: const EdgeInsets.only(bottom: AppSpacing.s3),
      padding: const EdgeInsets.all(AppSpacing.s4),
      decoration: BoxDecoration(
        color: c.surfaceCard,
        borderRadius: BorderRadius.circular(AppRadius.md),
        border: Border.all(color: c.border),
      ),
      child: Row(
        children: [
          Icon(
            isAbove ? Icons.arrow_upward : Icons.arrow_downward,
            color: isAbove ? c.positive : c.danger,
            size: 20,
          ),
          const SizedBox(width: AppSpacing.s3),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(alert.name,
                    style: AppTypography.labelLg.copyWith(color: c.textPrimary)),
                Text(
                  '${isAbove ? 'Above' : 'Below'} \$${alert.targetPrice.toStringAsFixed(2)}',
                  style: AppTypography.sm.copyWith(color: c.textMuted),
                ),
              ],
            ),
          ),
          IconButton(
            icon: Icon(Icons.close, size: 18, color: c.textMuted),
            tooltip: 'Delete alert',
            onPressed: () async {
              final confirmed = await showDialog<bool>(
                context: context,
                builder: (ctx) => AlertDialog(
                  backgroundColor: c.surface,
                  title: Text('Delete Alert',
                      style: AppTypography.headingSm.copyWith(color: c.textPrimary)),
                  content: Text(
                    'Remove the ${alert.direction == "above" ? "above" : "below"} '
                    '\$${alert.targetPrice.toStringAsFixed(2)} alert for ${alert.name}?',
                    style: AppTypography.sm.copyWith(color: c.textSecondary),
                  ),
                  actions: [
                    TextButton(
                      onPressed: () => Navigator.of(ctx).pop(false),
                      child: Text('Cancel',
                          style: AppTypography.sm.copyWith(color: c.textMuted)),
                    ),
                    TextButton(
                      onPressed: () => Navigator.of(ctx).pop(true),
                      child: Text('Delete',
                          style: AppTypography.sm.copyWith(color: c.danger,
                              fontWeight: FontWeight.w600)),
                    ),
                  ],
                ),
              );
              if (confirmed == true) onDelete();
            },
          ),
        ],
      ),
    );
  }
}

// ── 10X Scanner Info ──────────────────────────────────────────────────────────

void _showBestSetupsInfo(BuildContext context) {
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
      maxChildSize: 0.95,
      builder: (ctx, scrollController) => ListView(
        controller: scrollController,
        padding: EdgeInsets.fromLTRB(
            AppSpacing.s5,
            AppSpacing.s5,
            AppSpacing.s5,
            AppSpacing.s8 + MediaQuery.of(ctx).padding.bottom),
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

          // Title
          Row(
            children: [
              Icon(Icons.bolt_rounded, size: 18, color: c.warning),
              const SizedBox(width: AppSpacing.s2),
              Expanded(
                child: Text('Best Setups Right Now',
                    style: AppTypography.headingMd
                        .copyWith(color: c.textPrimary)),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.s3),
          Text(
            'Surfaces assets that have at least one signal firing today and a historical 1-month win rate of ≥65% when that exact number of signals were active — ranked best-to-worst.',
            style:
                AppTypography.sm.copyWith(color: c.textSecondary, height: 1.55),
          ),
          const SizedBox(height: AppSpacing.s5),

          // Win rate row explanation
          Text('How to read each row',
              style: AppTypography.headingSm.copyWith(color: c.textPrimary)),
          const SizedBox(height: AppSpacing.s4),

          _BestSetupsInfoRow(
            c: c,
            label: '1m / 3m / 1y',
            body:
                'Historical win rate over those periods when the same number of signals were active. '
                'Green = ≥65%, orange = 50–64%, red = below 50%.',
          ),
          const SizedBox(height: AppSpacing.s4),
          _BestSetupsInfoRow(
            c: c,
            label: 'Signal dots',
            body:
                'Filled green dots = active signals right now (Volume Spike, Heartbeat, Record Quarter, Trend). '
                'More dots = stronger confluence.',
          ),
          const SizedBox(height: AppSpacing.s4),
          _BestSetupsInfoRow(
            c: c,
            label: 'Avg +X% 3m',
            body:
                'Average price return 3 months after previous setups with this many signals fired. '
                'Positive means past occurrences were profitable on average.',
          ),
          const SizedBox(height: AppSpacing.s5),

          // v1 vs v2
          Container(
            padding: const EdgeInsets.all(AppSpacing.s4),
            decoration: BoxDecoration(
              color: c.accent.withAlpha(12),
              borderRadius: BorderRadius.circular(AppRadius.sm),
              border: Border.all(color: c.accent.withAlpha(40)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('v1 vs v2',
                    style: AppTypography.labelSm
                        .copyWith(color: c.accent, fontWeight: FontWeight.w700)),
                const SizedBox(height: 4),
                Text(
                  'v1 uses stricter accumulation rules (< 30% range over 2 years, up to 3 signals).\n'
                  'v2 follows the Pine Script reference: ≤ 35% range over 200 bars, confirmed breakout above the 50-bar high, and adds a 4th Trend signal.\n\n'
                  'Use v2 for assets closer to a confirmed breakout; v1 for early accumulation.',
                  style: AppTypography.xs
                      .copyWith(color: c.textSecondary, height: 1.55),
                ),
              ],
            ),
          ),
          const SizedBox(height: AppSpacing.s5),

          // Important caveat
          Container(
            padding: const EdgeInsets.all(AppSpacing.s4),
            decoration: BoxDecoration(
              color: c.warning.withAlpha(15),
              borderRadius: BorderRadius.circular(AppRadius.sm),
              border: Border.all(color: c.warning.withAlpha(50)),
            ),
            child: Text(
              'Past win rates are based on historical backtest data and do not guarantee future results. '
              'Always use your own analysis and risk management.',
              style:
                  AppTypography.xs.copyWith(color: c.textSecondary, height: 1.55),
            ),
          ),
        ],
      ),
    ),
  );
}

class _BestSetupsInfoRow extends StatelessWidget {
  const _BestSetupsInfoRow(
      {required this.c, required this.label, required this.body});
  final AppPalette c;
  final String label;
  final String body;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          padding:
              const EdgeInsets.symmetric(horizontal: AppSpacing.s3, vertical: 3),
          decoration: BoxDecoration(
            color: c.surfaceCard,
            borderRadius: BorderRadius.circular(AppRadius.xs),
            border: Border.all(color: c.border),
          ),
          child: Text(label,
              style: AppTypography.xs.copyWith(
                  color: c.textPrimary, fontWeight: FontWeight.w600)),
        ),
        const SizedBox(width: AppSpacing.s3),
        Expanded(
          child: Text(body,
              style:
                  AppTypography.xs.copyWith(color: c.textSecondary, height: 1.55)),
        ),
      ],
    );
  }
}

void _showScannerInfo(BuildContext context) {
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
      initialChildSize: 0.85,
      minChildSize: 0.5,
      maxChildSize: 0.95,
      builder: (ctx, scrollController) => ListView(
        controller: scrollController,
        padding: EdgeInsets.fromLTRB(
            AppSpacing.s5,
            AppSpacing.s5,
            AppSpacing.s5,
            AppSpacing.s8 + MediaQuery.of(ctx).padding.bottom),
        children: [
          // Drag handle
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

          // Title
          Row(
            children: [
              Container(
                padding: const EdgeInsets.symmetric(
                    horizontal: AppSpacing.s3, vertical: 3),
                decoration: BoxDecoration(
                  color: c.accent.withAlpha(25),
                  borderRadius: BorderRadius.circular(AppRadius.xs),
                  border: Border.all(color: c.accent.withAlpha(80)),
                ),
                child: Text('10X',
                    style: AppTypography.labelSm.copyWith(
                        color: c.accent, fontWeight: FontWeight.w800)),
              ),
              const SizedBox(width: AppSpacing.s3),
              Expanded(
                child: Text('Pattern Scanner',
                    style: AppTypography.headingMd
                        .copyWith(color: c.textPrimary)),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.s3),
          Text(
            'Scans 49 global assets (indices, commodities, crypto, forex) plus live auto-discovered stocks for institutional accumulation patterns that historically precede large price moves. Based on research by Felix Prehn (Goat Academy) into how Wall Street positions before major rallies.',
            style: AppTypography.sm.copyWith(
                color: c.textSecondary, height: 1.55),
          ),
          const SizedBox(height: AppSpacing.s3),
          // v1 vs v2 callout
          Container(
            padding: const EdgeInsets.all(AppSpacing.s4),
            decoration: BoxDecoration(
              color: c.accent.withAlpha(12),
              borderRadius: BorderRadius.circular(AppRadius.sm),
              border: Border.all(color: c.accent.withAlpha(40)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('v1 Original vs v2 Pine-Aligned',
                    style: AppTypography.labelSm.copyWith(
                        color: c.accent, fontWeight: FontWeight.w700)),
                const SizedBox(height: 4),
                Text(
                  'v1 uses stricter heartbeat (< 30% range over 2 years, 3 signals max).\n'
                  'v2 follows the Pine Script reference: ≤ 35% range over 200 bars, confirmed breakout above the 50-bar high, and adds a 4th Trend signal (MA50 flat or rising).\n'
                  'Use v2 for setups that are closer to a confirmed breakout; v1 for early accumulation.',
                  style: AppTypography.xs.copyWith(
                      color: c.textSecondary, height: 1.55),
                ),
              ],
            ),
          ),
          const SizedBox(height: AppSpacing.s6),

          // Section: The Signals
          Text('The Power Signals',
              style: AppTypography.headingSm
                  .copyWith(color: c.textPrimary)),
          const SizedBox(height: AppSpacing.s4),

          _ScannerSignalRow(
            icon: Icons.bar_chart_rounded,
            color: c.positive,
            label: 'VOL Spike',
            title: 'Volume Spike — Institutional Buying',
            rule: 'Current volume ≥ 3× the 20-day average on a green (price-up) day. The % change shown on each card is the daily (1D) move vs the previous close.',
            explanation:
                'When institutions pour millions into an asset, volume explodes. Volume spikes on UP days signal accumulation. The same spike on a DOWN day means institutions are selling — that is NOT counted.',
            examples: 'Tesla Oct 2019: volume 10× normal → stock went 24× over next 2 years. Sezzle Q3 2024: green volume explosion → 7,000% rally.',
            c: c,
          ),
          const SizedBox(height: AppSpacing.s5),

          _ScannerSignalRow(
            icon: Icons.show_chart_rounded,
            color: c.accent,
            label: 'HEARTBEAT',
            title: 'Heartbeat Pattern — Consolidation Phase',
            rule: 'v1: price range < 30% over the past 2 years of daily data.\nv2: price range ≤ 35% over the last 200 trading days (~10 months).',
            explanation:
                'Before a big move, assets often "do nothing" for months or years — trading sideways in a tight range. This looks boring but is actually institutions quietly accumulating while retail investors lose patience and sell. When the range finally breaks, few sellers remain.',
            examples: 'Credo Technology: 2 years flat at \$22 → broke out to \$216 (10×). Rocket Lab: 2 years around \$4–5 → rallied 2,500% (25×). Gold Aug 2024: multi-year heartbeat → volume explosion → significant rally.',
            note: '"Near Breakout" — v1: current price in the top 10% of the 2-year range. v2: close has crossed above the 50-bar high (confirmed breakout, matching Pine Script logic).',
            c: c,
          ),
          const SizedBox(height: AppSpacing.s5),

          _ScannerSignalRow(
            icon: Icons.trending_up_rounded,
            color: c.positive,
            label: 'REC. QTR',
            title: 'Record Quarter — Earnings Catalyst',
            rule: 'Most recent EPS is positive and strictly higher than each of the previous 3 quarters — a true record quarter.',
            explanation:
                'Profit growth is the ultimate trigger for institutional buying. Revenue growth is nice — but earnings per share (EPS) hitting new highs is what forces funds to rebalance into a stock. Even small amounts matter: going from \$0.00 to \$0.02 EPS is a massive milestone.',
            examples: 'Credo Technology: EPS 1¢ → 7¢ (7× in one quarter) → first volume explosion. Celsius: \$0 → profitable for first time → triggered the rally.',
            note: 'Stocks only. Candidates are auto-discovered daily from Yahoo Finance\'s most-active and top-gainer screeners — no manual input needed. Indices, forex, commodities, and crypto show this signal as locked.',
            c: c,
          ),
          const SizedBox(height: AppSpacing.s5),

          _ScannerSignalRow(
            icon: Icons.moving_rounded,
            color: c.accent,
            label: 'TREND ↑',
            title: 'Trend — MA50 Flat or Rising (v2 only)',
            rule: 'The 50-day simple moving average is currently flat or trending upward (MA50 now ≥ MA50 twenty days ago).',
            explanation:
                'An asset can be consolidating sideways at the bottom (no trend) or building a base on top of a rising floor. The trend filter identifies the latter — where the macro direction confirms the accumulation rather than fighting it. This is a direct match to the Pine Script\'s trend condition.',
            examples: 'S&P 500 in early 2024: MA50 rising steadily → any heartbeat setup within this trend had much higher follow-through. Assets with falling MA50 may consolidate further before any breakout.',
            note: 'Only active in v2 Pine-Aligned. v1 does not check the trend — it focuses purely on the consolidation range regardless of direction.',
            c: c,
          ),
          const SizedBox(height: AppSpacing.s6),

          // Divider
          Divider(color: c.border),
          const SizedBox(height: AppSpacing.s5),

          // Section: What the filters mean
          Text('Signal Filters Explained',
              style: AppTypography.headingSm
                  .copyWith(color: c.textPrimary)),
          const SizedBox(height: AppSpacing.s4),

          _ScannerFilterExplain(
            label: 'All',
            description:
                'Shows every asset in the scanner regardless of signal activity. Use this for a complete market overview.',
            color: c.textSecondary,
            c: c,
          ),
          const SizedBox(height: AppSpacing.s3),
          _ScannerFilterExplain(
            label: '1+ Signal',
            description:
                'At least one pattern is currently active. A good watchlist — keep an eye on these assets.',
            color: c.warning,
            c: c,
          ),
          const SizedBox(height: AppSpacing.s3),
          _ScannerFilterExplain(
            label: '2+ Signals',
            description:
                'Two patterns aligning simultaneously. Significantly higher-probability setup. Felix recommends setting a volume alert here and waiting for a breakout confirmation.',
            color: c.accent,
            c: c,
          ),
          const SizedBox(height: AppSpacing.s3),
          _ScannerFilterExplain(
            label: '3 Signals',
            description:
                'Three patterns active at once — the core "10X Bagger" setup from the workbook. Rare. Warrants serious attention.',
            color: c.positive,
            c: c,
          ),
          const SizedBox(height: AppSpacing.s3),
          _ScannerFilterExplain(
            label: '4 Signals',
            description:
                'All four signals active simultaneously (v2 only): Volume Spike + Heartbeat + Record Quarter + Trend. The highest-conviction setup possible. Extremely rare — treat it as an urgent alert.',
            color: c.positive,
            c: c,
          ),
          const SizedBox(height: AppSpacing.s6),

          // Disclaimer
          Container(
            padding: const EdgeInsets.all(AppSpacing.s4),
            decoration: BoxDecoration(
              color: c.warning.withAlpha(15),
              borderRadius: BorderRadius.circular(AppRadius.md),
              border: Border.all(color: c.warning.withAlpha(50)),
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(Icons.warning_amber_rounded,
                    size: 15, color: c.warning),
                const SizedBox(width: AppSpacing.s2),
                Expanded(
                  child: Text(
                    'Pattern detection is based on price and volume history. Past patterns do not guarantee future returns. Always use proper position sizing and stop-losses. This is not financial advice.',
                    style: AppTypography.xs.copyWith(
                        color: c.warning, height: 1.5),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    ),
  );
}

class _ScannerSignalRow extends StatelessWidget {
  const _ScannerSignalRow({
    required this.icon,
    required this.color,
    required this.label,
    required this.title,
    required this.rule,
    required this.explanation,
    required this.examples,
    required this.c,
    this.note,
  });

  final IconData icon;
  final Color color;
  final String label;
  final String title;
  final String rule;
  final String explanation;
  final String examples;
  final String? note;
  final AppPalette c;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Icon badge
        Container(
          width: 36,
          height: 36,
          decoration: BoxDecoration(
            color: color.withAlpha(25),
            borderRadius: BorderRadius.circular(AppRadius.sm),
            border: Border.all(color: color.withAlpha(80)),
          ),
          child: Icon(icon, size: 18, color: color),
        ),
        const SizedBox(width: AppSpacing.s4),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Pill badge + title
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 7, vertical: 2),
                    decoration: BoxDecoration(
                      color: color.withAlpha(25),
                      borderRadius:
                          BorderRadius.circular(AppRadius.full),
                      border:
                          Border.all(color: color.withAlpha(80)),
                    ),
                    child: Text(label,
                        style: AppTypography.xs.copyWith(
                            color: color,
                            fontWeight: FontWeight.w800,
                            letterSpacing: 0.3)),
                  ),
                ],
              ),
              const SizedBox(height: 6),
              Text(title,
                  style: AppTypography.labelMd
                      .copyWith(color: c.textPrimary)),
              const SizedBox(height: 6),
              // Rule box
              Container(
                padding: const EdgeInsets.all(AppSpacing.s3),
                decoration: BoxDecoration(
                  color: color.withAlpha(12),
                  borderRadius: BorderRadius.circular(AppRadius.sm),
                  border: Border.all(color: color.withAlpha(40)),
                ),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Icon(Icons.rule_rounded, size: 13, color: color),
                    const SizedBox(width: AppSpacing.s2),
                    Expanded(
                      child: Text(
                        rule,
                        style: AppTypography.xs.copyWith(
                            color: c.textPrimary,
                            height: 1.5,
                            fontWeight: FontWeight.w600),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: AppSpacing.s3),
              Text(explanation,
                  style: AppTypography.xs.copyWith(
                      color: c.textSecondary, height: 1.6)),
              const SizedBox(height: AppSpacing.s3),
              Text('Examples: $examples',
                  style: AppTypography.xs.copyWith(
                      color: c.textMuted,
                      height: 1.5,
                      fontStyle: FontStyle.italic)),
              if (note != null) ...[
                const SizedBox(height: AppSpacing.s2),
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Icon(Icons.info_outline_rounded,
                        size: 12, color: c.accent),
                    const SizedBox(width: 4),
                    Expanded(
                      child: Text(note!,
                          style: AppTypography.xs.copyWith(
                              color: c.accent, height: 1.5)),
                    ),
                  ],
                ),
              ],
            ],
          ),
        ),
      ],
    );
  }
}

class _ScannerFilterExplain extends StatelessWidget {
  const _ScannerFilterExplain({
    required this.label,
    required this.description,
    required this.color,
    required this.c,
  });

  final String label;
  final String description;
  final Color color;
  final AppPalette c;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          padding:
              const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
          decoration: BoxDecoration(
            color: color.withAlpha(20),
            borderRadius: BorderRadius.circular(AppRadius.full),
            border: Border.all(color: color.withAlpha(70)),
          ),
          child: Text(label,
              style: AppTypography.xs.copyWith(
                  color: color, fontWeight: FontWeight.w700)),
        ),
        const SizedBox(width: AppSpacing.s3),
        Expanded(
          child: Text(description,
              style: AppTypography.xs
                  .copyWith(color: c.textSecondary, height: 1.55)),
        ),
      ],
    );
  }
}

// ── 10X Scanner Tab ───────────────────────────────────────────────────────────

class _ScannerTab extends ConsumerStatefulWidget {
  const _ScannerTab();

  @override
  ConsumerState<_ScannerTab> createState() => _ScannerTabState();
}

class _ScannerTabState extends ConsumerState<_ScannerTab> {
  int _minSignals = 0;
  String _sort = 'signals';
  String _view = 'Assets'; // 'Assets' | 'Stocks'
  String _version = 'v1'; // 'v1' | 'v2'
  // Which signal types must be active — empty = no type filter. Keys: VOL, HEARTBEAT, REC_QTR, TREND
  Set<String> _signalFilter = {};

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final isStocks = _view == 'Stocks';
    final isV2 = _version == 'v2';
    final provider = isV2
        ? (isStocks ? _tenXV2StockScannerProvider : _tenXV2AssetScannerProvider)
        : (isStocks ? _tenXStockScannerProvider : _tenXAssetScannerProvider);
    final async = ref.watch(provider);

    return async.when(
      loading: () => Column(
        children: [
          _ScannerFilterRow(
            minSignals: _minSignals,
            sort: _sort,
            view: _view,
            version: _version,
            signalFilter: _signalFilter,
            onFilter: (v) => setState(() => _minSignals = v),
            onSort: (v) => setState(() => _sort = v),
            onView: (v) => setState(() { _view = v; _minSignals = 0; _signalFilter = {}; }),
            onVersion: (v) => setState(() { _version = v; _minSignals = 0; _signalFilter = {}; }),
            onSignalToggle: (sig) => setState(() {
              final next = Set<String>.from(_signalFilter);
              next.contains(sig) ? next.remove(sig) : next.add(sig);
              _signalFilter = next;
            }),
            onInfo: () => _showScannerInfo(context),
            onBacktest: () => context.push('/trading/10x-backtest?version=$_version&type=${_view.toLowerCase()}'),
          ),
          const Expanded(child: _ScannerSkeleton()),
        ],
      ),
      error: (e, _) => Column(
        children: [
          _ScannerFilterRow(
            minSignals: _minSignals,
            sort: _sort,
            view: _view,
            version: _version,
            signalFilter: _signalFilter,
            onFilter: (v) => setState(() => _minSignals = v),
            onSort: (v) => setState(() => _sort = v),
            onView: (v) => setState(() { _view = v; _minSignals = 0; _signalFilter = {}; }),
            onVersion: (v) => setState(() { _version = v; _minSignals = 0; _signalFilter = {}; }),
            onSignalToggle: (sig) => setState(() {
              final next = Set<String>.from(_signalFilter);
              next.contains(sig) ? next.remove(sig) : next.add(sig);
              _signalFilter = next;
            }),
            onInfo: () => _showScannerInfo(context),
            onBacktest: () => context.push('/trading/10x-backtest?version=$_version&type=${_view.toLowerCase()}'),
          ),
          Expanded(
            child: ErrorView(
              message: isStocks
                  ? 'Stock scanner unavailable'
                  : 'Scanner unavailable',
              onRetry: () => ref.invalidate(provider),
            ),
          ),
        ],
      ),
      data: (results) {
        var filtered = results
            .where((r) => r.signalsActive >= _minSignals)
            .where((r) {
              if (_signalFilter.isEmpty) return true;
              for (final sig in _signalFilter) {
                if (sig == 'VOL'       && !(r.volumeSpike && r.volumeGreen)) return false;
                if (sig == 'HEARTBEAT' && !r.heartbeat)                      return false;
                if (sig == 'REC_QTR'  && !r.recordQuarter)                   return false;
                if (sig == 'TREND'    && !r.trendUp)                          return false;
              }
              return true;
            })
            .toList();
        if (_sort == 'volume') {
          filtered.sort((a, b) => b.volumeRatio.compareTo(a.volumeRatio));
        }

        return Column(
          children: [
            _ScannerFilterRow(
              minSignals: _minSignals,
              sort: _sort,
              view: _view,
              version: _version,
              signalFilter: _signalFilter,
              onFilter: (v) => setState(() => _minSignals = v),
              onSort: (v) => setState(() => _sort = v),
              onView: (v) => setState(() { _view = v; _minSignals = 0; _signalFilter = {}; }),
              onVersion: (v) => setState(() { _version = v; _minSignals = 0; _signalFilter = {}; }),
              onSignalToggle: (sig) => setState(() {
                final next = Set<String>.from(_signalFilter);
                next.contains(sig) ? next.remove(sig) : next.add(sig);
                _signalFilter = next;
              }),
              onInfo: () => _showScannerInfo(context),
              onBacktest: () => context.push('/trading/10x-backtest?version=$_version&type=${_view.toLowerCase()}'),
            ),
            Expanded(
              child: RefreshIndicator(
                onRefresh: () => ref.refresh(provider.future),
                child: filtered.isEmpty
                    ? Center(
                        child: Padding(
                          padding: const EdgeInsets.all(AppSpacing.s8),
                          child: Text(
                            isStocks
                                ? 'No stocks match the current filter.\nTry lowering the signal count.'
                                : 'No assets match the current filter.',
                            style: AppTypography.sm.copyWith(color: c.textMuted),
                            textAlign: TextAlign.center,
                          ),
                        ),
                      )
                    : ListView.builder(
                        padding: EdgeInsets.only(
                          top: AppSpacing.s3,
                          bottom: AppSpacing.s3 +
                              MediaQuery.of(context).padding.bottom,
                        ),
                        itemCount: filtered.length,
                        itemBuilder: (_, i) =>
                            _ScannerCard(item: filtered[i]),
                      ),
              ),
            ),
          ],
        );
      },
    );
  }
}

class _ScannerFilterRow extends StatelessWidget {
  const _ScannerFilterRow({
    required this.minSignals,
    required this.sort,
    required this.view,
    required this.version,
    required this.signalFilter,
    required this.onFilter,
    required this.onSort,
    required this.onView,
    required this.onVersion,
    required this.onSignalToggle,
    required this.onInfo,
    required this.onBacktest,
  });

  final int minSignals;
  final String sort;
  final String view;
  final String version;
  final Set<String> signalFilter;
  final ValueChanged<int> onFilter;
  final ValueChanged<String> onSort;
  final ValueChanged<String> onView;
  final ValueChanged<String> onVersion;
  final ValueChanged<String> onSignalToggle;
  final VoidCallback onInfo;
  final VoidCallback onBacktest;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Container(
      color: c.surface,
      padding: const EdgeInsets.fromLTRB(
          AppSpacing.s5, AppSpacing.s3, AppSpacing.s4, AppSpacing.s3),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header row: label + backtest + info button
          Row(
            children: [
              Text('Filters',
                  style: AppTypography.labelSm
                      .copyWith(color: c.textMuted, letterSpacing: 0.5)),
              const Spacer(),
              GestureDetector(
                onTap: onBacktest,
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.history_rounded,
                        size: 13, color: c.textSecondary),
                    const SizedBox(width: 3),
                    Text('Backtest',
                        style: AppTypography.xs
                            .copyWith(color: c.textSecondary)),
                  ],
                ),
              ),
              const SizedBox(width: AppSpacing.s4),
              GestureDetector(
                onTap: onInfo,
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text('How it works',
                        style: AppTypography.xs.copyWith(color: c.accent)),
                    const SizedBox(width: 4),
                    Icon(Icons.info_outline_rounded,
                        size: 15, color: c.accent),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.s2),
          // Type switcher: Assets vs Stocks
          Row(
            children: [
              Text('Type:',
                  style: AppTypography.xs.copyWith(color: c.textMuted)),
              const SizedBox(width: AppSpacing.s2),
              _FilterChip(
                label: 'Assets',
                active: view == 'Assets',
                onTap: () => onView('Assets'),
              ),
              const SizedBox(width: AppSpacing.s2),
              _FilterChip(
                label: 'Stocks',
                active: view == 'Stocks',
                onTap: () => onView('Stocks'),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.s2),
          // Version switcher: v1 Original vs v2 Pine-Aligned
          Row(
            children: [
              Text('Ver:',
                  style: AppTypography.xs.copyWith(color: c.textMuted)),
              const SizedBox(width: AppSpacing.s2),
              _FilterChip(
                label: 'v1 Original',
                active: version == 'v1',
                onTap: () => onVersion('v1'),
              ),
              const SizedBox(width: AppSpacing.s2),
              _FilterChip(
                label: 'v2 Pine-Aligned',
                active: version == 'v2',
                onTap: () => onVersion('v2'),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.s2),
          // Signal filter chips
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                _FilterChip(
                  label: 'All',
                  active: minSignals == 0,
                  onTap: () => onFilter(0),
                ),
                const SizedBox(width: AppSpacing.s2),
                _FilterChip(
                  label: '1+ Signal',
                  active: minSignals == 1,
                  onTap: () => onFilter(1),
                ),
                const SizedBox(width: AppSpacing.s2),
                _FilterChip(
                  label: '2+ Signals',
                  active: minSignals == 2,
                  onTap: () => onFilter(2),
                ),
                const SizedBox(width: AppSpacing.s2),
                _FilterChip(
                  label: '3 Signals',
                  active: minSignals == 3,
                  onTap: () => onFilter(3),
                ),
                const SizedBox(width: AppSpacing.s2),
                _FilterChip(
                  label: '4 Signals',
                  active: minSignals == 4,
                  onTap: () => onFilter(4),
                ),
              ],
            ),
          ),
          const SizedBox(height: AppSpacing.s2),
          // Signal type filter: multi-select; TREND disabled in v1
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                Text('Signals:',
                    style: AppTypography.xs.copyWith(color: c.textMuted)),
                const SizedBox(width: AppSpacing.s2),
                _FilterChip(
                  label: 'VOL',
                  active: signalFilter.contains('VOL'),
                  onTap: () => onSignalToggle('VOL'),
                ),
                const SizedBox(width: AppSpacing.s2),
                _FilterChip(
                  label: 'HEARTBEAT',
                  active: signalFilter.contains('HEARTBEAT'),
                  onTap: () => onSignalToggle('HEARTBEAT'),
                ),
                const SizedBox(width: AppSpacing.s2),
                _FilterChip(
                  label: 'REC. QTR',
                  active: signalFilter.contains('REC_QTR'),
                  onTap: () => onSignalToggle('REC_QTR'),
                ),
                const SizedBox(width: AppSpacing.s2),
                _FilterChip(
                  label: 'TREND ↑',
                  active: signalFilter.contains('TREND'),
                  // TREND is v2-only — show as disabled with ✕ in v1
                  disabled: version == 'v1',
                  onTap: () => onSignalToggle('TREND'),
                ),
              ],
            ),
          ),
          const SizedBox(height: AppSpacing.s2),
          // Sort chips
          Row(
            children: [
              Text('Sort:',
                  style: AppTypography.xs.copyWith(color: c.textMuted)),
              const SizedBox(width: AppSpacing.s2),
              _FilterChip(
                label: 'Signal Count',
                active: sort == 'signals',
                onTap: () => onSort('signals'),
              ),
              const SizedBox(width: AppSpacing.s2),
              _FilterChip(
                label: 'Volume Ratio',
                active: sort == 'volume',
                onTap: () => onSort('volume'),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _FilterChip extends StatelessWidget {
  const _FilterChip({
    required this.label,
    required this.active,
    required this.onTap,
    this.disabled = false,
  });

  final String label;
  final bool active;
  final VoidCallback onTap;
  // disabled = feature not applicable in current context (e.g. TREND on v1).
  // Shown greyed with a ✕ prefix and is not tappable.
  final bool disabled;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;

    if (disabled) {
      return Container(
        padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.s4, vertical: AppSpacing.s2),
        decoration: BoxDecoration(
          color: Colors.transparent,
          borderRadius: BorderRadius.circular(AppRadius.full),
          border: Border.all(color: c.border.withAlpha(80)),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.close_rounded, size: 9, color: c.textFaint),
            const SizedBox(width: 3),
            Text(
              label,
              style: AppTypography.xs.copyWith(
                color: c.textFaint,
                fontWeight: FontWeight.w500,
                decoration: TextDecoration.lineThrough,
                decorationColor: c.textFaint,
              ),
            ),
          ],
        ),
      );
    }

    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.s4, vertical: AppSpacing.s2),
        decoration: BoxDecoration(
          color: active ? c.accent.withAlpha(25) : Colors.transparent,
          borderRadius: BorderRadius.circular(AppRadius.full),
          border: Border.all(
            color: active ? c.accent : c.border,
          ),
        ),
        child: Text(
          label,
          style: AppTypography.xs.copyWith(
            color: active ? c.accent : c.textSecondary,
            fontWeight: active ? FontWeight.w700 : FontWeight.w500,
          ),
        ),
      ),
    );
  }
}

class _ScannerCard extends StatelessWidget {
  const _ScannerCard({required this.item});

  final TenXScanResult item;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final isUp = item.changePercent >= 0;
    final pctColor = isUp ? c.positive : c.danger;

    return GestureDetector(
      onTap: () => context.push(
        '/asset/${Uri.encodeComponent(item.symbol)}'
        '?name=${Uri.encodeComponent(item.name)}',
      ),
      child: GlassCard(
        margin: const EdgeInsets.symmetric(
          horizontal: AppSpacing.s5,
          vertical: AppSpacing.s2,
        ),
        padding: const EdgeInsets.all(AppSpacing.s4),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Row 1: flag/ticker + name + price + pct chip
            Row(
              children: [
                if (item.category == 'Stocks') ...[
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 2),
                    decoration: BoxDecoration(
                      color: context.colors.surfaceCard,
                      borderRadius: BorderRadius.circular(AppRadius.xs),
                      border: Border.all(color: context.colors.border),
                    ),
                    child: Text(
                      item.symbol,
                      style: AppTypography.xs.copyWith(
                          color: context.colors.textSecondary,
                          fontWeight: FontWeight.w700),
                    ),
                  ),
                  const SizedBox(width: AppSpacing.s2),
                ] else if (item.flag.isNotEmpty) ...[
                  Text(item.flag,
                      style: const TextStyle(fontSize: 18)),
                  const SizedBox(width: AppSpacing.s2),
                ],
                Expanded(
                  child: Text(
                    item.name,
                    style: AppTypography.labelLg
                        .copyWith(color: c.textPrimary),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                Text(
                  _fmtPrice(item.price),
                  style: AppTypography.numericLg
                      .copyWith(color: c.textPrimary),
                ),
                const SizedBox(width: AppSpacing.s2),
                _PctChip(pct: item.changePercent, color: pctColor),
              ],
            ),
            const SizedBox(height: AppSpacing.s3),
            // Row 2: signal pill badges
            Wrap(
              spacing: AppSpacing.s2,
              runSpacing: AppSpacing.s2,
              children: [
                _SignalPill(
                  label: item.volumeRatio > 0
                      ? 'VOL ${item.volumeRatio.toStringAsFixed(1)}x'
                      : 'VOL —',
                  active: item.volumeSpike && item.volumeGreen,
                  activeColor: item.volumeSpike && !item.volumeGreen
                      ? c.warning
                      : c.positive,
                ),
                _SignalPill(
                  label: 'HEARTBEAT',
                  active: item.heartbeat,
                  activeColor: item.nearBreakout ? c.accent : c.accent,
                ),
                _SignalPill(
                  label: 'REC. QTR',
                  active: item.recordQuarter,
                  activeColor: c.positive,
                  locked: !item.epsApplicable,
                ),
                if (item.trendUp || item.signalsActive >= 4)
                  _SignalPill(
                    label: 'TREND ↑',
                    active: item.trendUp,
                    activeColor: c.accent,
                  ),
              ],
            ),
            const SizedBox(height: AppSpacing.s3),
            // Row 3: dot indicators
            _SignalDots(count: item.signalsActive),
          ],
        ),
      ),
    );
  }

  String _fmtPrice(double p) {
    if (p > 1000) return p.toStringAsFixed(0);
    if (p < 1) return p.toStringAsFixed(4);
    return p.toStringAsFixed(2);
  }
}

class _SignalPill extends StatelessWidget {
  const _SignalPill({
    required this.label,
    required this.active,
    required this.activeColor,
    this.locked = false,
  });

  final String label;
  final bool active;
  final Color activeColor;
  final bool locked;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final color = active ? activeColor : c.textFaint;
    final bg = active ? activeColor.withAlpha(30) : Colors.transparent;
    final border = active ? activeColor.withAlpha(80) : c.border;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(AppRadius.full),
        border: Border.all(color: border),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (locked) ...[
            Icon(Icons.lock_rounded, size: 9, color: c.textMuted),
            const SizedBox(width: 3),
          ],
          Text(
            label,
            style: AppTypography.xs.copyWith(
              color: color,
              fontWeight: FontWeight.w700,
              letterSpacing: 0.3,
            ),
          ),
        ],
      ),
    );
  }
}

class _SignalDots extends StatelessWidget {
  const _SignalDots({required this.count});

  final int count;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Row(
      children: [
        Text(
          '$count of 3 signals',
          style: AppTypography.xs.copyWith(color: c.textMuted),
        ),
        const SizedBox(width: AppSpacing.s2),
        ...List.generate(
          3,
          (i) => Container(
            width: 8,
            height: 8,
            margin: const EdgeInsets.only(right: 4),
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: i < count ? c.accent : c.border,
            ),
          ),
        ),
      ],
    );
  }
}

class _PctChip extends StatelessWidget {
  const _PctChip({required this.pct, required this.color});

  final double pct;
  final Color color;

  @override
  Widget build(BuildContext context) {
    final sign = pct >= 0 ? '+' : '';
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: color.withAlpha(25),
        borderRadius: BorderRadius.circular(AppRadius.xs),
        border: Border.all(color: color.withAlpha(60)),
      ),
      child: RichText(
        text: TextSpan(
          children: [
            TextSpan(
              text: '$sign${pct.toStringAsFixed(2)}%',
              style: AppTypography.xs.copyWith(
                color: color,
                fontWeight: FontWeight.w700,
              ),
            ),
            TextSpan(
              text: ' 1D',
              style: AppTypography.xs.copyWith(
                color: color.withAlpha(160),
                fontWeight: FontWeight.w500,
                fontSize: 9,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ── Best Setups Card ──────────────────────────────────────────────────────────

class _BestSetupsCard extends ConsumerStatefulWidget {
  const _BestSetupsCard({required this.type});

  final String type;

  @override
  ConsumerState<_BestSetupsCard> createState() => _BestSetupsCardState();
}

class _BestSetupsCardState extends ConsumerState<_BestSetupsCard> {
  String _version = 'v1';
  String _type = 'assets';

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final isPro = EntitlementService.can('best_setups');
    final args = (version: _version, type: _type);
    final async = ref.watch(_bestSetupsProvider(args));

    return Padding(
      padding: const EdgeInsets.fromLTRB(
          AppSpacing.s5, AppSpacing.s4, AppSpacing.s5, 0),
      child: Container(
        decoration: BoxDecoration(
          color: c.surfaceCard,
          borderRadius: BorderRadius.circular(AppRadius.md),
          border: Border.all(color: c.border),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(
                  AppSpacing.s4, AppSpacing.s4, AppSpacing.s4, AppSpacing.s2),
              child: Row(
                children: [
                  Icon(Icons.bolt_rounded, size: 16, color: c.warning),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text(
                      'Best Setups Right Now',
                      style: AppTypography.labelMd
                          .copyWith(color: c.textPrimary),
                    ),
                  ),
                  GestureDetector(
                    onTap: () => _showBestSetupsInfo(context),
                    child: Padding(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 4, vertical: 2),
                      child: Icon(Icons.info_outline_rounded,
                          size: 16, color: c.textMuted),
                    ),
                  ),
                  const SizedBox(width: AppSpacing.s2),
                  // Assets / Stocks toggle
                  GestureDetector(
                    onTap: () => setState(
                        () => _type = _type == 'assets' ? 'stocks' : 'assets'),
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 8, vertical: 3),
                      decoration: BoxDecoration(
                        color: c.surfaceCard,
                        borderRadius:
                            BorderRadius.circular(AppRadius.full),
                        border: Border.all(color: c.border),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          _VersionDot(
                              label: 'Assets',
                              active: _type == 'assets',
                              c: c),
                          const SizedBox(width: 4),
                          _VersionDot(
                              label: 'Stocks',
                              active: _type == 'stocks',
                              c: c),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(width: AppSpacing.s2),
                  // v1 / v2 toggle
                  GestureDetector(
                    onTap: () => setState(
                        () => _version = _version == 'v1' ? 'v2' : 'v1'),
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 8, vertical: 3),
                      decoration: BoxDecoration(
                        color: c.surfaceCard,
                        borderRadius:
                            BorderRadius.circular(AppRadius.full),
                        border: Border.all(color: c.border),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          _VersionDot(
                              label: 'v1',
                              active: _version == 'v1',
                              c: c),
                          const SizedBox(width: 4),
                          _VersionDot(
                              label: 'v2',
                              active: _version == 'v2',
                              c: c),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(width: AppSpacing.s2),
                  Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 8, vertical: 3),
                    decoration: BoxDecoration(
                      color: c.accentDim18,
                      borderRadius:
                          BorderRadius.circular(AppRadius.full),
                    ),
                    child: Text('Pro',
                        style: AppTypography.xs.copyWith(
                            color: c.accent,
                            fontWeight: FontWeight.w700)),
                  ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(
                  AppSpacing.s4, 0, AppSpacing.s4, AppSpacing.s3),
              child: Text(
                'Signals firing today with ≥65% historical 1m win rate',
                style: AppTypography.xs.copyWith(color: c.textMuted),
              ),
            ),
            const Divider(height: 1),
            if (!isPro)
              _BestSetupsLockedBody(c: c, context: context)
            else
              async.when(
                loading: () => _BestSetupsLoadingBody(c: c),
                error: (_, __) => const SizedBox.shrink(),
                data: (resp) {
                  if (!resp.cacheWarm) {
                    return Padding(
                      padding: const EdgeInsets.all(AppSpacing.s4),
                      child: Row(
                        children: [
                          Icon(Icons.hourglass_top_rounded,
                              size: 14, color: c.textMuted),
                          const SizedBox(width: 6),
                          Text('Warming up — check back in ~2 min',
                              style: AppTypography.xs
                                  .copyWith(color: c.textMuted)),
                        ],
                      ),
                    );
                  }
                  if (resp.setups.isEmpty) {
                    return Padding(
                      padding: const EdgeInsets.all(AppSpacing.s4),
                      child: Text(
                        'No setups above 65% win rate today',
                        style:
                            AppTypography.xs.copyWith(color: c.textMuted),
                      ),
                    );
                  }
                  return Column(
                    children: [
                      ...resp.setups.map((s) => _SetupRow(
                          setup: s,
                          version: _version,
                          type: _type,
                        )),
                      GestureDetector(
                        onTap: () => context.push(
                            '/trading/10x-backtest?version=$_version&type=$_type'),
                        child: Padding(
                          padding: const EdgeInsets.symmetric(
                              horizontal: AppSpacing.s4,
                              vertical: AppSpacing.s3),
                          child: Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Text('View Backtest History',
                                  style: AppTypography.xs.copyWith(
                                      color: c.accent)),
                              const SizedBox(width: 4),
                              Icon(Icons.arrow_forward_rounded,
                                  size: 12, color: c.accent),
                            ],
                          ),
                        ),
                      ),
                    ],
                  );
                },
              ),
          ],
        ),
      ),
    );
  }
}

class _VersionDot extends StatelessWidget {
  const _VersionDot(
      {required this.label, required this.active, required this.c});
  final String label;
  final bool active;
  final AppPalette c;

  @override
  Widget build(BuildContext context) {
    return Text(
      label,
      style: AppTypography.xs.copyWith(
        color: active ? c.accent : c.textMuted,
        fontWeight: active ? FontWeight.w700 : FontWeight.w400,
      ),
    );
  }
}

class _BestSetupsLockedBody extends StatelessWidget {
  const _BestSetupsLockedBody(
      {required this.c, required this.context});
  final AppPalette c;
  final BuildContext context;

  @override
  Widget build(BuildContext ctx) {
    return Padding(
      padding: const EdgeInsets.all(AppSpacing.s4),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  height: 10,
                  width: 180,
                  decoration: BoxDecoration(
                    color: c.border,
                    borderRadius: BorderRadius.circular(AppRadius.xs),
                  ),
                ),
                const SizedBox(height: AppSpacing.s2),
                Container(
                  height: 10,
                  width: 120,
                  decoration: BoxDecoration(
                    color: c.border,
                    borderRadius: BorderRadius.circular(AppRadius.xs),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: AppSpacing.s3),
          GestureDetector(
            onTap: () => UpgradeSheet.show(context, feature: 'best_setups'),
            child: Container(
              padding: const EdgeInsets.symmetric(
                  horizontal: AppSpacing.s4, vertical: AppSpacing.s2),
              decoration: BoxDecoration(
                color: c.accent,
                borderRadius: BorderRadius.circular(AppRadius.full),
              ),
              child: Text('Upgrade to Pro',
                  style: AppTypography.xs.copyWith(
                      color: Colors.black,
                      fontWeight: FontWeight.w700)),
            ),
          ),
        ],
      ),
    );
  }
}

class _BestSetupsLoadingBody extends StatelessWidget {
  const _BestSetupsLoadingBody({required this.c});
  final AppPalette c;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(AppSpacing.s4),
      child: Row(
        children: [
          SizedBox(
              width: 14,
              height: 14,
              child: CircularProgressIndicator(
                  strokeWidth: 1.5, color: c.textMuted)),
          const SizedBox(width: AppSpacing.s3),
          Text('Checking today\'s setups…',
              style: AppTypography.xs.copyWith(color: c.textMuted)),
        ],
      ),
    );
  }
}

TextSpan _wrSpan(String label, double rate, AppPalette c,
    {bool muted = false}) {
  final color = muted
      ? c.textFaint
      : rate >= 70
          ? c.positive
          : rate >= 55
              ? c.warning
              : c.danger;
  return TextSpan(
    text: '$label ${rate.toStringAsFixed(0)}%',
    style: AppTypography.xs.copyWith(color: color, fontWeight: FontWeight.w600),
  );
}

TextSpan _dotSep(AppPalette c) =>
    TextSpan(text: ' · ', style: AppTypography.xs.copyWith(color: c.textFaint));

class _SetupRow extends StatelessWidget {
  const _SetupRow(
      {required this.setup, required this.version, required this.type});
  final BestSetup setup;
  final String version;
  final String type;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return GestureDetector(
      onTap: () => context.push('/trading/10x-backtest?version=$version&type=$type'),
      child: Container(
        decoration: BoxDecoration(
          border: Border(top: BorderSide(color: c.border)),
        ),
        padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.s4, vertical: AppSpacing.s3),
        child: Row(
          children: [
            Text(setup.flag,
                style: const TextStyle(fontSize: 18)),
            const SizedBox(width: AppSpacing.s3),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(setup.name,
                      style: AppTypography.labelSm
                          .copyWith(color: c.textPrimary),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis),
                  Row(
                    children: List.generate(4, (i) {
                      return Padding(
                        padding: const EdgeInsets.only(right: 2),
                        child: Container(
                          width: 6,
                          height: 6,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            color: i < setup.signalsActive
                                ? c.accent
                                : c.border,
                          ),
                        ),
                      );
                    })
                      ..add(Padding(
                        padding: const EdgeInsets.only(left: 4),
                        child: Text(
                          '${setup.signalsActive} signal${setup.signalsActive == 1 ? '' : 's'}',
                          style: AppTypography.xs
                              .copyWith(color: c.textMuted),
                        ),
                      )),
                  ),
                ],
              ),
            ),
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                RichText(
                  text: TextSpan(children: [
                    _wrSpan('1m', setup.winRate1m, c),
                    _dotSep(c),
                    _wrSpan('3m', setup.winRate3m, c),
                    _dotSep(c),
                    _wrSpan('1y', setup.winRate1y, c),
                    if (setup.sampleSize3y > 0) ...[
                      _dotSep(c),
                      _wrSpan('3y', setup.winRate3y, c,
                          muted: setup.sampleSize3y < 10),
                    ],
                  ]),
                ),
                Text(
                  'Avg ${setup.avgReturn3m >= 0 ? '+' : ''}${setup.avgReturn3m.toStringAsFixed(1)}% 3m',
                  style: AppTypography.xs.copyWith(color: c.textMuted),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────

class _ScannerSkeleton extends StatelessWidget {
  const _ScannerSkeleton();

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return ListView.builder(
      padding: const EdgeInsets.all(AppSpacing.s5),
      itemCount: 6,
      itemBuilder: (_, __) => Container(
        height: 110,
        margin: const EdgeInsets.only(bottom: AppSpacing.s3),
        decoration: BoxDecoration(
          color: c.surfaceCard,
          borderRadius: BorderRadius.circular(AppRadius.md),
          border: Border.all(color: c.border),
        ),
      ),
    );
  }
}
