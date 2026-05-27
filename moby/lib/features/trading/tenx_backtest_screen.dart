import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/theme/app_palette.dart';
import '../../core/theme/app_typography.dart';
import '../../core/theme/app_spacing.dart';
import '../../data/models/trading_signal.dart';
import '../../data/repositories/trading_repository.dart';
import '../../services/entitlement_service.dart';
import '../../shared/widgets/error_view.dart';
import '../../shared/widgets/max_width_layout.dart';
import '../../shared/widgets/theme_toggle.dart';
import '../../shared/widgets/upgrade_sheet.dart';

// ── Provider ──────────────────────────────────────────────────────────────────

final _scannerBacktestProvider = FutureProvider.autoDispose
    .family<ScannerBacktestResponse, ({String version, String type})>(
  (_, args) => TradingRepository.instance.fetchScannerBacktest(
    version: args.version,
    type: args.type,
  ),
);

// ── Screen ────────────────────────────────────────────────────────────────────

class TenXBacktestScreen extends ConsumerStatefulWidget {
  const TenXBacktestScreen({
    super.key,
    required this.version,
    required this.type,
  });

  final String version;
  final String type;

  @override
  ConsumerState<TenXBacktestScreen> createState() => _TenXBacktestScreenState();
}

class _TenXBacktestScreenState extends ConsumerState<TenXBacktestScreen> {
  late String _version;
  late String _type;
  String _sort = 'events';
  Set<String> _requiredSignals = {};

  @override
  void initState() {
    super.initState();
    _version = widget.version;
    _type = widget.type;
  }

  ({String version, String type}) get _args => (version: _version, type: _type);

