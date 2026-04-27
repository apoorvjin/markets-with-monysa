import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  FlatList,
  Pressable,
  StyleSheet,
  Platform,
  ActivityIndicator,
} from "react-native";
import { a11yButton, a11yTab } from "@/utils/accessibility";
import { useLocalSearchParams, router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { useColors } from "@/hooks/useColors";
import { tariffData, getCountryFlag } from "@/data/tariffs";

interface StockItem {
  symbol: string;
  name: string;
  exchange: string;
  currency: string;
  price?: number;
  change?: number;
  changePercent?: number;
  marketCap?: number;
  sector?: string;
  industry?: string;
}

interface StocksResponse {
  countryCode: string;
  exchange: string;
  region: string;
  count: number;
  stocks: StockItem[];
  lastUpdated?: string;
  marketStatus?: { isOpen: boolean; label: string };
}

type SortField = "rank" | "price" | "marketCap";
type SortDir = "asc" | "desc";

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: "$", EUR: "€", GBP: "£", JPY: "¥", CNY: "¥", INR: "₹",
  KRW: "₩", BRL: "R$", MXN: "$", AUD: "A$", CAD: "C$", CHF: "CHF ",
  SEK: "kr ", NOK: "kr ", DKK: "kr ", PLN: "zł", CZK: "Kč ",
  HUF: "Ft ", RON: "lei ", BGN: "лв ", HRK: "kn ", RUB: "₽",
  TRY: "₺", ZAR: "R", NGN: "₦", EGP: "E£", KES: "KSh ",
  GHS: "GH₵", MAD: "MAD ", THB: "฿", TWD: "NT$", IDR: "Rp ",
  MYR: "RM ", PHP: "₱", SGD: "S$", HKD: "HK$", NZD: "NZ$",
  SAR: "﷼", AED: "د.إ", QAR: "﷼", KWD: "د.ك", ILS: "₪",
  PKR: "₨", BDT: "৳", LKR: "Rs ", VND: "₫", MMK: "K ",
  ARS: "ARS ", CLP: "CLP ", COP: "COP ", PEN: "S/",
  GBp: "£", ILA: "₪",
};

function getCurrencySymbol(code: string): string {
  if (code === "GBp" || code === "GBX") return "£";
  if (code === "ILA") return "₪";
  return CURRENCY_SYMBOLS[code] || `${code} `;
}

