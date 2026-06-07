import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme/app_palette.dart';
import '../../core/theme/app_typography.dart';
import '../../core/theme/app_spacing.dart';
import '../../data/models/trading_signal.dart';
import '../../data/repositories/trading_repository.dart';
import '../../services/entitlement_service.dart';
import '../../shared/widgets/error_view.dart';
import '../../shared/widgets/glass_card.dart';
import '../../shared/widgets/max_width_layout.dart';
import '../../shared/widgets/theme_toggle.dart';
import '../../shared/widgets/upgrade_sheet.dart';
import '../exposure/exposure_screen.dart';
import 'multibaggers_screen.dart';
import 'house_trades_tab.dart';
import 'earnings_calendar_tab.dart';

// ── Providers ─────────────────────────────────────────────────────────────────

final _bestSetupsProvider = FutureProvider.autoDispose
    .family<BestSetupsResponse, ({String version, String type})>(
  (_, args) => TradingRepository.instance.fetchBestSetups(
    version: args.version,
    type: args.type,
  ),
);

final _sectorBestSetupsProvider =
    FutureProvider.autoDispose.family<SectorBestSetupsResponse, String>(
  (_, version) =>
      TradingRepository.instance.fetchSectorBestSetups(version: version),
);

final _congressTradesProvider =
    FutureProvider.autoDispose<CongressTradesResponse>(
  (_) => TradingRepository.instance.fetchCongressTrades(),
);

final _trumpTransactionsProvider =
    FutureProvider.autoDispose<OgeTransactionsResponse>(
  (_) => TradingRepository.instance.fetchTrumpTransactions(),
);

final _quiverCongressProvider = FutureProvider.autoDispose<QuiverScanResponse>(
  (_) => TradingRepository.instance.fetchQuiverCongress(),
);

final _quiverLobbyingProvider = FutureProvider.autoDispose<QuiverScanResponse>(
  (_) => TradingRepository.instance.fetchQuiverLobbying(),
);

final _quiverInsiderProvider = FutureProvider.autoDispose<QuiverScanResponse>(
  (_) => TradingRepository.instance.fetchQuiverInsider(),
);

// ── Screen ────────────────────────────────────────────────────────────────────

class InvestingScreen extends StatefulWidget {
  const InvestingScreen({super.key});

  @override
  State<InvestingScreen> createState() => _InvestingScreenState();
}

class _InvestingScreenState extends State<InvestingScreen>
    with SingleTickerProviderStateMixin {
  late final TabController _tab;

  @override
  void initState() {
    super.initState();
    _tab = TabController(length: 8, vsync: this);
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
      resizeToAvoidBottomInset: false,
      appBar: AppBar(
        title: Text('Investing',
            style: AppTypography.headingMd.copyWith(color: c.textPrimary)),
        backgroundColor: c.headerBg,
        actions: const [ThemeToggleButton()],
        bottom: TabBar(
          controller: _tab,
          labelColor: c.accent,
          unselectedLabelColor: c.textMuted,
          indicatorColor: c.accent,
          isScrollable: true,
          tabAlignment: TabAlignment.start,
          labelStyle:
              AppTypography.labelSm.copyWith(fontWeight: FontWeight.w600),
          unselectedLabelStyle: AppTypography.labelSm,
          tabs: const [
            Tab(text: 'Exposure'),
            Tab(text: 'Dashboard'),
            Tab(text: 'Multibaggers'),
            Tab(text: 'Presidential'),
            Tab(text: 'Congress'),
            Tab(text: 'Smart \$'),
            Tab(text: 'House Trades'),
            Tab(text: 'Earnings'),
          ],
        ),
      ),
      body: TabBarView(
        controller: _tab,
        children: const [
          ExposureBody(),
          _InvestingDashboardTab(),
          MultibaggersBody(),
          _PresidentialTab(),
          _CongressTradesTab(),
          _QuiverTab(),
          HouseTradesTab(),
          EarningsCalendarTab(),
        ],
      ),
    );
  }
}

// ── Dashboard Tab (Best Setups) ───────────────────────────────────────────────

class _InvestingDashboardTab extends ConsumerStatefulWidget {
  const _InvestingDashboardTab();

  @override
  ConsumerState<_InvestingDashboardTab> createState() =>
      _InvestingDashboardTabState();
}

class _InvestingDashboardTabState
    extends ConsumerState<_InvestingDashboardTab> {
  String _version = 'v1';
  String _type = 'assets';

  @override
  void initState() {
    super.initState();
    // Pre-warm the default combination and sector card so they are already
    // cached or in-flight by the time the user looks at the tab.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      TradingRepository.instance
          .fetchBestSetups(version: 'v1', type: 'assets')
          .ignore();
      TradingRepository.instance
          .fetchSectorBestSetups(version: 'v1')
          .ignore();
    });
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final isPro = EntitlementService.can('best_setups');
    final args = (version: _version, type: _type);
    final async = ref.watch(_bestSetupsProvider(args));

    return MaxWidthLayout(
      child: ListView(
        padding: EdgeInsets.fromLTRB(
          AppSpacing.s5,
          AppSpacing.s5,
          AppSpacing.s5,
          AppSpacing.s5 + MediaQuery.of(context).padding.bottom,
        ),
        children: [
          Container(
            padding: const EdgeInsets.all(AppSpacing.s4),
            decoration: BoxDecoration(
              color: c.surfaceElevated,
              borderRadius: BorderRadius.circular(AppRadius.md),
              border: Border.all(color: c.border),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Icon(Icons.bolt_rounded, size: 18, color: c.warning),
                    const SizedBox(width: AppSpacing.s2),
                    Expanded(
                      child: Text('Best Setups Right Now',
                          style: AppTypography.headingSm
                              .copyWith(color: c.textPrimary)),
                    ),
                    GestureDetector(
                      onTap: () => _showBestSetupsInfo(context),
                      child: Icon(Icons.info_outline_rounded,
                          size: 16, color: c.textMuted),
                    ),
                  ],
                ),
                const SizedBox(height: AppSpacing.s2),
                Text(
                  'Signals firing today with ≥65% historical 1m win rate',
                  style: AppTypography.xs.copyWith(color: c.textMuted),
                ),
                const SizedBox(height: AppSpacing.s4),
                Row(
                  children: [
                    GestureDetector(
                      onTap: () => setState(() =>
                          _type = _type == 'assets' ? 'stocks' : 'assets'),
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 8, vertical: 4),
                        decoration: BoxDecoration(
                          color: c.surfaceCard,
                          borderRadius: BorderRadius.circular(AppRadius.full),
                          border: Border.all(color: c.border),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            _VersionDot(
                                label: 'Assets',
                                active: _type == 'assets',
                                c: c),
                            const SizedBox(width: 6),
                            _VersionDot(
                                label: 'Stocks',
                                active: _type == 'stocks',
                                c: c),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(width: AppSpacing.s3),
                    GestureDetector(
                      onTap: () => setState(
                          () => _version = _version == 'v1' ? 'v2' : 'v1'),
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 8, vertical: 4),
                        decoration: BoxDecoration(
                          color: c.surfaceCard,
                          borderRadius: BorderRadius.circular(AppRadius.full),
                          border: Border.all(color: c.border),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            _VersionDot(
                                label: 'v1', active: _version == 'v1', c: c),
                            const SizedBox(width: 6),
                            _VersionDot(
                                label: 'v2', active: _version == 'v2', c: c),
                          ],
                        ),
                      ),
                    ),
                    const Spacer(),
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 8, vertical: 3),
                      decoration: BoxDecoration(
                        color: c.accentDim18,
                        borderRadius: BorderRadius.circular(AppRadius.full),
                      ),
                      child: Text('Pro',
                          style: AppTypography.xs.copyWith(
                              color: c.accent, fontWeight: FontWeight.w700)),
                    ),
                  ],
                ),
                const SizedBox(height: AppSpacing.s4),
                Container(
                  decoration: BoxDecoration(
                    color: c.surfaceCard,
                    borderRadius: BorderRadius.circular(AppRadius.md),
                    border: Border.all(color: c.border),
                  ),
                  child: !isPro
                      ? _BestSetupsLockedBody(c: c, context: context)
                      : async.when(
                          loading: () => _BestSetupsLoadingBody(c: c),
                          error: (_, __) => Padding(
                            padding: const EdgeInsets.all(AppSpacing.s4),
                            child: Text('Unable to load setups',
                                style: AppTypography.xs
                                    .copyWith(color: c.textMuted)),
                          ),
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
                                    style: AppTypography.xs
                                        .copyWith(color: c.textMuted)),
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
                                      mainAxisAlignment:
                                          MainAxisAlignment.center,
                                      children: [
                                        Text('View Backtest History',
                                            style: AppTypography.xs
                                                .copyWith(color: c.accent)),
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
                ),
              ],
            ),
          ),
          const SizedBox(height: AppSpacing.s5),
          _SectorBestSetupsCard(version: _version),
        ],
      ),
    );
  }
}

