class CurrencyValuation {
  const CurrencyValuation({
    required this.code,
    required this.name,
    required this.flagCountryCode,
    required this.available,
    required this.value,
    required this.deviation10y,
    required this.tag,
    required this.asOf,
  });

  final String code;
  final String name;
  final String flagCountryCode;
  final bool available;
  final double? value;
  final double? deviation10y;
  final String? tag;
  final String? asOf;

  factory CurrencyValuation.fromJson(Map<String, dynamic> j) => CurrencyValuation(
        code: j['code'] as String,
        name: j['name'] as String,
        flagCountryCode: j['flagCountryCode'] as String,
        available: j['available'] as bool? ?? false,
        value: (j['value'] as num?)?.toDouble(),
        deviation10y: (j['deviation10y'] as num?)?.toDouble(),
        tag: j['tag'] as String?,
        asOf: j['asOf'] as String?,
      );

  String get flag {
    if (flagCountryCode.length != 2) return '';
    const base = 0x1F1E6 - 0x41;
    return String.fromCharCode(base + flagCountryCode.codeUnitAt(0)) +
        String.fromCharCode(base + flagCountryCode.codeUnitAt(1));
  }
}
