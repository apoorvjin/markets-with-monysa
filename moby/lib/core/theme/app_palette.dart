import 'package:flutter/material.dart';

/// ThemeExtension that carries the full runtime color palette.
/// Access via [context.colors] or [Theme.of(context).extension<AppPalette>()!].
class AppPalette extends ThemeExtension<AppPalette> {
  const AppPalette({
    required this.background,
    required this.surface,
    required this.surfaceElevated,
    required this.surfaceCard,
    required this.textPrimary,
    required this.textSecondary,
    required this.textMuted,
    required this.textFaint,
    required this.border,
    required this.borderStrong,
    required this.accent,
    required this.accentDim,
    required this.accentDim18,
    required this.danger,
    required this.dangerDim,
    required this.warning,
    required this.warningDim,
    required this.positive,
    required this.positiveDim,
    required this.headerBg,
    required this.searchBg,
    required this.transparent,
  });

  final Color background;
  final Color surface;
  final Color surfaceElevated;
  final Color surfaceCard;
  final Color textPrimary;
  final Color textSecondary;
  final Color textMuted;
  final Color textFaint;
  final Color border;
  final Color borderStrong;
  final Color accent;
  final Color accentDim;
  final Color accentDim18;
  final Color danger;
  final Color dangerDim;
  final Color warning;
  final Color warningDim;
  final Color positive;
  final Color positiveDim;
  final Color headerBg;
  final Color searchBg;
  final Color transparent;

  // ── Signal helpers ─────────────────────────────────────────────────────────

  Color signalColor(String direction) {
    switch (direction.toUpperCase()) {
      case 'BUY':
        return positive;
      case 'SELL':
        return danger;
      default:
        return warning;
    }
  }

  Color signalDim(String direction) {
    switch (direction.toUpperCase()) {
      case 'BUY':
        return positiveDim;
      case 'SELL':
        return dangerDim;
      default:
        return warningDim;
    }
  }

  // ── Dark palette (existing values) ────────────────────────────────────────

  static const dark = AppPalette(
    background: Color(0xFF000000),
    surface: Color(0xFF0A0A0A),
    surfaceElevated: Color(0xFF141414),
    surfaceCard: Color(0x12FFFFFF),
    textPrimary: Color(0xFFFFFFFF),
    textSecondary: Color(0xFFADB5BD),
    textMuted: Color(0xADFFFFFF),
    textFaint: Color(0x66FFFFFF),
    border: Color(0x1FFFFFFF),
    borderStrong: Color(0x33FFFFFF),
    accent: Color(0xFF00D4AA),
    accentDim: Color(0x1F00D4AA),
    accentDim18: Color(0x2E00D4AA),
    danger: Color(0xFFFF4D6A),
    dangerDim: Color(0x1FFF4D6A),
    warning: Color(0xFFFFB84D),
    warningDim: Color(0x1FFFB84D),
    positive: Color(0xFF00D4AA),
    positiveDim: Color(0x1F00D4AA),
    headerBg: Color(0xD1000000),
    searchBg: Color(0x0FFFFFFF),
    transparent: Color(0x00000000),
  );

  // ── Light palette ─────────────────────────────────────────────────────────

  static const light = AppPalette(
    background: Color(0xFFFFFFFF),
    surface: Color(0xFFF5F7FA),
    surfaceElevated: Color(0xFFECEEF2),
    surfaceCard: Color(0x0A000000),
    textPrimary: Color(0xFF0D1117),
    textSecondary: Color(0xFF6B7280),
    textMuted: Color(0x990D1117),
    textFaint: Color(0x590D1117),
    border: Color(0x1A000000),
    borderStrong: Color(0x2E000000),
    accent: Color(0xFF00C49A),
    accentDim: Color(0x1F00C49A),
    accentDim18: Color(0x2E00C49A),
    danger: Color(0xFFE8384F),
    dangerDim: Color(0x1FE8384F),
    warning: Color(0xFFE6952A),
    warningDim: Color(0x1FE6952A),
    positive: Color(0xFF00C49A),
    positiveDim: Color(0x1F00C49A),
    headerBg: Color(0xF2FFFFFF),
    searchBg: Color(0x0D000000),
    transparent: Color(0x00000000),
  );

