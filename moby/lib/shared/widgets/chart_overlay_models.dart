/// AI-signal entry/SL/TP levels drawn as horizontal lines on the chart.
class SignalLevels {
  const SignalLevels({
    required this.entry,
    required this.stopLoss,
    required this.takeProfit,
    required this.direction,
  });
  final double entry;
  final double stopLoss;
  final double takeProfit;
  final String direction; // BUY | SELL
}

/// One backtest trade entry, drawn as a triangle/arrow marker at (date, price).
class TradeMarker {
  const TradeMarker({
    required this.date,
    required this.price,
    required this.direction,
    required this.win,
  });
  final DateTime date;
  final double price;
  final String direction; // BUY | SELL
  final bool win;
}
