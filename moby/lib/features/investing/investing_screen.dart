import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme/app_palette.dart';
import '../../core/theme/app_typography.dart';
import '../../core/theme/app_spacing.dart';
import '../../data/models/movers_data.dart';
import '../../data/models/trading_signal.dart';
import '../../data/models/treemap_stock.dart';
import '../../data/repositories/heatmap_repository.dart';
import '../../data/repositories/trading_repository.dart';
import '../../services/entitlement_service.dart';
import '../../shared/widgets/app_logo_badge.dart';
import '../../shared/widgets/error_view.dart';
import '../../shared/widgets/freshness_bar.dart';
import '../../shared/widgets/glass_card.dart';
import '../../shared/widgets/max_width_layout.dart';
import '../exposure/exposure_screen.dart';
import 'best_setups_card.dart';
import 'multibaggers_screen.dart';
import 'earnings_calendar_tab.dart';
import 'etf_explorer_tab.dart';

// ── Providers ─────────────────────────────────────────────────────────────────

// keepAlive everywhere: server TTLs are 30m–24h; tab switches within a session
// should not refetch. Repositories already cache; this just stops Riverpod from
// disposing the cached future on tab navigation.

// Tracks how many times we've polled while the server cache is still warming.
// Capped via _maxSectorPolls so a permanently-blocked upstream doesn't trigger
// indefinite polling.
final _sectorPollAttemptProvider = StateProvider.family<int, String>((_, __) => 0);
const _maxSectorPolls = 10; // 10 × 30s = 5 min ceiling

final _sectorBestSetupsProvider =
    FutureProvider.autoDispose.family<SectorBestSetupsResponse, String>(
  (ref, version) async {
    ref.keepAlive();
    final resp =
        await TradingRepository.instance.fetchSectorBestSetups(version: version);

    if (!resp.cacheWarm) {
      // Server is still computing — schedule a re-fetch in 30s so the UI shows
      // real data the moment the server finishes, without the user having to
      // manually pull-to-refresh.
      final attempt = ref.read(_sectorPollAttemptProvider(version));
      if (attempt < _maxSectorPolls) {
        final timer = Timer(const Duration(seconds: 30), () {
          ref.read(_sectorPollAttemptProvider(version).notifier).state =
              attempt + 1;
          // Clear the repository's cached `cacheWarm:false` entry so the next
          // fetch actually hits the server again. (Repository only stores warm
          // entries, but invalidating is a no-op when there's nothing cached.)
          TradingRepository.instance.clearBestSectorCache(version);
          ref.invalidateSelf();
        });
        ref.onDispose(timer.cancel);
      }
    } else {
      // Reset counter once warm so a future cache expiry restarts the budget.
      ref.read(_sectorPollAttemptProvider(version).notifier).state = 0;
    }

    return resp;
  },
);

final _trumpTransactionsProvider =
    FutureProvider.autoDispose<OgeTransactionsResponse>((ref) {
  ref.keepAlive(); // 24h server TTL (OGE PDF pipeline)
  return TradingRepository.instance.fetchTrumpTransactions();
});

final _quiverLobbyingProvider = FutureProvider.autoDispose<QuiverScanResponse>((ref) {
  ref.keepAlive(); // 4h server TTL
  return TradingRepository.instance.fetchQuiverLobbying();
});

final _quiverInsiderProvider = FutureProvider.autoDispose<QuiverScanResponse>((ref) {
  ref.keepAlive(); // 2h server TTL
  return TradingRepository.instance.fetchQuiverInsider();
});

final _moversProvider =
    FutureProvider.autoDispose.family<MoversData, String>((ref, index) {
  ref.keepAlive(); // 5m server TTL — keep across tab switches
  return HeatmapRepository.instance.fetchMovers(index: index);
});

