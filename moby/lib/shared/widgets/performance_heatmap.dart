import 'package:flutter/material.dart';
import '../../core/theme/app_palette.dart';
import '../../core/theme/app_typography.dart';
import '../../core/theme/app_spacing.dart';
import '../../data/models/heatmap_data.dart';

enum _HeatmapTimeframe { d1, w1, m1, m3, m6, y1 }

class PerformanceHeatmap extends StatefulWidget {
  const PerformanceHeatmap({super.key, required this.tiles});

  final List<HeatmapTile> tiles;

  @override
  State<PerformanceHeatmap> createState() => _PerformanceHeatmapState();
}

class _PerformanceHeatmapState extends State<PerformanceHeatmap> {
  _HeatmapTimeframe _tf = _HeatmapTimeframe.d1;

  double? _valueFor(HeatmapTile t) => switch (_tf) {
        _HeatmapTimeframe.d1 => t.changePercent,
        _HeatmapTimeframe.w1 => t.perf1W,
        _HeatmapTimeframe.m1 => t.perf1M,
        _HeatmapTimeframe.m3 => t.perf3M,
        _HeatmapTimeframe.m6 => t.perf6M,
        _HeatmapTimeframe.y1 => t.perf1Y,
      };

  // Saturation cap scales with timeframe so short-term noise doesn't pin all tiles.
  double _satCap() => switch (_tf) {
        _HeatmapTimeframe.d1 => 3.0,
        _HeatmapTimeframe.w1 => 5.0,
        _HeatmapTimeframe.m1 => 8.0,
        _HeatmapTimeframe.m3 => 15.0,
        _HeatmapTimeframe.m6 => 25.0,
        _HeatmapTimeframe.y1 => 40.0,
      };

  Color _tileColor(double? pct, AppPalette c) {
    if (pct == null) return c.surfaceElevated;
    final t = (pct.abs() / _satCap()).clamp(0.0, 1.0);
    final target = pct >= 0 ? c.positive : c.danger;
    return Color.lerp(c.surfaceElevated, target, t)!;
  }

  // Always use white so text is readable on both colored and neutral dark tiles.
  // On light-theme neutral tiles the bg is #ECEEF2 so textPrimary (dark) is
  // used instead for adequate contrast.
  Color _textColor(Color tileBg, AppPalette c) {
    final luminance = tileBg.computeLuminance();
    return luminance > 0.18 ? c.textPrimary : Colors.white;
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _TimeframeToggle(
          selected: _tf,
          onChanged: (v) => setState(() => _tf = v),
        ),
        const SizedBox(height: AppSpacing.s3),
        LayoutBuilder(
          builder: (context, constraints) {
            const cols = 3;
            const gap = 4.0;
            final tileW = (constraints.maxWidth - gap * (cols - 1)) / cols;
            const tileH = 68.0;
            return Wrap(
              spacing: gap,
              runSpacing: gap,
              children: widget.tiles.map((tile) {
                final pct = _valueFor(tile);
                final bg = _tileColor(pct, c);
                final fg = _textColor(bg, c);
                return Container(
                  width: tileW,
                  height: tileH,
                  decoration: BoxDecoration(
                    color: bg,
                    borderRadius: BorderRadius.circular(AppRadius.sm),
                  ),
                  padding: const EdgeInsets.symmetric(
                    horizontal: 6,
                    vertical: 8,
                  ),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text(
                        tile.emoji,
                        style: const TextStyle(fontSize: 16),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        tile.name,
                        textAlign: TextAlign.center,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: AppTypography.xs.copyWith(
                          color: fg,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        pct == null
                            ? '—'
                            : '${pct >= 0 ? '+' : ''}${pct.toStringAsFixed(2)}%',
                        style: AppTypography.xs.copyWith(
                          color: fg,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ],
                  ),
                );
              }).toList(),
            );
          },
        ),
      ],
    );
  }
}

class _TimeframeToggle extends StatelessWidget {
  const _TimeframeToggle({required this.selected, required this.onChanged});

  final _HeatmapTimeframe selected;
  final ValueChanged<_HeatmapTimeframe> onChanged;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    const options = [
      (_HeatmapTimeframe.d1, '1D'),
      (_HeatmapTimeframe.w1, '1W'),
      (_HeatmapTimeframe.m1, '1M'),
      (_HeatmapTimeframe.m3, '3M'),
      (_HeatmapTimeframe.m6, '6M'),
      (_HeatmapTimeframe.y1, '1Y'),
    ];
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
      mainAxisSize: MainAxisSize.min,
      children: options.map((opt) {
        final (tf, label) = opt;
        final isActive = selected == tf;
        return GestureDetector(
          onTap: () => onChanged(tf),
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 150),
            margin: const EdgeInsets.only(right: 6),
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
            decoration: BoxDecoration(
              color: isActive ? c.accent.withAlpha(30) : Colors.transparent,
              borderRadius: BorderRadius.circular(AppRadius.full),
              border: Border.all(
                color: isActive ? c.accent : c.border,
                width: 1,
              ),
            ),
            child: Text(
              label,
              style: AppTypography.xs.copyWith(
                color: isActive ? c.accent : c.textSecondary,
                fontWeight: isActive ? FontWeight.w700 : FontWeight.w400,
              ),
            ),
          ),
        );
      }).toList(),
      ),
    );
  }
}
