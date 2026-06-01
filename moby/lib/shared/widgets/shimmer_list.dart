import 'package:flutter/material.dart';
import 'package:shimmer/shimmer.dart';
import '../../core/theme/app_palette.dart';
import '../../core/theme/app_spacing.dart';

enum ShimmerRowType { market, signal }

/// Full-screen shimmer list shown while async data loads.
/// Replaces the generic CircularProgressIndicator on list screens.
class ShimmerList extends StatelessWidget {
  const ShimmerList({
    super.key,
    this.count = 8,
    this.type = ShimmerRowType.market,
  });

  final int count;
  final ShimmerRowType type;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final isDark = Theme.of(context).brightness == Brightness.dark;

    // Shimmer base/highlight tuned per theme so it reads on both backgrounds.
    final baseColor = isDark ? const Color(0xFF1A1A1A) : const Color(0xFFE8EAF0);
    final highlightColor = isDark ? const Color(0xFF2E2E2E) : const Color(0xFFF8F9FC);

    return Shimmer.fromColors(
      baseColor: baseColor,
      highlightColor: highlightColor,
      child: ListView.builder(
        physics: const NeverScrollableScrollPhysics(),
        itemCount: count,
        itemBuilder: (_, __) => type == ShimmerRowType.market
            ? _MarketRowSkeleton(c: c)
            : _SignalRowSkeleton(c: c),
      ),
    );
  }
}

// ── Market row skeleton — mirrors _MarketRow layout ──────────────────────────

class _MarketRowSkeleton extends StatelessWidget {
  const _MarketRowSkeleton({required this.c});
  final AppPalette c;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.s5, vertical: AppSpacing.s4),
      decoration: BoxDecoration(
        border: Border(bottom: BorderSide(color: c.border, width: 0.5)),
      ),
      child: Row(
        children: [
          // Flag placeholder
          _Box(width: 22, height: 22, radius: 4),
          const SizedBox(width: AppSpacing.s3),
          // Name + symbol column
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _Box(width: 120, height: 13, radius: 4),
                const SizedBox(height: 5),
                _Box(width: 64, height: 10, radius: 4),
              ],
            ),
          ),
          // Price column
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              _Box(width: 72, height: 13, radius: 4),
              const SizedBox(height: 5),
              _Box(width: 54, height: 20, radius: 4),
            ],
          ),
        ],
      ),
    );
  }
}

// ── Signal / asset row skeleton — mirrors _AssetRow layout ───────────────────

class _SignalRowSkeleton extends StatelessWidget {
  const _SignalRowSkeleton({required this.c});
  final AppPalette c;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.s5, vertical: AppSpacing.s4),
      decoration: BoxDecoration(
        border: Border(bottom: BorderSide(color: c.border, width: 0.5)),
      ),
      child: Row(
        children: [
          // Flag
          _Box(width: 22, height: 22, radius: 4),
          const SizedBox(width: AppSpacing.s3),
          // Name + symbol
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _Box(width: 110, height: 13, radius: 4),
                const SizedBox(height: 5),
                _Box(width: 56, height: 10, radius: 4),
              ],
            ),
          ),
          // Price + change
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              _Box(width: 68, height: 13, radius: 4),
              const SizedBox(height: 5),
              _Box(width: 48, height: 10, radius: 4),
            ],
          ),
        ],
      ),
    );
  }
}

// ── Skeleton block ────────────────────────────────────────────────────────────

class _Box extends StatelessWidget {
  const _Box({required this.width, required this.height, required this.radius});
  final double width;
  final double height;
  final double radius;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: width,
      height: height,
      decoration: BoxDecoration(
        // Shimmer renders its own color via fromColors — any non-transparent color works.
        color: Colors.white,
        borderRadius: BorderRadius.circular(radius),
      ),
    );
  }
}
