import 'package:flutter/material.dart';
import '../../core/theme/app_spacing.dart';

/// Small rounded app-icon badge used in AppBar leadings.
/// Swaps to the inverse (light) icon on light theme so it never renders
/// as a black box against a light header.
class AppLogoBadge extends StatelessWidget {
  const AppLogoBadge({super.key});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Padding(
      padding: const EdgeInsets.only(left: AppSpacing.s4),
      child: Container(
        width: 32,
        height: 32,
        padding: const EdgeInsets.all(3),
        decoration: BoxDecoration(
          color: isDark ? Colors.black : Colors.white,
          borderRadius: BorderRadius.circular(9),
        ),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(6),
          child: Image.asset(
            isDark
                ? 'assets/images/app_icon.png'
                : 'assets/images/app_icon_light.png',
            fit: BoxFit.contain,
          ),
        ),
      ),
    );
  }
}
