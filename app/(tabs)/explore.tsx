import React, { useState, useRef, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Animated,
  Platform,
  ActivityIndicator,
  FlatList,
  Dimensions,
  TextInput,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import ExploreMap from "@/components/ExploreMap";
import {
  tariffData,
  getCountryFlag,
  getTariffColor,
  type CountryTariff,
} from "@/data/tariffs";
import { countryCoords } from "@/data/country-coords";
import { getUsDependency } from "@/data/military-deps";
import { getApiUrl } from "@/lib/query-client";

const { height: SCREEN_H } = Dimensions.get("window");
const SHEET_HEIGHT = SCREEN_H * 0.72;

function getTariffMarkerColor(rate: number): string {
  if (rate >= 50) return "#FF2D55";
  if (rate >= 25) return "#FF6B35";
  if (rate >= 15) return "#FFB84D";
  return "#00D4AA";
}

function formatBig(num: number | null | undefined): string {
  if (!num) return "N/A";
  if (num >= 1e12) return `$${(num / 1e12).toFixed(2)}T`;
  if (num >= 1e9) return `$${(num / 1e9).toFixed(1)}B`;
  if (num >= 1e6) return `$${(num / 1e6).toFixed(1)}M`;
  return `$${num.toFixed(0)}`;
}

function formatPop(num: number | null | undefined): string {
  if (!num) return "N/A";
  if (num >= 1e9) return `${(num / 1e9).toFixed(2)}B`;
  if (num >= 1e6) return `${(num / 1e6).toFixed(1)}M`;
  if (num >= 1e3) return `${(num / 1e3).toFixed(0)}K`;
  return `${num}`;
}

interface CountryData {
  gdp: number | null;
  population: number | null;
  area: number | null;
  exportsPctGdp: number | null;
  importsPctGdp: number | null;
  militaryPctGdp: number | null;
}

function StatBox({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <View style={[styles.statBox, { backgroundColor: Colors.surfaceElevated, borderColor: Colors.border }]}>
      <Text style={[styles.statValue, { color: color ?? Colors.text }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: Colors.textSecondary }]}>{label}</Text>
      {sub ? <Text style={[styles.statSub, { color: Colors.textMuted }]}>{sub}</Text> : null}
    </View>
  );
}

function SectionRow({ title, icon }: { title: string; icon: string }) {
  return (
    <View style={styles.sectionRow}>
      <Ionicons name={icon as any} size={13} color={Colors.accent} />
      <Text style={[styles.sectionTitle, { color: Colors.textSecondary }]}>{title}</Text>
    </View>
  );
}

