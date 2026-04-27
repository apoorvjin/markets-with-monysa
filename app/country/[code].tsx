import React, { useMemo, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Platform,
  Linking,
} from "react-native";
import { a11yButton, a11yLink } from "@/utils/accessibility";
import { useLocalSearchParams, router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { useColors } from "@/hooks/useColors";
import {
  tariffData,
  getCountryFlag,
  getTariffColor,
  formatDate,
  formatBillions,
  type SectorTariff,
  type DebtDetail,
} from "@/data/tariffs";

function SectorRow({ sector, maxRate }: { sector: SectorTariff; maxRate: number }) {
  const Colors = useColors();
  const barWidth = maxRate > 0 ? (sector.tariffRate / maxRate) * 100 : 0;
  const color = getTariffColor(sector.tariffRate);

  const handleOpenSource = useCallback(() => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    Linking.openURL(sector.sourceURL);
  }, [sector.sourceURL]);

  return (
    <View style={[styles.sectorRow, { borderBottomColor: Colors.border }]}>
      <View style={styles.sectorInfo}>
        <View style={styles.sectorNameRow}>
          <Text style={[styles.sectorName, { color: Colors.text }]} numberOfLines={1}>{sector.sectorName}</Text>
          <Pressable onPress={handleOpenSource} hitSlop={15} style={styles.sectorLink} {...a11yLink(`View source for ${sector.sectorName} sector`)}>
            <Ionicons name="link-outline" size={14} color={Colors.accent} />
          </Pressable>
        </View>
        <Text style={[styles.sectorRate, { color }]}>{sector.tariffRate}%</Text>
      </View>
      <View style={styles.barBg}>
        <View
          style={[
            styles.barFill,
            {
              width: `${barWidth}%`,
              backgroundColor: color,
            },
          ]}
        />
      </View>
    </View>
  );
}

function DebtTable({ debtData }: { debtData: DebtDetail[] }) {
  const Colors = useColors();
  const totalDebt = useMemo(
    () => debtData.reduce((sum, d) => sum + d.amountBillions, 0),
    [debtData]
  );

  return (
    <View style={[styles.debtCard, { backgroundColor: Colors.surface, borderColor: Colors.border }]}>
      <View style={[styles.debtHeaderRow, { borderBottomColor: Colors.border }]}>
        <Text style={[styles.debtHeaderCell, { flex: 2, color: Colors.textMuted }]}>Category</Text>
        <Text style={[styles.debtHeaderCell, { flex: 1, textAlign: "right", color: Colors.textMuted }]}>
          Amount
        </Text>
      </View>
      {debtData.map((debt) => (
        <View key={debt.category} style={[styles.debtRow, { borderBottomColor: Colors.border }]}>
          <View style={{ flex: 2 }}>
            <Text style={[styles.debtCategory, { color: Colors.text }]}>{debt.category}</Text>
            <Text style={[styles.debtNotes, { color: Colors.textMuted }]}>{debt.notes}</Text>
          </View>
          <Text style={[styles.debtAmount, { color: Colors.accent }]}>{formatBillions(debt.amountBillions)}</Text>
        </View>
      ))}
      <View style={[styles.debtTotalRow, { borderTopColor: Colors.border }]}>
        <Text style={[styles.debtTotalLabel, { color: Colors.textSecondary }]}>Total Exposure</Text>
        <Text style={[styles.debtTotalValue, { color: Colors.text }]}>{formatBillions(totalDebt)}</Text>
      </View>
    </View>
  );
}

