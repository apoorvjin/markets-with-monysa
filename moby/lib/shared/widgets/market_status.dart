import 'dart:async';

import 'package:flutter/material.dart';
import 'package:timezone/timezone.dart' as tz;

import '../../core/network/api_client.dart';
import '../../core/network/api_endpoints.dart';
import '../../core/theme/app_palette.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/theme/app_typography.dart';

/// Global exchange-session table — mirrors frontend/apps/web/src/lib/sessions.ts
/// (MARKETS). Keep both in sync if an exchange's regular trading hours change.
///
/// The day/time windows below only drive the LOCAL TIME shown per exchange
/// and a same-as-web fallback open/closed guess. The real open/closed truth
/// comes from the server (`/api/markets/session-status`, see
/// server/routes/market-status.ts), which reads each exchange's actual live
/// Yahoo `marketState` — that's what makes it holiday-aware: a pure
/// day-of-week + time-of-day check (what web's sessions.ts still does) has
/// no idea NYSE is closed for Thanksgiving. The fallback below only kicks in
/// if that request fails, so it's never fully blind, just less precise.
class _Exchange {
  const _Exchange(this.city, this.tzName, this.windows);
  final String city;
  final String tzName;
  /// Regular cash session(s) as [startMin, endMin) from midnight, in the
  /// exchange's own timezone. Multiple entries handle lunch breaks.
  final List<(int, int)> windows;
}

const List<_Exchange> _kExchanges = [
  _Exchange('New York', 'America/New_York', [(570, 960)]), // 09:30-16:00
  _Exchange('London', 'Europe/London', [(480, 990)]), // 08:00-16:30
  _Exchange('Frankfurt', 'Europe/Berlin', [(540, 1050)]), // 09:00-17:30
  _Exchange('Mumbai', 'Asia/Kolkata', [(555, 930)]), // 09:15-15:30
  _Exchange('Hong Kong', 'Asia/Hong_Kong', [(570, 720), (780, 960)]), // 09:30-12:00, 13:00-16:00
  _Exchange('Shanghai', 'Asia/Shanghai', [(570, 690), (780, 900)]), // 09:30-11:30, 13:00-15:00
  _Exchange('Tokyo', 'Asia/Tokyo', [(540, 690), (750, 900)]), // 09:00-11:30, 12:30-15:00
  _Exchange('Sydney', 'Australia/Sydney', [(600, 960)]), // 10:00-16:00
];

class _ExchangeStatus {
  const _ExchangeStatus({required this.city, required this.open, required this.time});
  final String city;
  final bool open;
  final String time;
}

bool _fallbackOpen(_Exchange mk, tz.TZDateTime loc) {
  if (loc.weekday == DateTime.saturday || loc.weekday == DateTime.sunday) {
    return false;
  }
  final mins = loc.hour * 60 + loc.minute;
  return mk.windows.any((w) => mins >= w.$1 && mins < w.$2);
}

/// [serverOpen] holds real, holiday-aware open/closed per city (keyed exactly
/// as `_Exchange.city`) when the server fetch has succeeded; a missing entry
/// falls back to the local day/time guess.
List<_ExchangeStatus> _sessionStatuses(Map<String, bool>? serverOpen) {
  return _kExchanges.map((mk) {
    final loc = tz.TZDateTime.now(tz.getLocation(mk.tzName));
    final time =
        '${loc.hour.toString().padLeft(2, '0')}:${loc.minute.toString().padLeft(2, '0')}';
    final open = serverOpen?[mk.city] ?? _fallbackOpen(mk, loc);
    return _ExchangeStatus(city: mk.city, open: open, time: time);
  }).toList();
}

/// AppBar button showing how many of the 8 major exchanges are currently in
/// their regular cash session; tap opens a per-exchange breakdown. Mirrors
/// the web nav's MarketStatus pill (components/MarketStatus.tsx), but sources
/// open/closed from the server's live-quote-derived session status rather
/// than day/time math, so exchange holidays are reflected correctly.
class MarketStatusButton extends StatefulWidget {
  const MarketStatusButton({super.key});

  @override
  State<MarketStatusButton> createState() => _MarketStatusButtonState();
}

class _MarketStatusButtonState extends State<MarketStatusButton> {
  final LayerLink _link = LayerLink();
  OverlayEntry? _entry;
  Timer? _clockTimer;
  Timer? _serverTimer;
  Map<String, bool>? _serverOpen;
  late List<_ExchangeStatus> _statuses = _sessionStatuses(_serverOpen);

  @override
  void initState() {
    super.initState();
    // Local clock/fallback recompute — cheap, no network.
    _clockTimer = Timer.periodic(const Duration(seconds: 30), (_) => _recompute());
    // Real session status — matches the server's own 10m cache TTL.
    _fetchServerStatus();
    _serverTimer = Timer.periodic(const Duration(minutes: 5), (_) => _fetchServerStatus());
  }

