import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/theme/app_palette.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/theme/app_typography.dart';
import '../../data/models/house_trade.dart';
import '../../data/repositories/house_trades_repository.dart';
import '../../shared/widgets/glass_card.dart';

// ── Main tab widget ───────────────────────────────────────────────────────────

class HouseTradesTab extends ConsumerStatefulWidget {
  const HouseTradesTab({super.key});

  @override
  ConsumerState<HouseTradesTab> createState() => _HouseTradesTabState();
}

class _HouseTradesTabState extends ConsumerState<HouseTradesTab> {
  final _searchCtrl = TextEditingController();
  String _tradeType = '';   // '' | 'purchase' | 'sale' | 'exchange'
  int    _days      = 365;
  String _memberFilter = '';
  int    _visibleCount = 60;

  @override
  void initState() {
    super.initState();
    _searchCtrl.addListener(() => setState(() => _memberFilter = _searchCtrl.text.trim()));
  }

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c     = context.colors;
    final async = ref.watch(houseTradesProvider);

    return async.when(
      loading: () => _FullScreenLoader(c: c),
      error:   (e, _) => _FullScreenError(
        c:       c,
        message: e.toString().replaceFirst('Exception: ', ''),
        onRetry: () => ref.read(houseTradesProvider.notifier).refresh(),
      ),
      data: (result) {
        // Compute derived data — only re-runs when state changes
        final filter = HouseTradeFilter(
          member:    _memberFilter,
          tradeType: _tradeType,
          days:      _days,
        );
        final filtered   = filterTrades(result.trades, filter);
        final overview   = buildOverview(filtered);
        final topTraders = buildTopTraders(filtered);
        final topTickers = buildTopTickers(filtered);
        final recent     = buildRecentTrades(filtered, days: _days);
        final recentPage = recent.take(_visibleCount).toList();

        return RefreshIndicator(
          onRefresh: () => ref.read(houseTradesProvider.notifier).refresh(),
          child: ListView(
            padding: EdgeInsets.only(
              bottom: AppSpacing.s8 + MediaQuery.of(context).padding.bottom,
            ),
            children: [
              // Slim refresh bar
              if (async.isLoading)
                LinearProgressIndicator(
                  color: c.accent,
                  backgroundColor: c.border,
                  minHeight: 2,
                ),

              // Stale error banner
              if (result.staleError != null)
                _StaleBanner(
                  message: result.staleError!,
                  onRetry: () => ref.read(houseTradesProvider.notifier).refresh(),
                  c: c,
                ),

              // Header
              _Header(lastFetch: result.lastFetch, c: c),

              // Filter bar
              _FilterBar(
                searchCtrl:  _searchCtrl,
                tradeType:   _tradeType,
                days:        _days,
                onType:      (v) => setState(() { _tradeType = v; _visibleCount = 60; }),
                onDays:      (v) => setState(() { _days = v; _visibleCount = 60; }),
                onClearAll:  () => setState(() {
                  _tradeType = '';
                  _days = 365;
                  _memberFilter = '';
                  _visibleCount = 60;
                  _searchCtrl.clear();
                }),
                c: c,
              ),

              // No results
              if (filtered.isEmpty)
                _EmptyState(
                  c: c,
                  onClear: () => setState(() {
                    _tradeType = '';
                    _days = 365;
                    _memberFilter = '';
                    _visibleCount = 60;
                    _searchCtrl.clear();
                  }),
                )
              else ...[
                // ── Overview
                _SectionHeader(label: 'Overview', c: c),
                _OverviewGrid(overview: overview, c: c),

                // ── Top Traders
                _SectionHeader(label: 'Top Traders', c: c),
                _TopTradersTable(
                  traders:   topTraders,
                  maxCount:  topTraders.isEmpty ? 1 : topTraders.first.count,
                  onTap:     (name) => setState(() {
                    _memberFilter = name;
                    _searchCtrl.text = name;
                  }),
                  c: c,
                ),

                // ── Top Tickers
                _SectionHeader(label: 'Top Tickers', c: c),
                _TopTickersTable(
                  tickers:  topTickers,
                  maxCount: topTickers.isEmpty ? 1 : topTickers.first.count,
                  c:        c,
                ),

                // ── Recent Trades
                _SectionHeader(
                  label: 'Recent Trades',
                  sub:   '${recent.length} in last ${_days}d',
                  c:     c,
                ),
                ...recentPage.map((t) => _TradeCard(trade: t, c: c)),

                if (recent.length > _visibleCount)
                  _ShowMoreButton(
                    remaining: recent.length - _visibleCount,
                    onTap:     () => setState(() => _visibleCount += 60),
                    c:         c,
                  ),
              ],
            ],
          ),
        );
      },
    );
  }
}

