import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../providers/chart_provider_provider.dart';
import '../../utils/tv_symbol.dart';
import 'in_house_candlestick_chart.dart';
import 'lwc_webview_chart.dart';

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
        );
      case ChartDataProvider.tradingView:
        return LwcWebViewChart(
          symbol: symbol,
          name: name,
          initialRange: initialRange,
          withVwap: withVwap,
          tvWatermarkLabel: TvSymbol.resolveForTv(symbol),
          showRangeBar: showRangeBar,
          showFullscreenButton: showFullscreenButton,
          onFullscreen: onFullscreen,
        );
      case ChartDataProvider.inHouse:
        return InHouseCandlestickChart(
          symbol: symbol,
          name: name,
          initialRange: initialRange,
          showRangeBar: showRangeBar,
          showFullscreenButton: showFullscreenButton,
          onFullscreen: onFullscreen,
        );
    }
  }
}
