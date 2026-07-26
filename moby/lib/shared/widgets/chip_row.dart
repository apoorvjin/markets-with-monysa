import 'package:flutter/material.dart';

import '../../core/theme/app_palette.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/theme/app_typography.dart';

/// Single filter/category pill. Canonical replacement for the app's many
/// near-duplicate `_Chip`/`_FilterChip`/`_CategoryChip`/`_PMChip` classes —
/// always pair with [AppChipRow] (or a bare `Wrap`) so chip lists wrap to
/// multiple lines instead of scrolling off-screen.
class AppChip extends StatelessWidget {
  const AppChip({
    super.key,
    required this.label,
    required this.active,
    this.onTap,
    this.icon,
    this.disabled = false,
    this.activeColor,
    this.textStyle,
    this.padding,
    this.animated = false,
  });

  final String label;
  final bool active;
  final VoidCallback? onTap;

  /// Leading icon (e.g. Smart $ strategy chips).
  final IconData? icon;

  /// Locked/unavailable variant — faint strikethrough text, no tap handler.
  /// Mirrors the Power Moves scanner's per-version disabled chip.
  final bool disabled;

  /// Override the active tone (e.g. BUY/SELL/HOLD-colored direction chips).
  final Color? activeColor;

  /// Escape hatch for screens using labelSm/sm instead of the default xs.
  final TextStyle? textStyle;

  /// Escape hatch for screens using tighter/looser padding than the default.
  final EdgeInsetsGeometry? padding;

  /// Wraps the pill in an [AnimatedContainer] for a fade-in selection
  /// transition (used by earnings calendar's sector chips).
  final bool animated;

  static const _defaultPadding =
      EdgeInsets.symmetric(horizontal: AppSpacing.s4, vertical: AppSpacing.s2);

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final resolvedPadding = padding ?? _defaultPadding;

    if (disabled) {
      return Container(
        padding: resolvedPadding,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(AppRadius.full),
          border: Border.all(color: c.border.withAlpha(80)),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.close_rounded, size: 9, color: c.textFaint),
            const SizedBox(width: 3),
            Text(
              label,
              style: (textStyle ?? AppTypography.xs).copyWith(
                color: c.textFaint,
                fontWeight: FontWeight.w500,
                decoration: TextDecoration.lineThrough,
                decorationColor: c.textFaint,
              ),
            ),
          ],
        ),
      );
    }

    final tone = activeColor ?? c.accent;
    final decoration = BoxDecoration(
      color: active ? tone.withAlpha(25) : Colors.transparent,
      borderRadius: BorderRadius.circular(AppRadius.full),
      border: Border.all(color: active ? tone : c.border),
    );
    final child = Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        if (icon != null) ...[
          Icon(icon, size: 13, color: active ? tone : c.textMuted),
          const SizedBox(width: 5),
        ],
        Text(
          label,
          style: (textStyle ?? AppTypography.xs).copyWith(
            color: active ? tone : c.textSecondary,
            fontWeight: active ? FontWeight.w700 : FontWeight.w500,
          ),
        ),
      ],
    );

    return GestureDetector(
      onTap: onTap,
      child: animated
          ? AnimatedContainer(
              duration: const Duration(milliseconds: 150),
              padding: resolvedPadding,
              decoration: decoration,
              child: child,
            )
          : Container(
              padding: resolvedPadding,
              decoration: decoration,
              child: child,
            ),
    );
  }
}

/// Labeled, wrapping chip group — generalizes the "Category:" pattern from
/// etf_explorer_tab.dart. Replaces every `Text(label) + SizedBox +
/// SingleChildScrollView(horizontal)` pairing across the app so every chip
/// stays visible without a swipe gesture.
class AppChipRow extends StatelessWidget {
  const AppChipRow({
    super.key,
    this.label,
    required this.children,
    this.spacing = AppSpacing.s2,
    this.runSpacing = AppSpacing.s2,
  });

  final String? label;
  final List<Widget> children;
  final double spacing;
  final double runSpacing;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (label != null) ...[
          Text(label!, style: AppTypography.xs.copyWith(color: c.textMuted)),
          const SizedBox(height: AppSpacing.s2),
        ],
        Wrap(spacing: spacing, runSpacing: runSpacing, children: children),
      ],
    );
  }
}
