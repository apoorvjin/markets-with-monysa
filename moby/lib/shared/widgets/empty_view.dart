import 'package:flutter/material.dart';
import '../../core/theme/app_palette.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/theme/app_typography.dart';

/// Contextual empty state shown when a list or screen has no data to display.
/// Pass [actionLabel] + [onAction] to include a tappable suggestion.
class EmptyView extends StatelessWidget {
  const EmptyView({
    super.key,
    required this.icon,
    required this.title,
    required this.body,
    this.actionLabel,
    this.onAction,
    this.iconColor,
  });

  final IconData icon;
  final String title;
  final String body;
  final String? actionLabel;
  final VoidCallback? onAction;
  final Color? iconColor;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final color = iconColor ?? c.accent;
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: AppSpacing.s8),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 64,
              height: 64,
              decoration: BoxDecoration(
                color: color.withAlpha(24),
                shape: BoxShape.circle,
              ),
              child: Icon(icon, size: 28, color: color),
            ),
            const SizedBox(height: AppSpacing.s5),
            Text(
              title,
              style: AppTypography.headingSm.copyWith(color: c.textPrimary),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: AppSpacing.s3),
            Text(
              body,
              style: AppTypography.md.copyWith(color: c.textSecondary, height: 1.55),
              textAlign: TextAlign.center,
            ),
            if (actionLabel != null && onAction != null) ...[
              const SizedBox(height: AppSpacing.s6),
              FilledButton(
                onPressed: onAction,
                style: FilledButton.styleFrom(
                  backgroundColor: color.withAlpha(28),
                  foregroundColor: color,
                  elevation: 0,
                ),
                child: Text(actionLabel!,
                    style: AppTypography.labelMd.copyWith(color: color)),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
