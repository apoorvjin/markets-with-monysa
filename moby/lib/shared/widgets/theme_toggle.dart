import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/theme/app_palette.dart';
import '../../providers/theme_provider.dart';

class ThemeToggleButton extends ConsumerWidget {
  const ThemeToggleButton({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final c = context.colors;

    return Semantics(
      label: isDark ? 'Switch to light mode' : 'Switch to dark mode',
      button: true,
      child: GestureDetector(
      onTap: () => ref.read(themeModeProvider.notifier).toggle(),
      child: Container(
        margin: const EdgeInsets.symmetric(vertical: 10, horizontal: 4),
        padding: const EdgeInsets.all(3),
        decoration: BoxDecoration(
          color: c.surfaceCard,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: c.border),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            _Pip(icon: Icons.wb_sunny_rounded, active: !isDark, palette: c),
            _Pip(icon: Icons.nightlight_round, active: isDark, palette: c),
          ],
        ),
      ),
      ),
    );
  }
}

class _Pip extends StatelessWidget {
  const _Pip({required this.icon, required this.active, required this.palette});
  final IconData icon;
  final bool active;
  final AppPalette palette;

  @override
  Widget build(BuildContext context) {
    return AnimatedContainer(
      duration: const Duration(milliseconds: 180),
      width: 24,
      height: 24,
      decoration: BoxDecoration(
        color: active ? palette.accent.withAlpha(50) : Colors.transparent,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Icon(
        icon,
        size: 14,
        color: active ? palette.accent : palette.textMuted,
      ),
    );
  }
}
