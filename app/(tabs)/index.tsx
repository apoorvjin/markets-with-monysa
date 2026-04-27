import React, { useState, useMemo, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  FlatList,
  Pressable,
  StyleSheet,
  Platform,
} from "react-native";
import { a11yButton } from "@/utils/accessibility";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";
import {
  tariffData,
  getSortedTariffs,
  getCountryFlag,
  getTariffColor,
  type CountryTariff,
} from "@/data/tariffs";

type SortMode = "high" | "low";

// ─── Country Row ───────────────────────────────────────────────────────────────

function CountryRow({ item, index }: { item: CountryTariff; index: number }) {
  const Colors = useColors();
  const rateColor = getTariffColor(item.tariffRate);

  const handlePress = useCallback(() => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push({ pathname: "/country/[code]", params: { code: item.countryCode } });
  }, [item.countryCode]);

  const rank = index + 1;
  return (
    <Pressable
      onPress={handlePress}
      accessible={true}
      accessibilityRole="button"
      accessibilityLabel={`${item.countryName}, rank ${rank}, tariff rate ${item.tariffRate}%`}
      accessibilityHint="Tap to view sector breakdown and country details"
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: Colors.surface,
          borderColor: Colors.border,
          borderRadius: 12,
        },
        pressed && styles.rowPressed,
      ]}
    >
      <View style={[styles.rankBadge, { backgroundColor: Colors.surfaceElevated }]}>
        <Text style={[styles.rankText, { color: Colors.textMuted }]}>{index + 1}</Text>
      </View>
      <Text style={styles.flag}>{getCountryFlag(item.countryCode)}</Text>
      <View style={styles.rowInfo}>
        <Text style={[styles.countryName, { color: Colors.text }]} numberOfLines={1}>
          {item.countryName}
        </Text>
        <Text style={[styles.sectorCount, { color: Colors.textSecondary }]}>
          {item.sectors.length} sector{item.sectors.length !== 1 ? "s" : ""}
        </Text>
      </View>
      <View style={styles.rateContainer}>
        <Text style={[styles.rateValue, { color: rateColor }]}>
          {item.tariffRate}%
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
    </Pressable>
  );
}

// ─── Main Screen ───────────────────────────────────────────────────────────────