final _institutionalFlowProvider =
    FutureProvider.autoDispose.family<InstitutionalFlowResult, String>(
        (ref, type) {
  ref.keepAlive(); // 30m server TTL
  return TradingRepository.instance.fetchInstitutionalFlow(type);
});

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
    _tab = TabController(length: 7, vsync: this);
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
        centerTitle: true,
        leading: const AppLogoBadge(),
        title: Text('Investing',
            style: AppTypography.headingLg
                .copyWith(color: c.textPrimary, fontWeight: FontWeight.w800)),
        backgroundColor: c.headerBg,
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
            Tab(text: 'Smart \$'),
            Tab(text: 'Earnings Calendar'),
            Tab(text: 'ETFs'),
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
          _QuiverTab(),
          EarningsCalendarTab(),
          EtfExplorerTab(),
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
  static const String _type = 'stocks';

  @override
  void initState() {
    super.initState();
    // Pre-warm the default combination and sector card so they are already
    // cached or in-flight by the time the user looks at the tab.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      TradingRepository.instance
          .fetchBestSetups(version: 'v1', type: _type)
          .ignore();
      TradingRepository.instance
          .fetchSectorBestSetups(version: 'v1')
          .ignore();
    });
  }

  @override
  Widget build(BuildContext context) {
    return MaxWidthLayout(
      child: ListView(
        padding: EdgeInsets.fromLTRB(
          AppSpacing.s5,
          AppSpacing.s5,
          AppSpacing.s5,
          AppSpacing.s5 + MediaQuery.of(context).padding.bottom,
        ),
        children: [
          const _MoversCard(),
          const SizedBox(height: AppSpacing.s5),
          BestSetupsCard(
            type: _type,
            version: _version,
            onVersionChanged: (v) => setState(() => _version = v),
          ),
          const SizedBox(height: AppSpacing.s5),
          _SectorBestSetupsCard(version: _version),
          const SizedBox(height: AppSpacing.s5),
          const _InstitutionalFlowCard(),
        ],
      ),
    );
  }
}

// ── Institutional Flow Card ───────────────────────────────────────────────────

class _InstitutionalFlowCard extends ConsumerStatefulWidget {
  const _InstitutionalFlowCard();

  @override
  ConsumerState<_InstitutionalFlowCard> createState() =>
      _InstitutionalFlowCardState();
}