// ── Filter Chip ───────────────────────────────────────────────────────────────

class _FilterChip extends StatelessWidget {
  const _FilterChip({
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

// ── Version Dot ───────────────────────────────────────────────────────────────

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

// ── Best Setups Locked/Loading Bodies ─────────────────────────────────────────

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
                      color: Colors.black, fontWeight: FontWeight.w700)),
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
          Text("Checking today's setups…",
              style: AppTypography.xs.copyWith(color: c.textMuted)),
        ],
      ),
    );
  }
}

// ── Setup Row ─────────────────────────────────────────────────────────────────

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
    style: AppTypography.xs
        .copyWith(color: color, fontWeight: FontWeight.w600),
  );
}

TextSpan _dotSep(AppPalette c) => TextSpan(
    text: ' · ',
    style: AppTypography.xs.copyWith(color: c.textFaint));

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
      onTap: () =>
          context.push('/trading/10x-backtest?version=$version&type=$type'),
      child: Container(
        decoration: BoxDecoration(
          border: Border(top: BorderSide(color: c.border)),
        ),
        padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.s4, vertical: AppSpacing.s3),
        child: Row(
          children: [
            Text(setup.flag, style: const TextStyle(fontSize: 18)),
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

// ── Congress Trades Tab ───────────────────────────────────────────────────────

class _CongressTradesTab extends ConsumerStatefulWidget {
  const _CongressTradesTab();

  @override
  ConsumerState<_CongressTradesTab> createState() => _CongressTradesTabState();
}

class _CongressTradesTabState extends ConsumerState<_CongressTradesTab> {
  String _chamber = 'All'; // All | Senate | House
  String _type    = 'All'; // All | Buys | Sells
  String _party   = 'All'; // All | Republican | Democratic
  String _sort    = 'date'; // date | amount
  final _searchCtrl = TextEditingController();

  @override
  void initState() {
    super.initState();
    _searchCtrl.addListener(() => setState(() {}));
  }

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final async = ref.watch(_congressTradesProvider);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Header + filters
        Container(
          color: c.surface,
          padding: const EdgeInsets.fromLTRB(
              AppSpacing.s5, AppSpacing.s4, AppSpacing.s5, AppSpacing.s3),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Icon(Icons.account_balance_rounded, size: 16, color: c.accent),
                  const SizedBox(width: AppSpacing.s2),
                  Text(
                    'Congress Trades',
                    style: AppTypography.labelMd.copyWith(
                        color: c.textPrimary, fontWeight: FontWeight.w700),
                  ),
                  const Spacer(),
                  async.whenOrNull(
                        data: (r) => Text(
                          '${r.total} trades · 12-month window',
                          style: AppTypography.xs.copyWith(color: c.textMuted),
                        ),
                      ) ??
                      const SizedBox.shrink(),
                ],
              ),
              const SizedBox(height: AppSpacing.s3),
              _SearchField(
                controller: _searchCtrl,
                hint: 'Search stock, symbol, or member name…',
                c: c,
              ),
              const SizedBox(height: AppSpacing.s3),
              // Chamber + Type
              SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: Row(
                  children: [
                    Text('Chamber:',
                        style: AppTypography.xs.copyWith(color: c.textMuted)),
                    const SizedBox(width: AppSpacing.s2),
                    for (final label in ['All', 'Senate', 'House']) ...[
                      _FilterChip(
                        label: label,
                        active: _chamber == label,
                        onTap: () => setState(() => _chamber = label),
                      ),
                      if (label != 'House') const SizedBox(width: AppSpacing.s2),
                    ],
                    const SizedBox(width: AppSpacing.s5),
                    Text('Type:',
                        style: AppTypography.xs.copyWith(color: c.textMuted)),
                    const SizedBox(width: AppSpacing.s2),
                    for (final label in ['All', 'Buys', 'Sells']) ...[
                      _FilterChip(
                        label: label,
                        active: _type == label,
                        onTap: () => setState(() => _type = label),
                      ),
                      if (label != 'Sells') const SizedBox(width: AppSpacing.s2),
                    ],
                  ],
                ),
              ),
              const SizedBox(height: AppSpacing.s2),
              // Party + Sort
              SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: Row(
                  children: [
                    Text('Party:',
                        style: AppTypography.xs.copyWith(color: c.textMuted)),
                    const SizedBox(width: AppSpacing.s2),
                    for (final label in ['All', 'Republican', 'Democratic']) ...[
                      _FilterChip(
                        label: label,
                        active: _party == label,
                        onTap: () => setState(() => _party = label),
                      ),
                      if (label != 'Democratic') const SizedBox(width: AppSpacing.s2),
                    ],
                    const SizedBox(width: AppSpacing.s5),
                    Text('Sort:',
                        style: AppTypography.xs.copyWith(color: c.textMuted)),
                    const SizedBox(width: AppSpacing.s2),
                    _FilterChip(
                      label: 'Date ↓',
                      active: _sort == 'date',
                      onTap: () => setState(() => _sort = 'date'),
                    ),
                    const SizedBox(width: AppSpacing.s2),
                    _FilterChip(
                      label: 'Amount ↓',
                      active: _sort == 'amount',
                      onTap: () => setState(() => _sort = 'amount'),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
        // Body
        Expanded(
          child: async.when(
            loading: () => _CongressTradesSkeleton(c: c),
            error: (_, __) => _CongressNoData(
              c: c,
              onRetry: () => ref.invalidate(_congressTradesProvider),
            ),
            data: (resp) {
              final query = _searchCtrl.text.toLowerCase().trim();

              var filtered = resp.trades.where((t) {
                if (_chamber == 'Senate' && t.chamber != 'Senate') return false;
                if (_chamber == 'House'  && t.chamber != 'House')  return false;
                if (_type == 'Buys'  && t.type != 'buy')  return false;
                if (_type == 'Sells' && t.type != 'sell') return false;
                if (_party == 'Republican' && t.party != 'R') return false;
                if (_party == 'Democratic' && t.party != 'D') return false;
                if (query.isNotEmpty) {
                  final name   = (t.name ?? '').toLowerCase();
                  final ticker = t.ticker.toLowerCase();
                  final member = t.memberName.toLowerCase();
                  if (!name.contains(query) && !ticker.contains(query) && !member.contains(query)) return false;
                }
                return true;
              }).toList();

              if (_sort == 'amount') {
                filtered.sort((a, b) =>
                    (b.amountMidpoint ?? 0).compareTo(a.amountMidpoint ?? 0));
              }

              if (filtered.isEmpty) {
                return _CongressNoData(
                  c: c,
                  onRetry: () => ref.invalidate(_congressTradesProvider),
                  message: resp.total == 0
                      ? 'No Data'
                      : 'No trades match the current filter.',
                );
              }

              return RefreshIndicator(
                onRefresh: () => ref.refresh(_congressTradesProvider.future),
                child: ListView.builder(
                  padding: EdgeInsets.only(
                    top: AppSpacing.s3,
                    bottom: AppSpacing.s5 +
                        MediaQuery.of(context).padding.bottom,
                  ),
                  itemCount: filtered.length,
                  itemBuilder: (_, i) => _CongressTradeCard(trade: filtered[i]),
                ),
              );
            },
          ),
        ),
      ],
    );
  }
}