// ── Header ────────────────────────────────────────────────────────────────────

class _Header extends StatelessWidget {
  const _Header({required this.lastFetch, required this.c});
  final DateTime? lastFetch;
  final AppPalette c;

  @override
  Widget build(BuildContext context) {
    final age = lastFetch != null
        ? fmtAge(DateTime.now().difference(lastFetch!))
        : null;

    return Container(
      color: c.surface,
      padding: const EdgeInsets.fromLTRB(
          AppSpacing.s5, AppSpacing.s4, AppSpacing.s5, AppSpacing.s3),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          Icon(Icons.house_rounded, size: 16, color: c.accent),
          const SizedBox(width: AppSpacing.s2),
          Expanded(
            child: Text(
              'House Trades',
              style: AppTypography.labelMd
                  .copyWith(color: c.textPrimary, fontWeight: FontWeight.w700),
            ),
          ),
          if (age != null)
            Text('Updated $age',
                style: AppTypography.xs.copyWith(color: c.textMuted)),
        ],
      ),
    );
  }
}

// ── Filter bar ────────────────────────────────────────────────────────────────

class _FilterBar extends StatelessWidget {
  const _FilterBar({
    required this.searchCtrl,
    required this.tradeType,
    required this.days,
    required this.onType,
    required this.onDays,
    required this.onClearAll,
    required this.c,
  });

  final TextEditingController searchCtrl;
  final String tradeType;
  final int days;
  final ValueChanged<String> onType;
  final ValueChanged<int> onDays;
  final VoidCallback onClearAll;
  final AppPalette c;

  @override
  Widget build(BuildContext context) {
    return Container(
      color: c.surface,
      padding: const EdgeInsets.fromLTRB(
          AppSpacing.s5, 0, AppSpacing.s5, AppSpacing.s3),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Member search
          Container(
            height: 36,
            decoration: BoxDecoration(
              color: c.surfaceCard,
              borderRadius: BorderRadius.circular(AppRadius.sm),
              border: Border.all(color: c.border),
            ),
            child: TextField(
              controller: searchCtrl,
              style: AppTypography.xs.copyWith(color: c.textPrimary),
              decoration: InputDecoration(
                hintText: 'Search member name…',
                hintStyle: AppTypography.xs.copyWith(color: c.textFaint),
                prefixIcon: Icon(Icons.search_rounded, size: 16, color: c.textMuted),
                suffixIcon: searchCtrl.text.isNotEmpty
                    ? GestureDetector(
                        onTap: searchCtrl.clear,
                        child: Icon(Icons.close_rounded, size: 14, color: c.textMuted),
                      )
                    : null,
                border: InputBorder.none,
                isDense: true,
                contentPadding: const EdgeInsets.symmetric(vertical: 10),
              ),
            ),
          ),
          const SizedBox(height: AppSpacing.s3),
          // Trade type chips
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                Text('Type:', style: AppTypography.xs.copyWith(color: c.textMuted)),
                const SizedBox(width: AppSpacing.s2),
                for (final entry in const [
                  ('All', ''),
                  ('Purchases', 'purchase'),
                  ('Sales', 'sale'),
                  ('Exchange', 'exchange'),
                ]) ...[
                  _Chip(
                    label: entry.$1,
                    active: tradeType == entry.$2,
                    onTap: () => onType(entry.$2),
                    c: c,
                  ),
                  const SizedBox(width: AppSpacing.s2),
                ],
                const SizedBox(width: AppSpacing.s3),
                Text('Range:', style: AppTypography.xs.copyWith(color: c.textMuted)),
                const SizedBox(width: AppSpacing.s2),
                for (final entry in const [
                  ('7d', 7),
                  ('30d', 30),
                  ('90d', 90),
                  ('1yr', 365),
                ]) ...[
                  _Chip(
                    label: entry.$1,
                    active: days == entry.$2,
                    onTap: () => onDays(entry.$2),
                    c: c,
                  ),
                  const SizedBox(width: AppSpacing.s2),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// ── Section header ────────────────────────────────────────────────────────────

class _SectionHeader extends StatelessWidget {
  const _SectionHeader({required this.label, required this.c, this.sub});
  final String label;
  final String? sub;
  final AppPalette c;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(
          AppSpacing.s5, AppSpacing.s5, AppSpacing.s5, AppSpacing.s3),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(label,
                    style: AppTypography.headingSm
                        .copyWith(color: c.textPrimary)),
              ),
              if (sub != null)
                Text(sub!,
                    style: AppTypography.xs.copyWith(color: c.textMuted)),
            ],
          ),
          const SizedBox(height: AppSpacing.s2),
          Divider(color: c.border, height: 1, thickness: 0.5),
        ],
      ),
    );
  }
}

