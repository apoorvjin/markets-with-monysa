import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

abstract final class AppTypography {
  // Color is a dark-mode fallback; call-sites always override with context.colors.textPrimary.
  static TextStyle get _base => GoogleFonts.inter(
        color: const Color(0xFFFFFFFF),
        letterSpacing: -0.1,
      );

  // Font sizes (xs=10, sm=11, md=12, lg=14, xl=16, 2xl=18, 3xl=20, 4xl=24)
  static TextStyle get xs => _base.copyWith(fontSize: 10, height: 1.4);
  static TextStyle get sm => _base.copyWith(fontSize: 11, height: 1.4);
  static TextStyle get md => _base.copyWith(fontSize: 12, height: 1.5);
  static TextStyle get lg => _base.copyWith(fontSize: 14, height: 1.5);
  static TextStyle get xl => _base.copyWith(fontSize: 16, height: 1.5);
  static TextStyle get xl2 => _base.copyWith(fontSize: 18, height: 1.4);
  static TextStyle get xl3 => _base.copyWith(fontSize: 20, height: 1.3);
  static TextStyle get xl4 => _base.copyWith(fontSize: 24, height: 1.2);

  // Convenience weights
  static TextStyle get labelXs => xs.copyWith(fontWeight: FontWeight.w500);
  static TextStyle get labelSm => sm.copyWith(fontWeight: FontWeight.w500);
  static TextStyle get labelMd => md.copyWith(fontWeight: FontWeight.w500);
  static TextStyle get labelLg => lg.copyWith(fontWeight: FontWeight.w500);

  static TextStyle get headingSm => xl.copyWith(fontWeight: FontWeight.w600);
  static TextStyle get headingMd => xl2.copyWith(fontWeight: FontWeight.w600);
  static TextStyle get headingLg => xl3.copyWith(fontWeight: FontWeight.w700);
  static TextStyle get headingXl => xl4.copyWith(fontWeight: FontWeight.w700);

  static TextStyle get numericLg => xl.copyWith(
        fontWeight: FontWeight.w600,
        fontFeatures: [const FontFeature.tabularFigures()],
      );
  static TextStyle get numericXl => xl2.copyWith(
        fontWeight: FontWeight.w700,
        fontFeatures: [const FontFeature.tabularFigures()],
      );
}