class _InstitutionalFlowCardState
    extends ConsumerState<_InstitutionalFlowCard> {
  static const List<({String id, String label})> _tabs = [
    (id: 'accumulation', label: 'Accumulation'),
    (id: 'distribution', label: 'Distribution'),
    (id: 'vwap', label: 'VWAP Break'),
    (id: 'obv', label: 'OBV Divergence'),
    (id: 'short', label: 'Short Squeeze'),
    (id: 'insider', label: 'Insider Clusters'),
  ];
  String _selected = 'accumulation';

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final isPro = EntitlementService.can('best_setups');
    final async = ref.watch(_institutionalFlowProvider(_selected));

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
              Icon(Icons.account_balance_wallet_rounded,
                  size: 18, color: c.accent),
              const SizedBox(width: AppSpacing.s2),
              Expanded(
                child: Text(
                  'Institutional Flow',
                  style: AppTypography.headingSm.copyWith(color: c.textPrimary),
                ),
              ),
              GestureDetector(
                onTap: () => _showFlowInfo(context),
                child: Icon(Icons.info_outline_rounded,
                    size: 16, color: c.textMuted),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.s2),
          Text(
            'Top 10 US stocks showing institutional buying, selling, or squeeze pressure',
            style: AppTypography.xs.copyWith(color: c.textMuted),
          ),
          const SizedBox(height: AppSpacing.s4),
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                for (var i = 0; i < _tabs.length; i++) ...[
                  _FilterChip(
                    label: _tabs[i].label,
                    active: _selected == _tabs[i].id,
                    onTap: () => setState(() => _selected = _tabs[i].id),
                  ),
                  if (i < _tabs.length - 1) const SizedBox(width: AppSpacing.s2),
                ],
              ],
            ),
          ),
          const SizedBox(height: AppSpacing.s4),
          Container(
            decoration: BoxDecoration(
              color: c.surfaceCard,
              borderRadius: BorderRadius.circular(AppRadius.md),
              border: Border.all(color: c.border),
            ),
            child: !isPro
                ? BestSetupsLockedBody(c: c, context: context)
                : async.when(
                    loading: () => BestSetupsLoadingBody(c: c),
                    error: (_, __) => Padding(
                      padding: const EdgeInsets.all(AppSpacing.s4),
                      child: Text(
                        'Unable to load institutional flow data',
                        style: AppTypography.xs.copyWith(color: c.textMuted),
                      ),
                    ),
                    data: (resp) => resp.assets.isEmpty
                        ? Padding(
                            padding: const EdgeInsets.all(AppSpacing.s4),
                            child: Text(
                              'No stocks match the current filter right now.',
                              style:
                                  AppTypography.xs.copyWith(color: c.textMuted),
                            ),
                          )
                        : Column(
                            children: resp.assets
                                .map((s) => _FlowStockRow(
                                      stock: s,
                                      type: _selected,
                                      c: c,
                                    ))
                                .toList(),
                          ),
                  ),
          ),
          if (isPro)
            async.whenOrNull(
                  data: (resp) => Padding(
                    padding: const EdgeInsets.only(top: AppSpacing.s2),
                    child: FreshnessBar(lastUpdated: resp.lastUpdated),
                  ),
                ) ??
                const SizedBox.shrink(),
        ],
      ),
    );
  }

  void _showFlowInfo(BuildContext context) {
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
        builder: (ctx, sc) => ListView(
          controller: sc,
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
                    borderRadius: BorderRadius.circular(2)),
              ),
            ),
            const SizedBox(height: AppSpacing.s5),
            Row(children: [
              Icon(Icons.account_balance_wallet_rounded,
                  size: 18, color: c.accent),
              const SizedBox(width: AppSpacing.s2),
              Expanded(
                child: Text('Institutional Flow',
                    style: AppTypography.headingMd
                        .copyWith(color: c.textPrimary)),
              ),
            ]),
            const SizedBox(height: AppSpacing.s3),
            Text(
              'Detects price, volume, short-interest, and insider-filing patterns consistent with large institutional positioning — often before the move is obvious.',
              style:
                  AppTypography.sm.copyWith(color: c.textSecondary, height: 1.55),
            ),
            const SizedBox(height: AppSpacing.s5),
            BestSetupsInfoRow(
              c: c,
              label: 'Accumulation',
              body:
                  'Rising price + volumeRatio ≥ 2.0. Institutions buying into strength.',
            ),
            const SizedBox(height: AppSpacing.s4),
            BestSetupsInfoRow(
              c: c,
              label: 'Distribution',
              body:
                  'Falling price + volumeRatio ≥ 2.0. Institutions selling into weakness.',
            ),
            const SizedBox(height: AppSpacing.s4),
            BestSetupsInfoRow(
              c: c,
              label: 'VWAP Break',
              body:
                  'Price deviates ≥ 1.5% from the 20-day VWAP AND volumeRatio ≥ 3.0. Strong directional conviction from large players.',
            ),
            const SizedBox(height: AppSpacing.s4),
            BestSetupsInfoRow(
              c: c,
              label: 'OBV Divergence',
              body:
                  'On-Balance Volume rising over 14 days while price stays flat or down — volume flowing in before the price confirms. Quiet accumulation.',
            ),
            const SizedBox(height: AppSpacing.s4),
            BestSetupsInfoRow(
              c: c,
              label: 'Short Squeeze',
              body:
                  '≥ 10% of the float sold short while the price is already rising. Shorts forced to cover add fuel to the move. "SI" = short interest; "cover" = days to cover at average volume.',
            ),
            const SizedBox(height: AppSpacing.s4),
            BestSetupsInfoRow(
              c: c,
              label: 'Insider Clusters',
              body:
                  'Two or more different insiders filed SEC Form 4s on the same stock within 30 days. Multiple insiders acting together is a far stronger signal than a single filing.',
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
                'volumeRatio = today\'s volume ÷ 3-month average daily volume. '
                'A ratio of 2.0 means today\'s volume is twice the normal level.',
                style: AppTypography.xs
                    .copyWith(color: c.textSecondary, height: 1.55),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _FlowStockRow extends StatelessWidget {
  const _FlowStockRow({
    required this.stock,
    required this.type,
    required this.c,
  });

  final InstitutionalFlowStock stock;
  final String type;
  final AppPalette c;

  Widget _miniBadge(String text, Color color) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 2),
        decoration: BoxDecoration(
          color: color.withAlpha(18),
          borderRadius: BorderRadius.circular(AppRadius.xs),
          border: Border.all(color: color.withAlpha(55)),
        ),
        child: Text(
          text,
          style: AppTypography.xs.copyWith(
            color: color,
            fontSize: 9,
            fontWeight: FontWeight.w700,
          ),
        ),
      );

  List<Widget> _typeBadges() {
    final badges = <Widget>[];
    if (stock.volumeRatio > 0) {
      badges.add(_miniBadge(
          '${stock.volumeRatio.toStringAsFixed(1)}× vol', c.accent));
    }
    switch (type) {
      case 'vwap':
        final d = stock.vwapDeviation;
        if (d != null) {
          badges.add(_miniBadge(
            '${d >= 0 ? '+' : ''}${d.toStringAsFixed(1)}% VWAP',
            d >= 0 ? c.positive : c.danger,
          ));
        }
      case 'obv':
        final slope = stock.obvSlopeRatio;
        if (slope != null) {
          badges.add(_miniBadge('OBV +${slope.toStringAsFixed(1)}d', c.accent));
        }
        final pc = stock.periodChangePercent;
        if (pc != null) {
          badges.add(_miniBadge(
            '${pc >= 0 ? '+' : ''}${pc.toStringAsFixed(1)}% 14d',
            pc >= 0 ? c.positive : c.danger,
          ));
        }
      case 'short':
        final si = stock.shortPercentFloat;
        if (si != null) {
          badges.add(_miniBadge('${si.toStringAsFixed(1)}% SI', c.warning));
        }
        final cover = stock.shortRatio;
        if (cover != null) {
          badges.add(
              _miniBadge('${cover.toStringAsFixed(1)}d cover', c.textMuted));
        }
      case 'insider':
        final n = stock.insiderCount;
        if (n != null) {
          badges.add(_miniBadge('$n insiders', c.accent));
        }
        final f = stock.filingCount;
        if (f != null && n != null && f > n) {
          badges.add(_miniBadge('$f filings', c.textMuted));
        }
    }
    return badges;
  }

  @override
  Widget build(BuildContext context) {
    final isUp = stock.changePercent >= 0;
    final changeColor = isUp ? c.positive : c.danger;
    final changeText =
        '${isUp ? '+' : ''}${stock.changePercent.toStringAsFixed(2)}%';
    final priceText = stock.price < 1
        ? '\$${stock.price.toStringAsFixed(4)}'
        : '\$${stock.price.toStringAsFixed(2)}';

    return GestureDetector(
      onTap: () => context.push(
        '/asset/${Uri.encodeComponent(stock.symbol)}'
        '?name=${Uri.encodeComponent(stock.name)}',
      ),
      child: Container(
        decoration: BoxDecoration(
          border: Border(top: BorderSide(color: c.border)),
        ),
        padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.s4, vertical: AppSpacing.s3),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Wrap(
                    spacing: AppSpacing.s2,
                    runSpacing: 3,
                    crossAxisAlignment: WrapCrossAlignment.center,
                    children: [
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 5, vertical: 2),
                        decoration: BoxDecoration(
                          color: c.surfaceElevated,
                          borderRadius: BorderRadius.circular(AppRadius.xs),
                          border: Border.all(color: c.border),
                        ),
                        child: Text(
                          stock.symbol,
                          style: AppTypography.xs.copyWith(
                            color: c.textPrimary,
                            fontWeight: FontWeight.w700,
                            letterSpacing: 0.3,
                          ),
                        ),
                      ),
                      ..._typeBadges(),
                    ],
                  ),
                  const SizedBox(height: 3),
                  Text(
                    stock.name,
                    style: AppTypography.xs.copyWith(
                      color: c.textSecondary,
                      fontWeight: FontWeight.w500,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ],
              ),
            ),
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(
                  priceText,
                  style: AppTypography.xs.copyWith(
                    color: c.textPrimary,
                    fontWeight: FontWeight.w600,
                    fontFeatures: const [FontFeature.tabularFigures()],
                  ),
                ),
                Text(
                  changeText,
                  style: AppTypography.xs.copyWith(
                    color: changeColor,
                    fontWeight: FontWeight.w600,
                    fontFeatures: const [FontFeature.tabularFigures()],
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

// ── Movers Card (Pre/Regular/Post-market top gainers + losers) ────────────────

class _MoversCard extends ConsumerStatefulWidget {
  const _MoversCard();

  @override
  ConsumerState<_MoversCard> createState() => _MoversCardState();
}

class _MoversCardState extends ConsumerState<_MoversCard> {
  static const List<({String id, String label})> _indices = [
    (id: 'sp500', label: 'S&P 500'),
    (id: 'ndx', label: 'Nasdaq'),
    (id: 'dji', label: 'Dow Jones'),
    (id: 'russell2000', label: 'Russell 2000'),
  ];
  String _selected = 'sp500';
  String _moversFilter = 'gainers'; // gainers | losers

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final isPro = EntitlementService.can('treemap_heatmap');
    final async = ref.watch(_moversProvider(_selected));

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
              Icon(Icons.trending_up_rounded, size: 18, color: c.accent),
              const SizedBox(width: AppSpacing.s2),
              Expanded(
                child: Text(
                  'Movers',
                  style: AppTypography.headingSm
                      .copyWith(color: c.textPrimary),
                ),
              ),
              if (isPro)
                async.whenOrNull(
                      data: (d) => _SessionBadge(session: d.session, c: c),
                    ) ??
                    const SizedBox.shrink(),
            ],
          ),
          const SizedBox(height: AppSpacing.s2),
          Text(
            'Top 10 gainers & losers in the active US session',
            style: AppTypography.xs.copyWith(color: c.textMuted),
          ),
          const SizedBox(height: AppSpacing.s4),
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                for (var i = 0; i < _indices.length; i++) ...[
                  _FilterChip(
                    label: _indices[i].label,
                    active: _selected == _indices[i].id,
                    onTap: () => setState(() => _selected = _indices[i].id),
                  ),
                  if (i < _indices.length - 1)
                    const SizedBox(width: AppSpacing.s2),
                ],
              ],
            ),
          ),
          const SizedBox(height: AppSpacing.s2),
          Row(
            children: [
              _FilterChip(
                label: 'Gainers',
                active: _moversFilter == 'gainers',
                onTap: () => setState(() => _moversFilter = 'gainers'),
              ),
              const SizedBox(width: AppSpacing.s2),
              _FilterChip(
                label: 'Losers',
                active: _moversFilter == 'losers',
                onTap: () => setState(() => _moversFilter = 'losers'),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.s4),
          if (!isPro)
            Container(
              decoration: BoxDecoration(
                color: c.surfaceCard,
                borderRadius: BorderRadius.circular(AppRadius.md),
                border: Border.all(color: c.border),
              ),
              child: BestSetupsLockedBody(c: c, context: context),
            )
          else
            async.when(
              loading: () => Container(
                decoration: BoxDecoration(
                  color: c.surfaceCard,
                  borderRadius: BorderRadius.circular(AppRadius.md),
                  border: Border.all(color: c.border),
                ),
                child: BestSetupsLoadingBody(c: c),
              ),
              error: (_, __) => Container(
                padding: const EdgeInsets.all(AppSpacing.s4),
                decoration: BoxDecoration(
                  color: c.surfaceCard,
                  borderRadius: BorderRadius.circular(AppRadius.md),
                  border: Border.all(color: c.border),
                ),
                child: Text('Unable to load movers',
                    style:
                        AppTypography.xs.copyWith(color: c.textMuted)),
              ),
              data: (data) => _MoversBody(data: data, filter: _moversFilter, c: c),
            ),
          if (isPro)
            async.whenOrNull(
                  data: (d) => Padding(
                    padding: const EdgeInsets.only(top: AppSpacing.s2),
                    child: FreshnessBar(
                        lastUpdated: d.lastUpdated.toIso8601String()),
                  ),
                ) ??
                const SizedBox.shrink(),
        ],
      ),
    );
  }
}