// ── Overview grid ─────────────────────────────────────────────────────────────

class _OverviewGrid extends StatelessWidget {
  const _OverviewGrid({required this.overview, required this.c});
  final HouseTradesOverview overview;
  final AppPalette c;

  @override
  Widget build(BuildContext context) {
    final total   = overview.total;
    final buyPct  = total == 0 ? 0.0 : overview.buys  / total * 100;
    final sellPct = total == 0 ? 0.0 : overview.sells / total * 100;
    final ratioStr = overview.buyRatio.isInfinite
        ? '∞'
        : '${overview.buyRatio.toStringAsFixed(2)}x';
    final dateRange = overview.earliest != null && overview.latest != null
        ? '${fmtMonth(overview.earliest!)} → ${fmtMonth(overview.latest!)}'
        : '—';

    final tiles = [
      (
        'Total trades',
        _fmt(overview.total),
        c.textPrimary,
      ),
      (
        'Members filing',
        _fmt(overview.memberCount),
        c.textPrimary,
      ),
      (
        'Unique tickers',
        _fmt(overview.tickerCount),
        c.textPrimary,
      ),
      (
        'Purchases',
        '${_fmt(overview.buys)} (${buyPct.toStringAsFixed(0)}%)',
        c.positive,
      ),
      (
        'Sales',
        '${_fmt(overview.sells)} (${sellPct.toStringAsFixed(0)}%)',
        c.danger,
      ),
      (
        'Buy/sell ratio',
        ratioStr,
        c.textPrimary,
      ),
      (
        'Date range',
        dateRange,
        c.textMuted,
      ),
      (
        'Est. volume',
        fmtMoney(overview.estVolume),
        c.warning,
      ),
    ];

    return Padding(
      padding:
          const EdgeInsets.symmetric(horizontal: AppSpacing.s5),
      child: GridView.count(
        crossAxisCount: 2,
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        mainAxisSpacing: AppSpacing.s3,
        crossAxisSpacing: AppSpacing.s3,
        childAspectRatio: 2.4,
        children: tiles
            .map((t) => _MetricTile(label: t.$1, value: t.$2, valueColor: t.$3, c: c))
            .toList(),
      ),
    );
  }

  String _fmt(int n) =>
      n.toString().replaceAllMapped(RegExp(r'(\d)(?=(\d{3})+$)'), (m) => '${m[1]},');
}

