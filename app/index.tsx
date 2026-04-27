import React, { useEffect, useRef } from "react";
import { View, Text, StyleSheet, Animated, Platform } from "react-native";
import { router } from "expo-router";
import Colors from "@/constants/colors";

export default function IntroScreen() {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.85)).current;
  const lineWidth = useRef(new Animated.Value(0)).current;
  const subtitleFade = useRef(new Animated.Value(0)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 700,
          useNativeDriver: Platform.OS !== "web",
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          tension: 45,
          friction: 7,
          useNativeDriver: Platform.OS !== "web",
        }),
      ]),
      Animated.parallel([
        Animated.timing(lineWidth, {
          toValue: 1,
          duration: 600,
          useNativeDriver: false,
        }),
        Animated.timing(glowAnim, {
          toValue: 1,
          duration: 600,
          useNativeDriver: false,
        }),
      ]),
      Animated.timing(subtitleFade, {
        toValue: 1,
        duration: 500,
        useNativeDriver: Platform.OS !== "web",
      }),
    ]).start();

    const TABS = [
      "/(tabs)/futures",
      "/(tabs)/trading",
      "/(tabs)",
      "/(tabs)/volatility",
      "/(tabs)/usa-debt",
    ] as const;
    const randomTab = TABS[Math.floor(Math.random() * TABS.length)];

    const timer = setTimeout(() => {
      router.replace(randomTab);
    }, 3200);
    return () => clearTimeout(timer);
  }, []);

  return (
    <View style={styles.container}>
      <Animated.View
        style={[
          styles.logoContainer,
          {
            opacity: fadeAnim,
            transform: [{ scale: scaleAnim }],
          },
        ]}
      >
        <View style={styles.iconRow}>
          <View style={styles.iconBox}>
            <Text style={styles.iconText}>M</Text>
          </View>
          <View style={styles.titleBlock}>
            <Text style={styles.title}>MONYSA</Text>
            <Text style={styles.titleTagline}>Global Markets Intelligence</Text>
          </View>
        </View>
      </Animated.View>

      <Animated.View
        style={[
          styles.dividerContainer,
          { transform: [{ scaleX: lineWidth }] },
        ]}
      >
        <View style={styles.divider} />
      </Animated.View>

      <Animated.View style={{ opacity: subtitleFade, alignItems: "center" }}>
        <Text style={styles.subtitle}>
          Real-time intelligence on tariffs, indices,{"\n"}commodities, and forex
        </Text>
        <View style={styles.badges}>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>113 Countries</Text>
          </View>
          <View style={styles.badgeDot} />
          <View style={styles.badge}>
            <Text style={styles.badgeText}>Live Markets</Text>
          </View>
          <View style={styles.badgeDot} />
          <View style={styles.badge}>
            <Text style={styles.badgeText}>Forex · Futures</Text>
          </View>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
  },
  logoContainer: {
    marginBottom: 8,
    alignItems: "center",
  },
  iconRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  iconBox: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: Colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  iconText: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    color: Colors.background,
  },
  titleBlock: {
    alignItems: "flex-start",
  },
  title: {
    fontSize: 30,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
    letterSpacing: 5,
  },
  titleTagline: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    color: Colors.accent,
    letterSpacing: 2,
    marginTop: 2,
  },
  dividerContainer: {
    marginVertical: 28,
    width: 160,
  },
  divider: {
    height: 1.5,
    backgroundColor: Colors.accent,
    borderRadius: 1,
    width: "100%",
    opacity: 0.6,
  },
  subtitle: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    textAlign: "center",
    marginBottom: 22,
    lineHeight: 20,
  },
  badges: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  badge: {
    backgroundColor: Colors.surface,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  badgeText: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    color: Colors.textMuted,
  },
  badgeDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: Colors.textMuted,
  },
});
