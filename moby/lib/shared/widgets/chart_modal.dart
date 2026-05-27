import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:webview_flutter/webview_flutter.dart';
import '../../core/network/api_client.dart';
import '../../core/network/api_endpoints.dart';
import '../../core/theme/app_palette.dart';
import '../../core/theme/app_typography.dart';
import '../../core/theme/app_spacing.dart';
import '../../providers/chart_provider_provider.dart';
import '../../utils/tv_symbol.dart';

class ChartModal extends ConsumerStatefulWidget {
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
    return showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      enableDrag: false,
      useSafeArea: true,
      backgroundColor: Colors.transparent,
      clipBehavior: Clip.antiAlias,
      builder: (_) => ChartModal(symbol: symbol, name: name),
    );
  }

  @override
  ConsumerState<ChartModal> createState() => _ChartModalState();
}

class _ChartModalState extends ConsumerState<ChartModal> {
  String _range = '1M';
  late final WebViewController _controller;
  bool _loading = true;
  String? _error;
  Timer? _timeoutTimer;
  bool? _isDark;

  static const _ranges = ['1M', '3M', '6M', '1Y', '5Y'];
  static const _rangeMap = {
    '1M': '1mo',
    '3M': '3mo',
    '6M': '6mo',
    '1Y': '1y',
    '5Y': '5y',
  };