  // Returns a filtered copy of [raw] keeping only events where every signal
  // in [_requiredSignals] was active on that day.
  ScannerBacktestResponse _applyFilter(ScannerBacktestResponse raw) {
    if (_requiredSignals.isEmpty) return raw;

    double wr(List<BacktestSignalEvent> evs,
        double? Function(BacktestSignalEvent) ret) {
      final valid = evs.where((e) => ret(e) != null).toList();
      if (valid.isEmpty) return 0;
      // Return as percentage (0–100) to match server convention
      return (valid.where((e) => (ret(e) ?? 0) > 0).length /
              valid.length *
              1000)
              .roundToDouble() /
          10;
    }

    double avg(List<BacktestSignalEvent> evs,
        double? Function(BacktestSignalEvent) ret) {
      final vals =
          evs.where((e) => ret(e) != null).map((e) => ret(e)!).toList();
      if (vals.isEmpty) return 0;
      return vals.reduce((a, b) => a + b) / vals.length;
    }

    BacktestSummaryStats? stats(List<BacktestSignalEvent> evs) {
      if (evs.isEmpty) return null;
      return BacktestSummaryStats(
        events: evs.length,
        winRate1m: wr(evs, (e) => e.returns.d21),
        winRate3m: wr(evs, (e) => e.returns.d63),
        winRate6m: wr(evs, (e) => e.returns.d126),
        winRate1y: wr(evs, (e) => e.returns.d252),
        winRate3y: wr(evs, (e) => e.returns.d756),
        avgReturn1m: avg(evs, (e) => e.returns.d21),
        avgReturn3m: avg(evs, (e) => e.returns.d63),
        avgReturn6m: avg(evs, (e) => e.returns.d126),
        avgReturn3y: avg(evs, (e) => e.returns.d756),
        sampleSize3y: evs.where((e) => e.returns.d756 != null).length,
      );
    }

    Map<String, BacktestSummaryStats> buildByCount(
        List<BacktestSignalEvent> evs) {
      final result = <String, BacktestSummaryStats>{};
      for (int n = 1; n <= 4; n++) {
        final bucket =
            evs.where((e) => e.signalCount == n).toList();
        final s = stats(bucket);
        if (s != null) result[n.toString()] = s;
      }
      return result;
    }

    final filteredAssets = raw.assets.map((asset) {
      final kept = asset.events.where((e) {
        if (_requiredSignals.contains('heartbeat') && !e.heartbeat) return false;
        if (_requiredSignals.contains('rec_quarter') && !e.recordQuarter)
          return false;
        if (_requiredSignals.contains('trend_up') && !e.trendUp) return false;
        return true;
      }).toList();
      return BacktestAssetResult(
        symbol: asset.symbol,
        name: asset.name,
        category: asset.category,
        flag: asset.flag,
        totalEvents: kept.length,
        bySignalCount: buildByCount(kept),
        events: kept,
      );
    }).where((a) => a.totalEvents > 0).toList();

    final allFiltered = filteredAssets.expand((a) => a.events).toList();
    final aggByCount = buildByCount(allFiltered);

    return ScannerBacktestResponse(
      version: raw.version,
      type: raw.type,
      fromDate: raw.fromDate,
      toDate: raw.toDate,
      assets: filteredAssets,
      aggregate: aggByCount,
      lastUpdated: raw.lastUpdated,
    );
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final async = ref.watch(_scannerBacktestProvider(_args));

    return Scaffold(
      backgroundColor: c.background,
      appBar: AppBar(
        backgroundColor: c.surface,
        surfaceTintColor: Colors.transparent,
        title: Text(
          '10X Backtest · ${_version.toUpperCase()} · ${_type == 'assets' ? 'Assets' : 'Stocks'}',
          style: AppTypography.headingSm.copyWith(color: c.textPrimary),
        ),
        actions: [
          GestureDetector(
            onTap: () => _showBacktestInfo(context),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: AppSpacing.s4),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text('How it works',
                      style: AppTypography.xs.copyWith(color: c.accent)),
                  const SizedBox(width: 4),
                  Icon(Icons.info_outline_rounded, size: 15, color: c.accent),
                ],
              ),
            ),
          ),
          const ThemeToggleButton(),
        ],
      ),
      body: MaxWidthLayout(
        child: Column(
          children: [
            _ControlRow(
              version: _version,
              type: _type,
              onVersion: (v) => setState(() {
                _version = v;
                _sort = 'events';
                _requiredSignals = {};
              }),
              onType: (t) => setState(() {
                _type = t;
                _sort = 'events';
                _requiredSignals = {};
              }),
            ),
            _SignalFilterRow(
              version: _version,
              requiredSignals: _requiredSignals,
              isInsight: EntitlementService.can('backtest_filter'),
              onToggle: (key) => setState(() {
                if (_requiredSignals.contains(key)) {
                  _requiredSignals = Set.from(_requiredSignals)..remove(key);
                } else {
                  _requiredSignals = Set.from(_requiredSignals)..add(key);
                }
              }),
            ),
            Expanded(
              child: async.when(
                loading: () => _LoadingView(version: _version, type: _type),
                error: (e, _) => ErrorView(
                  message: 'Backtest failed.\n${e.toString()}',
                  onRetry: () => ref.invalidate(_scannerBacktestProvider(_args)),
                ),
                data: (data) => _BacktestDataView(
                  data: _applyFilter(data),
                  sort: _sort,
                  onSort: (s) => setState(() => _sort = s),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ── Signal filter row ─────────────────────────────────────────────────────────

class _SignalFilterRow extends StatelessWidget {
  const _SignalFilterRow({
    required this.version,
    required this.requiredSignals,
    required this.isInsight,
    required this.onToggle,
  });

  final String version;
  final Set<String> requiredSignals;
  final bool isInsight;
  final void Function(String key) onToggle;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Container(
      color: c.surface,
      padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.s5, vertical: AppSpacing.s3),
      child: Row(
        children: [
          Text('Filter:',
              style: AppTypography.xs.copyWith(color: c.textMuted)),
          const SizedBox(width: AppSpacing.s3),
          _FilterChip(
            label: 'Heartbeat',
            chipKey: 'heartbeat',
            isActive: requiredSignals.contains('heartbeat'),
            isInsight: isInsight,
            onToggle: onToggle,
            context: context,
          ),
          const SizedBox(width: AppSpacing.s2),
          _FilterChip(
            label: 'Rec. Qtr',
            chipKey: 'rec_quarter',
            isActive: requiredSignals.contains('rec_quarter'),
            isInsight: isInsight,
            onToggle: onToggle,
            context: context,
          ),
          const SizedBox(width: AppSpacing.s2),
          Opacity(
            opacity: version == 'v2' ? 1.0 : 0.35,
            child: _FilterChip(
              label: 'Trend ↑',
              chipKey: 'trend_up',
              isActive: requiredSignals.contains('trend_up'),
              isInsight: isInsight,
              onToggle: onToggle,
              context: context,
              unavailable: version != 'v2',
            ),
          ),
        ],
      ),
    );
  }
}

class _FilterChip extends StatelessWidget {
  const _FilterChip({
    required this.label,
    required this.chipKey,
    required this.isActive,
    required this.isInsight,
    required this.onToggle,
    required this.context,
    this.unavailable = false,
  });

  final String label;
  final String chipKey;
  final bool isActive;
  final bool isInsight;
  final void Function(String) onToggle;
  final BuildContext context;
  final bool unavailable;

  @override
  Widget build(BuildContext ctx) {
    final c = ctx.colors;
    final locked = !unavailable && !isInsight;
    return GestureDetector(
      onTap: () {
        if (unavailable) return;
        if (locked) {
          UpgradeSheet.show(context, feature: 'backtest_filter');
        } else {
          onToggle(chipKey);
        }
      },
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
        decoration: BoxDecoration(
          color: isActive ? c.accent.withAlpha(40) : c.surfaceCard,
          borderRadius: BorderRadius.circular(AppRadius.full),
          border: Border.all(
              color: isActive ? c.accent : c.border),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (locked)
              Padding(
                padding: const EdgeInsets.only(right: 4),
                child: Icon(Icons.lock_rounded, size: 10, color: c.textMuted),
              ),
            Text(label,
                style: AppTypography.xs.copyWith(
                    color: isActive ? c.accent : c.textSecondary,
                    fontWeight: isActive ? FontWeight.w700 : FontWeight.w500,
                    decoration: unavailable ? TextDecoration.lineThrough : null,
                    decorationColor: c.textSecondary)),
          ],
        ),
      ),
    );
  }
}

// ── Control row ───────────────────────────────────────────────────────────────

class _ControlRow extends StatelessWidget {
  const _ControlRow({
    required this.version,
    required this.type,
    required this.onVersion,
    required this.onType,
  });

  final String version;
  final String type;
  final ValueChanged<String> onVersion;
  final ValueChanged<String> onType;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Container(
      color: c.surface,
      padding: const EdgeInsets.fromLTRB(
          AppSpacing.s5, AppSpacing.s3, AppSpacing.s5, AppSpacing.s3),
      child: Row(
        children: [
          Text('Ver:', style: AppTypography.xs.copyWith(color: c.textMuted)),
          const SizedBox(width: AppSpacing.s2),
          _Chip(
            label: 'v1',
            active: version == 'v1',
            onTap: () => onVersion('v1'),
          ),
          const SizedBox(width: AppSpacing.s2),
          _Chip(
            label: 'v2',
            active: version == 'v2',
            onTap: () => onVersion('v2'),
          ),
          const SizedBox(width: AppSpacing.s5),
          Text('Type:', style: AppTypography.xs.copyWith(color: c.textMuted)),
          const SizedBox(width: AppSpacing.s2),
          _Chip(
            label: 'Assets',
            active: type == 'assets',
            onTap: () => onType('assets'),
          ),
          const SizedBox(width: AppSpacing.s2),
          _Chip(
            label: 'Stocks',
            active: type == 'stocks',
            onTap: () => onType('stocks'),
          ),
        ],
      ),
    );
  }
}

class _Chip extends StatelessWidget {
  const _Chip({required this.label, required this.active, required this.onTap});

  final String label;
  final bool active;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.s4, vertical: AppSpacing.s2),
        decoration: BoxDecoration(
          color: active ? c.accent.withAlpha(25) : Colors.transparent,
          borderRadius: BorderRadius.circular(AppRadius.full),
          border: Border.all(color: active ? c.accent : c.border),
        ),
        child: Text(
          label,
          style: AppTypography.xs.copyWith(
            color: active ? c.accent : c.textSecondary,
            fontWeight: active ? FontWeight.w700 : FontWeight.w500,
          ),
        ),
      ),
    );
  }
}

