import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme/app_palette.dart';
import '../../core/theme/app_typography.dart';
import '../../core/theme/app_spacing.dart';
import '../../data/models/market_item.dart';
import '../../data/repositories/markets_repository.dart';
import '../../shared/widgets/error_view.dart';

// ── Provider ──────────────────────────────────────────────────────────────────

final _stocksProvider =
    FutureProvider.autoDispose.family<List<MarketItem>, String>(
  (ref, code) => MarketsRepository.instance.fetchCountryStocks(code),
);

// ── Screen ────────────────────────────────────────────────────────────────────

enum _SortKey { rank, price, marketCap }

class CountryStocksScreen extends ConsumerStatefulWidget {
  const CountryStocksScreen({
    super.key,
    required this.countryCode,
    required this.countryName,
  });

  final String countryCode;
  final String countryName;

  @override
  ConsumerState<CountryStocksScreen> createState() =>
      _CountryStocksScreenState();
}

class _CountryStocksScreenState extends ConsumerState<CountryStocksScreen> {
  _SortKey _sortKey = _SortKey.rank;
  bool _ascending = true;
  // Captures original API order on first data load so rank sort can restore it
  Map<String, int>? _rankMap;

  void _sort(List<MarketItem> list) {
    _rankMap ??= {for (var i = 0; i < list.length; i++) list[i].symbol: i};
    list.sort((a, b) {
      final cmp = switch (_sortKey) {
        _SortKey.rank =>
          (_rankMap![a.symbol] ?? 0).compareTo(_rankMap![b.symbol] ?? 0),
        _SortKey.price =>
          (a.price ?? 0).compareTo(b.price ?? 0),
        _SortKey.marketCap =>
          (a.changePercent ?? 0).compareTo(b.changePercent ?? 0),
      };
      return _ascending ? cmp : -cmp;
    });
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final async = ref.watch(_stocksProvider(widget.countryCode));

    return Scaffold(
      backgroundColor: c.background,
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Top Stocks',
                style: AppTypography.headingMd.copyWith(color: c.textPrimary)),
            Text(widget.countryName,
                style: AppTypography.sm.copyWith(color: c.textMuted)),
          ],
        ),
        backgroundColor: c.headerBg,
      ),
      body: async.when(
        loading: () => Center(
            child: CircularProgressIndicator(color: c.accent)),
        error: (e, _) => ErrorView(
          message: 'Failed to load stocks for ${widget.countryName}',
          onRetry: () => ref.invalidate(_stocksProvider(widget.countryCode)),
        ),
        data: (stocks) {
          _sort(stocks);
          return Column(
            children: [
              // Sort header
              Container(
                padding: const EdgeInsets.symmetric(
                    horizontal: AppSpacing.s5, vertical: AppSpacing.s3),
                decoration: BoxDecoration(
                    border: Border(
                        bottom: BorderSide(color: c.border))),
                child: Row(
                  children: [
                    Text('${stocks.length} stocks',
                        style: AppTypography.sm.copyWith(
                            color: c.textMuted)),
                    const Spacer(),
                    _SortButton(
                      label: 'Price',
                      active: _sortKey == _SortKey.price,
                      ascending: _ascending,
                      palette: c,
                      onTap: () => setState(() {
                        if (_sortKey == _SortKey.price) {
                          _ascending = !_ascending;
                        } else {
                          _sortKey = _SortKey.price;
                          _ascending = false;
                        }
                      }),
                    ),
                  ],
                ),
              ),
              Expanded(
                child: RefreshIndicator(
                  color: c.accent,
                  backgroundColor: c.surface,
                  onRefresh: () =>
                      ref.refresh(_stocksProvider(widget.countryCode).future),
                  child: ListView.builder(
                    itemCount: stocks.length,
                    itemBuilder: (ctx, i) =>
                        _StockRow(stock: stocks[i], rank: i + 1),
                  ),
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}

class _SortButton extends StatelessWidget {
  const _SortButton({
    required this.label,
    required this.active,
    required this.ascending,
    required this.onTap,
    required this.palette,
  });

  final String label;
  final bool active;
  final bool ascending;
  final VoidCallback onTap;
  final AppPalette palette;

  @override
  Widget build(BuildContext context) {
    final c = palette;
    return GestureDetector(
      onTap: onTap,
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(label,
              style: AppTypography.sm.copyWith(
                  color: active ? c.accent : c.textMuted,
                  fontWeight: FontWeight.w600)),
          if (active)
            Icon(ascending ? Icons.arrow_upward : Icons.arrow_downward,
                size: 12, color: c.accent),
        ],
      ),
    );
  }
}

class _StockRow extends StatelessWidget {
  const _StockRow({required this.stock, required this.rank});
  final MarketItem stock;
  final int rank;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final pct = stock.changePercent;
    final isUp = (pct ?? 0) >= 0;
    final pctColor = isUp ? c.positive : c.danger;
    final pctStr = pct == null
        ? '--'
        : '${isUp ? '+' : ''}${pct.toStringAsFixed(2)}%';

    return InkWell(
      onTap: () => context.push(
          '/asset/${Uri.encodeComponent(stock.symbol)}?name=${Uri.encodeComponent(stock.name)}'),
      child: Container(
        padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.s5, vertical: AppSpacing.s4),
        decoration: BoxDecoration(
            border: Border(
                bottom: BorderSide(color: c.border, width: 0.5))),
        child: Row(
          children: [
            SizedBox(
              width: 28,
              child: Text('#$rank',
                  style: AppTypography.sm.copyWith(color: c.textMuted)),
            ),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(stock.name,
                      style: AppTypography.labelMd.copyWith(color: c.textPrimary),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis),
                  Text(stock.symbol,
                      style: AppTypography.sm.copyWith(
                          color: c.textMuted)),
                  if (stock.category != null)
                    Text(stock.category!,
                        style: AppTypography.xs.copyWith(
                            color: c.textFaint),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis),
                ],
              ),
            ),
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(_formatPrice(stock.price, stock.currency),
                    style: AppTypography.numericLg.copyWith(color: c.textPrimary)),
                Text(pctStr,
                    style: AppTypography.sm.copyWith(
                        color: pctColor, fontWeight: FontWeight.w600)),
              ],
            ),
          ],
        ),
      ),
    );
  }

  String _formatPrice(double? price, String? currency) {
    if (price == null) return '--';
    final prefix = currency == 'USD' ? '\$' : '';
    if (price > 1000) return '$prefix${price.toStringAsFixed(0)}';
    if (price < 1) return '$prefix${price.toStringAsFixed(4)}';
    return '$prefix${price.toStringAsFixed(2)}';
  }
}
