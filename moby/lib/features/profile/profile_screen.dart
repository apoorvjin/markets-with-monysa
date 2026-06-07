import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/theme/app_palette.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/theme/app_typography.dart';
import '../../core/restart_widget.dart';
import '../../providers/chart_provider_provider.dart';
import '../../providers/font_size_provider.dart';
import '../../providers/strategy_provider.dart';
import '../../providers/theme_provider.dart';
import '../../services/entitlement_service.dart';

class ProfileScreen extends ConsumerWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    return Scaffold(
      backgroundColor: c.background,
      appBar: AppBar(
        title: Text('Profile',
            style: AppTypography.headingMd.copyWith(color: c.textPrimary)),
        backgroundColor: c.headerBg,
        elevation: 0,
      ),
      body: ListView(
        padding: EdgeInsets.fromLTRB(
          AppSpacing.s5,
          AppSpacing.s5,
          AppSpacing.s5,
          AppSpacing.s5 + MediaQuery.of(context).padding.bottom,
        ),
        children: const [
          _IdentityHeader(),
          SizedBox(height: AppSpacing.s5),
          _SubscriptionCard(),
          SizedBox(height: AppSpacing.s6),
          _ThemeSection(),
          SizedBox(height: AppSpacing.s6),
          _FontSizeSection(),
          SizedBox(height: AppSpacing.s6),
          _ChartProviderSection(),
          SizedBox(height: AppSpacing.s6),
          _DevPlanSection(),
          SizedBox(height: AppSpacing.s6),
          _AboutSection(),
        ],
      ),
    );
  }
}

// ── Identity Header ───────────────────────────────────────────────────────────

class _IdentityHeader extends StatelessWidget {
  const _IdentityHeader();

  void _comingSoon(BuildContext context) {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('Account features coming soon.'),
        duration: Duration(seconds: 2),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Column(
      children: [
        CircleAvatar(
          radius: 40,
          backgroundColor: c.surfaceCard,
          child: Icon(Icons.person_rounded, size: 40, color: c.textMuted),
        ),
        const SizedBox(height: AppSpacing.s3),
        Text(
          'Guest',
          style: AppTypography.headingSm.copyWith(color: c.textPrimary),
        ),
        const SizedBox(height: AppSpacing.s2),
        Text(
          'Sign in to sync your preferences and alerts',
          style: AppTypography.sm.copyWith(color: c.textMuted),
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: AppSpacing.s4),
        Row(
          children: [
            Expanded(
              child: OutlinedButton(
                onPressed: () => _comingSoon(context),
                style: OutlinedButton.styleFrom(
                  foregroundColor: c.accent,
                  side: BorderSide(color: c.accent),
                  padding:
                      const EdgeInsets.symmetric(vertical: AppSpacing.s3),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(AppRadius.md),
                  ),
                ),
                child: Text('Sign In',
                    style: AppTypography.labelMd
                        .copyWith(color: c.accent)),
              ),
            ),
            const SizedBox(width: AppSpacing.s3),
            Expanded(
              child: OutlinedButton(
                onPressed: () => _comingSoon(context),
                style: OutlinedButton.styleFrom(
                  foregroundColor: c.textSecondary,
                  side: BorderSide(color: c.border),
                  padding:
                      const EdgeInsets.symmetric(vertical: AppSpacing.s3),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(AppRadius.md),
                  ),
                ),
                child: Text('Create Account',
                    style: AppTypography.labelMd
                        .copyWith(color: c.textSecondary)),
              ),
            ),
          ],
        ),
      ],
    );
  }
}

// ── Subscription Card ─────────────────────────────────────────────────────────