// ── Loading view ──────────────────────────────────────────────────────────────

class _LoadingView extends StatelessWidget {
  const _LoadingView({required this.version, required this.type});

  final String version;
  final String type;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.s8),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            LinearProgressIndicator(
              backgroundColor: c.border,
              valueColor: AlwaysStoppedAnimation(c.accent),
            ),
            const SizedBox(height: AppSpacing.s5),
            Text(
              'Running 5-year signal backtest…',
              style: AppTypography.md.copyWith(color: c.textPrimary),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: AppSpacing.s2),
            Text(
              'Pre-computed nightly at midnight.\nFirst load after a new release takes 1–2 min.',
              style: AppTypography.sm.copyWith(color: c.textMuted),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }
}

// ── Data view ─────────────────────────────────────────────────────────────────

class _BacktestDataView extends StatelessWidget {
  const _BacktestDataView({
    required this.data,
    required this.sort,
    required this.onSort,
  });

  final ScannerBacktestResponse data;
  final String sort;
  final ValueChanged<String> onSort;

  List<BacktestAssetResult> _sorted(List<BacktestAssetResult> assets) {
    final list = List<BacktestAssetResult>.from(assets);
    if (sort == 'winrate') {
      list.sort((a, b) {
        final wa = _bestWinRate(a);
        final wb = _bestWinRate(b);
        return wb.compareTo(wa);
      });
    } else if (sort == 'return') {
      list.sort((a, b) {
        final ra = _bestAvgReturn(a);
        final rb = _bestAvgReturn(b);
        return rb.compareTo(ra);
      });
    } else {
      list.sort((a, b) => b.totalEvents.compareTo(a.totalEvents));
    }
    return list;
  }