function formatPrice(price?: number, currency?: string): string {
  if (!price) return "—";
  const sym = getCurrencySymbol(currency || "USD");
  let displayPrice = price;
  if (currency === "GBp" || currency === "GBX") {
    displayPrice = price / 100;
  }
  if (currency === "ILA") {
    displayPrice = price / 100;
  }
  if (displayPrice >= 10000) {
    return `${sym}${displayPrice.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  }
  return `${sym}${displayPrice.toFixed(2)}`;
}

function formatMarketCap(cap?: number): string {
  if (!cap) return "—";
  if (cap >= 1e12) return `$${(cap / 1e12).toFixed(1)}T`;
  if (cap >= 1e9) return `$${(cap / 1e9).toFixed(1)}B`;
  if (cap >= 1e6) return `$${(cap / 1e6).toFixed(0)}M`;
  return `$${cap.toLocaleString()}`;
}

function formatLastUpdated(isoDate?: string): string {
  if (!isoDate) return "";
  try {
    const d = new Date(isoDate);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return "Just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  } catch {
    return "";
  }
}

function StockRow({ item, index, displayIndex }: { item: StockItem; index: number; displayIndex: number }) {
  const Colors = useColors();
  const changeColor = (item.change ?? 0) >= 0 ? Colors.positive : Colors.danger;
  const changeIcon = (item.change ?? 0) >= 0 ? "caret-up" : "caret-down";

  const changeStr = item.changePercent != null
    ? `, ${item.changePercent >= 0 ? "up" : "down"} ${Math.abs(item.changePercent).toFixed(2)}%`
    : "";
  const priceStr = item.price != null ? `, price ${formatPrice(item.price, item.currency)}` : "";
  return (
    <View
      style={[styles.stockRow, { borderBottomColor: Colors.border }]}
      accessible={true}
      accessibilityRole="text"
      accessibilityLabel={`${displayIndex}. ${item.name} (${item.symbol})${priceStr}${changeStr}${item.sector ? `, ${item.sector}` : ""}`}
    >
      <View style={styles.stockRank}>
        <Text style={[styles.rankText, { color: Colors.textMuted }]}>{displayIndex}</Text>
      </View>
      <View style={styles.stockInfo}>
        <Text style={[styles.stockSymbol, { color: Colors.accent }]} numberOfLines={1}>{item.symbol}</Text>
        <Text style={[styles.stockName, { color: Colors.textSecondary }]} numberOfLines={1}>{item.name}</Text>
        {item.sector ? (
          <Text style={[styles.stockSector, { color: Colors.textMuted }]} numberOfLines={1}>{item.sector}{item.industry ? ` · ${item.industry}` : ""}</Text>
        ) : null}
      </View>
      <View style={styles.stockPriceCol}>
        <Text style={[styles.stockPrice, { color: Colors.text }]}>{formatPrice(item.price, item.currency)}</Text>
        {item.changePercent != null ? (
          <View style={styles.changeRow}>
            <Ionicons name={changeIcon} size={10} color={changeColor} />
            <Text style={[styles.changeText, { color: changeColor }]}>
              {Math.abs(item.changePercent).toFixed(2)}%
            </Text>
          </View>
        ) : null}
      </View>
      <View style={styles.stockCapCol}>
        <Text style={[styles.stockCapText, { color: Colors.textSecondary }]}>{formatMarketCap(item.marketCap)}</Text>
        <Text style={[styles.stockExchange, { color: Colors.textMuted }]} numberOfLines={1}>{item.exchange}</Text>
      </View>
    </View>
  );
}

function ExchangeTabs({ active, onSwitch }: { active: "NSE" | "BSE"; onSwitch: (tab: "NSE" | "BSE") => void }) {
  const Colors = useColors();
  return (
    <View style={[styles.exchangeTabs, { backgroundColor: Colors.surface, borderBottomColor: Colors.border }]}>
      <Pressable
        style={[styles.exchangeTab, active === "NSE" && [styles.exchangeTabActive, { backgroundColor: Colors.surfaceElevated, borderColor: Colors.accent }]]}
        onPress={() => {
          if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onSwitch("NSE");
        }}
        {...a11yTab("NSE — National Stock Exchange", active === "NSE")}
      >
        <Text style={[styles.exchangeTabText, { color: Colors.textMuted }, active === "NSE" && { color: Colors.accent }]}>NSE</Text>
      </Pressable>
      <Pressable
        style={[styles.exchangeTab, active === "BSE" && [styles.exchangeTabActive, { backgroundColor: Colors.surfaceElevated, borderColor: Colors.accent }]]}
        onPress={() => {
          if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onSwitch("BSE");
        }}
        {...a11yTab("BSE — Bombay Stock Exchange", active === "BSE")}
      >
        <Text style={[styles.exchangeTabText, { color: Colors.textMuted }, active === "BSE" && { color: Colors.accent }]}>BSE</Text>
      </Pressable>
    </View>
  );
}

function SortableHeader({
  label,
  field,
  currentField,
  currentDir,
  onSort,
  style,
}: {
  label: string;
  field: SortField;
  currentField: SortField;
  currentDir: SortDir;
  onSort: (f: SortField) => void;
  style?: any;
}) {
  const Colors = useColors();
  const isActive = currentField === field;
  const dirLabel = isActive ? (currentDir === "asc" ? ", ascending" : ", descending") : "";
  return (
    <Pressable
      onPress={() => {
        if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onSort(field);
      }}
      hitSlop={8}
      {...a11yButton(`Sort by ${label}${dirLabel}`, "Tap to toggle sort direction")}
      style={[style, { flexDirection: "row", alignItems: "center", gap: 2 }]}
    >
      <Text style={[styles.tableHeaderText, { color: Colors.textMuted }, isActive && { color: Colors.accent }]}>{label}</Text>
      {isActive ? (
        <Ionicons
          name={currentDir === "asc" ? "caret-up" : "caret-down"}
          size={10}
          color={Colors.accent}
        />
      ) : null}
    </Pressable>
  );
}

export default function StocksScreen() {
  const Colors = useColors();
  const { code } = useLocalSearchParams<{ code: string }>();
  const insets = useSafeAreaInsets();
  const [indiaExchange, setIndiaExchange] = useState<"NSE" | "BSE">("NSE");
  const [sortField, setSortField] = useState<SortField>("rank");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const isIndia = code === "IN";
  const queryPath = isIndia && indiaExchange === "BSE"
    ? `/api/stocks/IN?exchange=BSE`
    : `/api/stocks/${code}`;

  const country = useMemo(
    () => tariffData.find((c) => c.countryCode === code),
    [code]
  );

  const { data, isLoading, error, refetch } = useQuery<StocksResponse>({
    queryKey: [queryPath],
    enabled: !!code,
    staleTime: 4 * 60 * 60 * 1000,
  });

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir(field === "rank" ? "asc" : "desc");
    }
  };

  const sortedStocks = useMemo(() => {
    if (!data?.stocks) return [];
    const stocks = [...data.stocks];
    if (sortField === "rank") {
      return sortDir === "asc" ? stocks : stocks.reverse();
    }
    if (sortField === "price") {
      stocks.sort((a, b) => {
        const pa = a.price ?? 0;
        const pb = b.price ?? 0;
        return sortDir === "asc" ? pa - pb : pb - pa;
      });
    }
    if (sortField === "marketCap") {
      stocks.sort((a, b) => {
        const ma = a.marketCap ?? 0;
        const mb = b.marketCap ?? 0;
        return sortDir === "asc" ? ma - mb : mb - ma;
      });
    }
    return stocks;
  }, [data?.stocks, sortField, sortDir]);

  const handleBack = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    router.back();
  };

  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  const countryName = country?.countryName || code || "";
  const flag = code ? getCountryFlag(code) : "";

  return (
    <View style={[styles.container, { paddingTop: topInset, backgroundColor: Colors.background }]}>
      <View style={[styles.navBar, { backgroundColor: Colors.surface, borderBottomColor: Colors.border }]}>
        <Pressable onPress={handleBack} hitSlop={12} style={styles.backButton} {...a11yButton("Go back")}>
          <Ionicons name="chevron-back" size={24} color={Colors.accent} />
        </Pressable>
        <Text style={[styles.navTitle, { color: Colors.text }]} numberOfLines={1}>
          {flag} {countryName} Stocks
        </Text>
        <View style={{ width: 40 }} />
      </View>

      {isIndia ? (
        <ExchangeTabs active={indiaExchange} onSwitch={setIndiaExchange} />
      ) : null}

      <View style={styles.headerInfo}>
        <View style={styles.headerTopRow}>
          <View style={styles.headerBadge}>
            <Ionicons name="trending-up" size={14} color={Colors.accent} />
            <Text style={styles.headerBadgeText}>
              {isIndia ? indiaExchange : (data?.exchange || "Exchange")} · Top {data?.count || 69} Listed
            </Text>
          </View>
          {data?.marketStatus ? (
            <View style={[styles.marketBadge, data.marketStatus.isOpen ? styles.marketOpen : styles.marketClosed]}>
              <View style={[styles.marketDot, { backgroundColor: data.marketStatus.isOpen ? Colors.positive : Colors.textMuted }]} />
              <Text style={[styles.marketText, { color: data.marketStatus.isOpen ? Colors.positive : Colors.textMuted }]}>
                {data.marketStatus.label}
              </Text>
            </View>
          ) : null}
        </View>
        <Text style={[styles.headerSubtitle, { color: Colors.textMuted }]}>
          Largest publicly traded companies · Prices in local currency
          {data?.lastUpdated ? ` · Updated ${formatLastUpdated(data.lastUpdated)}` : ""}
        </Text>
      </View>

      <View style={[styles.tableHeader, { backgroundColor: Colors.surfaceElevated, borderColor: Colors.border }]}>
        <SortableHeader label="#" field="rank" currentField={sortField} currentDir={sortDir} onSort={handleSort} style={styles.stockRank} />
        <View style={styles.stockInfo}>
          <Text style={[styles.tableHeaderText, { color: Colors.textMuted }]}>Company</Text>
        </View>
        <SortableHeader label="Price" field="price" currentField={sortField} currentDir={sortDir} onSort={handleSort} style={styles.stockPriceCol} />
        <SortableHeader label="Mkt Cap" field="marketCap" currentField={sortField} currentDir={sortDir} onSort={handleSort} style={styles.stockCapCol} />
      </View>

      {isLoading ? (
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color={Colors.accent} />
          <Text style={[styles.loadingText, { color: Colors.textMuted }]}>Fetching stock data...</Text>
        </View>
      ) : error ? (
        <View style={styles.centerState}>
          <Ionicons name="cloud-offline-outline" size={48} color={Colors.textMuted} />
          <Text style={[styles.errorText, { color: Colors.text }]}>Unable to load stock data</Text>
          <Pressable onPress={() => refetch()} style={[styles.retryButton, { borderColor: Colors.accent }]}>
            <Text style={[styles.retryText, { color: Colors.accent }]}>Retry</Text>
          </Pressable>
        </View>
      ) : !data?.stocks?.length ? (
        <View style={styles.centerState}>
          <Ionicons name="bar-chart-outline" size={48} color={Colors.textMuted} />
          <Text style={[styles.errorText, { color: Colors.text }]}>No stock data available for this country</Text>
        </View>
      ) : (
        <FlatList
          data={sortedStocks}
          keyExtractor={(item) => item.symbol}
          renderItem={({ item, index }) => (
            <StockRow
              item={item}
              index={index}
              displayIndex={index + 1}
            />
          )}
          ListFooterComponent={
            <Text style={[styles.disclaimer, { color: Colors.textMuted }]}>
              Stock prices are for informational purposes only. Not financial advice. Data sourced from public market feeds and may be delayed.
            </Text>
          }
          contentContainerStyle={{ paddingBottom: bottomInset + 20 }}
          showsVerticalScrollIndicator={false}
          scrollEnabled={!!sortedStocks.length}
        />
      )}
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
  exchangeTabs: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
    gap: 8,
  },
  exchangeTab: {
    flex: 1,
    minHeight: 44,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  exchangeTabActive: {
    backgroundColor: Colors.accentDim,
    borderColor: Colors.accent,
  },
  exchangeTabText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: Colors.textMuted,
  },
  exchangeTabTextActive: {
    color: Colors.accent,
  },
  headerInfo: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 6,
  },
  headerTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 8,
  },
  headerBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.accentDim,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  headerBadgeText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: Colors.accent,
  },
  marketBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  marketOpen: {
    backgroundColor: Colors.positive + "18",
  },
  marketClosed: {
    backgroundColor: Colors.surface,
  },
  marketDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  marketText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
  headerSubtitle: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
  },
  tableHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.surfaceElevated,
  },
  tableHeaderText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    color: Colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  stockRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  stockRank: {
    width: 28,
  },
  rankText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: Colors.textMuted,
  },
  stockInfo: {
    flex: 1,
    paddingRight: 6,
    minWidth: 0,
  },
  stockSymbol: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    color: Colors.accent,
  },
  stockName: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    marginTop: 1,
  },
  stockSector: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
    color: Colors.textMuted,
    marginTop: 2,
  },
  stockPriceCol: {
    width: 82,
    alignItems: "flex-end",
    paddingRight: 6,
  },
  stockPrice: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
  },
  changeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    marginTop: 2,
  },
  changeText: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
  },
  stockCapCol: {
    width: 68,
    alignItems: "flex-end",
  },
  stockCapText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    color: Colors.textSecondary,
  },
  stockExchange: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
    color: Colors.textMuted,
    marginTop: 2,
  },
  centerState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 40,
  },
  loadingText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: Colors.textSecondary,
  },
  errorText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: Colors.textMuted,
    textAlign: "center",
  },
  retryButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: Colors.accent,
    marginTop: 4,
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
    paddingTop: 16,
    paddingBottom: 8,
    lineHeight: 16,
  },
});