// ── Search Field ──────────────────────────────────────────────────────────────

class _SearchField extends StatelessWidget {
  const _SearchField({
    required this.controller,
    required this.hint,
    required this.c,
  });

  final TextEditingController controller;
  final String hint;
  final AppPalette c;


  @override
  Widget build(BuildContext context) {
    return Container(
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
          hintText: hint,
          hintStyle: AppTypography.xs.copyWith(color: c.textFaint),
          prefixIcon: Icon(Icons.search_rounded, size: 16, color: c.textMuted),
          suffixIcon: controller.text.isNotEmpty
              ? GestureDetector(
                  onTap: controller.clear,
                  child: Icon(Icons.close_rounded, size: 14, color: c.textMuted),
                )
              : null,
          border: InputBorder.none,
          isDense: true,
          contentPadding:
              const EdgeInsets.symmetric(vertical: 10, horizontal: 0),
        ),
      ),
    );
  }
}

// ── Congress Trade Card ───────────────────────────────────────────────────────

class _CongressTradeCard extends StatelessWidget {
  const _CongressTradeCard({required this.trade});

  final CongressTrade trade;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final isBuy = trade.type == 'buy';
    final typeColor = isBuy ? c.positive : c.danger;
    final partyColor = _partyColor(trade.party, c);

    return GestureDetector(
      onTap: () => context.push(
        '/asset/${Uri.encodeComponent(trade.ticker)}'
        '?name=${Uri.encodeComponent(trade.displayName)}',
      ),
      child: GlassCard(
        margin: const EdgeInsets.symmetric(
            horizontal: AppSpacing.s5, vertical: AppSpacing.s2),
        padding: const EdgeInsets.all(AppSpacing.s4),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Row 1: stock name · buy/sell badge
            Row(
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                Expanded(
                  child: Text(
                    trade.displayName,
                    style: AppTypography.labelMd
                        .copyWith(color: c.textPrimary, fontWeight: FontWeight.w700),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                const SizedBox(width: AppSpacing.s2),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
                  decoration: BoxDecoration(
                    color: typeColor.withAlpha(25),
                    borderRadius: BorderRadius.circular(AppRadius.full),
                    border: Border.all(color: typeColor.withAlpha(80)),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(
                        isBuy
                            ? Icons.arrow_upward_rounded
                            : Icons.arrow_downward_rounded,
                        size: 10,
                        color: typeColor,
                      ),
                      const SizedBox(width: 3),
                      Text(
                        isBuy ? 'BUY' : 'SELL',
                        style: AppTypography.xs.copyWith(
                            color: typeColor, fontWeight: FontWeight.w800),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: AppSpacing.s2),
            // Row 2: ticker chip · member name
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
                    trade.ticker,
                    style: AppTypography.xs.copyWith(
                        color: c.textSecondary, fontWeight: FontWeight.w700),
                  ),
                ),
                const SizedBox(width: AppSpacing.s2),
                Expanded(
                  child: GestureDetector(
                    onTap: () => context.push(
                      '/politician?name=${Uri.encodeComponent(trade.memberName)}'
                      '&chamber=${Uri.encodeComponent(trade.chamber)}',
                    ),
                    child: Text(
                      trade.memberName,
                      style: AppTypography.xs.copyWith(
                          color: c.accent, fontWeight: FontWeight.w600),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: AppSpacing.s2),
            // Row 3: chamber · party label · state · amount badge
            Row(
              children: [
                _MetaPill(label: trade.chamber, c: c),
                if (trade.party != null && trade.party!.isNotEmpty) ...[
                  const SizedBox(width: AppSpacing.s2),
                  Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 6, vertical: 2),
                    decoration: BoxDecoration(
                      color: partyColor.withAlpha(20),
                      borderRadius: BorderRadius.circular(AppRadius.full),
                      border: Border.all(color: partyColor.withAlpha(60)),
                    ),
                    child: Text(
                      _partyLabel(trade.party),
                      style: AppTypography.xs.copyWith(
                          color: partyColor, fontWeight: FontWeight.w700),
                    ),
                  ),
                ],
                if (trade.state != null && trade.state!.isNotEmpty) ...[
                  const SizedBox(width: AppSpacing.s2),
                  Text(
                    trade.state!,
                    style: AppTypography.xs.copyWith(color: c.textMuted),
                  ),
                ],
                const Spacer(),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
                  decoration: BoxDecoration(
                    color: c.accent.withAlpha(15),
                    borderRadius: BorderRadius.circular(AppRadius.full),
                    border: Border.all(color: c.accent.withAlpha(45)),
                  ),
                  child: Text(
                    _fmtAmount(trade.amount),
                    style: AppTypography.xs.copyWith(
                        color: c.accent, fontWeight: FontWeight.w700),
                  ),
                ),
              ],
            ),
            const SizedBox(height: AppSpacing.s2),
            // Row 4: trade date · filing date
            Row(
              children: [
                Icon(Icons.swap_horiz_rounded, size: 12, color: c.textFaint),
                const SizedBox(width: 4),
                Text(
                  'Traded ${_fmtDate(trade.transactionDate)}',
                  style: AppTypography.xs.copyWith(color: c.textMuted),
                ),
                if (trade.filingDate.isNotEmpty) ...[
                  Text('  ·  ',
                      style: AppTypography.xs.copyWith(color: c.textFaint)),
                  Text(
                    'Filed ${_fmtDate(trade.filingDate)}',
                    style: AppTypography.xs.copyWith(color: c.textFaint),
                  ),
                ],
              ],
            ),
          ],
        ),
      ),
    );
  }

  Color _partyColor(String? party, AppPalette c) {
    switch (party) {
      case 'D': return const Color(0xFF3B82F6);
      case 'R': return c.danger;
      default:  return c.textMuted;
    }
  }

  String _partyLabel(String? party) {
    switch (party) {
      case 'D': return 'Democratic';
      case 'R': return 'Republican';
      case 'I': return 'Independent';
      default:  return party ?? '';
    }
  }

  String _fmtAmount(String raw) {
    // "$1,001 - $15,000" → "$1K–$15K"
    final clean = raw.replaceAll(RegExp(r'\s+'), ' ').trim();
    if (clean.isEmpty) return '—';
    // Compact large numbers
    return clean
        .replaceAllMapped(RegExp(r'\$(\d{1,3}(?:,\d{3})*)'),
            (m) => '\$${_compact(m.group(1)!)}')
        .replaceAll(' - ', '–');
  }

  String _compact(String numStr) {
    final n = int.tryParse(numStr.replaceAll(',', '')) ?? 0;
    if (n >= 1000000) return '${(n / 1000000).toStringAsFixed(1)}M';
    if (n >= 1000)    return '${(n / 1000).toStringAsFixed(0)}K';
    return numStr;
  }

  String _fmtDate(String iso) {
    if (iso.length < 10) return iso;
    try {
      final dt = DateTime.parse(iso);
      const months = [
        'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
        'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
      ];
      return '${months[dt.month - 1]} ${dt.day}, ${dt.year}';
    } catch (_) {
      return iso;
    }
  }
}

// ── Congress Trades Skeleton ──────────────────────────────────────────────────

class _CongressTradesSkeleton extends StatelessWidget {
  const _CongressTradesSkeleton({required this.c});
  final AppPalette c;