  double _bestWinRate(BacktestAssetResult a) {
    if (a.bySignalCount.isEmpty) return 0;
    return a.bySignalCount.values
        .map((s) => s.winRate1m)
        .reduce((x, y) => x > y ? x : y);
  }

  double _bestAvgReturn(BacktestAssetResult a) {
    if (a.bySignalCount.isEmpty) return 0;
    return a.bySignalCount.values
        .map((s) => s.avgReturn3m)
        .reduce((x, y) => x > y ? x : y);
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final agg = data.aggregate;
    final sorted = _sorted(data.assets.where((a) => a.totalEvents > 0).toList());

    return ListView(
      padding: EdgeInsets.only(
          bottom: AppSpacing.s8 + MediaQuery.of(context).padding.bottom),
      children: [
        // Aggregate header
        Padding(
          padding: const EdgeInsets.fromLTRB(
              AppSpacing.s5, AppSpacing.s5, AppSpacing.s5, 0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                '${data.aggregate.values.fold(0, (s, v) => s + v.events)} signal events · ${sorted.length} assets',
                style:
                    AppTypography.headingSm.copyWith(color: c.textPrimary),
              ),
              const SizedBox(height: AppSpacing.s1),
              Text(
                '5 years: ${data.fromDate} – ${data.toDate}',
                style: AppTypography.sm.copyWith(color: c.textMuted),
              ),
              const SizedBox(height: AppSpacing.s1),
              Text(
                'Refreshed ${_fmtRelative(data.lastUpdated)}',
                style: AppTypography.xs.copyWith(color: c.textMuted),
              ),
            ],
          ),
        ),
        const SizedBox(height: AppSpacing.s4),
        // Aggregate stats table
        _AggregateTable(stats: agg),
        const SizedBox(height: AppSpacing.s5),
        // Sort row
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: AppSpacing.s5),
          child: Row(
            children: [
              Text('Sort by:',
                  style: AppTypography.xs.copyWith(color: c.textMuted)),
              const SizedBox(width: AppSpacing.s2),
              _Chip(
                label: 'Events',
                active: sort == 'events',
                onTap: () => onSort('events'),
              ),
              const SizedBox(width: AppSpacing.s2),
              _Chip(
                label: 'Win Rate',
                active: sort == 'winrate',
                onTap: () => onSort('winrate'),
              ),
              const SizedBox(width: AppSpacing.s2),
              _Chip(
                label: 'Avg Return',
                active: sort == 'return',
                onTap: () => onSort('return'),
              ),
            ],
          ),
        ),
        const SizedBox(height: AppSpacing.s3),
        // Asset cards
        ...sorted.map((asset) => _AssetCard(asset: asset)),
      ],
    );
  }
}

// ── Aggregate table ───────────────────────────────────────────────────────────

class _AggregateTable extends StatelessWidget {
  const _AggregateTable({required this.stats});

  final Map<String, BacktestSummaryStats> stats;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final keys = stats.keys.toList()
      ..sort((a, b) => int.parse(a).compareTo(int.parse(b)));

