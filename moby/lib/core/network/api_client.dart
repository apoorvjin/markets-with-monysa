import 'package:dio/dio.dart';

class ApiClient {
  ApiClient._() {
    _dio = Dio(BaseOptions(
      connectTimeout: const Duration(seconds: 15),
      receiveTimeout: const Duration(seconds: 30),
      headers: {'Content-Type': 'application/json'},
    ));

    _dio.interceptors.add(LogInterceptor(
      requestBody: false,
      responseBody: false,
      error: true,
    ));
  }

  static final ApiClient instance = ApiClient._();
  late final Dio _dio;

  Future<dynamic> get(String url, {Map<String, dynamic>? params}) async {
    final response = await _dio.get(url, queryParameters: params);
    return response.data;
  }

  Future<dynamic> post(String url, {dynamic data}) async {
    final response = await _dio.post(url, data: data);
    return response.data;
  }
}
