import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';
import '../../core/theme/app_palette.dart';

class TvAdvancedChartWidget extends StatefulWidget {
  const TvAdvancedChartWidget({
    super.key,
    required this.tvSymbol,
    required this.isDark,
  });

  /// Already-resolved TradingView symbol (e.g. 'COMEX:GC1!', 'SP:SPX').
  final String tvSymbol;
  final bool isDark;

  @override
  State<TvAdvancedChartWidget> createState() => _TvAdvancedChartWidgetState();
}

class _TvAdvancedChartWidgetState extends State<TvAdvancedChartWidget> {
  late final WebViewController _controller;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(widget.isDark ? const Color(0xFF0A0A0A) : Colors.white)
      ..setNavigationDelegate(NavigationDelegate(
        onPageFinished: (_) {
          if (mounted) setState(() => _loading = false);
        },
      ))
      ..loadHtmlString(_buildHtml());
  }

  String _buildHtml() {
    final theme = widget.isDark ? 'dark' : 'light';
    final bg = widget.isDark ? '#0a0a0a' : '#ffffff';
    // Escape the symbol for safe embedding inside a JSON string literal.
    final sym = widget.tvSymbol.replaceAll('"', '\\"');

    return '''
<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  html, body { height:100%; overflow:hidden; background:$bg; }
  .tradingview-widget-container { width:100%; height:100%; }
  .tradingview-widget-container__widget { width:100%; height:100%; }
  .tradingview-widget-copyright { display:none; }
</style>
</head>
<body>
<div class="tradingview-widget-container">
  <div class="tradingview-widget-container__widget"></div>
  <script type="text/javascript"
    src="https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js"
    async>
  {
    "autosize": true,
    "symbol": "$sym",
    "interval": "D",
    "timezone": "Etc/UTC",
    "theme": "$theme",
    "style": "1",
    "locale": "en",
    "withdateranges": true,
    "allow_symbol_change": false,
    "details": false,
    "hotlist": false,
    "calendar": false,
    "hide_side_toolbar": false,
    "support_host": "https://www.tradingview.com"
  }
  </script>
</div>
</body>
</html>
''';
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Stack(
      children: [
        WebViewWidget(controller: _controller),
        if (_loading)
          Center(child: CircularProgressIndicator(color: c.accent, strokeWidth: 2)),
      ],
    );
  }
}
