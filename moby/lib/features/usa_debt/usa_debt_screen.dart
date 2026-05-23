import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/theme/app_palette.dart';
import '../../core/theme/app_typography.dart';
import '../../data/repositories/debt_repository.dart';
import '../../shared/widgets/error_view.dart';
import '../../shared/widgets/max_width_layout.dart';

// ── Provider ──────────────────────────────────────────────────────────────────

final _debtProvider = FutureProvider.autoDispose<Map<String, dynamic>>(
    (_) => DebtRepository.instance.fetchDebt());

// ── Data Model ────────────────────────────────────────────────────────────────

class _Stat {
  const _Stat({
    required this.id,
    required this.label,
    required this.value,
    required this.explanation,
    required this.category,
    required this.icon,
  });
  final String id;
  final String label;
  final String value;
  final String explanation;
  final String category;
  final IconData icon;

  _Stat withValue(String v) => _Stat(
      id: id,
      label: label,
      value: v,
      explanation: explanation,
      category: category,
      icon: icon);
}

// ── Static Debt Data ──────────────────────────────────────────────────────────

// ignore_for_file: unnecessary_string_escape
final _kStats = <_Stat>[
  // Big Picture
  _Stat(
      id: 'national_debt_total',
      label: 'National Debt',
      value: r'$36.2 Trillion',
      explanation:
          "If you stacked \$1 bills, the pile would reach the moon and back over 4,800 times.",
      category: 'big_picture',
      icon: Icons.trending_up),
  _Stat(
      id: 'debt_to_gdp',
      label: 'Debt-to-GDP Ratio',
      value: '124%',
      explanation:
          "The government owes more than the entire country produces in a year -- like owing \$124,000 on a \$100,000 salary.",
      category: 'big_picture',
      icon: Icons.pie_chart),
  _Stat(
      id: 'annual_deficit',
      label: 'Annual Deficit',
      value: r'$1.83 Trillion',
      explanation:
          "Each year the government spends \$1.83 trillion more than it collects in taxes. That gap becomes new debt.",
      category: 'big_picture',
      icon: Icons.arrow_circle_down),
  _Stat(
      id: 'interest_payments',
      label: 'Interest Payments',
      value: r'$1.1 Trillion/yr',
      explanation:
          "The government pays over \$1 trillion a year just in interest -- more than the entire defense budget.",
      category: 'big_picture',
      icon: Icons.percent),
  _Stat(
      id: 'historical_growth',
      label: 'Debt Growth (20 Years)',
      value: r'+$28 Trillion',
      explanation:
          "In 2005 the national debt was \$8 trillion. It has more than quadrupled in 20 years, accelerated by wars, tax cuts, and stimulus.",
      category: 'big_picture',
      icon: Icons.show_chart),
  // Personal
  _Stat(
      id: 'debt_per_citizen',
      label: 'Debt Per Citizen',
      value: r'$108,200',
      explanation:
          "If split equally among every American -- babies included -- each share is over \$108,000.",
      category: 'personal',
      icon: Icons.person),
  _Stat(
      id: 'debt_per_taxpayer',
      label: 'Debt Per Taxpayer',
      value: r'$241,000',
      explanation:
          "Only about half of Americans pay federal income tax, so each taxpayer's share is ~\$241,000 -- a second mortgage you never signed.",
      category: 'personal',
      icon: Icons.group),
  _Stat(
      id: 'revenue_vs_spending',
      label: 'Revenue vs. Spending',
      value: r'$4.9T in / $6.7T out',
      explanation:
          "The government collects \$4.9T in taxes but spends \$6.7T. Like earning \$4,900/month but spending \$6,700.",
      category: 'personal',
      icon: Icons.credit_card),
  _Stat(
      id: 'ss_obligations',
      label: 'Social Security Unfunded',
      value: r'$22.4 Trillion',
      explanation:
          "The government has promised \$22.4 trillion more in Social Security than it expects to collect. Benefits could be cut around 2035 without changes.",
      category: 'personal',
      icon: Icons.shield),
  _Stat(
      id: 'medicare_obligations',
      label: 'Medicare Unfunded',
      value: r'$48.3 Trillion',
      explanation:
          "Medicare's future promises exceed expected revenue by \$48.3 trillion -- the biggest long-term financial challenge.",
      category: 'personal',
      icon: Icons.favorite),
  // Foreign Holders
  _Stat(
      id: 'japan_holdings',
      label: 'Japan',
      value: r'$1,079B',
      explanation:
          "Japan is the #1 foreign holder of U.S. debt. They buy Treasury bonds as safe reserve investments.",
      category: 'foreign_holders',
      icon: Icons.language),
  _Stat(
      id: 'china_holdings',
      label: 'China',
      value: r'$759B',
      explanation:
          "China used to be #1 but has been selling off U.S. debt. They still hold \$759B, giving some leverage in trade disputes.",
      category: 'foreign_holders',
      icon: Icons.language),
  _Stat(
      id: 'uk_holdings',
      label: 'United Kingdom',
      value: r'$723B',
      explanation:
          "The UK is the 2nd largest holder, largely through London's role as a global financial hub.",
      category: 'foreign_holders',
      icon: Icons.language),
  _Stat(
      id: 'canada_holdings',
      label: 'Canada',
      value: r'$254B',
      explanation:
          "As America's largest trading partner, Canada keeps large U.S. dollar reserves.",
      category: 'foreign_holders',
      icon: Icons.language),
  _Stat(
      id: 'india_holdings',
      label: 'India',
      value: r'$234B',
      explanation:
          "India has been rapidly increasing its U.S. debt holdings as its economy grows and builds foreign reserves.",
      category: 'foreign_holders',
      icon: Icons.language),
  _Stat(
      id: 'total_foreign',
      label: 'Total Foreign-Held',
      value: r'$8.5 Trillion',
      explanation:
          "About 24% of U.S. debt is foreign-held. The rest is owned by Americans, U.S. institutions, and the Federal Reserve.",
      category: 'foreign_holders',
      icon: Icons.public),
  // Spending
  _Stat(
      id: 'social_security_spending',
      label: 'Social Security',
      value: r'$1.46 Trillion',
      explanation:
          "The single biggest expense -- retirement and disability payments to 67 million Americans, about 22% of all federal spending.",
      category: 'spending',
      icon: Icons.elderly),
  _Stat(
      id: 'medicare_medicaid',
      label: 'Medicare & Medicaid',
      value: r'$1.68 Trillion',
      explanation:
          "Government healthcare for seniors, low-income families, and disabled people. The fastest-growing federal expense.",
      category: 'spending',
      icon: Icons.medical_services),
  _Stat(
      id: 'defense_spending',
      label: 'Defense',
      value: r'$886 Billion',
      explanation:
          "The U.S. military budget exceeds the next 10 countries combined. Covers troops, equipment, veterans, and 750+ bases worldwide.",
      category: 'spending',
      icon: Icons.security),
  _Stat(
      id: 'interest_spending',
      label: 'Net Interest',
      value: r'$1.1 Trillion',
      explanation:
          "Every dollar spent on debt interest can't go to roads, schools, or defense. Now rivals the biggest line items.",
      category: 'spending',
      icon: Icons.attach_money),
  _Stat(
      id: 'everything_else',
      label: 'Everything Else',
      value: r'$1.6 Trillion',
      explanation:
          "Education, infrastructure, science, foreign aid, courts, NASA -- everything that isn't healthcare, Social Security, defense, or interest.",
      category: 'spending',
      icon: Icons.layers),
];

