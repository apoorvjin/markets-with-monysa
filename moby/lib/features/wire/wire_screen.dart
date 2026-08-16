import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/theme/app_palette.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/theme/app_typography.dart';
import '../../data/models/wire.dart';
import '../../data/repositories/wire_repository.dart';
import '../../shared/widgets/app_shell_insets.dart';
import '../../shared/widgets/error_view.dart';
import '../../shared/widgets/freshness_bar.dart';
import '../../shared/widgets/max_width_layout.dart';
import '../../shared/widgets/shimmer_list.dart';
import '../../shared/widgets/theme_toggle.dart';

/// Wire — the News/OSINT terminal ported from web (`WirePage.tsx`). Mobile
/// adaptation: web shows every desk as a column; here one desk is selected via
/// chips and its headlines render as a list, with a cross-desk breaking banner
/// on top. Read-only feed (tapping a headline opens the source article).
class WireScreen extends StatefulWidget {
  const WireScreen({super.key});

  @override
  State<WireScreen> createState() => _WireScreenState();
}

class _WireScreenState extends State<WireScreen> {
  WireDesk _selected = WireDesk.intel;
  late Future<WireDeskItems> _itemsFuture;
  late Future<WireDeskItems> _breakingFuture;

  @override
  void initState() {
    super.initState();
    _itemsFuture = WireRepository.instance.fetchItems(_selected);
    _breakingFuture = WireRepository.instance.fetchBreaking();
  }

  void _selectDesk(WireDesk desk) {
    if (desk == _selected) return;
    setState(() {
      _selected = desk;
      _itemsFuture = WireRepository.instance.fetchItems(desk);
    });
  }

