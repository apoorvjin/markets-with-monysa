import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/network/api_client.dart';
import '../../core/network/api_endpoints.dart';
import '../../core/theme/app_palette.dart';
import '../../core/theme/app_typography.dart';
import '../../core/theme/app_spacing.dart';
import '../../data/models/trading_signal.dart';
import '../../shared/widgets/error_view.dart';
import '../../shared/widgets/glass_card.dart';
import '../../shared/widgets/max_width_layout.dart';
import '../../shared/widgets/shimmer_list.dart';
import '../../shared/widgets/theme_toggle.dart';

// ── Providers ─────────────────────────────────────────────────────────────────

final _politicianTradesProvider =
    FutureProvider.autoDispose.family<CongressTradesResponse, String>(
  (_, name) async {
    final data = await ApiClient.instance
        .get(ApiEndpoints.congressTradesByMember(name)) as Map<String, dynamic>;
    return CongressTradesResponse.fromJson(data);
  },
);

final _copyTradesProvider =
    FutureProvider.autoDispose.family<_CopyTradesData, String>(
  (_, name) async {
    final data = await ApiClient.instance
        .get(ApiEndpoints.copyTrades(name)) as Map<String, dynamic>;
    return _CopyTradesData.fromJson(data);
  },
);

// ── Data Models ───────────────────────────────────────────────────────────────

class _CopyHolding {
  const _CopyHolding({
    required this.ticker,
    required this.entryDate,
    required this.currentPrice,
    required this.amountMidpoint,
    required this.pnlPct,
  });

  final String ticker;
  final String entryDate;
  final double? currentPrice;
  final double amountMidpoint;
  final double? pnlPct;

  factory _CopyHolding.fromJson(Map<String, dynamic> j) => _CopyHolding(
        ticker:         j['ticker'] as String? ?? '',
        entryDate:      j['entryDate'] as String? ?? '',
        currentPrice:   (j['currentPrice'] as num?)?.toDouble(),
        amountMidpoint: (j['amountMidpoint'] as num?)?.toDouble() ?? 0,
        pnlPct:         (j['pnlPct'] as num?)?.toDouble(),
      );
}

class _CopyTradesData {
  const _CopyTradesData({
    required this.holdings,
    required this.memberName,
    required this.lastUpdated,
    this.totalPnlPct,
  });

  final List<_CopyHolding> holdings;
  final String memberName;
  final String lastUpdated;
  final double? totalPnlPct;

  factory _CopyTradesData.fromJson(Map<String, dynamic> j) => _CopyTradesData(
        holdings: (j['holdings'] as List? ?? [])
            .map((e) => _CopyHolding.fromJson(e as Map<String, dynamic>))
            .toList(),
        memberName:  j['memberName'] as String? ?? '',
        lastUpdated: j['lastUpdated'] as String? ?? '',
        totalPnlPct: (j['totalPnlPct'] as num?)?.toDouble(),
      );
}

// ── Screen ────────────────────────────────────────────────────────────────────

class PoliticianProfileScreen extends ConsumerStatefulWidget {
  const PoliticianProfileScreen({
    super.key,
    required this.name,
    required this.chamber,
  });

  final String name;
  final String chamber;

  @override
  ConsumerState<PoliticianProfileScreen> createState() =>
      _PoliticianProfileScreenState();
}

class _PoliticianProfileScreenState
    extends ConsumerState<PoliticianProfileScreen> {
  String _filter = 'All'; // All | Buys | Sells

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final tradesAsync = ref.watch(_politicianTradesProvider(widget.name));

    return Scaffold(
      backgroundColor: c.background,
      appBar: AppBar(
        backgroundColor: c.headerBg,
        leading: IconButton(
          icon: Icon(Icons.arrow_back_rounded, color: c.textPrimary, size: 20),
          onPressed: () => context.pop(),
        ),
        title: Text(
          widget.name,
          style: AppTypography.headingSm.copyWith(color: c.textPrimary),
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
        ),
        actions: const [ThemeToggleButton()],
      ),
      body: MaxWidthLayout(
        child: tradesAsync.when(
          loading: () => const ShimmerList(count: 6, type: ShimmerRowType.signal),
          error: (e, _) => ErrorView(
            message: 'Failed to load trades',
            onRetry: () => ref.invalidate(_politicianTradesProvider(widget.name)),
          ),
          data: (resp) => _PoliticianBody(
            name: widget.name,
            chamber: widget.chamber,
            trades: resp.trades,
            filter: _filter,
            onFilterChanged: (f) => setState(() => _filter = f),
          ),
        ),
      ),
    );
  }
}

