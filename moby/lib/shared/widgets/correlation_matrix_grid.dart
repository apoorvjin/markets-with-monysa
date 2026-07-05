import 'package:flutter/material.dart';
import '../../core/theme/app_palette.dart';
import '../../core/theme/app_typography.dart';
import '../../data/models/adv_correlation_models.dart';

/// Scrollable correlation matrix with frozen header row + left column.
///
/// `symbols`/`matrix` are expected to already be filtered to the visible set
/// (category filtering happens in the caller) — this widget just renders
/// whatever square matrix it's given.
class CorrelationMatrixGrid extends StatefulWidget {
  const CorrelationMatrixGrid({
    super.key,
    required this.symbols,
    required this.matrix,
    required this.onCellTap,
  });

  final List<AdvCorrelationSymbol> symbols;
  final List<List<double>> matrix;
  final void Function(AdvCorrelationSymbol a, AdvCorrelationSymbol b) onCellTap;

  @override
  State<CorrelationMatrixGrid> createState() => _CorrelationMatrixGridState();
}

const double _kCellWidth = 60;
const double _kCellHeight = 40;
const double _kHeaderColWidth = 88;

class _CorrelationMatrixGridState extends State<CorrelationMatrixGrid> {
  final _headerH = ScrollController();
  final _leftV = ScrollController();
  final _bodyH = ScrollController();
  final _bodyV = ScrollController();

  @override
  void initState() {
    super.initState();
    _link(_headerH, _bodyH);
    _link(_bodyH, _headerH);
    _link(_leftV, _bodyV);
    _link(_bodyV, _leftV);
  }

  // Mirrors offset changes between two controllers without a third-party
  // package — a standard hand-rolled sync for a frozen header/column grid.
  void _link(ScrollController from, ScrollController to) {
    from.addListener(() {
      if (to.hasClients && to.offset != from.offset) {
        to.jumpTo(from.offset.clamp(0.0, to.position.maxScrollExtent));
      }
    });
  }

  @override
  void dispose() {
    _headerH.dispose();
    _leftV.dispose();
    _bodyH.dispose();
    _bodyV.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final symbols = widget.symbols;

    return Column(
      children: [
        Row(
          children: [
            const SizedBox(width: _kHeaderColWidth, height: _kCellHeight),
            Expanded(
              child: SingleChildScrollView(
                controller: _headerH,
                scrollDirection: Axis.horizontal,
                child: Row(
                  children: [
                    for (final s in symbols)
                      _HeaderCell(label: s.flag.isNotEmpty ? s.flag : s.symbol, tooltip: s.name),
                  ],
                ),
              ),
            ),
          ],
        ),
        Divider(height: 1, color: c.border),
        Expanded(
          child: Row(
            children: [
              SizedBox(
                width: _kHeaderColWidth,
                child: SingleChildScrollView(
                  controller: _leftV,
                  physics: const ClampingScrollPhysics(),
                  child: Column(
                    children: [
                      for (final s in symbols)
                        _RowHeaderCell(label: '${s.flag} ${s.symbol}', tooltip: s.name),
                    ],
                  ),
                ),
              ),
              VerticalDivider(width: 1, color: c.border),
              Expanded(
                child: SingleChildScrollView(
                  controller: _bodyH,
                  scrollDirection: Axis.horizontal,
                  physics: const ClampingScrollPhysics(),
                  child: SingleChildScrollView(
                    controller: _bodyV,
                    physics: const ClampingScrollPhysics(),
                    child: Column(
                      children: [
                        for (int i = 0; i < symbols.length; i++)
                          Row(
                            children: [
                              for (int j = 0; j < symbols.length; j++)
                                _Cell(
                                  value: (i < widget.matrix.length && j < widget.matrix[i].length)
                                      ? widget.matrix[i][j]
                                      : 0,
                                  isDiagonal: i == j,
                                  onTap: i == j
                                      ? null
                                      : () => widget.onCellTap(symbols[i], symbols[j]),
                                ),
                            ],
                          ),
                      ],
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

Color _corrColor(AppPalette c, double v) {
  final t = v.clamp(-1.0, 1.0);
  return t >= 0
      ? Color.lerp(c.surfaceCard, c.positive, t.abs() * 0.65)!
      : Color.lerp(c.surfaceCard, c.danger, t.abs() * 0.65)!;
}

class _HeaderCell extends StatelessWidget {
  const _HeaderCell({required this.label, required this.tooltip});
  final String label;
  final String tooltip;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Tooltip(
      message: tooltip,
      // Default Tooltip only shows on long-press on touch devices, which
      // isn't discoverable — a simple tap reveals what the flag/symbol means.
      triggerMode: TooltipTriggerMode.tap,
      showDuration: const Duration(seconds: 2),
      child: SizedBox(
        width: _kCellWidth,
        height: _kCellHeight,
        child: Center(
          child: Text(
            label,
            style: AppTypography.xs.copyWith(color: c.textMuted),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
        ),
      ),
    );
  }
}

class _RowHeaderCell extends StatelessWidget {
  const _RowHeaderCell({required this.label, required this.tooltip});
  final String label;
  final String tooltip;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Tooltip(
      message: tooltip,
      triggerMode: TooltipTriggerMode.tap,
      showDuration: const Duration(seconds: 2),
      child: SizedBox(
        height: _kCellHeight,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 6),
          child: Align(
            alignment: Alignment.centerLeft,
            child: Text(
              label,
              style: AppTypography.xs.copyWith(color: c.textPrimary),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ),
        ),
      ),
    );
  }
}

class _Cell extends StatelessWidget {
  const _Cell({required this.value, required this.isDiagonal, this.onTap});
  final double value;
  final bool isDiagonal;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: _kCellWidth,
        height: _kCellHeight,
        alignment: Alignment.center,
        color: _corrColor(c, value),
        child: Text(
          value.toStringAsFixed(2),
          style: AppTypography.xs.copyWith(color: c.textPrimary),
        ),
      ),
    );
  }
}