function CountrySheet({ country, onClose }: { country: CountryTariff; onClose: () => void }) {
  const { data: countryData, isLoading } = useQuery<CountryData>({
    queryKey: ["/api/country-data", country.countryCode],
    queryFn: async () => {
      const url = new URL(`/api/country-data/${country.countryCode}`, getApiUrl());
      const res = await fetch(url.toString());
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    staleTime: 24 * 60 * 60 * 1000,
  });

  const military = getUsDependency(country.countryCode);
  const tariffColor = getTariffColor(country.tariffRate);
  const flag = getCountryFlag(country.countryCode);
  const capital = countryCoords[country.countryCode]?.capital ?? "";

  return (
    <View style={[styles.sheetInner, { backgroundColor: Colors.surface }]}>
      <Pressable style={styles.closeBtn} onPress={onClose} hitSlop={12}>
        <Ionicons name="close" size={22} color={Colors.textSecondary} />
      </Pressable>

      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.sheetContent}
      >
        <View style={[styles.handle, { backgroundColor: Colors.border }]} />

        <View style={styles.sheetHero}>
          <Text style={styles.sheetFlag}>{flag}</Text>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[styles.sheetCountry, { color: Colors.text }]} numberOfLines={1}>
              {country.countryName}
            </Text>
            {capital ? (
              <Text style={[styles.sheetCapital, { color: Colors.textSecondary }]}>{capital}</Text>
            ) : null}
          </View>
          <View style={[styles.tariffBadge, { backgroundColor: tariffColor + "22" }]}>
            <Text style={[styles.tariffRate, { color: tariffColor }]}>{country.tariffRate}%</Text>
            <Text style={[styles.tariffLabel, { color: tariffColor }]}>US Tariff</Text>
          </View>
        </View>

        <View style={[styles.divider, { backgroundColor: Colors.border }]} />

        <SectionRow title="ECONOMIC OVERVIEW" icon="stats-chart-outline" />
        {isLoading ? (
          <ActivityIndicator color={Colors.accent} style={{ marginVertical: 16 }} />
        ) : (
          <View style={styles.statsGrid}>
            <StatBox label="GDP" value={formatBig(countryData?.gdp)} />
            <StatBox label="Population" value={formatPop(countryData?.population)} />
            <StatBox
              label="Exports"
              value={countryData?.exportsPctGdp != null ? `${countryData.exportsPctGdp.toFixed(1)}%` : "N/A"}
              sub="of GDP"
            />
            <StatBox
              label="Imports"
              value={countryData?.importsPctGdp != null ? `${countryData.importsPctGdp.toFixed(1)}%` : "N/A"}
              sub="of GDP"
            />
          </View>
        )}

        <View style={[styles.divider, { backgroundColor: Colors.border }]} />

        <SectionRow title="KEY EXPORTS TO US" icon="arrow-up-circle-outline" />
        <View style={styles.sectorList}>
          {country.sectors.map((s, i) => (
            <View
              key={i}
              style={[styles.sectorChip, { backgroundColor: Colors.accentDim, borderColor: "rgba(0,212,170,0.18)" }]}
            >
              <Text style={[styles.sectorName, { color: Colors.accent }]}>{s.sectorName}</Text>
              <Text style={[styles.sectorRate, { color: Colors.accent }]}>{s.tariffRate}%</Text>
            </View>
          ))}
        </View>

        <View style={[styles.divider, { backgroundColor: Colors.border }]} />

        <SectionRow title="US DEPENDENCY" icon="shield-outline" />
        <View style={[styles.depCard, { backgroundColor: Colors.dangerDim, borderColor: "rgba(255,77,106,0.18)" }]}>
          <View style={styles.depRow}>
            <Ionicons name="rocket-outline" size={15} color={Colors.danger} />
            <Text style={[styles.depLabel, { color: Colors.textSecondary }]}>Military arms from USA</Text>
            <Text style={[styles.depValue, { color: military.usArmsSharePct != null ? Colors.danger : Colors.textMuted }]}>
              {military.usArmsSharePct != null ? `${military.usArmsSharePct}%` : "N/A"}
            </Text>
          </View>
          {military.notes ? (
            <Text style={[styles.depNote, { color: Colors.textMuted }]}>{military.notes}</Text>
          ) : null}
        </View>

        {countryData?.militaryPctGdp != null && (
          <View style={[styles.depCard, { backgroundColor: Colors.warningDim, borderColor: "rgba(255,184,77,0.18)", marginTop: 8 }]}>
            <View style={styles.depRow}>
              <Ionicons name="trending-up-outline" size={15} color={Colors.warning} />
              <Text style={[styles.depLabel, { color: Colors.textSecondary }]}>Military spending</Text>
              <Text style={[styles.depValue, { color: Colors.warning }]}>
                {countryData.militaryPctGdp.toFixed(1)}% of GDP
              </Text>
            </View>
          </View>
        )}

        <View style={[styles.divider, { backgroundColor: Colors.border }]} />

        <SectionRow title="PLAIN ENGLISH" icon="chatbubble-outline" />
        <View style={[styles.explainBox, { backgroundColor: Colors.surfaceElevated, borderColor: Colors.border }]}>
          <Text style={[styles.explainText, { color: Colors.textSecondary }]}>
            {country.laymanExplanation}
          </Text>
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
}

