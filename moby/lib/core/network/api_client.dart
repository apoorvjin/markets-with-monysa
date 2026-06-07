import 'package:dio/dio.dart';
import 'package:sentry_flutter/sentry_flutter.dart';
import 'chart_renderer_interceptor.dart';
import 'device_id.dart';
import 'request_signer.dart';

class _RetryInterceptor extends Interceptor {
  _RetryInterceptor(this._dio);
  final Dio _dio;
  static const _maxRetries = 2;
  static const _retryCountKey = '_retryCount';

  @override
  void onError(DioException err, ErrorInterceptorHandler handler) async {
    // Prevent recursive retries: if this request is already a retry, propagate immediately.
    // Without this guard, _dio.fetch() inside onError re-enters _RetryInterceptor and
    // each failure spawns 2 more retries exponentially, creating a request storm.
    final previousRetries = err.requestOptions.extra[_retryCountKey] as int? ?? 0;
    if (previousRetries >= _maxRetries) {
      Sentry.captureException(err, stackTrace: err.stackTrace);
      return handler.next(err);
    }

    final isRetryable = err.type == DioExceptionType.connectionTimeout ||
        err.type == DioExceptionType.receiveTimeout ||
        err.type == DioExceptionType.connectionError;
    if (!isRetryable) {
      Sentry.captureException(err, stackTrace: err.stackTrace);
      return handler.next(err);
    }

    for (var attempt = previousRetries + 1; attempt <= _maxRetries; attempt++) {
      await Future<void>.delayed(Duration(milliseconds: 500 * attempt));
      try {
        err.requestOptions.extra[_retryCountKey] = attempt;
        final response = await _dio.fetch<dynamic>(err.requestOptions);
        return handler.resolve(response);
      } on DioException catch (retryErr) {
        if (attempt == _maxRetries) {
          Sentry.captureException(retryErr, stackTrace: retryErr.stackTrace);
          return handler.next(retryErr);
        }
      } catch (_) {
        return handler.next(err);
      }
    }
    handler.next(err);
  }
}

class _SigningInterceptor extends Interceptor {
  @override
  void onRequest(RequestOptions options, RequestInterceptorHandler handler) {
    final sig = RequestSigner.sign();
    if (sig != null) options.headers['X-Signature'] = sig;
    handler.next(options);
  }
}

class _DeviceIdInterceptor extends Interceptor {
  @override
  void onRequest(RequestOptions options, RequestInterceptorHandler handler) async {
    options.headers['X-Device-ID'] = await DeviceId.get();
    handler.next(options);
  }
}

class ApiClient {
  ApiClient._() {
    _dio = Dio(BaseOptions(
      connectTimeout: const Duration(seconds: 15),
      receiveTimeout: const Duration(seconds: 30),
      headers: {'Content-Type': 'application/json'},
    ));

    _dio.interceptors.add(_SigningInterceptor());
    _dio.interceptors.add(_DeviceIdInterceptor());
    _dio.interceptors.add(ChartRendererInterceptor());
    _dio.interceptors.add(_RetryInterceptor(_dio));
    _dio.interceptors.add(LogInterceptor(
      requestBody: false,
      responseBody: false,
      error: true,
    ));
  }

  static final ApiClient instance = ApiClient._();
  late final Dio _dio;

  Future<dynamic> get(String url, {Map<String, dynamic>? params, CancelToken? cancelToken, Options? options}) async {
    final response = await _dio.get(url, queryParameters: params, cancelToken: cancelToken, options: options);
    return response.data;
  }

  Future<dynamic> post(String url, {dynamic data}) async {
    final response = await _dio.post(url, data: data);
    return response.data;
  }
}