// ── Category Config ───────────────────────────────────────────────────────────

typedef _CatCfg = ({
  Color accent,
  Color bg,
  IconData icon,
  String title,
  String subtitle
});

const _kCats = <String, _CatCfg>{
  'big_picture': (
    accent: Color(0xFF00D4AA),
    bg: Color(0x1400D4AA),
    icon: Icons.trending_up,
    title: 'The Big Picture',
    subtitle: 'Understanding America\'s national debt at a glance',
  ),
  'personal': (
    accent: Color(0xFFFF9F43),
    bg: Color(0x14FF9F43),
    icon: Icons.person,
    title: 'What It Means For You',
    subtitle: 'How the debt breaks down for everyday Americans',
  ),
  'foreign_holders': (
    accent: Color(0xFF5B8DEF),
    bg: Color(0x145B8DEF),
    icon: Icons.language,
    title: 'Who Owns Our Debt',
    subtitle: 'The biggest foreign holders of U.S. Treasury securities · 2024 data',
  ),
  'spending': (
    accent: Color(0xFFA78BFA),
    bg: Color(0x14A78BFA),
    icon: Icons.pie_chart,
    title: 'Where The Money Goes',
    subtitle: 'Federal spending breakdown — fiscal year 2024',
  ),
};

const _kTabOrder = <(String, String)>[
  ('big_picture', 'Overview'),
  ('personal', 'For You'),
  ('foreign_holders', 'Holders'),
  ('spending', 'Spending'),
];