  @override
  void dispose() {
    _clockTimer?.cancel();
    _serverTimer?.cancel();
    _hide();
    super.dispose();
  }

  void _recompute() {
    _statuses = _sessionStatuses(_serverOpen);
    _entry?.markNeedsBuild();
    if (mounted) setState(() {});
  }

  Future<void> _fetchServerStatus() async {
    try {
      final data = await ApiClient.instance.get(ApiEndpoints.marketSessionStatus);
      final list = (data['exchanges'] as List).cast<Map<String, dynamic>>();
      _serverOpen = {for (final e in list) e['city'] as String: e['open'] as bool};
    } catch (_) {
      // Network/server failure — keep whatever we had (or the local
      // fallback if this is the first attempt) rather than blocking.
    }
    _recompute();
  }

  void _hide() {
    _entry?.remove();
    _entry = null;
  }

  void _toggle() {
    if (_entry != null) {
      _hide();
      return;
    }
    _entry = OverlayEntry(
      builder: (ctx) => Stack(
        children: [
          Positioned.fill(
            child: GestureDetector(
              behavior: HitTestBehavior.opaque,
              onTap: _hide,
              child: const SizedBox.expand(),
            ),
          ),
          CompositedTransformFollower(
            link: _link,
            showWhenUnlinked: false,
            targetAnchor: Alignment.bottomRight,
            followerAnchor: Alignment.topRight,
            offset: const Offset(0, 8),
            child: Material(
              color: Colors.transparent,
              child: _MarketStatusPanel(statuses: _statuses),
            ),
          ),
        ],
      ),
    );
    Overlay.of(context).insert(_entry!);
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final openCount = _statuses.where((s) => s.open).length;
    final anyOpen = openCount > 0;
    return CompositedTransformTarget(
      link: _link,
      child: Semantics(
        label: anyOpen
            ? '$openCount of ${_statuses.length} markets open'
            : 'All markets closed',
        button: true,
        child: GestureDetector(
          onTap: _toggle,
          behavior: HitTestBehavior.opaque,
          child: Container(
            margin: const EdgeInsets.symmetric(vertical: 12, horizontal: 4),
            padding:
                const EdgeInsets.symmetric(horizontal: AppSpacing.s3, vertical: 5),
            decoration: BoxDecoration(
              color: c.surfaceCard,
              borderRadius: BorderRadius.circular(AppRadius.full),
              border: Border.all(color: c.border),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 7,
                  height: 7,
                  decoration: BoxDecoration(
                    color: anyOpen ? c.positive : c.danger,
                    shape: BoxShape.circle,
                  ),
                ),
                const SizedBox(width: AppSpacing.s2),
                Text(
                  anyOpen ? '$openCount/${_statuses.length}' : 'Closed',
                  style: AppTypography.labelSm.copyWith(color: c.textPrimary),
                ),
                Icon(Icons.expand_more_rounded, size: 16, color: c.textSecondary),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _MarketStatusPanel extends StatelessWidget {
  const _MarketStatusPanel({required this.statuses});
  final List<_ExchangeStatus> statuses;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Container(
      width: 240,
      margin: const EdgeInsets.only(right: AppSpacing.s4),
      padding: const EdgeInsets.all(AppSpacing.s4),
      decoration: BoxDecoration(
        color: c.surfaceElevated,
        borderRadius: BorderRadius.circular(AppRadius.md),
        border: Border.all(color: c.border),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withAlpha(100),
            blurRadius: 24,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          for (final s in statuses)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 5),
              child: Row(
                children: [
                  Container(
                    width: 6,
                    height: 6,
                    margin: const EdgeInsets.only(right: AppSpacing.s2),
                    decoration: BoxDecoration(
                      color: s.open ? c.positive : c.textMuted,
                      shape: BoxShape.circle,
                    ),
                  ),
                  Expanded(
                    child: Text(s.city,
                        style: AppTypography.sm.copyWith(color: c.textPrimary)),
                  ),
                  Text(s.time,
                      style: AppTypography.xs.copyWith(color: c.textSecondary)),
                  const SizedBox(width: AppSpacing.s3),
                  SizedBox(
                    width: 40,
                    child: Text(
                      s.open ? 'Open' : 'Closed',
                      textAlign: TextAlign.right,
                      style: AppTypography.labelXs.copyWith(
                        color: s.open ? c.positive : c.textMuted,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          const SizedBox(height: AppSpacing.s2),
          Divider(height: 1, color: c.border),
          const SizedBox(height: AppSpacing.s2),
          Text(
            'Live session status · local exchange time.',
            style: AppTypography.xs.copyWith(color: c.textMuted),
          ),
        ],
      ),
    );
  }
}
