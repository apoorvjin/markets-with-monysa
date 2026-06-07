import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';
import '../../core/network/api_client.dart';
import '../../core/network/api_endpoints.dart';
import '../../core/theme/app_palette.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/theme/app_typography.dart';

/// WebView-backed Lightweight Charts renderer. Drives both the `yahoo` and
/// `tradingview` chart providers — the only difference is whether to overlay
/// a TradingView symbol watermark.
class LwcWebViewChart extends StatefulWidget {
  const LwcWebViewChart({
    super.key,
    required this.symbol,
    required this.name,
    this.initialRange = '1M',
    this.withVwap = false,
    this.tvWatermarkLabel,
    this.showRangeBar = true,
    this.showFullscreenButton = false,
    this.onFullscreen,
  });

  final String symbol;
  final String name;
  final String initialRange;
  final bool withVwap;

  /// Non-null when the TradingView provider is active. Renders as a
  /// centred watermark inside the LWC chart.
  final String? tvWatermarkLabel;

  final bool showRangeBar;
  final bool showFullscreenButton;
  final VoidCallback? onFullscreen;

  @override
  State<LwcWebViewChart> createState() => _LwcWebViewChartState();
}

class _LwcWebViewChartState extends State<LwcWebViewChart> {
  static const _ranges = ['1M', '3M', '6M', '1Y', '5Y'];
  static const _rangeMap = {
    '1M': '1mo',
    '3M': '3mo',
    '6M': '6mo',
    '1Y': '1y',
    '5Y': '5y',
  };

  late String _range;
  late final WebViewController _controller;
  bool _loading = true;
  String? _error;
  Timer? _timeoutTimer;
  bool? _isDark;

  @override
  void initState() {
    super.initState();
    _range = widget.initialRange;
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
      _load();
    }
  }

  @override
  void didUpdateWidget(covariant LwcWebViewChart old) {
    super.didUpdateWidget(old);
    if (old.tvWatermarkLabel != widget.tvWatermarkLabel ||
        old.withVwap != widget.withVwap) {
      _load();
    }
  }

  @override
  void dispose() {
    _timeoutTimer?.cancel();
    super.dispose();
  }

  Future<void> _load() async {
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
      final data = await ApiClient.instance.get(
        ApiEndpoints.chart(widget.symbol),
        params: {'range': range},
      ) as Map<String, dynamic>;
      final candles = data['candles'] as List? ?? [];
      if (!mounted) return;
      _timeoutTimer?.cancel();
      await _controller.loadHtmlString(
          _buildHtml(jsonEncode(candles), _isDark ?? false));
    } catch (_) {
      _timeoutTimer?.cancel();
      if (mounted) setState(() => _error = 'Failed to load chart data');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  String _buildHtml(String candleJson, bool isDark) {
    final bg          = isDark ? '#0a0a0a' : '#ffffff';
    final textColor   = isDark ? '#adb5bd' : '#374151';
    final gridColor   = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
    final borderColor = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)';
    final upColor     = isDark ? '#00D4AA' : '#00C49A';
    final downColor   = isDark ? '#FF4D6A' : '#E8384F';
    final upVol       = isDark ? 'rgba(0,212,170,0.3)' : 'rgba(0,196,154,0.3)';
    final downVol     = isDark ? 'rgba(255,77,106,0.3)' : 'rgba(232,56,79,0.3)';
    final vwapColor   = isDark ? '#FFB84D' : '#E6952A';
    final wmColor     = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)';
    final tvLabel = widget.tvWatermarkLabel;
    final watermarkJs = tvLabel != null
        ? "chart.applyOptions({ watermark: { color: '$wmColor', visible: true, text: '$tvLabel', fontSize: 18, horzAlign: 'center', vertAlign: 'center' } });"
        : '';
    final vwapJs = widget.withVwap
        ? '''
const vwapData = [];
let cumPV = 0, cumVol = 0;
for (const candle of raw) {
  const typical = (candle.high + candle.low + candle.close) / 3;
  cumPV += typical * (candle.volume || 0);
  cumVol += candle.volume || 0;
  if (cumVol > 0) vwapData.push({ time: candle.time, value: cumPV / cumVol });
}
if (vwapData.length > 0) {
  const vwapSeries = chart.addLineSeries({ color: '$vwapColor', lineWidth: 1.5, priceLineVisible: false, lastValueVisible: false });
  vwapSeries.setData(vwapData);
}
'''
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

$vwapJs
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
    return Column(
      children: [
        if (widget.showRangeBar)
          Row(
            children: [
              Expanded(
                child: SizedBox(
                  height: 40,
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: _ranges.map((r) {
                      final isActive = r == _range;
                      return GestureDetector(
                        onTap: () {
                          setState(() => _range = r);
                          _load();
                        },
                        child: Container(
                          margin: const EdgeInsets.symmetric(
                              horizontal: 4, vertical: 6),
                          padding: const EdgeInsets.symmetric(
                              horizontal: 12, vertical: 4),
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
                ),
              ),
              if (widget.showFullscreenButton && widget.onFullscreen != null)
                IconButton(
                  icon: Icon(Icons.open_in_full, color: c.textMuted, size: 18),
                  tooltip: 'Open fullscreen',
                  onPressed: widget.onFullscreen,
                ),
            ],
          ),
        if (widget.showRangeBar) Divider(height: 1, color: c.border),
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
                            onTap: _load,
                            child: Container(
                              padding: const EdgeInsets.symmetric(
                                  horizontal: AppSpacing.s5,
                                  vertical: AppSpacing.s3),
                              decoration: BoxDecoration(
                                color: c.accentDim,
                                borderRadius:
                                    BorderRadius.circular(AppRadius.full),
                                border: Border.all(
                                    color: c.accent.withAlpha(60)),
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
    );
  }
}
