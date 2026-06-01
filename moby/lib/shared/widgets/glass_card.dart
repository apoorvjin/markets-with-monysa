import 'dart:ui';

import 'package:flutter/material.dart';
import '../../core/theme/app_palette.dart';
import '../../core/theme/app_spacing.dart';

class GlassCard extends StatelessWidget {
  const GlassCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(AppSpacing.s4),
    this.margin = EdgeInsets.zero,
    this.borderRadius = AppRadius.md,
    this.color,
    this.borderColor,
    /// When true, applies a BackdropFilter blur behind the card.
    /// Use sparingly — only on cards that float above scrolling content.
    this.blur = false,
  });

  final Widget child;
  final EdgeInsets padding;
  final EdgeInsets margin;
  final double borderRadius;
  final Color? color;
  final Color? borderColor;
  final bool blur;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final effectiveColor = color ?? c.surfaceCard;
    final effectiveBorder = borderColor ?? c.border;

    final decoration = BoxDecoration(
      color: effectiveColor,
      borderRadius: BorderRadius.circular(borderRadius),
      border: Border.all(color: effectiveBorder, width: 1),
    );

    Widget content = Padding(padding: padding, child: child);

    if (blur) {
      // Wrap in blur layer — content behind the card gets a subtle depth effect.
      content = ClipRRect(
        borderRadius: BorderRadius.circular(borderRadius),
        child: BackdropFilter(
          filter: ImageFilter.blur(sigmaX: 8, sigmaY: 8),
          child: Container(
            decoration: decoration,
            child: content,
          ),
        ),
      );
    } else {
      content = ClipRRect(
        borderRadius: BorderRadius.circular(borderRadius),
        child: Container(
          decoration: decoration,
          child: content,
        ),
      );
    }

    return Container(
      margin: margin,
      child: content,
    );
  }
}
