// Wire = News/OSINT & gov-feed terminal. Mirrors the web contract
// (`frontend/packages/contracts/src/wire.ts`) 1:1 — keep desks, labels, and
// the item shape in sync with it (data-display parity is a hard rule).

/// The ten Wire desks, in the canonical order the contract declares them.
/// `id` is the server's desk slug (used as the `?desk=` query param); `label`
/// is the display name shown on the desk chips.
enum WireDesk {
  intel,
  world,
  middleEast,
  europe,
  africa,
  latinAmerica,
  asiaPacific,
  unitedStates,
  markets,
  corporate;

  String get id => switch (this) {
        WireDesk.intel => 'intel',
        WireDesk.world => 'world',
        WireDesk.middleEast => 'middle-east',
        WireDesk.europe => 'europe',
        WireDesk.africa => 'africa',
        WireDesk.latinAmerica => 'latin-america',
        WireDesk.asiaPacific => 'asia-pacific',
        WireDesk.unitedStates => 'united-states',
        WireDesk.markets => 'markets',
        WireDesk.corporate => 'corporate',
      };

  String get label => switch (this) {
        WireDesk.intel => 'Intel Feed',
        WireDesk.world => 'World News',
        WireDesk.middleEast => 'Middle East',
        WireDesk.europe => 'Europe',
        WireDesk.africa => 'Africa',
        WireDesk.latinAmerica => 'Latin America',
        WireDesk.asiaPacific => 'Asia-Pacific',
        WireDesk.unitedStates => 'United States',
        WireDesk.markets => 'Markets & Macro',
        WireDesk.corporate => 'Corporate Wire',
      };

  static WireDesk? fromId(String id) {
    for (final d in WireDesk.values) {
      if (d.id == id) return d;
    }
    return null;
  }
}

/// A single classified headline. `category` / `severity` are kept as loose
/// strings (the server taxonomy can change without breaking the client parse),
/// mirroring the contract's `.passthrough()`.
class WireItem {
  const WireItem({
    required this.title,
    required this.link,
    required this.pubDate,
    required this.summary,
    required this.source,
    required this.sourceId,
    required this.desk,
    required this.category,
    required this.severity,
    required this.tickers,
  });

  final String title;
  final String link;

  /// ISO 8601 when parseable, else raw, else "".
  final String pubDate;
  final String summary;
  final String source;
  final String sourceId;
  final String desk;
  final String category;
  final String severity;

  /// Exchange-tagged symbols named in the headline (Corporate Wire desk in
  /// practice). Empty for other desks.
  final List<String> tickers;

  factory WireItem.fromJson(Map<String, dynamic> j) => WireItem(
        title: j['title'] as String? ?? '',
        link: j['link'] as String? ?? '',
        pubDate: j['pubDate'] as String? ?? '',
        summary: j['summary'] as String? ?? '',
        source: j['source'] as String? ?? '',
        sourceId: j['sourceId'] as String? ?? '',
        desk: j['desk'] as String? ?? '',
        category: (j['category'] as String?)?.isNotEmpty == true
            ? j['category'] as String
            : 'general',
        severity: (j['severity'] as String?)?.isNotEmpty == true
            ? j['severity'] as String
            : 'normal',
        tickers: (j['tickers'] as List?)
                ?.map((e) => e.toString())
                .where((s) => s.isNotEmpty)
                .toList() ??
            const <String>[],
      );

  /// Milliseconds since epoch, or null when the date is unparseable.
  int? get publishedAtMs => DateTime.tryParse(pubDate)?.millisecondsSinceEpoch;
}

/// Items for one desk plus the server's freshness stamp.
class WireDeskItems {
  const WireDeskItems({required this.items, required this.lastUpdated});
  final List<WireItem> items;
  final String? lastUpdated;
}