class _SubscriptionCard extends StatelessWidget {
  const _SubscriptionCard();

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Container(
      padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.s5, vertical: AppSpacing.s4),
      decoration: BoxDecoration(
        color: c.surfaceCard,
        borderRadius: BorderRadius.circular(AppRadius.md),
        border: Border.all(color: c.border),
      ),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.symmetric(
                horizontal: AppSpacing.s3, vertical: AppSpacing.s1),
            decoration: BoxDecoration(
              color: c.accentDim,
              borderRadius: BorderRadius.circular(AppRadius.full),
            ),
            child: Text(
              'FREE',
              style: AppTypography.labelSm.copyWith(
                  color: c.accent, fontWeight: FontWeight.w700),
            ),
          ),
          const SizedBox(width: AppSpacing.s3),
          Expanded(
            child: Text(
              'Free Plan',
              style: AppTypography.md.copyWith(color: c.textPrimary),
            ),
          ),
          GestureDetector(
            onTap: () => ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(
                content: Text('Pro plan coming soon.'),
                duration: Duration(seconds: 2),
              ),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  'Upgrade to Pro',
                  style: AppTypography.labelMd.copyWith(color: c.accent),
                ),
                const SizedBox(width: 4),
                Icon(Icons.arrow_forward_ios_rounded,
                    size: 12, color: c.accent),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// ── Theme Section ─────────────────────────────────────────────────────────────

class _ThemeSection extends ConsumerWidget {
  const _ThemeSection();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final current = ref.watch(themeModeProvider);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'THEME',
          style: AppTypography.labelSm.copyWith(
            color: c.textMuted,
            letterSpacing: 1.2,
          ),
        ),
        const SizedBox(height: AppSpacing.s3),
        Container(
          decoration: BoxDecoration(
            color: c.surfaceCard,
            borderRadius: BorderRadius.circular(AppRadius.md),
            border: Border.all(color: c.border),
          ),
          padding: const EdgeInsets.all(AppSpacing.s2),
          child: Row(
            children: [
              _ThemeChip(
                label: 'Light',
                icon: Icons.wb_sunny_rounded,
                mode: ThemeMode.light,
                selected: current == ThemeMode.light,
              ),
              _ThemeChip(
                label: 'Dark',
                icon: Icons.nightlight_round,
                mode: ThemeMode.dark,
                selected: current == ThemeMode.dark,
              ),
              _ThemeChip(
                label: 'Auto',
                icon: Icons.brightness_auto_rounded,
                mode: ThemeMode.system,
                selected: current == ThemeMode.system,
              ),
            ],
          ),
        ),
        const SizedBox(height: AppSpacing.s3),
        Text(
          "Auto follows your device's system appearance.",
          style: AppTypography.sm.copyWith(color: c.textMuted),
        ),
      ],
    );
  }
}

class _ThemeChip extends ConsumerWidget {
  const _ThemeChip({
    required this.label,
    required this.icon,
    required this.mode,
    required this.selected,
  });

  final String label;
  final IconData icon;
  final ThemeMode mode;
  final bool selected;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    return Expanded(
      child: GestureDetector(
        onTap: () => ref.read(themeModeProvider.notifier).setMode(mode),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 180),
          margin: const EdgeInsets.all(2),
          padding: const EdgeInsets.symmetric(
              vertical: AppSpacing.s3, horizontal: AppSpacing.s2),
          decoration: BoxDecoration(
            color: selected ? c.accent : Colors.transparent,
            borderRadius: BorderRadius.circular(AppRadius.sm),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                icon,
                size: 18,
                color: selected ? c.background : c.textMuted,
              ),
              const SizedBox(height: 4),
              Text(
                label,
                style: AppTypography.labelSm.copyWith(
                  color: selected ? c.background : c.textMuted,
                  fontWeight:
                      selected ? FontWeight.w700 : FontWeight.w400,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ── Font Size Section ─────────────────────────────────────────────────────────

class _FontSizeSection extends ConsumerWidget {
  const _FontSizeSection();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final current = ref.watch(fontSizeScaleProvider);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'FONT SIZE',
          style: AppTypography.labelSm.copyWith(
            color: c.textMuted,
            letterSpacing: 1.2,
          ),
        ),
        const SizedBox(height: AppSpacing.s3),
        Container(
          decoration: BoxDecoration(
            color: c.surfaceCard,
            borderRadius: BorderRadius.circular(AppRadius.md),
            border: Border.all(color: c.border),
          ),
          padding: const EdgeInsets.all(AppSpacing.s2),
          child: Row(
            children: FontSizeScale.values
                .map((scale) => _FontSizeChip(scale: scale, selected: current == scale))
                .toList(),
          ),
        ),
        const SizedBox(height: AppSpacing.s3),
        Text(
          'Adjusts text size across the entire app.',
          style: AppTypography.sm.copyWith(color: c.textMuted),
        ),
      ],
    );
  }
}