// ── Live Data Override ────────────────────────────────────────────────────────

List<_Stat> _applyLiveData(Map<String, dynamic> live) {
  final fh = live['foreignHolders'] as Map<String, dynamic>? ?? {};
  final sp = live['spending'] as Map<String, dynamic>? ?? {};
  final overrides = <String, String>{
    'national_debt_total':      live['totalDebtFormatted'] as String? ?? '',
    'debt_to_gdp':              live['debtToGdpRatio']     as String? ?? '',
    'annual_deficit':           live['annualDeficit']      as String? ?? '',
    'interest_payments':        live['interestPayments']   as String? ?? '',
    'historical_growth':        live['debtGrowth20yr']     as String? ?? '',
    'debt_per_citizen':         live['debtPerCitizen']     as String? ?? '',
    'debt_per_taxpayer':        live['debtPerTaxpayer']    as String? ?? '',
    'revenue_vs_spending':      live['revenueVsSpending']  as String? ?? '',
    'ss_obligations':           live['ssUnfunded']         as String? ?? '',
    'medicare_obligations':     live['medicareUnfunded']   as String? ?? '',
    'japan_holdings':           fh['japan']                as String? ?? '',
    'china_holdings':           fh['china']                as String? ?? '',
    'uk_holdings':              fh['uk']                   as String? ?? '',
    'canada_holdings':          fh['canada']               as String? ?? '',
    'india_holdings':           fh['india']                as String? ?? '',
    'total_foreign':            fh['totalForeign']         as String? ?? '',
    'social_security_spending': sp['socialSecurity']       as String? ?? '',
    'medicare_medicaid':        sp['medicareMedicaid']     as String? ?? '',
    'defense_spending':         sp['defense']              as String? ?? '',
    'interest_spending':        sp['netInterest']          as String? ?? '',
    'everything_else':          sp['everythingElse']       as String? ?? '',
  };
  return _kStats.map((s) {
    final v = overrides[s.id];
    return (v != null && v.isNotEmpty) ? s.withValue(v) : s;
  }).toList();
}

// ── Screen ────────────────────────────────────────────────────────────────────

class UsaDebtScreen extends ConsumerStatefulWidget {
  const UsaDebtScreen({super.key});

  @override
  ConsumerState<UsaDebtScreen> createState() => _UsaDebtScreenState();
}

class _UsaDebtScreenState extends ConsumerState<UsaDebtScreen> {
  String _activeCategory = 'big_picture';

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final async = ref.watch(_debtProvider);
    final topPad = MediaQuery.of(context).padding.top;

