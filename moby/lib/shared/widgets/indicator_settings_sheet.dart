import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/theme/app_palette.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/theme/app_typography.dart';
import '../../providers/indicator_prefs_provider.dart';
import 'app_shell_insets.dart';

class IndicatorSettingsSheet extends ConsumerWidget {
  const IndicatorSettingsSheet({super.key});

  static Future<void> show(BuildContext context) => showAppBottomSheet<void>(
        context: context,
        builder: (_) => const IndicatorSettingsSheet(),
      );

  // 12-swatch palette shown in the color picker. Covers a cohesive set of
  // hues (blues, purples, ambers, teals, pinks) — saturated enough to read
  // against a dark plot background without clashing with the bull/bear
  // candle colors.
  static const _palette = <int>[
    0xFF8FCBFF, 0xFF5B9CFF, 0xFF6E7BF6, 0xFF8B5CF6,
    0xFFC463E0, 0xFFFF6B9D, 0xFFFFA56B, 0xFFD6C04B,
    0xFF00D4AA, 0xFF4ADE80, 0xFFFFFFFF, 0xFFADB5BD,
  ];

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final prefs = ref.watch(indicatorPrefsProvider);
    final notifier = ref.read(indicatorPrefsProvider.notifier);

    return Container(
      decoration: BoxDecoration(
        color: c.surface,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
      ),
      padding: EdgeInsets.fromLTRB(
          AppSpacing.s5,
          AppSpacing.s4,
          AppSpacing.s5,
          // Reserve room so the last row clears the AppShell glass nav pill
          // — without this, "Sensitivity" / "Tenkan" etc. sit under the nav.
          AppSpacing.s5 + appShellBottomInset(context)),
      child: SingleChildScrollView(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
              Center(
                child: Container(
                  width: 36,
                  height: 4,
                  decoration: BoxDecoration(
                    color: c.border,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
              const SizedBox(height: AppSpacing.s4),
              Text('Indicators',
                  style: AppTypography.headingMd
                      .copyWith(color: c.textPrimary)),
              const SizedBox(height: AppSpacing.s5),
              _SectionHeader(label: 'Moving averages'),
              const SizedBox(height: AppSpacing.s3),
              for (var i = 0; i < prefs.smas.length; i++)
                _SmaRow(
                  config: prefs.smas[i],
                  onToggle: () => notifier.toggleSma(i),
                  onPeriodChanged: (p) => notifier.updateSmaPeriod(i, p),
                  onColorTap: () => _pickColor(
                    context,
                    current: prefs.smas[i].colorValue,
                    onPicked: (v) => notifier.updateSmaColor(i, v),
                  ),
                  onDelete: prefs.smas.length > 1
                      ? () => notifier.removeSma(i)
                      : null,
                ),
              if (prefs.smas.length < 6)
                _AddRow(
                  label: 'Add moving average',
                  onTap: () {
                    final nextColor =
                        _palette[prefs.smas.length % _palette.length];
                    notifier.addSma(100, nextColor);
                  },
                ),
              const SizedBox(height: AppSpacing.s5),
              _SectionHeader(label: 'Exponential moving averages'),
              const SizedBox(height: AppSpacing.s3),
              for (var i = 0; i < prefs.emas.length; i++)
                _SmaRow(
                  config: SmaConfig(
                    period: prefs.emas[i].period,
                    colorValue: prefs.emas[i].colorValue,
                    visible: prefs.emas[i].visible,
                  ),
                  labelPrefix: 'EMA',
                  onToggle: () => notifier.toggleEma(i),
                  onPeriodChanged: (p) => notifier.updateEmaPeriod(i, p),
                  onColorTap: () => _pickColor(
                    context,
                    current: prefs.emas[i].colorValue,
                    onPicked: (v) => notifier.updateEmaColor(i, v),
                  ),
                  onDelete: () => notifier.removeEma(i),
                ),
              if (prefs.emas.length < 6)
                _AddRow(
                  label: 'Add EMA',
                  onTap: () {
                    final nextColor =
                        _palette[prefs.emas.length % _palette.length];
                    notifier.addEma(21, nextColor);
                  },
                ),
              const SizedBox(height: AppSpacing.s5),
              _SectionHeader(label: 'Bollinger Bands'),
              const SizedBox(height: AppSpacing.s3),
              _ToggleRow(
                label: 'Show bands',
                subtitle: 'SMA(period) ± stddev × σ',
                value: prefs.bollinger.visible,
                onChanged: notifier.setBollingerVisible,
              ),
              if (prefs.bollinger.visible) ...[
                const SizedBox(height: AppSpacing.s2),
                _NumberFieldRow(
                  label: 'Period',
                  value: prefs.bollinger.period.toString(),
                  onChanged: (v) {
                    final n = int.tryParse(v);
                    if (n != null) notifier.setBollingerPeriod(n);
                  },
                  trailing: _ColorSwatch(
                    color: prefs.bollinger.color,
                    onTap: () => _pickColor(
                      context,
                      current: prefs.bollinger.colorValue,
                      onPicked: notifier.setBollingerColor,
                    ),
                  ),
                ),
                _NumberFieldRow(
                  label: 'Stddev',
                  value: prefs.bollinger.stddev.toStringAsFixed(1),
                  onChanged: (v) {
                    final n = double.tryParse(v);
                    if (n != null && n > 0) notifier.setBollingerStddev(n);
                  },
                ),
              ],
              const SizedBox(height: AppSpacing.s5),
              _SectionHeader(label: 'Overlays'),
              const SizedBox(height: AppSpacing.s3),
              _ToggleRow(
                label: 'VWAP',
                subtitle: 'Volume-weighted average price',
                value: prefs.vwapVisible,
                onChanged: notifier.setVwapVisible,
              ),
              const SizedBox(height: AppSpacing.s3),
              _ToggleRow(
                label: 'Anchored VWAP',
                subtitle: prefs.anchoredVwap.anchor == null
                    ? 'Anchor: start of visible range'
                    : 'Anchor: ${prefs.anchoredVwap.anchor!.toIso8601String().split("T")[0]}',
                value: prefs.anchoredVwap.visible,
                onChanged: (v) {
                  notifier.setAnchoredVwapVisible(v);
                  // When toggled on without an explicit anchor, default to
                  // the start of the current data range. User can re-anchor
                  // via "Anchor on next long-press" below.
                },
              ),
              if (prefs.anchoredVwap.visible) ...[
                const SizedBox(height: AppSpacing.s2),
                TextButton.icon(
                  onPressed: notifier.clearAnchoredVwapAnchor,
                  icon: Icon(Icons.flag_outlined, color: c.accent, size: 16),
                  label: Text('Reset anchor to start of range',
                      style: AppTypography.labelSm
                          .copyWith(color: c.accent)),
                ),
              ],
              const SizedBox(height: AppSpacing.s5),
              _SectionHeader(label: 'Ichimoku Cloud'),
              const SizedBox(height: AppSpacing.s3),
              _ToggleRow(
                label: 'Show Ichimoku',
                subtitle: 'Tenkan / Kijun / Kumo cloud',
                value: prefs.ichimoku.visible,
                onChanged: notifier.setIchimokuVisible,
              ),
              if (prefs.ichimoku.visible) ...[
                const SizedBox(height: AppSpacing.s2),
                _NumberFieldRow(
                  label: 'Tenkan',
                  value: prefs.ichimoku.tenkanPeriod.toString(),
                  onChanged: (v) {
                    final n = int.tryParse(v);
                    if (n != null) notifier.setIchimokuTenkan(n);
                  },
                ),
                _NumberFieldRow(
                  label: 'Kijun',
                  value: prefs.ichimoku.kijunPeriod.toString(),
                  onChanged: (v) {
                    final n = int.tryParse(v);
                    if (n != null) notifier.setIchimokuKijun(n);
                  },
                ),
                _NumberFieldRow(
                  label: 'SenkouB',
                  value: prefs.ichimoku.senkouBPeriod.toString(),
                  onChanged: (v) {
                    final n = int.tryParse(v);
                    if (n != null) notifier.setIchimokuSenkouB(n);
                  },
                ),
                _NumberFieldRow(
                  label: 'Shift',
                  value: prefs.ichimoku.displacement.toString(),
                  onChanged: (v) {
                    final n = int.tryParse(v);
                    if (n != null) notifier.setIchimokuDisplacement(n);
                  },
                ),
              ],
              const SizedBox(height: AppSpacing.s5),
              _SectionHeader(label: 'RSI (sub-pane)'),
              const SizedBox(height: AppSpacing.s3),
              _ToggleRow(
                label: 'Show RSI',
                subtitle: 'Relative Strength Index (Wilder)',
                value: prefs.rsi.visible,
                onChanged: notifier.setRsiVisible,
              ),
              if (prefs.rsi.visible) ...[
                const SizedBox(height: AppSpacing.s2),
                _NumberFieldRow(
                  label: 'Period',
                  value: prefs.rsi.period.toString(),
                  onChanged: (v) {
                    final n = int.tryParse(v);
                    if (n != null) notifier.setRsiPeriod(n);
                  },
                  trailing: _ColorSwatch(
                    color: prefs.rsi.color,
                    onTap: () => _pickColor(
                      context,
                      current: prefs.rsi.colorValue,
                      onPicked: notifier.setRsiColor,
                    ),
                  ),
                ),
                _NumberFieldRow(
                  label: 'OB',
                  value: prefs.rsi.overbought.toStringAsFixed(0),
                  onChanged: (v) {
                    final n = double.tryParse(v);
                    if (n != null) notifier.setRsiOverbought(n);
                  },
                ),
                _NumberFieldRow(
                  label: 'OS',
                  value: prefs.rsi.oversold.toStringAsFixed(0),
                  onChanged: (v) {
                    final n = double.tryParse(v);
                    if (n != null) notifier.setRsiOversold(n);
                  },
                ),
              ],
              const SizedBox(height: AppSpacing.s5),
              _SectionHeader(label: 'MACD (sub-pane)'),
              const SizedBox(height: AppSpacing.s3),
              _ToggleRow(
                label: 'Show MACD',
                subtitle: 'EMA(fast) − EMA(slow), signal, histogram',
                value: prefs.macd.visible,
                onChanged: notifier.setMacdVisible,
              ),
              if (prefs.macd.visible) ...[
                const SizedBox(height: AppSpacing.s2),
                _NumberFieldRow(
                  label: 'Fast',
                  value: prefs.macd.fast.toString(),
                  onChanged: (v) {
                    final n = int.tryParse(v);
                    if (n != null) notifier.setMacdFast(n);
                  },
                ),
                _NumberFieldRow(
                  label: 'Slow',
                  value: prefs.macd.slow.toString(),
                  onChanged: (v) {
                    final n = int.tryParse(v);
                    if (n != null) notifier.setMacdSlow(n);
                  },
                ),
                _NumberFieldRow(
                  label: 'Signal',
                  value: prefs.macd.signal.toString(),
                  onChanged: (v) {
                    final n = int.tryParse(v);
                    if (n != null) notifier.setMacdSignal(n);
                  },
                ),
              ],
              const SizedBox(height: AppSpacing.s5),
              _SectionHeader(label: 'Support / Resistance'),
              const SizedBox(height: AppSpacing.s3),
              _ToggleRow(
                label: 'Show levels',
                subtitle: 'Server-detected pivot clusters',
                value: prefs.srVisible,
                onChanged: notifier.setSrVisible,
              ),
              if (prefs.srVisible) ...[
                const SizedBox(height: AppSpacing.s3),
                Text('Sensitivity: ${prefs.srLookback}',
                    style:
                        AppTypography.sm.copyWith(color: c.textSecondary)),
                Slider(
                  value: prefs.srLookback.toDouble(),
                  min: 3,
                  max: 15,
                  divisions: 12,
                  activeColor: c.accent,
                  onChanged: (v) => notifier.setSrLookback(v.round()),
                ),
                Text(
                  'Higher values surface fewer but stronger levels.',
                  style: AppTypography.xs.copyWith(color: c.textMuted),
                ),
              ],
              const SizedBox(height: AppSpacing.s5),
              _SectionHeader(label: 'Pivot Points'),
              const SizedBox(height: AppSpacing.s3),
              _ToggleRow(
                label: 'Show pivots',
                subtitle: 'From the previous day (intraday) or month (daily)',
                value: prefs.pivots.visible,
                onChanged: notifier.setPivotsVisible,
              ),
              if (prefs.pivots.visible) ...[
                const SizedBox(height: AppSpacing.s2),
                _ToggleRow(
                  label: 'Camarilla',
                  subtitle: prefs.pivots.camarilla
                      ? 'R4–S4 tight reversal bands'
                      : 'Off: classic P / R1–R3 / S1–S3',
                  value: prefs.pivots.camarilla,
                  onChanged: notifier.setPivotsCamarilla,
                ),
              ],
              const SizedBox(height: AppSpacing.s5),
              _SectionHeader(label: 'Stochastic (sub-pane)'),
              const SizedBox(height: AppSpacing.s3),
              _ToggleRow(
                label: 'Show Stochastic',
                subtitle: 'Slow %K / %D oscillator',
                value: prefs.stochastic.visible,
                onChanged: notifier.setStochasticVisible,
              ),
              if (prefs.stochastic.visible) ...[
                const SizedBox(height: AppSpacing.s2),
                _NumberFieldRow(
                  label: '%K',
                  value: prefs.stochastic.kPeriod.toString(),
                  onChanged: (v) {
                    final n = int.tryParse(v);
                    if (n != null) notifier.setStochasticKPeriod(n);
                  },
                ),
                _NumberFieldRow(
                  label: 'Smooth',
                  value: prefs.stochastic.smooth.toString(),
                  onChanged: (v) {
                    final n = int.tryParse(v);
                    if (n != null) notifier.setStochasticSmooth(n);
                  },
                ),
                _NumberFieldRow(
                  label: '%D',
                  value: prefs.stochastic.dPeriod.toString(),
                  onChanged: (v) {
                    final n = int.tryParse(v);
                    if (n != null) notifier.setStochasticDPeriod(n);
                  },
                ),
              ],
              const SizedBox(height: AppSpacing.s5),
              _SectionHeader(label: 'ATR (sub-pane)'),
              const SizedBox(height: AppSpacing.s3),
              _ToggleRow(
                label: 'Show ATR',
                subtitle: 'Average True Range (Wilder)',
                value: prefs.atr.visible,
                onChanged: notifier.setAtrVisible,
              ),
              if (prefs.atr.visible) ...[
                const SizedBox(height: AppSpacing.s2),
                _NumberFieldRow(
                  label: 'Period',
                  value: prefs.atr.period.toString(),
                  onChanged: (v) {
                    final n = int.tryParse(v);
                    if (n != null) notifier.setAtrPeriod(n);
                  },
                ),
              ],
              const SizedBox(height: AppSpacing.s5),
              _SectionHeader(label: 'ADX (sub-pane)'),
              const SizedBox(height: AppSpacing.s3),
              _ToggleRow(
                label: 'Show ADX',
                subtitle: 'Trend strength with DI+ / DI−',
                value: prefs.adx.visible,
                onChanged: notifier.setAdxVisible,
              ),
              if (prefs.adx.visible) ...[
                const SizedBox(height: AppSpacing.s2),
                _NumberFieldRow(
                  label: 'Period',
                  value: prefs.adx.period.toString(),
                  onChanged: (v) {
                    final n = int.tryParse(v);
                    if (n != null) notifier.setAdxPeriod(n);
                  },
                ),
              ],
              const SizedBox(height: AppSpacing.s5),
            ],
          ),
        ),
      );
  }

