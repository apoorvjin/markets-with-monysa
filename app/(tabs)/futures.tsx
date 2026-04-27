import React, { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { a11yButton, a11yLink, a11yTab } from "@/utils/accessibility";
import {
  View,
  Text,
  FlatList,
  Pressable,
  StyleSheet,
  Platform,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  Modal,
  ScrollView,
  Linking,
  Dimensions,
  PanResponder,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { getApiUrl } from "@/lib/query-client";
import StaticColors from "@/constants/colors";
import { useColors } from "@/hooks/useColors";
import ChartModal from "@/components/ChartModal";

const Colors = StaticColors; // used only by StyleSheet.create at module level

type SubTab = "indices" | "commodities" | "forex";

interface FuturesItem {
  symbol: string;
  name: string;
  price?: number;
  change?: number;
  changePercent?: number;
  currency?: string;
  flag?: string;
  region?: string;
  openTime?: string;
  category?: string;
  unit?: string;
  base?: string;
  quote?: string;
}

interface FuturesResponse {
  items: FuturesItem[];
  lastUpdated: string;
}

interface NewsArticle {
  title: string;
  publisher: string;
  link: string;
  publishedAt: string | null;
}

interface NewsData {
  articles: NewsArticle[];
  aiSummary: string;
}

interface CotMetal {
  name: string;
  emoji: string;
  symbol: string;
  description: string;
  longContracts: number;
  shortContracts: number;
  netPosition: number;
  longPct: number;
  sentiment: string;
  weekNetChange: number | null;
  weekNetChangePct: number | null;
  reportDate: string | null;
  marketName: string;
}

interface CotResponse {
  metals: CotMetal[];
  reportDate: string | null;
  lastUpdated: string;
  source: string;
  sourceUrl: string;
}

function formatPrice(price: number, decimals?: number): string {
  if (price >= 10000) return price.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (price >= 1000) return price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (price >= 100) return price.toFixed(decimals ?? 2);
  if (price >= 10) return price.toFixed(decimals ?? 3);
  if (price >= 1) return price.toFixed(decimals ?? 4);
  return price.toFixed(decimals ?? 5);
}

function formatTimestamp(isoString: string): string {
  const d = new Date(isoString);
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function formatRelativeTime(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function ChangeChip({ pct }: { pct?: number }) {
  const Colors = useColors();
  if (pct === undefined) return <Text style={[styles.noData, { color: Colors.textMuted }]}>—</Text>;
  const up = pct >= 0;
  const color = up ? Colors.positive : Colors.danger;
  const bg = up ? Colors.positiveDim : Colors.dangerDim;
  const arrow = up ? "▲" : "▼";
  return (
    <View style={[styles.chip, { backgroundColor: bg }]}>
      <Text style={[styles.chipText, { color }]}>
        {arrow} {Math.abs(pct).toFixed(2)}%
      </Text>
    </View>
  );
}

function InfoButton({ onPress }: { onPress: () => void }) {
  const Colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      style={styles.infoBtn}
      hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
      {...a11yButton("More information")}
    >
      <Ionicons name="information-circle-outline" size={19} color={Colors.accent} />
    </Pressable>
  );
}

function IndexRow({ item, onInfo, onChart }: { item: FuturesItem; onInfo: (item: FuturesItem) => void; onChart: (item: FuturesItem) => void }) {
  const Colors = useColors();
  const up = (item.changePercent ?? 0) >= 0;
  const priceColor = item.price !== undefined
    ? (up ? Colors.positive : Colors.danger)
    : Colors.textMuted;
  return (
    <Pressable
      style={({ pressed }) => [styles.row, { borderBottomColor: Colors.border }, pressed && { backgroundColor: Colors.surfaceElevated }]}
      onPress={() => onChart(item)}
      accessible={true}
      accessibilityRole="button"
      accessibilityLabel={`${item.name}, ${item.region ?? ""}, price ${item.price !== undefined ? formatPrice(item.price) : "unavailable"}${item.changePercent != null ? `, ${item.changePercent >= 0 ? "up" : "down"} ${Math.abs(item.changePercent).toFixed(2)}%` : ""}`}
      accessibilityHint="Tap to view chart"
    >
      <View style={styles.rowLeft}>
        <View style={[styles.flagWrap, { backgroundColor: Colors.surface, borderColor: Colors.border }]}>
          <Text style={styles.flagText}>{item.flag || "🌐"}</Text>
        </View>
        <View style={styles.rowInfo}>
          <Text style={[styles.rowName, { color: Colors.text }]} numberOfLines={1}>{item.name}</Text>
          <Text style={[styles.rowSub, { color: Colors.textMuted }]} numberOfLines={1}>{item.region} · {item.openTime}</Text>
        </View>
      </View>
      <View style={styles.rowRight}>
        <Text style={[styles.rowPrice, { color: priceColor }]}>
          {item.price !== undefined ? formatPrice(item.price) : "—"}
        </Text>
        <ChangeChip pct={item.changePercent} />
      </View>
      <InfoButton onPress={() => onInfo(item)} />
    </Pressable>
  );
}

function CommodityRow({ item, onInfo, onChart }: { item: FuturesItem; onInfo: (item: FuturesItem) => void; onChart: (item: FuturesItem) => void }) {
  const Colors = useColors();
  const up = (item.changePercent ?? 0) >= 0;
  const priceColor = item.price !== undefined
    ? (up ? Colors.positive : Colors.danger)
    : Colors.textMuted;
  return (
    <Pressable
      style={({ pressed }) => [styles.row, { borderBottomColor: Colors.border }, pressed && { backgroundColor: Colors.surfaceElevated }]}
      onPress={() => onChart(item)}
      accessible={true}
      accessibilityRole="button"
      accessibilityLabel={`${item.name}, ${item.category ?? ""}, price ${item.price !== undefined ? `$${formatPrice(item.price)}` : "unavailable"}${item.changePercent != null ? `, ${item.changePercent >= 0 ? "up" : "down"} ${Math.abs(item.changePercent).toFixed(2)}%` : ""}`}
      accessibilityHint="Tap to view chart"
    >
      <View style={styles.rowLeft}>
        <View style={[styles.flagWrap, { backgroundColor: Colors.surfaceElevated, borderColor: Colors.border }]}>
          <Text style={styles.flagText}>{item.flag || "📦"}</Text>
        </View>
        <View style={styles.rowInfo}>
          <Text style={[styles.rowName, { color: Colors.text }]} numberOfLines={1}>{item.name}</Text>
          <Text style={[styles.rowSub, { color: Colors.textMuted }]}>{item.category} · {item.unit}</Text>
        </View>
      </View>
      <View style={styles.rowRight}>
        <Text style={[styles.rowPrice, { color: priceColor }]}>
          {item.price !== undefined ? `$${formatPrice(item.price)}` : "—"}
        </Text>
        <ChangeChip pct={item.changePercent} />
      </View>
      <InfoButton onPress={() => onInfo(item)} />
    </Pressable>
  );
}

function ForexRow({ item, onInfo, onChart }: { item: FuturesItem; onInfo: (item: FuturesItem) => void; onChart: (item: FuturesItem) => void }) {
  const Colors = useColors();
  const up = (item.changePercent ?? 0) >= 0;
  const priceColor = item.price !== undefined
    ? (up ? Colors.positive : Colors.danger)
    : Colors.textMuted;
  return (
    <Pressable
      style={({ pressed }) => [styles.row, { borderBottomColor: Colors.border }, pressed && { backgroundColor: Colors.surfaceElevated }]}
      onPress={() => onChart(item)}
      accessible={true}
      accessibilityRole="button"
      accessibilityLabel={`${item.name}, ${item.base ?? ""} to ${item.quote ?? ""}, rate ${item.price !== undefined ? formatPrice(item.price) : "unavailable"}${item.changePercent != null ? `, ${item.changePercent >= 0 ? "up" : "down"} ${Math.abs(item.changePercent).toFixed(2)}%` : ""}`}
      accessibilityHint="Tap to view chart"
    >
      <View style={styles.rowLeft}>
        <View style={[styles.flagWrap, { backgroundColor: Colors.surfaceElevated, borderColor: Colors.border }]}>
          <Text style={[styles.flagText, { fontSize: 13 }]}>{item.flag || "💱"}</Text>
        </View>
        <View style={styles.rowInfo}>
          <Text style={[styles.rowName, { color: Colors.text }]}>{item.name}</Text>
          <Text style={[styles.rowSub, { color: Colors.textMuted }]} numberOfLines={1}>{item.base} → {item.quote}</Text>
        </View>
      </View>
      <View style={styles.rowRight}>
        <Text style={[styles.rowPrice, { color: priceColor }]}>
          {item.price !== undefined ? formatPrice(item.price) : "—"}
        </Text>
        <ChangeChip pct={item.changePercent} />
      </View>
      <InfoButton onPress={() => onInfo(item)} />
    </Pressable>
  );
}

function CategoryBadge({ label }: { label: string }) {
  return (
    <View style={styles.categoryRow}>
      <View style={styles.categoryLine} />
      <Text style={styles.categoryLabel}>{label.toUpperCase()}</Text>
      <View style={styles.categoryLine} />
    </View>
  );
}

function FlatListWithCategories({
  data,
  renderItem,
  categoryKey,
  refreshing,
  onRefresh,
  bottomInset,
}: {
  data: FuturesItem[];
  renderItem: (item: FuturesItem) => React.ReactElement;
  categoryKey?: string;
  refreshing: boolean;
  onRefresh: () => void;
  bottomInset: number;
}) {
  type ListItem = { type: "category"; label: string } | { type: "item"; data: FuturesItem };

  const listData: ListItem[] = useMemo(() => {
    if (!categoryKey) return data.map(d => ({ type: "item" as const, data: d }));
    const result: ListItem[] = [];
    let lastCat = "";
    for (const item of data) {
      const cat = (item as any)[categoryKey] || "Other";
      if (cat !== lastCat) {
        result.push({ type: "category", label: cat });
        lastCat = cat;
      }
      result.push({ type: "item", data: item });
    }
    return result;
  }, [data, categoryKey]);

  return (
    <FlatList
      data={listData}
      keyExtractor={(item, idx) =>
        item.type === "category" ? `cat-${item.label}` : `item-${(item as any).data.symbol}-${idx}`
      }
      renderItem={({ item }) => {
        if (item.type === "category") return <CategoryBadge label={item.label} />;
        return renderItem(item.data);
      }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.accent} />
      }
      contentContainerStyle={{ paddingBottom: bottomInset + 20 }}
      showsVerticalScrollIndicator={false}
    />
  );
}

// ─── News Article Card ────────────────────────────────────────────────────────

function openLink(url: string) {
  if (!url) return;
  if (Platform.OS === "web") {
    if (typeof window !== "undefined") {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  } else {
    Linking.openURL(url);
  }
}

function NewsCard({ article, index }: { article: NewsArticle; index: number }) {
  const Colors = useColors();
  const timeAgo = article.publishedAt ? formatRelativeTime(article.publishedAt) : "";
  return (
    <Pressable
      style={({ pressed }) => [mStyles.newsCard, pressed && { opacity: 0.75 }]}
      onPress={() => openLink(article.link)}
      accessible={true}
      accessibilityRole="link"
      accessibilityLabel={`${article.title}${article.publisher ? `, ${article.publisher}` : ""}${timeAgo ? `, ${timeAgo}` : ""}`}
      accessibilityHint="Opens article in browser"
    >
      <View style={mStyles.newsCardInner}>
        <View style={mStyles.newsIndex}>
          <Text style={mStyles.newsIndexText}>{index + 1}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={mStyles.newsTitle} numberOfLines={3}>{article.title}</Text>
          <View style={mStyles.newsMeta}>
            <Text style={mStyles.newsPublisher}>{article.publisher}</Text>
            {timeAgo ? <Text style={mStyles.newsTime}> · {timeAgo}</Text> : null}
            <View style={{ flex: 1 }} />
            <Ionicons name="open-outline" size={12} color={Colors.textMuted} />
          </View>
        </View>
      </View>
    </Pressable>
  );
}

// ─── News Modal ───────────────────────────────────────────────────────────────

const SHEET_HEIGHT = Dimensions.get("window").height * 0.72;

function NewsModal({
  visible,
  item,
  type,
  onClose,
}: {
  visible: boolean;
  item: FuturesItem | null;
  type: SubTab;
  onClose: () => void;
}) {
  const Colors = useColors();
  const [newsData, setNewsData] = useState<NewsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const insets = useSafeAreaInsets();
  useEffect(() => {
    if (!visible || !item) return;
    setNewsData(null);
    setError(null);
    setLoading(true);
    let cancelled = false;
    const url = new URL("/api/futures/news", getApiUrl());
    url.searchParams.set("symbol", item.symbol);
    url.searchParams.set("name", item.name);
    url.searchParams.set("type", type);
    fetch(url.toString())
      .then(r => r.json())
      .then((data: NewsData) => { if (!cancelled) { setNewsData(data); setLoading(false); } })
      .catch(() => { if (!cancelled) { setError("Could not load news. Please try again."); setLoading(false); } });
    return () => { cancelled = true; };
  }, [visible, item?.symbol]);

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const infoPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gs) => gs.dy > 5,
      onPanResponderRelease: (_, gs) => { if (gs.dy > 60) onCloseRef.current(); },
    })
  ).current;

  if (!item) return null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={mStyles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[mStyles.sheet, { paddingBottom: insets.bottom + 12 }]}>
          {/* Drag handle — drag down to dismiss */}
          <View style={mStyles.handleWrap} {...infoPan.panHandlers}>
            <View style={mStyles.handle} />
          </View>

          {/* Sheet header */}
          <View style={mStyles.sheetHeader}>
            <View style={{ flex: 1 }}>
              <Text style={mStyles.sheetTitle} numberOfLines={1}>{item.name}</Text>
              <View style={mStyles.sheetSubRow}>
                <Text style={mStyles.sheetSub}>{item.symbol}</Text>
                <View style={mStyles.instrumentBadge}>
                  <Ionicons name="newspaper-outline" size={10} color={Colors.accent} />
                  <Text style={mStyles.instrumentBadgeText}>
                    News for this {type === "forex" ? "pair" : type === "commodities" ? "commodity" : "index"}
                  </Text>
                </View>
              </View>
            </View>
            <Pressable onPress={onClose} style={mStyles.closeBtn} hitSlop={8} {...a11yButton("Close")}>
              <Ionicons name="close" size={18} color={Colors.textMuted} />
            </Pressable>
          </View>

          {/* Divider */}
          <View style={mStyles.divider} />

          <ScrollView
            style={{ flex: 1 }}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 8 }}
          >
            {loading && (
              <View style={mStyles.loadingWrap}>
                <ActivityIndicator color={Colors.accent} size="large" />
                <Text style={mStyles.loadingText}>Loading news for {item.name}…</Text>
              </View>
            )}

            {!!error && !loading && (
              <View style={mStyles.errorWrap}>
                <Ionicons name="alert-circle-outline" size={28} color={Colors.danger} />
                <Text style={mStyles.errorText}>{error}</Text>
              </View>
            )}

            {newsData && !loading && (
              <>
                {/* PART 1 — News */}
                <View style={mStyles.section}>
                  <View style={mStyles.sectionHeader}>
                    <Ionicons name="newspaper-outline" size={13} color={Colors.accent} />
                    <Text style={mStyles.sectionLabel}>LATEST NEWS · {item.symbol}</Text>
                  </View>
                  {newsData.articles.length === 0 ? (
                    <Text style={mStyles.emptyText}>No recent news found for {item.name}.</Text>
                  ) : (
                    newsData.articles.map((article, i) => (
                      <NewsCard key={i} article={article} index={i} />
                    ))
                  )}
                </View>

                {/* PART 2 — AI Price Action */}
                {!!newsData.aiSummary && (
                  <View style={[mStyles.section, mStyles.aiSection]}>
                    <View style={mStyles.sectionHeader}>
                      <Ionicons name="flash" size={13} color="#FFB800" />
                      <Text style={[mStyles.sectionLabel, { color: "#FFB800" }]}>
                        AI PRICE ACTION · {item.name}
                      </Text>
                    </View>
                    <Text style={mStyles.aiText}>{newsData.aiSummary}</Text>
                    <View style={mStyles.aiFooter}>
                      <Ionicons name="sparkles-outline" size={10} color={Colors.textMuted} />
                      <Text style={mStyles.aiFooterText}>AI-generated · Not financial advice</Text>
                    </View>
                  </View>
                )}
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ─── Sub-tab content components ───────────────────────────────────────────────

function IndicesTab({ bottomInset }: { bottomInset: number }) {
  const Colors = useColors();
  const [search, setSearch] = useState("");
  const [selectedItem, setSelectedItem] = useState<FuturesItem | null>(null);
  const [chartItem, setChartItem] = useState<FuturesItem | null>(null);
  const { data, isLoading, isRefetching, refetch } = useQuery<FuturesResponse>({
    queryKey: ["/api/futures/indices"],
    staleTime: 10 * 60 * 1000,
  });

  const filtered = useMemo(() => {
    const items = data?.items ?? [];
    if (!search.trim()) return items;
    const q = search.toLowerCase();
    return items.filter(i =>
      i.name.toLowerCase().includes(q) ||
      (i.region || "").toLowerCase().includes(q)
    );
  }, [data?.items, search]);

  if (isLoading) {
    return <View style={styles.center}><ActivityIndicator color={Colors.accent} size="large" /></View>;
  }

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.searchBar}>
        <Ionicons name="search-outline" size={15} color={Colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search index or country..."
          placeholderTextColor={Colors.textMuted}
          value={search}
          onChangeText={setSearch}
        />
        {search.length > 0 && (
          <Pressable onPress={() => setSearch("")} hitSlop={15} {...a11yButton("Clear search")}>
            <Ionicons name="close-circle" size={15} color={Colors.textMuted} />
          </Pressable>
        )}
      </View>
      <FlatListWithCategories
        data={filtered}
        renderItem={(item) => <IndexRow item={item} onInfo={setSelectedItem} onChart={setChartItem} />}
        refreshing={isRefetching}
        onRefresh={refetch}
        bottomInset={bottomInset}
      />
      <NewsModal
        visible={!!selectedItem}
        item={selectedItem}
        type="indices"
        onClose={() => setSelectedItem(null)}
      />
      {chartItem && (
        <ChartModal
          visible={!!chartItem}
          onClose={() => setChartItem(null)}
          symbol={chartItem.symbol}
          name={chartItem.name}
          flag={chartItem.flag}
          changePercent={chartItem.changePercent}
          price={chartItem.price}
          type="indices"
        />
      )}
    </View>
  );
}

// ─── Hedge Fund (COT) metals view ────────────────────────────────────────────

function sentimentColor(s: string, C: typeof StaticColors): string {
  if (s === "Strongly Bullish") return C.positive;
  if (s === "Bullish")          return "#52C41A";
  if (s === "Neutral")          return C.textMuted;
  if (s === "Bearish")          return C.warning;
  return C.danger;
}

function fmtContracts(n: number): string {
  if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (Math.abs(n) >= 1_000)     return (n / 1_000).toFixed(1) + "K";
  return n.toLocaleString();
}

function fmtDate(s: string | null): string {
  if (!s) return "—";
  const d = new Date(s);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// ─── Price impact analysis ─────────────────────────────────────────────────────

type ImpactSignal = {
  label: string;
  icon: string;
  color: string;
  bullets: string[];
  crowdingAlert: string | null;
};

function getPriceImpact(metal: CotMetal, C: typeof StaticColors): ImpactSignal {
  const { longPct, netPosition, weekNetChange, name } = metal;
  const wkChg     = weekNetChange ?? 0;
  const crowdedLong  = longPct > 75;
  const crowdedShort = (100 - longPct) > 70;
  const netBullish   = netPosition > 0;
  const significant  = Math.abs(wkChg) > 300;

  let label: string;
  let icon: string;
  let color: string;
  let bullets: string[];

  if (netBullish && significant && wkChg > 0) {
    label = "Institutional Buying";
    icon  = "trending-up";
    color = C.positive;
    bullets = [
      `Managed money added ${fmtContracts(wkChg)} net contracts this week — fresh capital entering ${name} futures.`,
      `Sustained accumulation typically precedes price appreciation as institutional demand absorbs available supply.`,
    ];
  } else if (netBullish && significant && wkChg < 0) {
    label = "Profit-Taking";
    icon  = "trending-down";
    color = C.warning;
    bullets = [
      `Longs trimmed by ${fmtContracts(Math.abs(wkChg))} contracts — hedge funds locking in gains despite overall bullish stance.`,
      `Selling by longs can create near-term price headwinds even when the structural bias remains positive.`,
    ];
  } else if (!netBullish && significant && wkChg < 0) {
    label = "Bearish Conviction";
    icon  = "arrow-down-circle";
    color = C.danger;
    bullets = [
      `Managed money added ${fmtContracts(Math.abs(wkChg))} short contracts — active directional bets against ${name}.`,
      `Rising short interest creates direct selling pressure on futures and can push spot prices lower.`,
    ];
  } else if (!netBullish && significant && wkChg > 0) {
    label = "Short-Covering Rally";
    icon  = "flash";
    color = "#52C41A";
    bullets = [
      `Shorts being closed out by ${fmtContracts(wkChg)} contracts — bearish conviction is fading.`,
      `Short-covering forces bears to buy back, generating sharp upside moves even without fresh bullish catalysts.`,
    ];
  } else if (netBullish && !significant) {
    label = "Steady Hold";
    icon  = "pause-circle";
    color = C.textMuted;
    bullets = [
      `${name} positioning is stable — hedge funds are holding existing longs without aggressive additions or exits.`,
      `Prices may consolidate near current levels; a macro catalyst is needed to drive the next directional leg.`,
    ];
  } else {
    label = "Neutral / Range-Bound";
    icon  = "remove-circle-outline";
    color = C.textMuted;
    bullets = [
      `No strong directional conviction from managed money — neither bulls nor bears are pressing their bets.`,
      `Sideways price action likely until a fundamental or macro driver forces a position reset.`,
    ];
  }

  let crowdingAlert: string | null = null;
  if (crowdedLong) {
    crowdingAlert = `Crowded Long (${longPct.toFixed(1)}% long) — if sentiment turns, a leveraged unwind could sharply accelerate a selloff.`;
  } else if (crowdedShort) {
    crowdingAlert = `Crowded Short — vulnerable to a violent short-squeeze rally if a positive catalyst emerges unexpectedly.`;
  }

  return { label, icon, color, bullets, crowdingAlert };
}

function PriceImpactSection({ metal }: { metal: CotMetal }) {
  const Colors = useColors();
  const impact = getPriceImpact(metal, Colors);
  return (
    <View style={cotStyles.impactSection}>
      <View style={cotStyles.impactHeader}>
        <Ionicons name="pulse-outline" size={11} color={Colors.accent} />
        <Text style={[cotStyles.impactTitle, { color: Colors.textMuted }]}>PRICE IMPACT ANALYSIS</Text>
      </View>

      <View style={[cotStyles.impactSignal, { backgroundColor: impact.color + "15", borderColor: impact.color + "55" }]}>
        <Ionicons name={impact.icon as any} size={13} color={impact.color} />
        <Text style={[cotStyles.impactSignalText, { color: impact.color }]}>{impact.label}</Text>
      </View>

      {impact.bullets.map((b, i) => (
        <View key={i} style={cotStyles.impactBullet}>
          <View style={[cotStyles.impactDot, { backgroundColor: impact.color }]} />
          <Text style={cotStyles.impactBulletText}>{b}</Text>
        </View>
      ))}

      {impact.crowdingAlert && (
        <View style={cotStyles.crowdingAlert}>
          <Ionicons name="warning-outline" size={12} color={Colors.warning} style={{ marginTop: 1 }} />
          <Text style={cotStyles.crowdingAlertText}>{impact.crowdingAlert}</Text>
        </View>
      )}
    </View>
  );
}

function CotMetalCard({ metal, onChart }: { metal: CotMetal; onChart: (m: CotMetal) => void }) {
  const Colors = useColors();
  const sentCol = sentimentColor(metal.sentiment, Colors);
  const isNet   = metal.netPosition !== 0;
  const up      = metal.netPosition >= 0;
  const weekUp  = (metal.weekNetChange ?? 0) >= 0;
  const longW   = metal.longPct;
  const shortW  = 100 - longW;

  return (
    <Pressable
      style={({ pressed }) => [cotStyles.card, pressed && { opacity: 0.88 }]}
      onPress={() => onChart(metal)}
    >
      {/* Header row */}
      <View style={cotStyles.cardHeader}>
        <View style={cotStyles.cardLeft}>
          <Text style={cotStyles.cardEmoji}>{metal.emoji}</Text>
          <View>
            <Text style={cotStyles.cardName}>{metal.name}</Text>
            <Text style={cotStyles.cardSub} numberOfLines={1}>{metal.description}</Text>
          </View>
        </View>
        <View style={[cotStyles.sentimentBadge, { backgroundColor: sentCol + "22", borderColor: sentCol + "55" }]}>
          <Text style={[cotStyles.sentimentText, { color: sentCol }]}>{metal.sentiment}</Text>
        </View>
      </View>

      {/* Long/Short bar */}
      <View style={cotStyles.barSection}>
        <View style={cotStyles.barLabels}>
          <Text style={[cotStyles.barLabel, { color: Colors.positive }]}>LONG  {longW.toFixed(1)}%</Text>
          <Text style={[cotStyles.barLabel, { color: Colors.danger }]}>{shortW.toFixed(1)}%  SHORT</Text>
        </View>
        <View style={cotStyles.barTrack}>
          <View style={[cotStyles.barLong,  { flex: longW }]} />
          <View style={[cotStyles.barShort, { flex: shortW }]} />
        </View>
        <View style={cotStyles.barContracts}>
          <Text style={cotStyles.contractNum}>{fmtContracts(metal.longContracts)} long</Text>
          <Text style={cotStyles.contractNum}>{fmtContracts(metal.shortContracts)} short</Text>
        </View>
      </View>

      {/* Net position + week change */}
      <View style={cotStyles.statsRow}>
        <View style={cotStyles.statBox}>
          <Text style={cotStyles.statLabel}>NET POSITION</Text>
          <Text style={[cotStyles.statValue, { color: isNet ? (up ? Colors.positive : Colors.danger) : Colors.textMuted }]}>
            {up ? "+" : ""}{fmtContracts(metal.netPosition)}
          </Text>
        </View>
        <View style={cotStyles.statDivider} />
        <View style={cotStyles.statBox}>
          <Text style={cotStyles.statLabel}>WEEK CHANGE</Text>
          <Text style={[cotStyles.statValue, { color: metal.weekNetChange != null ? (weekUp ? Colors.positive : Colors.danger) : Colors.textMuted }]}>
            {metal.weekNetChange != null
              ? `${weekUp ? "+" : ""}${fmtContracts(metal.weekNetChange)}`
              : "—"}
          </Text>
        </View>
        <View style={cotStyles.statDivider} />
        <View style={cotStyles.statBox}>
          <Text style={cotStyles.statLabel}>WK CHG %</Text>
          <Text style={[cotStyles.statValue, { color: metal.weekNetChangePct != null ? (weekUp ? Colors.positive : Colors.danger) : Colors.textMuted }]}>
            {metal.weekNetChangePct != null
              ? `${weekUp ? "+" : ""}${metal.weekNetChangePct.toFixed(1)}%`
              : "—"}
          </Text>
        </View>
      </View>

      {/* Price impact analysis */}
      <PriceImpactSection metal={metal} />

      {/* Report date */}
      <View style={cotStyles.cardFooter}>
        <Ionicons name="calendar-outline" size={10} color={Colors.textMuted} />
        <Text style={cotStyles.footerText}>COT Report: {fmtDate(metal.reportDate)}</Text>
        <View style={{ flex: 1 }} />
        <Ionicons name="bar-chart-outline" size={10} color={Colors.accent} />
      </View>
    </Pressable>
  );
}

function HedgeFundMetalsView({ bottomInset, onChart }: {
  bottomInset: number;
  onChart: (metal: CotMetal) => void;
}) {
  const Colors = useColors();
  const { data, isLoading, isRefetching, refetch } = useQuery<CotResponse>({
    queryKey: ["/api/futures/cot-metals"],
    staleTime: 4 * 60 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={Colors.accent} size="large" />
        <Text style={{ color: Colors.textMuted, fontSize: 12, marginTop: 12, fontFamily: "Inter_400Regular" }}>
          Loading CFTC data…
        </Text>
      </View>
    );
  }

  if (!data || !data.metals?.length) {
    return (
      <View style={styles.center}>
        <Ionicons name="alert-circle-outline" size={32} color={Colors.textMuted} />
        <Text style={{ color: Colors.textMuted, fontSize: 13, marginTop: 10, fontFamily: "Inter_400Regular" }}>
          Could not load COT data
        </Text>
        <Pressable onPress={() => refetch()} style={{ marginTop: 12 }}>
          <Text style={{ color: Colors.accent, fontFamily: "Inter_500Medium", fontSize: 13 }}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={Colors.accent} />}
      contentContainerStyle={{ paddingBottom: bottomInset + 16 }}
      showsVerticalScrollIndicator={false}
    >
      {/* Source attribution banner */}
      <View style={cotStyles.sourceBanner}>
        <Ionicons name="shield-checkmark-outline" size={13} color={Colors.accent} />
        <Text style={cotStyles.sourceText}>
          Source: <Text style={{ color: Colors.accent }}>CFTC Disaggregated COT Report</Text>  ·  Managed Money positions  ·  Updated weekly (Fridays)
        </Text>
      </View>

      {/* Explainer card */}
      <View style={cotStyles.explainer}>
        <Text style={cotStyles.explainerTitle}>How to read this</Text>
        <Text style={cotStyles.explainerBody}>
          Hedge funds and CTAs report their futures positions to the CFTC every week.{"\n"}
          • <Text style={{ color: Colors.positive }}>Long</Text> = betting the metal price goes up{"\n"}
          • <Text style={{ color: Colors.danger }}>Short</Text> = betting the price goes down{"\n"}
          • <Text style={{ color: Colors.text }}>Net Position</Text> = (longs − shorts). Positive = bullish bias{"\n"}
          • "Week Change" shows the shift in net contracts vs. last week's report
        </Text>
      </View>

      {/* Metal cards */}
      {data.metals.map((metal) => (
        <CotMetalCard key={metal.name} metal={metal} onChart={onChart} />
      ))}

      {/* Report date footer */}
      {data.reportDate && (
        <Pressable
          onPress={() => Linking.openURL("https://www.cftc.gov/MarketReports/CommitmentsofTraders/index.htm")}
          style={cotStyles.cftcLink}
          {...a11yLink(`View full CFTC report, data as of ${fmtDate(data.reportDate)}`, "Opens CFTC website in browser")}
        >
          <Ionicons name="open-outline" size={11} color={Colors.textMuted} />
          <Text style={cotStyles.cftcLinkText}>
            Data as of {fmtDate(data.reportDate)}  ·  View full CFTC report ↗
          </Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

function CommoditiesTab({ bottomInset }: { bottomInset: number }) {
  const Colors = useColors();
  const [view, setView] = useState<"prices" | "hedgefunds">("prices");
  const [selectedItem, setSelectedItem] = useState<FuturesItem | null>(null);
  const [chartItem, setChartItem] = useState<FuturesItem | null>(null);
  const [cotChartItem, setCotChartItem] = useState<CotMetal | null>(null);

  const { data, isLoading, isRefetching, refetch } = useQuery<FuturesResponse>({
    queryKey: ["/api/futures/commodities"],
    staleTime: 10 * 60 * 1000,
  });

  if (isLoading && view === "prices") {
    return <View style={styles.center}><ActivityIndicator color={Colors.accent} size="large" /></View>;
  }

  const items = data?.items ?? [];
  return (
    <View style={{ flex: 1 }}>
      {/* View toggle */}
      <View style={cotStyles.viewToggle}>
        <Pressable
          hitSlop={{ top: 8, bottom: 8 }}
          style={[cotStyles.viewToggleBtn, view === "prices" && cotStyles.viewToggleBtnActive]}
          onPress={() => setView("prices")}
          {...a11yTab("Prices", view === "prices")}
        >
          <Ionicons name="trending-up" size={12} color={view === "prices" ? Colors.accent : Colors.textMuted} />
          <Text style={[cotStyles.viewToggleText, view === "prices" && { color: Colors.accent }]}>Prices</Text>
        </Pressable>
        <Pressable
          hitSlop={{ top: 8, bottom: 8 }}
          style={[cotStyles.viewToggleBtn, view === "hedgefunds" && cotStyles.viewToggleBtnActive]}
          onPress={() => setView("hedgefunds")}
          {...a11yTab("Hedge Funds", view === "hedgefunds")}
        >
          <Ionicons name="business" size={12} color={view === "hedgefunds" ? Colors.accent : Colors.textMuted} />
          <Text style={[cotStyles.viewToggleText, view === "hedgefunds" && { color: Colors.accent }]}>Hedge Funds</Text>
        </Pressable>
      </View>

      {view === "prices" ? (
        <>
          <FlatListWithCategories
            data={items}
            renderItem={(item) => <CommodityRow item={item} onInfo={setSelectedItem} onChart={setChartItem} />}
            categoryKey="category"
            refreshing={isRefetching}
            onRefresh={refetch}
            bottomInset={bottomInset}
          />
          <NewsModal
            visible={!!selectedItem}
            item={selectedItem}
            type="commodities"
            onClose={() => setSelectedItem(null)}
          />
          {chartItem && (
            <ChartModal
              visible={!!chartItem}
              onClose={() => setChartItem(null)}
              symbol={chartItem.symbol}
              name={chartItem.name}
              flag={chartItem.flag}
              changePercent={chartItem.changePercent}
              price={chartItem.price}
              type="commodities"
            />
          )}
        </>
      ) : (
        <>
          <HedgeFundMetalsView
            bottomInset={bottomInset}
            onChart={(m) => setCotChartItem(m)}
          />
          {cotChartItem && (
            <ChartModal
              visible={!!cotChartItem}
              onClose={() => setCotChartItem(null)}
              symbol={cotChartItem.symbol}
              name={cotChartItem.name}
              flag={cotChartItem.emoji}
              changePercent={undefined}
              price={undefined}
              type="commodities"
            />
          )}
        </>
      )}
    </View>
  );
}

function ForexTab({ bottomInset }: { bottomInset: number }) {
  const Colors = useColors();
  const [search, setSearch] = useState("");
  const [selectedItem, setSelectedItem] = useState<FuturesItem | null>(null);
  const [chartItem, setChartItem] = useState<FuturesItem | null>(null);
  const { data, isLoading, isRefetching, refetch } = useQuery<FuturesResponse>({
    queryKey: ["/api/futures/forex"],
    staleTime: 10 * 60 * 1000,
  });

  const filtered = useMemo(() => {
    const items = data?.items ?? [];
    if (!search.trim()) return items;
    const q = search.toLowerCase();
    return items.filter(i =>
      i.name.toLowerCase().includes(q) ||
      (i.base || "").toLowerCase().includes(q) ||
      (i.quote || "").toLowerCase().includes(q)
    );
  }, [data?.items, search]);

  if (isLoading) {
    return <View style={styles.center}><ActivityIndicator color={Colors.accent} size="large" /></View>;
  }

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.searchBar}>
        <Ionicons name="search-outline" size={15} color={Colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search currency pair..."
          placeholderTextColor={Colors.textMuted}
          value={search}
          onChangeText={setSearch}
        />
        {search.length > 0 && (
          <Pressable onPress={() => setSearch("")} hitSlop={15} {...a11yButton("Clear search")}>
            <Ionicons name="close-circle" size={15} color={Colors.textMuted} />
          </Pressable>
        )}
      </View>
      <FlatListWithCategories
        data={filtered}
        renderItem={(item) => <ForexRow item={item} onInfo={setSelectedItem} onChart={setChartItem} />}
        categoryKey="category"
        refreshing={isRefetching}
        onRefresh={refetch}
        bottomInset={bottomInset}
      />
      <NewsModal
        visible={!!selectedItem}
        item={selectedItem}
        type="forex"
        onClose={() => setSelectedItem(null)}
      />
      {chartItem && (
        <ChartModal
          visible={!!chartItem}
          onClose={() => setChartItem(null)}
          symbol={chartItem.symbol}
          name={chartItem.name}
          flag={chartItem.flag}
          changePercent={chartItem.changePercent}
          price={chartItem.price}
          type="forex"
        />
      )}
    </View>
  );
}

// ─── Root screen ──────────────────────────────────────────────────────────────

const SUB_TABS: { key: SubTab; label: string; icon: string }[] = [
  { key: "indices",     label: "Index",       icon: "bar-chart" },
  { key: "commodities", label: "Commodities", icon: "cube" },
  { key: "forex",       label: "Forex",       icon: "swap-horizontal" },
];

export default function FuturesScreen() {
  const Colors = useColors();
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<SubTab>("indices");

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  const subTabData = useQuery<FuturesResponse>({
    queryKey: [`/api/futures/${activeTab}`],
    staleTime: 10 * 60 * 1000,
  });

  const lastUpdated = subTabData.data?.lastUpdated;

  return (
    <View style={[styles.container, { paddingTop: topPad, backgroundColor: Colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: Colors.background }]}>
        <View>
          <Text style={[styles.headerTitle, { color: Colors.text }]}>Markets</Text>
          <Text style={[styles.headerSub, { color: Colors.textMuted }]}>Global Futures & Forex</Text>
        </View>
        <View style={styles.headerRight}>
          {lastUpdated && (
            <Text style={[styles.refreshedText, { color: Colors.textMuted }]}>
              {formatTimestamp(lastUpdated)}
            </Text>
          )}
          <View style={styles.liveDot} />
        </View>
      </View>

      {/* Sub-tab Switcher */}
      <View style={[styles.subTabBar, { backgroundColor: Colors.surface }]}>
        {SUB_TABS.map(tab => {
          const active = activeTab === tab.key;
          return (
            <Pressable
              key={tab.key}
              hitSlop={{ top: 6, bottom: 6 }}
              style={[styles.subTab, active && [styles.subTabActive, { backgroundColor: Colors.surfaceElevated, borderColor: Colors.border }]]}
              onPress={() => setActiveTab(tab.key)}
              {...a11yTab(tab.label, active)}
            >
              <Ionicons
                name={tab.icon as any}
                size={15}
                color={active ? Colors.accent : Colors.textMuted}
                style={{ marginRight: 5 }}
              />
              <Text style={[styles.subTabText, { color: Colors.textMuted }, active && { color: Colors.accent }]}>
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Column Headers */}
      <View style={[styles.colHeader, { borderBottomColor: Colors.border }]}>
        <Text style={[styles.colHeaderLeft, { color: Colors.textMuted }]}>
          {activeTab === "indices"
            ? "Index / Exchange"
            : activeTab === "commodities"
            ? "Commodity / Category"
            : "Pair / Description"}
        </Text>
        <Text style={styles.colHeaderRight}>Price · Change  ⓘ</Text>
      </View>

      {/* Content */}
      <View style={{ flex: 1 }}>
        {activeTab === "indices" && <IndicesTab bottomInset={bottomInset} />}
        {activeTab === "commodities" && <CommoditiesTab bottomInset={bottomInset} />}
        {activeTab === "forex" && <ForexTab bottomInset={bottomInset} />}
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
  },
  headerTitle: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
    letterSpacing: -0.3,
  },
  headerSub: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.textMuted,
    marginTop: 2,
  },
  headerRight: { alignItems: "flex-end", gap: 4 },
  refreshedText: { fontSize: 10, fontFamily: "Inter_400Regular", color: Colors.textMuted },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.accent, alignSelf: "flex-end" },
  subTabBar: {
    flexDirection: "row",
    marginHorizontal: 16,
    marginBottom: 10,
    backgroundColor: Colors.surface,
    borderRadius: 10,
    padding: 4,
    gap: 2,
  },
  subTab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
    paddingVertical: 8,
    borderRadius: 8,
  },
  subTabActive: { backgroundColor: Colors.surfaceElevated, borderWidth: 1, borderColor: Colors.border },
  subTabText: { fontSize: 12, fontFamily: "Inter_500Medium", color: Colors.textMuted },
  subTabTextActive: { color: Colors.accent, fontFamily: "Inter_600SemiBold" },
  colHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  colHeaderLeft: {
    fontSize: 10,
    fontFamily: "Inter_500Medium",
    color: Colors.textMuted,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  colHeaderRight: {
    fontSize: 10,
    fontFamily: "Inter_500Medium",
    color: Colors.textMuted,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 4,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    gap: 6,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.text,
    padding: 0,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  rowPressed: {
    backgroundColor: Colors.surfaceElevated,
  },
  rowLeft: { flexDirection: "row", alignItems: "center", flex: 1, gap: 10 },
  flagWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.surface,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Colors.border,
    flexShrink: 0,
  },
  flagText: { fontSize: 18 },
  rowInfo: { flex: 1 },
  rowName: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: Colors.text, marginBottom: 2 },
  rowSub: { fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.textMuted },
  rowRight: { alignItems: "flex-end", gap: 4, minWidth: 84 },
  rowPrice: { fontSize: 14, fontFamily: "Inter_700Bold", letterSpacing: -0.3 },
  chip: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  chipText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  noData: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.textMuted },
  infoBtn: { marginLeft: 8, padding: 2 },
  categoryRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  categoryLine: { flex: 1, height: 1, backgroundColor: Colors.border },
  categoryLabel: { fontSize: 10, fontFamily: "Inter_600SemiBold", color: Colors.textMuted, letterSpacing: 1.5 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
});

// ─── Modal styles ─────────────────────────────────────────────────────────────

const mStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    height: SHEET_HEIGHT,
    paddingTop: 10,
  },
  handleWrap: { alignSelf: "stretch", alignItems: "center", paddingVertical: 8 },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingBottom: 12,
    gap: 10,
  },
  sheetTitle: {
    fontSize: 17,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
    letterSpacing: -0.2,
  },
  sheetSubRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 3,
    flexWrap: "wrap",
  },
  sheetSub: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.textMuted,
  },
  instrumentBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.accentDim,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  instrumentBadgeText: {
    fontSize: 10,
    fontFamily: "Inter_500Medium",
    color: Colors.accent,
  },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: Colors.surfaceElevated,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  divider: { height: 1, backgroundColor: Colors.border, marginHorizontal: 18, marginBottom: 4 },
  loadingWrap: { alignItems: "center", paddingTop: 40, paddingBottom: 20, gap: 12 },
  loadingText: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.textMuted },
  errorWrap: { alignItems: "center", paddingTop: 40, gap: 10 },
  errorText: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.danger, textAlign: "center" },
  emptyText: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.textMuted, paddingVertical: 16, textAlign: "center" },
  section: { paddingHorizontal: 18, paddingTop: 16 },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 12,
  },
  sectionLabel: {
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    color: Colors.accent,
    letterSpacing: 1.2,
  },
  newsCard: {
    backgroundColor: Colors.surfaceElevated,
    borderRadius: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: "hidden",
  },
  newsCardInner: {
    flexDirection: "row",
    padding: 12,
    gap: 10,
    alignItems: "flex-start",
  },
  newsIndex: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Colors.accent + "25",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    marginTop: 1,
  },
  newsIndexText: { fontSize: 10, fontFamily: "Inter_700Bold", color: Colors.accent },
  newsTitle: { fontSize: 13, fontFamily: "Inter_500Medium", color: Colors.text, lineHeight: 18 },
  newsMeta: { flexDirection: "row", alignItems: "center", marginTop: 5 },
  newsPublisher: { fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.textMuted },
  newsTime: { fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.textMuted },
  aiSection: {
    backgroundColor: "#FFB80010",
    marginHorizontal: 18,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#FFB80030",
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 14,
    marginTop: 4,
    marginBottom: 8,
  },
  aiText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.text,
    lineHeight: 20,
  },
  aiFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 10,
  },
  aiFooterText: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
    color: Colors.textMuted,
  },
});

