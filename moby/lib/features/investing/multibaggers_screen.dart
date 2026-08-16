import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme/app_palette.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/theme/app_typography.dart';
import '../../data/models/trading_signal.dart';
import '../../data/repositories/trading_repository.dart';
import '../../shared/widgets/chip_row.dart';
import '../../shared/widgets/empty_view.dart';
import '../../shared/widgets/error_view.dart';
import '../../shared/widgets/glass_card.dart';
import '../../shared/widgets/max_width_layout.dart';
import '../../shared/widgets/shimmer_list.dart';
import '../../shared/widgets/theme_toggle.dart';

// Maps the (country, version) pair to the repository cache key used in
// clearScannerCache() — must stay in sync with TradingRepository._cachedFetch keys.
String _cacheKeyFor(String country, String version) => '$country-$version';

// ── Provider ──────────────────────────────────────────────────────────────────

final _multibaggersProvider = FutureProvider.autoDispose
    .family<List<TenXScanResult>, ({String country, String version})>(
  (_, args) {
    final v2 = args.version == 'v2';
    switch (args.country) {
      case 'us':
        return v2
            ? TradingRepository.instance.fetchTenXV2Stocks()
            : TradingRepository.instance.fetchTenXStocks();
      case 'uk':
        return v2
            ? TradingRepository.instance.fetchTenXV2UKStocks()
            : TradingRepository.instance.fetchTenXUKStocks();
      case 'japan':
        return v2
            ? TradingRepository.instance.fetchTenXV2JapanStocks()
            : TradingRepository.instance.fetchTenXJapanStocks();
      case 'hongkong':
        return v2
            ? TradingRepository.instance.fetchTenXV2HKStocks()
            : TradingRepository.instance.fetchTenXHKStocks();
      case 'china':
        return v2
            ? TradingRepository.instance.fetchTenXV2ChinaStocks()
            : TradingRepository.instance.fetchTenXChinaStocks();
      case 'euronext':
        return v2
            ? TradingRepository.instance.fetchTenXV2EuronextStocks()
            : TradingRepository.instance.fetchTenXEuronextStocks();
      case 'canada':
        return v2
            ? TradingRepository.instance.fetchTenXV2CanadaStocks()
            : TradingRepository.instance.fetchTenXCanadaStocks();
      case 'australia':
        return v2
            ? TradingRepository.instance.fetchTenXV2AustraliaStocks()
            : TradingRepository.instance.fetchTenXAustraliaStocks();
      case 'brazil':
        return v2
            ? TradingRepository.instance.fetchTenXV2BrazilStocks()
            : TradingRepository.instance.fetchTenXBrazilStocks();
      case 'singapore':
        return v2
            ? TradingRepository.instance.fetchTenXV2SingaporeStocks()
            : TradingRepository.instance.fetchTenXSingaporeStocks();
      default:
        return v2
            ? TradingRepository.instance.fetchTenXV2IndiaStocks()
            : TradingRepository.instance.fetchTenXIndiaStocks();
    }
  },
);

final _mbStockSearchProvider = FutureProvider.autoDispose
    .family<List<StockSearchResult>, String>(
  (_, query) => TradingRepository.instance.searchStocks(query),
);

final _mbSingleScanProvider = FutureProvider.autoDispose
    .family<TenXSingleScanResult, ({String symbol, String name})>(
  (_, args) => TradingRepository.instance.fetchTenXSingleScan(
    symbol: args.symbol,
    name: args.name,
  ),
);

// Foreign suffix/exchange pairs, one entry per non-US market this screen
// supports. Used both to match a country's own stocks and — inverted — to
// deny-list every *other* market's stocks from the 'us' bucket, so a cross
// -listing (e.g. Apple's Frankfurt '.DE' or Toyota's ADR) can't leak into
// the wrong country just because its suffix wasn't explicitly recognized.
const _foreignSuffixes = [
  '.NS', '.BO', // india
  '.L', // uk
  '.T', '.OS', // japan
  '.HK', // hongkong
  '.SS', '.SZ', // china
  '.PA', '.AS', '.BR', '.MI', '.OL', '.LS', '.DE', '.F', // euronext (+ DE)
  '.TO', // canada
  '.AX', // australia
  '.SA', // brazil
  '.SI', // singapore
];
const _foreignExchanges = {
  'NSI', 'BSE', // india
  'LSE', 'IOB', // uk
  'JPX', 'TSE', 'OSA', // japan
  'HKG', // hongkong
  'SHH', 'SHZ', // china
  'EPA', 'AMS', 'BRU', 'MIL', 'OSL', 'GER', 'FRA', // euronext (+ DE)
  'TOR', // canada — confirmed live via /api/search (Shopify → SHOP.TO / TOR)
  'ASX', // australia — confirmed live (BHP.AX / ASX)
  'SAO', // brazil — confirmed live (PETR4.SA / SAO)
  'SES', // singapore — confirmed live (D05.SI / SES)
};