  void _pickColor(
    BuildContext context, {
    required int current,
    required ValueChanged<int> onPicked,
  }) {
    showDialog<void>(
      context: context,
      builder: (dialogCtx) {
        final c = dialogCtx.colors;
        return AlertDialog(
          backgroundColor: c.surface,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16),
          ),
          title: Text('Pick a color',
              style: AppTypography.headingSm.copyWith(color: c.textPrimary)),
          content: SizedBox(
            width: 280,
            child: Wrap(
              spacing: 12,
              runSpacing: 12,
              children: [
                for (final value in _palette)
                  GestureDetector(
                    onTap: () {
                      onPicked(value);
                      Navigator.of(dialogCtx).pop();
                    },
                    child: Container(
                      width: 40,
                      height: 40,
                      decoration: BoxDecoration(
                        color: Color(value),
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(
                          color: value == current
                              ? c.textPrimary
                              : c.border,
                          width: value == current ? 2 : 1,
                        ),
                      ),
                      child: value == current
                          ? const Icon(Icons.check_rounded,
                              color: Colors.white, size: 22)
                          : null,
                    ),
                  ),
              ],
            ),
          ),
        );
      },
    );
  }
}

class _SectionHeader extends StatelessWidget {
  const _SectionHeader({required this.label});
  final String label;
  @override
  Widget build(BuildContext context) {
    return Text(
      label.toUpperCase(),
      style: AppTypography.xs.copyWith(
        color: context.colors.textMuted,
        fontWeight: FontWeight.w600,
        letterSpacing: 1.0,
      ),
    );
  }
}

