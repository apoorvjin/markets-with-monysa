import 'package:firebase_analytics/firebase_analytics.dart';
import 'package:flutter/services.dart';
import 'package:flutter/material.dart';
import 'package:purchases_flutter/purchases_flutter.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../core/theme/app_palette.dart';
import '../../core/theme/app_typography.dart';
import '../../core/theme/app_spacing.dart';
import '../../services/entitlement_service.dart';
import '../../services/remote_config_service.dart';

class UpgradeSheet extends StatefulWidget {
  const UpgradeSheet({super.key, required this.feature});

  /// The feature key from [EntitlementService._rules] that triggered this sheet.
  final String feature;

  static Future<void> show(BuildContext context,
      {required String feature}) async {
    FirebaseAnalytics.instance.logEvent(
      name: 'feature_gated',
      parameters: {'feature': feature},
    ).catchError((_) {});

    // Always present our own paywall sheet. We deliberately do NOT call
    // RevenueCatUI.presentPaywall(): with no paywall configured in the
    // RevenueCat dashboard it renders RevenueCat's auto-generated default
    // paywall, which shows only a logo/price/Continue — no feature list and no
    // Terms/Privacy links, which fails App Store Guideline 3.1.2(c). Our custom
    // sheet ([UpgradeSheet]) states the plan title, length, price, what Pro
    // includes, and links to Terms of Use + Privacy Policy, and still purchases
    // through RevenueCat/StoreKit via [_onPurchaseTap]. If a compliant dashboard
    // paywall is ever built and attached to the current offering, switch back to
    // presentPaywall() here.
    return showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => UpgradeSheet(feature: feature),
    );
  }

  @override
  State<UpgradeSheet> createState() => _UpgradeSheetState();
}

class _UpgradeSheetState extends State<UpgradeSheet> {
  bool _loading = false;
  String? _error;


  Future<void> _onPurchaseTap() async {
    if (!EntitlementService.isRevenueCatConfigured) {
      // SDK not configured (build shipped without REVENUECAT_IOS_KEY). Surface
      // it instead of silently closing so it's diagnosable in the field.
      setState(() => _error =
          'In-app purchases are unavailable in this build. Please update from the App Store.');
      return;
    }

    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final offerings = await Purchases.getOfferings();
      final offering = offerings.current;
      // Prefer the monthly package, but fall back to whatever the offering
      // actually exposes — the trial may be attached to annual or a custom id.
      final package = offering?.monthly ??
          offering?.annual ??
          ((offering?.availablePackages.isNotEmpty ?? false)
              ? offering!.availablePackages.first
              : null);
      if (package == null) {
        setState(() {
          _loading = false;
          _error = 'No plans are available right now. Please try again later.';
        });
        return;
      }
      final info = await Purchases.purchasePackage(package);
      EntitlementService.updateFromCustomerInfo(info);
      FirebaseAnalytics.instance.logEvent(
        name: 'plan_upgrade',
        parameters: {'plan': 'pro', 'feature': widget.feature},
      ).catchError((_) {});
      if (mounted) Navigator.of(context).pop();
    } on PlatformException catch (e) {
      final code = PurchasesErrorHelper.getErrorCode(e);
      if (code == PurchasesErrorCode.purchaseCancelledError) {
        setState(() => _loading = false);
        return;
      }
      setState(() {
        _loading = false;
        _error = 'Purchase failed. Please try again.';
      });
    } catch (_) {
      setState(() {
        _loading = false;
        _error = 'Something went wrong. Please try again.';
      });
    }
  }

  Future<void> _onRestoreTap() async {
    if (!EntitlementService.isRevenueCatConfigured) {
      if (mounted) Navigator.of(context).pop();
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final plan = await EntitlementService.restorePurchases();
      if (!mounted) return;
      if (plan != Plan.free) {
        Navigator.of(context).pop();
      } else {
        setState(() {
          _loading = false;
          _error = 'No previous purchases found for this account.';
        });
      }
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = 'Could not restore purchases. Please try again.';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Container(
      decoration: BoxDecoration(
        color: c.surface,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
      ),
      padding: EdgeInsets.fromLTRB(
        AppSpacing.s6,
        AppSpacing.s4,
        AppSpacing.s6,
        AppSpacing.s6 + MediaQuery.of(context).padding.bottom,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 36,
            height: 4,
            decoration: BoxDecoration(
              color: c.border,
              borderRadius: BorderRadius.circular(AppRadius.full),
            ),
          ),
          const SizedBox(height: AppSpacing.s5),
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: c.accentDim,
              shape: BoxShape.circle,
            ),
            child: Icon(Icons.lock_rounded, color: c.accent, size: 28),
          ),
          const SizedBox(height: AppSpacing.s4),
          Text(
            'Pro Feature',
            style: AppTypography.headingMd.copyWith(color: c.textPrimary),
          ),
          const SizedBox(height: AppSpacing.s2),
          Text(
            'This feature is available on the Pro plan.',
            style: AppTypography.md.copyWith(color: c.textSecondary),
            textAlign: TextAlign.center,
          ),
          if (_error != null) ...[
            const SizedBox(height: AppSpacing.s3),
            Text(
              _error!,
              style: AppTypography.sm.copyWith(color: c.danger),
              textAlign: TextAlign.center,
            ),
          ],
          const SizedBox(height: AppSpacing.s6),
          const _TierComparison(),
          const SizedBox(height: AppSpacing.s5),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(AppSpacing.s4),
            decoration: BoxDecoration(
              color: c.background,
              borderRadius: BorderRadius.circular(AppRadius.md),
              border: Border.all(color: c.border),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'FinBrio Pro — Monthly',
                  style: AppTypography.labelMd.copyWith(
                      color: c.textPrimary, fontWeight: FontWeight.w700),
                ),
                const SizedBox(height: 4),
                Text(
                  '7-day free trial, then \$${RemoteConfigService.proMonthlyPriceUsd}/month. '
                  'Renews automatically every month until canceled.',
                  style: AppTypography.xs.copyWith(color: c.textSecondary),
                ),
              ],
            ),
          ),
          const SizedBox(height: AppSpacing.s5),
          SizedBox(
            width: double.infinity,
            child: FilledButton(
              onPressed: _loading ? null : _onPurchaseTap,
              style: FilledButton.styleFrom(
                backgroundColor: c.accent,
                foregroundColor: Colors.black,
                disabledBackgroundColor: c.accent.withAlpha(100),
                padding: const EdgeInsets.symmetric(vertical: AppSpacing.s4),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(AppRadius.md),
                ),
              ),
              child: _loading
                  ? SizedBox(
                      height: 20,
                      width: 20,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: Colors.black.withAlpha(180),
                      ),
                    )
                  : Text(
                      'Start 7-Day Free Trial',
                      style: AppTypography.labelLg.copyWith(
                          color: Colors.black, fontWeight: FontWeight.w700),
                    ),
            ),
          ),
          const SizedBox(height: AppSpacing.s3),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              TextButton(
                onPressed: _loading ? null : () => Navigator.of(context).pop(),
                child: Text('Maybe later',
                    style: AppTypography.sm.copyWith(color: c.textMuted)),
              ),
              Text('·', style: AppTypography.sm.copyWith(color: c.textMuted)),
              TextButton(
                onPressed: _loading ? null : _onRestoreTap,
                child: Text('Restore',
                    style: AppTypography.sm.copyWith(color: c.textMuted)),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.s2),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const _LegalLink(
                  label: 'Terms of Use',
                  url: 'https://www.finbrio.net/terms'),
              Text('·', style: AppTypography.xs.copyWith(color: c.textMuted)),
              const _LegalLink(
                  label: 'Privacy Policy',
                  url: 'https://www.finbrio.net/privacy'),
            ],
          ),
        ],
      ),
    );
  }
}