bool _isStockForCountry(StockSearchResult r, String country) {
  final sym = r.symbol.toUpperCase();
  final exc = r.exchange.toUpperCase();
  switch (country) {
    case 'india':
      return sym.endsWith('.NS') || sym.endsWith('.BO') ||
          exc == 'NSI' || exc == 'BSE';
    case 'uk':
      return sym.endsWith('.L') || exc == 'LSE' || exc == 'IOB';
    case 'japan':
      return sym.endsWith('.T') || sym.endsWith('.OS') ||
          exc == 'JPX' || exc == 'TSE' || exc == 'OSA';
    case 'hongkong':
      return sym.endsWith('.HK') || exc == 'HKG';
    case 'china':
      return sym.endsWith('.SS') || sym.endsWith('.SZ') ||
          exc == 'SHH' || exc == 'SHZ';
    case 'euronext':
      // Info sheet advertises "FR + NL + DE + IT + NO combined" — include
      // Germany's suffix/exchange codes too, not just the Euronext members.
      return sym.endsWith('.PA') || sym.endsWith('.AS') ||
          sym.endsWith('.BR') || sym.endsWith('.MI') ||
          sym.endsWith('.OL') || sym.endsWith('.LS') ||
          sym.endsWith('.DE') || sym.endsWith('.F') ||
          exc == 'EPA' || exc == 'AMS' || exc == 'BRU' ||
          exc == 'MIL' || exc == 'OSL' || exc == 'GER' || exc == 'FRA';
    case 'canada':
      return sym.endsWith('.TO') || exc == 'TOR';
    case 'australia':
      return sym.endsWith('.AX') || exc == 'ASX';
    case 'brazil':
      return sym.endsWith('.SA') || exc == 'SAO';
    case 'singapore':
      return sym.endsWith('.SI') || exc == 'SES';
    case 'us':
    default:
      // Class suffixes like .A/.B are fine — only reject symbols/exchanges
      // that are known listings of one of the *other* markets above.
      return !_foreignSuffixes.any(sym.endsWith) &&
          !_foreignExchanges.contains(exc);
  }
}

String _countryLabel(String country) => const {
  'us': 'US',
  'india': 'India',
  'uk': 'UK',
  'japan': 'Japan',
  'hongkong': 'Hong Kong',
  'china': 'China',
  'euronext': 'Euronext',
  'canada': 'Canada',
  'australia': 'Australia',
  'brazil': 'Brazil',
  'singapore': 'Singapore',
}[country] ?? 'Unknown';

// ── Standalone screen (route: /trading/multibaggers) ─────────────────────────

class MultibaggersScreen extends StatelessWidget {
  const MultibaggersScreen({super.key, required this.country});

  final String country;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Scaffold(
      // See feedback_keyboard_squish memory: the stock-search field here
      // needs this, same as TradingScreen/MacroScreen/Markets.
      resizeToAvoidBottomInset: false,
      backgroundColor: c.background,
      appBar: AppBar(
        backgroundColor: c.surface,
        surfaceTintColor: Colors.transparent,
        title: Text('Multibaggers',
            style: AppTypography.headingSm.copyWith(color: c.textPrimary)),
        actions: const [ThemeToggleButton()],
      ),
      body: MultibaggersBody(initialCountry: country),
    );
  }
}

// ── Body — used both as a tab and inside the standalone screen ────────────────

class MultibaggersBody extends ConsumerStatefulWidget {
  const MultibaggersBody({super.key, this.initialCountry = 'us'});

  final String initialCountry;

  @override
  ConsumerState<MultibaggersBody> createState() => _MultibaggersBodyState();
}