    return Scaffold(
      backgroundColor: c.background,
      body: Stack(
        children: [
          async.when(
        loading: () =>
            Center(child: CircularProgressIndicator(color: c.accent)),
        error: (_, __) => ErrorView(
          message: 'Failed to load US debt data',
          onRetry: () => ref.invalidate(_debtProvider),
        ),
        data: (live) {
          final stats = _applyLiveData(live);
          final heroValue =
              live['totalDebtFormatted'] as String? ?? r'$36.2T';
          final dailyIncrease =
              live['dailyIncrease'] as String? ?? r'$4.8 Billion';
          final recordDate = live['recordDate'] as String? ?? '';
          final activeStats =
              stats.where((s) => s.category == _activeCategory).toList();
          final cat = _kCats[_activeCategory]!;

          return RefreshIndicator(
            color: c.accent,
            backgroundColor: c.surface,
            onRefresh: () => ref.refresh(_debtProvider.future),
            child: MaxWidthLayout(
              child: ListView(
              padding: EdgeInsets.fromLTRB(14, topPad + 8, 14, 40),
              children: [
                _HeroSection(
                  heroValue: heroValue,
                  dailyIncrease: dailyIncrease,
                  recordDate: recordDate,
                ),
                const SizedBox(height: 16),
                _TabRow(
                  active: _activeCategory,
                  onSelect: (cat2) => setState(() => _activeCategory = cat2),
                ),
                const SizedBox(height: 14),
                _CatHeader(cat: cat),
                const SizedBox(height: 14),
                if (_activeCategory == 'spending')
                  _SpendingBar(items: activeStats),
                if (_activeCategory == 'foreign_holders')
                  _ForeignHoldersBar(items: activeStats),
                ...activeStats.map(
                    (s) => _StatCard(stat: s, accentColor: cat.accent)),
                const SizedBox(height: 12),
                _Footer(recordDate: recordDate),
              ],
            ),
            ),
          );
        },
      ),
        ],
      ),
    );
  }
}

// ── Hero Section ──────────────────────────────────────────────────────────────