class _SmaRow extends StatefulWidget {
  const _SmaRow({
    required this.config,
    required this.onToggle,
    required this.onPeriodChanged,
    required this.onColorTap,
    required this.onDelete,
    this.labelPrefix = 'SMA',
  });

  final SmaConfig config;
  final VoidCallback onToggle;
  final ValueChanged<int> onPeriodChanged;
  final VoidCallback onColorTap;
  final VoidCallback? onDelete;
  final String labelPrefix;

  @override
  State<_SmaRow> createState() => _SmaRowState();
}

class _SmaRowState extends State<_SmaRow> {
  late final TextEditingController _ctrl;

  @override
  void initState() {
    super.initState();
    _ctrl = TextEditingController(text: widget.config.period.toString());
  }

  @override
  void didUpdateWidget(covariant _SmaRow old) {
    super.didUpdateWidget(old);
    if (widget.config.period.toString() != _ctrl.text) {
      _ctrl.text = widget.config.period.toString();
    }
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        children: [
          Switch.adaptive(
            value: widget.config.visible,
            onChanged: (_) => widget.onToggle(),
            activeColor: c.accent,
          ),
          const SizedBox(width: AppSpacing.s3),
          Text(widget.labelPrefix,
              style:
                  AppTypography.md.copyWith(color: c.textPrimary)),
          const SizedBox(width: AppSpacing.s3),
          SizedBox(
            width: 56,
            child: TextField(
              controller: _ctrl,
              keyboardType: TextInputType.number,
              inputFormatters: [FilteringTextInputFormatter.digitsOnly],
              textAlign: TextAlign.center,
              style: AppTypography.md.copyWith(color: c.textPrimary),
              decoration: InputDecoration(
                isDense: true,
                contentPadding: const EdgeInsets.symmetric(vertical: 8),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8),
                  borderSide: BorderSide(color: c.border),
                ),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8),
                  borderSide: BorderSide(color: c.border),
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8),
                  borderSide: BorderSide(color: c.accent),
                ),
              ),
              onSubmitted: (v) {
                final n = int.tryParse(v);
                if (n != null) widget.onPeriodChanged(n);
              },
              onTapOutside: (_) {
                final n = int.tryParse(_ctrl.text);
                if (n != null && n != widget.config.period) {
                  widget.onPeriodChanged(n);
                }
                FocusScope.of(context).unfocus();
              },
            ),
          ),
          const Spacer(),
          GestureDetector(
            onTap: widget.onColorTap,
            child: Container(
              width: 20,
              height: 20,
              decoration: BoxDecoration(
                color: widget.config.color,
                borderRadius: BorderRadius.circular(4),
                border: Border.all(color: c.border),
              ),
            ),
          ),
          if (widget.onDelete != null) ...[
            const SizedBox(width: AppSpacing.s3),
            IconButton(
              onPressed: widget.onDelete,
              icon: Icon(Icons.delete_outline_rounded,
                  color: c.textMuted, size: 20),
              padding: EdgeInsets.zero,
              constraints: const BoxConstraints(minWidth: 28, minHeight: 28),
            ),
          ],
        ],
      ),
    );
  }
}