  Future<void> _refresh() async {
    final items = WireRepository.instance.fetchItems(_selected, force: true);
    final breaking = WireRepository.instance.fetchBreaking(force: true);
    setState(() {
      _itemsFuture = items;
      _breakingFuture = breaking;
    });
    await Future.wait([items, breaking]);
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Wire'),
        actions: const [ThemeToggleButton()],
      ),
      body: MaxWidthLayout(
        child: Column(
          children: [
            _DeskChips(selected: _selected, onSelect: _selectDesk),
            _BreakingBanner(future: _breakingFuture),
            Expanded(
              child: RefreshIndicator(
                color: c.accent,
                onRefresh: _refresh,
                child: FutureBuilder<WireDeskItems>(
                  future: _itemsFuture,
                  builder: (context, snap) {
                    if (snap.connectionState == ConnectionState.waiting) {
                      return const ShimmerList(count: 8);
                    }
                    if (snap.hasError) {
                      return ListView(
                        children: [
                          const SizedBox(height: 80),
                          ErrorView(
                            message: 'Could not load the ${_selected.label} desk.',
                            onRetry: _refresh,
                          ),
                        ],
                      );
                    }
                    final data = snap.data;
                    final items = data?.items ?? const <WireItem>[];
                    if (items.isEmpty) {
                      return ListView(
                        children: [
                          const SizedBox(height: 120),
                          Center(
                            child: Text('No headlines on this desk.',
                                style: AppTypography.sm
                                    .copyWith(color: c.textMuted)),
                          ),
                        ],
                      );
                    }
                    return ListView.builder(
                      padding: EdgeInsets.only(
                        top: AppSpacing.s2,
                        bottom: appShellBottomInset(context) + AppSpacing.s4,
                      ),
                      itemCount: items.length + (data?.lastUpdated != null ? 1 : 0),
                      itemBuilder: (context, i) {
                        if (i == items.length && data?.lastUpdated != null) {
                          return FreshnessBar(lastUpdated: data!.lastUpdated!);
                        }
                        return _WireRow(item: items[i]);
                      },
                    );
                  },
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ── Desk selector chips ──────────────────────────────────────────────────────

class _DeskChips extends StatelessWidget {
  const _DeskChips({required this.selected, required this.onSelect});
  final WireDesk selected;
  final ValueChanged<WireDesk> onSelect;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return SizedBox(
      height: 46,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.s5, vertical: AppSpacing.s2),
        itemCount: WireDesk.values.length,
        separatorBuilder: (_, __) => const SizedBox(width: AppSpacing.s2),
        itemBuilder: (context, i) {
          final desk = WireDesk.values[i];
          final active = desk == selected;
          return GestureDetector(
            onTap: () => onSelect(desk),
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 160),
              padding: const EdgeInsets.symmetric(
                  horizontal: AppSpacing.s4, vertical: AppSpacing.s2),
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: active ? c.accentDim18 : c.surface,
                borderRadius: BorderRadius.circular(AppRadius.full),
                border: Border.all(
                  color: active ? c.accent : c.border,
                  width: active ? 1 : 0.5,
                ),
              ),
              child: Text(
                desk.label,
                style: AppTypography.labelMd.copyWith(
                  color: active ? c.accent : c.textSecondary,
                  fontWeight: active ? FontWeight.w600 : FontWeight.w500,
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}

// ── Breaking banner ──────────────────────────────────────────────────────────

class _BreakingBanner extends StatelessWidget {
  const _BreakingBanner({required this.future});
  final Future<WireDeskItems> future;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return FutureBuilder<WireDeskItems>(
      future: future,
      builder: (context, snap) {
        final items = snap.data?.items ?? const <WireItem>[];
        if (items.isEmpty) return const SizedBox.shrink();
        final top = items.first;
        return InkWell(
          onTap: () => _openLink(top.link),
          child: Container(
            width: double.infinity,
            margin: const EdgeInsets.fromLTRB(
                AppSpacing.s5, AppSpacing.s2, AppSpacing.s5, AppSpacing.s1),
            padding: const EdgeInsets.symmetric(
                horizontal: AppSpacing.s4, vertical: AppSpacing.s3),
            decoration: BoxDecoration(
              color: c.dangerDim,
              borderRadius: BorderRadius.circular(AppRadius.md),
              border: Border.all(color: c.danger, width: 0.5),
            ),
            child: Row(
              children: [
                _Pill(
                    label: items.length > 1
                        ? 'BREAKING · ${items.length}'
                        : 'BREAKING',
                    color: c.danger),
                const SizedBox(width: AppSpacing.s3),
                Expanded(
                  child: Text(
                    top.title,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: AppTypography.sm.copyWith(
                        color: c.textPrimary, fontWeight: FontWeight.w600),
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}

// ── Item row ─────────────────────────────────────────────────────────────────

class _WireRow extends StatelessWidget {
  const _WireRow({required this.item});
  final WireItem item;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final sev = item.severity;
    final cat = item.category;
    return InkWell(
      onTap: () => _openLink(item.link),
      child: Container(
        padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.s5, vertical: AppSpacing.s4),
        decoration: BoxDecoration(
          border: Border(bottom: BorderSide(color: c.border, width: 0.5)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Flexible(
                  child: Text(
                    item.source,
                    overflow: TextOverflow.ellipsis,
                    style: AppTypography.xs.copyWith(
                        color: c.textMuted, fontWeight: FontWeight.w600),
                  ),
                ),
                if (sev != 'normal') ...[
                  const SizedBox(width: AppSpacing.s2),
                  _Pill(label: sev.toUpperCase(), color: _sevColor(c, sev)),
                ],
                if (cat != 'general') ...[
                  const SizedBox(width: AppSpacing.s2),
                  _Pill(label: cat.toUpperCase(), color: c.textFaint, faint: true),
                ],
                const Spacer(),
                if (item.pubDate.isNotEmpty)
                  Text(_timeAgo(item.pubDate),
                      style: AppTypography.xs.copyWith(color: c.textFaint)),
              ],
            ),
            const SizedBox(height: AppSpacing.s2),
            Text(
              item.title,
              style: AppTypography.sm
                  .copyWith(color: c.textPrimary, height: 1.35),
            ),
            if (item.tickers.isNotEmpty) ...[
              const SizedBox(height: AppSpacing.s3),
              Wrap(
                spacing: AppSpacing.s2,
                runSpacing: AppSpacing.s2,
                children: item.tickers
                    .map((t) => _TickerChip(symbol: t))
                    .toList(),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _TickerChip extends StatelessWidget {
  const _TickerChip({required this.symbol});
  final String symbol;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return GestureDetector(
      onTap: () => context.go('/asset/$symbol'),
      child: Container(
        padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.s3, vertical: AppSpacing.s1),
        decoration: BoxDecoration(
          color: c.accentDim18,
          borderRadius: BorderRadius.circular(AppRadius.sm),
          border: Border.all(color: c.accent, width: 0.5),
        ),
        child: Text('\$$symbol',
            style: AppTypography.xs
                .copyWith(color: c.accent, fontWeight: FontWeight.w700)),
      ),
    );
  }
}

class _Pill extends StatelessWidget {
  const _Pill({required this.label, required this.color, this.faint = false});
  final String label;
  final Color color;
  final bool faint;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: faint ? Colors.transparent : color.withAlpha(30),
        borderRadius: BorderRadius.circular(AppRadius.xs),
        border: Border.all(color: color.withAlpha(faint ? 110 : 160), width: 0.5),
      ),
      child: Text(
        label,
        style: AppTypography.xs.copyWith(
          color: color,
          fontWeight: FontWeight.w700,
          fontSize: 9.5,
          letterSpacing: 0.4,
        ),
      ),
    );
  }
}

Color _sevColor(AppPalette c, String sev) => switch (sev) {
      'breaking' => c.danger,
      'alert' => c.warning,
      'caution' => c.warning,
      _ => c.textMuted,
    };

String _timeAgo(String iso) {
  try {
    final dt = DateTime.parse(iso).toLocal();
    final diff = DateTime.now().difference(dt);
    if (diff.inSeconds < 60) return 'just now';
    if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
    if (diff.inHours < 24) return '${diff.inHours}h ago';
    return '${diff.inDays}d ago';
  } catch (_) {
    return '';
  }
}

Future<void> _openLink(String url) async {
  if (url.isEmpty) return;
  final uri = Uri.tryParse(url);
  if (uri == null) return;
  if (await canLaunchUrl(uri)) {
    await launchUrl(uri, mode: LaunchMode.externalApplication);
  }
}
