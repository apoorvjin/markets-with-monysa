import 'package:flutter/material.dart';
import '../../core/theme/app_palette.dart';
import '../../core/theme/app_typography.dart';
import '../../core/theme/app_spacing.dart';

class SignalBadge extends StatelessWidget {
  const SignalBadge({super.key, required this.direction, this.small = false});

  final String direction;
  final bool small;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final color = c.signalColor(direction);
    final dim = c.signalDim(direction);
    return Container(
      padding: EdgeInsets.symmetric(
        horizontal: small ? AppSpacing.s2 : AppSpacing.s3,
        vertical: small ? 2 : AppSpacing.s1,
      ),
      decoration: BoxDecoration(
        color: dim,
        borderRadius: BorderRadius.circular(AppRadius.xs),
        border: Border.all(color: color.withAlpha(80), width: 1),
      ),
      child: Text(
        direction.toUpperCase(),
        style: (small ? AppTypography.xs : AppTypography.sm).copyWith(
          color: color,
          fontWeight: FontWeight.w700,
          letterSpacing: 0.5,
        ),
      ),
    );
  }
}
