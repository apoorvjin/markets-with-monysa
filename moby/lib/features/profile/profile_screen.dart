import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme/app_palette.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/theme/app_typography.dart';
import '../../core/restart_widget.dart';
import '../../providers/auth_provider.dart';
import '../../providers/chart_provider_provider.dart';
import '../../providers/font_size_provider.dart';
import '../../providers/strategy_provider.dart';
import '../../providers/theme_provider.dart';
import '../../services/auth_service.dart';
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
          _IdentitySection(),
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
          _AccountActionsSection(),
          SizedBox(height: AppSpacing.s6),
          _AboutSection(),
        ],
      ),
    );
  }
}

// ── Identity Section ──────────────────────────────────────────────────────────

class _IdentitySection extends ConsumerWidget {
  const _IdentitySection();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final userAsync = ref.watch(authStateProvider);
    return userAsync.when(
      data: (user) =>
          user != null ? _LoggedInHeader(user: user) : const SizedBox.shrink(),
      loading: () => const SizedBox(height: 80),
      error: (_, __) => const SizedBox.shrink(),
    );
  }
}

class _LoggedInHeader extends StatelessWidget {
  const _LoggedInHeader({required this.user});
  final User user;

  String get _initials {
    final email = user.email ?? '';
    return email.isNotEmpty ? email[0].toUpperCase() : '?';
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final email = user.email ?? '';

    return Column(
      children: [
        CircleAvatar(
          radius: 40,
          backgroundColor: c.accentDim,
          child: Text(
            _initials,
            style: AppTypography.headingLg.copyWith(
              color: c.accent,
              fontWeight: FontWeight.w700,
            ),
          ),
        ),
        const SizedBox(height: AppSpacing.s3),
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text(
              email,
              style: AppTypography.md.copyWith(color: c.textPrimary),
            ),
            if (user.emailVerified) ...[
              const SizedBox(width: AppSpacing.s2),
              Icon(Icons.verified_rounded, color: c.accent, size: 16),
            ],
          ],
        ),
        if (!user.emailVerified) ...[
          const SizedBox(height: AppSpacing.s2),
          Container(
            padding: const EdgeInsets.symmetric(
                horizontal: AppSpacing.s3, vertical: 3),
            decoration: BoxDecoration(
              color: c.warning.withAlpha(25),
              borderRadius: BorderRadius.circular(AppRadius.full),
              border: Border.all(color: c.warning.withAlpha(80)),
            ),
            child: Text(
              'Email not verified',
              style: AppTypography.xs.copyWith(color: c.warning),
            ),
          ),
        ],
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
                .map((scale) =>
                    _FontSizeChip(scale: scale, selected: current == scale))
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
  final current =
      _planFromPrefs(prefs.getString('dev_simulated_plan')) ?? Plan.free;
  if (plan == current) return;

  final confirmed = await showDialog<bool>(
    context: context,
    builder: (ctx) => AlertDialog(
      backgroundColor: c.surface,
      shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppRadius.md)),
      title: Text(
          'Switch to ${plan.name[0].toUpperCase()}${plan.name.substring(1)} Plan',
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
              _PlanChip(plan: Plan.free, label: 'Free', current: current),
              _PlanChip(plan: Plan.pro, label: 'Pro', current: current),
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
                    : Icons.star_rounded,
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

// ── Account Actions ───────────────────────────────────────────────────────────

class _AccountActionsSection extends ConsumerWidget {
  const _AccountActionsSection();

  Future<void> _signOut(BuildContext context) async {
    final c = context.colors;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: c.surface,
        shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(AppRadius.md)),
        title: Text('Sign Out',
            style: AppTypography.headingSm.copyWith(color: c.textPrimary)),
        content: Text(
          'Are you sure you want to sign out?',
          style: AppTypography.md.copyWith(color: c.textSecondary),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: Text('Cancel',
                style: AppTypography.labelMd.copyWith(color: c.textMuted)),
          ),
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            child: Text('Sign Out',
                style: AppTypography.labelMd.copyWith(color: c.danger)),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    await AuthService.signOut();
    if (context.mounted) context.go('/auth');
  }

  Future<void> _resetPassword(BuildContext context) async {
    final email = FirebaseAuth.instance.currentUser?.email;
    if (email == null) return;
    try {
      await AuthService.resetPassword(email);
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Password reset email sent to $email'),
            behavior: SnackBarBehavior.floating,
          ),
        );
      }
    } on AuthException catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(e.message), behavior: SnackBarBehavior.floating),
        );
      }
    }
  }

  Future<void> _deleteAccount(BuildContext context) async {
    final c = context.colors;
    final passwordCtrl = TextEditingController();

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: c.surface,
        shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(AppRadius.md)),
        title: Text('Delete Account',
            style: AppTypography.headingSm.copyWith(color: c.danger)),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'This permanently deletes your account and cannot be undone. Enter your password to confirm.',
              style: AppTypography.sm.copyWith(color: c.textSecondary),
            ),
            const SizedBox(height: AppSpacing.s4),
            TextField(
              controller: passwordCtrl,
              obscureText: true,
              style: AppTypography.md.copyWith(color: c.textPrimary),
              decoration: InputDecoration(
                hintText: 'Password',
                hintStyle: AppTypography.md.copyWith(color: c.textMuted),
                filled: true,
                fillColor: c.surfaceCard,
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
                  borderSide: BorderSide(color: c.danger),
                ),
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: Text('Cancel',
                style: AppTypography.labelMd.copyWith(color: c.textMuted)),
          ),
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            child: Text('Delete',
                style: AppTypography.labelMd.copyWith(color: c.danger)),
          ),
        ],
      ),
    );

    if (confirmed != true) return;
    try {
      await AuthService.deleteAccount(passwordCtrl.text);
      if (context.mounted) context.go('/auth');
    } on AuthException catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(e.message), behavior: SnackBarBehavior.floating),
        );
      }
    } finally {
      passwordCtrl.dispose();
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'ACCOUNT',
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
              _ActionRow(
                icon: Icons.lock_reset_rounded,
                label: 'Reset Password',
                onTap: () => _resetPassword(context),
              ),
              Divider(height: 1, color: c.border),
              _ActionRow(
                icon: Icons.logout_rounded,
                label: 'Sign Out',
                color: c.danger,
                onTap: () => _signOut(context),
              ),
              Divider(height: 1, color: c.border),
              _ActionRow(
                icon: Icons.delete_forever_rounded,
                label: 'Delete Account',
                color: c.danger,
                onTap: () => _deleteAccount(context),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _ActionRow extends StatelessWidget {
  const _ActionRow({
    required this.icon,
    required this.label,
    required this.onTap,
    this.color,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final effectiveColor = color ?? c.textPrimary;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(AppRadius.md),
      child: Padding(
        padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.s4, vertical: AppSpacing.s4),
        child: Row(
          children: [
            Icon(icon, size: 20, color: effectiveColor),
            const SizedBox(width: AppSpacing.s3),
            Text(label,
                style: AppTypography.md.copyWith(color: effectiveColor)),
            const Spacer(),
            Icon(Icons.chevron_right_rounded, size: 18, color: c.textMuted),
          ],
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