class _MetricTile extends StatelessWidget {
  const _MetricTile({
    required this.label,
    required this.value,
    required this.valueColor,
    required this.c,
  });
  final String label;
  final String value;
  final Color valueColor;
  final AppPalette c;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(AppSpacing.s3),
      decoration: BoxDecoration(
        color: c.surfaceCard,
        borderRadius: BorderRadius.circular(AppRadius.sm),
        border: Border.all(color: c.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(label,
              style: AppTypography.xs.copyWith(color: c.textMuted),
              maxLines: 1,
              overflow: TextOverflow.ellipsis),
          const SizedBox(height: 2),
          Text(value,
              style: AppTypography.labelSm
                  .copyWith(color: valueColor, fontWeight: FontWeight.w700),
              maxLines: 1,
              overflow: TextOverflow.ellipsis),
        ],
      ),
    );
  }
}

// ── Top traders table ─────────────────────────────────────────────────────────

class _TopTradersTable extends StatelessWidget {
  const _TopTradersTable({
    required this.traders,
    required this.maxCount,
    required this.onTap,
    required this.c,
  });
  final List<TopTrader> traders;
  final int maxCount;
  final ValueChanged<String> onTap;
  final AppPalette c;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: AppSpacing.s5),
      decoration: BoxDecoration(
        color: c.surfaceCard,
        borderRadius: BorderRadius.circular(AppRadius.md),
        border: Border.all(color: c.border),
      ),
      child: Column(
        children: traders.asMap().entries.map((e) {
          final i = e.key;
          final t = e.value;
          return GestureDetector(
            onTap: () => onTap(t.name),
            child: Container(
              padding: const EdgeInsets.symmetric(
                  horizontal: AppSpacing.s4, vertical: AppSpacing.s3),
              decoration: BoxDecoration(
                border: i > 0
                    ? Border(top: BorderSide(color: c.border, width: 0.5))
                    : null,
              ),
              child: Row(
                children: [
                  // Rank
                  SizedBox(
                    width: 22,
                    child: Text('${i + 1}',
                        style: AppTypography.xs.copyWith(
                            color: i < 3 ? c.accent : c.textFaint,
                            fontWeight: FontWeight.w700)),
                  ),
                  // Name
                  Expanded(
                    child: Text(t.name,
                        style: AppTypography.xs
                            .copyWith(color: c.textPrimary, fontWeight: FontWeight.w600),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis),
                  ),
                  const SizedBox(width: AppSpacing.s3),
                  // Trade count
                  SizedBox(
                    width: 32,
                    child: Text('${t.count}',
                        style: AppTypography.xs
                            .copyWith(color: c.textSecondary, fontWeight: FontWeight.w700),
                        textAlign: TextAlign.right),
                  ),
                  const SizedBox(width: AppSpacing.s3),
                  // Vol
                  SizedBox(
                    width: 48,
                    child: Text(fmtMoney(t.estVolume),
                        style: AppTypography.xs.copyWith(color: c.textMuted),
                        textAlign: TextAlign.right),
                  ),
                  const SizedBox(width: AppSpacing.s3),
                  // Buy/sell bar
                  _BuySellBar(
                    buys:  t.buys,
                    sells: t.sells,
                    max:   maxCount,
                    c:     c,
                  ),
                ],
              ),
            ),
          );
        }).toList(),
      ),
    );
  }
}

class _BuySellBar extends StatelessWidget {
  const _BuySellBar(
      {required this.buys, required this.sells, required this.max, required this.c});
  final int buys;
  final int sells;
  final int max;
  final AppPalette c;

  @override
  Widget build(BuildContext context) {
    const maxBlocks = 8;
    final buyBlocks  = (buys  / max * maxBlocks).round().clamp(0, maxBlocks);
    final sellBlocks = (sells / max * maxBlocks).round().clamp(0, maxBlocks);
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        ...List.generate(
          buyBlocks,
          (_) => Container(
            width: 5, height: 10,
            margin: const EdgeInsets.only(right: 1),
            decoration: BoxDecoration(
              color: c.positive.withAlpha(180),
              borderRadius: BorderRadius.circular(1),
            ),
          ),
        ),
        ...List.generate(
          sellBlocks,
          (_) => Container(
            width: 5, height: 10,
            margin: const EdgeInsets.only(right: 1),
            decoration: BoxDecoration(
              color: c.danger.withAlpha(180),
              borderRadius: BorderRadius.circular(1),
            ),
          ),
        ),
      ],
    );
  }
}