class _HeroSection extends StatelessWidget {
  const _HeroSection({
    required this.heroValue,
    required this.dailyIncrease,
    required this.recordDate,
  });
  final String heroValue;
  final String dailyIncrease;
  final String recordDate;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Container(
      decoration: BoxDecoration(
        color: c.surface,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: c.danger.withAlpha(51)),
      ),
      clipBehavior: Clip.hardEdge,
      child: Stack(
        children: [
          Positioned.fill(
            child: DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [
                    c.danger.withAlpha(46),
                    Colors.transparent,
                  ],
                ),
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 20, 16, 20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Live badge
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
                  decoration: BoxDecoration(
                    color: c.accentDim,
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(
                        color: c.accent.withAlpha(64)),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Container(
                        width: 5,
                        height: 5,
                        decoration: BoxDecoration(
                            color: c.accent,
                            shape: BoxShape.circle),
                      ),
                      const SizedBox(width: 5),
                      Text(
                        'LIVE  U.S. TREASURY',
                        style: AppTypography.xs.copyWith(
                          color: c.accent,
                          fontWeight: FontWeight.w700,
                          letterSpacing: 1.2,
                          fontSize: 9,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 10),
                Text(
                  'NATIONAL DEBT',
                  style: AppTypography.xs.copyWith(
                    color: c.danger,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 3,
                    fontSize: 11,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  heroValue,
                  style: TextStyle(
                    fontFamily: 'Inter',
                    fontSize: 48,
                    fontWeight: FontWeight.w800,
                    color: c.textPrimary,
                    letterSpacing: -2.5,
                    height: 1.0,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  'and counting…',
                  style: AppTypography.lg.copyWith(
                    color: c.textSecondary,
                    fontStyle: FontStyle.italic,
                  ),
                ),
                const SizedBox(height: 16),
                Row(
                  children: [
                    Expanded(
                      child: _HeroStatCard(
                        icon: Icons.access_time,
                        iconColor: c.danger,
                        bg: c.danger.withAlpha(30),
                        borderColor: c.danger.withAlpha(51),
                        value: '~$dailyIncrease/day',
                        valueColor: c.danger,
                        label: 'Daily Growth',
                      ),
                    ),
                    if (recordDate.isNotEmpty) ...[
                      const SizedBox(width: 10),
                      Expanded(
                        child: _HeroStatCard(
                          icon: Icons.calendar_today,
                          iconColor: c.accent,
                          bg: c.accentDim,
                          borderColor: c.accent.withAlpha(41),
                          value: recordDate,
                          valueColor: c.accent,
                          label: 'Last Updated',
                        ),
                      ),
                    ],
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _HeroStatCard extends StatelessWidget {
  const _HeroStatCard({
    required this.icon,
    required this.iconColor,
    required this.bg,
    required this.borderColor,
    required this.value,
    required this.valueColor,
    required this.label,
  });
  final IconData icon;
  final Color iconColor, bg, borderColor, valueColor;
  final String value, label;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: borderColor),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, color: iconColor, size: 13),
          const SizedBox(height: 3),
          Text(value,
              style: AppTypography.sm
                  .copyWith(color: valueColor, fontWeight: FontWeight.w700)),
          Text(label,
              style:
                  AppTypography.xs.copyWith(color: c.textMuted)),
        ],
      ),
    );
  }
}

// ── Tab Row ───────────────────────────────────────────────────────────────────

class _TabRow extends StatelessWidget {
  const _TabRow({required this.active, required this.onSelect});
  final String active;
  final ValueChanged<String> onSelect;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Row(
      children: _kTabOrder.asMap().entries.map((entry) {
        final idx = entry.key;
        final (key, label) = entry.value;
        final isActive = key == active;
        final cat = _kCats[key]!;
        return Expanded(
          child: GestureDetector(
            onTap: () => onSelect(key),
            child: Container(
              margin: EdgeInsets.only(
                  right: idx < _kTabOrder.length - 1 ? 7 : 0),
              padding: const EdgeInsets.symmetric(vertical: 9),
              decoration: BoxDecoration(
                color: isActive ? cat.accent.withAlpha(34) : c.surface,
                borderRadius: BorderRadius.circular(10),
                border: Border.all(
                  color: isActive
                      ? cat.accent.withAlpha(85)
                      : c.border,
                ),
              ),
              child: Text(
                label,
                textAlign: TextAlign.center,
                style: AppTypography.sm.copyWith(
                  color: isActive ? cat.accent : c.textMuted,
                  fontWeight: FontWeight.w600,
                  letterSpacing: 0.2,
                ),
              ),
            ),
          ),
        );
      }).toList(),
    );
  }
}

// ── Category Header ───────────────────────────────────────────────────────────

class _CatHeader extends StatelessWidget {
  const _CatHeader({required this.cat});
  final _CatCfg cat;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: cat.bg,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: cat.accent.withAlpha(48)),
      ),
      child: Row(
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: cat.accent.withAlpha(34),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Icon(cat.icon, color: cat.accent, size: 20),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(cat.title,
                    style: AppTypography.xl.copyWith(
                        color: cat.accent, fontWeight: FontWeight.w700)),
                const SizedBox(height: 2),
                Text(cat.subtitle,
                    style: AppTypography.sm
                        .copyWith(color: c.textSecondary)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// ── Spending Bar ──────────────────────────────────────────────────────────────

class _SpendingBar extends StatelessWidget {
  const _SpendingBar({required this.items});
  final List<_Stat> items;

  static const _colors = [
    Color(0xFFA78BFA),
    Color(0xFF5B8DEF),
    Color(0xFFFF6B6B),
    Color(0xFFFF9F43),
    Color(0xFF00D4AA),
  ];

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Container(
      padding: const EdgeInsets.all(14),
      margin: const EdgeInsets.only(bottom: 14),
      decoration: BoxDecoration(
        color: c.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: c.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(5),
            child: SizedBox(
              height: 10,
              child: Row(
                children: items.asMap().entries.map((e) {
                  final color = _colors[e.key % _colors.length];
                  return Expanded(
                    child: Container(
                      margin: EdgeInsets.only(
                          right: e.key < items.length - 1 ? 2 : 0),
                      color: color,
                    ),
                  );
                }).toList(),
              ),
            ),
          ),
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            runSpacing: 6,
            children: items.asMap().entries.map((e) {
              final color = _colors[e.key % _colors.length];
              final label = e.value.label
                  .replaceAll('Medicare & Medicaid', 'Medicare');
              return Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Container(
                    width: 8,
                    height: 8,
                    decoration:
                        BoxDecoration(color: color, shape: BoxShape.circle),
                  ),
                  const SizedBox(width: 5),
                  Text(label,
                      style: AppTypography.xs
                          .copyWith(color: c.textMuted)),
                ],
              );
            }).toList(),
          ),
        ],
      ),
    );
  }
}

