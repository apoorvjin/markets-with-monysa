import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme/app_palette.dart';
import '../../core/theme/app_typography.dart';
import '../../core/theme/app_spacing.dart';
import '../../data/models/trading_signal.dart';
import '../../data/repositories/trading_repository.dart';
import '../../services/entitlement_service.dart';
import '../../shared/widgets/upgrade_sheet.dart';

final _bestSetupsCardProvider = FutureProvider.autoDispose
    .family<BestSetupsResponse, ({String version, String type})>(
  (ref, args) {
    ref.keepAlive();
    return TradingRepository.instance.fetchBestSetups(
      version: args.version,
      type: args.type,
    );
  },
);

class BestSetupsCard extends ConsumerStatefulWidget {
  const BestSetupsCard({
    super.key,
    required this.type,
    required this.version,
    required this.onVersionChanged,
  });

  final String type;
  final String version;
  final ValueChanged<String> onVersionChanged;

  @override
  ConsumerState<BestSetupsCard> createState() => _BestSetupsCardState();
}

class _BestSetupsCardState extends ConsumerState<BestSetupsCard> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      TradingRepository.instance
          .fetchBestSetups(version: widget.version, type: widget.type)
          .ignore();
    });
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final isPro = EntitlementService.can('best_setups');
    final args = (version: widget.version, type: widget.type);
    final async = ref.watch(_bestSetupsCardProvider(args));

    return Container(
      padding: const EdgeInsets.all(AppSpacing.s4),
      decoration: BoxDecoration(
        color: c.surfaceElevated,
        borderRadius: BorderRadius.circular(AppRadius.md),
        border: Border.all(color: c.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.bolt_rounded, size: 18, color: c.warning),
              const SizedBox(width: AppSpacing.s2),
              Expanded(
                child: Text('Best Setups Right Now',
                    style: AppTypography.headingSm
                        .copyWith(color: c.textPrimary)),
              ),
              GestureDetector(
                onTap: () => showBestSetupsInfo(context),
                child: Icon(Icons.info_outline_rounded,
                    size: 16, color: c.textMuted),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.s2),
          Text(
            'Signals firing today with ≥65% historical 1m win rate',
            style: AppTypography.xs.copyWith(color: c.textMuted),
          ),
          const SizedBox(height: AppSpacing.s4),
          Row(
            children: [
              GestureDetector(
                onTap: () => widget.onVersionChanged(
                    widget.version == 'v1' ? 'v2' : 'v1'),
                child: Container(
                  padding: const EdgeInsets.symmetric(
                      horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: c.surfaceCard,
                    borderRadius: BorderRadius.circular(AppRadius.full),
                    border: Border.all(color: c.border),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      VersionDot(
                          label: 'v1', active: widget.version == 'v1', c: c),
                      const SizedBox(width: 6),
                      VersionDot(
                          label: 'v2', active: widget.version == 'v2', c: c),
                    ],
                  ),
                ),
              ),
              const Spacer(),
              Container(
                padding: const EdgeInsets.symmetric(
                    horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: c.accentDim18,
                  borderRadius: BorderRadius.circular(AppRadius.full),
                ),
                child: Text('Pro',
                    style: AppTypography.xs.copyWith(
                        color: c.accent, fontWeight: FontWeight.w700)),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.s4),
          Container(
            decoration: BoxDecoration(
              color: c.surfaceCard,
              borderRadius: BorderRadius.circular(AppRadius.md),
              border: Border.all(color: c.border),
            ),
            child: !isPro
                ? BestSetupsLockedBody(c: c, context: context)
                : async.when(
                    loading: () => BestSetupsLoadingBody(c: c),
                    error: (_, __) => Padding(
                      padding: const EdgeInsets.all(AppSpacing.s4),
                      child: Text('Unable to load setups',
                          style: AppTypography.xs
                              .copyWith(color: c.textMuted)),
                    ),
                    data: (resp) {
                      if (!resp.cacheWarm) {
                        return Padding(
                          padding: const EdgeInsets.all(AppSpacing.s4),
                          child: Row(
                            children: [
                              Icon(Icons.hourglass_top_rounded,
                                  size: 14, color: c.textMuted),
                              const SizedBox(width: 6),
                              Text(
                                  'Computing best setups — refreshing automatically…',
                                  style: AppTypography.xs
                                      .copyWith(color: c.textMuted)),
                            ],
                          ),
                        );
                      }
                      if (resp.setups.isEmpty) {
                        return Padding(
                          padding: const EdgeInsets.all(AppSpacing.s4),
                          child: Text(
                              'No setups above 65% win rate today',
                              style: AppTypography.xs
                                  .copyWith(color: c.textMuted)),
                        );
                      }
                      return Column(
                        children: [
                          ...resp.setups.map((s) => SetupRow(
                                setup: s,
                                version: widget.version,
                                type: widget.type,
                              )),
                          GestureDetector(
                            onTap: () => context.push(
                                '/trading/10x-backtest?version=${widget.version}&type=${widget.type}'),
                            child: Padding(
                              padding: const EdgeInsets.symmetric(
                                  horizontal: AppSpacing.s4,
                                  vertical: AppSpacing.s3),
                              child: Row(
                                mainAxisAlignment:
                                    MainAxisAlignment.center,
                                children: [
                                  Text('View Backtest History',
                                      style: AppTypography.xs
                                          .copyWith(color: c.accent)),
                                  const SizedBox(width: 4),
                                  Icon(Icons.arrow_forward_rounded,
                                      size: 12, color: c.accent),
                                ],
                              ),
                            ),
                          ),
                        ],
                      );
                    },
                  ),
          ),
        ],
      ),
    );
  }
}