// ── Top tickers table ─────────────────────────────────────────────────────────

class _TopTickersTable extends StatelessWidget {
  const _TopTickersTable({
    required this.tickers,
    required this.maxCount,
    required this.c,
  });
  final List<TopTicker> tickers;
  final int maxCount;
  final AppPalette c;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: AppSpacing.s5),
      decoration: BoxDecoration(
        color: c.surfaceCard,
        borderRadius: BorderRadius.circular(AppRadius.md),
        border: Border.all(color: c.border),
      ),
      child: Column(
        children: tickers.asMap().entries.map((e) {
          final i = e.key;
          final t = e.value;
          return Container(
            padding: const EdgeInsets.symmetric(
                horizontal: AppSpacing.s4, vertical: AppSpacing.s3),
            decoration: BoxDecoration(
              border: i > 0
                  ? Border(top: BorderSide(color: c.border, width: 0.5))
                  : null,
            ),
            child: Row(
              children: [
                // Rank
                SizedBox(
                  width: 22,
                  child: Text('${i + 1}',
                      style: AppTypography.xs.copyWith(
                          color: i < 3 ? c.accent : c.textFaint,
                          fontWeight: FontWeight.w700)),
                ),
                // Ticker chip
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 2),
                  decoration: BoxDecoration(
                    color: c.surface,
                    borderRadius: BorderRadius.circular(AppRadius.xs),
                    border: Border.all(color: c.border),
                  ),
                  child: Text(t.ticker,
                      style: AppTypography.xs.copyWith(
                          color: c.textSecondary, fontWeight: FontWeight.w700)),
                ),
                const SizedBox(width: AppSpacing.s3),
                Expanded(
                  child: Row(
                    children: [
                      Text('${t.count}',
                          style: AppTypography.xs.copyWith(
                              color: c.textSecondary, fontWeight: FontWeight.w700)),
                      const SizedBox(width: AppSpacing.s2),
                      Text('(${t.buys}B/${t.sells}S)',
                          style: AppTypography.xs.copyWith(color: c.textFaint)),
                    ],
                  ),
                ),
                Text(fmtMoney(t.estVolume),
                    style: AppTypography.xs.copyWith(color: c.textMuted)),
                const SizedBox(width: AppSpacing.s3),
                _SentimentBadge(sentiment: t.sentiment, c: c),
              ],
            ),
          );
        }).toList(),
      ),
    );
  }
}

class _SentimentBadge extends StatelessWidget {
  const _SentimentBadge({required this.sentiment, required this.c});
  final String sentiment;
  final AppPalette c;

  @override
  Widget build(BuildContext context) {
    final color = sentiment == 'BUY'
        ? c.positive
        : sentiment == 'SELL'
            ? c.danger
            : c.textMuted;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: color.withAlpha(25),
        borderRadius: BorderRadius.circular(AppRadius.full),
        border: Border.all(color: color.withAlpha(80)),
      ),
      child: Text(sentiment,
          style: AppTypography.xs
              .copyWith(color: color, fontWeight: FontWeight.w800, letterSpacing: 0.3)),
    );
  }
}

// ── Trade card ────────────────────────────────────────────────────────────────

class _TradeCard extends StatelessWidget {
  const _TradeCard({required this.trade, required this.c});
  final EnrichedHouseTrade trade;
  final AppPalette c;

