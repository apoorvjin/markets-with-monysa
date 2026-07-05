import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/restart_widget.dart';
import '../../core/theme/app_palette.dart';
import '../../core/theme/app_typography.dart';
import '../../core/theme/app_spacing.dart';
import '../../providers/chart_provider_provider.dart';

class SettingsSheet extends ConsumerWidget {
  const SettingsSheet({super.key});

  static void show(BuildContext context) {
    showModalBottomSheet(
      context: context,
      backgroundColor: context.colors.surface,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => const SettingsSheet(),
    );
  }

  Future<void> _confirmSwitch(
      BuildContext context, WidgetRef ref, ChartDataProvider next) async {
    final c = context.colors;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: c.surface,
        shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(AppRadius.md)),
        title: Text('Switch Chart Provider',
            style: AppTypography.headingSm.copyWith(color: c.textPrimary)),
        content: Text(
          'Switching to ${next.label} will restart the app. Continue?',
          style: AppTypography.md.copyWith(color: c.textSecondary),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: Text('No',
                style: AppTypography.labelMd.copyWith(color: c.textMuted)),
          ),
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            child: Text('Yes',
                style: AppTypography.labelMd.copyWith(color: c.accent)),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    await ref.read(chartProviderProvider.notifier).set(next);
    if (context.mounted) RestartWidget.restartApp(context);
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final current = ref.watch(chartProviderProvider);

    return Padding(
      padding: EdgeInsets.fromLTRB(
        AppSpacing.s5,
        AppSpacing.s4,
        AppSpacing.s5,
        AppSpacing.s5 + MediaQuery.of(context).padding.bottom,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
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
          Text(
            'Settings',
            style: AppTypography.headingMd.copyWith(color: c.textPrimary),
          ),
          const SizedBox(height: AppSpacing.s5),
          Text(
            'CHART PROVIDER',
            style: AppTypography.labelSm.copyWith(
              color: c.textMuted,
              letterSpacing: 1.2,
            ),
          ),
          const SizedBox(height: AppSpacing.s3),
          Container(
            padding: const EdgeInsets.symmetric(
              horizontal: AppSpacing.s4,
              vertical: AppSpacing.s2,
            ),
            decoration: BoxDecoration(
              color: c.surfaceCard,
              borderRadius: BorderRadius.circular(AppRadius.md),
              border: Border.all(color: c.border),
            ),
            child: DropdownButton<ChartDataProvider>(
              value: current,
              isExpanded: true,
              underline: const SizedBox.shrink(),
              dropdownColor: c.surface,
              icon: Icon(Icons.keyboard_arrow_down_rounded,
                  color: c.textMuted, size: 20),
              style: AppTypography.md.copyWith(color: c.textPrimary),
              items: ChartDataProvider.values
                  .map(
                    (p) => DropdownMenuItem(
                      value: p,
                      child: Text(p.label),
                    ),
                  )
                  .toList(),
              onChanged: (p) {
                if (p != null && p != current) {
                  _confirmSwitch(context, ref, p);
                }
              },
            ),
          ),
          const SizedBox(height: AppSpacing.s3),
          Text(
            switch (current) {
              ChartDataProvider.yahoo =>
                'Yahoo Finance: fast candles with volume and VWAP overlay.',
              ChartDataProvider.tradingView =>
                'TradingView: real TradingView charts for major metals, energy, '
                    'crypto and forex; other symbols use the Yahoo chart automatically.',
              ChartDataProvider.inHouse =>
                'In-House: native chart with SMA/EMA, Bollinger, Ichimoku, RSI, '
                    'MACD, VWAP and support/resistance.',
            },
            style: AppTypography.sm.copyWith(color: c.textMuted),
          ),
          const SizedBox(height: AppSpacing.s3),
        ],
      ),
    );
  }
}