// ─── COT / Hedge Fund styles ───────────────────────────────────────────────────

const cotStyles = StyleSheet.create({
  viewToggle: {
    flexDirection: "row",
    marginHorizontal: 16,
    marginBottom: 10,
    backgroundColor: Colors.surface,
    borderRadius: 10,
    padding: 4,
    gap: 4,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  viewToggleBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 7,
    borderRadius: 8,
    gap: 5,
  },
  viewToggleBtnActive: {
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  viewToggleText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: Colors.textMuted,
  },
  sourceBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginHorizontal: 16,
    marginBottom: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: Colors.accentDim,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.accent + "30",
  },
  sourceText: {
    flex: 1,
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: Colors.textMuted,
    lineHeight: 16,
  },
  explainer: {
    marginHorizontal: 16,
    marginBottom: 10,
    padding: 14,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  explainerTitle: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
    marginBottom: 6,
  },
  explainerBody: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    lineHeight: 19,
  },
  card: {
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
    overflow: "hidden",
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 12,
    gap: 8,
  },
  cardLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  cardEmoji: { fontSize: 26 },
  cardName: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
    marginBottom: 2,
  },
  cardSub: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: Colors.textMuted,
    maxWidth: 170,
  },
  sentimentBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    flexShrink: 0,
  },
  sentimentText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
  barSection: {
    marginBottom: 12,
  },
  barLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  barLabel: {
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.3,
  },
  barTrack: {
    flexDirection: "row",
    height: 10,
    borderRadius: 5,
    overflow: "hidden",
    backgroundColor: Colors.border,
  },
  barLong: {
    backgroundColor: Colors.positive,
    borderRadius: 5,
  },
  barShort: {
    backgroundColor: Colors.danger,
    borderRadius: 5,
  },
  barContracts: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 4,
  },
  contractNum: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
    color: Colors.textMuted,
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surfaceElevated,
    borderRadius: 10,
    paddingVertical: 10,
    marginBottom: 10,
  },
  statBox: {
    flex: 1,
    alignItems: "center",
    gap: 3,
  },
  statLabel: {
    fontSize: 9,
    fontFamily: "Inter_500Medium",
    color: Colors.textMuted,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  statValue: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.3,
  },
  statDivider: {
    width: 1,
    height: 32,
    backgroundColor: Colors.border,
  },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  footerText: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
    color: Colors.textMuted,
  },
  cftcLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginHorizontal: 16,
    marginTop: 4,
    marginBottom: 8,
    paddingVertical: 10,
  },
  cftcLinkText: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: Colors.textMuted,
  },
  impactSection: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: 12,
    marginBottom: 4,
  },
  impactHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginBottom: 8,
  },
  impactTitle: {
    fontSize: 9,
    fontFamily: "Inter_600SemiBold",
    color: Colors.accent,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  impactSignal: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 10,
    alignSelf: "flex-start",
  },
  impactSignalText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  impactBullet: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginBottom: 7,
  },
  impactDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    marginTop: 6,
    flexShrink: 0,
  },
  impactBulletText: {
    flex: 1,
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  crowdingAlert: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    backgroundColor: Colors.warningDim,
    borderRadius: 8,
    padding: 10,
    marginTop: 4,
    borderWidth: 1,
    borderColor: Colors.warning + "40",
  },
  crowdingAlertText: {
    flex: 1,
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    color: Colors.warning,
    lineHeight: 17,
  },
});