class _LegalLink extends StatelessWidget {
  const _LegalLink({required this.label, required this.url});

  final String label;
  final String url;

  Future<void> _open() async {
    final uri = Uri.parse(url);
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return TextButton(
      onPressed: _open,
      child: Text(label, style: AppTypography.xs.copyWith(color: c.textMuted)),
    );
  }
}

class _TierComparison extends StatelessWidget {
  const _TierComparison();

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Row(
      children: [
        _TierColumn(
          label: 'Free',
          price: '\$0',
          features: [
            'Live markets & charts',
            'S1–S3 signals',
            'Heatmap (1D)',
            '${RemoteConfigService.alertLimitFree} price alerts',
            'Tariff & macro dashboards',
          ],
          isHighlighted: false,
          c: c,
        ),
        const SizedBox(width: AppSpacing.s3),
        _TierColumn(
          label: 'Pro',
          price: '\$${RemoteConfigService.proMonthlyPriceUsd}/mo',
          features: const [
            'All 9 signal strategies',
            'Unlimited price alerts',
            'AI analyst notes',
            'AI macro briefing',
            'Best Setups scanner',
            'Extended timeframes',
          ],
          isHighlighted: true,
          c: c,
        ),
      ],
    );
  }
}

class _TierColumn extends StatelessWidget {
  const _TierColumn({
    required this.label,
    required this.price,
    required this.features,
    required this.isHighlighted,
    required this.c,
  });

  final String label;
  final String price;
  final List<String> features;
  final bool isHighlighted;
  final AppPalette c;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.all(AppSpacing.s3),
        decoration: BoxDecoration(
          color: isHighlighted ? c.accentDim : c.background,
          borderRadius: BorderRadius.circular(AppRadius.md),
          border: Border.all(
            color: isHighlighted ? c.accent.withAlpha(120) : c.border,
            width: isHighlighted ? 1.5 : 1,
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(label,
                style: AppTypography.labelMd.copyWith(
                  color: isHighlighted ? c.accent : c.textPrimary,
                  fontWeight: FontWeight.w700,
                )),
            const SizedBox(height: 2),
            Text(price,
                style: AppTypography.xs.copyWith(color: c.textMuted)),
            const SizedBox(height: AppSpacing.s3),
            ...features.map((f) => Padding(
                  padding: const EdgeInsets.only(bottom: 4),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Icon(Icons.check_rounded,
                          size: 12,
                          color: isHighlighted ? c.accent : c.textMuted),
                      const SizedBox(width: 4),
                      Expanded(
                        child: Text(f,
                            style: AppTypography.xs.copyWith(
                                color: isHighlighted
                                    ? c.textSecondary
                                    : c.textMuted)),
                      ),
                    ],
                  ),
                )),
          ],
        ),
      ),
    );
  }
}
