import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
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
            'CHART DATA PROVIDER',
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
                if (p != null) ref.read(chartProviderProvider.notifier).set(p);
              },
            ),
          ),
          const SizedBox(height: AppSpacing.s3),
          Text(
            'Yahoo Finance is free and requires no API key.',
            style: AppTypography.sm.copyWith(color: c.textMuted),
          ),
          const SizedBox(height: AppSpacing.s3),
        ],
      ),
    );
  }
}
