import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
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
import '../../shared/widgets/glass_card.dart';
import '../../shared/widgets/signal_badge.dart';
import '../../shared/widgets/error_view.dart';
import '../../shared/widgets/freshness_bar.dart';
import '../../shared/widgets/max_width_layout.dart';
import '../../shared/widgets/shimmer_list.dart';
import '../../shared/widgets/theme_toggle.dart';
import '../../providers/watchlist_provider.dart';
import '../investing/best_setups_card.dart';

// ── Providers ─────────────────────────────────────────────────────────────────

final _quotesProvider = FutureProvider.autoDispose<List<QuoteItem>>(
    (_) => TradingRepository.instance.fetchQuotes());

final _tenXAssetScannerProvider =
    FutureProvider.autoDispose<List<TenXScanResult>>(
  (_) => TradingRepository.instance.fetchTenXAssets(),
);

final _tenXV2AssetScannerProvider =
    FutureProvider.autoDispose<List<TenXScanResult>>(
  (_) => TradingRepository.instance.fetchTenXV2Assets(),
);

final _tenXV3AssetScannerProvider =
    FutureProvider.autoDispose<List<TenXScanResult>>(
  (_) => TradingRepository.instance.fetchTenXV3Assets(),
);

final _tenXV3CommoditiesAssetScannerProvider =
    FutureProvider.autoDispose<List<TenXScanResult>>(
  (_) => TradingRepository.instance.fetchTenXV3CommoditiesAssets(),
);

final _tenXV3ForexAssetScannerProvider =
    FutureProvider.autoDispose<List<TenXScanResult>>(
  (_) => TradingRepository.instance.fetchTenXV3ForexAssets(),
);

final _tenXV3CryptoAssetScannerProvider =
    FutureProvider.autoDispose<List<TenXScanResult>>(
  (_) => TradingRepository.instance.fetchTenXV3CryptoAssets(),
);

final _stockSearchProvider = FutureProvider.autoDispose
    .family<List<StockSearchResult>, String>(
  (_, query) => TradingRepository.instance.searchStocks(query),
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
    _tab = TabController(length: 5, vsync: this);
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
          isScrollable: true,
          tabAlignment: TabAlignment.fill,
          tabs: const [
            Tab(text: 'Instruments'),
            Tab(text: 'Dashboard'),
            Tab(text: 'Power Moves'),
            Tab(text: 'Signals'),
            Tab(text: 'Alerts'),
          ],
        ),
      ),
      body: MaxWidthLayout(
        child: TabBarView(
          controller: _tab,
          children: const [
            _DashboardTab(),
            _DashboardzTab(),
            _PowerMovesTab(),
            _SignalsTab(),
            _AlertsTab(),
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
  String _category = 'Commodities';
  Timer? _refreshTimer;
  DateTime _lastQuotesUpdate = DateTime.now();

  static const _categories = ['Watchlist', 'Commodities', 'Indices', 'Stocks', 'Forex', 'Crypto'];

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
    _refreshTimer = Timer.periodic(const Duration(seconds: 25), (_) {
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
                  padding: const EdgeInsets.symmetric(horizontal: AppSpacing.s8),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Container(
                        width: 64,
                        height: 64,
                        decoration: BoxDecoration(
                          color: c.accentDim,
                          shape: BoxShape.circle,
                        ),
                        child: Stack(
                          alignment: Alignment.center,
                          children: [
                            Icon(Icons.star_rounded,
                                size: 30, color: c.accent),
                          ],
                        ),
                      ),
                      const SizedBox(height: AppSpacing.s5),
                      Text('Your watchlist is empty',
                          style: AppTypography.headingSm
                              .copyWith(color: c.textPrimary),
                          textAlign: TextAlign.center),
                      const SizedBox(height: AppSpacing.s2),
                      Text(
                          'Star any asset to track it here',
                          style: AppTypography.md.copyWith(color: c.textSecondary),
                          textAlign: TextAlign.center),
                      const SizedBox(height: AppSpacing.s6),
                      FilledButton.icon(
                        onPressed: () {
                          HapticFeedback.lightImpact();
                          setState(() => _category = 'Commodities');
                        },
                        style: FilledButton.styleFrom(
                          backgroundColor: c.accentDim18,
                          foregroundColor: c.accent,
                        ),
                        icon: const Icon(Icons.explore_rounded, size: 18),
                        label: const Text('Browse Assets'),
                      ),
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
        loading: () => const ShimmerList(count: 8, type: ShimmerRowType.signal),
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
                    itemBuilder: (ctx, i) => _AssetRow(
                        key: ValueKey(filtered[i].symbol), item: filtered[i]),
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
      loading: () => const ShimmerList(count: 8, type: ShimmerRowType.signal),
      error: (e, _) => ErrorView(
        message: 'Failed to load quotes',
        onRetry: () => ref.invalidate(_quotesProvider),
      ),
      data: (quotes) {
        final filtered =
            quotes.where((q) => q.category == _category).toList();

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
                  itemBuilder: (ctx, i) => _AssetRow(
                      key: ValueKey(filtered[i].symbol), item: filtered[i]),
                ),
              ),
            ),
          ],
        );
      },
    );
  }
}

// ── Dashboardz Tab (Best Setups — Assets) ─────────────────────────────────────

class _DashboardzTab extends ConsumerStatefulWidget {
  const _DashboardzTab();

  @override
  ConsumerState<_DashboardzTab> createState() => _DashboardzTabState();
}

class _DashboardzTabState extends ConsumerState<_DashboardzTab> {
  String _version = 'v1';
  static const String _type = 'assets';

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      TradingRepository.instance
          .fetchBestSetups(version: 'v1', type: _type)
          .ignore();
    });
  }

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: EdgeInsets.fromLTRB(
        AppSpacing.s5,
        AppSpacing.s5,
        AppSpacing.s5,
        AppSpacing.s5 + MediaQuery.of(context).padding.bottom,
      ),
      children: [
        BestSetupsCard(
          type: _type,
          version: _version,
          onVersionChanged: (v) => setState(() => _version = v),
        ),
      ],
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
        padding: const EdgeInsets.only(top: 60, left: AppSpacing.s8, right: AppSpacing.s8),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 56,
              height: 56,
              decoration: BoxDecoration(
                color: c.accentDim,
                shape: BoxShape.circle,
              ),
              child: Icon(Icons.manage_search_rounded, size: 26, color: c.accent),
            ),
            const SizedBox(height: AppSpacing.s4),
            Text('Search any stock worldwide',
                style: AppTypography.lg.copyWith(color: c.textPrimary),
                textAlign: TextAlign.center),
            const SizedBox(height: AppSpacing.s2),
            Text('Tap a result to view Chart, Signal & more',
                style: AppTypography.sm.copyWith(color: c.textSecondary),
                textAlign: TextAlign.center),
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

