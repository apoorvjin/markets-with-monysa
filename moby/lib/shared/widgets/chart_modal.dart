import 'package:flutter/material.dart';
import '../../core/theme/app_palette.dart';
import '../../core/theme/app_typography.dart';
import 'app_shell_insets.dart';
import 'chart_host.dart';

class ChartModal extends StatelessWidget {
  const ChartModal({
    super.key,
    required this.symbol,
    required this.name,
  });

  final String symbol;
  final String name;

  static Future<void> show(
    BuildContext context, {
    required String symbol,
    required String name,
  }) {
    // enableDrag: false because chart pan/pinch gestures bubble up and
    // dismiss the sheet otherwise. The header's X button is the close path.
    return showAppBottomSheet<void>(
      context: context,
      enableDrag: false,
      builder: (_) => ChartModal(symbol: symbol, name: name),
    );
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final height = MediaQuery.of(context).size.height * 0.82;

    return Container(
      height: height,
      decoration: BoxDecoration(
        color: c.surface,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
      ),
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.only(top: 10, bottom: 2),
            child: Container(
              width: 36,
              height: 4,
              decoration: BoxDecoration(
                color: c.border,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),
          _Header(name: name, symbol: symbol),
          Divider(height: 1, color: c.border),
          Expanded(
            child: ChartHost(
              symbol: symbol,
              name: name,
              initialRange: '1M',
              withVwap: false,
            ),
          ),
        ],
      ),
    );
  }
}

class _Header extends StatelessWidget {
  const _Header({required this.name, required this.symbol});
  final String name;
  final String symbol;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(name,
                    style: AppTypography.headingSm
                        .copyWith(color: c.textPrimary),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis),
                const SizedBox(height: 2),
                Text(symbol,
                    style: AppTypography.sm.copyWith(color: c.textMuted)),
              ],
            ),
          ),
          IconButton(
            icon: Icon(Icons.close, color: c.textMuted, size: 20),
            onPressed: () => Navigator.of(context).pop(),
          ),
        ],
      ),
    );
  }
}
