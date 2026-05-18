import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';
import '../../core/network/api_client.dart';
import '../../core/network/api_endpoints.dart';
import '../../core/theme/app_palette.dart';
import '../../core/theme/app_typography.dart';
import '../../core/theme/app_spacing.dart';

class ChartModal extends StatefulWidget {
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
  State<ChartModal> createState() => _ChartModalState();
}

class _ChartModalState extends State<ChartModal> {
  String _range = '1M';
  late final WebViewController _controller;
  bool _loading = true;
  String? _error;

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
    // Chart WebView always uses dark background regardless of app theme.
    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(const Color(0xFF0A0A0A));
    _loadChart();
  }

  Future<void> _loadChart() async {
    if (mounted) setState(() { _loading = true; _error = null; });
    try {
      final range = _rangeMap[_range] ?? '1mo';
      final data = await ApiClient.instance.get(
        ApiEndpoints.chart(widget.symbol),
        params: {'range': range},
      ) as Map<String, dynamic>;
      final candles = data['candles'] as List? ?? [];
      if (!mounted) return;
      await _controller.loadHtmlString(_buildHtml(jsonEncode(candles)));
    } catch (e) {
      if (mounted) setState(() => _error = 'Failed to load chart data');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  // HTML chart is always dark — the candlestick chart looks better dark.
  String _buildHtml(String candleJson) {
    return '''
<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { background:#0a0a0a; color:#fff; font-family:sans-serif; }
  #chart { width:100%; height:100vh; }
</style>
</head>
<body>
<div id="chart"></div>
<script src="https://unpkg.com/lightweight-charts@4.1.1/dist/lightweight-charts.standalone.production.js"></script>
<script>
const chart = LightweightCharts.createChart(document.getElementById('chart'), {
  layout: { background: { color: '#0a0a0a' }, textColor: '#adb5bd' },
  grid: { vertLines: { color: 'rgba(255,255,255,0.06)' }, horzLines: { color: 'rgba(255,255,255,0.06)' } },
  crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
  rightPriceScale: { borderColor: 'rgba(255,255,255,0.12)' },
  timeScale: { borderColor: 'rgba(255,255,255,0.12)', timeVisible: true },
  handleScroll: true,
  handleScale: true,
});

const candleSeries = chart.addCandlestickSeries({
  upColor: '#00D4AA', downColor: '#FF4D6A',
  borderUpColor: '#00D4AA', borderDownColor: '#FF4D6A',
  wickUpColor: '#00D4AA', wickDownColor: '#FF4D6A',
});

const volumeSeries = chart.addHistogramSeries({
  color: 'rgba(0,212,170,0.2)',
  priceFormat: { type: 'volume' },
  priceScaleId: '',
});

chart.priceScale('').applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });

const raw = $candleJson;
candleSeries.setData(raw.map(c => ({ time: c.time, open: c.open, high: c.high, low: c.low, close: c.close })));
volumeSeries.setData(raw.map(c => ({ time: c.time, value: c.volume || 0, color: c.close >= c.open ? 'rgba(0,212,170,0.3)' : 'rgba(255,77,106,0.3)' })));
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
          // Drag handle (visual only — drag is disabled)
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
                ? Center(
                    child: CircularProgressIndicator(color: c.accent))
                : _error != null
                    ? Center(
                        child: Text(_error!,
                            style: AppTypography.md
                                .copyWith(color: c.textMuted)))
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