// ── Version Dot ───────────────────────────────────────────────────────────────

class VersionDot extends StatelessWidget {
  const VersionDot(
      {super.key, required this.label, required this.active, required this.c});
  final String label;
  final bool active;
  final AppPalette c;

  @override
  Widget build(BuildContext context) {
    return Text(
      label,
      style: AppTypography.xs.copyWith(
        color: active ? c.accent : c.textMuted,
        fontWeight: active ? FontWeight.w700 : FontWeight.w400,
      ),
    );
  }
}

// ── Locked / Loading Bodies ──────────────────────────────────────────────────

class BestSetupsLockedBody extends StatelessWidget {
  const BestSetupsLockedBody(
      {super.key, required this.c, required this.context});
  final AppPalette c;
  final BuildContext context;

  @override
  Widget build(BuildContext ctx) {
    return Padding(
      padding: const EdgeInsets.all(AppSpacing.s4),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  height: 10,
                  width: 180,
                  decoration: BoxDecoration(
                    color: c.border,
                    borderRadius: BorderRadius.circular(AppRadius.xs),
                  ),
                ),
                const SizedBox(height: AppSpacing.s2),
                Container(
                  height: 10,
                  width: 120,
                  decoration: BoxDecoration(
                    color: c.border,
                    borderRadius: BorderRadius.circular(AppRadius.xs),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: AppSpacing.s3),
          GestureDetector(
            onTap: () => UpgradeSheet.show(context, feature: 'best_setups'),
            child: Container(
              padding: const EdgeInsets.symmetric(
                  horizontal: AppSpacing.s4, vertical: AppSpacing.s2),
              decoration: BoxDecoration(
                color: c.accent,
                borderRadius: BorderRadius.circular(AppRadius.full),
              ),
              child: Text('Upgrade to Pro',
                  style: AppTypography.xs.copyWith(
                      color: Colors.black, fontWeight: FontWeight.w700)),
            ),
          ),
        ],
      ),
    );
  }
}

