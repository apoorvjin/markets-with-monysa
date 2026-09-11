import 'dart:async';

import 'package:flutter/material.dart';

import '../../core/network/api_client.dart';
import '../../core/network/api_endpoints.dart';
import '../../core/theme/app_palette.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/theme/app_typography.dart';
import '../../data/models/trading_signal.dart';
import 'chart_modal.dart';

/// "Search any symbol" icon button — opens a bottom sheet hitting
/// /api/search. Global: lives in the AppBar leading area (left of the app
/// logo) on every main tab — see AppBarLeading.
class GlobalSearchButton extends StatelessWidget {
  const GlobalSearchButton({super.key});

  @override
  Widget build(BuildContext context) {
    return IconButton(
      icon: const Icon(Icons.search_rounded, size: 24),
      tooltip: 'Search any symbol',
      onPressed: () => showGlobalSearchSheet(context),
    );
  }
}

void showGlobalSearchSheet(BuildContext context) {
  showModalBottomSheet(
    context: context,
    isScrollControlled: true,
    enableDrag: true,
    useSafeArea: true,
    backgroundColor: Colors.transparent,
    builder: (ctx) => const GlobalSearchSheet(),
  );
}

class GlobalSearchSheet extends StatefulWidget {
  const GlobalSearchSheet({super.key});

  @override
  State<GlobalSearchSheet> createState() => _GlobalSearchSheetState();
}

class _GlobalSearchSheetState extends State<GlobalSearchSheet> {
  final _controller = TextEditingController();
  Timer? _debounce;
  List<StockSearchResult> _results = [];
  bool _loading = false;
  String? _error;
  String _query = '';

  @override
  void dispose() {
    _debounce?.cancel();
    _controller.dispose();
    super.dispose();
  }

  void _onChanged(String value) {
    _debounce?.cancel();
    final q = value.trim();
    if (q.isEmpty) {
      setState(() { _query = ''; _results = []; _error = null; _loading = false; });
      return;
    }
    _debounce = Timer(const Duration(milliseconds: 400), () => _search(q));
  }

  Future<void> _search(String q) async {
    setState(() { _query = q; _loading = true; _error = null; });
    try {
      final data = await ApiClient.instance.get(
        ApiEndpoints.stockSearch,
        params: {'q': q},
      ) as Map<String, dynamic>;
      final list = (data['results'] as List? ?? [])
          .map((e) => StockSearchResult.fromJson(e as Map<String, dynamic>))
          .toList();
      if (mounted) setState(() { _results = list; _loading = false; });
    } catch (_) {
      if (mounted) setState(() { _error = 'Search failed — check connection'; _loading = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final maxHeight = MediaQuery.of(context).size.height * 0.85;

    return Container(
      constraints: BoxConstraints(maxHeight: maxHeight),
      decoration: BoxDecoration(
        color: c.surface,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(AppRadius.lg)),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // Handle
          Padding(
            padding: const EdgeInsets.only(top: 10, bottom: 4),
            child: Container(
              width: 36, height: 4,
              decoration: BoxDecoration(
                color: c.border,
                borderRadius: BorderRadius.circular(AppRadius.full),
              ),
            ),
          ),
          // Header
          Padding(
            padding: const EdgeInsets.symmetric(
                horizontal: AppSpacing.s5, vertical: AppSpacing.s3),
            child: Row(
              children: [
                Expanded(
                  child: Text('Search Markets',
                      style: AppTypography.headingSm.copyWith(color: c.textPrimary)),
                ),
                IconButton(
                  icon: Icon(Icons.close, size: 20, color: c.textMuted),
                  onPressed: () => Navigator.of(context).pop(),
                ),
              ],
            ),
          ),
          // Search field
          Padding(
            padding: const EdgeInsets.fromLTRB(
                AppSpacing.s5, 0, AppSpacing.s5, AppSpacing.s3),
            child: TextField(
              controller: _controller,
              autofocus: true,
              onChanged: _onChanged,
              style: AppTypography.md.copyWith(color: c.textPrimary),
              decoration: InputDecoration(
                hintText: 'Symbol or company name...',
                hintStyle: AppTypography.md.copyWith(color: c.textMuted),
                prefixIcon: Icon(Icons.search_rounded, color: c.textMuted, size: 20),
                suffixIcon: _loading
                    ? Padding(
                        padding: const EdgeInsets.all(12),
                        child: SizedBox(
                          width: 16, height: 16,
                          child: CircularProgressIndicator(
                              strokeWidth: 2, color: c.accent),
                        ),
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
          Divider(height: 1, color: c.border),
          // Results
          Flexible(
            child: _error != null
                ? Center(
                    child: Padding(
                      padding: const EdgeInsets.all(AppSpacing.s5),
                      child: Text(_error!,
                          style: AppTypography.sm.copyWith(color: c.textMuted),
                          textAlign: TextAlign.center),
                    ),
                  )
                : _query.isEmpty
                    ? Center(
                        child: Padding(
                          padding: const EdgeInsets.all(AppSpacing.s8),
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(Icons.candlestick_chart_rounded,
                                  size: 40, color: c.textMuted),
                              const SizedBox(height: AppSpacing.s3),
                              Text('Search stocks, ETFs, indices, forex',
                                  style: AppTypography.sm
                                      .copyWith(color: c.textMuted),
                                  textAlign: TextAlign.center),
                            ],
                          ),
                        ),
                      )
                    : _results.isEmpty && !_loading
                        ? Center(
                            child: Padding(
                              padding: const EdgeInsets.all(AppSpacing.s5),
                              child: Text('No results for "$_query"',
                                  style: AppTypography.sm
                                      .copyWith(color: c.textMuted)),
                            ),
                          )
                        : ListView.builder(
                            padding: EdgeInsets.only(
                                bottom: MediaQuery.of(context).padding.bottom +
                                    AppSpacing.s3),
                            itemCount: _results.length,
                            itemBuilder: (ctx, i) {
                              final r = _results[i];
                              return ListTile(
                                onTap: () {
                                  Navigator.of(context).pop();
                                  ChartModal.show(context,
                                      symbol: r.symbol, name: r.name);
                                },
                                title: Text(r.symbol,
                                    style: AppTypography.labelLg
                                        .copyWith(color: c.textPrimary)),
                                subtitle: Text(r.name,
                                    style: AppTypography.sm
                                        .copyWith(color: c.textMuted),
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis),
                                trailing: Column(
                                  mainAxisAlignment: MainAxisAlignment.center,
                                  crossAxisAlignment: CrossAxisAlignment.end,
                                  children: [
                                    if (r.exchange.isNotEmpty)
                                      Text(r.exchange,
                                          style: AppTypography.xs
                                              .copyWith(color: c.textMuted)),
                                    Text(r.type,
                                        style: AppTypography.xs
                                            .copyWith(color: c.accent)),
                                  ],
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