// ── Foreign Holders Bar ───────────────────────────────────────────────────────

class _ForeignHoldersBar extends StatelessWidget {
  const _ForeignHoldersBar({required this.items});
  final List<_Stat> items;

  static const _colors = [
    Color(0xFFFF9F43),
    Color(0xFFFF6B6B),
    Color(0xFF5B8DEF),
    Color(0xFF00D4AA),
    Color(0xFFA78BFA),
  ];

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final mainItems =
        items.where((i) => i.id != 'total_foreign').toList();
    return Container(
      padding: const EdgeInsets.all(14),
      margin: const EdgeInsets.only(bottom: 14),
      decoration: BoxDecoration(
        color: c.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: c.border),
      ),
      child: Column(
        children: mainItems.asMap().entries.map((e) {
          final color = _colors[e.key % _colors.length];
          return Padding(
            padding:
                EdgeInsets.only(bottom: e.key < mainItems.length - 1 ? 10 : 0),
            child: Row(
              children: [
                Container(
                  width: 10,
                  height: 10,
                  decoration:
                      BoxDecoration(color: color, shape: BoxShape.circle),
                ),
                const SizedBox(width: 8),
                Expanded(
                    child: Text(e.value.label,
                        style: AppTypography.labelMd.copyWith(color: c.textPrimary))),
                Text(e.value.value,
                    style: AppTypography.labelMd.copyWith(
                        color: color, fontWeight: FontWeight.w700)),
              ],
            ),
          );
        }).toList(),
      ),
    );
  }
}

// ── Stat Card ─────────────────────────────────────────────────────────────────

class _StatCard extends StatelessWidget {
  const _StatCard({required this.stat, required this.accentColor});
  final _Stat stat;
  final Color accentColor;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: c.surfaceCard,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: c.border, width: 0.5),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 36,
                height: 36,
                decoration: BoxDecoration(
                  color: accentColor.withAlpha(34),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Icon(stat.icon, color: accentColor, size: 17),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      stat.label.toUpperCase(),
                      style: AppTypography.xs.copyWith(
                        color: c.textSecondary,
                        letterSpacing: 0.5,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                    Text(
                      stat.value,
                      style: AppTypography.xl2.copyWith(
                        color: c.textPrimary,
                        fontWeight: FontWeight.w700,
                        letterSpacing: -0.5,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Text(
            stat.explanation,
            style: AppTypography.md
                .copyWith(color: c.textSecondary, height: 1.5),
          ),
        ],
      ),
    );
  }
}

// ── Footer ────────────────────────────────────────────────────────────────────

class _Footer extends StatelessWidget {
  const _Footer({required this.recordDate});
  final String recordDate;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final text = recordDate.isNotEmpty
        ? 'Live data from U.S. Treasury ($recordDate). Other figures from CBO & Federal Reserve.'
        : 'Data based on U.S. Treasury, CBO, and Federal Reserve reports.';
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 20),
      child: Text(
        text,
        textAlign: TextAlign.center,
        style: AppTypography.xs.copyWith(color: c.textMuted, height: 1.5),
      ),
    );
  }
}
