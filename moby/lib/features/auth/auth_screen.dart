import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme/app_palette.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/theme/app_typography.dart';
import '../../services/auth_service.dart';

class AuthScreen extends StatefulWidget {
  const AuthScreen({super.key});

  @override
  State<AuthScreen> createState() => _AuthScreenState();
}

class _AuthScreenState extends State<AuthScreen> {
  bool _loading = false;
  String? _error;

  static const _features = [
    (
      icon: Icons.trending_up_rounded,
      title: 'Invest Better',
      description: 'Make confident, data-driven decisions.',
    ),
    (
      icon: Icons.candlestick_chart_rounded,
      title: 'Trade Smarter',
      description: 'Identify opportunities. Manage risk. Stay ahead.',
    ),
    (
      icon: Icons.public_rounded,
      title: 'Macro Intel — VIX, Yield, Crisis, Debt & Correlation',
      description: 'Understand the forces that move markets.',
    ),
    (
      icon: Icons.grid_view_rounded,
      title: 'Global Heatmaps',
      description: 'Visualize trends. Spot risks. Track capital flows.',
    ),
    (
      icon: Icons.psychology_rounded,
      title: 'Built-in Strategies',
      description: 'Actionable ideas. Backtested. Ready to use.',
    ),
  ];

  Future<void> _handle(Future<void> Function() action) async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      await action();
      if (mounted && AuthService.currentUser != null) context.go('/markets');
    } on AuthException catch (e) {
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Scaffold(
      backgroundColor: c.background,
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: AppSpacing.s6),
          child: Column(
            children: [
              const SizedBox(height: AppSpacing.s7),
              // Branding
              Container(
                width: 112,
                height: 112,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(28),
                  boxShadow: [
                    BoxShadow(
                      color: c.accent.withAlpha(80),
                      blurRadius: 32,
                      spreadRadius: 4,
                    ),
                  ],
                ),
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(28),
                  child: Image.asset(
                    'assets/images/app_icon.png',
                    width: 112,
                    height: 112,
                    fit: BoxFit.cover,
                  ),
                ),
              ),
              const SizedBox(height: AppSpacing.s5),
              Text(
                'FinBrio',
                style: AppTypography.xl4.copyWith(
                  fontSize: 36,
                  fontWeight: FontWeight.w900,
                  letterSpacing: 4,
                  color: c.textPrimary,
                ),
              ),
              const SizedBox(height: AppSpacing.s6),
              Row(
                children: [
                  Expanded(child: Divider(color: c.border)),
                  Padding(
                    padding: const EdgeInsets.symmetric(
                        horizontal: AppSpacing.s3),
                    child: Text(
                      'Global Financial Intelligence',
                      style: AppTypography.md.copyWith(
                        color: c.textMuted,
                        letterSpacing: 1,
                      ),
                    ),
                  ),
                  Expanded(child: Divider(color: c.border)),
                ],
              ),
              const SizedBox(height: AppSpacing.s6),
              ..._features.map((f) => Padding(
                    padding:
                        const EdgeInsets.symmetric(vertical: AppSpacing.s3),
                    child: _FeatureRow(
                      icon: f.icon,
                      title: f.title,
                      description: f.description,
                    ),
                  )),
              const SizedBox(height: AppSpacing.s7),
              // Apple sign-in — kept visible at equal weight to Google per
              // App Store Guideline 4.8.
              SizedBox(
                width: double.infinity,
                child: OutlinedButton.icon(
                  onPressed: _loading
                      ? null
                      : () => _handle(AuthService.signInWithApple),
                  icon: Icon(Icons.apple, color: c.textPrimary, size: 20),
                  label: Text(
                    'Continue with Apple',
                    style: AppTypography.labelLg.copyWith(color: c.textPrimary),
                  ),
                  style: OutlinedButton.styleFrom(
                    side: BorderSide(color: c.border),
                    padding:
                        const EdgeInsets.symmetric(vertical: AppSpacing.s4),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(AppRadius.md),
                    ),
                  ),
                ),
              ),
              const SizedBox(height: AppSpacing.s3),
              SizedBox(
                width: double.infinity,
                child: OutlinedButton.icon(
                  onPressed: _loading
                      ? null
                      : () => _handle(AuthService.signInWithGoogle),
                  icon: Icon(Icons.g_mobiledata_rounded,
                      color: c.textPrimary, size: 24),
                  label: Text(
                    'Continue with Google',
                    style: AppTypography.labelLg.copyWith(color: c.textPrimary),
                  ),
                  style: OutlinedButton.styleFrom(
                    side: BorderSide(color: c.border),
                    padding:
                        const EdgeInsets.symmetric(vertical: AppSpacing.s4),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(AppRadius.md),
                    ),
                  ),
                ),
              ),
              const SizedBox(height: AppSpacing.s5),
              Row(
                children: [
                  Expanded(child: Divider(color: c.border)),
                  Padding(
                    padding: const EdgeInsets.symmetric(
                        horizontal: AppSpacing.s3),
                    child: Text('or',
                        style: AppTypography.sm.copyWith(color: c.textMuted)),
                  ),
                  Expanded(child: Divider(color: c.border)),
                ],
              ),
              const SizedBox(height: AppSpacing.s5),
              if (_error != null) ...[
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(AppSpacing.s3),
                  decoration: BoxDecoration(
                    color: c.danger.withAlpha(20),
                    borderRadius: BorderRadius.circular(AppRadius.sm),
                    border: Border.all(color: c.danger.withAlpha(60)),
                  ),
                  child: Text(
                    _error!,
                    style: AppTypography.sm.copyWith(color: c.danger),
                    textAlign: TextAlign.center,
                  ),
                ),
                const SizedBox(height: AppSpacing.s3),
              ],
              // Actions
              SizedBox(
                width: double.infinity,
                child: FilledButton(
                  onPressed: _loading
                      ? null
                      : () => context.push('/auth/email', extra: 'signin'),
                  style: FilledButton.styleFrom(
                    backgroundColor: c.accent,
                    foregroundColor: Colors.black,
                    padding:
                        const EdgeInsets.symmetric(vertical: AppSpacing.s4),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(AppRadius.md),
                    ),
                  ),
                  child: Text(
                    'Sign In',
                    style: AppTypography.labelLg.copyWith(
                      color: Colors.black,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
              ),
              const SizedBox(height: AppSpacing.s3),
              SizedBox(
                width: double.infinity,
                child: OutlinedButton(
                  onPressed: _loading
                      ? null
                      : () => context.push('/auth/email', extra: 'signup'),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: c.textPrimary,
                    side: BorderSide(color: c.border),
                    padding:
                        const EdgeInsets.symmetric(vertical: AppSpacing.s4),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(AppRadius.md),
                    ),
                  ),
                  child: Text(
                    'Create Account',
                    style: AppTypography.labelLg
                        .copyWith(color: c.textPrimary),
                  ),
                ),
              ),
              const SizedBox(height: AppSpacing.s7),
              Text(
                'By continuing you agree to our Terms of Service\nand Privacy Policy.',
                style: AppTypography.xs.copyWith(color: c.textMuted),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: AppSpacing.s5),
            ],
          ),
        ),
      ),
    );
  }
}

class _FeatureRow extends StatelessWidget {
  const _FeatureRow({
    required this.icon,
    required this.title,
    required this.description,
  });

  final IconData icon;
  final String title;
  final String description;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: 40,
          height: 40,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            border: Border.all(color: c.accent, width: 1.5),
          ),
          child: Icon(icon, color: c.accent, size: 20),
        ),
        const SizedBox(width: AppSpacing.s4),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: AppTypography.labelLg.copyWith(
                  color: c.textPrimary,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: AppSpacing.s1 / 2),
              Text(
                description,
                style: AppTypography.sm.copyWith(color: c.textMuted),
              ),
            ],
          ),
        ),
      ],
    );
  }
}
