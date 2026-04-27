import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Platform,
  ActivityIndicator,
  Pressable,
} from "react-native";
import { a11yTab } from "@/utils/accessibility";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather, Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useQuery } from "@tanstack/react-query";
import Colors from "@/constants/colors";
import { useColors } from "@/hooks/useColors";
import { usaDebtData, categoryInfo, categoryOrder, DebtStat } from "@/data/usa-debt";

interface DebtApiResponse {
  recordDate: string;
  totalDebt: number;
  totalDebtFormatted: string;
  debtPerCitizen: string;
  debtPerTaxpayer: string;
  debtToGdpRatio: string;
  dailyIncrease: string;
  annualDeficit: string;
  interestPayments: string;
  debtGrowth20yr: string;
  revenueVsSpending: string;
  ssUnfunded: string;
  medicareUnfunded: string;
  foreignHolders: {
    japan: string;
    china: string;
    uk: string;
    canada: string;
    india: string;
    totalForeign: string;
  };
  spending: {
    socialSecurity: string;
    medicareMedicaid: string;
    defense: string;
    netInterest: string;
    everythingElse: string;
  };
}

const CATEGORY_COLORS: Record<DebtStat["category"], { accent: string; bg: string; icon: string }> = {
  big_picture: {
    accent: "#00D4AA",
    bg: "rgba(0,212,170,0.08)",
    icon: "trending-up",
  },
  personal: {
    accent: "#FF9F43",
    bg: "rgba(255,159,67,0.08)",
    icon: "person",
  },
  foreign_holders: {
    accent: "#5B8DEF",
    bg: "rgba(91,141,239,0.08)",
    icon: "globe",
  },
  spending: {
    accent: "#A78BFA",
    bg: "rgba(167,139,250,0.08)",
    icon: "pie-chart",
  },
};

function applyLiveData(staticData: DebtStat[], live: DebtApiResponse): DebtStat[] {
  const overrides: Record<string, string> = {
    national_debt_total: live.totalDebtFormatted,
    debt_to_gdp: live.debtToGdpRatio,
    annual_deficit: live.annualDeficit,
    interest_payments: live.interestPayments,
    historical_growth: live.debtGrowth20yr,
    debt_per_citizen: live.debtPerCitizen,
    debt_per_taxpayer: live.debtPerTaxpayer,
    revenue_vs_spending: live.revenueVsSpending,
    ss_obligations: live.ssUnfunded,
    medicare_obligations: live.medicareUnfunded,
    japan_holdings: live.foreignHolders.japan,
    china_holdings: live.foreignHolders.china,
    uk_holdings: live.foreignHolders.uk,
    canada_holdings: live.foreignHolders.canada,
    india_holdings: live.foreignHolders.india,
    total_foreign: live.foreignHolders.totalForeign,
    social_security_spending: live.spending.socialSecurity,
    medicare_medicaid: live.spending.medicareMedicaid,
    defense_spending: live.spending.defense,
    interest_spending: live.spending.netInterest,
    everything_else: live.spending.everythingElse,
  };
  return staticData.map((stat) => {
    const override = overrides[stat.id];
    return override ? { ...stat, value: override } : stat;
  });
}

function StatCard({ stat, accentColor }: { stat: DebtStat; accentColor: string }) {
  const Colors = useColors();
  return (
    <View style={[styles.card, { borderColor: Colors.border, backgroundColor: Colors.surface }]}>
      <View style={styles.cardHeader}>
        <View style={[styles.iconContainer, { backgroundColor: accentColor + "22" }]}>
          <Feather name={stat.icon as any} size={17} color={accentColor} />
        </View>
        <View style={styles.cardHeaderText}>
          <Text style={[styles.cardLabel, { color: Colors.textSecondary }]}>{stat.label}</Text>
          <Text style={[styles.cardValue, { color: Colors.text }]}>{stat.value}</Text>
        </View>
      </View>
      <Text style={[styles.cardExplanation, { color: Colors.textSecondary }]}>
        {stat.laymanExplanation}
      </Text>
    </View>
  );
}