  @override
  Widget build(BuildContext context) {
    return ListView.builder(
      padding: const EdgeInsets.all(AppSpacing.s5),
      itemCount: 8,
      itemBuilder: (_, __) => Container(
        height: 88,
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

// ── Congress No Data / Error ──────────────────────────────────────────────────

class _CongressNoData extends StatelessWidget {
  const _CongressNoData({
    required this.c,
    required this.onRetry,
    this.message = 'No Data',
  });

  final AppPalette c;
  final VoidCallback onRetry;
  final String message;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.s8),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.account_balance_outlined,
                size: 40, color: c.textFaint),
            const SizedBox(height: AppSpacing.s4),
            Text(
              message,
              style: AppTypography.headingSm.copyWith(color: c.textSecondary),
              textAlign: TextAlign.center,
            ),
            if (message == 'No Data') ...[
              const SizedBox(height: AppSpacing.s2),
              Text(
                'Live congressional trade data is currently unavailable. The data provider may require an updated subscription.',
                style: AppTypography.xs.copyWith(
                    color: c.textMuted, height: 1.5),
                textAlign: TextAlign.center,
              ),
            ],
            const SizedBox(height: AppSpacing.s5),
            GestureDetector(
              onTap: onRetry,
              child: Container(
                padding: const EdgeInsets.symmetric(
                    horizontal: AppSpacing.s5, vertical: AppSpacing.s3),
                decoration: BoxDecoration(
                  border: Border.all(color: c.border),
                  borderRadius: BorderRadius.circular(AppRadius.full),
                ),
                child: Text('Retry',
                    style: AppTypography.xs.copyWith(color: c.textSecondary)),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ── Meta Pill ─────────────────────────────────────────────────────────────────

class _MetaPill extends StatelessWidget {
  const _MetaPill({required this.label, required this.c});
  final String label;
  final AppPalette c;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: c.surfaceCard,
        borderRadius: BorderRadius.circular(AppRadius.full),
        border: Border.all(color: c.border),
      ),
      child: Text(
        label,
        style:
            AppTypography.xs.copyWith(color: c.textSecondary),
      ),
    );
  }
}
// ── Best Setups Info Sheet ────────────────────────────────────────────────────

String _fmtRelative(String iso) {
  try {
    final dt = DateTime.parse(iso).toLocal();
    final diff = DateTime.now().difference(dt);
    if (diff.inMinutes < 1) return 'just now';
    if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
    if (diff.inHours < 24) return '${diff.inHours}h ago';
    if (diff.inDays < 7) return '${diff.inDays}d ago';
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return '${months[dt.month - 1]} ${dt.day}, ${dt.year}';
  } catch (_) {
    return '';
  }
}

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
        padding: EdgeInsets.fromLTRB(AppSpacing.s5, AppSpacing.s5,
            AppSpacing.s5, AppSpacing.s8 + MediaQuery.of(ctx).padding.bottom),
        children: [
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
            style: AppTypography.sm
                .copyWith(color: c.textSecondary, height: 1.55),
          ),
          const SizedBox(height: AppSpacing.s5),
          Text('How to read each row',
              style: AppTypography.headingSm.copyWith(color: c.textPrimary)),
          const SizedBox(height: AppSpacing.s4),
          _BestSetupsInfoRow(
            c: c,
            label: '1m / 3m / 1y',
            body: 'Historical win rate over those periods when the same number of signals were active. '
                'Green = ≥65%, orange = 50–64%, red = below 50%.',
          ),
          const SizedBox(height: AppSpacing.s4),
          _BestSetupsInfoRow(
            c: c,
            label: 'Signal dots',
            body: 'Filled green dots = active signals right now (Volume Spike, Heartbeat, Record Quarter, Trend). '
                'More dots = stronger confluence.',
          ),
          const SizedBox(height: AppSpacing.s4),
          _BestSetupsInfoRow(
            c: c,
            label: 'Avg +X% 3m',
            body: 'Average price return 3 months after previous setups with this many signals fired. '
                'Positive means past occurrences were profitable on average.',
          ),
          const SizedBox(height: AppSpacing.s5),
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
              style: AppTypography.xs
                  .copyWith(color: c.textSecondary, height: 1.55),
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
              style: AppTypography.xs
                  .copyWith(color: c.textSecondary, height: 1.55)),
        ),
      ],
    );
  }
}


// ── Sector Best Setups Card ───────────────────────────────────────────────────

class _SectorBestSetupsCard extends ConsumerWidget {
  const _SectorBestSetupsCard({required this.version});
  final String version;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final isPro = EntitlementService.can('best_setups');
    final async = ref.watch(_sectorBestSetupsProvider(version));

    return Container(
      padding: const EdgeInsets.all(AppSpacing.s4),
      decoration: BoxDecoration(
        color: c.surfaceElevated,
        borderRadius: BorderRadius.circular(AppRadius.md),
        border: Border.all(color: c.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.donut_large_rounded, size: 18, color: c.accent),
              const SizedBox(width: AppSpacing.s2),
              Expanded(
                child: Text('Best Setups by Sector',
                    style: AppTypography.headingSm
                        .copyWith(color: c.textPrimary)),
              ),
              GestureDetector(
                onTap: () => _showSectorBestSetupsInfo(context),
                child: Icon(Icons.info_outline_rounded,
                    size: 16, color: c.textMuted),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.s2),
          Text(
            'Top stocks per sector in Leading & Improving RRG quadrants',
            style: AppTypography.xs.copyWith(color: c.textMuted),
          ),
          const SizedBox(height: AppSpacing.s4),
          Container(
            decoration: BoxDecoration(
              color: c.surfaceCard,
              borderRadius: BorderRadius.circular(AppRadius.md),
              border: Border.all(color: c.border),
            ),
            child: !isPro
                ? _BestSetupsLockedBody(c: c, context: context)
                : async.when(
                    loading: () => _BestSetupsLoadingBody(c: c),
                    error: (_, __) => Padding(
                      padding: const EdgeInsets.all(AppSpacing.s4),
                      child: Text('Unable to load sector setups',
                          style:
                              AppTypography.xs.copyWith(color: c.textMuted)),
                    ),
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
                      final hasLeading = resp.leading.isNotEmpty;
                      final hasImproving = resp.improving.isNotEmpty;
                      if (!hasLeading && !hasImproving) {
                        return Padding(
                          padding: const EdgeInsets.all(AppSpacing.s4),
                          child: Text(
                            'No leading or improving sectors with active setups right now.',
                            style: AppTypography.xs
                                .copyWith(color: c.textMuted),
                          ),
                        );
                      }
                      return Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          if (hasLeading) ...[
                            _QuadrantHeader(
                                label: 'LEADING', color: c.positive, c: c),
                            ...resp.leading.map(
                                (g) => _SectorGroup(group: g, c: c)),
                          ],
                          if (hasImproving) ...[
                            _QuadrantHeader(
                                label: 'IMPROVING', color: c.warning, c: c),
                            ...resp.improving.map(
                                (g) => _SectorGroup(group: g, c: c)),
                          ],
                        ],
                      );
                    },
                  ),
          ),
        ],
      ),
    );
  }
}

class _QuadrantHeader extends StatelessWidget {
  const _QuadrantHeader(
      {required this.label, required this.color, required this.c});
  final String label;
  final Color color;
  final AppPalette c;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding:
          const EdgeInsets.fromLTRB(AppSpacing.s4, AppSpacing.s4, AppSpacing.s4, AppSpacing.s2),
      child: Row(
        children: [
          Container(
            padding:
                const EdgeInsets.symmetric(horizontal: AppSpacing.s3, vertical: 2),
            decoration: BoxDecoration(
              color: color.withAlpha(22),
              borderRadius: BorderRadius.circular(AppRadius.xs),
              border: Border.all(color: color.withAlpha(70)),
            ),
            child: Text(
              label,
              style: AppTypography.xs.copyWith(
                  color: color,
                  fontWeight: FontWeight.w800,
                  letterSpacing: 0.8),
            ),
          ),
        ],
      ),
    );
  }
}