class _SessionBadge extends StatelessWidget {
  const _SessionBadge({required this.session, required this.c});
  final String session; // pre | regular | post
  final AppPalette c;

  @override
  Widget build(BuildContext context) {
    final (label, color) = switch (session) {
      'pre' => ('Pre-market', c.warning),
      'post' => ('After-hours', c.accent),
      _ => ('Today', c.positive),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: color.withAlpha(22),
        borderRadius: BorderRadius.circular(AppRadius.full),
        border: Border.all(color: color.withAlpha(70)),
      ),
      child: Text(
        label,
        style: AppTypography.xs
            .copyWith(color: color, fontWeight: FontWeight.w700),
      ),
    );
  }
}

String _fmtMcap(double v) {
  if (v >= 1e12) return '\$${(v / 1e12).toStringAsFixed(2)}T';
  if (v >= 1e9) return '\$${(v / 1e9).toStringAsFixed(2)}B';
  if (v >= 1e6) return '\$${(v / 1e6).toStringAsFixed(1)}M';
  return '\$${v.toStringAsFixed(0)}';
}

String _fmtPrice(double? v) {
  if (v == null) return '—';
  if (v < 1) return '\$${v.toStringAsFixed(4)}';
  return '\$${v.toStringAsFixed(2)}';
}