function SpendingBar({ items }: { items: DebtStat[] }) {
  const colors = ["#A78BFA", "#5B8DEF", "#FF6B6B", "#FF9F43", "#00D4AA"];
  return (
    <View style={styles.barContainer}>
      <View style={styles.barTrack}>
        {items.map((item, i) => (
          <View
            key={item.id}
            style={[styles.barSegment, { backgroundColor: colors[i % colors.length], flex: 1 }]}
          />
        ))}
      </View>
      <View style={styles.barLegend}>
        {items.map((item, i) => (
          <View key={item.id} style={styles.barLegendItem}>
            <View style={[styles.barDot, { backgroundColor: colors[i % colors.length] }]} />
            <Text style={[styles.barLegendLabel, { color: Colors.textMuted }]} numberOfLines={1}>
              {item.label.replace("Medicare & Medicaid", "Medicare")}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function ForeignHoldersBar({ items }: { items: DebtStat[] }) {
  const Colors = useColors();
  const mainItems = items.filter((i) => i.id !== "total_foreign");
  const colors = ["#FF9F43", "#FF6B6B", "#5B8DEF", "#00D4AA", "#A78BFA"];
  return (
    <View style={styles.holdersContainer}>
      {mainItems.map((item, i) => (
        <View key={item.id} style={styles.holderRow}>
          <View style={styles.holderLeft}>
            <View style={[styles.holderDot, { backgroundColor: colors[i % colors.length] }]} />
            <Text style={[styles.holderName, { color: Colors.text }]}>{item.label}</Text>
          </View>
          <Text style={[styles.holderValue, { color: colors[i % colors.length] }]}>{item.value}</Text>
        </View>
      ))}
    </View>
  );
}

type CategoryTab = DebtStat["category"];

const TAB_LABELS: { key: CategoryTab; short: string }[] = [
  { key: "big_picture", short: "Overview" },
  { key: "personal", short: "For You" },
  { key: "foreign_holders", short: "Holders" },
  { key: "spending", short: "Spending" },
];

export default function USADebtScreen() {
  const Colors = useColors();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const [activeCategory, setActiveCategory] = useState<CategoryTab>("big_picture");

  const { data: liveData, isLoading } = useQuery<DebtApiResponse>({
    queryKey: ["/api/usa-debt"],
    staleTime: 12 * 60 * 60 * 1000,
  });

  const displayData = liveData ? applyLiveData(usaDebtData, liveData) : usaDebtData;
  const heroValue = liveData?.totalDebtFormatted || "$36.2T";
  const heroDaily = liveData?.dailyIncrease || "$4.8 Billion";
  const recordDate = liveData?.recordDate || "";

  const activeItems = displayData.filter((d) => d.category === activeCategory);
  const catColors = CATEGORY_COLORS[activeCategory];
  const catInfo = categoryInfo[activeCategory];

  return (
    <View style={[styles.container, { backgroundColor: Colors.background }]}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: topPad + 8,
            paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 20),
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero Section */}
        <View style={styles.heroSection}>
          <LinearGradient
            colors={["rgba(255, 45, 85, 0.18)", "rgba(255, 45, 85, 0.0)"]}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.heroContent}>
            <View style={styles.heroTopRow}>
              <View style={styles.liveBadge}>
                <View style={styles.liveDot} />
                <Text style={styles.liveText}>LIVE · U.S. TREASURY</Text>
              </View>
            </View>
            <Text style={styles.heroLabel}>NATIONAL DEBT</Text>
            {isLoading ? (
              <ActivityIndicator size="small" color={Colors.danger} style={{ marginVertical: 18 }} />
            ) : (
              <Text style={styles.heroValue}>{heroValue}</Text>
            )}
            <Text style={styles.heroSubtext}>and counting…</Text>

            <View style={styles.heroStatsRow}>
              <View style={[styles.heroStat, { backgroundColor: "rgba(255,45,85,0.12)", borderColor: "rgba(255,45,85,0.2)" }]}>
                <Feather name="clock" size={13} color={Colors.danger} />
                <Text style={[styles.heroStatValue, { color: Colors.danger }]}>~{heroDaily}/day</Text>
                <Text style={styles.heroStatLabel}>Daily Growth</Text>
              </View>
              {recordDate ? (
                <View style={[styles.heroStat, { backgroundColor: "rgba(0,212,170,0.08)", borderColor: "rgba(0,212,170,0.16)" }]}>
                  <Ionicons name="calendar-outline" size={13} color={Colors.accent} />
                  <Text style={[styles.heroStatValue, { color: Colors.accent }]}>{recordDate}</Text>
                  <Text style={styles.heroStatLabel}>Last Updated</Text>
                </View>
              ) : null}
            </View>
          </View>
        </View>

        {/* Category Tabs */}
        <View style={styles.tabRow}>
          {TAB_LABELS.map((tab) => {
            const active = activeCategory === tab.key;
            const tc = CATEGORY_COLORS[tab.key];
            return (
              <Pressable
                key={tab.key}
                onPress={() => setActiveCategory(tab.key)}
                {...a11yTab(tab.short, active)}
                style={[
                  styles.tab,
                  active
                    ? { backgroundColor: tc.accent + "22", borderColor: tc.accent + "55" }
                    : { backgroundColor: Colors.surface, borderColor: Colors.border },
                ]}
              >
                <Text
                  style={[
                    styles.tabText,
                    { color: active ? tc.accent : Colors.textMuted },
                  ]}
                >
                  {tab.short}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Category Header */}
        <View style={[styles.catHeader, { backgroundColor: catColors.bg, borderColor: catColors.accent + "30" }]}>
          <View style={[styles.catIconWrap, { backgroundColor: catColors.accent + "22" }]}>
            <Ionicons name={catColors.icon as any} size={20} color={catColors.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.catTitle, { color: catColors.accent }]}>{catInfo.title}</Text>
            <Text style={[styles.catSubtitle, { color: Colors.textSecondary }]}>{catInfo.subtitle}</Text>
          </View>
        </View>

        {/* Special visualizations */}
        {activeCategory === "spending" && (
          <SpendingBar items={activeItems} />
        )}
        {activeCategory === "foreign_holders" && (
          <ForeignHoldersBar items={activeItems} />
        )}

        {/* Cards */}
        {activeItems.map((stat) => (
          <StatCard key={stat.id} stat={stat} accentColor={catColors.accent} />
        ))}

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            {liveData
              ? `Live data from U.S. Treasury (${recordDate}). Other figures from CBO & Federal Reserve.`
              : "Data based on U.S. Treasury, CBO, and Federal Reserve reports — April 2025."}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: { flex: 1 },
  content: { paddingHorizontal: 14 },

  heroSection: {
    marginBottom: 20,
    borderRadius: 20,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,45,85,0.2)",
    backgroundColor: Colors.surface,
  },
  heroContent: {
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 20,
  },
  heroTopRow: {
    width: "100%",
    marginBottom: 10,
  },
  liveBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    alignSelf: "flex-start",
    backgroundColor: "rgba(0,212,170,0.10)",
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 0.5,
    borderColor: "rgba(0,212,170,0.25)",
  },
  liveDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: Colors.accent,
  },
  liveText: {
    fontFamily: "Inter_700Bold",
    fontSize: 9,
    letterSpacing: 1.2,
    color: Colors.accent,
  },
  heroLabel: {
    fontFamily: "Inter_700Bold",
    fontSize: 11,
    letterSpacing: 3,
    color: Colors.danger,
    marginBottom: 4,
  },
  heroValue: {
    fontFamily: "Inter_700Bold",
    fontSize: 48,
    color: Colors.text,
    letterSpacing: -2.5,
    marginBottom: 4,
  },
  heroSubtext: {
    fontFamily: "Inter_400Regular",
    fontSize: 15,
    color: Colors.textSecondary,
    fontStyle: "italic",
    marginBottom: 16,
  },
  heroStatsRow: {
    flexDirection: "row",
    gap: 10,
    width: "100%",
  },
  heroStat: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 0.5,
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 3,
    alignItems: "flex-start",
  },
  heroStatValue: {
    fontFamily: "Inter_700Bold",
    fontSize: 13,
    letterSpacing: -0.3,
    marginTop: 2,
  },
  heroStatLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    color: Colors.textMuted,
  },

  tabRow: {
    flexDirection: "row",
    gap: 7,
    marginBottom: 14,
  },
  tab: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
  },
  tabText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    letterSpacing: 0.2,
  },

  catHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 14,
    borderWidth: 0.5,
    padding: 14,
    marginBottom: 14,
  },
  catIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  catTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 16,
    letterSpacing: -0.3,
    marginBottom: 2,
  },
  catSubtitle: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    lineHeight: 17,
  },

  barContainer: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 0.5,
    borderColor: Colors.border,
    padding: 14,
    marginBottom: 14,
  },
  barTrack: {
    flexDirection: "row",
    height: 10,
    borderRadius: 5,
    overflow: "hidden",
    gap: 2,
    marginBottom: 12,
  },
  barSegment: {
    borderRadius: 3,
  },
  barLegend: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  barLegendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  barDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  barLegendLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
  },

  holdersContainer: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 0.5,
    borderColor: Colors.border,
    padding: 14,
    marginBottom: 14,
    gap: 10,
  },
  holderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  holderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  holderDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  holderName: {
    fontFamily: "Inter_500Medium",
    fontSize: 14,
  },
  holderValue: {
    fontFamily: "Inter_700Bold",
    fontSize: 14,
  },

  card: {
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 0.5,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
    gap: 10,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  cardHeaderText: { flex: 1 },
  cardLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 11,
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
  },
  cardValue: {
    fontFamily: "Inter_700Bold",
    fontSize: 18,
    marginTop: 2,
    letterSpacing: -0.5,
  },
  cardExplanation: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    lineHeight: 20,
  },

  footer: { paddingVertical: 20, alignItems: "center" },
  footerText: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.textMuted,
    textAlign: "center",
    lineHeight: 16,
  },
});
