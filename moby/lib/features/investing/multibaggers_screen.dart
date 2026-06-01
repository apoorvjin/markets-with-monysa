import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme/app_palette.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/theme/app_typography.dart';
import '../../data/models/trading_signal.dart';
import '../../data/repositories/trading_repository.dart';
import '../../shared/widgets/error_view.dart';
import '../../shared/widgets/glass_card.dart';
import '../../shared/widgets/max_width_layout.dart';
import '../../shared/widgets/theme_toggle.dart';

// ── Provider ──────────────────────────────────────────────────────────────────

final _multibaggersProvider = FutureProvider.autoDispose
    .family<List<TenXScanResult>, ({String country, String version})>(
  (_, args) {
    final v2 = args.version == 'v2';
    switch (args.country) {
      case 'uk':
        return v2
            ? TradingRepository.instance.fetchTenXV2UKStocks()
            : TradingRepository.instance.fetchTenXUKStocks();
      case 'japan':
        return v2
            ? TradingRepository.instance.fetchTenXV2JapanStocks()
            : TradingRepository.instance.fetchTenXJapanStocks();
      case 'hongkong':
        return v2
            ? TradingRepository.instance.fetchTenXV2HKStocks()
            : TradingRepository.instance.fetchTenXHKStocks();
      case 'china':
        return v2
            ? TradingRepository.instance.fetchTenXV2ChinaStocks()
            : TradingRepository.instance.fetchTenXChinaStocks();
      case 'euronext':
        return v2
            ? TradingRepository.instance.fetchTenXV2EuronextStocks()
            : TradingRepository.instance.fetchTenXEuronextStocks();
      default:
        return v2
            ? TradingRepository.instance.fetchTenXV2IndiaStocks()
            : TradingRepository.instance.fetchTenXIndiaStocks();
    }
  },
);

String _countryLabel(String country) => const {
  'india': 'India',
  'uk': 'UK',
  'japan': 'Japan',
  'hongkong': 'Hong Kong',
  'china': 'China',
  'euronext': 'Euronext',
}[country] ?? 'Unknown';

// ── Standalone screen (route: /trading/multibaggers) ─────────────────────────

class MultibaggersScreen extends StatelessWidget {
  const MultibaggersScreen({super.key, required this.country});

  final String country;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Scaffold(
      backgroundColor: c.background,
      appBar: AppBar(
        backgroundColor: c.surface,
        surfaceTintColor: Colors.transparent,
        title: Text('Multibaggers',
            style: AppTypography.headingSm.copyWith(color: c.textPrimary)),
        actions: const [ThemeToggleButton()],
      ),
      body: MultibaggersBody(initialCountry: country),
    );
  }
}

// ── Body — used both as a tab and inside the standalone screen ────────────────

class MultibaggersBody extends ConsumerStatefulWidget {
  const MultibaggersBody({super.key, this.initialCountry = 'india'});

  final String initialCountry;

  @override
  ConsumerState<MultibaggersBody> createState() => _MultibaggersBodyState();
}

class _MultibaggersBodyState extends ConsumerState<MultibaggersBody> {
  late String _country;
  String _version = 'v1';
  int _minSignals = 0;
  String _sort = 'signals';
  Set<String> _signalFilter = {};

  static const _validCountries = {'india', 'uk', 'japan', 'hongkong', 'china', 'euronext'};

  @override
  void initState() {
    super.initState();
    _country = _validCountries.contains(widget.initialCountry)
        ? widget.initialCountry
        : 'india';
  }

  ({String country, String version}) get _args =>
      (country: _country, version: _version);