    return Container(
      margin: const EdgeInsets.symmetric(horizontal: AppSpacing.s5),
      decoration: BoxDecoration(
        color: c.surface,
        borderRadius: BorderRadius.circular(AppRadius.md),
        border: Border.all(color: c.border),
      ),
      child: Column(
        children: [
          // Table header
          Padding(
            padding: const EdgeInsets.symmetric(
                horizontal: AppSpacing.s4, vertical: AppSpacing.s3),
            child: Row(
              children: [
                Expanded(
                    flex: 3,
                    child: Text('Signals',
                        style: AppTypography.xs
                            .copyWith(color: c.textMuted, letterSpacing: 0.4))),
                Expanded(
                    flex: 2,
                    child: Text('Events',
                        style: AppTypography.xs
                            .copyWith(color: c.textMuted, letterSpacing: 0.4),
                        textAlign: TextAlign.center)),
                Expanded(
                    flex: 2,
                    child: Text('WR 1m',
                        style: AppTypography.xs
                            .copyWith(color: c.textMuted, letterSpacing: 0.4),
                        textAlign: TextAlign.center)),
                Expanded(
                    flex: 2,
                    child: Text('Avg 3m',
                        style: AppTypography.xs
                            .copyWith(color: c.textMuted, letterSpacing: 0.4),
                        textAlign: TextAlign.center)),
                Expanded(
                    flex: 2,
                    child: Text('Avg 3y',
                        style: AppTypography.xs
                            .copyWith(color: c.textMuted, letterSpacing: 0.4),
                        textAlign: TextAlign.right)),
              ],
            ),
          ),
          Divider(height: 1, color: c.border),
          ...keys.map((k) {
            final s = stats[k]!;
            final label = k == '1' ? '1 Signal' : '$k Signals';
            final wrColor = s.winRate1m >= 60 ? c.positive : c.textSecondary;
            final ret3mColor = s.avgReturn3m >= 0 ? c.positive : c.danger;
            final ret3yColor = s.sampleSize3y > 0
                ? (s.avgReturn3y >= 0 ? c.positive : c.danger)
                : c.textMuted;
            return Column(
              children: [
                Padding(
                  padding: const EdgeInsets.symmetric(
                      horizontal: AppSpacing.s4, vertical: AppSpacing.s3),
                  child: Row(
                    children: [
                      Expanded(
                          flex: 3,
                          child: Text(label,
                              style: AppTypography.sm
                                  .copyWith(color: c.textPrimary))),
                      Expanded(
                          flex: 2,
                          child: Text('${s.events}',
                              style: AppTypography.sm
                                  .copyWith(color: c.textSecondary),
                              textAlign: TextAlign.center)),
                      Expanded(
                          flex: 2,
                          child: Text('${s.winRate1m.toStringAsFixed(0)}%',
                              style: AppTypography.sm.copyWith(
                                  color: wrColor,
                                  fontWeight: FontWeight.w600),
                              textAlign: TextAlign.center)),
                      Expanded(
                          flex: 2,
                          child: Text(
                              '${s.avgReturn3m >= 0 ? '+' : ''}${s.avgReturn3m.toStringAsFixed(1)}%',
                              style: AppTypography.sm.copyWith(
                                  color: ret3mColor,
                                  fontWeight: FontWeight.w600),
                              textAlign: TextAlign.center)),
                      Expanded(
                          flex: 2,
                          child: s.sampleSize3y > 0
                              ? Column(
                                  crossAxisAlignment: CrossAxisAlignment.end,
                                  children: [
                                    Text(
                                        '${s.avgReturn3y >= 0 ? '+' : ''}${s.avgReturn3y.toStringAsFixed(1)}%',
                                        style: AppTypography.sm.copyWith(
                                            color: ret3yColor,
                                            fontWeight: FontWeight.w600),
                                        textAlign: TextAlign.right),
                                    Text('n=${s.sampleSize3y}',
                                        style: AppTypography.xs.copyWith(
                                            color: c.textMuted),
                                        textAlign: TextAlign.right),
                                  ],
                                )
                              : Text('—',
                                  style: AppTypography.sm
                                      .copyWith(color: c.textMuted),
                                  textAlign: TextAlign.right)),
                    ],
                  ),
                ),
                if (k != keys.last) Divider(height: 1, color: c.border),
              ],
            );
          }),
        ],
      ),
    );
  }
}

// ── Asset card ────────────────────────────────────────────────────────────────

class _AssetCard extends StatelessWidget {
  const _AssetCard({required this.asset});

  final BacktestAssetResult asset;

  String _bestSignalSummary() {
    if (asset.bySignalCount.isEmpty) return '';
    final best = asset.bySignalCount.entries
        .reduce((a, b) => a.value.avgReturn3m > b.value.avgReturn3m ? a : b);
    final ret = best.value.avgReturn3m;
    final retStr =
        '${ret >= 0 ? '+' : ''}${ret.toStringAsFixed(1)}%';
    return 'Best: ${best.key}-signal, $retStr avg 3m';
  }