class _ToggleRow extends StatelessWidget {
  const _ToggleRow({
    required this.label,
    required this.subtitle,
    required this.value,
    required this.onChanged,
  });

  final String label;
  final String subtitle;
  final bool value;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(label,
                    style:
                        AppTypography.md.copyWith(color: c.textPrimary)),
                Text(subtitle,
                    style:
                        AppTypography.xs.copyWith(color: c.textMuted)),
              ],
            ),
          ),
          Switch.adaptive(
            value: value,
            onChanged: onChanged,
            activeColor: c.accent,
          ),
        ],
      ),
    );
  }
}

class _AddRow extends StatelessWidget {
  const _AddRow({required this.label, required this.onTap});
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Padding(
      padding: const EdgeInsets.only(top: 8),
      child: GestureDetector(
        onTap: onTap,
        child: Row(
          children: [
            Icon(Icons.add_circle_outline_rounded,
                color: c.accent, size: 18),
            const SizedBox(width: AppSpacing.s2),
            Text(label,
                style: AppTypography.labelMd.copyWith(color: c.accent)),
          ],
        ),
      ),
    );
  }
}

class _NumberFieldRow extends StatefulWidget {
  const _NumberFieldRow({
    required this.label,
    required this.value,
    required this.onChanged,
    this.trailing,
  });