// ── Body ──────────────────────────────────────────────────────────────────────

class _PoliticianBody extends ConsumerWidget {
  const _PoliticianBody({
    required this.name,
    required this.chamber,
    required this.trades,
    required this.filter,
    required this.onFilterChanged,
  });

  final String name;
  final String chamber;
  final List<CongressTrade> trades;
  final String filter;
  final ValueChanged<String> onFilterChanged;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;

    // Compute stats from trades
    final buys  = trades.where((t) => t.type == 'buy').toList();
    final sellCount = trades.where((t) => t.type == 'sell').length;
    final buyPct = trades.isEmpty
        ? 0.0
        : buys.length / trades.length * 100;

    // Find top ticker by frequency
    final tickerCount = <String, int>{};
    for (final t in buys) {
      tickerCount[t.ticker] = (tickerCount[t.ticker] ?? 0) + 1;
    }
    final topTicker = tickerCount.isEmpty
        ? '—'
        : tickerCount.entries
            .reduce((a, b) => a.value >= b.value ? a : b)
            .key;

    // Party info (take from first trade with party set)
    final party = trades.firstWhere(
          (t) => t.party != null && t.party!.isNotEmpty,
          orElse: () => trades.isEmpty ? _emptyTrade(name, chamber) : trades.first,
        ).party;
    final state = trades.firstWhere(
          (t) => t.state != null && t.state!.isNotEmpty,
          orElse: () => trades.isEmpty ? _emptyTrade(name, chamber) : trades.first,
        ).state;

    // Filter trades
    final filtered = trades.where((t) {
      if (filter == 'Buys'  && t.type != 'buy')  return false;
      if (filter == 'Sells' && t.type != 'sell') return false;
      return true;
    }).toList();

    return ListView(
      padding: EdgeInsets.only(
        bottom: AppSpacing.s5 + MediaQuery.of(context).padding.bottom,
      ),
      children: [
        // ── Header ──
        _ProfileHeader(
          name: name,
          chamber: chamber,
          party: party,
          state: state,
          c: c,
        ),
        // ── Stats row ──
        Padding(
          padding: const EdgeInsets.fromLTRB(
              AppSpacing.s5, AppSpacing.s2, AppSpacing.s5, AppSpacing.s4),
          child: Row(
            children: [
              _StatCard(label: 'Total Trades', value: '${trades.length}', c: c),
              const SizedBox(width: AppSpacing.s3),
              _StatCard(
                label: 'Buy Ratio',
                value: '${buyPct.toStringAsFixed(0)}%',
                valueColor: c.positive,
                c: c,
              ),
              const SizedBox(width: AppSpacing.s3),
              _StatCard(label: 'Sells', value: '$sellCount', c: c),
              const SizedBox(width: AppSpacing.s3),
              _StatCard(
                label: 'Top Pick',
                value: topTicker,
                valueColor: c.accent,
                c: c,
              ),
            ],
          ),
        ),
        // ── Copy Trade Card ──
        _CopyTradeCard(memberName: name),
        // ── Filter chips ──
        Padding(
          padding: const EdgeInsets.fromLTRB(
              AppSpacing.s5, AppSpacing.s4, AppSpacing.s5, AppSpacing.s2),
          child: Row(
            children: [
              Text('Show:',
                  style: AppTypography.xs.copyWith(color: c.textMuted)),
              const SizedBox(width: AppSpacing.s2),
              for (final label in ['All', 'Buys', 'Sells']) ...[
                _FilterChip(
                  label: label,
                  active: filter == label,
                  onTap: () => onFilterChanged(label),
                ),
                if (label != 'Sells') const SizedBox(width: AppSpacing.s2),
              ],
              const Spacer(),
              Text(
                '${filtered.length} trades',
                style: AppTypography.xs.copyWith(color: c.textMuted),
              ),
            ],
          ),
        ),
        // ── Trade list ──
        if (filtered.isEmpty)
          Padding(
            padding: const EdgeInsets.all(AppSpacing.s8),
            child: Center(
              child: Text('No trades match the filter',
                  style: AppTypography.sm.copyWith(color: c.textMuted)),
            ),
          )
        else
          ...filtered.map((t) => _TradeRow(trade: t)),
      ],
    );
  }

  static CongressTrade _emptyTrade(String name, String chamber) => CongressTrade(
        memberName: name,
        chamber: chamber,
        ticker: '',
        assetDescription: '',
        type: '',
        transactionDate: '',
        filingDate: '',
        amount: '',
      );
}

