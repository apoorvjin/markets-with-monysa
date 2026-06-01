import 'package:flutter/material.dart';
import 'app_palette.dart';

abstract final class AppColors {
  // Surfaces
  static const background = Color(0xFF000000);
  static const surface = Color(0xFF0A0A0A);
  static const surfaceElevated = Color(0xFF141414);
  static const surfaceCard = Color(0x12FFFFFF); // rgba(255,255,255,0.07)

  // Text
  static const textPrimary = Color(0xFFFFFFFF);
  static const textSecondary = Color(0xFFADB5BD);
  static const textMuted = Color(0xADFFFFFF); // rgba(255,255,255,0.68)
  static const textFaint = Color(0x66FFFFFF);  // rgba(255,255,255,0.40)

  // Borders
  static const border = Color(0x1FFFFFFF);     // rgba(255,255,255,0.12)
  static const borderStrong = Color(0x33FFFFFF);

  // Accent (Electric Indigo — brand color)
  static const accent = Color(0xFF6366F1);
  static const accentDim = Color(0x1F6366F1);  // rgba(99,102,241,0.12)
  static const accentDim18 = Color(0x2E6366F1); // rgba(99,102,241,0.18)

  // Danger (red)
  static const danger = Color(0xFFFF4D6A);
  static const dangerDim = Color(0x1FFF4D6A);  // rgba(255,77,106,0.12)

  // Warning (amber)
  static const warning = Color(0xFFFFB84D);
  static const warningDim = Color(0x1FFFB84D); // rgba(255,184,77,0.12)

  // Positive (same as accent)
  static const positive = Color(0xFF00D4AA);
  static const positiveDim = Color(0x1F00D4AA);

  // Misc
  static const headerBg = Color(0xD1000000);   // rgba(0,0,0,0.82)
  static const searchBg = Color(0x0FFFFFFF);   // rgba(255,255,255,0.06)
  static const transparent = Color(0x00000000);

  // Signal colors
  static Color signalColor(String direction) {
    switch (direction.toUpperCase()) {
      case 'BUY':  return positive;
      case 'SELL': return danger;
      default:     return warning;
    }
  }

  static Color signalDim(String direction) {
    switch (direction.toUpperCase()) {
      case 'BUY':  return positiveDim;
      case 'SELL': return dangerDim;
      default:     return warningDim;
    }
  }

  /// Convenience accessor — returns the runtime palette from the theme extension.
  static AppPalette of(BuildContext context) =>
      Theme.of(context).extension<AppPalette>()!;
}
