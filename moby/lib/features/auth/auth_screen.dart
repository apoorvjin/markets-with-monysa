import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme/app_palette.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/theme/app_typography.dart';

class AuthScreen extends StatelessWidget {
  const AuthScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Scaffold(
      backgroundColor: c.background,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: AppSpacing.s6),
          child: Column(
            children: [
              const Spacer(flex: 2),
              // Branding
              Container(
                width: 72,
                height: 72,
                decoration: BoxDecoration(
                  color: c.accent,
                  borderRadius: BorderRadius.circular(20),
                  boxShadow: [
                    BoxShadow(
                      color: c.accent.withAlpha(80),
                      blurRadius: 32,
                      spreadRadius: 4,
                    ),
                  ],
                ),
                child: const Icon(
                  Icons.candlestick_chart_rounded,
                  color: Colors.black,
                  size: 40,
                ),
              ),
              const SizedBox(height: AppSpacing.s5),
              Text(
                'MONYSA',
                style: AppTypography.xl4.copyWith(
                  fontWeight: FontWeight.w800,
                  letterSpacing: 4,
                  color: c.textPrimary,
                ),
              ),
              const SizedBox(height: AppSpacing.s2),
              Text(
                'Global Financial Intelligence',
                style: AppTypography.md.copyWith(
                  color: c.textMuted,
                  letterSpacing: 0.5,
                ),
              ),
              const Spacer(flex: 3),
              // Actions
              SizedBox(
                width: double.infinity,
                child: FilledButton(
                  onPressed: () =>
                      context.push('/auth/email', extra: 'signin'),
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
                  onPressed: () =>
                      context.push('/auth/email', extra: 'signup'),
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