// ── Profile Header ─────────────────────────────────────────────────────────────

class _ProfileHeader extends StatelessWidget {
  const _ProfileHeader({
    required this.name,
    required this.chamber,
    required this.party,
    required this.state,
    required this.c,
  });

  final String name;
  final String chamber;
  final String? party;
  final String? state;
  final AppPalette c;

  @override
  Widget build(BuildContext context) {
    final partyColor = _partyColor(party, c);
    final partyLabel = _partyLabel(party);
    final initials = name.trim().split(' ')
        .where((w) => w.isNotEmpty)
        .take(2)
        .map((w) => w[0].toUpperCase())
        .join();

    return Container(
      color: c.surface,
      padding: const EdgeInsets.fromLTRB(
          AppSpacing.s5, AppSpacing.s5, AppSpacing.s5, AppSpacing.s4),
      child: Row(
        children: [
          Container(
            width: 52,
            height: 52,
            decoration: BoxDecoration(
              color: partyColor.withAlpha(25),
              borderRadius: BorderRadius.circular(AppRadius.lg),
              border: Border.all(color: partyColor.withAlpha(80)),
            ),
            child: Center(
              child: Text(
                initials,
                style: AppTypography.headingSm.copyWith(
                    color: partyColor, fontWeight: FontWeight.w800),
              ),
            ),
          ),
          const SizedBox(width: AppSpacing.s4),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  name,
                  style: AppTypography.headingSm
                      .copyWith(color: c.textPrimary, fontWeight: FontWeight.w700),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: AppSpacing.s2),
                Wrap(
                  spacing: AppSpacing.s2,
                  runSpacing: AppSpacing.s1,
                  children: [
                    if (partyLabel.isNotEmpty)
                      _Badge(
                          label: partyLabel,
                          color: partyColor,
                          c: c),
                    if (chamber.isNotEmpty)
                      _Badge(
                          label: chamber,
                          color: c.accent,
                          c: c),
                    if (state != null && state!.isNotEmpty)
                      _Badge(
                          label: state!,
                          color: c.textMuted,
                          c: c),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  static Color _partyColor(String? party, AppPalette c) {
    switch (party) {
      case 'D': return const Color(0xFF3B82F6);
      case 'R': return c.danger;
      default:  return c.textMuted;
    }
  }

  static String _partyLabel(String? party) {
    switch (party) {
      case 'D': return 'Democrat';
      case 'R': return 'Republican';
      case 'I': return 'Independent';
      default:  return '';
    }
  }
}

// ── Badge ─────────────────────────────────────────────────────────────────────

class _Badge extends StatelessWidget {
  const _Badge({required this.label, required this.color, required this.c});
  final String label;
  final Color color;
  final AppPalette c;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
      decoration: BoxDecoration(
        color: color.withAlpha(20),
        borderRadius: BorderRadius.circular(AppRadius.full),
        border: Border.all(color: color.withAlpha(60)),
      ),
      child: Text(
        label,
        style: AppTypography.xs.copyWith(
            color: color, fontWeight: FontWeight.w600),
      ),
    );
  }
}

// ── Stat Card ─────────────────────────────────────────────────────────────────

class _StatCard extends StatelessWidget {
  const _StatCard({
    required this.label,
    required this.value,
    required this.c,
    this.valueColor,
  });

  final String label;
  final String value;
  final AppPalette c;
  final Color? valueColor;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.s3, vertical: AppSpacing.s3),
        decoration: BoxDecoration(
          color: c.surfaceCard,
          borderRadius: BorderRadius.circular(AppRadius.sm),
          border: Border.all(color: c.border),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              value,
              style: AppTypography.labelMd.copyWith(
                color: valueColor ?? c.textPrimary,
                fontWeight: FontWeight.w700,
              ),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
            const SizedBox(height: 2),
            Text(
              label,
              style: AppTypography.xs.copyWith(color: c.textMuted, fontSize: 9),
            ),
          ],
        ),
      ),
    );
  }
}