  @override
  Widget build(BuildContext context) {
    final hasLink = trade.ptrLink.isNotEmpty;

    return GlassCard(
      margin: const EdgeInsets.symmetric(
          horizontal: AppSpacing.s5, vertical: AppSpacing.s2),
      padding: const EdgeInsets.all(AppSpacing.s4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Row 1: dates (left) + member + district (center) + badges (right)
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Dates
              SizedBox(
                width: 60,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      trade.txDate != null ? _shortDate(trade.txDate!) : '—',
                      style: AppTypography.labelSm
                          .copyWith(color: c.textPrimary, fontWeight: FontWeight.w700),
                    ),
                    if (trade.discDate != null)
                      Text(
                        _shortDate(trade.discDate!),
                        style: AppTypography.xs.copyWith(color: c.textFaint),
                      ),
                  ],
                ),
              ),
              const SizedBox(width: AppSpacing.s3),
              // Member + district
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(trade.representative,
                        style: AppTypography.labelSm.copyWith(
                            color: c.textPrimary, fontWeight: FontWeight.w700),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis),
                    if (trade.district.isNotEmpty)
                      Text(trade.district,
                          style: AppTypography.xs.copyWith(color: c.textMuted)),
                  ],
                ),
              ),
              const SizedBox(width: AppSpacing.s2),
              // Badges
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  _TradeTypeBadge(type: trade.type, c: c),
                  const SizedBox(height: 4),
                  _AmountBadge(amount: trade.amount, c: c),
                ],
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.s2),
          // Row 2: ticker + description + link icon
          Row(
            children: [
              if (trade.cleanTicker.isNotEmpty) ...[
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 2),
                  decoration: BoxDecoration(
                    color: c.surface,
                    borderRadius: BorderRadius.circular(AppRadius.xs),
                    border: Border.all(color: c.border),
                  ),
                  child: Text(trade.cleanTicker,
                      style: AppTypography.xs.copyWith(
                          color: c.accent, fontWeight: FontWeight.w700)),
                ),
                const SizedBox(width: AppSpacing.s2),
              ] else ...[
                Text('—', style: AppTypography.xs.copyWith(color: c.textFaint)),
                const SizedBox(width: AppSpacing.s2),
              ],
              Expanded(
                child: Text(trade.assetDescription,
                    style: AppTypography.xs.copyWith(color: c.textMuted),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis),
              ),
              if (hasLink)
                GestureDetector(
                  onTap: () => launchUrl(
                    Uri.parse(trade.ptrLink),
                    mode: LaunchMode.externalApplication,
                  ),
                  child: Padding(
                    padding: const EdgeInsets.only(left: AppSpacing.s2),
                    child: Icon(Icons.open_in_new_rounded, size: 13, color: c.textFaint),
                  ),
                ),
            ],
          ),
        ],
      ),
    );
  }

  String _shortDate(DateTime d) {
    const m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return '${m[d.month-1]} ${d.day}';
  }
}

// ── Trade type badge ──────────────────────────────────────────────────────────

class _TradeTypeBadge extends StatelessWidget {
  const _TradeTypeBadge({required this.type, required this.c});
  final String type;
  final AppPalette c;

  @override
  Widget build(BuildContext context) {
    final lower = type.toLowerCase();
    final Color bg;
    final Color fg;

    if (lower.contains('purchase')) {
      bg = const Color(0xFFEAF3DE);
      fg = const Color(0xFF27500A);
    } else if (lower.contains('sale') || lower.contains('sold')) {
      bg = const Color(0xFFFCEBEB);
      fg = const Color(0xFF791F1F);
    } else if (lower.contains('exchange')) {
      bg = const Color(0xFFEEEDFE);
      fg = const Color(0xFF3C3489);
    } else {
      bg = c.surfaceCard;
      fg = c.textSecondary;
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(AppRadius.full),
      ),
      child: Text(type,
          style: AppTypography.xs
              .copyWith(color: fg, fontWeight: FontWeight.w700),
          maxLines: 1),
    );
  }
}

// ── Amount badge ──────────────────────────────────────────────────────────────

class _AmountBadge extends StatelessWidget {
  const _AmountBadge({required this.amount, required this.c});
  final String amount;
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
        shortenAmountRange(amount).isNotEmpty ? shortenAmountRange(amount) : '—',
        style: AppTypography.xs
            .copyWith(color: c.textSecondary, fontWeight: FontWeight.w600),
      ),
    );
  }
}

// ── Show more button ──────────────────────────────────────────────────────────

