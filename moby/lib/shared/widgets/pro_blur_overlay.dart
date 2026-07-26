import 'dart:ui';

import 'package:flutter/material.dart';
import '../../core/theme/app_palette.dart';
import '../../core/theme/app_typography.dart';
import 'upgrade_sheet.dart';

/// Blurs [child] behind a gain/loss-tinted overlay reading "Upgrade to Pro".
/// Tapping opens the paywall for [feature]. Used to partially reveal
/// Pro-gated numeric content (Forex rate comparison, CFTC positions) while
/// still showing its shape/color at a glance.
class ProBlurOverlay extends StatelessWidget {
  const ProBlurOverlay({
    super.key,
    required this.child,
    required this.isPositive,
    required this.feature,
    this.blurSigma = 5,
    this.borderRadius = const BorderRadius.all(Radius.circular(4)),
    this.label = 'Upgrade to Pro',
  });

  final Widget child;
  final bool isPositive;
  final String feature;
  final double blurSigma;
  final BorderRadius borderRadius;
  /// Override for tight spaces where "Upgrade to Pro" would clip (e.g. an
  /// inline metric chip). Defaults to the full phrase.
  final String label;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final tint = isPositive ? c.positive : c.danger;
    return GestureDetector(
      onTap: () => UpgradeSheet.show(context, feature: feature),
      child: ClipRRect(
        borderRadius: borderRadius,
        child: Stack(
          alignment: Alignment.center,
          children: [
            ImageFiltered(
              imageFilter: ImageFilter.blur(sigmaX: blurSigma, sigmaY: blurSigma),
              child: child,
            ),
            Positioned.fill(
              child: Container(color: tint.withAlpha(72)),
            ),
            Text(
              label,
              textAlign: TextAlign.center,
              maxLines: 1,
              overflow: TextOverflow.clip,
              style: AppTypography.xs.copyWith(
                color: Colors.white,
                fontWeight: FontWeight.w700,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