class _SectorGroup extends StatelessWidget {
  const _SectorGroup({required this.group, required this.c});
  final SectorBestSetupsGroup group;
  final AppPalette c;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          decoration: BoxDecoration(
            border: Border(top: BorderSide(color: c.border)),
          ),
          padding: const EdgeInsets.fromLTRB(
              AppSpacing.s4, AppSpacing.s3, AppSpacing.s4, AppSpacing.s2),
          child: Row(
            children: [
              Text(group.emoji, style: const TextStyle(fontSize: 14)),
              const SizedBox(width: AppSpacing.s2),
              Text(
                group.sector,
                style: AppTypography.labelSm
                    .copyWith(color: c.textPrimary, fontWeight: FontWeight.w700),
              ),
              const Spacer(),
              Text(
                '${group.stocks.length}',
                style: AppTypography.xs.copyWith(color: c.textMuted),
              ),
            ],
          ),
        ),
        ...group.stocks.map((s) => _SectorStockRow(entry: s, c: c)),
      ],
    );
  }
}

class _SectorStockRow extends StatelessWidget {
  const _SectorStockRow({required this.entry, required this.c});
  final SectorStockEntry entry;
  final AppPalette c;

  @override
  Widget build(BuildContext context) {
    final isUp = entry.changePercent >= 0;
    final changeColor = isUp ? c.positive : c.danger;

    return GestureDetector(
      onTap: () => context.push(
        '/asset/${Uri.encodeComponent(entry.symbol)}'
        '?name=${Uri.encodeComponent(entry.name)}',
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.s4, vertical: AppSpacing.s2),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    entry.name,
                    style: AppTypography.xs
                        .copyWith(color: c.textPrimary, fontWeight: FontWeight.w600),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 4, vertical: 1),
                        decoration: BoxDecoration(
                          color: c.surfaceCard,
                          borderRadius: BorderRadius.circular(AppRadius.xs),
                          border: Border.all(color: c.border),
                        ),
                        child: Text(
                          entry.symbol,
                          style: AppTypography.xs.copyWith(
                              color: c.textMuted,
                              fontSize: 9,
                              fontWeight: FontWeight.w700),
                        ),
                      ),
                      const SizedBox(width: 6),
                      ...List.generate(4, (i) => Padding(
                            padding: const EdgeInsets.only(right: 2),
                            child: Container(
                              width: 5,
                              height: 5,
                              decoration: BoxDecoration(
                                shape: BoxShape.circle,
                                color: i < entry.signalsActive
                                    ? c.accent
                                    : c.border,
                              ),
                            ),
                          )),
                      if (entry.winRate1m != null) ...[
                        const SizedBox(width: 4),
                        Text(
                          '${entry.winRate1m!.toStringAsFixed(0)}% 1m',
                          style: AppTypography.xs.copyWith(
                              color: entry.winRate1m! >= 65
                                  ? c.positive
                                  : entry.winRate1m! >= 50
                                      ? c.warning
                                      : c.danger,
                              fontSize: 9,
                              fontWeight: FontWeight.w600),
                        ),
                      ],
                    ],
                  ),
                ],
              ),
            ),
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(
                  '\$${entry.price < 1 ? entry.price.toStringAsFixed(4) : entry.price.toStringAsFixed(2)}',
                  style: AppTypography.xs
                      .copyWith(color: c.textPrimary, fontWeight: FontWeight.w600),
                ),
                Text(
                  '${isUp ? '+' : ''}${entry.changePercent.toStringAsFixed(2)}%',
                  style: AppTypography.xs.copyWith(color: changeColor),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

void _showSectorBestSetupsInfo(BuildContext context) {
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
      initialChildSize: 0.6,
      minChildSize: 0.4,
      maxChildSize: 0.92,
      builder: (ctx, scrollController) => ListView(
        controller: scrollController,
        padding: EdgeInsets.fromLTRB(AppSpacing.s5, AppSpacing.s5,
            AppSpacing.s5, AppSpacing.s8 + MediaQuery.of(ctx).padding.bottom),
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
              Icon(Icons.donut_large_rounded, size: 18, color: c.accent),
              const SizedBox(width: AppSpacing.s2),
              Expanded(
                child: Text('Best Setups by Sector',
                    style: AppTypography.headingMd
                        .copyWith(color: c.textPrimary)),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.s3),
          Text(
            'Shows stocks with at least one active 10X signal, grouped by sector — but only for sectors currently in the Leading or Improving RRG quadrant.',
            style:
                AppTypography.sm.copyWith(color: c.textSecondary, height: 1.55),
          ),
          const SizedBox(height: AppSpacing.s5),
          Text('RRG Quadrants',
              style: AppTypography.headingSm.copyWith(color: c.textPrimary)),
          const SizedBox(height: AppSpacing.s4),
          _BestSetupsInfoRow(
            c: c,
            label: 'Leading',
            body: 'Sector is outperforming the S&P 500 (RS Ratio > 100) AND gaining relative momentum (RS Momentum > 100). Strongest rotation zone.',
          ),
          const SizedBox(height: AppSpacing.s4),
          _BestSetupsInfoRow(
            c: c,
            label: 'Improving',
            body: 'Sector is underperforming vs S&P 500 (RS Ratio < 100) but its momentum is rising (RS Momentum > 100). Early-rotation zone — setups here can be early-stage.',
          ),
          const SizedBox(height: AppSpacing.s5),
          Text('Within each sector',
              style: AppTypography.headingSm.copyWith(color: c.textPrimary)),
          const SizedBox(height: AppSpacing.s4),
          _BestSetupsInfoRow(
            c: c,
            label: 'Signal dots',
            body: 'Filled dots = signals active right now (Volume Spike, Heartbeat, Record Quarter, Trend). More dots = stronger confluence.',
          ),
          const SizedBox(height: AppSpacing.s4),
          _BestSetupsInfoRow(
            c: c,
            label: '% 1m',
            body: 'Historical win rate over 1 month when this many signals were active. Green ≥ 65%, orange 50–64%, red below 50%.',
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
              'Sector quadrants are computed from 1-week and 1-month ETF performance relative to the S&P 500. They update every 15 minutes.',
              style: AppTypography.xs
                  .copyWith(color: c.textSecondary, height: 1.55),
            ),
          ),
        ],
      ),
    ),
  );
}

// ── Presidential Tab ──────────────────────────────────────────────────────────

class _PresidentialTab extends ConsumerStatefulWidget {
  const _PresidentialTab();

  @override
  ConsumerState<_PresidentialTab> createState() => _PresidentialTabState();
}

class _PresidentialTabState extends ConsumerState<_PresidentialTab> {
  String _type = 'All'; // All | Purchases | Sales
  String _sort = 'date'; // date | amount
  final _searchCtrl = TextEditingController();