// ── Copy Trade Card ───────────────────────────────────────────────────────────

class _CopyTradeCard extends ConsumerStatefulWidget {
  const _CopyTradeCard({required this.memberName});
  final String memberName;

  @override
  ConsumerState<_CopyTradeCard> createState() => _CopyTradeCardState();
}

class _CopyTradeCardState extends ConsumerState<_CopyTradeCard> {
  bool _expanded = false;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final async = ref.watch(_copyTradesProvider(widget.memberName));

    return Padding(
      padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.s5, vertical: AppSpacing.s2),
      child: GlassCard(
        padding: EdgeInsets.zero,
        child: Column(
          children: [
            GestureDetector(
              onTap: () => setState(() => _expanded = !_expanded),
              behavior: HitTestBehavior.opaque,
              child: Padding(
                padding: const EdgeInsets.all(AppSpacing.s4),
                child: Row(
                  children: [
                    Icon(Icons.copy_all_rounded, size: 16, color: c.warning),
                    const SizedBox(width: AppSpacing.s2),
                    Expanded(
                      child: Text(
                        'Copy Trade Portfolio',
                        style: AppTypography.labelSm.copyWith(
                            color: c.textPrimary, fontWeight: FontWeight.w700),
                      ),
                    ),
                    async.whenOrNull(
                      data: (d) => Text(
                        '${d.holdings.length} holdings',
                        style: AppTypography.xs.copyWith(color: c.textMuted),
                      ),
                    ) ?? const SizedBox.shrink(),
                    const SizedBox(width: AppSpacing.s2),
                    Icon(
                      _expanded
                          ? Icons.keyboard_arrow_up_rounded
                          : Icons.keyboard_arrow_down_rounded,
                      size: 16,
                      color: c.textMuted,
                    ),
                  ],
                ),
              ),
            ),
            if (_expanded) ...[
              Divider(height: 1, color: c.border),
              async.when(
                loading: () => Padding(
                  padding: const EdgeInsets.all(AppSpacing.s4),
                  child: Row(
                    children: [
                      SizedBox(
                        width: 14,
                        height: 14,
                        child: CircularProgressIndicator(
                            strokeWidth: 1.5, color: c.textMuted),
                      ),
                      const SizedBox(width: AppSpacing.s3),
                      Text('Loading portfolio…',
                          style: AppTypography.xs.copyWith(color: c.textMuted)),
                    ],
                  ),
                ),
                error: (_, __) => Padding(
                  padding: const EdgeInsets.all(AppSpacing.s4),
                  child: Text(
                    'Unable to load portfolio data',
                    style: AppTypography.xs.copyWith(color: c.textMuted),
                  ),
                ),
                data: (data) {
                  if (data.holdings.isEmpty) {
                    return Padding(
                      padding: const EdgeInsets.all(AppSpacing.s4),
                      child: Text(
                        'No recent buy positions found',
                        style: AppTypography.xs.copyWith(color: c.textMuted),
                      ),
                    );
                  }
                  return Column(
                    children: [
                      Padding(
                        padding: const EdgeInsets.fromLTRB(
                            AppSpacing.s4, AppSpacing.s3, AppSpacing.s4,
                            AppSpacing.s2),
                        child: Text(
                          'Latest buy per unique ticker · Current market prices',
                          style: AppTypography.xs
                              .copyWith(color: c.textFaint, height: 1.4),
                        ),
                      ),
                      ...data.holdings.map((h) => _HoldingRow(holding: h)),
                    ],
                  );
                },
              ),
            ],
          ],
        ),
      ),
    );
  }
}

// ── Holding Row ───────────────────────────────────────────────────────────────

class _HoldingRow extends StatelessWidget {
  const _HoldingRow({required this.holding});
  final _CopyHolding holding;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final price = holding.currentPrice;
    final priceStr = price != null
        ? '\$${price >= 100 ? price.toStringAsFixed(0) : price.toStringAsFixed(2)}'
        : '—';

