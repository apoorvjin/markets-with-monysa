import 'dart:async';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme/app_palette.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/theme/app_typography.dart';
import '../../services/auth_service.dart';

class EmailVerificationScreen extends StatefulWidget {
  const EmailVerificationScreen({super.key});

  @override
  State<EmailVerificationScreen> createState() =>
      _EmailVerificationScreenState();
}

class _EmailVerificationScreenState extends State<EmailVerificationScreen> {
  Timer? _pollTimer;
  Timer? _resendTimer;
  int _resendCooldown = 0;
  bool _resending = false;
  String? _error;

  String get _email =>
      FirebaseAuth.instance.currentUser?.email ?? '';

  @override
  void initState() {
    super.initState();
    _startPolling();
  }

  @override
  void dispose() {
    _pollTimer?.cancel();
    _resendTimer?.cancel();
    super.dispose();
  }

  void _startPolling() {
    _pollTimer = Timer.periodic(const Duration(seconds: 3), (_) async {
      try {
        await FirebaseAuth.instance.currentUser?.reload();
        final verified =
            FirebaseAuth.instance.currentUser?.emailVerified ?? false;
        if (verified && mounted) {
          _pollTimer?.cancel();
          context.go('/markets');
        }
      } catch (_) {}
    });
  }

  Future<void> _resend() async {
    setState(() {
      _resending = true;
      _error = null;
    });
    try {
      await AuthService.resendEmailVerification();
      _startResendCooldown();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Verification email sent to $_email'),
            behavior: SnackBarBehavior.floating,
          ),
        );
      }
    } on AuthException catch (e) {
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _resending = false);
    }
  }

  void _startResendCooldown() {
    setState(() => _resendCooldown = 60);
    _resendTimer = Timer.periodic(const Duration(seconds: 1), (t) {
      if (!mounted) {
        t.cancel();
        return;
      }
      setState(() => _resendCooldown--);
      if (_resendCooldown <= 0) t.cancel();
    });
  }

  Future<void> _wrongEmail() async {
    await AuthService.signOut();
    if (mounted) context.go('/auth');
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final canResend = _resendCooldown <= 0 && !_resending;

    return Scaffold(
      backgroundColor: c.background,
      appBar: AppBar(
        backgroundColor: c.background,
        elevation: 0,
        automaticallyImplyLeading: false,
        title: Text(
          'Verify Your Email',
          style: AppTypography.headingMd.copyWith(color: c.textPrimary),
        ),
      ),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.s6),
          child: Column(
            children: [
              const Spacer(),
              Container(
                width: 80,
                height: 80,
                decoration: BoxDecoration(
                  color: c.accent.withAlpha(20),
                  shape: BoxShape.circle,
                  border: Border.all(color: c.accent.withAlpha(60)),
                ),
                child: Icon(
                  Icons.mark_email_unread_outlined,
                  size: 38,
                  color: c.accent,
                ),
              ),
              const SizedBox(height: AppSpacing.s6),
              Text(
                'Check your inbox',
                style: AppTypography.headingMd.copyWith(color: c.textPrimary),
              ),
              const SizedBox(height: AppSpacing.s3),
              Text(
                'We sent a verification link to',
                style: AppTypography.md.copyWith(color: c.textSecondary),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: AppSpacing.s2),
              Text(
                _email,
                style: AppTypography.labelMd.copyWith(
                  color: c.textPrimary,
                  fontWeight: FontWeight.w600,
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: AppSpacing.s4),
              Text(
                'Click the link in the email to verify your account.\nThis screen will advance automatically.',
                style: AppTypography.sm.copyWith(
                  color: c.textMuted,
                  height: 1.6,
                ),
                textAlign: TextAlign.center,
              ),
              if (_error != null) ...[
                const SizedBox(height: AppSpacing.s4),
                Container(
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
              ],
              const Spacer(),
              // Resend
              SizedBox(
                width: double.infinity,
                child: OutlinedButton(
                  onPressed: canResend ? _resend : null,
                  style: OutlinedButton.styleFrom(
                    foregroundColor: c.accent,
                    side: BorderSide(
                      color: canResend ? c.accent : c.border,
                    ),
                    padding: const EdgeInsets.symmetric(
                        vertical: AppSpacing.s4),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(AppRadius.md),
                    ),
                  ),
                  child: Text(
                    _resendCooldown > 0
                        ? 'Resend in ${_resendCooldown}s'
                        : 'Resend Email',
                    style: AppTypography.labelLg.copyWith(
                      color: canResend ? c.accent : c.textMuted,
                    ),
                  ),
                ),
              ),
              const SizedBox(height: AppSpacing.s3),
              TextButton(
                onPressed: _wrongEmail,
                child: Text(
                  'Wrong email? Start over',
                  style: AppTypography.sm.copyWith(color: c.textMuted),
                ),
              ),
              const SizedBox(height: AppSpacing.s5),
            ],
          ),
        ),
      ),
    );
  }
}
