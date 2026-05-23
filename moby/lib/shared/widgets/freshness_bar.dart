import 'package:flutter/material.dart';
import '../../core/theme/app_palette.dart';
import '../../core/theme/app_typography.dart';
import '../../core/theme/app_spacing.dart';

class FreshnessBar extends StatelessWidget {
  const FreshnessBar({super.key, required this.lastUpdated});
  final String lastUpdated;

  String _timeAgo() {
    try {
      final dt = DateTime.parse(lastUpdated).toLocal();
      final diff = DateTime.now().difference(dt);
      if (diff.inSeconds < 60) return 'just now';
      if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
      if (diff.inHours < 24) return '${diff.inHours}h ago';
      return '${diff.inDays}d ago';
    } catch (_) {
      return lastUpdated;
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.s5, vertical: AppSpacing.s1),
      color: c.surface,
      child: Text(
        'Updated ${_timeAgo()}',
        style: AppTypography.xs.copyWith(color: c.textMuted),
        textAlign: TextAlign.end,
      ),
    );
  }
}