class _ShowMoreButton extends StatelessWidget {
  const _ShowMoreButton({required this.remaining, required this.onTap, required this.c});
  final int remaining;
  final VoidCallback onTap;
  final AppPalette c;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        margin: const EdgeInsets.symmetric(
            horizontal: AppSpacing.s5, vertical: AppSpacing.s4),
        padding: const EdgeInsets.symmetric(vertical: AppSpacing.s3),
        decoration: BoxDecoration(
          border: Border.all(color: c.border),
          borderRadius: BorderRadius.circular(AppRadius.full),
        ),
        child: Center(
          child: Text('Show $remaining more',
              style: AppTypography.xs.copyWith(color: c.textSecondary)),
        ),
      ),
    );
  }
}

// ── Empty state ───────────────────────────────────────────────────────────────

class _EmptyState extends StatelessWidget {
  const _EmptyState({required this.c, required this.onClear});
  final AppPalette c;
  final VoidCallback onClear;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(AppSpacing.s8),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.search_off_rounded, size: 40, color: c.textFaint),
          const SizedBox(height: AppSpacing.s4),
          Text('No trades match your filters',
              style: AppTypography.headingSm.copyWith(color: c.textSecondary),
              textAlign: TextAlign.center),
          const SizedBox(height: AppSpacing.s5),
          GestureDetector(
            onTap: onClear,
            child: Container(
              padding: const EdgeInsets.symmetric(
                  horizontal: AppSpacing.s5, vertical: AppSpacing.s3),
              decoration: BoxDecoration(
                border: Border.all(color: c.border),
                borderRadius: BorderRadius.circular(AppRadius.full),
              ),
              child: Text('Clear filters',
                  style: AppTypography.xs.copyWith(color: c.textSecondary)),
            ),
          ),
        ],
      ),
    );
  }
}

// ── Stale data banner ─────────────────────────────────────────────────────────

class _StaleBanner extends StatelessWidget {
  const _StaleBanner({required this.message, required this.onRetry, required this.c});
  final String message;
  final VoidCallback onRetry;
  final AppPalette c;

  @override
  Widget build(BuildContext context) {
    return Container(
      color: c.warning.withAlpha(20),
      padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.s5, vertical: AppSpacing.s3),
      child: Row(
        children: [
          Icon(Icons.cloud_off_rounded, size: 14, color: c.warning),
          const SizedBox(width: AppSpacing.s2),
          Expanded(
            child: Text(message,
                style: AppTypography.xs.copyWith(color: c.warning)),
          ),
          GestureDetector(
            onTap: onRetry,
            child: Text('Retry',
                style: AppTypography.xs.copyWith(
                    color: c.warning, fontWeight: FontWeight.w700)),
          ),
        ],
      ),
    );
  }
}

// ── Full screen states ────────────────────────────────────────────────────────

class _FullScreenLoader extends StatelessWidget {
  const _FullScreenLoader({required this.c});
  final AppPalette c;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          SizedBox(
            width: 36, height: 36,
            child: CircularProgressIndicator(strokeWidth: 2.5, color: c.accent),
          ),
          const SizedBox(height: AppSpacing.s4),
          Text('Loading House trades…',
              style: AppTypography.sm.copyWith(color: c.textMuted)),
          const SizedBox(height: AppSpacing.s2),
          Text('First load downloads ~15 MB — takes a moment',
              style: AppTypography.xs.copyWith(color: c.textFaint)),
        ],
      ),
    );
  }
}

class _FullScreenError extends StatelessWidget {
  const _FullScreenError(
      {required this.c, required this.message, required this.onRetry});
  final AppPalette c;
  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.s8),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.house_outlined, size: 40, color: c.textFaint),
            const SizedBox(height: AppSpacing.s4),
            Text('Could not load trade data',
                style: AppTypography.headingSm.copyWith(color: c.textSecondary),
                textAlign: TextAlign.center),
            const SizedBox(height: AppSpacing.s2),
            Text(message,
                style: AppTypography.xs
                    .copyWith(color: c.textMuted, height: 1.4),
                textAlign: TextAlign.center),
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

// ── Shared chip ───────────────────────────────────────────────────────────────

class _Chip extends StatelessWidget {
  const _Chip(
      {required this.label, required this.active, required this.onTap, required this.c});
  final String label;
  final bool active;
  final VoidCallback onTap;
  final AppPalette c;

  @override
  Widget build(BuildContext context) {
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