class BestSetupsLoadingBody extends StatelessWidget {
  const BestSetupsLoadingBody({super.key, required this.c});
  final AppPalette c;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(AppSpacing.s4),
      child: Row(
        children: [
          SizedBox(
              width: 14,
              height: 14,
              child: CircularProgressIndicator(
                  strokeWidth: 1.5, color: c.textMuted)),
          const SizedBox(width: AppSpacing.s3),
          Text("Checking today's setups…",
              style: AppTypography.xs.copyWith(color: c.textMuted)),
        ],
      ),
    );
  }
}

// ── Setup Row ────────────────────────────────────────────────────────────────

TextSpan wrSpan(String label, double rate, AppPalette c,
    {bool muted = false}) {
  final color = muted
      ? c.textFaint
      : rate >= 70
          ? c.positive
          : rate >= 55
              ? c.warning
              : c.danger;
  return TextSpan(
    text: '$label ${rate.toStringAsFixed(0)}%',
    style: AppTypography.xs
        .copyWith(color: color, fontWeight: FontWeight.w600),
  );
}

TextSpan dotSep(AppPalette c) => TextSpan(
    text: ' · ',
    style: AppTypography.xs.copyWith(color: c.textFaint));

class SetupRow extends StatelessWidget {
  const SetupRow(
      {super.key,
      required this.setup,
      required this.version,
      required this.type});
  final BestSetup setup;
  final String version;
  final String type;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return GestureDetector(
      onTap: () =>
          context.push('/trading/10x-backtest?version=$version&type=$type'),
      child: Container(
        decoration: BoxDecoration(
          border: Border(top: BorderSide(color: c.border)),
        ),
        padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.s4, vertical: AppSpacing.s3),
        child: Row(
          children: [
            Text(setup.flag, style: const TextStyle(fontSize: 18)),
            const SizedBox(width: AppSpacing.s3),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(setup.name,
                      style: AppTypography.labelSm
                          .copyWith(color: c.textPrimary),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis),
                  Row(
                    children: List.generate(4, (i) {
                      return Padding(
                        padding: const EdgeInsets.only(right: 2),
                        child: Container(
                          width: 6,
                          height: 6,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            color: i < setup.signalsActive
                                ? c.accent
                                : c.border,
                          ),
                        ),
                      );
                    })
                      ..add(Padding(
                        padding: const EdgeInsets.only(left: 4),
                        child: Text(
                          '${setup.signalsActive} signal${setup.signalsActive == 1 ? '' : 's'}',
                          style: AppTypography.xs
                              .copyWith(color: c.textMuted),
                        ),
                      )),
                  ),
                ],
              ),
            ),
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                RichText(
                  text: TextSpan(children: [
                    wrSpan('1m', setup.winRate1m, c),
                    dotSep(c),
                    wrSpan('3m', setup.winRate3m, c),
                    dotSep(c),
                    wrSpan('1y', setup.winRate1y, c),
                    if (setup.sampleSize3y > 0) ...[
                      dotSep(c),
                      wrSpan('3y', setup.winRate3y, c,
                          muted: setup.sampleSize3y < 10),
                    ],
                  ]),
                ),
                Text(
                  'Avg ${setup.avgReturn3m >= 0 ? '+' : ''}${setup.avgReturn3m.toStringAsFixed(1)}% 3m',
                  style: AppTypography.xs.copyWith(color: c.textMuted),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

// ── Best Setups Info Sheet ───────────────────────────────────────────────────

void showBestSetupsInfo(BuildContext context) {
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
      maxChildSize: 0.95,
      builder: (ctx, scrollController) => ListView(
        controller: scrollController,
        padding: EdgeInsets.fromLTRB(AppSpacing.s5, AppSpacing.s5,
            AppSpacing.s5, AppSpacing.s8 + MediaQuery.of(ctx).padding.bottom),
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
              Icon(Icons.bolt_rounded, size: 18, color: c.warning),
              const SizedBox(width: AppSpacing.s2),
              Expanded(
                child: Text('Best Setups Right Now',
                    style: AppTypography.headingMd
                        .copyWith(color: c.textPrimary)),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.s3),
          Text(
            'Surfaces assets that have at least one signal firing today and a historical 1-month win rate of ≥65% when that exact number of signals were active — ranked best-to-worst.',
            style: AppTypography.sm
                .copyWith(color: c.textSecondary, height: 1.55),
          ),
          const SizedBox(height: AppSpacing.s5),
          Text('How to read each row',
              style: AppTypography.headingSm.copyWith(color: c.textPrimary)),
          const SizedBox(height: AppSpacing.s4),
          BestSetupsInfoRow(
            c: c,
            label: '1m / 3m / 1y',
            body: 'Historical win rate over those periods when the same number of signals were active. '
                'Green = ≥65%, orange = 50–64%, red = below 50%.',
          ),
          const SizedBox(height: AppSpacing.s4),
          BestSetupsInfoRow(
            c: c,
            label: 'Signal dots',
            body: 'Filled green dots = active signals right now (Volume Spike, Heartbeat, Record Quarter, Trend). '
                'More dots = stronger confluence.',
          ),
          const SizedBox(height: AppSpacing.s4),
          BestSetupsInfoRow(
            c: c,
            label: 'Avg +X% 3m',
            body: 'Average price return 3 months after previous setups with this many signals fired. '
                'Positive means past occurrences were profitable on average.',
          ),
          const SizedBox(height: AppSpacing.s5),
          Container(
            padding: const EdgeInsets.all(AppSpacing.s4),
            decoration: BoxDecoration(
              color: c.accent.withAlpha(12),
              borderRadius: BorderRadius.circular(AppRadius.sm),
              border: Border.all(color: c.accent.withAlpha(40)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('v1 vs v2',
                    style: AppTypography.labelSm
                        .copyWith(color: c.accent, fontWeight: FontWeight.w700)),
                const SizedBox(height: 4),
                Text(
                  'v1 uses stricter accumulation rules (< 30% range over 2 years, up to 3 signals).\n'
                  'v2 follows the Pine Script reference: ≤ 35% range over 200 bars, confirmed breakout above the 50-bar high, and adds a 4th Trend signal.\n\n'
                  'Use v2 for assets closer to a confirmed breakout; v1 for early accumulation.',
                  style: AppTypography.xs
                      .copyWith(color: c.textSecondary, height: 1.55),
                ),
              ],
            ),
          ),
          const SizedBox(height: AppSpacing.s5),
          Container(
            padding: const EdgeInsets.all(AppSpacing.s4),
            decoration: BoxDecoration(
              color: c.warning.withAlpha(15),
              borderRadius: BorderRadius.circular(AppRadius.sm),
              border: Border.all(color: c.warning.withAlpha(50)),
            ),
            child: Text(
              'Past win rates are based on historical backtest data and do not guarantee future results. '
              'Always use your own analysis and risk management.',
              style: AppTypography.xs
                  .copyWith(color: c.textSecondary, height: 1.55),
            ),
          ),
        ],
      ),
    ),
  );
}

class BestSetupsInfoRow extends StatelessWidget {
  const BestSetupsInfoRow(
      {super.key,
      required this.c,
      required this.label,
      required this.body});
  final AppPalette c;
  final String label;
  final String body;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          padding:
              const EdgeInsets.symmetric(horizontal: AppSpacing.s3, vertical: 3),
          decoration: BoxDecoration(
            color: c.surfaceCard,
            borderRadius: BorderRadius.circular(AppRadius.xs),
            border: Border.all(color: c.border),
          ),
          child: Text(label,
              style: AppTypography.xs.copyWith(
                  color: c.textPrimary, fontWeight: FontWeight.w600)),
        ),
        const SizedBox(width: AppSpacing.s3),
        Expanded(
          child: Text(body,
              style: AppTypography.xs
                  .copyWith(color: c.textSecondary, height: 1.55)),
        ),
      ],
    );
  }
}