  @override
  void initState() {
    super.initState();
    _searchCtrl.addListener(() => setState(() {}));
  }

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  void _retryAfterDelay() {
    Future.delayed(const Duration(seconds: 8), () {
      if (mounted) ref.invalidate(_trumpTransactionsProvider);
    });
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final async = ref.watch(_trumpTransactionsProvider);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          color: c.surface,
          padding: const EdgeInsets.fromLTRB(
              AppSpacing.s5, AppSpacing.s4, AppSpacing.s5, AppSpacing.s3),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Icon(Icons.account_circle_rounded, size: 16, color: c.warning),
                  const SizedBox(width: AppSpacing.s2),
                  Text(
                    'Trump Disclosures',
                    style: AppTypography.labelMd.copyWith(
                        color: c.textPrimary, fontWeight: FontWeight.w700),
                  ),
                  const Spacer(),
                  async.whenOrNull(
                        data: (r) => Text(
                          '${r.total} transactions',
                          style: AppTypography.xs.copyWith(color: c.textMuted),
                        ),
                      ) ??
                      const SizedBox.shrink(),
                ],
              ),
              const SizedBox(height: AppSpacing.s2),
              Text(
                'OGE Form 278-T · Transactions ≥ \$100K · Source: Office of Government Ethics',
                style: AppTypography.xs.copyWith(color: c.textFaint, height: 1.4),
              ),
              const SizedBox(height: AppSpacing.s1),
              async.whenOrNull(
                data: (r) {
                  final ts = r.lastUpdated.isNotEmpty ? _fmtRelative(r.lastUpdated) : null;
                  if (ts == null) return null;
                  return Row(
                    children: [
                      Icon(Icons.update_rounded, size: 11, color: c.textFaint),
                      const SizedBox(width: 4),
                      Text(
                        'Updated $ts',
                        style: AppTypography.xs.copyWith(color: c.textFaint, fontSize: 10),
                      ),
                    ],
                  );
                },
              ) ?? const SizedBox.shrink(),
              const SizedBox(height: AppSpacing.s3),
              _SearchField(
                controller: _searchCtrl,
                hint: 'Search asset or description…',
                c: c,
              ),
              const SizedBox(height: AppSpacing.s3),
              SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: Row(
                  children: [
                    Text('Type:', style: AppTypography.xs.copyWith(color: c.textMuted)),
                    const SizedBox(width: AppSpacing.s2),
                    for (final label in ['All', 'Purchases', 'Sales']) ...[
                      _FilterChip(
                        label: label,
                        active: _type == label,
                        onTap: () => setState(() => _type = label),
                      ),
                      if (label != 'Sales') const SizedBox(width: AppSpacing.s2),
                    ],
                    const SizedBox(width: AppSpacing.s5),
                    Text('Sort:', style: AppTypography.xs.copyWith(color: c.textMuted)),
                    const SizedBox(width: AppSpacing.s2),
                    _FilterChip(
                      label: 'Date ↓',
                      active: _sort == 'date',
                      onTap: () => setState(() => _sort = 'date'),
                    ),
                    const SizedBox(width: AppSpacing.s2),
                    _FilterChip(
                      label: 'Amount ↓',
                      active: _sort == 'amount',
                      onTap: () => setState(() => _sort = 'amount'),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
        Expanded(
          child: async.when(
            loading: () => _CongressTradesSkeleton(c: c),
            error: (_, __) => _PresidentialNoData(
              c: c,
              onRetry: () => ref.invalidate(_trumpTransactionsProvider),
            ),
            data: (resp) {
              // Server pipeline still running — show skeleton and auto-retry
              if (resp.loading) {
                _retryAfterDelay();
                return _PresidentialLoading(c: c);
              }

              final query = _searchCtrl.text.toLowerCase().trim();

              var filtered = resp.transactions.where((t) {
                if (_type == 'Purchases' && !t.isPurchase) return false;
                if (_type == 'Sales' && t.type != 'sale') return false;
                if (query.isNotEmpty) {
                  if (!t.description.toLowerCase().contains(query)) return false;
                }
                return true;
              }).toList();

              if (_sort == 'amount') {
                filtered.sort(
                    (a, b) => b.amountMidpoint.compareTo(a.amountMidpoint));
              }

              if (filtered.isEmpty) {
                return _PresidentialNoData(
                  c: c,
                  onRetry: () => ref.invalidate(_trumpTransactionsProvider),
                  message: resp.total == 0
                      ? 'No Data'
                      : 'No transactions match the current filter.',
                );
              }

              return RefreshIndicator(
                onRefresh: () =>
                    ref.refresh(_trumpTransactionsProvider.future),
                child: ListView.builder(
                  padding: EdgeInsets.only(
                    top: AppSpacing.s3,
                    bottom: AppSpacing.s5 +
                        MediaQuery.of(context).padding.bottom,
                  ),
                  itemCount: filtered.length,
                  itemBuilder: (_, i) =>
                      _PresidentialTransactionCard(tx: filtered[i]),
                ),
              );
            },
          ),
        ),
      ],
    );
  }
}

// ── Presidential Transaction Card ─────────────────────────────────────────────

class _PresidentialTransactionCard extends StatelessWidget {
  const _PresidentialTransactionCard({required this.tx});

  final OgeTransaction tx;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final isBuy = tx.isPurchase;
    final typeColor = isBuy ? c.positive : c.danger;
    final amountColor = _amountColor(tx.amountMidpoint, c);

    return GlassCard(
      margin: const EdgeInsets.symmetric(
          horizontal: AppSpacing.s5, vertical: AppSpacing.s2),
      padding: const EdgeInsets.all(AppSpacing.s4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Row 1: description · type badge
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Text(
                  tx.description,
                  style: AppTypography.labelMd.copyWith(
                      color: c.textPrimary, fontWeight: FontWeight.w700),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              const SizedBox(width: AppSpacing.s2),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
                decoration: BoxDecoration(
                  color: typeColor.withAlpha(25),
                  borderRadius: BorderRadius.circular(AppRadius.full),
                  border: Border.all(color: typeColor.withAlpha(80)),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(
                      isBuy
                          ? Icons.arrow_upward_rounded
                          : Icons.arrow_downward_rounded,
                      size: 10,
                      color: typeColor,
                    ),
                    const SizedBox(width: 3),
                    Text(
                      isBuy
                          ? (tx.type == 'exchange' ? 'EXCHANGE' : 'PURCHASE')
                          : 'SALE',
                      style: AppTypography.xs.copyWith(
                          color: typeColor, fontWeight: FontWeight.w800),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.s3),
          // Row 2: amount badge · spacer · dates
          Row(
            children: [
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
                decoration: BoxDecoration(
                  color: amountColor.withAlpha(20),
                  borderRadius: BorderRadius.circular(AppRadius.full),
                  border: Border.all(color: amountColor.withAlpha(65)),
                ),
                child: Text(
                  tx.amount.isNotEmpty ? tx.amount : '—',
                  style: AppTypography.xs.copyWith(
                      color: amountColor, fontWeight: FontWeight.w700),
                ),
              ),
              const Spacer(),
              if (tx.date.isNotEmpty) ...[
                Icon(Icons.swap_horiz_rounded, size: 12, color: c.textFaint),
                const SizedBox(width: 4),
                Text(
                  _fmtDate(tx.date),
                  style: AppTypography.xs.copyWith(color: c.textMuted),
                ),
              ],
            ],
          ),
          if (tx.filingDate.isNotEmpty) ...[
            const SizedBox(height: AppSpacing.s2),
            Row(
              children: [
                Icon(Icons.description_outlined, size: 11, color: c.textFaint),
                const SizedBox(width: 4),
                Text(
                  'Filed ${_fmtDate(tx.filingDate)}',
                  style:
                      AppTypography.xs.copyWith(color: c.textFaint),
                ),
                if (tx.source.isNotEmpty) ...[
                  Text('  ·  ',
                      style: AppTypography.xs.copyWith(color: c.textFaint)),
                  Expanded(
                    child: Text(
                      tx.source,
                      style: AppTypography.xs.copyWith(
                          color: c.textFaint,
                          fontStyle: FontStyle.italic),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                ],
              ],
            ),
          ],
        ],
      ),
    );
  }

  Color _amountColor(double mid, AppPalette c) {
    if (mid >= 5000000) return c.danger;
    if (mid >= 1000000) return c.warning;
    if (mid >= 500000)  return c.positive;
    return c.accent;
  }

  String _fmtDate(String iso) {
    if (iso.length < 10) return iso;
    try {
      final dt = DateTime.parse(iso);
      const months = [
        'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
        'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
      ];
      return '${months[dt.month - 1]} ${dt.day}, ${dt.year}';
    } catch (_) {
      return iso;
    }
  }
}

// ── Presidential Loading (server pipeline still running) ─────────────────────

class _PresidentialLoading extends StatelessWidget {
  const _PresidentialLoading({required this.c});
  final AppPalette c;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.s8),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            SizedBox(
              width: 36,
              height: 36,
              child: CircularProgressIndicator(
                strokeWidth: 2.5,
                color: c.accent,
              ),
            ),
            const SizedBox(height: AppSpacing.s5),
            Text(
              'Fetching Disclosures',
              style: AppTypography.headingSm.copyWith(color: c.textSecondary),
            ),
            const SizedBox(height: AppSpacing.s2),
            Text(
              'Downloading OGE Form 278-T filings in the background. This takes about a minute on first load.',
              style: AppTypography.xs
                  .copyWith(color: c.textMuted, height: 1.5),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }
}