  void _reset() {
    _minSignals = 0;
    _signalFilter = {};
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(_multibaggersProvider(_args));

    return MaxWidthLayout(
      child: Column(
        children: [
          _ControlRow(
            country: _country,
            version: _version,
            onCountry: (v) => setState(() {
              _country = v;
              _reset();
            }),
            onVersion: (v) => setState(() {
              _version = v;
              _reset();
            }),
            onBacktest: () => context.push(
                '/trading/10x-backtest?version=$_version&type=$_country'),
            onInfo: () => _showMultibaggersInfo(context),
          ),
          _FilterRow(
            minSignals: _minSignals,
            sort: _sort,
            version: _version,
            signalFilter: _signalFilter,
            onFilter: (v) => setState(() => _minSignals = v),
            onSort: (v) => setState(() => _sort = v),
            onSignalToggle: (sig) => setState(() {
              final next = Set<String>.from(_signalFilter);
              next.contains(sig) ? next.remove(sig) : next.add(sig);
              _signalFilter = next;
            }),
          ),
          Expanded(
            child: async.when(
              loading: () => const _ScannerSkeleton(),
              error: (e, _) => ErrorView(
                message: '${_countryLabel(_country)} scanner unavailable',
                onRetry: () => ref.invalidate(_multibaggersProvider(_args)),
              ),
              data: (results) {
                final filtered = results
                    .where((r) => r.signalsActive >= _minSignals)
                    .where((r) {
                      if (_signalFilter.isEmpty) return true;
                      for (final sig in _signalFilter) {
                        if (sig == 'VOL' && !(r.volumeSpike && r.volumeGreen)) return false;
                        if (sig == 'HEARTBEAT' && !r.heartbeat) return false;
                        if (sig == 'REC_QTR' && !r.recordQuarter) return false;
                        if (sig == 'TREND' && !r.trendUp) return false;
                      }
                      return true;
                    })
                    .toList();

                if (_sort == 'volume') {
                  filtered.sort(
                      (a, b) => b.volumeRatio.compareTo(a.volumeRatio));
                }

                return RefreshIndicator(
                  onRefresh: () =>
                      ref.refresh(_multibaggersProvider(_args).future),
                  child: filtered.isEmpty
                      ? Center(
                          child: Padding(
                            padding: const EdgeInsets.all(AppSpacing.s8),
                            child: Text(
                              'No stocks match the current filter.\nTry lowering the signal count.',
                              style: AppTypography.sm
                                  .copyWith(color: context.colors.textMuted),
                              textAlign: TextAlign.center,
                            ),
                          ),
                        )
                      : ListView.builder(
                          padding: EdgeInsets.only(
                            top: AppSpacing.s3,
                            bottom: AppSpacing.s3 +
                                MediaQuery.of(context).padding.bottom,
                          ),
                          itemCount: filtered.length,
                          itemBuilder: (_, i) =>
                              _StockCard(item: filtered[i], version: _version),
                        ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

// ── Control Row ───────────────────────────────────────────────────────────────

class _ControlRow extends StatelessWidget {
  const _ControlRow({
    required this.country,
    required this.version,
    required this.onCountry,
    required this.onVersion,
    required this.onBacktest,
    required this.onInfo,
  });

  final String country;
  final String version;
  final ValueChanged<String> onCountry;
  final ValueChanged<String> onVersion;
  final VoidCallback onBacktest;
  final VoidCallback onInfo;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Container(
      color: c.surface,
      padding: const EdgeInsets.fromLTRB(
          AppSpacing.s5, AppSpacing.s3, AppSpacing.s4, AppSpacing.s3),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text('Filters',
                  style: AppTypography.labelSm
                      .copyWith(color: c.textMuted, letterSpacing: 0.5)),
              const Spacer(),
              GestureDetector(
                onTap: onBacktest,
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.history_rounded,
                        size: 13, color: c.textSecondary),
                    const SizedBox(width: 3),
                    Text('Backtest',
                        style:
                            AppTypography.xs.copyWith(color: c.textSecondary)),
                  ],
                ),
              ),
              const SizedBox(width: AppSpacing.s4),
              GestureDetector(
                onTap: onInfo,
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text('How it works',
                        style: AppTypography.xs.copyWith(color: c.accent)),
                    const SizedBox(width: 4),
                    Icon(Icons.info_outline_rounded,
                        size: 15, color: c.accent),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.s2),
          Row(
            children: [
              Text('Country:',
                  style: AppTypography.xs.copyWith(color: c.textMuted)),
              const SizedBox(width: AppSpacing.s2),
              Expanded(
                child: SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(
                    children: [
                      _Chip(
                        label: '🇮🇳 India',
                        active: country == 'india',
                        onTap: () => onCountry('india'),
                      ),
                      const SizedBox(width: AppSpacing.s2),
                      _Chip(
                        label: '🇬🇧 UK',
                        active: country == 'uk',
                        onTap: () => onCountry('uk'),
                      ),
                      const SizedBox(width: AppSpacing.s2),
                      _Chip(
                        label: '🇯🇵 Japan',
                        active: country == 'japan',
                        onTap: () => onCountry('japan'),
                      ),
                      const SizedBox(width: AppSpacing.s2),
                      _Chip(
                        label: '🇭🇰 HK',
                        active: country == 'hongkong',
                        onTap: () => onCountry('hongkong'),
                      ),
                      const SizedBox(width: AppSpacing.s2),
                      _Chip(
                        label: '🇨🇳 China',
                        active: country == 'china',
                        onTap: () => onCountry('china'),
                      ),
                      const SizedBox(width: AppSpacing.s2),
                      _Chip(
                        label: '🇪🇺 Euronext',
                        active: country == 'euronext',
                        onTap: () => onCountry('euronext'),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.s2),
          Row(
            children: [
              Text('Ver:',
                  style: AppTypography.xs.copyWith(color: c.textMuted)),
              const SizedBox(width: AppSpacing.s2),
              _Chip(
                label: 'v1 Original',
                active: version == 'v1',
                onTap: () => onVersion('v1'),
              ),
              const SizedBox(width: AppSpacing.s2),
              _Chip(
                label: 'v2 Pine-Aligned',
                active: version == 'v2',
                onTap: () => onVersion('v2'),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

// ── Filter Row ────────────────────────────────────────────────────────────────

class _FilterRow extends StatelessWidget {
  const _FilterRow({
    required this.minSignals,
    required this.sort,
    required this.version,
    required this.signalFilter,
    required this.onFilter,
    required this.onSort,
    required this.onSignalToggle,
  });

  final int minSignals;
  final String sort;
  final String version;
  final Set<String> signalFilter;
  final ValueChanged<int> onFilter;
  final ValueChanged<String> onSort;
  final ValueChanged<String> onSignalToggle;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Container(
      color: c.surface,
      padding: const EdgeInsets.fromLTRB(
          AppSpacing.s5, 0, AppSpacing.s4, AppSpacing.s3),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Divider(height: 1, color: c.border),
          const SizedBox(height: AppSpacing.s2),
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                _Chip(label: 'All', active: minSignals == 0, onTap: () => onFilter(0)),
                const SizedBox(width: AppSpacing.s2),
                _Chip(label: '1+ Signal', active: minSignals == 1, onTap: () => onFilter(1)),
                const SizedBox(width: AppSpacing.s2),
                _Chip(label: '2+ Signals', active: minSignals == 2, onTap: () => onFilter(2)),
                const SizedBox(width: AppSpacing.s2),
                _Chip(label: '3 Signals', active: minSignals == 3, onTap: () => onFilter(3)),
                const SizedBox(width: AppSpacing.s2),
                _Chip(label: '4 Signals', active: minSignals == 4, onTap: () => onFilter(4)),
              ],
            ),
          ),
          const SizedBox(height: AppSpacing.s2),
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                Text('Signals:',
                    style: AppTypography.xs.copyWith(color: c.textMuted)),
                const SizedBox(width: AppSpacing.s2),
                _Chip(
                  label: 'VOL',
                  active: signalFilter.contains('VOL'),
                  onTap: () => onSignalToggle('VOL'),
                ),
                const SizedBox(width: AppSpacing.s2),
                _Chip(
                  label: 'HEARTBEAT',
                  active: signalFilter.contains('HEARTBEAT'),
                  onTap: () => onSignalToggle('HEARTBEAT'),
                ),
                const SizedBox(width: AppSpacing.s2),
                _Chip(
                  label: 'REC. QTR',
                  active: signalFilter.contains('REC_QTR'),
                  onTap: () => onSignalToggle('REC_QTR'),
                ),
                const SizedBox(width: AppSpacing.s2),
                version == 'v1'
                    ? Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: AppSpacing.s4,
                            vertical: AppSpacing.s2),
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(AppRadius.full),
                          border: Border.all(color: c.border.withAlpha(80)),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(Icons.close_rounded,
                                size: 9, color: c.textFaint),
                            const SizedBox(width: 3),
                            Text(
                              'TREND ↑',
                              style: AppTypography.xs.copyWith(
                                color: c.textFaint,
                                fontWeight: FontWeight.w500,
                                decoration: TextDecoration.lineThrough,
                                decorationColor: c.textFaint,
                              ),
                            ),
                          ],
                        ),
                      )
                    : _Chip(
                        label: 'TREND ↑',
                        active: signalFilter.contains('TREND'),
                        onTap: () => onSignalToggle('TREND'),
                      ),
              ],
            ),
          ),
          const SizedBox(height: AppSpacing.s2),
          Row(
            children: [
              Text('Sort:',
                  style: AppTypography.xs.copyWith(color: c.textMuted)),
              const SizedBox(width: AppSpacing.s2),
              _Chip(
                label: 'Signal Count',
                active: sort == 'signals',
                onTap: () => onSort('signals'),
              ),
              const SizedBox(width: AppSpacing.s2),
              _Chip(
                label: 'Volume Ratio',
                active: sort == 'volume',
                onTap: () => onSort('volume'),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

// ── Chip ──────────────────────────────────────────────────────────────────────

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

// ── Stock Card ────────────────────────────────────────────────────────────────

class _StockCard extends StatelessWidget {
  const _StockCard({required this.item, required this.version});

  final TenXScanResult item;
  final String version;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final isUp = item.changePercent >= 0;
    final pctColor = isUp ? c.positive : c.danger;

    return GestureDetector(
      onTap: () => context.push(
        '/asset/${Uri.encodeComponent(item.symbol)}'
        '?name=${Uri.encodeComponent(item.name)}',
      ),
      child: GlassCard(
        margin: const EdgeInsets.symmetric(
          horizontal: AppSpacing.s5,
          vertical: AppSpacing.s2,
        ),
        padding: const EdgeInsets.all(AppSpacing.s4),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 5, vertical: 2),
                  decoration: BoxDecoration(
                    color: c.surfaceCard,
                    borderRadius: BorderRadius.circular(AppRadius.xs),
                    border: Border.all(color: c.border),
                  ),
                  child: Text(
                    item.symbol,
                    style: AppTypography.xs.copyWith(
                        color: c.textSecondary, fontWeight: FontWeight.w700),
                  ),
                ),
                const SizedBox(width: AppSpacing.s2),
                Expanded(
                  child: Text(
                    item.name,
                    style: AppTypography.labelLg.copyWith(color: c.textPrimary),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                Text(
                  _fmtPrice(item.price),
                  style: AppTypography.numericLg.copyWith(color: c.textPrimary),
                ),
                const SizedBox(width: AppSpacing.s2),
                _PctChip(pct: item.changePercent, color: pctColor),
              ],
            ),
            const SizedBox(height: AppSpacing.s3),
            Wrap(
              spacing: AppSpacing.s2,
              runSpacing: AppSpacing.s2,
              children: [
                _SignalPill(
                  label: item.volumeRatio > 0
                      ? 'VOL ${item.volumeRatio.toStringAsFixed(1)}x'
                      : 'VOL —',
                  active: item.volumeSpike && item.volumeGreen,
                  activeColor: item.volumeSpike && !item.volumeGreen
                      ? c.warning
                      : c.positive,
                ),
                _SignalPill(
                  label: 'HEARTBEAT',
                  active: item.heartbeat,
                  activeColor: c.accent,
                ),
                _SignalPill(
                  label: 'REC. QTR',
                  active: item.recordQuarter,
                  activeColor: c.positive,
                  locked: !item.epsApplicable,
                ),
                if (item.trendUp || item.signalsActive >= 4)
                  _SignalPill(
                    label: 'TREND ↑',
                    active: item.trendUp,
                    activeColor: c.accent,
                  ),
              ],
            ),
            const SizedBox(height: AppSpacing.s3),
            _SignalDots(
                count: item.signalsActive, total: version == 'v2' ? 4 : 3),
          ],
        ),
      ),
    );
  }

  String _fmtPrice(double p) {
    if (p > 1000) return p.toStringAsFixed(0);
    if (p < 1) return p.toStringAsFixed(4);
    return p.toStringAsFixed(2);
  }
}

// ── Signal Pill ───────────────────────────────────────────────────────────────

class _SignalPill extends StatelessWidget {
  const _SignalPill({
    required this.label,
    required this.active,
    required this.activeColor,
    this.locked = false,
  });

  final String label;
  final bool active;
  final Color activeColor;
  final bool locked;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final color = active ? activeColor : c.textFaint;
    final bg = active ? activeColor.withAlpha(30) : Colors.transparent;
    final border = active ? activeColor.withAlpha(80) : c.border;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(AppRadius.full),
        border: Border.all(color: border),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (locked) ...[
            Icon(Icons.lock_rounded, size: 9, color: c.textMuted),
            const SizedBox(width: 3),
          ],
          Text(label,
              style: AppTypography.xs.copyWith(
                  color: color,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 0.3)),
        ],
      ),
    );
  }
}

// ── Signal Dots ───────────────────────────────────────────────────────────────

class _SignalDots extends StatelessWidget {
  const _SignalDots({required this.count, this.total = 3});

  final int count;
  final int total;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Row(
      children: [
        Text('$count of $total signals',
            style: AppTypography.xs.copyWith(color: c.textMuted)),
        const SizedBox(width: AppSpacing.s2),
        ...List.generate(
          total,
          (i) => Container(
            width: 8,
            height: 8,
            margin: const EdgeInsets.only(right: 4),
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: i < count ? c.accent : c.border,
            ),
          ),
        ),
      ],
    );
  }
}

// ── Pct Chip ──────────────────────────────────────────────────────────────────

class _PctChip extends StatelessWidget {
  const _PctChip({required this.pct, required this.color});