class _FontSizeChip extends ConsumerWidget {
  const _FontSizeChip({required this.scale, required this.selected});

  final FontSizeScale scale;
  final bool selected;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    return Expanded(
      child: GestureDetector(
        onTap: () => ref.read(fontSizeScaleProvider.notifier).setScale(scale),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 180),
          margin: const EdgeInsets.all(2),
          padding: const EdgeInsets.symmetric(
              vertical: AppSpacing.s3, horizontal: AppSpacing.s2),
          decoration: BoxDecoration(
            color: selected ? c.accent : Colors.transparent,
            borderRadius: BorderRadius.circular(AppRadius.sm),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                scale.chip,
                style: TextStyle(
                  fontSize: scale == FontSizeScale.regular ? 14 : 16,
                  fontWeight: FontWeight.w700,
                  color: selected ? c.background : c.textMuted,
                ),
              ),
              const SizedBox(height: 3),
              Text(
                scale.label,
                style: AppTypography.labelSm.copyWith(
                  color: selected ? c.background : c.textMuted,
                  fontWeight: selected ? FontWeight.w700 : FontWeight.w400,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ── Chart Data Provider Section ───────────────────────────────────────────────

Future<void> _confirmChartProviderSwitch(
  BuildContext context,
  WidgetRef ref,
  ChartDataProvider next,
) async {
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

class _ChartProviderSection extends ConsumerWidget {
  const _ChartProviderSection();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final current = ref.watch(chartProviderProvider);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
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
                _confirmChartProviderSwitch(context, ref, p);
              }
            },
          ),
        ),
        const SizedBox(height: AppSpacing.s3),
        Text(
          switch (current) {
            ChartDataProvider.tradingView =>
              'TradingView: full-featured live charts with 100+ indicators.',
            ChartDataProvider.inHouse =>
              'In-House: native renderer with configurable SMAs, support/resistance levels, and 1D/1W intraday ranges.',
            ChartDataProvider.yahoo =>
              'Yahoo Finance: fast candles with volume and VWAP overlay.',
          },
          style: AppTypography.sm.copyWith(color: c.textMuted),
        ),
      ],
    );
  }
}

// ── Dev Plan Simulator ────────────────────────────────────────────────────────

Plan? _planFromPrefs(String? name) {
  if (name == null) return null;
  for (final p in Plan.values) {
    if (p.name == name) return p;
  }
  return null;
}

Future<void> _switchSimulatedPlan(
  BuildContext context,
  WidgetRef ref,
  Plan plan,
) async {
  final c = context.colors;
  final prefs = ref.read(sharedPreferencesProvider);
  final current = _planFromPrefs(prefs.getString('dev_simulated_plan')) ?? Plan.free;
  if (plan == current) return;

  final confirmed = await showDialog<bool>(
    context: context,
    builder: (ctx) => AlertDialog(
      backgroundColor: c.surface,
      shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppRadius.md)),
      title: Text('Switch to ${plan.name[0].toUpperCase()}${plan.name.substring(1)} Plan',
          style: AppTypography.headingSm.copyWith(color: c.textPrimary)),
      content: Text(
        'Simulating the ${plan.name} tier requires a restart. Continue?',
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
          child: Text('Restart',
              style: AppTypography.labelMd.copyWith(color: c.warning)),
        ),
      ],
    ),
  );
  if (confirmed != true) return;
  await prefs.setString('dev_simulated_plan', plan.name);
  EntitlementService.setSimulatedPlan(plan);
  if (context.mounted) RestartWidget.restartApp(context);
}

