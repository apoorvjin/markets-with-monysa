import 'package:dio/dio.dart';
import 'package:sentry_flutter/sentry_flutter.dart';
import 'request_signer.dart';

class _RetryInterceptor extends Interceptor {
  _RetryInterceptor(this._dio);
  final Dio _dio;
  static const _maxRetries = 2;

  @override
  void onError(DioException err, ErrorInterceptorHandler handler) async {
    final isRetryable = err.type == DioExceptionType.connectionTimeout ||
        err.type == DioExceptionType.receiveTimeout ||
        err.type == DioExceptionType.connectionError;
    if (!isRetryable) {
      Sentry.captureException(err, stackTrace: err.stackTrace);
      return handler.next(err);
    }
    for (var attempt = 1; attempt <= _maxRetries; attempt++) {
      await Future<void>.delayed(Duration(milliseconds: 500 * attempt));
      try {
        final response = await _dio.fetch<dynamic>(err.requestOptions);
        return handler.resolve(response);
      } on DioException catch (retryErr) {
        if (attempt == _maxRetries) {
          Sentry.captureException(retryErr, stackTrace: retryErr.stackTrace);
          return handler.next(retryErr);
        }
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

class ApiClient {
  ApiClient._() {
    _dio = Dio(BaseOptions(
      connectTimeout: const Duration(seconds: 15),
      receiveTimeout: const Duration(seconds: 30),
      headers: {'Content-Type': 'application/json'},
    ));

    _dio.interceptors.add(_SigningInterceptor());
    _dio.interceptors.add(_RetryInterceptor(_dio));
    _dio.interceptors.add(LogInterceptor(
      requestBody: false,
      responseBody: false,
      error: true,
    ));
  }

  static final ApiClient instance = ApiClient._();
  late final Dio _dio;

  Future<dynamic> get(String url, {Map<String, dynamic>? params, CancelToken? cancelToken}) async {
    final response = await _dio.get(url, queryParameters: params, cancelToken: cancelToken);
    return response.data;
  }

  Future<dynamic> post(String url, {dynamic data}) async {
    final response = await _dio.post(url, data: data);
    return response.data;
  }
}