class _MoversBody extends StatelessWidget {
  const _MoversBody({required this.data, required this.filter, required this.c});
  final MoversData data;
  final String filter; // gainers | losers
  final AppPalette c;

  double? _pickPct(TreemapStock s) => switch (data.session) {
        'pre' => s.preMarketChangePercent,
        'post' => s.postMarketChangePercent,
        _ => s.changePercent,
      };

  double _pickPrice(TreemapStock s) => switch (data.session) {
        'pre' => s.preMarketPrice ?? s.price,
        'post' => s.postMarketPrice ?? s.price,
        _ => s.price,
      };

  @override
  Widget build(BuildContext context) {
    final showGainers = filter == 'gainers';
    final stocks = showGainers ? data.gainers : data.losers;
    final isUp = showGainers;

    if (stocks.isEmpty) {
      final empty = switch (data.session) {
        'pre' => showGainers ? 'No pre-market gainers yet' : 'No pre-market losers yet',
        'post' => showGainers ? 'No after-hours gainers yet' : 'No after-hours losers yet',
        _ => showGainers ? 'No gainers yet' : 'No losers yet',
      };
      return Container(
        padding: const EdgeInsets.all(AppSpacing.s4),
        decoration: BoxDecoration(
          color: c.surfaceCard,
          borderRadius: BorderRadius.circular(AppRadius.md),
          border: Border.all(color: c.border),
        ),
        child: Text(empty,
            style: AppTypography.xs.copyWith(color: c.textMuted)),
      );
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        for (final s in stocks)
          Padding(
            padding: const EdgeInsets.only(bottom: AppSpacing.s2),
            child: _MoverTile(
              stock: s,
              pct: _pickPct(s),
              displayPrice: _pickPrice(s),
              isUp: isUp,
              c: c,
            ),
          ),
      ],
    );
  }
}