export default function CountryListScreen() {
  const Colors = useColors();
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("high");

  const sortedData = useMemo(() => getSortedTariffs(tariffData, sortMode === "low"), [sortMode]);

  const filteredData = useMemo(() => {
    if (!search.trim()) return sortedData;
    const q = search.toLowerCase();
    return sortedData.filter(
      (c) => c.countryName.toLowerCase().includes(q) || c.countryCode.toLowerCase().includes(q)
    );
  }, [sortedData, search]);

  const allSortedHigh = useMemo(() => getSortedTariffs(tariffData, false), []);

  const avgRate = useMemo(() => {
    const sum = allSortedHigh.reduce((acc, c) => acc + c.tariffRate, 0);
    return (sum / allSortedHigh.length).toFixed(1);
  }, [allSortedHigh]);

  const topInset = Platform.OS === "web" ? 67 : insets.top;

  const toggleSort = useCallback(() => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSortMode((prev) => (prev === "high" ? "low" : "high"));
  }, []);

  const renderItem = useCallback(
    ({ item, index }: { item: CountryTariff; index: number }) => (
      <CountryRow item={item} index={index} />
    ),
    []
  );

  const keyExtractor = useCallback((item: CountryTariff) => item.countryCode, []);

  return (
    <View style={[styles.container, { paddingTop: topInset, backgroundColor: Colors.background }]}>

      {/* ── Header ── */}
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <View>
            <Text style={[styles.title, { color: Colors.text }]}>
              U.S. Tariff Exposure
            </Text>
            <Text style={[styles.subtitle, { color: Colors.textSecondary }]}>
              {allSortedHigh.length} countries monitored
            </Text>
          </View>
          <Pressable
            onPress={() => router.push("/(tabs)/explore")}
            hitSlop={8}
            {...a11yButton("Explore world map", "Opens the interactive tariff map")}
            style={[styles.mapButton, { backgroundColor: Colors.accentDim, borderColor: Colors.accent + "40" }]}
          >
            <Ionicons name="map-outline" size={18} color={Colors.accent} />
          </Pressable>
        </View>
      </View>

      {/* ── Stats row ── */}
      <View style={styles.statsRow}>
        {[
          { label: "Highest", value: `${allSortedHigh[0]?.tariffRate}%`, country: allSortedHigh[0]?.countryName, color: Colors.danger },
          { label: "Average", value: `${avgRate}%`, country: "All countries", color: Colors.warning },
          { label: "Lowest", value: `${allSortedHigh[allSortedHigh.length - 1]?.tariffRate}%`, country: allSortedHigh[allSortedHigh.length - 1]?.countryName, color: Colors.positive },
        ].map((s) => (
          <View
            key={s.label}
            style={[
              styles.statCard,
              {
                backgroundColor: Colors.surface,
                borderColor: Colors.border,
                borderRadius: 12,
              },
            ]}
          >
            <Text style={[styles.statLabel, { color: Colors.textMuted }]}>{s.label}</Text>
            <Text style={[styles.statValue, { color: s.color }]}>{s.value}</Text>
            <Text style={[styles.statCountry, { color: Colors.textSecondary }]} numberOfLines={1}>{s.country}</Text>
          </View>
        ))}
      </View>

      {/* ── Search + Sort ── */}
      <View style={styles.controlsRow}>
        <View
          style={[
            styles.searchContainer,
            {
              backgroundColor: Colors.searchBg,
              borderColor: Colors.border,
              borderRadius: 12,
            },
          ]}
        >
          <Ionicons name="search" size={18} color={Colors.textMuted} style={styles.searchIcon} />
          <TextInput
            style={[styles.searchInput, { color: Colors.text }]}
            placeholder="Search countries..."
            placeholderTextColor={Colors.textMuted}
            value={search}
            onChangeText={setSearch}
            autoCorrect={false}
            autoCapitalize="none"
          />
          {search.length > 0 && (
            <Pressable
              onPress={() => setSearch("")}
              hitSlop={15}
              {...a11yButton("Clear search")}
            >
              <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
            </Pressable>
          )}
        </View>
        <Pressable
          onPress={toggleSort}
          {...a11yButton(
            sortMode === "high" ? "Sort by highest tariff" : "Sort by lowest tariff",
            "Toggles sort order between highest and lowest tariff rates"
          )}
          style={({ pressed }) => [
            styles.sortButton,
            {
              backgroundColor: Colors.accentDim,
              borderColor: Colors.accent + "30",
              borderRadius: 12,
            },
            pressed && styles.sortButtonPressed,
          ]}
        >
          <Ionicons
            name={sortMode === "high" ? "arrow-down" : "arrow-up"}
            size={16}
            color={Colors.accent}
          />
          <Text style={[styles.sortButtonText, { color: Colors.accent }]}>
            {sortMode === "high" ? "High" : "Low"}
          </Text>
        </Pressable>
      </View>

      {/* ── List ── */}
      <FlatList
        data={filteredData}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: Platform.OS === "web" ? 34 : insets.bottom + 20 },
        ]}
        showsVerticalScrollIndicator={false}
        scrollEnabled={!!filteredData.length}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="search-outline" size={40} color={Colors.textMuted} />
            <Text style={[styles.emptyText, { color: Colors.textMuted }]}>No countries found</Text>
          </View>
        }
        ListFooterComponent={
          <Text style={[styles.disclaimer, { color: Colors.textMuted }]}>
            Tariff data is for informational purposes only and does not constitute financial or legal advice. Rates may change; verify with official sources.
          </Text>
        }
      />
    </View>
  );
}

// ─── Static styles (layout only — colors are applied inline) ──────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 12,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  mapButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 24,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  statsRow: {
    flexDirection: "row",
    paddingHorizontal: 20,
    gap: 10,
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    padding: 12,
    borderWidth: 0.5,
  },
  statLabel: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
  },
  statValue: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    marginTop: 4,
  },
  statCountry: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  controlsRow: {
    flexDirection: "row",
    paddingHorizontal: 20,
    gap: 10,
    marginBottom: 8,
  },
  searchContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    height: 44,
    borderWidth: 0.5,
  },
  searchIcon: { marginRight: 10 },
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    height: "100%" as any,
  },
  sortButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    height: 44,
    gap: 6,
    borderWidth: 1,
  },
  sortButtonPressed: { opacity: 0.7 },
  sortButtonText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  listContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    marginBottom: 8,
    borderWidth: 0.5,
  },
  rowPressed: {
    opacity: 0.75,
    transform: [{ scale: 0.98 }],
  },
  rankBadge: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  rankText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  flag: { fontSize: 24, marginRight: 12 },
  rowInfo: { flex: 1, marginRight: 8 },
  countryName: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  sectorCount: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  rateContainer: { marginRight: 8 },
  rateValue: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 60,
    gap: 12,
  },
  emptyText: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
  },
  disclaimer: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 16,
    paddingHorizontal: 8,
    paddingVertical: 12,
    opacity: 0.8,
  },
});