class _DevPlanSection extends ConsumerWidget {
  const _DevPlanSection();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final prefs = ref.watch(sharedPreferencesProvider);
    final current =
        _planFromPrefs(prefs.getString('dev_simulated_plan')) ?? Plan.free;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Text(
              'PLAN SIMULATOR',
              style: AppTypography.labelSm.copyWith(
                color: c.textMuted,
                letterSpacing: 1.2,
              ),
            ),
            const SizedBox(width: AppSpacing.s2),
            Container(
              padding: const EdgeInsets.symmetric(
                  horizontal: AppSpacing.s2, vertical: 2),
              decoration: BoxDecoration(
                color: c.warning.withAlpha(30),
                borderRadius: BorderRadius.circular(AppRadius.full),
              ),
              child: Text(
                'DEV',
                style: AppTypography.labelSm.copyWith(
                  color: c.warning,
                  fontWeight: FontWeight.w700,
                  fontSize: 9,
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: AppSpacing.s3),
        Container(
          decoration: BoxDecoration(
            color: c.surfaceCard,
            borderRadius: BorderRadius.circular(AppRadius.md),
            border: Border.all(color: c.warning.withAlpha(60)),
          ),
          padding: const EdgeInsets.all(AppSpacing.s2),
          child: Row(
            children: [
              _PlanChip(
                  plan: Plan.free,
                  label: 'Free',
                  current: current),
              _PlanChip(
                  plan: Plan.pro,
                  label: 'Pro',
                  current: current),
              _PlanChip(
                  plan: Plan.insight,
                  label: 'Insight',
                  current: current),
            ],
          ),
        ),
        const SizedBox(height: AppSpacing.s3),
        Text(
          'Temporarily simulates a subscription tier. Requires restart.',
          style: AppTypography.sm.copyWith(color: c.textMuted),
        ),
      ],
    );
  }
}

class _PlanChip extends ConsumerWidget {
  const _PlanChip({
    required this.plan,
    required this.label,
    required this.current,
  });

  final Plan plan;
  final String label;
  final Plan current;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final selected = plan == current;
    return Expanded(
      child: GestureDetector(
        onTap: () => _switchSimulatedPlan(context, ref, plan),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 180),
          margin: const EdgeInsets.all(2),
          padding: const EdgeInsets.symmetric(
              vertical: AppSpacing.s3, horizontal: AppSpacing.s2),
          decoration: BoxDecoration(
            color: selected ? c.warning : Colors.transparent,
            borderRadius: BorderRadius.circular(AppRadius.sm),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                plan == Plan.free
                    ? Icons.lock_open_rounded
                    : plan == Plan.pro
                        ? Icons.star_rounded
                        : Icons.diamond_rounded,
                size: 16,
                color: selected ? c.background : c.textMuted,
              ),
              const SizedBox(height: 4),
              Text(
                label,
                style: AppTypography.labelSm.copyWith(
                  color: selected ? c.background : c.textMuted,
                  fontWeight: selected ? FontWeight.w700 : FontWeight.w400,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ── About Section ─────────────────────────────────────────────────────────────

class _AboutSection extends StatelessWidget {
  const _AboutSection();

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'ABOUT',
          style: AppTypography.labelSm.copyWith(
            color: c.textMuted,
            letterSpacing: 1.2,
          ),
        ),
        const SizedBox(height: AppSpacing.s3),
        Container(
          decoration: BoxDecoration(
            color: c.surfaceCard,
            borderRadius: BorderRadius.circular(AppRadius.md),
            border: Border.all(color: c.border),
          ),
          child: Column(
            children: [
              const _AboutRow(label: 'App', value: 'Moby'),
              Divider(height: 1, color: c.border),
              const _AboutRow(label: 'Version', value: '1.0.0'),
            ],
          ),
        ),
      ],
    );
  }
}

class _AboutRow extends StatelessWidget {
  const _AboutRow({required this.label, required this.value});
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Padding(
      padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.s4, vertical: AppSpacing.s3),
      child: Row(
        children: [
          Text(label,
              style: AppTypography.md.copyWith(color: c.textSecondary)),
          const Spacer(),
          Text(value,
              style: AppTypography.md.copyWith(color: c.textPrimary)),
        ],
      ),
    );
  }
}
