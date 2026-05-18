import 'package:url_launcher/url_launcher.dart';

abstract final class TvSymbol {
  static const _map = <String, String>{
    '^GSPC': 'SP:SPX', '^DJI': 'DJ:DJI', '^IXIC': 'NASDAQ:NDX',
    '^RUT': 'RUSSELL:RUT', '^VIX': 'CBOE:VIX',
    '^FTSE': 'SPREADEX:FTSE', '^GDAXI': 'XETR:DAX', '^FCHI': 'EURONEXT:PX1',
    '^N225': 'TVC:NI225', '^HSI': 'TVC:HSI', '^NSEI': 'NSE:NIFTY',
    'GC=F': 'COMEX:GC1!', 'SI=F': 'COMEX:SI1!', 'CL=F': 'NYMEX:CL1!',
    'NG=F': 'NYMEX:NG1!', 'HG=F': 'COMEX:HG1!', 'PL=F': 'NYMEX:PL1!',
    'BTC-USD': 'BITSTAMP:BTCUSD', 'ETH-USD': 'BITSTAMP:ETHUSD',
    'SOL-USD': 'COINBASE:SOLUSD', 'XRP-USD': 'BITSTAMP:XRPUSD',
    'EURUSD=X': 'FX:EURUSD', 'GBPUSD=X': 'FX:GBPUSD',
    'USDJPY=X': 'FX:USDJPY', 'DX-Y.NYB': 'TVC:DXY',
  };

  static Future<void> open(String yahooSymbol) async {
    final tv = _map[yahooSymbol];
    final uri = tv != null
        ? Uri.parse('https://www.tradingview.com/chart/?symbol=${Uri.encodeComponent(tv)}')
        : Uri.parse('https://finance.yahoo.com/quote/${Uri.encodeComponent(yahooSymbol)}');
    if (await canLaunchUrl(uri)) await launchUrl(uri, mode: LaunchMode.externalApplication);
  }
}