// ── Presidential No Data / Error ──────────────────────────────────────────────

class _PresidentialNoData extends StatelessWidget {
  const _PresidentialNoData({
    required this.c,
    required this.onRetry,
    this.message = 'No Data',
  });

  final AppPalette c;
  final VoidCallback onRetry;
  final String message;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.s8),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.account_circle_outlined, size: 40, color: c.textFaint),
            const SizedBox(height: AppSpacing.s4),
            Text(
              message,
              style: AppTypography.headingSm.copyWith(color: c.textSecondary),
              textAlign: TextAlign.center,
            ),
            if (message == 'No Data') ...[
              const SizedBox(height: AppSpacing.s2),
              Text(
                'OGE Form 278-T transaction data is currently unavailable. The pipeline scrapes disclosures from the Office of Government Ethics.',
                style: AppTypography.xs.copyWith(
                    color: c.textMuted, height: 1.5),
                textAlign: TextAlign.center,
              ),
            ],
            const SizedBox(height: AppSpacing.s5),
            GestureDetector(
              onTap: onRetry,
              child: Container(
                padding: const EdgeInsets.symmetric(
                    horizontal: AppSpacing.s5, vertical: AppSpacing.s3),
                decoration: BoxDecoration(
                  border: Border.all(color: c.border),
                  borderRadius: BorderRadius.circular(AppRadius.full),
                ),
                child: Text('Retry',
                    style: AppTypography.xs.copyWith(color: c.textSecondary)),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ── Smart $ Tab ───────────────────────────────────────────────────────────────

class _QuiverTab extends ConsumerStatefulWidget {
  const _QuiverTab();
  @override
  ConsumerState<_QuiverTab> createState() => _QuiverTabState();
}

class _QuiverTabState extends ConsumerState<_QuiverTab> {
  int _strategy = 0; // 0=Congress, 1=Lobbying, 2=Insider

  AsyncValue<QuiverScanResponse> get _async {
    return switch (_strategy) {
      1 => ref.watch(_quiverLobbyingProvider),
      2 => ref.watch(_quiverInsiderProvider),
      _ => ref.watch(_quiverCongressProvider),
    };
  }

  Future<void> _refresh() {
    return switch (_strategy) {
      1 => ref.refresh(_quiverLobbyingProvider.future),
      2 => ref.refresh(_quiverInsiderProvider.future),
      _ => ref.refresh(_quiverCongressProvider.future),
    };
  }

  void _invalidate() {
    switch (_strategy) {
      case 1:
        ref.invalidate(_quiverLobbyingProvider);
      case 2:
        ref.invalidate(_quiverInsiderProvider);
      default:
        ref.invalidate(_quiverCongressProvider);
    }
  }

  static const _strategies = [
    ('Congress Buys', Icons.account_balance_rounded),
    ('Lobbying Growth', Icons.trending_up_rounded),
    ('Insider Buys', Icons.person_pin_rounded),
  ];

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final async = _async;

    return MaxWidthLayout(
      child: Column(
        children: [
          Container(
            color: c.surface,
            padding: const EdgeInsets.fromLTRB(
                AppSpacing.s5, AppSpacing.s4, AppSpacing.s4, AppSpacing.s3),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Icon(Icons.currency_exchange_rounded,
                        size: 16, color: c.warning),
                    const SizedBox(width: AppSpacing.s2),
                    Expanded(
                      child: Text('Smart Money Signals',
                          style: AppTypography.labelMd.copyWith(
                              color: c.textPrimary,
                              fontWeight: FontWeight.w700)),
                    ),
                    GestureDetector(
                      onTap: () => _showQuiverInfo(context),
                      child: Icon(Icons.info_outline_rounded,
                          size: 16, color: c.textMuted),
                    ),
                  ],
                ),
                const SizedBox(height: AppSpacing.s2),
                Text(
                    'Track where institutional money is flowing before the crowd',
                    style: AppTypography.xs.copyWith(color: c.textMuted)),
                const SizedBox(height: AppSpacing.s4),
                SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(
                    children: [
                      for (int i = 0; i < _strategies.length; i++) ...[
                        _QuiverStrategyChip(
                          label: _strategies[i].$1,
                          icon: _strategies[i].$2,
                          selected: _strategy == i,
                          onTap: () => setState(() => _strategy = i),
                          c: c,
                        ),
                        if (i < _strategies.length - 1)
                          const SizedBox(width: AppSpacing.s2),
                      ],
                    ],
                  ),
                ),
              ],
            ),
          ),
          const Divider(height: 1),
          Expanded(
            child: async.when(
              loading: () => _QuiverSkeleton(c: c),
              error: (_, __) => ErrorView(
                message: 'Unable to load data',
                onRetry: _invalidate,
              ),
              data: (resp) {
                if (resp.items.isEmpty) {
                  return Center(
                    child: Padding(
                      padding: const EdgeInsets.all(AppSpacing.s8),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(Icons.sensors_rounded,
                              size: 36, color: c.textMuted),
                          const SizedBox(height: AppSpacing.s4),
                          Text('No data available',
                              style: AppTypography.sm
                                  .copyWith(color: c.textMuted)),
                          const SizedBox(height: AppSpacing.s2),
                          Text('Live data is being fetched. Check back shortly.',
                              style: AppTypography.xs
                                  .copyWith(color: c.textMuted),
                              textAlign: TextAlign.center),
                        ],
                      ),
                    ),
                  );
                }
                return RefreshIndicator(
                  onRefresh: _refresh,
                  child: ListView.separated(
                    padding: EdgeInsets.only(
                      top: AppSpacing.s3,
                      bottom:
                          AppSpacing.s3 + MediaQuery.of(context).padding.bottom,
                    ),
                    itemCount: resp.items.length,
                    separatorBuilder: (_, __) =>
                        Divider(height: 1, color: c.border),
                    itemBuilder: (_, i) => _QuiverItemRow(item: resp.items[i]),
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }

  void _showQuiverInfo(BuildContext context) {
    final c = context.colors;
    showModalBottomSheet(
      context: context,
      backgroundColor: c.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      isScrollControlled: true,
      builder: (_) => DraggableScrollableSheet(
        initialChildSize: 0.65,
        maxChildSize: 0.9,
        minChildSize: 0.4,
        expand: false,
        builder: (_, sc) => ListView(
          controller: sc,
          padding: const EdgeInsets.fromLTRB(
              AppSpacing.s5, AppSpacing.s4, AppSpacing.s5, AppSpacing.s6),
          children: [
            Center(
              child: Container(
                width: 36,
                height: 4,
                margin: const EdgeInsets.only(bottom: AppSpacing.s4),
                decoration: BoxDecoration(
                  color: c.border,
                  borderRadius: BorderRadius.circular(AppRadius.full),
                ),
              ),
            ),
            Text('How Smart Money Works',
                style: AppTypography.headingSm
                    .copyWith(color: c.textPrimary)),
            const SizedBox(height: AppSpacing.s2),
            Text(
                'Three data-driven portfolios built from public disclosure data — tracking money flows before markets react.',
                style: AppTypography.xs
                    .copyWith(color: c.textMuted, height: 1.6)),
            const SizedBox(height: AppSpacing.s5),
            _QuiverInfoBlock(
              icon: Icons.account_balance_rounded,
              color: c.accent,
              label: 'S1',
              title: 'Congress Buys',
              rule: 'Top-10 tickers by aggregate STOCK Act disclosed purchase amount (12-month window)',
              explanation:
                  'US senators and representatives must disclose trades within 30-45 days. This strategy ranks stocks by the total disclosed purchase value from all members, surfacing names that insiders in government are accumulating.',
              examples: 'NVDA, MSFT, TSM',
              c: c,
            ),
            const SizedBox(height: AppSpacing.s5),
            _QuiverInfoBlock(
              icon: Icons.trending_up_rounded,
              color: c.warning,
              label: 'S2',
              title: 'Lobbying Growth',
              rule: 'Top-10 by largest QoQ increase in Senate LDA lobbying spend',
              explanation:
                  'Companies ramping up lobbying signal upcoming regulatory battles, government contracts, or legislative tailwinds. A sharp spending surge often precedes policy moves that benefit that company\'s sector.',
              examples: 'AMZN, META, GOOGL',
              c: c,
            ),
            const SizedBox(height: AppSpacing.s5),
            _QuiverInfoBlock(
              icon: Icons.person_pin_rounded,
              color: c.danger,
              label: 'S3',
              title: 'Insider Buys',
              rule: 'Top-10 by insider Form 4 buy count via SEC EDGAR (90-day window)',
              explanation:
                  'Corporate insiders (officers, directors, 10%+ holders) must file Form 4 when they trade their own company\'s stock. Clusters of insider purchases are a strong signal of management confidence in near-term prospects.',
              examples: 'PLTR, META, NVDA',
              c: c,
            ),
          ],
        ),
      ),
    );
  }
}

// ── Quiver Strategy Chip ──────────────────────────────────────────────────────

class _QuiverStrategyChip extends StatelessWidget {
  const _QuiverStrategyChip({
    required this.label,
    required this.icon,
    required this.selected,
    required this.onTap,
    required this.c,
  });

  final String label;
  final IconData icon;
  final bool selected;
  final VoidCallback onTap;
  final AppPalette c;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 150),
        padding:
            const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        decoration: BoxDecoration(
          color: selected ? c.accent.withAlpha(25) : c.surfaceCard,
          borderRadius: BorderRadius.circular(AppRadius.full),
          border: Border.all(
              color: selected ? c.accent : c.border, width: 1),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon,
                size: 13, color: selected ? c.accent : c.textMuted),
            const SizedBox(width: 5),
            Text(label,
                style: AppTypography.xs.copyWith(
                    color: selected ? c.accent : c.textSecondary,
                    fontWeight:
                        selected ? FontWeight.w600 : FontWeight.w400)),
          ],
        ),
      ),
    );
  }
}