class _MoversSectionHeader extends StatelessWidget {
  const _MoversSectionHeader(
      {required this.label, required this.color, required this.c});
  final String label;
  final Color color;
  final AppPalette c;

  @override
  Widget build(BuildContext context) {
    return Row(
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
    );
  }
}

class _MoverTile extends StatelessWidget {
  const _MoverTile({
    required this.stock,
    required this.pct,
    required this.displayPrice,
    required this.isUp,
    required this.c,
  });

  final TreemapStock stock;
  final double? pct;
  final double displayPrice;
  final bool isUp;
  final AppPalette c;

  @override
  Widget build(BuildContext context) {
    final changeColor = isUp ? c.positive : c.danger;
    final pctText = pct == null
        ? '—'
        : '${isUp ? '+' : ''}${pct!.toStringAsFixed(2)}%';

    return GestureDetector(
      onTap: () => context.push(
        '/asset/${Uri.encodeComponent(stock.symbol)}'
        '?name=${Uri.encodeComponent(stock.name)}',
      ),
      child: Container(
        decoration: BoxDecoration(
          color: c.surfaceCard,
          borderRadius: BorderRadius.circular(AppRadius.sm),
          border: Border.all(color: c.border),
        ),
        clipBehavior: Clip.antiAlias,
        child: IntrinsicHeight(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Container(width: 3, color: changeColor),
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(
                      AppSpacing.s3, AppSpacing.s3, AppSpacing.s3, AppSpacing.s3),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Container(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 6, vertical: 2),
                            decoration: BoxDecoration(
                              color: c.surfaceElevated,
                              borderRadius:
                                  BorderRadius.circular(AppRadius.xs),
                              border: Border.all(color: c.border),
                            ),
                            child: Text(
                              stock.symbol,
                              style: AppTypography.xs.copyWith(
                                color: c.textPrimary,
                                fontWeight: FontWeight.w700,
                                letterSpacing: 0.3,
                              ),
                            ),
                          ),
                          const SizedBox(width: AppSpacing.s2),
                          Flexible(
                            child: _SectorChip(
                                sector: stock.sector, c: c),
                          ),
                          const Spacer(),
                          Text(
                            _fmtPrice(displayPrice),
                            style: AppTypography.labelSm.copyWith(
                              color: c.textPrimary,
                              fontWeight: FontWeight.w700,
                              fontFeatures: const [
                                FontFeature.tabularFigures()
                              ],
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 2),
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [
                          Expanded(
                            child: Text(
                              stock.name,
                              style: AppTypography.xs.copyWith(
                                  color: c.textSecondary,
                                  fontWeight: FontWeight.w500),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                          const SizedBox(width: AppSpacing.s2),
                          Text(
                            pctText,
                            style: AppTypography.labelSm.copyWith(
                              color: changeColor,
                              fontWeight: FontWeight.w700,
                              fontFeatures: const [
                                FontFeature.tabularFigures()
                              ],
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: AppSpacing.s3),
                      Container(height: 1, color: c.border),
                      const SizedBox(height: AppSpacing.s2),
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Expanded(
                              child: _StatCell(
                                  label: 'MCap',
                                  value: _fmtMcap(stock.marketCap),
                                  c: c)),
                          Expanded(
                              child: _StatCell(
                                  label: 'Day H',
                                  value: _fmtPrice(stock.dayHigh),
                                  c: c)),
                          Expanded(
                              child: _StatCell(
                                  label: '52W H',
                                  value: _fmtPrice(stock.fiftyTwoWeekHigh),
                                  c: c)),
                          Expanded(
                              child: _StatCell(
                                  label: '52W L',
                                  value: _fmtPrice(stock.fiftyTwoWeekLow),
                                  c: c)),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _SectorChip extends StatelessWidget {
  const _SectorChip({required this.sector, required this.c});
  final String sector;
  final AppPalette c;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: c.surfaceElevated,
        borderRadius: BorderRadius.circular(AppRadius.xs),
        border: Border.all(color: c.border),
      ),
      child: Text(
        sector,
        style: AppTypography.xs.copyWith(
          color: c.textSecondary,
          fontWeight: FontWeight.w600,
        ),
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
      ),
    );
  }
}

class _StatCell extends StatelessWidget {
  const _StatCell({required this.label, required this.value, required this.c});
  final String label;
  final String value;
  final AppPalette c;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label.toUpperCase(),
          style: AppTypography.xs.copyWith(
            color: c.textFaint,
            fontSize: 9,
            fontWeight: FontWeight.w700,
            letterSpacing: 0.6,
          ),
        ),
        const SizedBox(height: 1),
        Text(
          value,
          style: AppTypography.xs.copyWith(
            color: c.textPrimary,
            fontWeight: FontWeight.w600,
            fontFeatures: const [FontFeature.tabularFigures()],
          ),
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
        ),
      ],
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
                ? BestSetupsLockedBody(c: c, context: context)
                : async.when(
                    loading: () => BestSetupsLoadingBody(c: c),
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
                              Text('Computing best setups — refreshing automatically…',
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
          BestSetupsInfoRow(
            c: c,
            label: 'Leading',
            body: 'Sector is outperforming the S&P 500 (RS Ratio > 100) AND gaining relative momentum (RS Momentum > 100). Strongest rotation zone.',
          ),
          const SizedBox(height: AppSpacing.s4),
          BestSetupsInfoRow(
            c: c,
            label: 'Improving',
            body: 'Sector is underperforming vs S&P 500 (RS Ratio < 100) but its momentum is rising (RS Momentum > 100). Early-rotation zone — setups here can be early-stage.',
          ),
          const SizedBox(height: AppSpacing.s5),
          Text('Within each sector',
              style: AppTypography.headingSm.copyWith(color: c.textPrimary)),
          const SizedBox(height: AppSpacing.s4),
          BestSetupsInfoRow(
            c: c,
            label: 'Signal dots',
            body: 'Filled dots = signals active right now (Volume Spike, Heartbeat, Record Quarter, Trend). More dots = stronger confluence.',
          ),
          const SizedBox(height: AppSpacing.s4),
          BestSetupsInfoRow(
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
  int _strategy = 0; // 0=Lobbying, 1=Insider

  AsyncValue<QuiverScanResponse> get _async {
    return switch (_strategy) {
      1 => ref.watch(_quiverInsiderProvider),
      _ => ref.watch(_quiverLobbyingProvider),
    };
  }

  Future<void> _refresh() {
    return switch (_strategy) {
      1 => ref.refresh(_quiverInsiderProvider.future),
      _ => ref.refresh(_quiverLobbyingProvider.future),
    };
  }

  void _invalidate() {
    switch (_strategy) {
      case 1:
        ref.invalidate(_quiverInsiderProvider);
      default:
        ref.invalidate(_quiverLobbyingProvider);
    }
  }

  static const _strategies = [
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
                'Two data-driven portfolios built from public disclosure data — tracking money flows before markets react.',
                style: AppTypography.xs
                    .copyWith(color: c.textMuted, height: 1.6)),
            const SizedBox(height: AppSpacing.s5),
            _QuiverInfoBlock(
              icon: Icons.trending_up_rounded,
              color: c.warning,
              label: 'S1',
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
              label: 'S2',
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
            if (item.lobbyingGrowth != null) ...[
              const SizedBox(width: AppSpacing.s2),
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                decoration: BoxDecoration(
                  color: c.warning.withAlpha(20),
                  borderRadius: BorderRadius.circular(AppRadius.full),
                  border: Border.all(color: c.warning.withAlpha(60)),
                ),
                child: Text(
                  '${item.lobbyingGrowth} lobbying',
                  style: AppTypography.xs.copyWith(
                      color: c.warning, fontWeight: FontWeight.w700, fontSize: 9),
                ),
              ),
            ],
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