export default function ExploreScreen() {
  const insets = useSafeAreaInsets();
  const [selectedCountry, setSelectedCountry] = useState<CountryTariff | null>(null);
  const [search, setSearch] = useState("");
  const slideAnim = useRef(new Animated.Value(0)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;

  const filteredCountries = search.trim()
    ? tariffData.filter(c =>
        c.countryName.toLowerCase().includes(search.toLowerCase()) ||
        c.countryCode.toLowerCase().includes(search.toLowerCase())
      )
    : tariffData;

  const focusedCode = filteredCountries.length === 1 ? filteredCountries[0].countryCode : undefined;

  const showSheet = useCallback(
    (country: CountryTariff) => {
      setSelectedCountry(country);
      if (Platform.OS !== "web") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 1,
          damping: 22,
          stiffness: 180,
          mass: 0.9,
          useNativeDriver: true,
        }),
        Animated.timing(backdropAnim, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start();
    },
    [slideAnim, backdropAnim]
  );

  const hideSheet = useCallback(() => {
    Animated.parallel([
      Animated.spring(slideAnim, {
        toValue: 0,
        damping: 25,
        stiffness: 200,
        useNativeDriver: true,
      }),
      Animated.timing(backdropAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => setSelectedCountry(null));
  }, [slideAnim, backdropAnim]);

  const translateY = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [SHEET_HEIGHT, 0],
  });

  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const headerH = topInset + 110;

  return (
    <View style={[styles.root, { backgroundColor: Colors.background }]}>
      {Platform.OS !== "web" ? (
        <ExploreMap
          countries={tariffData}
          onSelectCountry={showSheet}
          getMarkerColor={getTariffMarkerColor}
          focusedCode={focusedCode}
        />
      ) : null}

      {Platform.OS === "web" && !selectedCountry ? (
        <View style={{ flex: 1, marginTop: headerH }}>
          <FlatList
            data={filteredCountries.sort((a, b) => b.tariffRate - a.tariffRate)}
            keyExtractor={(i) => i.countryCode}
            numColumns={2}
            contentContainerStyle={{ padding: 12, gap: 8 }}
            columnWrapperStyle={{ gap: 8 }}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => {
              const tc = getTariffColor(item.tariffRate);
              return (
                <Pressable
                  onPress={() => showSheet(item)}
                  style={({ pressed }) => [
                    styles.webCard,
                    { backgroundColor: Colors.surface, borderColor: Colors.border },
                    pressed && { opacity: 0.75 },
                  ]}
                >
                  <Text style={styles.webFlag}>{getCountryFlag(item.countryCode)}</Text>
                  <Text style={[styles.webName, { color: Colors.text }]} numberOfLines={1}>
                    {item.countryName}
                  </Text>
                  <Text style={[styles.webRate, { color: tc }]}>{item.tariffRate}%</Text>
                </Pressable>
              );
            }}
          />
        </View>
      ) : null}

      {/* Header overlay */}
      <View
        style={[
          styles.header,
          {
            paddingTop: topInset + (Platform.OS === "web" ? 8 : 10),
            backgroundColor: Colors.headerBg,
            borderBottomColor: Colors.border,
          },
        ]}
      >
        <View style={styles.headerInner}>
          <View>
            <Text style={[styles.headerTitle, { color: Colors.text }]}>Explore</Text>
            <Text style={[styles.headerSub, { color: Colors.textMuted }]}>
              {Platform.OS !== "web"
                ? `${tariffData.length} countries · Tap any marker`
                : `${filteredCountries.length} countries · Tap to explore`}
            </Text>
          </View>
        </View>

        {/* Search bar */}
        <View style={[styles.searchBar, { backgroundColor: Colors.surface, borderColor: Colors.border }]}>
          <Ionicons name="search-outline" size={15} color={Colors.textMuted} />
          <TextInput
            style={[styles.searchInput, { color: Colors.text }]}
            placeholder="Search country..."
            placeholderTextColor={Colors.textMuted}
            value={search}
            onChangeText={setSearch}
            autoCorrect={false}
            autoCapitalize="none"
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch("")} hitSlop={8}>
              <Ionicons name="close-circle" size={15} color={Colors.textMuted} />
            </Pressable>
          )}
        </View>

        <View style={styles.legend}>
          {[
            { color: "#00D4AA", label: "≤15%" },
            { color: "#FFB84D", label: "15-25%" },
            { color: "#FF6B35", label: "25-50%" },
            { color: "#FF2D55", label: ">50%" },
          ].map((l) => (
            <View key={l.label} style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: l.color }]} />
              <Text style={[styles.legendText, { color: Colors.textMuted }]}>{l.label}</Text>
            </View>
          ))}
        </View>
      </View>

      {selectedCountry ? (
        <>
          <Animated.View
            style={[
              styles.backdrop,
              {
                opacity: backdropAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, 0.55],
                }),
              },
            ]}
            pointerEvents="box-none"
          >
            <Pressable style={StyleSheet.absoluteFill} onPress={hideSheet} />
          </Animated.View>

          <Animated.View
            style={[
              styles.sheetWrap,
              {
                transform: [{ translateY }],
                height: SHEET_HEIGHT,
                paddingBottom: insets.bottom,
              },
            ]}
          >
            <CountrySheet country={selectedCountry} onClose={hideSheet} />
          </Animated.View>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    paddingHorizontal: 16,
    paddingBottom: 10,
    borderBottomWidth: 0.5,
  },
  headerInner: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  headerTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 22,
    letterSpacing: -0.5,
  },
  headerSub: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    marginTop: 1,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 7,
    borderWidth: 0.5,
    marginBottom: 10,
  },
  searchInput: {
    flex: 1,
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    padding: 0,
  },
  legend: {
    flexDirection: "row",
    gap: 12,
    flexWrap: "wrap",
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  legendDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  legendText: {
    fontFamily: "Inter_400Regular",
    fontSize: 10,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#000",
    zIndex: 200,
  },
  sheetWrap: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 300,
    overflow: "hidden",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  sheetInner: {
    flex: 1,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: "hidden",
  },
  closeBtn: {
    position: "absolute",
    top: 14,
    right: 16,
    zIndex: 10,
  },
  sheetContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 40,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 18,
  },
  sheetHero: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 18,
  },
  sheetFlag: { fontSize: 40 },
  sheetCountry: {
    fontFamily: "Inter_700Bold",
    fontSize: 20,
    letterSpacing: -0.4,
  },
  sheetCapital: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    marginTop: 2,
  },
  tariffBadge: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    alignItems: "center",
  },
  tariffRate: {
    fontFamily: "Inter_700Bold",
    fontSize: 20,
    letterSpacing: -0.5,
  },
  tariffLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 10,
    marginTop: 1,
  },
  divider: { height: 0.5, marginVertical: 16 },
  sectionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 12,
  },
  sectionTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    letterSpacing: 1,
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  statBox: {
    flex: 1,
    minWidth: "45%",
    borderRadius: 12,
    padding: 12,
    borderWidth: 0.5,
  },
  statValue: {
    fontFamily: "Inter_700Bold",
    fontSize: 16,
    letterSpacing: -0.3,
  },
  statLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 11,
    marginTop: 3,
  },
  statSub: {
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    marginTop: 1,
  },
  sectorList: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  sectorChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 0.5,
  },
  sectorName: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
  },
  sectorRate: {
    fontFamily: "Inter_700Bold",
    fontSize: 11,
  },
  depCard: {
    borderRadius: 12,
    padding: 12,
    borderWidth: 0.5,
  },
  depRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  depLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    flex: 1,
  },
  depValue: {
    fontFamily: "Inter_700Bold",
    fontSize: 14,
  },
  depNote: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    marginTop: 6,
    lineHeight: 16,
  },
  explainBox: {
    borderRadius: 14,
    padding: 14,
    borderWidth: 0.5,
  },
  explainText: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    lineHeight: 20,
  },
  webCard: {
    flex: 1,
    borderRadius: 14,
    padding: 14,
    borderWidth: 0.5,
    alignItems: "center",
  },
  webFlag: { fontSize: 28, marginBottom: 6 },
  webName: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    marginBottom: 4,
    textAlign: "center",
  },
  webRate: {
    fontFamily: "Inter_700Bold",
    fontSize: 15,
  },
});