class _MultibaggersBodyState extends ConsumerState<MultibaggersBody> {
  late String _country;
  String _version = 'v1';
  int _minSignals = 0;
  String _sort = 'signals';
  Set<String> _signalFilter = {};

  // Stock search state
  final _stockSearchCtrl = TextEditingController();
  StockSearchResult? _selectedStock;
  String _debouncedQuery = '';
  Timer? _searchDebounce;

  static const _validCountries = {'us', 'india', 'uk', 'japan', 'hongkong', 'china', 'euronext'};

  @override
  void initState() {
    super.initState();
    _country = _validCountries.contains(widget.initialCountry)
        ? widget.initialCountry
        : 'us';
    _stockSearchCtrl.addListener(_onSearchChanged);
    // Pre-warm the two most common markets in the background.
    // The dedup logic in TradingRepository means this is a no-op if the
    // same request is already in-flight from the active provider.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      TradingRepository.instance.fetchTenXStocks().ignore();
      TradingRepository.instance.fetchTenXIndiaStocks().ignore();
    });
  }

  @override
  void dispose() {
    _searchDebounce?.cancel();
    _stockSearchCtrl.removeListener(_onSearchChanged);
    _stockSearchCtrl.dispose();
    super.dispose();
  }

  void _onSearchChanged() {
    _searchDebounce?.cancel();
    _searchDebounce = Timer(const Duration(milliseconds: 400), () {
      if (mounted) setState(() => _debouncedQuery = _stockSearchCtrl.text.trim());
    });
  }

  ({String country, String version}) get _args =>
      (country: _country, version: _version);

  void _reset() {
    _minSignals = 0;
    _signalFilter = {};
    _selectedStock = null;
    _stockSearchCtrl.clear();
    _debouncedQuery = '';
    _searchDebounce?.cancel();
  }

  @override
  Widget build(BuildContext context) {
    // Always watch to keep autoDispose tracking correct.
    final async = ref.watch(_multibaggersProvider(_args));
    final c = context.colors;

    final controlRow = _ControlRow(
      country: _country,
      version: _version,
      onCountry: (v) => setState(() {
        _country = v;
        _reset();
      }),
      onVersion: (v) => setState(() {
        _version = v;
        _reset();
      }),
      onBacktest: () {
        // Mirror the data source used by _multibaggersProvider:
        // 'us' fetches /scanner/10x/stocks, so its backtest type is 'stocks'.
        // All other countries (india/uk/japan/hongkong/china/euronext) match
        // the server backtest route's type name directly.
        final btType = _country == 'us' ? 'stocks' : _country;
        context.push(
            '/trading/10x-backtest?version=$_version&type=$btType&source=investing');
      },
      onInfo: () => _showMultibaggersInfo(context),
    );

    final filterRow = _FilterRow(
      minSignals: _minSignals,
      sort: _sort,
      version: _version,
      signalFilter: _signalFilter,
      onFilter: (v) => setState(() => _minSignals = v),
      onSort: (v) => setState(() => _sort = v),
      onSignalToggle: (sig) => setState(() {
        final next = Set<String>.from(_signalFilter);
        next.contains(sig) ? next.remove(sig) : next.add(sig);
        _signalFilter = next;
      }),
    );

    final searchBar = _MBSearchBar(
      controller: _stockSearchCtrl,
      selectedStock: _selectedStock,
      c: c,
      onClearSelection: () => setState(() {
        _selectedStock = null;
        _debouncedQuery = '';
      }),
    );

    // ── Single-stock scan mode ──────────────────────────────────────────────
    if (_selectedStock != null) {
      final scanArgs =
          (symbol: _selectedStock!.symbol, name: _selectedStock!.name);
      final scanAsync = ref.watch(_mbSingleScanProvider(scanArgs));
      return MaxWidthLayout(
        child: Column(
          children: [
            controlRow,
            filterRow,
            searchBar,
            Expanded(
              child: scanAsync.when(
                loading: () =>
                    Center(child: CircularProgressIndicator(color: c.accent)),
                error: (_, __) => ErrorView(
                  message: 'Could not scan ${_selectedStock!.symbol}',
                  onRetry: () =>
                      ref.invalidate(_mbSingleScanProvider(scanArgs)),
                ),
                data: (result) {
                  final item = _version == 'v2' ? result.v2 : result.v1;
                  return ListView(
                    padding: EdgeInsets.only(
                      top: AppSpacing.s3,
                      bottom: AppSpacing.s3 +
                          MediaQuery.of(context).padding.bottom +
                          MediaQuery.of(context).viewInsets.bottom,
                    ),
                    children: [_StockCard(item: item, version: _version)],
                  );
                },
              ),
            ),
          ],
        ),
      );
    }

    // ── Search suggestions mode ─────────────────────────────────────────────
    if (_debouncedQuery.isNotEmpty) {
      final suggestAsync =
          ref.watch(_mbStockSearchProvider(_debouncedQuery));
      return MaxWidthLayout(
        child: Column(
          children: [
            controlRow,
            filterRow,
            searchBar,
            Expanded(
              child: suggestAsync.when(
                loading: () => Center(
                  child: SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(
                        strokeWidth: 1.5, color: c.accent),
                  ),
                ),
                error: (_, __) => Center(
                  child: Text('Search failed',
                      style: AppTypography.xs.copyWith(color: c.textMuted)),
                ),
                data: (results) {
                  final filtered = results
                      .where((r) => _isStockForCountry(r, _country))
                      .toList();
                  if (filtered.isEmpty) {
                    return EmptyView(
                      icon: Icons.search_off_rounded,
                      title: 'No results',
                      body: 'No ${_countryLabel(_country)} stocks matched "$_debouncedQuery". Try a shorter or different name.',
                      iconColor: context.colors.textMuted,
                    );
                  }
                  return ListView.builder(
                    padding: EdgeInsets.only(
                      top: AppSpacing.s2,
                      bottom: MediaQuery.of(context).padding.bottom +
                          MediaQuery.of(context).viewInsets.bottom +
                          AppSpacing.s3,
                    ),
                    itemCount: filtered.length,
                    itemBuilder: (_, i) {
                      final r = filtered[i];
                      return InkWell(
                        onTap: () => setState(() {
                          _selectedStock = r;
                          _stockSearchCtrl.clear();
                          _debouncedQuery = '';
                        }),
                        child: Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: AppSpacing.s5,
                              vertical: AppSpacing.s3),
                          decoration: BoxDecoration(
                            border: Border(
                                bottom:
                                    BorderSide(color: c.border, width: 0.5)),
                          ),
                          child: Row(
                            children: [
                              Container(
                                padding: const EdgeInsets.symmetric(
                                    horizontal: 5, vertical: 2),
                                decoration: BoxDecoration(
                                  color: c.surfaceCard,
                                  borderRadius:
                                      BorderRadius.circular(AppRadius.xs),
                                  border: Border.all(color: c.border),
                                ),
                                child: Text(r.symbol,
                                    style: AppTypography.xs.copyWith(
                                        color: c.textSecondary,
                                        fontWeight: FontWeight.w700)),
                              ),
                              const SizedBox(width: AppSpacing.s3),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment:
                                      CrossAxisAlignment.start,
                                  children: [
                                    Text(r.name,
                                        style: AppTypography.xs
                                            .copyWith(color: c.textPrimary),
                                        maxLines: 1,
                                        overflow: TextOverflow.ellipsis),
                                    if (r.exchange.isNotEmpty)
                                      Text(r.exchange,
                                          style: AppTypography.xs.copyWith(
                                              color: c.textFaint,
                                              fontSize: 10)),
                                  ],
                                ),
                              ),
                              Icon(Icons.bolt_rounded,
                                  size: 14, color: c.textFaint),
                            ],
                          ),
                        ),
                      );
                    },
                  );
                },
              ),
            ),
          ],
        ),
      );
    }

    // ── Normal list mode ────────────────────────────────────────────────────
    return MaxWidthLayout(
      child: Column(
        children: [
          controlRow,
          filterRow,
          searchBar,
          Expanded(
            child: async.when(
              loading: () => const _ScannerLoadingView(),
              error: (e, _) => ErrorView(
                message: '${_countryLabel(_country)} scanner unavailable',
                onRetry: () => ref.invalidate(_multibaggersProvider(_args)),
              ),
              data: (results) {
                final filtered = results
                    .where((r) => r.signalsActive >= _minSignals)
                    .where((r) {
                      if (_signalFilter.isEmpty) return true;
                      for (final sig in _signalFilter) {
                        if (sig == 'VOL' &&
                            !(r.volumeSpike && r.volumeGreen)) return false;
                        if (sig == 'HEARTBEAT' && !r.heartbeat) return false;
                        if (sig == 'REC_QTR' && !r.recordQuarter)
                          return false;
                        if (sig == 'TREND' && !r.trendUp) return false;
                      }
                      return true;
                    })
                    .toList();

                if (_sort == 'volume') {
                  filtered.sort(
                      (a, b) => b.volumeRatio.compareTo(a.volumeRatio));
                }

                return RefreshIndicator(
                  onRefresh: () {
                    TradingRepository.instance
                        .clearScannerCache(_cacheKeyFor(_country, _version));
                    return ref.refresh(_multibaggersProvider(_args).future);
                  },
                  child: filtered.isEmpty
                      ? EmptyView(
                          icon: Icons.filter_list_off_rounded,
                          title: 'No matches',
                          body: 'No stocks cleared the signal filter. Try lowering the minimum signal count.',
                          iconColor: context.colors.textMuted,
                        )
                      : ListView.builder(
                          padding: EdgeInsets.only(
                            top: AppSpacing.s3,
                            bottom: AppSpacing.s3 +
                                MediaQuery.of(context).padding.bottom +
                                MediaQuery.of(context).viewInsets.bottom,
                          ),
                          itemCount: filtered.length,
                          itemBuilder: (_, i) =>
                              _StockCard(item: filtered[i], version: _version),
                        ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

// ── Control Row ───────────────────────────────────────────────────────────────

class _ControlRow extends StatelessWidget {
  const _ControlRow({
    required this.country,
    required this.version,
    required this.onCountry,
    required this.onVersion,
    required this.onBacktest,
    required this.onInfo,
  });

  final String country;
  final String version;
  final ValueChanged<String> onCountry;
  final ValueChanged<String> onVersion;
  final VoidCallback onBacktest;
  final VoidCallback onInfo;

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
              GestureDetector(
                onTap: onBacktest,
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.history_rounded,
                        size: 13, color: c.textSecondary),
                    const SizedBox(width: 3),
                    Text('Backtest',
                        style:
                            AppTypography.xs.copyWith(color: c.textSecondary)),
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
          AppChipRow(
            label: 'Country:',
            children: [
              AppChip(
                label: '🇺🇸 US',
                active: country == 'us',
                onTap: () => onCountry('us'),
              ),
              AppChip(
                label: '🇮🇳 India',
                active: country == 'india',
                onTap: () => onCountry('india'),
              ),
              AppChip(
                label: '🇬🇧 UK',
                active: country == 'uk',
                onTap: () => onCountry('uk'),
              ),
              AppChip(
                label: '🇯🇵 Japan',
                active: country == 'japan',
                onTap: () => onCountry('japan'),
              ),
              AppChip(
                label: '🇭🇰 HK',
                active: country == 'hongkong',
                onTap: () => onCountry('hongkong'),
              ),
              AppChip(
                label: '🇨🇳 China',
                active: country == 'china',
                onTap: () => onCountry('china'),
              ),
              AppChip(
                label: '🇪🇺 Euronext',
                active: country == 'euronext',
                onTap: () => onCountry('euronext'),
              ),
              AppChip(
                label: '🇨🇦 Canada',
                active: country == 'canada',
                onTap: () => onCountry('canada'),
              ),
              AppChip(
                label: '🇦🇺 Australia',
                active: country == 'australia',
                onTap: () => onCountry('australia'),
              ),
              AppChip(
                label: '🇧🇷 Brazil',
                active: country == 'brazil',
                onTap: () => onCountry('brazil'),
              ),
              AppChip(
                label: '🇸🇬 Singapore',
                active: country == 'singapore',
                onTap: () => onCountry('singapore'),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.s2),
          Row(
            children: [
              Text('Ver:',
                  style: AppTypography.xs.copyWith(color: c.textMuted)),
              const SizedBox(width: AppSpacing.s2),
              AppChip(
                label: 'Early Setup',
                active: version == 'v1',
                onTap: () => onVersion('v1'),
              ),
              const SizedBox(width: AppSpacing.s2),
              AppChip(
                label: 'Confirmed Breakout',
                active: version == 'v2',
                onTap: () => onVersion('v2'),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

// ── Filter Row ────────────────────────────────────────────────────────────────

class _FilterRow extends StatelessWidget {
  const _FilterRow({
    required this.minSignals,
    required this.sort,
    required this.version,
    required this.signalFilter,
    required this.onFilter,
    required this.onSort,
    required this.onSignalToggle,
  });

  final int minSignals;
  final String sort;
  final String version;
  final Set<String> signalFilter;
  final ValueChanged<int> onFilter;
  final ValueChanged<String> onSort;
  final ValueChanged<String> onSignalToggle;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Container(
      color: c.surface,
      padding: const EdgeInsets.fromLTRB(
          AppSpacing.s5, 0, AppSpacing.s4, AppSpacing.s3),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Divider(height: 1, color: c.border),
          const SizedBox(height: AppSpacing.s2),
          Wrap(
            spacing: AppSpacing.s2,
            runSpacing: AppSpacing.s2,
            children: [
              AppChip(label: 'All', active: minSignals == 0, onTap: () => onFilter(0)),
              AppChip(label: '1+ Signal', active: minSignals == 1, onTap: () => onFilter(1)),
              AppChip(label: '2+ Signals', active: minSignals == 2, onTap: () => onFilter(2)),
              AppChip(label: '3 Signals', active: minSignals == 3, onTap: () => onFilter(3)),
              AppChip(label: '4 Signals', active: minSignals == 4, onTap: () => onFilter(4)),
            ],
          ),
          const SizedBox(height: AppSpacing.s2),
          AppChipRow(
            label: 'Signals:',
            children: [
              AppChip(
                label: 'VOL',
                active: signalFilter.contains('VOL'),
                onTap: () => onSignalToggle('VOL'),
              ),
              AppChip(
                label: 'HEARTBEAT',
                active: signalFilter.contains('HEARTBEAT'),
                onTap: () => onSignalToggle('HEARTBEAT'),
              ),
              AppChip(
                label: 'REC. QTR',
                active: signalFilter.contains('REC_QTR'),
                onTap: () => onSignalToggle('REC_QTR'),
              ),
              version == 'v1'
                  ? const AppChip(label: 'TREND ↑', active: false, disabled: true)
                  : AppChip(
                      label: 'TREND ↑',
                      active: signalFilter.contains('TREND'),
                      onTap: () => onSignalToggle('TREND'),
                    ),
            ],
          ),
          const SizedBox(height: AppSpacing.s2),
          Row(
            children: [
              Text('Sort:',
                  style: AppTypography.xs.copyWith(color: c.textMuted)),
              const SizedBox(width: AppSpacing.s2),
              AppChip(
                label: 'Signal Count',
                active: sort == 'signals',
                onTap: () => onSort('signals'),
              ),
              const SizedBox(width: AppSpacing.s2),
              AppChip(
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

// ── Stock Card ────────────────────────────────────────────────────────────────

class _StockCard extends StatelessWidget {
  const _StockCard({required this.item, required this.version});

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
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 5, vertical: 2),
                  decoration: BoxDecoration(
                    color: c.surfaceCard,
                    borderRadius: BorderRadius.circular(AppRadius.xs),
                    border: Border.all(color: c.border),
                  ),
                  child: Text(
                    item.symbol,
                    style: AppTypography.xs.copyWith(
                        color: c.textSecondary, fontWeight: FontWeight.w700),
                  ),
                ),
                const SizedBox(width: AppSpacing.s2),
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
                _PctChip(pct: item.changePercent, color: pctColor),
              ],
            ),
            const SizedBox(height: AppSpacing.s3),
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
                  activeColor: c.accent,
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
            _SignalDots(
                count: item.signalsActive, total: version == 'v2' ? 4 : 3),
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

// ── Signal Pill ───────────────────────────────────────────────────────────────

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
          Text(label,
              style: AppTypography.xs.copyWith(
                  color: color,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 0.3)),
        ],
      ),
    );
  }
}

// ── Signal Dots ───────────────────────────────────────────────────────────────

class _SignalDots extends StatelessWidget {
  const _SignalDots({required this.count, this.total = 3});

  final int count;
  final int total;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Row(
      children: [
        Text('$count of $total signals',
            style: AppTypography.xs.copyWith(color: c.textMuted)),
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

// ── Pct Chip ──────────────────────────────────────────────────────────────────

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
              style: AppTypography.xs
                  .copyWith(color: color, fontWeight: FontWeight.w700),
            ),
            TextSpan(
              text: ' 1D',
              style: AppTypography.xs.copyWith(
                  color: color.withAlpha(160),
                  fontWeight: FontWeight.w500,
                  fontSize: 9),
            ),
          ],
        ),
      ),
    );
  }
}

// ── Loading state — shimmer + delayed "still scanning" hint ──────────────────

class _ScannerLoadingView extends StatefulWidget {
  const _ScannerLoadingView();

  @override
  State<_ScannerLoadingView> createState() => _ScannerLoadingViewState();
}

class _ScannerLoadingViewState extends State<_ScannerLoadingView> {
  bool _showHint = false;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    // Most scans resolve well under this — only shown if it's genuinely slow
    // (cold cache, full market pass), so users don't think it's stuck.
    _timer = Timer(const Duration(seconds: 5), () {
      if (mounted) setState(() => _showHint = true);
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Stack(
      children: [
        const ShimmerList(count: 6, type: ShimmerRowType.scannerCard),
        if (_showHint)
          Positioned(
            top: AppSpacing.s3,
            left: 0,
            right: 0,
            child: Center(
              child: Container(
                padding: const EdgeInsets.symmetric(
                    horizontal: AppSpacing.s4, vertical: AppSpacing.s2),
                decoration: BoxDecoration(
                  color: c.surfaceElevated,
                  borderRadius: BorderRadius.circular(AppRadius.full),
                  border: Border.all(color: c.border),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    SizedBox(
                      width: 12,
                      height: 12,
                      child: CircularProgressIndicator(
                          strokeWidth: 2, color: c.accent),
                    ),
                    const SizedBox(width: AppSpacing.s2),
                    Text(
                      'Still scanning — this can take a few seconds',
                      style: AppTypography.xs.copyWith(color: c.textSecondary),
                    ),
                  ],
                ),
              ),
            ),
          ),
      ],
    );
  }
}

// ── Search Bar ────────────────────────────────────────────────────────────────

class _MBSearchBar extends StatelessWidget {
  const _MBSearchBar({
    required this.controller,
    required this.selectedStock,
    required this.c,
    required this.onClearSelection,
  });

  final TextEditingController controller;
  final StockSearchResult? selectedStock;
  final AppPalette c;
  final VoidCallback onClearSelection;

  @override
  Widget build(BuildContext context) {
    if (selectedStock != null) {
      return Container(
        color: c.surface,
        padding: const EdgeInsets.fromLTRB(
            AppSpacing.s5, AppSpacing.s2, AppSpacing.s5, AppSpacing.s3),
        child: Container(
          padding: const EdgeInsets.symmetric(
              horizontal: AppSpacing.s4, vertical: AppSpacing.s3),
          decoration: BoxDecoration(
            color: c.accent.withAlpha(15),
            borderRadius: BorderRadius.circular(AppRadius.sm),
            border: Border.all(color: c.accent.withAlpha(40)),
          ),
          child: Row(
            children: [
              Icon(Icons.biotech_rounded, size: 13, color: c.accent),
              const SizedBox(width: AppSpacing.s2),
              Expanded(
                child: Text(
                  '${selectedStock!.name}  ·  ${selectedStock!.symbol}',
                  style: AppTypography.xs.copyWith(
                      color: c.accent, fontWeight: FontWeight.w600),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              GestureDetector(
                onTap: onClearSelection,
                child: Icon(Icons.close_rounded, size: 14, color: c.accent),
              ),
            ],
          ),
        ),
      );
    }
    return Container(
      color: c.surface,
      padding: const EdgeInsets.fromLTRB(
          AppSpacing.s5, AppSpacing.s2, AppSpacing.s5, AppSpacing.s3),
      child: Container(
        height: 36,
        decoration: BoxDecoration(
          color: c.surfaceCard,
          borderRadius: BorderRadius.circular(AppRadius.sm),
          border: Border.all(color: c.border),
        ),
        child: TextField(
          controller: controller,
          style: AppTypography.xs.copyWith(color: c.textPrimary),
          decoration: InputDecoration(
            hintText: 'Search a stock by symbol or name…',
            hintStyle: AppTypography.xs.copyWith(color: c.textFaint),
            prefixIcon:
                Icon(Icons.search_rounded, size: 16, color: c.textMuted),
            suffixIcon: controller.text.isNotEmpty
                ? GestureDetector(
                    onTap: controller.clear,
                    child:
                        Icon(Icons.close_rounded, size: 14, color: c.textMuted),
                  )
                : null,
            border: InputBorder.none,
            isDense: true,
            contentPadding:
                const EdgeInsets.symmetric(vertical: 10, horizontal: 0),
          ),
        ),
      ),
    );
  }
}

// ── Info Sheet ────────────────────────────────────────────────────────────────

void _showMultibaggersInfo(BuildContext context) {
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
      builder: (ctx, controller) => ListView(
        controller: controller,
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
                  color: c.border, borderRadius: BorderRadius.circular(2)),
            ),
          ),
          const SizedBox(height: AppSpacing.s5),
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
                child: Text('MB',
                    style: AppTypography.labelSm.copyWith(
                        color: c.accent, fontWeight: FontWeight.w800)),
              ),
              const SizedBox(width: AppSpacing.s3),
              Expanded(
                child: Text('How Multibaggers Works',
                    style: AppTypography.headingMd
                        .copyWith(color: c.textPrimary)),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.s3),
          Text(
            'Applies the same 10X scanner logic to Indian and UK equities — scanning for stocks in a quiet accumulation phase with tightening range, building volume, and improving earnings momentum. These are the conditions that have historically preceded explosive breakout moves.',
            style: AppTypography.sm
                .copyWith(color: c.textSecondary, height: 1.55),
          ),
          const SizedBox(height: AppSpacing.s5),
          _InfoRow(
            label: 'COUNTRY',
            color: c.accent,
            c: c,
            description:
                'India: NSE/BSE (IN). UK: LSE (GB). Japan: TSE (JP). HK: HKEX (HK). China: SSE/SZSE (CN). Euronext: FR + NL + DE + IT + NO combined. Universe updates every hour.',
          ),
          const SizedBox(height: AppSpacing.s4),
          _InfoRow(
            label: 'SIGNALS',
            color: c.warning,
            c: c,
            description:
                'VOL = volume spike ≥3× 20-day average on a green candle. HEARTBEAT = tight consolidation range. REC. QTR = record or near-record EPS quarter. TREND ↑ = MA50 flat or rising (Confirmed Breakout only).',
          ),
          const SizedBox(height: AppSpacing.s4),
          _InfoRow(
            label: 'Early Setup vs Confirmed Breakout',
            color: c.textSecondary,
            c: c,
            description:
                'Early Setup: 30% consolidation range over 2 years. Confirmed Breakout: 35% range over the last 200 bars + MA50 trend signal, matching TradingView Pine Script logic.',
          ),
          const SizedBox(height: AppSpacing.s4),
          _InfoRow(
            label: 'BACKTEST',
            color: c.positive,
            c: c,
            description:
                'Tap "Backtest" to see 5-year historical win rates for India or UK stocks. Results show how often signals preceded positive price moves at 1m, 3m, 6m, and 1y horizons.',
          ),
          const SizedBox(height: AppSpacing.s5),
          Container(
            padding: const EdgeInsets.all(AppSpacing.s4),
            decoration: BoxDecoration(
              color: c.warning.withAlpha(12),
              borderRadius: BorderRadius.circular(AppRadius.sm),
              border: Border.all(color: c.warning.withAlpha(40)),
            ),
            child: Text(
              'Past performance does not guarantee future results. Use as one input among many.',
              style: AppTypography.xs
                  .copyWith(color: c.warning.withAlpha(200), height: 1.5),
            ),
          ),
        ],
      ),
    ),
  );
}

class _InfoRow extends StatelessWidget {
  const _InfoRow({
    required this.label,
    required this.color,
    required this.c,
    required this.description,
  });

  final String label;
  final Color color;
  final AppPalette c;
  final String description;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
          decoration: BoxDecoration(
            color: color.withAlpha(20),
            borderRadius: BorderRadius.circular(AppRadius.full),
            border: Border.all(color: color.withAlpha(70)),
          ),
          child: Text(label,
              style: AppTypography.xs
                  .copyWith(color: color, fontWeight: FontWeight.w700)),
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