  final String label;
  final String value;
  final ValueChanged<String> onChanged;
  final Widget? trailing;

  @override
  State<_NumberFieldRow> createState() => _NumberFieldRowState();
}

class _NumberFieldRowState extends State<_NumberFieldRow> {
  late final TextEditingController _ctrl;

  @override
  void initState() {
    super.initState();
    _ctrl = TextEditingController(text: widget.value);
  }

  @override
  void didUpdateWidget(covariant _NumberFieldRow old) {
    super.didUpdateWidget(old);
    if (widget.value != _ctrl.text) _ctrl.text = widget.value;
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          SizedBox(
            width: 70,
            child: Text(widget.label,
                style: AppTypography.sm.copyWith(color: c.textSecondary)),
          ),
          SizedBox(
            width: 72,
            child: TextField(
              controller: _ctrl,
              keyboardType:
                  const TextInputType.numberWithOptions(decimal: true),
              textAlign: TextAlign.center,
              style: AppTypography.md.copyWith(color: c.textPrimary),
              decoration: InputDecoration(
                isDense: true,
                contentPadding: const EdgeInsets.symmetric(vertical: 8),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8),
                  borderSide: BorderSide(color: c.border),
                ),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8),
                  borderSide: BorderSide(color: c.border),
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8),
                  borderSide: BorderSide(color: c.accent),
                ),
              ),
              onSubmitted: widget.onChanged,
              onTapOutside: (_) {
                if (_ctrl.text != widget.value) widget.onChanged(_ctrl.text);
                FocusScope.of(context).unfocus();
              },
            ),
          ),
          const Spacer(),
          if (widget.trailing != null) widget.trailing!,
        ],
      ),
    );
  }
}

class _ColorSwatch extends StatelessWidget {
  const _ColorSwatch({required this.color, required this.onTap});
  final Color color;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 20,
        height: 20,
        decoration: BoxDecoration(
          color: color,
          borderRadius: BorderRadius.circular(4),
          border: Border.all(color: c.border),
        ),
      ),
    );
  }
}