class _AssetRow extends StatefulWidget {
  const _AssetRow({required this.item, super.key});
  final QuoteItem item;

  @override
  State<_AssetRow> createState() => _AssetRowState();
}

class _AssetRowState extends State<_AssetRow> {
  Color? _flashColor;

  @override
  void didUpdateWidget(_AssetRow oldWidget) {
    super.didUpdateWidget(oldWidget);
    final oldPrice = oldWidget.item.price;
    final newPrice = widget.item.price;
    if (oldPrice != null && newPrice != null && oldPrice != newPrice) {
      final c = context.colors;
      final isUp = newPrice > oldPrice;
      setState(() => _flashColor = isUp
          ? c.positive.withAlpha(36)
          : c.danger.withAlpha(36));
      Future.delayed(const Duration(milliseconds: 700), () {
        if (mounted) setState(() => _flashColor = null);
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final item = widget.item;
    final pct = item.changePercent;
    final isUp = (pct ?? 0) >= 0;
    final pctColor = isUp ? c.positive : c.danger;
    final pctStr = pct == null
        ? '--'
        : '${isUp ? '+' : ''}${pct.toStringAsFixed(2)}%';

    return InkWell(
      onTap: () {
        HapticFeedback.selectionClick();
        context.push(
            '/asset/${Uri.encodeComponent(item.symbol)}?name=${Uri.encodeComponent(item.name)}');
      },
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 300),
        color: _flashColor ?? Colors.transparent,
        padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.s5, vertical: AppSpacing.s4),
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
                AnimatedSwitcher(
                  duration: const Duration(milliseconds: 200),
                  child: Text(
                    _formatPrice(item.price),
                    key: ValueKey(item.price),
                    style: AppTypography.numericLg.copyWith(color: c.textPrimary),
                  ),
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
    const all = TradingStrategy.values;
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
  bool _alertSuccess = false;

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
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 250),
                  decoration: BoxDecoration(
                    color: _alertSuccess ? c.positive : c.accent,
                    borderRadius: BorderRadius.circular(AppRadius.sm),
                  ),
                  child: FilledButton(
                    onPressed: _alertSuccess ? null : _addAlert,
                    style: FilledButton.styleFrom(
                      backgroundColor: Colors.transparent,
                      foregroundColor: c.background,
                      shadowColor: Colors.transparent,
                      disabledBackgroundColor: Colors.transparent,
                      disabledForegroundColor: c.background,
                    ),
                    child: AnimatedSwitcher(
                      duration: const Duration(milliseconds: 250),
                      child: _alertSuccess
                          ? Row(
                              key: const ValueKey('success'),
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                const Icon(Icons.check_circle_outline_rounded,
                                    size: 18),
                                const SizedBox(width: AppSpacing.s2),
                                Text('Alert Set',
                                    style: AppTypography.labelLg
                                        .copyWith(color: c.background)),
                              ],
                            )
                          : Text('Set Alert',
                              key: const ValueKey('idle'),
                              style: AppTypography.labelLg
                                  .copyWith(color: c.background)),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: AppSpacing.s5),
        if (alerts.isEmpty)
          Center(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: AppSpacing.s8),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Container(
                    width: 64,
                    height: 64,
                    decoration: BoxDecoration(
                      color: c.accentDim,
                      shape: BoxShape.circle,
                    ),
                    child: Icon(Icons.notifications_none_rounded,
                        color: c.accent, size: 28),
                  ),
                  const SizedBox(height: AppSpacing.s5),
                  Text('No price alerts set',
                      style: AppTypography.headingSm
                          .copyWith(color: c.textPrimary),
                      textAlign: TextAlign.center),
                  const SizedBox(height: AppSpacing.s2),
                  Text(
                      'Get notified when any asset hits your target price',
                      style: AppTypography.md.copyWith(color: c.textSecondary),
                      textAlign: TextAlign.center),
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
    HapticFeedback.mediumImpact();
    _symbolCtrl.clear();
    _nameCtrl.clear();
    _priceCtrl.clear();
    if (!mounted) return;
    setState(() => _alertSuccess = true);
    Future.delayed(const Duration(milliseconds: 1800), () {
      if (mounted) setState(() => _alertSuccess = false);
    });
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

// ── Power Moves Tab ───────────────────────────────────────────────────────────

class _PowerMovesTab extends ConsumerStatefulWidget {
  const _PowerMovesTab();

  @override
  ConsumerState<_PowerMovesTab> createState() => _PowerMovesTabState();
}

class _PowerMovesTabState extends ConsumerState<_PowerMovesTab> {
  int _minSignals = 0;
  String _sort = 'signals';
  String _version = 'v1';
  // 'Indices' | 'Forex' | 'Commodities' | 'Crypto' — matches server category field
  String _type = 'Commodities';
  Set<String> _signalFilter = {};

  static String _cacheKeyFor(String version) {
    switch (version) {
      case 'v2': return 'assets-v2';
      case 'v3': return 'assets-v3';
      case 'v3c': return 'commodities-v3';
      case 'v3f': return 'forex-v3';
      case 'v3crypto': return 'crypto-v3';
      default: return 'assets-v1';
    }
  }

  @override
  void initState() {
    super.initState();
    // Pre-warm v1 assets (default) and v3 indices (most commonly switched to).
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      TradingRepository.instance.fetchTenXAssets().ignore();
      TradingRepository.instance.fetchTenXV3Assets().ignore();
    });
  }

  void _onTypeChanged(String t) {
    setState(() {
      _type = t;
      _minSignals = 0;
      _signalFilter = {};
      if (t == 'Indices') { _version = 'v3'; return; }
      if (t == 'Forex')   { _version = 'v3f'; return; }
      if (t == 'Crypto')  { _version = 'v3crypto'; return; }
      if (_version == 'v3' || _version == 'v3f' || _version == 'v3crypto') _version = 'v1';
    });
  }

  Widget _buildFilterRow(BuildContext context) => _PMFilterRow(
        minSignals: _minSignals,
        sort: _sort,
        version: _version,
        type: _type,
        signalFilter: _signalFilter,
        onFilter: (v) => setState(() => _minSignals = v),
        onSort: (v) => setState(() => _sort = v),
        onType: _onTypeChanged,
        onVersion: (v) => setState(() {
          _version = v;
          _minSignals = 0;
          _signalFilter = {};
        }),
        onSignalToggle: (sig) => setState(() {
          final next = Set<String>.from(_signalFilter);
          next.contains(sig) ? next.remove(sig) : next.add(sig);
          _signalFilter = next;
        }),
        onInfo: () => _showPMInfo(context, version: _version),
        onBacktest: (_version == 'v3' || _version == 'v3c' ||
                _version == 'v3f' || _version == 'v3crypto')
            ? null
            : () => context.push(
                '/trading/10x-backtest?version=$_version&type=assets'),
      );

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final provider = _version == 'v3'
        ? _tenXV3AssetScannerProvider
        : _version == 'v3c'
            ? _tenXV3CommoditiesAssetScannerProvider
            : _version == 'v3f'
                ? _tenXV3ForexAssetScannerProvider
                : _version == 'v3crypto'
                    ? _tenXV3CryptoAssetScannerProvider
                    : (_version == 'v2'
                        ? _tenXV2AssetScannerProvider
                        : _tenXAssetScannerProvider);
    final async = ref.watch(provider);
    final filterRow = _buildFilterRow(context);

    return async.when(
      loading: () => Column(
        children: [
          filterRow,
          const Expanded(child: _PMSkeleton()),
        ],
      ),
      error: (e, _) => Column(
        children: [
          filterRow,
          Expanded(
            child: ErrorView(
              message: 'Scanner unavailable',
              onRetry: () => ref.invalidate(provider),
            ),
          ),
        ],
      ),
      data: (results) {
        final isV3 = _version == 'v3';
        var filtered = results
            .where((r) => r.category == _type)
            .where((r) => r.signalsActive >= _minSignals)
            .where((r) {
              if (_signalFilter.isEmpty) return true;
              for (final sig in _signalFilter) {
                if (isV3) {
                  if (sig == 'THRUST' && !r.thrust) return false;
                  if (sig == 'BASE' && !r.base) return false;
                  if (sig == 'UPTREND' && !r.uptrend) return false;
                  if (sig == 'NEW_HIGH' && !r.newHighReclaim) return false;
                  if (sig == 'BREAKOUT' && !r.regimeBreakout) return false;
                } else if (_version == 'v3c' || _version == 'v3crypto') {
                  if (sig == 'VOL' && !(r.volumeSpike && r.volumeGreen)) return false;
                  if (sig == 'HEARTBEAT' && !r.heartbeat) return false;
                  if (sig == 'CATALYST' && !r.regimeBreakout) return false;
                } else if (_version == 'v3f') {
                  if (sig == 'VOL' && !(r.volumeSpike && r.volumeGreen)) return false;
                  if (sig == 'RANGE' && !r.heartbeat) return false;
                  if (sig == 'BREAKOUT' && !r.regimeBreakout) return false;
                } else {
                  if (sig == 'VOL' && !(r.volumeSpike && r.volumeGreen)) return false;
                  if (sig == 'HEARTBEAT' && !r.heartbeat) return false;
                  if (sig == 'REC_QTR' && !r.recordQuarter) return false;
                  if (sig == 'TREND' && !r.trendUp) return false;
                }
              }
              return true;
            })
            .toList();
        if (_sort == 'volume') {
          filtered.sort((a, b) => b.volumeRatio.compareTo(a.volumeRatio));
        }

        return Column(
          children: [
            filterRow,
            Expanded(
              child: RefreshIndicator(
                onRefresh: () {
                  TradingRepository.instance
                      .clearScannerCache(_cacheKeyFor(_version));
                  return ref.refresh(provider.future);
                },
                child: filtered.isEmpty
                    ? Center(
                        child: Padding(
                          padding: const EdgeInsets.all(AppSpacing.s8),
                          child: Text(
                            'No assets match the current filter.',
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
                            _PMCard(item: filtered[i], version: _version),
                      ),
              ),
            ),
          ],
        );
      },
    );
  }
}

// ── Power Moves Filter Row ────────────────────────────────────────────────────

class _PMFilterRow extends StatelessWidget {
  const _PMFilterRow({
    required this.minSignals,
    required this.sort,
    required this.version,
    required this.type,
    required this.signalFilter,
    required this.onFilter,
    required this.onSort,
    required this.onType,
    required this.onVersion,
    required this.onSignalToggle,
    required this.onInfo,
    required this.onBacktest,
  });

  final int minSignals;
  final String sort;
  final String version;
  final String type;
  final Set<String> signalFilter;
  final ValueChanged<int> onFilter;
  final ValueChanged<String> onSort;
  final ValueChanged<String> onType;
  final ValueChanged<String> onVersion;
  final ValueChanged<String> onSignalToggle;
  final VoidCallback onInfo;
  final VoidCallback? onBacktest;

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
          Row(
            children: [
              Text('Filters',
                  style: AppTypography.labelSm
                      .copyWith(color: c.textMuted, letterSpacing: 0.5)),
              const Spacer(),
              if (onBacktest != null) ...[
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
              ],
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
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                Text('Type:',
                    style: AppTypography.xs.copyWith(color: c.textMuted)),
                const SizedBox(width: AppSpacing.s2),
                _PMChip(
                  label: 'Indices',
                  active: type == 'Indices',
                  onTap: () => onType('Indices'),
                ),
                const SizedBox(width: AppSpacing.s2),
                _PMChip(
                  label: 'Forex',
                  active: type == 'Forex',
                  onTap: () => onType('Forex'),
                ),
                const SizedBox(width: AppSpacing.s2),
                _PMChip(
                  label: 'Commodities',
                  active: type == 'Commodities',
                  onTap: () => onType('Commodities'),
                ),
                const SizedBox(width: AppSpacing.s2),
                _PMChip(
                  label: 'Crypto',
                  active: type == 'Crypto',
                  onTap: () => onType('Crypto'),
                ),
              ],
            ),
          ),
          const SizedBox(height: AppSpacing.s2),
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                Text('Ver:',
                    style: AppTypography.xs.copyWith(color: c.textMuted)),
                const SizedBox(width: AppSpacing.s2),
                _PMChip(
                  label: 'v1 Original',
                  active: version == 'v1',
                  disabled: type == 'Indices' || type == 'Forex' || type == 'Crypto',
                  onTap: () => onVersion('v1'),
                ),
                const SizedBox(width: AppSpacing.s2),
                _PMChip(
                  label: 'v2 Pine-Aligned',
                  active: version == 'v2',
                  disabled: type == 'Indices' || type == 'Forex' || type == 'Crypto',
                  onTap: () => onVersion('v2'),
                ),
                const SizedBox(width: AppSpacing.s2),
                _PMChip(
                  label: 'v3 Super Pine',
                  active: version == 'v3',
                  disabled: type != 'Indices',
                  onTap: () => onVersion('v3'),
                ),
                const SizedBox(width: AppSpacing.s2),
                _PMChip(
                  label: 'v3 Pine Commodities',
                  active: version == 'v3c',
                  disabled: type != 'Commodities',
                  onTap: () => onVersion('v3c'),
                ),
                const SizedBox(width: AppSpacing.s2),
                _PMChip(
                  label: 'v3 Pine Forex',
                  active: version == 'v3f',
                  disabled: type != 'Forex',
                  onTap: () => onVersion('v3f'),
                ),
                const SizedBox(width: AppSpacing.s2),
                _PMChip(
                  label: 'v3 Pine Crypto',
                  active: version == 'v3crypto',
                  disabled: type != 'Crypto',
                  onTap: () => onVersion('v3crypto'),
                ),
              ],
            ),
          ),
          const SizedBox(height: AppSpacing.s2),
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                _PMChip(
                  label: '1+ Signal',
                  active: minSignals == 1,
                  onTap: () => onFilter(minSignals == 1 ? 0 : 1),
                ),
                const SizedBox(width: AppSpacing.s2),
                _PMChip(
                  label: '2+ Signals',
                  active: minSignals == 2,
                  onTap: () => onFilter(minSignals == 2 ? 0 : 2),
                ),
                const SizedBox(width: AppSpacing.s2),
                _PMChip(
                  label: '3 Signals',
                  active: minSignals == 3,
                  onTap: () => onFilter(minSignals == 3 ? 0 : 3),
                ),
                const SizedBox(width: AppSpacing.s2),
                _PMChip(
                  label: '4 Signals',
                  active: minSignals == 4,
                  onTap: () => onFilter(minSignals == 4 ? 0 : 4),
                ),
                if (version == 'v3') ...[
                  const SizedBox(width: AppSpacing.s2),
                  _PMChip(
                    label: '5 Signals',
                    active: minSignals == 5,
                    onTap: () => onFilter(minSignals == 5 ? 0 : 5),
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(height: AppSpacing.s2),
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: version == 'v3'
                  ? [
                      Text('Signals:',
                          style: AppTypography.xs.copyWith(color: c.textMuted)),
                      const SizedBox(width: AppSpacing.s2),
                      _PMChip(
                        label: 'THRUST',
                        active: signalFilter.contains('THRUST'),
                        onTap: () => onSignalToggle('THRUST'),
                      ),
                      const SizedBox(width: AppSpacing.s2),
                      _PMChip(
                        label: 'BASE',
                        active: signalFilter.contains('BASE'),
                        onTap: () => onSignalToggle('BASE'),
                      ),
                      const SizedBox(width: AppSpacing.s2),
                      _PMChip(
                        label: 'UPTREND',
                        active: signalFilter.contains('UPTREND'),
                        onTap: () => onSignalToggle('UPTREND'),
                      ),
                      const SizedBox(width: AppSpacing.s2),
                      _PMChip(
                        label: 'NEW HIGH',
                        active: signalFilter.contains('NEW_HIGH'),
                        onTap: () => onSignalToggle('NEW_HIGH'),
                      ),
                      const SizedBox(width: AppSpacing.s2),
                      _PMChip(
                        label: 'BREAKOUT',
                        active: signalFilter.contains('BREAKOUT'),
                        onTap: () => onSignalToggle('BREAKOUT'),
                      ),
                    ]
                  : version == 'v3c' || version == 'v3crypto'
                      ? [
                          Text('Signals:',
                              style: AppTypography.xs.copyWith(color: c.textMuted)),
                          const SizedBox(width: AppSpacing.s2),
                          _PMChip(
                            label: 'VOL',
                            active: signalFilter.contains('VOL'),
                            onTap: () => onSignalToggle('VOL'),
                          ),
                          const SizedBox(width: AppSpacing.s2),
                          _PMChip(
                            label: 'HEARTBEAT',
                            active: signalFilter.contains('HEARTBEAT'),
                            onTap: () => onSignalToggle('HEARTBEAT'),
                          ),
                          const SizedBox(width: AppSpacing.s2),
                          _PMChip(
                            label: 'CATALYST',
                            active: signalFilter.contains('CATALYST'),
                            onTap: () => onSignalToggle('CATALYST'),
                          ),
                        ]
                      : version == 'v3f'
                          ? [
                              Text('Signals:',
                                  style: AppTypography.xs.copyWith(color: c.textMuted)),
                              const SizedBox(width: AppSpacing.s2),
                              _PMChip(
                                label: 'VOL',
                                active: signalFilter.contains('VOL'),
                                onTap: () => onSignalToggle('VOL'),
                              ),
                              const SizedBox(width: AppSpacing.s2),
                              _PMChip(
                                label: 'RANGE',
                                active: signalFilter.contains('RANGE'),
                                onTap: () => onSignalToggle('RANGE'),
                              ),
                              const SizedBox(width: AppSpacing.s2),
                              _PMChip(
                                label: 'BREAKOUT',
                                active: signalFilter.contains('BREAKOUT'),
                                onTap: () => onSignalToggle('BREAKOUT'),
                              ),
                            ]
                          : [
                          Text('Signals:',
                              style: AppTypography.xs.copyWith(color: c.textMuted)),
                          const SizedBox(width: AppSpacing.s2),
                          _PMChip(
                            label: 'VOL',
                            active: signalFilter.contains('VOL'),
                            onTap: () => onSignalToggle('VOL'),
                          ),
                          const SizedBox(width: AppSpacing.s2),
                          _PMChip(
                            label: 'HEARTBEAT',
                            active: signalFilter.contains('HEARTBEAT'),
                            onTap: () => onSignalToggle('HEARTBEAT'),
                          ),
                          const SizedBox(width: AppSpacing.s2),
                          _PMChip(
                            label: 'REC. QTR',
                            active: signalFilter.contains('REC_QTR'),
                            onTap: () => onSignalToggle('REC_QTR'),
                          ),
                          const SizedBox(width: AppSpacing.s2),
                          _PMChip(
                            label: 'TREND ↑',
                            active: signalFilter.contains('TREND'),
                            disabled: version == 'v1',
                            onTap: () => onSignalToggle('TREND'),
                          ),
                        ],
            ),
          ),
          const SizedBox(height: AppSpacing.s2),
          Row(
            children: [
              Text('Sort:',
                  style: AppTypography.xs.copyWith(color: c.textMuted)),
              const SizedBox(width: AppSpacing.s2),
              _PMChip(
                label: 'Signal Count',
                active: sort == 'signals',
                onTap: () => onSort('signals'),
              ),
              const SizedBox(width: AppSpacing.s2),
              _PMChip(
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

// ── PM Filter Chip ────────────────────────────────────────────────────────────

class _PMChip extends StatelessWidget {
  const _PMChip({
    required this.label,
    required this.active,
    required this.onTap,
    this.disabled = false,
  });

  final String label;
  final bool active;
  final VoidCallback onTap;
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

// ── PM Card ───────────────────────────────────────────────────────────────────

class _PMCard extends StatelessWidget {
  const _PMCard({required this.item, required this.version});

  final TenXScanResult item;
  final String version;

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
            Row(
              children: [
                if (item.flag.isNotEmpty) ...[
                  Text(item.flag, style: const TextStyle(fontSize: 18)),
                  const SizedBox(width: AppSpacing.s2),
                ],
                Expanded(
                  child: Text(
                    item.name,
                    style: AppTypography.labelLg.copyWith(color: c.textPrimary),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                Text(
                  _fmtPrice(item.price),
                  style: AppTypography.numericLg.copyWith(color: c.textPrimary),
                ),
                const SizedBox(width: AppSpacing.s2),
                _PMPctChip(pct: item.changePercent, color: pctColor),
              ],
            ),
            const SizedBox(height: AppSpacing.s3),
            Wrap(
              spacing: AppSpacing.s2,
              runSpacing: AppSpacing.s2,
              children: version == 'v3'
                  ? [
                      _PMSignalPill(label: 'THRUST', active: item.thrust, activeColor: c.positive),
                      _PMSignalPill(label: 'BASE', active: item.base, activeColor: c.accent),
                      _PMSignalPill(label: 'UPTREND', active: item.uptrend, activeColor: c.accent),
                      _PMSignalPill(label: 'NEW HIGH', active: item.newHighReclaim, activeColor: c.positive),
                      _PMSignalPill(label: 'BREAKOUT', active: item.regimeBreakout, activeColor: c.warning),
                    ]
                  : version == 'v3c' || version == 'v3crypto'
                      ? [
                          _PMSignalPill(
                            label: item.volumeRatio > 0
                                ? 'VOL ${item.volumeRatio.toStringAsFixed(1)}x'
                                : 'VOL —',
                            active: item.volumeSpike && item.volumeGreen,
                            activeColor: item.volumeSpike && !item.volumeGreen
                                ? c.warning
                                : c.positive,
                          ),
                          _PMSignalPill(label: 'HEARTBEAT', active: item.heartbeat, activeColor: c.accent),
                          _PMSignalPill(label: 'CATALYST', active: item.regimeBreakout, activeColor: c.warning),
                        ]
                      : version == 'v3f'
                          ? [
                              _PMSignalPill(
                                label: item.volumeRatio > 0
                                    ? 'VOL ${item.volumeRatio.toStringAsFixed(1)}x'
                                    : 'VOL —',
                                active: item.volumeSpike && item.volumeGreen,
                                activeColor: item.volumeSpike && !item.volumeGreen
                                    ? c.warning
                                    : c.positive,
                              ),
                              _PMSignalPill(label: 'RANGE', active: item.heartbeat, activeColor: c.accent),
                              _PMSignalPill(label: 'BREAKOUT', active: item.regimeBreakout, activeColor: c.warning),
                            ]
                          : [
                              _PMSignalPill(
                                label: item.volumeRatio > 0
                                    ? 'VOL ${item.volumeRatio.toStringAsFixed(1)}x'
                                    : 'VOL —',
                                active: item.volumeSpike && item.volumeGreen,
                                activeColor: item.volumeSpike && !item.volumeGreen
                                    ? c.warning
                                    : c.positive,
                              ),
                              _PMSignalPill(label: 'HEARTBEAT', active: item.heartbeat, activeColor: c.accent),
                              _PMSignalPill(
                                label: 'REC. QTR',
                                active: item.recordQuarter,
                                activeColor: c.positive,
                                locked: !item.epsApplicable,
                              ),
                              if (version == 'v2' || item.trendUp || item.signalsActive >= 4)
                                _PMSignalPill(label: 'TREND ↑', active: item.trendUp, activeColor: c.accent),
                            ],
            ),
            const SizedBox(height: AppSpacing.s3),
            _PMSignalDots(
              count: item.signalsActive,
              total: version == 'v3' ? 5 : (version == 'v2' ? 4 : 3),
            ),
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

// ── PM Signal Pill ────────────────────────────────────────────────────────────

class _PMSignalPill extends StatelessWidget {
  const _PMSignalPill({
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

// ── PM Signal Dots ────────────────────────────────────────────────────────────

class _PMSignalDots extends StatelessWidget {
  const _PMSignalDots({required this.count, this.total = 3});

  final int count;
  final int total;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Row(
      children: [
        Text(
          '$count of $total signals',
          style: AppTypography.xs.copyWith(color: c.textMuted),
        ),
        const SizedBox(width: AppSpacing.s2),
        ...List.generate(
          total,
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

// ── PM Pct Chip ───────────────────────────────────────────────────────────────

class _PMPctChip extends StatelessWidget {
  const _PMPctChip({required this.pct, required this.color});

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

// ── PM Skeleton ───────────────────────────────────────────────────────────────

class _PMSkeleton extends StatelessWidget {
  const _PMSkeleton();

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

// ── PM Info Sheet ─────────────────────────────────────────────────────────────

void _showPMInfo(BuildContext context, {String version = 'v1'}) {
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
        padding: EdgeInsets.fromLTRB(AppSpacing.s5, AppSpacing.s5,
            AppSpacing.s5, AppSpacing.s8 + MediaQuery.of(ctx).padding.bottom),
        children: version == 'v3'
            ? _pmV3InfoChildren(c, ctx)
            : version == 'v3c'
                ? _pmV3cInfoChildren(c, ctx)
                : version == 'v3f'
                    ? _pmV3fInfoChildren(c, ctx)
                    : version == 'v3crypto'
                        ? _pmV3cryptoInfoChildren(c, ctx)
                        : _pmV1v2InfoChildren(c, ctx),
      ),
    ),
  );
}

List<Widget> _pmV3InfoChildren(AppPalette c, BuildContext ctx) => [
      Center(
        child: Container(
          width: 36, height: 4,
          decoration: BoxDecoration(
              color: c.border, borderRadius: BorderRadius.circular(2)),
        ),
      ),
      const SizedBox(height: AppSpacing.s5),
      Row(
        children: [
          Icon(Icons.auto_awesome_rounded, size: 20, color: c.warning),
          const SizedBox(width: AppSpacing.s3),
          Expanded(
            child: Text('Super Pine — Index Regime Breakout',
                style: AppTypography.headingMd.copyWith(color: c.textPrimary)),
          ),
        ],
      ),
      const SizedBox(height: AppSpacing.s3),
      Text(
        'v3 ports the "10X Power Moves — Indexes" Pine script (Felix Prehn / Goat Academy adaptation). It targets broad indices, not single stocks: outputs are regime / trend signals for core exposure, not multibagger hunts.',
        style: AppTypography.sm.copyWith(color: c.textSecondary, height: 1.55),
      ),
      const SizedBox(height: AppSpacing.s5),
      Text('The Five Signals',
          style: AppTypography.headingSm.copyWith(color: c.textPrimary)),
      const SizedBox(height: AppSpacing.s4),
      _PMSignalRow(
        icon: Icons.bolt_rounded,
        color: c.positive,
        label: 'THRUST',
        title: 'Buying Thrust / Volume',
        rule: "Volume ≥ 2× 20-bar avg on a green day — OR, when no volume is available (cash indices like SPX), a price thrust: today's range ≥ 1.5× avg AND close in the top 30% of the range.",
        explanation: 'Index volume spikes are smaller than single stocks, so this is tuned to 2× (not 3×) with a thrust fallback for vol-less indices.',
        examples: '^GSPC, ^NDX, ^N225',
        c: c,
      ),
      const SizedBox(height: AppSpacing.s5),
      _PMSignalRow(
        icon: Icons.linear_scale_rounded,
        color: c.accent,
        label: 'BASE',
        title: 'Base / Heartbeat',
        rule: '120-bar high-to-low range ≤ 20%. The index is consolidating sideways, not trending.',
        explanation: 'Indexes mean-revert, so a tight base after a correction often precedes a regime change.',
        examples: 'Common after corrections / range-bound macro regimes.',
        c: c,
      ),
      const SizedBox(height: AppSpacing.s5),
      _PMSignalRow(
        icon: Icons.trending_up_rounded,
        color: c.accent,
        label: 'UPTREND',
        title: 'Trend Filter (MA200)',
        rule: 'Close > 200-day simple moving average.',
        explanation: 'Avoids fading into a bear market. Reclaims only count when price is above the long-term trend.',
        examples: 'Used as a filter — required for a valid BREAKOUT.',
        c: c,
      ),
      const SizedBox(height: AppSpacing.s5),
      _PMSignalRow(
        icon: Icons.emoji_events_rounded,
        color: c.positive,
        label: 'NEW HIGH',
        title: 'New-High Reclaim',
        rule: "Close > prior 252-day high (~1 year, excluding today), AND uptrend is active.",
        explanation: "An index has no EPS, so the workbook's \"record quarter\" is replaced with the closest honest analog: price reclaiming a prior high in an uptrend.",
        examples: 'S&P reclaiming 2022 ATH in late 2023.',
        c: c,
      ),
      const SizedBox(height: AppSpacing.s5),
      _PMSignalRow(
        icon: Icons.rocket_launch_rounded,
        color: c.warning,
        label: 'BREAKOUT',
        title: 'Regime Breakout (composite)',
        rule: 'BASE active within the last 15 bars + NEW HIGH + (THRUST or volume spike) + UPTREND, all at once.',
        explanation: 'The full Pine "fullSignal" — the index has been coiling, just reclaimed a 1-year high in an uptrend on a thrust day. Treat as a regime / core-exposure signal, not a swing trade.',
        examples: 'Rare. Usually fires a few times a year per index.',
        c: c,
      ),
      const SizedBox(height: AppSpacing.s5),
      Container(
        padding: const EdgeInsets.all(AppSpacing.s4),
        decoration: BoxDecoration(
          color: c.warning.withAlpha(15),
          borderRadius: BorderRadius.circular(AppRadius.sm),
          border: Border.all(color: c.warning.withAlpha(50)),
        ),
        child: Text(
          'Indexes are diversified baskets — treat outputs as regime / trend signals for core exposure, NOT as multibagger hunts. Not financial advice.',
          style: AppTypography.xs.copyWith(color: c.textSecondary, height: 1.55),
        ),
      ),
    ];

List<Widget> _pmV3cInfoChildren(AppPalette c, BuildContext ctx) => [
      Center(
        child: Container(
          width: 36, height: 4,
          decoration: BoxDecoration(
              color: c.border, borderRadius: BorderRadius.circular(2)),
        ),
      ),
      const SizedBox(height: AppSpacing.s5),
      Row(
        children: [
          Icon(Icons.local_fire_department_rounded, size: 20, color: c.warning),
          const SizedBox(width: AppSpacing.s3),
          Expanded(
            child: Text('Pine Power Moves — Commodities',
                style: AppTypography.headingMd.copyWith(color: c.textPrimary)),
          ),
        ],
      ),
      const SizedBox(height: AppSpacing.s3),
      Text(
        'v3 Pine Commodities ports the Felix Prehn / Goat Academy "10X Power Moves — Commodities" Pine Script. It targets commodity futures (gold, oil, wheat…) using three signals tuned for multi-year accumulation cycles.',
        style: AppTypography.sm.copyWith(color: c.textSecondary, height: 1.55),
      ),
      const SizedBox(height: AppSpacing.s5),
      Text('The Three Signals',
          style: AppTypography.headingSm.copyWith(color: c.textPrimary)),
      const SizedBox(height: AppSpacing.s4),
      _PMSignalRow(
        icon: Icons.bar_chart_rounded,
        color: c.positive,
        label: 'VOL',
        title: 'Institutional Buying Spike',
        rule: 'Volume ≥ 3× the 20-bar average on a green (up) day.',
        explanation: 'Commodities need a higher threshold than equities (3× vs 2×) to distinguish genuine institutional accumulation from normal noise.',
        examples: 'GC=F, CL=F, ZW=F — green spike after a quiet consolidation.',
        c: c,
      ),
      const SizedBox(height: AppSpacing.s5),
      _PMSignalRow(
        icon: Icons.favorite_rounded,
        color: c.accent,
        label: 'HEARTBEAT',
        title: 'Heartbeat Consolidation',
        rule: 'High-to-low range over ~400 bars (≈ 1.5–2 years) is ≤ 35% of the low, AND recent lows are not collapsing vs. the older floor.',
        explanation: 'Commodities exhibit multi-year sideways accumulation before major moves. A tight, stable base with a living floor (not dying) is the defining setup.',
        examples: 'Gold 2018–2019, WTI 2017–2018 sideways periods.',
        c: c,
      ),
      const SizedBox(height: AppSpacing.s5),
      _PMSignalRow(
        icon: Icons.rocket_launch_rounded,
        color: c.warning,
        label: 'CATALYST',
        title: 'Breakout Catalyst',
        rule: 'Close > prior 100-bar high AND a green volume spike fires on the same day.',
        explanation: 'Replaces the stock "Record Quarter" — the closest honest analog for commodities is a confirmed regime change: price breaking above the consolidation high on institutional buying volume.',
        examples: 'Gold breaking above a multi-year range top with a volume thrust.',
        c: c,
      ),
      const SizedBox(height: AppSpacing.s5),
      Container(
        padding: const EdgeInsets.all(AppSpacing.s4),
        decoration: BoxDecoration(
          color: c.warning.withAlpha(15),
          borderRadius: BorderRadius.circular(AppRadius.sm),
          border: Border.all(color: c.warning.withAlpha(50)),
        ),
        child: Text(
          'Commodity signals are regime-level (multi-month cycles). A CATALYST alone without HEARTBEAT is an ordinary breakout — the full setup (all 3) is rare and historically high-quality. Not financial advice.',
          style: AppTypography.xs.copyWith(color: c.textSecondary, height: 1.55),
        ),
      ),
    ];

List<Widget> _pmV3fInfoChildren(AppPalette c, BuildContext ctx) => [
      Center(
        child: Container(
          width: 36, height: 4,
          decoration: BoxDecoration(
              color: c.border, borderRadius: BorderRadius.circular(2)),
        ),
      ),
      const SizedBox(height: AppSpacing.s5),
      Row(
        children: [
          Icon(Icons.currency_exchange_rounded, size: 20, color: c.accent),
          const SizedBox(width: AppSpacing.s3),
          Expanded(
            child: Text('Pine Power Moves — Forex',
                style: AppTypography.headingMd.copyWith(color: c.textPrimary)),
          ),
        ],
      ),
      const SizedBox(height: AppSpacing.s3),
      Text(
        'v3 Pine Forex ports the "10X Power Moves — Forex Range Breakout" Pine Script. It identifies FX pairs in a tight range consolidation that then break out with tick-volume confirmation. Honest caveat: Forex "volume" is tick count, not real flow — treat it as a confirmation proxy, not institutional proof.',
        style: AppTypography.sm.copyWith(color: c.textSecondary, height: 1.55),
      ),
      const SizedBox(height: AppSpacing.s5),
      Text('The Three Signals',
          style: AppTypography.headingSm.copyWith(color: c.textPrimary)),
      const SizedBox(height: AppSpacing.s4),
      _PMSignalRow(
        icon: Icons.bar_chart_rounded,
        color: c.positive,
        label: 'VOL',
        title: 'Tick-Volume Spike',
        rule: 'Tick volume ≥ 2× the 20-bar average on a green (up) candle.',
        explanation: 'Forex is OTC/decentralised — TradingView "volume" is tick count, a weak proxy for real flow. A 2× threshold catches meaningful activity spikes while ignoring micro noise.',
        examples: 'EUR/USD, GBP/USD, USD/JPY daily bars.',
        c: c,
      ),
      const SizedBox(height: AppSpacing.s5),
      _PMSignalRow(
        icon: Icons.linear_scale_rounded,
        color: c.accent,
        label: 'RANGE',
        title: 'Range Consolidation',
        rule: 'High-to-low range over 100 bars is ≤ 8% of the low price.',
        explanation: 'FX majors trade in tight ranges (single-digit % per year). A ≤ 8% band over 100 days signals genuine coiling — much stricter than equities or commodities.',
        examples: 'EUR/USD holding a 200-pip band for 3+ months.',
        c: c,
      ),
      const SizedBox(height: AppSpacing.s5),
      _PMSignalRow(
        icon: Icons.rocket_launch_rounded,
        color: c.warning,
        label: 'BREAKOUT',
        title: 'Long Range Breakout',
        rule: 'Range active recently (within 15 bars) + close > prior 100-bar high + close > 100-bar SMA + green tick-volume spike.',
        explanation: 'All conditions must fire simultaneously: direction (above trend MA), magnitude (new range high), and confirmation (tick-volume surge). Short breakouts are not scored here.',
        examples: 'EUR/USD breaking above a 3-month compression zone on heavy tick volume.',
        c: c,
      ),
      const SizedBox(height: AppSpacing.s5),
      Container(
        padding: const EdgeInsets.all(AppSpacing.s4),
        decoration: BoxDecoration(
          color: c.warning.withAlpha(15),
          borderRadius: BorderRadius.circular(AppRadius.sm),
          border: Border.all(color: c.warning.withAlpha(50)),
        ),
        child: Text(
          'Forex is a range-breakout tool, not a 10X multibagger hunter — FX majors move single-digit %, not 10×. Tick-volume is a proxy only. Session filter (London/NY overlap) is not applied on daily bars. Not financial advice.',
          style: AppTypography.xs.copyWith(color: c.textSecondary, height: 1.55),
        ),
      ),
    ];

List<Widget> _pmV3cryptoInfoChildren(AppPalette c, BuildContext ctx) => [
      Center(
        child: Container(
          width: 36, height: 4,
          decoration: BoxDecoration(
              color: c.border, borderRadius: BorderRadius.circular(2)),
        ),
      ),
      const SizedBox(height: AppSpacing.s5),
      Row(
        children: [
          Icon(Icons.currency_bitcoin_rounded, size: 20, color: c.warning),
          const SizedBox(width: AppSpacing.s3),
          Expanded(
            child: Text('Pine Power Moves — Crypto',
                style: AppTypography.headingMd.copyWith(color: c.textPrimary)),
          ),
        ],
      ),
      const SizedBox(height: AppSpacing.s3),
      Text(
        'v3 Pine Crypto ports the "10X Power Moves — Crypto" Pine Script. Crypto fits the 10X workbook best of all asset classes — genuine multi-month dead ranges followed by violent breakouts. Big caveat: crypto 10X candidates also go to zero far more often than stocks. Position-size accordingly.',
        style: AppTypography.sm.copyWith(color: c.textSecondary, height: 1.55),
      ),
      const SizedBox(height: AppSpacing.s5),
      Text('The Three Signals',
          style: AppTypography.headingSm.copyWith(color: c.textPrimary)),
      const SizedBox(height: AppSpacing.s4),
      _PMSignalRow(
        icon: Icons.bar_chart_rounded,
        color: c.positive,
        label: 'VOL',
        title: 'Volume Spike',
        rule: 'Volume ≥ 3× the 20-bar average on a green (up) candle.',
        explanation: 'Crypto volume on major exchange pairs is the most reliable of all four asset classes. 3× threshold filters wash-trading noise and flags genuine institutional accumulation.',
        examples: 'BTC-USD, ETH-USD on Coinbase or Binance daily bars.',
        c: c,
      ),
      const SizedBox(height: AppSpacing.s5),
      _PMSignalRow(
        icon: Icons.favorite_rounded,
        color: c.accent,
        label: 'HEARTBEAT',
        title: 'Accumulation Base',
        rule: "Price range over 180 bars (≈ 6 months) is ≤ 40% of the low AND recent lows are not collapsing (≥ 97% of the base low).",
        explanation: "Crypto cycles are faster than equities — 6-month bases are common before major moves. The 40% threshold is wider than stocks to accommodate crypto's inherent volatility. Collapsing lows signal distribution, not accumulation.",
        examples: "BTC's long consolidation periods in 2019–2020 and 2022–2023.",
        c: c,
      ),
      const SizedBox(height: AppSpacing.s5),
      _PMSignalRow(
        icon: Icons.rocket_launch_rounded,
        color: c.warning,
        label: 'CATALYST',
        title: 'Base Breakout',
        rule: 'Base active recently (within 10 bars) + close > prior 90-bar high + green volume spike on the same day.',
        explanation: 'Replaces the stock "Record Quarter" — the honest analog for crypto is a confirmed regime change: breaking the base high on heavy buying volume. All three must fire together for the full setup.',
        examples: 'BTC/ETH breaking a 6-month range high with a 3× volume thrust.',
        c: c,
      ),
      const SizedBox(height: AppSpacing.s5),
      Container(
        padding: const EdgeInsets.all(AppSpacing.s4),
        decoration: BoxDecoration(
          color: c.danger.withAlpha(15),
          borderRadius: BorderRadius.circular(AppRadius.sm),
          border: Border.all(color: c.danger.withAlpha(50)),
        ),
        child: Text(
          'Survivorship bias is extreme in crypto — 10X candidates also go to zero. Volume data on aggregated/index tickers may include wash trades; prefer major exchange pairs. Position-size as if it can rug. Not financial advice.',
          style: AppTypography.xs.copyWith(color: c.textSecondary, height: 1.55),
        ),
      ),
    ];

List<Widget> _pmV1v2InfoChildren(AppPalette c, BuildContext ctx) => [
      Center(
        child: Container(
          width: 36, height: 4,
          decoration: BoxDecoration(
              color: c.border, borderRadius: BorderRadius.circular(2)),
        ),
      ),
      const SizedBox(height: AppSpacing.s5),
      Row(
        children: [
          Icon(Icons.bolt_rounded, size: 20, color: c.warning),
          const SizedBox(width: AppSpacing.s3),
          Expanded(
            child: Text('How Power Moves Works',
                style: AppTypography.headingMd.copyWith(color: c.textPrimary)),
          ),
        ],
      ),
      const SizedBox(height: AppSpacing.s3),
      Text(
        'Power Moves identifies assets in a quiet accumulation phase — low volatility, tightening range, building volume — that historically precede explosive breakout moves.',
        style: AppTypography.sm.copyWith(color: c.textSecondary, height: 1.55),
      ),
      const SizedBox(height: AppSpacing.s5),
      Text('The Four Signals',
          style: AppTypography.headingSm.copyWith(color: c.textPrimary)),
      const SizedBox(height: AppSpacing.s4),
      _PMSignalRow(
        icon: Icons.bar_chart_rounded,
        color: c.positive,
        label: 'VOL',
        title: 'Volume Spike',
        rule: 'Current volume ≥ 2× the 20-bar average, AND the candle closes green',
        explanation: 'A surge in buying volume on an up-candle signals aggressive accumulation. Smart money is stepping in.',
        examples: 'GC=F, BTC-USD, SPY — often triggers before earnings or macro catalysts.',
        c: c,
      ),
      const SizedBox(height: AppSpacing.s5),
      _PMSignalRow(
        icon: Icons.favorite_rounded,
        color: c.accent,
        label: 'HEARTBEAT',
        title: 'Heartbeat (Near Breakout)',
        rule: 'Price is within 5% of the 52-week high, AND 20-day range is < 8% of price',
        explanation: 'The asset is coiling just below a major resistance level with decreasing volatility — the classic pre-breakout setup.',
        examples: 'Gold near ATH, AAPL in tight consolidation.',
        c: c,
      ),
      const SizedBox(height: AppSpacing.s5),
      _PMSignalRow(
        icon: Icons.emoji_events_rounded,
        color: c.positive,
        label: 'REC. QTR',
        title: 'Record Quarter',
        rule: 'Latest quarterly EPS or revenue is an all-time high for the company',
        explanation: 'Fundamental momentum: the business is performing at peak. Combines well with technical signals.',
        examples: 'Stock scanner only. N/A for indices, commodities, and forex.',
        note: 'N/A shown as a lock icon — EPS data not available for this asset class.',
        c: c,
      ),
      const SizedBox(height: AppSpacing.s5),
      _PMSignalRow(
        icon: Icons.trending_up_rounded,
        color: c.accent,
        label: 'TREND ↑',
        title: 'Trend Confirmation (v2 only)',
        rule: 'Price closed above the 50-bar high, confirming a breakout from the accumulation range',
        explanation: 'v2 adds this 4th signal as a breakout confirmation gate — the asset has already started moving.',
        examples: 'v2 scanner only. Not available in v1.',
        c: c,
      ),
      const SizedBox(height: AppSpacing.s5),
      Container(
        padding: const EdgeInsets.all(AppSpacing.s4),
        decoration: BoxDecoration(
          color: c.warning.withAlpha(15),
          borderRadius: BorderRadius.circular(AppRadius.sm),
          border: Border.all(color: c.warning.withAlpha(50)),
        ),
        child: Text(
          'Power Moves is a discovery tool, not a buy signal. Always confirm with your own analysis, check macro context, and apply proper risk management before entering any position.',
          style: AppTypography.xs.copyWith(color: c.textSecondary, height: 1.6),
        ),
      ),
    ];

// ── PM Signal Row ─────────────────────────────────────────────────────────────

class _PMSignalRow extends StatelessWidget {
  const _PMSignalRow({
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
        Container(
          width: 36, height: 36,
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
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                    decoration: BoxDecoration(
                      color: color.withAlpha(25),
                      borderRadius: BorderRadius.circular(AppRadius.full),
                      border: Border.all(color: color.withAlpha(80)),
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
                  style: AppTypography.labelMd.copyWith(color: c.textPrimary)),
              const SizedBox(height: 6),
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
                  style: AppTypography.xs.copyWith(color: c.textSecondary, height: 1.6)),
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
                    Icon(Icons.info_outline_rounded, size: 12, color: c.accent),
                    const SizedBox(width: 4),
                    Expanded(
                      child: Text(note!,
                          style: AppTypography.xs
                              .copyWith(color: c.accent, height: 1.5)),
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