  double _bestWinRate1m() {
    if (asset.bySignalCount.isEmpty) return 0;
    return asset.bySignalCount.values
        .map((s) => s.winRate1m)
        .reduce((a, b) => a > b ? a : b);
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final wr = _bestWinRate1m();

    return GestureDetector(
      onTap: () => _showDetail(context, asset),
      child: Container(
        margin: const EdgeInsets.fromLTRB(
            AppSpacing.s5, 0, AppSpacing.s5, AppSpacing.s3),
        padding: const EdgeInsets.all(AppSpacing.s4),
        decoration: BoxDecoration(
          color: c.surface,
          borderRadius: BorderRadius.circular(AppRadius.md),
          border: Border.all(color: c.border),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                if (asset.flag.isNotEmpty) ...[
                  Text(asset.flag,
                      style: const TextStyle(fontSize: 16)),
                  const SizedBox(width: AppSpacing.s2),
                ],
                Expanded(
                  child: Text(
                    asset.name,
                    style: AppTypography.labelMd.copyWith(color: c.textPrimary),
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                Text(
                  '${asset.totalEvents} events',
                  style: AppTypography.xs.copyWith(color: c.textMuted),
                ),
              ],
            ),
            if (_bestSignalSummary().isNotEmpty) ...[
              const SizedBox(height: AppSpacing.s1),
              Text(
                _bestSignalSummary(),
                style: AppTypography.xs.copyWith(color: c.textSecondary),
              ),
            ],
            const SizedBox(height: AppSpacing.s3),
            Row(
              children: [
                // Signal dots for max count
                ...List.generate(4, (i) {
                  final maxSig = asset.bySignalCount.keys
                      .map(int.parse)
                      .fold(0, (a, b) => a > b ? a : b);
                  final filled = i < maxSig;
                  return Padding(
                    padding: const EdgeInsets.only(right: 4),
                    child: Container(
                      width: 8,
                      height: 8,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: filled ? c.accent : c.border,
                      ),
                    ),
                  );
                }),
                const Spacer(),
                // Win rate bar
                Text(
                  'WR 1m: ${wr.toStringAsFixed(0)}%',
                  style: AppTypography.xs.copyWith(
                    color: wr >= 60 ? c.positive : c.textSecondary,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(width: AppSpacing.s3),
                SizedBox(
                  width: 60,
                  height: 4,
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(AppRadius.full),
                    child: LinearProgressIndicator(
                      value: wr / 100,
                      backgroundColor: c.border,
                      valueColor: AlwaysStoppedAnimation(
                          wr >= 60 ? c.positive : c.textSecondary),
                    ),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

String _fmtRelative(String isoStr) {
  final dt = DateTime.tryParse(isoStr)?.toLocal();
  if (dt == null) return '';
  final now = DateTime.now();
  if (dt.day == now.day && dt.month == now.month && dt.year == now.year) {
    return 'today';
  }
  if (now.difference(dt).inHours < 48) return 'yesterday';
  return '${dt.day}/${dt.month}/${dt.year}';
}

// ── Info sheet ────────────────────────────────────────────────────────────────

void _showBacktestInfo(BuildContext context) {
  final c = context.colors;
  showModalBottomSheet(
    context: context,
    backgroundColor: c.surface,
    isScrollControlled: true,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (_) => DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.75,
      minChildSize: 0.4,
      maxChildSize: 0.92,
      builder: (ctx, scrollController) => ListView(
        controller: scrollController,
        padding: EdgeInsets.fromLTRB(
            AppSpacing.s5,
            AppSpacing.s5,
            AppSpacing.s5,
            AppSpacing.s8 + MediaQuery.of(ctx).padding.bottom),
        children: [
          Center(
            child: Container(
              width: 36,
              height: 4,
              decoration: BoxDecoration(
                color: c.border,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),
          const SizedBox(height: AppSpacing.s5),
          Row(
            children: [
              Container(
                padding: const EdgeInsets.symmetric(
                    horizontal: AppSpacing.s3, vertical: 3),
                decoration: BoxDecoration(
                  color: c.accent.withAlpha(25),
                  borderRadius: BorderRadius.circular(AppRadius.xs),
                  border: Border.all(color: c.accent.withAlpha(80)),
                ),
                child: Text('10X',
                    style: AppTypography.labelSm.copyWith(
                        color: c.accent, fontWeight: FontWeight.w800)),
              ),
              const SizedBox(width: AppSpacing.s3),
              Expanded(
                child: Text('Backtest Validator',
                    style:
                        AppTypography.headingMd.copyWith(color: c.textPrimary)),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.s3),
          Text(
            'Validates whether the 10X scanner signals actually preceded positive price moves — historically. For each asset, it walks through 5 years of daily candles and records every date a volume spike occurred. It then checks which other signals were also active on that date and measures what the price did at 1 month, 3 months, 6 months, and 1 year later.',
            style: AppTypography.sm.copyWith(color: c.textSecondary, height: 1.55),
          ),
          const SizedBox(height: AppSpacing.s5),
          _InfoSection(
            label: 'TRIGGER',
            color: c.accent,
            c: c,
            description:
                'Only dates where a Volume Spike fired (≥3× 20-day average on a green candle) are evaluated. This is the event that triggers the check — not every candle.',
          ),
          const SizedBox(height: AppSpacing.s4),
          _InfoSection(
            label: 'SIGNAL COUNT',
            color: c.warning,
            c: c,
            description:
                '1 Signal = volume spike only. 2 Signals = spike + heartbeat. 3 Signals = + record quarter (stocks). 4 Signals = + trend (v2 only). Higher counts = rarer but historically stronger setups.',
          ),
          const SizedBox(height: AppSpacing.s4),
          _InfoSection(
            label: 'WIN RATE 1m',
            color: c.positive,
            c: c,
            description:
                'Percentage of signal events where the price was higher 1 month (~21 trading days) later. A rate above 50% means the signal was more often right than wrong.',
          ),
          const SizedBox(height: AppSpacing.s4),
          _InfoSection(
            label: 'AVG RETURN',
            color: c.positive,
            c: c,
            description:
                'Average % price change across all events at that signal count, measured at 3 months (~63 trading days). Includes both wins and losses.',
          ),
          const SizedBox(height: AppSpacing.s4),
          _InfoSection(
            label: 'FIRST LOAD',
            color: c.textMuted,
            c: c,
            description:
                'The backtest fetches 5 years of daily candles per asset and runs entirely on the server. First load takes 1–2 minutes. Results are cached for 24 hours — subsequent loads are instant.',
          ),
          const SizedBox(height: AppSpacing.s5),
          Container(
            padding: const EdgeInsets.all(AppSpacing.s4),
            decoration: BoxDecoration(
              color: c.warning.withAlpha(12),
              borderRadius: BorderRadius.circular(AppRadius.sm),
              border: Border.all(color: c.warning.withAlpha(40)),
            ),
            child: Text(
              'Past performance does not guarantee future results. Signal win rates vary by market condition, asset class, and time period. Use as one input among many.',
              style: AppTypography.xs.copyWith(
                  color: c.warning.withAlpha(200), height: 1.5),
            ),
          ),
        ],
      ),
    ),
  );
}

class _InfoSection extends StatelessWidget {
  const _InfoSection({
    required this.label,
    required this.color,
    required this.c,
    required this.description,
  });

  final String label;
  final Color color;
  final AppPalette c;
  final String description;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          padding:
              const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
          decoration: BoxDecoration(
            color: color.withAlpha(20),
            borderRadius: BorderRadius.circular(AppRadius.full),
            border: Border.all(color: color.withAlpha(70)),
          ),
          child: Text(label,
              style: AppTypography.xs.copyWith(
                  color: color, fontWeight: FontWeight.w700)),
        ),
        const SizedBox(width: AppSpacing.s3),
        Expanded(
          child: Text(description,
              style: AppTypography.xs
                  .copyWith(color: c.textSecondary, height: 1.55)),
        ),
      ],
    );
  }
}

// ── Detail sheet ──────────────────────────────────────────────────────────────

void _showDetail(BuildContext context, BacktestAssetResult asset) {
  showModalBottomSheet(
    context: context,
    isScrollControlled: true,
    enableDrag: true,
    backgroundColor: Colors.transparent,
    builder: (_) => _BacktestDetailSheet(asset: asset),
  );
}

class _BacktestDetailSheet extends StatelessWidget {
  const _BacktestDetailSheet({required this.asset});

  final BacktestAssetResult asset;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final events = List<BacktestSignalEvent>.from(asset.events)
      ..sort((a, b) => b.date.compareTo(a.date));

    return DraggableScrollableSheet(
      initialChildSize: 0.85,
      maxChildSize: 0.95,
      minChildSize: 0.4,
      builder: (sheetCtx, controller) => Container(
        decoration: BoxDecoration(
          color: c.surface,
          borderRadius: const BorderRadius.vertical(
              top: Radius.circular(AppRadius.lg)),
        ),
        child: Column(
          children: [
            // Handle
            Center(
              child: Container(
                margin: const EdgeInsets.only(top: AppSpacing.s3),
                width: 36,
                height: 4,
                decoration: BoxDecoration(
                  color: c.border,
                  borderRadius: BorderRadius.circular(AppRadius.full),
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(
                  AppSpacing.s5, AppSpacing.s3, AppSpacing.s5, AppSpacing.s3),
              child: Row(
                children: [
                  if (asset.flag.isNotEmpty) ...[
                    Text(asset.flag,
                        style: const TextStyle(fontSize: 18)),
                    const SizedBox(width: AppSpacing.s2),
                  ],
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(asset.name,
                            style: AppTypography.headingSm
                                .copyWith(color: c.textPrimary)),
                        Text(asset.symbol,
                            style: AppTypography.xs
                                .copyWith(color: c.textMuted)),
                      ],
                    ),
                  ),
                  Text(
                    '${asset.totalEvents} events',
                    style: AppTypography.sm.copyWith(color: c.textSecondary),
                  ),
                ],
              ),
            ),
            Divider(height: 1, color: c.border),
            // Column headers
            Padding(
              padding: const EdgeInsets.fromLTRB(
                  AppSpacing.s5, AppSpacing.s3, AppSpacing.s5, AppSpacing.s2),
              child: Row(
                children: [
                  Expanded(
                      flex: 3,
                      child: Text('Date',
                          style: AppTypography.xs
                              .copyWith(color: c.textMuted))),
                  Expanded(
                      flex: 2,
                      child: Text('Sigs',
                          style: AppTypography.xs.copyWith(color: c.textMuted),
                          textAlign: TextAlign.center)),
                  Expanded(
                      flex: 2,
                      child: Text('1m',
                          style: AppTypography.xs.copyWith(color: c.textMuted),
                          textAlign: TextAlign.center)),
                  Expanded(
                      flex: 2,
                      child: Text('3m',
                          style: AppTypography.xs.copyWith(color: c.textMuted),
                          textAlign: TextAlign.center)),
                  Expanded(
                      flex: 2,
                      child: Text('1y',
                          style: AppTypography.xs.copyWith(color: c.textMuted),
                          textAlign: TextAlign.center)),
                  Expanded(
                      flex: 2,
                      child: Text('3y',
                          style: AppTypography.xs.copyWith(color: c.textMuted),
                          textAlign: TextAlign.right)),
                ],
              ),
            ),
            Divider(height: 1, color: c.border),
            Expanded(
              child: ListView.separated(
                controller: controller,
                padding: EdgeInsets.only(
                    bottom: AppSpacing.s8 +
                        MediaQuery.of(sheetCtx).padding.bottom),
                itemCount: events.length,
                separatorBuilder: (_, __) => Divider(height: 1, color: c.border),
                itemBuilder: (_, i) => _EventRow(event: events[i], c: c),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _EventRow extends StatelessWidget {
  const _EventRow({required this.event, required this.c});

  final BacktestSignalEvent event;
  final AppPalette c;

  String _fmt(double? v) {
    if (v == null) return '—';
    return '${v >= 0 ? '+' : ''}${v.toStringAsFixed(1)}%';
  }

  Color _retColor(double? v) {
    if (v == null) return c.textMuted;
    return v >= 0 ? c.positive : c.danger;
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.s5, vertical: AppSpacing.s3),
      child: Row(
        children: [
          Expanded(
            flex: 3,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(event.date.substring(2),
                    style:
                        AppTypography.xs.copyWith(color: c.textPrimary)),
                Row(
                  children: List.generate(event.signalCount, (_) {
                    return Padding(
                      padding: const EdgeInsets.only(right: 2),
                      child: Container(
                        width: 5,
                        height: 5,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: c.accent,
                        ),
                      ),
                    );
                  }),
                ),
              ],
            ),
          ),
          Expanded(
            flex: 2,
            child: Text('${event.signalCount}',
                style: AppTypography.sm.copyWith(
                    color: c.accent, fontWeight: FontWeight.w700),
                textAlign: TextAlign.center),
          ),
          Expanded(
            flex: 2,
            child: Text(_fmt(event.returns.d21),
                style: AppTypography.xs
                    .copyWith(color: _retColor(event.returns.d21)),
                textAlign: TextAlign.center),
          ),
          Expanded(
            flex: 2,
            child: Text(_fmt(event.returns.d63),
                style: AppTypography.xs
                    .copyWith(color: _retColor(event.returns.d63)),
                textAlign: TextAlign.center),
          ),
          Expanded(
            flex: 2,
            child: Text(_fmt(event.returns.d252),
                style: AppTypography.xs
                    .copyWith(color: _retColor(event.returns.d252)),
                textAlign: TextAlign.center),
          ),
          Expanded(
            flex: 2,
            child: Text(_fmt(event.returns.d756),
                style: AppTypography.xs
                    .copyWith(color: _retColor(event.returns.d756)),
                textAlign: TextAlign.right),
          ),
        ],
      ),
    );
  }
}