  // ── ThemeExtension boilerplate ────────────────────────────────────────────

  @override
  AppPalette copyWith({
    Color? background,
    Color? surface,
    Color? surfaceElevated,
    Color? surfaceCard,
    Color? textPrimary,
    Color? textSecondary,
    Color? textMuted,
    Color? textFaint,
    Color? border,
    Color? borderStrong,
    Color? accent,
    Color? accentDim,
    Color? accentDim18,
    Color? danger,
    Color? dangerDim,
    Color? warning,
    Color? warningDim,
    Color? positive,
    Color? positiveDim,
    Color? headerBg,
    Color? searchBg,
    Color? transparent,
  }) {
    return AppPalette(
      background: background ?? this.background,
      surface: surface ?? this.surface,
      surfaceElevated: surfaceElevated ?? this.surfaceElevated,
      surfaceCard: surfaceCard ?? this.surfaceCard,
      textPrimary: textPrimary ?? this.textPrimary,
      textSecondary: textSecondary ?? this.textSecondary,
      textMuted: textMuted ?? this.textMuted,
      textFaint: textFaint ?? this.textFaint,
      border: border ?? this.border,
      borderStrong: borderStrong ?? this.borderStrong,
      accent: accent ?? this.accent,
      accentDim: accentDim ?? this.accentDim,
      accentDim18: accentDim18 ?? this.accentDim18,
      danger: danger ?? this.danger,
      dangerDim: dangerDim ?? this.dangerDim,
      warning: warning ?? this.warning,
      warningDim: warningDim ?? this.warningDim,
      positive: positive ?? this.positive,
      positiveDim: positiveDim ?? this.positiveDim,
      headerBg: headerBg ?? this.headerBg,
      searchBg: searchBg ?? this.searchBg,
      transparent: transparent ?? this.transparent,
    );
  }

  @override
  AppPalette lerp(AppPalette? other, double t) {
    if (other == null) return this;
    return AppPalette(
      background: Color.lerp(background, other.background, t)!,
      surface: Color.lerp(surface, other.surface, t)!,
      surfaceElevated: Color.lerp(surfaceElevated, other.surfaceElevated, t)!,
      surfaceCard: Color.lerp(surfaceCard, other.surfaceCard, t)!,
      textPrimary: Color.lerp(textPrimary, other.textPrimary, t)!,
      textSecondary: Color.lerp(textSecondary, other.textSecondary, t)!,
      textMuted: Color.lerp(textMuted, other.textMuted, t)!,
      textFaint: Color.lerp(textFaint, other.textFaint, t)!,
      border: Color.lerp(border, other.border, t)!,
      borderStrong: Color.lerp(borderStrong, other.borderStrong, t)!,
      accent: Color.lerp(accent, other.accent, t)!,
      accentDim: Color.lerp(accentDim, other.accentDim, t)!,
      accentDim18: Color.lerp(accentDim18, other.accentDim18, t)!,
      danger: Color.lerp(danger, other.danger, t)!,
      dangerDim: Color.lerp(dangerDim, other.dangerDim, t)!,
      warning: Color.lerp(warning, other.warning, t)!,
      warningDim: Color.lerp(warningDim, other.warningDim, t)!,
      positive: Color.lerp(positive, other.positive, t)!,
      positiveDim: Color.lerp(positiveDim, other.positiveDim, t)!,
      headerBg: Color.lerp(headerBg, other.headerBg, t)!,
      searchBg: Color.lerp(searchBg, other.searchBg, t)!,
      transparent: Color.lerp(transparent, other.transparent, t)!,
    );
  }
}

/// Convenience extension so any build method can write [context.colors].
extension AppPaletteX on BuildContext {
  AppPalette get colors => Theme.of(this).extension<AppPalette>()!;
}