export default function CountryDetailScreen() {
  const Colors = useColors();
  const { code } = useLocalSearchParams<{ code: string }>();
  const insets = useSafeAreaInsets();

  const country = useMemo(
    () => tariffData.find((c) => c.countryCode === code),
    [code]
  );

  const maxSectorRate = useMemo(() => {
    if (!country) return 0;
    return Math.max(...country.sectors.map((s) => s.tariffRate));
  }, [country]);

  const sortedSectors = useMemo(() => {
    if (!country) return [];
    return [...country.sectors].sort((a, b) => b.tariffRate - a.tariffRate);
  }, [country]);

  const handleBack = useCallback(() => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    router.back();
  }, []);

  const handleOpenSource = useCallback(() => {
    if (!country) return;
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    Linking.openURL(country.sourceURL);
  }, [country]);

  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  if (!country) {
    return (
      <View style={[styles.container, { paddingTop: topInset }]}>
        <View style={styles.errorState}>
          <Ionicons name="alert-circle-outline" size={48} color={Colors.textMuted} />
          <Text style={styles.errorText}>Country not found</Text>
          <Pressable onPress={handleBack} style={styles.retryButton} {...a11yButton("Go back")}>
            <Text style={styles.retryText}>Go Back</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const rateColor = getTariffColor(country.tariffRate);

  return (
    <View style={[styles.container, { paddingTop: topInset, backgroundColor: Colors.background }]}>
      <View style={[styles.navBar, { backgroundColor: Colors.surface, borderBottomColor: Colors.border }]}>
        <Pressable onPress={handleBack} hitSlop={12} style={styles.backButton} {...a11yButton("Go back")}>
          <Ionicons name="chevron-back" size={24} color={Colors.accent} />
        </Pressable>
        <Text style={[styles.navTitle, { color: Colors.text }]} numberOfLines={1}>
          {country.countryName}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: bottomInset + 40 }}
      >
        <View style={styles.heroSection}>
          <Text style={styles.heroFlag}>
            {getCountryFlag(country.countryCode)}
          </Text>
          <Text style={[styles.heroName, { color: Colors.text }]}>{country.countryName}</Text>
          <Text style={[styles.heroCode, { color: Colors.textMuted }]}>{country.countryCode}</Text>
        </View>

        <View style={[styles.overallCard, { backgroundColor: Colors.surface, borderColor: Colors.border }]}>
          <Text style={[styles.overallLabel, { color: Colors.textSecondary }]}>Overall Tariff Rate</Text>
          <Text style={[styles.overallRate, { color: rateColor }]}>
            {country.tariffRate}%
          </Text>
          <View style={[styles.rateIndicator, { backgroundColor: rateColor + "20" }]}>
            <View style={[styles.rateIndicatorDot, { backgroundColor: rateColor }]} />
            <Text style={[styles.rateIndicatorText, { color: rateColor }]}>
              {country.tariffRate >= 40
                ? "Critical"
                : country.tariffRate >= 25
                ? "Elevated"
                : country.tariffRate >= 15
                ? "Moderate"
                : "Low"}
            </Text>
          </View>
          <Text style={[styles.rateLayman, { color: Colors.textSecondary }]}>
            {country.tariffRate >= 40
              ? "Prices on goods from this country could roughly double or more due to these tariffs."
              : country.tariffRate >= 25
              ? "Expect noticeably higher prices on imports. A $100 item could cost $125+."
              : country.tariffRate >= 15
              ? "Some price increases on imported goods, but not as severe."
              : "Minimal impact on everyday prices from this country's imports."}
          </Text>
        </View>

        {country.laymanExplanation ? (
          <View style={[styles.laymanCard, { backgroundColor: Colors.surface, borderColor: Colors.border }]}>
            <View style={styles.laymanHeader}>
              <Ionicons name="bulb-outline" size={20} color={Colors.warning} />
              <Text style={[styles.laymanTitle, { color: Colors.text }]}>What This Means For You</Text>
            </View>
            <Text style={[styles.laymanText, { color: Colors.textSecondary }]}>{country.laymanExplanation}</Text>
          </View>
        ) : null}

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: Colors.text }]}>Sector Breakdown</Text>
            <View style={[styles.verifiedBadge, { backgroundColor: Colors.accentDim, borderColor: Colors.accent + "44" }]}>
              <Ionicons name="shield-checkmark" size={12} color={Colors.accent} />
              <Text style={[styles.verifiedText, { color: Colors.accent }]}>Verified Sources</Text>
            </View>
          </View>
          <View style={[styles.sectorCard, { backgroundColor: Colors.surface, borderColor: Colors.border }]}>
            {sortedSectors.map((sector) => (
              <SectorRow
                key={sector.sectorName}
                sector={sector}
                maxRate={maxSectorRate}
              />
            ))}
          </View>
          <Pressable
            onPress={() => {
              if (Platform.OS !== "web") {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              }
              router.push({ pathname: "/country/stocks", params: { code: country.countryCode } });
            }}
            {...a11yButton(`View top listed stocks for ${country.countryName}`, "Opens stock market data for this country's exchange")}
            style={({ pressed }) => [
              styles.stocksButton,
              { backgroundColor: Colors.surfaceElevated, borderColor: Colors.border },
              pressed && styles.stocksButtonPressed,
            ]}
          >
            <View style={styles.stocksButtonLeft}>
              <Ionicons name="bar-chart" size={18} color={Colors.accent} />
              <View>
                <Text style={[styles.stocksButtonTitle, { color: Colors.text }]}>View Top Listed Stocks</Text>
                <Text style={[styles.stocksButtonSub, { color: Colors.textSecondary }]}>
                  Largest companies on {country.countryName}'s exchange
                </Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={18} color={Colors.accent} />
          </Pressable>
        </View>

        {country.debtToUSA && country.debtToUSA.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: Colors.text }]}>Debt & Financial Exposure to U.S.</Text>
            <Text style={[styles.debtContext, { color: Colors.textSecondary }]}>
              This shows how much financial stake {country.countryName} has in the U.S. economy — from holding our government bonds to trading goods with us.
            </Text>
            <DebtTable debtData={country.debtToUSA} />
          </View>
        )}

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: Colors.text }]}>Data Source</Text>
          <Pressable
            onPress={handleOpenSource}
            {...a11yLink("View official USTR source", "Opens the official US Trade Representative website")}
            style={({ pressed }) => [
              styles.sourceButton,
              { backgroundColor: Colors.surfaceElevated, borderColor: Colors.border },
              pressed && styles.sourceButtonPressed,
            ]}
          >
            <Ionicons name="open-outline" size={18} color={Colors.accent} />
            <Text style={[styles.sourceButtonText, { color: Colors.accent }]}>View Official USTR Source</Text>
          </Pressable>
          <Text style={[styles.updatedText, { color: Colors.textMuted }]}>
            Last updated: {formatDate(country.lastUpdated)}
          </Text>
        </View>

        <Text style={[styles.disclaimer, { color: Colors.textMuted }]}>
          Tariff rates and trade data are for informational purposes only. Not financial or legal advice. Rates may change; verify with official sources before making decisions.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  navBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    height: 48,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  navTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
  },
  heroSection: {
    alignItems: "center",
    paddingTop: 32,
    paddingBottom: 24,
  },
  heroFlag: {
    fontSize: 56,
    marginBottom: 12,
  },
  heroName: {
    fontSize: 24,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
    letterSpacing: -0.3,
  },
  heroCode: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: Colors.textMuted,
    marginTop: 4,
  },
  overallCard: {
    marginHorizontal: 20,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 20,
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 24,
  },
  overallLabel: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: Colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  overallRate: {
    fontSize: 48,
    fontFamily: "Inter_700Bold",
    marginTop: 8,
    letterSpacing: -1,
  },
  rateIndicator: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginTop: 12,
    gap: 6,
  },
  rateIndicatorDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  rateIndicatorText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  rateLayman: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    textAlign: "center",
    marginTop: 12,
    lineHeight: 19,
    paddingHorizontal: 8,
  },
  laymanCard: {
    marginHorizontal: 20,
    backgroundColor: Colors.warningDim,
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: Colors.warning + "30",
  },
  laymanHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  laymanTitle: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: Colors.warning,
  },
  laymanText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.text,
    lineHeight: 22,
  },
  debtContext: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    lineHeight: 20,
    marginBottom: 12,
    marginTop: -4,
  },
  section: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: Colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 12,
  },
  verifiedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.accentDim,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    marginBottom: 12,
  },
  verifiedText: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    color: Colors.accent,
  },
  sectorCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 16,
  },
  sectorRow: {
    gap: 8,
  },
  sectorInfo: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  sectorNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flex: 1,
  },
  sectorName: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: Colors.text,
  },
  sectorLink: {
    padding: 2,
  },
  sectorRate: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
  },
  barBg: {
    height: 6,
    backgroundColor: Colors.background,
    borderRadius: 3,
    overflow: "hidden",
  },
  barFill: {
    height: "100%",
    borderRadius: 3,
  },
  debtCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: "hidden",
  },
  debtHeaderRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: Colors.surfaceElevated,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  debtHeaderCell: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    color: Colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  debtRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  debtCategory: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: Colors.text,
  },
  debtNotes: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: Colors.textMuted,
    marginTop: 2,
  },
  debtAmount: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    color: Colors.warning,
    textAlign: "right",
  },
  debtTotalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: Colors.accentDim,
  },
  debtTotalLabel: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: Colors.accent,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  debtTotalValue: {
    fontSize: 17,
    fontFamily: "Inter_700Bold",
    color: Colors.accent,
  },
  stocksButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Colors.accentDim,
    borderRadius: 12,
    padding: 14,
    marginTop: 12,
    borderWidth: 1,
    borderColor: Colors.accent + "30",
  },
  stocksButtonPressed: {
    backgroundColor: Colors.accent + "25",
  },
  stocksButtonLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  stocksButtonTitle: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: Colors.accent,
  },
  stocksButtonSub: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    marginTop: 2,
  },
  sourceButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    gap: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  sourceButtonPressed: {
    backgroundColor: Colors.surfaceElevated,
  },
  sourceButtonText: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
    color: Colors.accent,
  },
  updatedText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.textMuted,
    marginTop: 10,
    textAlign: "center",
  },
  errorState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
  },
  errorText: {
    fontSize: 16,
    fontFamily: "Inter_500Medium",
    color: Colors.textMuted,
  },
  retryButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: Colors.accent,
  },
  retryText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: Colors.background,
  },
  disclaimer: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: Colors.textMuted,
    textAlign: "center",
    paddingHorizontal: 20,
    paddingBottom: 24,
    lineHeight: 16,
  },
});
