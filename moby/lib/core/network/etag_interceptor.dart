import 'package:dio/dio.dart';

/// HTTP conditional-request interceptor.
///
/// On a successful GET, captures the response `ETag` header and the response
/// body. On subsequent GETs to the same URL, sends `If-None-Match`; if the
/// server returns 304 we substitute the cached body so the caller sees a
/// normal 200 response.
///
/// In-memory only — pairs with `DiskCache` (which handles persistence) rather
/// than duplicating it. Bounded to keep memory predictable.
class ETagInterceptor extends Interceptor {
  ETagInterceptor({this.maxEntries = 64});

  /// Cap entries so a long-running session doesn't grow unbounded. LRU-ish:
  /// least-recently-written is evicted first.
  final int maxEntries;

  final Map<String, _Entry> _store = {};

  String _key(RequestOptions o) => '${o.method} ${o.uri}';

  @override
  void onRequest(RequestOptions options, RequestInterceptorHandler handler) {
    if (options.method.toUpperCase() != 'GET') {
      handler.next(options);
      return;
    }
    final entry = _store[_key(options)];
    if (entry != null) {
      options.headers['If-None-Match'] = entry.etag;
      // Dio treats 304 as a non-success status by default — opt in to receiving
      // it as a normal response so onResponse fires.
      options.validateStatus = (status) =>
          status != null && (status == 304 || (status >= 200 && status < 300));
    }
    handler.next(options);
  }

  @override
  void onResponse(Response response, ResponseInterceptorHandler handler) {
    final req = response.requestOptions;
    if (req.method.toUpperCase() != 'GET') {
      handler.next(response);
      return;
    }

    final key = _key(req);

    if (response.statusCode == 304) {
      final cached = _store[key];
      if (cached != null) {
        // Hand back the cached body as if the server returned 200.
        final synthesised = Response<dynamic>(
          requestOptions: req,
          data: cached.body,
          statusCode: 200,
          statusMessage: 'OK (from ETag cache)',
          headers: response.headers,
        );
        handler.next(synthesised);
        return;
      }
      // No cache to substitute — pass the 304 through unchanged.
      handler.next(response);
      return;
    }

    final etag = response.headers.value('etag');
    if (etag != null && response.statusCode != null &&
        response.statusCode! >= 200 && response.statusCode! < 300) {
      // Evict oldest if at capacity.
      if (_store.length >= maxEntries && !_store.containsKey(key)) {
        final oldest = _store.keys.first;
        _store.remove(oldest);
      }
      _store[key] = _Entry(etag: etag, body: response.data);
    }
    handler.next(response);
  }
}

class _Entry {
  const _Entry({required this.etag, required this.body});
  final String etag;
  final Object? body;
}