  final double pct;
  final Color color;

  @override
  Widget build(BuildContext context) {
    final sign = pct >= 0 ? '+' : '';
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: color.withAlpha(25),
        borderRadius: BorderRadius.circular(AppRadius.xs),
        border: Border.all(color: color.withAlpha(60)),
      ),
      child: RichText(
        text: TextSpan(
          children: [
            TextSpan(
              text: '$sign${pct.toStringAsFixed(2)}%',
              style: AppTypography.xs
                  .copyWith(color: color, fontWeight: FontWeight.w700),
            ),
            TextSpan(
              text: ' 1D',
              style: AppTypography.xs.copyWith(
                  color: color.withAlpha(160),
                  fontWeight: FontWeight.w500,
                  fontSize: 9),
            ),
          ],
        ),
      ),
    );
  }
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

class _ScannerSkeleton extends StatelessWidget {
  const _ScannerSkeleton();

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return ListView.builder(
      padding: const EdgeInsets.symmetric(
          vertical: AppSpacing.s3, horizontal: AppSpacing.s5),
      itemCount: 8,
      itemBuilder: (_, __) => Container(
        margin: const EdgeInsets.only(bottom: AppSpacing.s3),
        height: 96,
        decoration: BoxDecoration(
          color: c.surface,
          borderRadius: BorderRadius.circular(AppRadius.md),
          border: Border.all(color: c.border),
        ),
      ),
    );
  }
}

