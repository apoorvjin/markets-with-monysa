import 'package:dio/dio.dart';

/// Wire value of the user's currently-selected chart renderer.
///
/// Mutated by `ChartProviderNotifier` (and seeded from SharedPreferences in
/// `main.dart`) so the Dio interceptor can stamp every outgoing request with
/// `X-Chart-Renderer` without taking a Riverpod dependency.
String currentChartRenderer = 'yahoo';

class ChartRendererInterceptor extends Interceptor {
  @override
  void onRequest(RequestOptions options, RequestInterceptorHandler handler) {
    options.headers['X-Chart-Renderer'] = currentChartRenderer;
    handler.next(options);
  }
}