// ── Quiver Item Row ───────────────────────────────────────────────────────────

class _QuiverItemRow extends StatelessWidget {
  const _QuiverItemRow({required this.item});
  final QuiverScanItem item;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final isUp = (item.changePercent ?? 0) >= 0;
    final changeColor = isUp ? c.accent : c.danger;

    return GestureDetector(
      onTap: () => context.push('/asset/${item.symbol}?name=${Uri.encodeComponent(item.name)}'),
      child: Padding(
        padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.s5, vertical: AppSpacing.s4),
        child: Row(
          children: [
            // Rank
            SizedBox(
              width: 24,
              child: Text('${item.rank}',
                  style: AppTypography.xs.copyWith(
                      color: c.textMuted, fontWeight: FontWeight.w600)),
            ),
            const SizedBox(width: AppSpacing.s3),
            // Weight bar
            Container(
              width: 3,
              height: 32,
              decoration: BoxDecoration(
                color: c.accent.withAlpha(
                    (item.weight * 255).clamp(30, 200).round()),
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            const SizedBox(width: AppSpacing.s3),
            // Symbol + name
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(item.symbol,
                      style: AppTypography.labelMd.copyWith(
                          color: c.textPrimary,
                          fontWeight: FontWeight.w700)),
                  const SizedBox(height: 2),
                  Text(item.name,
                      style: AppTypography.xs.copyWith(color: c.textMuted),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis),
                ],
              ),
            ),
            const SizedBox(width: AppSpacing.s3),
            // Badge
            Container(
              padding:
                  const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
              decoration: BoxDecoration(
                color: c.accentDim18,
                borderRadius: BorderRadius.circular(AppRadius.full),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(item.badge,
                      style: AppTypography.xs.copyWith(
                          color: c.accent, fontWeight: FontWeight.w700)),
                  Text(item.badgeLabel,
                      style: AppTypography.xs.copyWith(
                          color: c.textMuted, fontSize: 9)),
                ],
              ),
            ),
            const SizedBox(width: AppSpacing.s3),
            // Price + change
            if (item.price != null)
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text('\$${item.price!.toStringAsFixed(item.price! >= 100 ? 0 : 2)}',
                      style: AppTypography.labelSm
                          .copyWith(color: c.textPrimary)),
                  if (item.changePercent != null)
                    Text(
                        '${isUp ? '+' : ''}${item.changePercent!.toStringAsFixed(2)}%',
                        style: AppTypography.xs
                            .copyWith(color: changeColor, fontSize: 10)),
                ],
              ),
          ],
        ),
      ),
    );
  }
}

// ── Quiver Skeleton ───────────────────────────────────────────────────────────

class _QuiverSkeleton extends StatelessWidget {
  const _QuiverSkeleton({required this.c});
  final AppPalette c;

  @override
  Widget build(BuildContext context) {
    return ListView.separated(
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.s3),
      itemCount: 8,
      separatorBuilder: (_, __) => Divider(height: 1, color: c.border),
      itemBuilder: (_, __) => Padding(
        padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.s5, vertical: AppSpacing.s4),
        child: Row(
          children: [
            Container(
                width: 24,
                height: 12,
                decoration: BoxDecoration(
                    color: c.border,
                    borderRadius: BorderRadius.circular(4))),
            const SizedBox(width: AppSpacing.s3),
            Container(
                width: 3,
                height: 32,
                decoration: BoxDecoration(
                    color: c.border,
                    borderRadius: BorderRadius.circular(2))),
            const SizedBox(width: AppSpacing.s3),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                      width: 56,
                      height: 14,
                      decoration: BoxDecoration(
                          color: c.border,
                          borderRadius: BorderRadius.circular(4))),
                  const SizedBox(height: 4),
                  Container(
                      width: 120,
                      height: 10,
                      decoration: BoxDecoration(
                          color: c.border.withAlpha(120),
                          borderRadius: BorderRadius.circular(4))),
                ],
              ),
            ),
            Container(
                width: 56,
                height: 28,
                decoration: BoxDecoration(
                    color: c.border,
                    borderRadius: BorderRadius.circular(AppRadius.full))),
            const SizedBox(width: AppSpacing.s3),
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Container(
                    width: 48,
                    height: 12,
                    decoration: BoxDecoration(
                        color: c.border,
                        borderRadius: BorderRadius.circular(4))),
                const SizedBox(height: 4),
                Container(
                    width: 36,
                    height: 10,
                    decoration: BoxDecoration(
                        color: c.border.withAlpha(120),
                        borderRadius: BorderRadius.circular(4))),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

// ── Quiver Info Block ─────────────────────────────────────────────────────────

class _QuiverInfoBlock extends StatelessWidget {
  const _QuiverInfoBlock({
    required this.icon,
    required this.color,
    required this.label,
    required this.title,
    required this.rule,
    required this.explanation,
    required this.examples,
    required this.c,
  });

  final IconData icon;
  final Color color;
  final String label;
  final String title;
  final String rule;
  final String explanation;
  final String examples;
  final AppPalette c;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
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
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
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
              const SizedBox(height: 6),
              Text(title,
                  style:
                      AppTypography.labelMd.copyWith(color: c.textPrimary)),
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
                      child: Text(rule,
                          style: AppTypography.xs.copyWith(
                              color: c.textPrimary,
                              height: 1.5,
                              fontWeight: FontWeight.w600)),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: AppSpacing.s3),
              Text(explanation,
                  style: AppTypography.xs
                      .copyWith(color: c.textSecondary, height: 1.6)),
              const SizedBox(height: AppSpacing.s3),
              Text('Examples: $examples',
                  style: AppTypography.xs.copyWith(
                      color: c.textMuted,
                      height: 1.5,
                      fontStyle: FontStyle.italic)),
            ],
          ),
        ),
      ],
    );
  }
}
