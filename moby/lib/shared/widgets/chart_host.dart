import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/theme/app_palette.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/theme/app_typography.dart';
import '../../providers/chart_provider_provider.dart';
import '../../utils/tv_symbol.dart';
import 'app_shell_insets.dart';
import 'chart_overlay_models.dart';
import 'in_house_candlestick_chart.dart';
import 'lwc_webview_chart.dart';
import 'tv_advanced_chart_widget.dart';

export 'chart_overlay_models.dart' show SignalLevels, TradeMarker;

/// Picks a chart renderer based on `chartProviderProvider`. The wire-level
/// X-Chart-Renderer header is set by the Dio interceptor — the host only needs
/// to choose the rendering widget.
class ChartHost extends ConsumerWidget {
  const ChartHost({
    super.key,
    required this.symbol,
    required this.name,
    this.initialRange = '1M',
    this.withVwap = false,
    this.showRangeBar = true,
    this.showFullscreenButton = false,
    this.onFullscreen,
    this.signalLevels,
    this.tradeMarkers,
  });

  final String symbol;
  final String name;
  final String initialRange;

  /// Lightweight Charts–only VWAP overlay. In-house renderer reads its own
  /// VWAP visibility from `indicatorPrefsProvider`.
  final bool withVwap;

  final bool showRangeBar;
  final bool showFullscreenButton;
  final VoidCallback? onFullscreen;

  /// Signal entry/SL/TP lines and backtest trade markers. Rendered by the
  /// in-house chart and the LWC WebView (yahoo mode + TV-fallback); the real
  /// TradingView embed is a sealed third-party widget and cannot accept them.
  final SignalLevels? signalLevels;
  final List<TradeMarker>? tradeMarkers;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final provider = ref.watch(chartProviderProvider);
    switch (provider) {
      case ChartDataProvider.yahoo:
        return LwcWebViewChart(
          symbol: symbol,
          name: name,
          initialRange: initialRange,
          withVwap: withVwap,
          showRangeBar: showRangeBar,
          showFullscreenButton: showFullscreenButton,
          onFullscreen: onFullscreen,
          signalLevels: signalLevels,
          tradeMarkers: tradeMarkers,
        );
      case ChartDataProvider.tradingView:
        final tvSym = TvSymbol.resolveForEmbeddedWidget(symbol);
        if (tvSym != null) {
          return _TvChartWithFallback(
            tvSymbol: tvSym,
            symbol: symbol,
            name: name,
            initialRange: initialRange,
            withVwap: withVwap,
            showRangeBar: showRangeBar,
            showFullscreenButton: showFullscreenButton,
            onFullscreen: onFullscreen,
          );
        }
        // Unmapped symbol — the free TV embed would show its in-widget
        // paywall card, so serve the Yahoo/LWC chart with a TV watermark.
        return LwcWebViewChart(
          symbol: symbol,
          name: name,
          initialRange: initialRange,
          withVwap: withVwap,
          tvWatermarkLabel: TvSymbol.resolveForTv(symbol),
          showRangeBar: showRangeBar,
          showFullscreenButton: showFullscreenButton,
          onFullscreen: onFullscreen,
          signalLevels: signalLevels,
          tradeMarkers: tradeMarkers,
        );
      case ChartDataProvider.inHouse:
        return InHouseCandlestickChart(
          symbol: symbol,
          name: name,
          initialRange: initialRange,
          showRangeBar: showRangeBar,
          showFullscreenButton: showFullscreenButton,
          onFullscreen: onFullscreen,
          signalLevels: signalLevels,
          tradeMarkers: tradeMarkers,
        );
    }
  }
}

/// Hosts the real TradingView embed with a session-local escape hatch. The
/// free embed widget renders its paywall/error card *inside* the page, which
/// is undetectable from Flutter — so after a delay we surface a small
/// "Chart not loading?" pill that swaps this instance to the Yahoo/LWC chart
/// without touching the global provider setting.
class _TvChartWithFallback extends StatefulWidget {
  const _TvChartWithFallback({
    required this.tvSymbol,
    required this.symbol,
    required this.name,
    required this.initialRange,
    required this.withVwap,
    required this.showRangeBar,
    required this.showFullscreenButton,
    required this.onFullscreen,
  });

  final String tvSymbol;
  final String symbol;
  final String name;
  final String initialRange;
  final bool withVwap;
  final bool showRangeBar;
  final bool showFullscreenButton;
  final VoidCallback? onFullscreen;

  @override
  State<_TvChartWithFallback> createState() => _TvChartWithFallbackState();
}

class _TvChartWithFallbackState extends State<_TvChartWithFallback> {
  bool _useFallback = false;
  bool _showEscapeHatch = false;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _timer = Timer(const Duration(seconds: 6), () {
      if (mounted) setState(() => _showEscapeHatch = true);
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (_useFallback) {
      return LwcWebViewChart(
        symbol: widget.symbol,
        name: widget.name,
        initialRange: widget.initialRange,
        withVwap: widget.withVwap,
        showRangeBar: widget.showRangeBar,
        showFullscreenButton: widget.showFullscreenButton,
        onFullscreen: widget.onFullscreen,
      );
    }
    final c = context.colors;
    final isDark = Theme.of(context).brightness == Brightness.dark;
    // AppShell uses extendBody:true — reserve the glass nav pill inset or the
    // TV widget's time axis (and our escape pill) hide behind it.
    return Padding(
      padding: EdgeInsets.only(bottom: appShellBottomInset(context)),
      child: Stack(
      children: [
        Positioned.fill(
          child: TvAdvancedChartWidget(
            tvSymbol: widget.tvSymbol,
            isDark: isDark,
          ),
        ),
        if (_showEscapeHatch)
          Positioned(
            left: 0,
            right: 0,
            bottom: AppSpacing.s4,
            child: Center(
              child: GestureDetector(
                onTap: () => setState(() => _useFallback = true),
                child: Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: AppSpacing.s4,
                    vertical: AppSpacing.s2,
                  ),
                  decoration: BoxDecoration(
                    color: c.surfaceElevated.withAlpha(230),
                    borderRadius: BorderRadius.circular(AppRadius.full),
                    border: Border.all(color: c.border),
                  ),
                  child: Text(
                    'Chart not loading? Switch to Yahoo chart',
                    style: AppTypography.sm.copyWith(color: c.textSecondary),
                  ),
                ),
              ),
            ),
          ),
      ],
      ),
    );
  }
}
