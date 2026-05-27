import 'package:flutter/services.dart';
import 'package:flutter/material.dart';
import 'package:purchases_flutter/purchases_flutter.dart';
import '../../core/theme/app_palette.dart';
import '../../core/theme/app_typography.dart';
import '../../core/theme/app_spacing.dart';
import '../../services/entitlement_service.dart';

class UpgradeSheet extends StatefulWidget {
  const UpgradeSheet({super.key, required this.feature});

  /// The feature key from [EntitlementService._rules] that triggered this sheet.
  final String feature;

  static Future<void> show(BuildContext context, {required String feature}) {
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

  bool get _isInsightFeature =>
      widget.feature == 'exposure_ai' ||
      widget.feature == 'api_access' ||
      widget.feature == 'backtest_filter';

  Future<void> _onPurchaseTap() async {
    if (!EntitlementService.isRevenueCatConfigured) {
      // SDK not configured (no API keys in this build) — just close.
      if (mounted) Navigator.of(context).pop();
      return;
    }

    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final offerings = await Purchases.getOfferings();
      final offering = _isInsightFeature
          ? offerings.getOffering('insight') ?? offerings.current
          : offerings.current;
      final package = offering?.monthly;
      if (package == null) {
        setState(() {
          _loading = false;
          _error = 'No packages available. Please try again later.';
        });
        return;
      }
      final info = await Purchases.purchasePackage(package);
      EntitlementService.updateFromCustomerInfo(info);
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
            _isInsightFeature ? 'Insight Feature' : 'Pro Feature',
            style: AppTypography.headingMd.copyWith(color: c.textPrimary),
          ),
          const SizedBox(height: AppSpacing.s2),
          Text(
            _isInsightFeature
                ? 'This feature is available on the Insight plan.'
                : 'This feature is available on the Pro plan.',
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
          _TierComparison(highlightInsight: _isInsightFeature),
          const SizedBox(height: AppSpacing.s6),
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
          TextButton(
            onPressed: _loading ? null : () => Navigator.of(context).pop(),
            child: Text('Maybe later',
                style: AppTypography.sm.copyWith(color: c.textMuted)),
          ),
        ],
      ),
    );
  }
}

class _TierComparison extends StatelessWidget {
  const _TierComparison({required this.highlightInsight});
  final bool highlightInsight;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Row(
      children: [
        _TierColumn(
          label: 'Free',
          price: '\$0',
          features: const [
            'Live quotes',
            'S1-S3 signals',
            '3 alerts',
            '3 AI notes/day',
            'Tariff map',
          ],
          isHighlighted: false,
          c: c,
        ),
        const SizedBox(width: AppSpacing.s3),
        _TierColumn(
          label: 'Pro',
          price: '\$12.99/mo',
          features: const [
            'All 9 strategies',
            'Unlimited alerts',
            'Unlimited AI notes',
            'AI macro briefing',
            'Full COT data',
          ],
          isHighlighted: !highlightInsight,
          c: c,
        ),
        const SizedBox(width: AppSpacing.s3),
        _TierColumn(
          label: 'Insight',
          price: '\$29.99/mo',
          features: const [
            'Everything in Pro',
            'AI Tariff Analysis',
            'Sector heatmap',
            'API access',
            'PDF export',
          ],
          isHighlighted: highlightInsight,
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
