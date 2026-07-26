import 'package:flutter/material.dart';
import '../../core/theme/app_palette.dart';
import '../../core/theme/app_typography.dart';
import '../../core/theme/app_spacing.dart';

/// One item shown as a pill chip inside a quadrant card.
class RrgQuadrantItem {
  const RrgQuadrantItem({required this.emoji, required this.label});
  final String emoji;
  final String label;
}

/// 2x2 Relative Rotation Graph quadrant grid — Improving/Leading on top,
/// Lagging/Weakening on bottom. Shared visual for any RRG-quadrant data
/// (sector rotation, ETF rotation, ...) — reuse rather than duplicating.
class RrgQuadrantGrid extends StatelessWidget {
  const RrgQuadrantGrid({
    super.key,
    required this.leading,
    required this.improving,
    required this.weakening,
    required this.lagging,
  });

  final List<RrgQuadrantItem> leading;
  final List<RrgQuadrantItem> improving;
  final List<RrgQuadrantItem> weakening;
  final List<RrgQuadrantItem> lagging;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: _RrgQuadrantCard(
                items: improving,
                label: 'Improving',
                arrow: '↖',
                color: Colors.blue.shade400,
                desc: 'Weak · gaining speed',
              ),
            ),
            const SizedBox(width: AppSpacing.s2),
            Expanded(
              child: _RrgQuadrantCard(
                items: leading,
                label: 'Leading',
                arrow: '↗',
                color: Colors.teal.shade400,
                desc: 'Strong · gaining speed',
              ),
            ),
          ],
        ),
        const SizedBox(height: AppSpacing.s2),
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: _RrgQuadrantCard(
                items: lagging,
                label: 'Lagging',
                arrow: '↙',
                color: Colors.red.shade400,
                desc: 'Weak · losing speed',
              ),
            ),
            const SizedBox(width: AppSpacing.s2),
            Expanded(
              child: _RrgQuadrantCard(
                items: weakening,
                label: 'Weakening',
                arrow: '↘',
                color: Colors.orange.shade400,
                desc: 'Strong · losing speed',
              ),
            ),
          ],
        ),
      ],
    );
  }
}

class _RrgQuadrantCard extends StatelessWidget {
  const _RrgQuadrantCard({
    required this.items,
    required this.label,
    required this.arrow,
    required this.color,
    required this.desc,
  });

  final List<RrgQuadrantItem> items;
  final String label;
  final String arrow;
  final Color color;
  final String desc;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Container(
      padding: const EdgeInsets.all(AppSpacing.s3),
      decoration: BoxDecoration(
        color: color.withAlpha(18),
        borderRadius: BorderRadius.circular(AppRadius.md),
        border: Border.all(color: color.withAlpha(70)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text(arrow,
                  style: TextStyle(
                      color: color, fontSize: 13, fontWeight: FontWeight.w700)),
              const SizedBox(width: 4),
              Text(label, style: AppTypography.labelSm.copyWith(color: color)),
            ],
          ),
          const SizedBox(height: 2),
          Text(desc,
              style: AppTypography.xs.copyWith(color: c.textMuted, fontSize: 9)),
          const SizedBox(height: AppSpacing.s2),
          if (items.isEmpty)
            Text('—', style: AppTypography.sm.copyWith(color: c.textFaint))
          else
            Wrap(
              spacing: 4,
              runSpacing: 4,
              children: items.map((item) {
                return Container(
                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 3),
                  decoration: BoxDecoration(
                    color: color.withAlpha(30),
                    borderRadius: BorderRadius.circular(AppRadius.full),
                  ),
                  child: Text(
                    '${item.emoji} ${item.label}',
                    style: AppTypography.xs.copyWith(
                        color: c.textPrimary,
                        fontSize: 11,
                        fontWeight: FontWeight.w600),
                  ),
                );
              }).toList(),
            ),
        ],
      ),
    );
  }
}