// ── Info Sheet ────────────────────────────────────────────────────────────────

void _showMultibaggersInfo(BuildContext context) {
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
      builder: (ctx, controller) => ListView(
        controller: controller,
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
                  color: c.border, borderRadius: BorderRadius.circular(2)),
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
                child: Text('MB',
                    style: AppTypography.labelSm.copyWith(
                        color: c.accent, fontWeight: FontWeight.w800)),
              ),
              const SizedBox(width: AppSpacing.s3),
              Expanded(
                child: Text('How Multibaggers Works',
                    style: AppTypography.headingMd
                        .copyWith(color: c.textPrimary)),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.s3),
          Text(
            'Applies the same 10X scanner logic to Indian and UK equities — scanning for stocks in a quiet accumulation phase with tightening range, building volume, and improving earnings momentum. These are the conditions that have historically preceded explosive breakout moves.',
            style: AppTypography.sm
                .copyWith(color: c.textSecondary, height: 1.55),
          ),
          const SizedBox(height: AppSpacing.s5),
          _InfoRow(
            label: 'COUNTRY',
            color: c.accent,
            c: c,
            description:
                'India: NSE/BSE (IN). UK: LSE (GB). Japan: TSE (JP). HK: HKEX (HK). China: SSE/SZSE (CN). Euronext: FR + NL + DE + IT + NO combined. Universe updates every hour.',
          ),
          const SizedBox(height: AppSpacing.s4),
          _InfoRow(
            label: 'SIGNALS',
            color: c.warning,
            c: c,
            description:
                'VOL = volume spike ≥3× 20-day average on a green candle. HEARTBEAT = tight consolidation range. REC. QTR = record or near-record EPS quarter. TREND ↑ = MA50 flat or rising (v2 only).',
          ),
          const SizedBox(height: AppSpacing.s4),
          _InfoRow(
            label: 'v1 vs v2',
            color: c.textSecondary,
            c: c,
            description:
                'v1 Original: 30% consolidation range over 2 years. v2 Pine-Aligned: 35% range over the last 200 bars + MA50 trend signal, matching TradingView Pine Script logic.',
          ),
          const SizedBox(height: AppSpacing.s4),
          _InfoRow(
            label: 'BACKTEST',
            color: c.positive,
            c: c,
            description:
                'Tap "Backtest" to see 5-year historical win rates for India or UK stocks. Results show how often signals preceded positive price moves at 1m, 3m, 6m, and 1y horizons.',
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
              'Past performance does not guarantee future results. Use as one input among many.',
              style: AppTypography.xs
                  .copyWith(color: c.warning.withAlpha(200), height: 1.5),
            ),
          ),
        ],
      ),
    ),
  );
}

class _InfoRow extends StatelessWidget {
  const _InfoRow({
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
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
          decoration: BoxDecoration(
            color: color.withAlpha(20),
            borderRadius: BorderRadius.circular(AppRadius.full),
            border: Border.all(color: color.withAlpha(70)),
          ),
          child: Text(label,
              style: AppTypography.xs
                  .copyWith(color: color, fontWeight: FontWeight.w700)),
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
