import React, { useEffect, useRef } from "react";
import { a11yButton } from "@/utils/accessibility";
import {
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { useAlerts } from "@/context/AlertContext";
import { formatTradingPrice } from "@/utils/tradingFormat";

const DISMISS_TIMEOUT_MS = Platform.OS === "web" ? 7000 : 5000;
const BANNER_MAX_WIDTH = 480;

export function AlertBanner() {
  const Colors = useColors();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const { firedAlerts, dismissFiredAlert } = useAlerts();
  const translateY = useRef(new Animated.Value(-200)).current;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const visibleRef = useRef(false);
  const isDismissingRef = useRef(false);

  const firedAlert = firedAlerts[0] ?? null;

  useEffect(() => {
    if (firedAlert && !visibleRef.current) {
      visibleRef.current = true;

      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        damping: 15,
        stiffness: 180,
      }).start();

      timerRef.current = setTimeout(() => {
        slideOut();
      }, DISMISS_TIMEOUT_MS);
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [firedAlert?.id]);

  const slideOut = () => {
    if (isDismissingRef.current) return;
    isDismissingRef.current = true;
    if (timerRef.current) clearTimeout(timerRef.current);
    Animated.timing(translateY, {
      toValue: -200,
      duration: 280,
      useNativeDriver: true,
    }).start(() => {
      visibleRef.current = false;
      isDismissingRef.current = false;
      translateY.setValue(-200);
      dismissFiredAlert();
    });
  };

  if (!firedAlert) return null;

  const isAbove = firedAlert.direction === "above";
  const accentColor = isAbove ? Colors.positive : Colors.danger;
  const accentDimColor = isAbove ? Colors.positiveDim : Colors.dangerDim;

  const topOffset = insets.top + (Platform.OS === "web" ? 67 : 0) + 8;

  const isWideWeb = Platform.OS === "web" && screenWidth > BANNER_MAX_WIDTH;
  const bannerWidth = isWideWeb ? BANNER_MAX_WIDTH : undefined;
  const bannerLeft = isWideWeb
    ? (screenWidth - BANNER_MAX_WIDTH) / 2
    : 12;
  const bannerRight = isWideWeb ? undefined : 12;

  return (
    <Animated.View
      style={[
        styles.container,
        {
          top: topOffset,
          left: bannerLeft,
          right: bannerRight,
          width: bannerWidth,
          transform: [{ translateY }],
          backgroundColor: Colors.surface,
          borderColor: accentColor + "60",
        },
      ]}
      accessible={true}
      accessibilityRole="alert"
      accessibilityLiveRegion="assertive"
      accessibilityLabel={`Price alert: ${firedAlert.name} ${isAbove ? "rose above" : "dropped below"} ${formatTradingPrice(firedAlert.symbol, firedAlert.targetPrice)}. Now: ${formatTradingPrice(firedAlert.symbol, firedAlert.actualPrice)}`}
    >
      <View style={[styles.iconWrap, { backgroundColor: accentDimColor }]}>
        <Ionicons name="notifications" size={20} color={accentColor} />
      </View>

      <View style={styles.content}>
        <Text style={[styles.title, { color: Colors.text }]} numberOfLines={1}>
          Price Alert · {firedAlert.name}
        </Text>
        <Text
          style={[styles.body, { color: Colors.textSecondary }]}
          numberOfLines={2}
        >
          {firedAlert.symbol} {isAbove ? "rose above" : "dropped below"}{" "}
          <Text style={{ color: accentColor, fontFamily: "Inter_600SemiBold" }}>
            {formatTradingPrice(firedAlert.symbol, firedAlert.targetPrice)}
          </Text>
          {"  ·  "}
          {"Now: "}
          <Text style={{ color: Colors.text, fontFamily: "Inter_600SemiBold" }}>
            {formatTradingPrice(firedAlert.symbol, firedAlert.actualPrice)}
          </Text>
        </Text>
      </View>

      <Pressable onPress={slideOut} hitSlop={12} style={styles.closeBtn} {...a11yButton("Dismiss alert")}>
        <Ionicons name="close" size={18} color={Colors.textMuted} />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    zIndex: 9999,
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    flex: 1,
    gap: 3,
  },
  title: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
  },
  body: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    lineHeight: 17,
  },
  closeBtn: {
    padding: 4,
  },
});