    return GestureDetector(
      onTap: () => context.push('/asset/${Uri.encodeComponent(holding.ticker)}'),
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
                  Text(
                    holding.ticker,
                    style: AppTypography.labelSm.copyWith(
                        color: c.textPrimary, fontWeight: FontWeight.w700),
                  ),
                  Text(
                    'Bought ${_fmtDate(holding.entryDate)}',
                    style: AppTypography.xs.copyWith(color: c.textMuted),
                  ),
                ],
              ),
            ),
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(priceStr,
                    style: AppTypography.labelSm.copyWith(color: c.textPrimary)),
                Text(
                  _fmtAmount(holding.amountMidpoint),
                  style: AppTypography.xs.copyWith(color: c.textMuted),
                ),
              ],
            ),
          ],
        ),
      ),
    );
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

  String _fmtAmount(double mid) {
    if (mid <= 0) return '';
    if (mid >= 1000000) return '~\$${(mid / 1000000).toStringAsFixed(1)}M';
    if (mid >= 1000)    return '~\$${(mid / 1000).round()}K';
    return '~\$${mid.round()}';
  }
}

// ── Trade Row ─────────────────────────────────────────────────────────────────

class _TradeRow extends StatelessWidget {
  const _TradeRow({required this.trade});
  final CongressTrade trade;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final isBuy = trade.type == 'buy';
    final typeColor = isBuy ? c.positive : c.danger;

    return GestureDetector(
      onTap: () => context.push(
        '/asset/${Uri.encodeComponent(trade.ticker)}'
        '?name=${Uri.encodeComponent(trade.displayName)}',
      ),
      child: GlassCard(
        margin: const EdgeInsets.symmetric(
            horizontal: AppSpacing.s5, vertical: AppSpacing.s2),
        padding: const EdgeInsets.all(AppSpacing.s4),
        child: Row(
          children: [
            // Type indicator
            Container(
              width: 32,
              height: 32,
              decoration: BoxDecoration(
                color: typeColor.withAlpha(20),
                borderRadius: BorderRadius.circular(AppRadius.sm),
                border: Border.all(color: typeColor.withAlpha(60)),
              ),
              child: Icon(
                isBuy
                    ? Icons.arrow_upward_rounded
                    : Icons.arrow_downward_rounded,
                size: 16,
                color: typeColor,
              ),
            ),
            const SizedBox(width: AppSpacing.s3),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    trade.displayName,
                    style: AppTypography.labelSm.copyWith(
                        color: c.textPrimary, fontWeight: FontWeight.w600),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 2),
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
                          trade.ticker,
                          style: AppTypography.xs.copyWith(
                              color: c.textSecondary,
                              fontWeight: FontWeight.w700),
                        ),
                      ),
                      const SizedBox(width: AppSpacing.s2),
                      Text(
                        _fmtDate(trade.transactionDate),
                        style:
                            AppTypography.xs.copyWith(color: c.textMuted),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            Text(
              _fmtAmount(trade.amount),
              style: AppTypography.xs.copyWith(
                  color: c.accent, fontWeight: FontWeight.w700),
            ),
          ],
        ),
      ),
    );
  }

  String _fmtDate(String iso) {
    if (iso.length < 10) return iso;
    try {
      final dt = DateTime.parse(iso);
      const months = [
        'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
        'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
      ];
      return '${months[dt.month - 1]} ${dt.day}';
    } catch (_) {
      return iso;
    }
  }

  String _fmtAmount(String raw) {
    final clean = raw.replaceAll(RegExp(r'\s+'), ' ').trim();
    if (clean.isEmpty) return '—';
    return clean
        .replaceAllMapped(
          RegExp(r'\$(\d{1,3}(?:,\d{3})*)'),
          (m) => '\$${_compact(m.group(1)!)}',
        )
        .replaceAll(' - ', '–');
  }

  String _compact(String numStr) {
    final n = int.tryParse(numStr.replaceAll(',', '')) ?? 0;
    if (n >= 1000000) return '${(n / 1000000).toStringAsFixed(1)}M';
    if (n >= 1000)    return '${(n / 1000).toStringAsFixed(0)}K';
    return numStr;
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
          border: Border.all(color: active ? c.accent : c.border),
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