  @override
  void initState() {
    super.initState();
    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted);
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final isDark = Theme.of(context).brightness == Brightness.dark;
    if (_isDark != isDark) {
      _isDark = isDark;
      _controller.setBackgroundColor(
          isDark ? const Color(0xFF0A0A0A) : Colors.white);
      _loadChart();
    }
  }

  @override
  void dispose() {
    _timeoutTimer?.cancel();
    super.dispose();
  }

  Future<void> _loadChart() async {
    _timeoutTimer?.cancel();
    if (mounted) setState(() { _loading = true; _error = null; });
    _timeoutTimer = Timer(const Duration(seconds: 10), () {
      if (mounted && _loading) {
        setState(() {
          _loading = false;
          _error = 'Chart timed out — tap to retry';
        });
      }
    });
    try {
      final range = _rangeMap[_range] ?? '1mo';
      // Resolve TV symbol for watermark label when TradingView provider is active
      final provider = ref.read(chartProviderProvider);
      final tvLabel = provider == ChartDataProvider.tradingView
          ? TvSymbol.resolveForTv(widget.symbol)
          : null;
      final data = await ApiClient.instance.get(
        ApiEndpoints.chart(widget.symbol),
        params: {'range': range},
      ) as Map<String, dynamic>;
      final candles = data['candles'] as List? ?? [];
      if (!mounted) return;
      _timeoutTimer?.cancel();
      await _controller.loadHtmlString(
          _buildLwcHtml(jsonEncode(candles), _isDark ?? false, tvLabel: tvLabel));
    } catch (e) {
      _timeoutTimer?.cancel();
      if (mounted) setState(() => _error = 'Failed to load chart data');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  String _buildLwcHtml(String candleJson, bool isDark, {String? tvLabel}) {
    final bg          = isDark ? '#0a0a0a' : '#ffffff';
    final textColor   = isDark ? '#adb5bd'  : '#374151';
    final gridColor   = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
    final borderColor = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)';
    final upColor     = isDark ? '#00D4AA' : '#00C49A';
    final downColor   = isDark ? '#FF4D6A' : '#E8384F';
    final upVol       = isDark ? 'rgba(0,212,170,0.3)' : 'rgba(0,196,154,0.3)';
    final downVol     = isDark ? 'rgba(255,77,106,0.3)' : 'rgba(232,56,79,0.3)';
    final wmColor     = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)';
    // Watermark: shows TV symbol identifier (e.g. FX:EURUSD) when TV provider is active
    final watermarkJs = tvLabel != null
        ? "chart.applyOptions({ watermark: { color: '$wmColor', visible: true, text: '$tvLabel', fontSize: 18, horzAlign: 'center', vertAlign: 'center' } });"
        : '';

    return '''
<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { background:$bg; color:$textColor; font-family:sans-serif; }
  #chart { width:100%; height:100vh; }
</style>
</head>
<body>
<div id="chart"></div>
<script src="https://unpkg.com/lightweight-charts@4.1.1/dist/lightweight-charts.standalone.production.js"></script>
<script>
const chart = LightweightCharts.createChart(document.getElementById('chart'), {
  layout: { background: { color: '$bg' }, textColor: '$textColor' },
  grid: { vertLines: { color: '$gridColor' }, horzLines: { color: '$gridColor' } },
  crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
  rightPriceScale: { borderColor: '$borderColor' },
  timeScale: { borderColor: '$borderColor', timeVisible: true },
  handleScroll: true,
  handleScale: true,
});

const candleSeries = chart.addCandlestickSeries({
  upColor: '$upColor', downColor: '$downColor',
  borderUpColor: '$upColor', borderDownColor: '$downColor',
  wickUpColor: '$upColor', wickDownColor: '$downColor',
});

const volumeSeries = chart.addHistogramSeries({
  color: '$upVol',
  priceFormat: { type: 'volume' },
  priceScaleId: '',
});

chart.priceScale('').applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });

const raw = $candleJson;
candleSeries.setData(raw.map(c => ({ time: c.time, open: c.open, high: c.high, low: c.low, close: c.close })));
volumeSeries.setData(raw.map(c => ({ time: c.time, value: c.volume || 0, color: c.close >= c.open ? '$upVol' : '$downVol' })));
$watermarkJs
chart.timeScale().fitContent();

window.addEventListener('resize', () => chart.resize(window.innerWidth, window.innerHeight));
</script>
</body>
</html>
''';
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
          _Header(name: widget.name, symbol: widget.symbol),
          Divider(height: 1, color: c.border),
          _RangeSelector(
            selected: _range,
            ranges: _ranges,
            onSelected: (r) {
              setState(() => _range = r);
              _loadChart();
            },
          ),
          Divider(height: 1, color: c.border),
          Expanded(
            child: _loading
                ? Center(child: CircularProgressIndicator(color: c.accent))
                : _error != null
                    ? Center(
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(_error!,
                                style: AppTypography.md
                                    .copyWith(color: c.textMuted),
                                textAlign: TextAlign.center),
                            const SizedBox(height: AppSpacing.s4),
                            GestureDetector(
                              onTap: _loadChart,
                              child: Container(
                                padding: const EdgeInsets.symmetric(
                                    horizontal: AppSpacing.s5,
                                    vertical: AppSpacing.s3),
                                decoration: BoxDecoration(
                                  color: c.accentDim,
                                  borderRadius:
                                      BorderRadius.circular(AppRadius.full),
                                  border:
                                      Border.all(color: c.accent.withAlpha(60)),
                                ),
                                child: Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    Icon(Icons.refresh_rounded,
                                        size: 15, color: c.accent),
                                    const SizedBox(width: AppSpacing.s2),
                                    Text('Reload',
                                        style: AppTypography.labelSm
                                            .copyWith(color: c.accent)),
                                  ],
                                ),
                              ),
                            ),
                          ],
                        ),
                      )
                    : WebViewWidget(controller: _controller),
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

class _RangeSelector extends StatelessWidget {
  const _RangeSelector({
    required this.selected,
    required this.ranges,
    required this.onSelected,
  });

  final String selected;
  final List<String> ranges;
  final ValueChanged<String> onSelected;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return SizedBox(
      height: 40,
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: ranges.map((r) {
          final isActive = r == selected;
          return GestureDetector(
            onTap: () => onSelected(r),
            child: Container(
              margin: const EdgeInsets.symmetric(horizontal: 4, vertical: 6),
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
              decoration: BoxDecoration(
                color: isActive ? c.accent : Colors.transparent,
                borderRadius: BorderRadius.circular(AppRadius.full),
              ),
              child: Text(
                r,
                style: AppTypography.sm.copyWith(
                  color: isActive ? c.background : c.textMuted,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          );
        }).toList(),
      ),
    );
  }
}
