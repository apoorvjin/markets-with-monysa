import React, { useRef, useEffect } from "react";
import { StyleSheet, View, Text } from "react-native";
import MapView, { Marker, Callout, PROVIDER_DEFAULT } from "react-native-maps";
import { type CountryTariff } from "@/data/tariffs";
import { countryCoords } from "@/data/country-coords";

interface Props {
  countries: CountryTariff[];
  onSelectCountry: (c: CountryTariff) => void;
  getMarkerColor: (rate: number) => string;
  focusedCode?: string;
}

export default function ExploreMap({ countries, onSelectCountry, getMarkerColor, focusedCode }: Props) {
  const mapRef = useRef<MapView>(null);

  useEffect(() => {
    if (!focusedCode) return;
    const coords = countryCoords[focusedCode];
    if (!coords) return;
    mapRef.current?.animateToRegion(
      {
        latitude: coords.lat,
        longitude: coords.lng,
        latitudeDelta: 12,
        longitudeDelta: 16,
      },
      600
    );
  }, [focusedCode]);

  return (
    <MapView
      ref={mapRef}
      style={StyleSheet.absoluteFill}
      provider={PROVIDER_DEFAULT}
      mapType="mutedStandard"
      userInterfaceStyle="dark"
      initialRegion={{
        latitude: 20,
        longitude: 0,
        latitudeDelta: 120,
        longitudeDelta: 180,
      }}
      showsUserLocation={false}
      showsPointsOfInterest={false}
      showsBuildings={false}
      showsIndoors={false}
      rotateEnabled={false}
      pitchEnabled={false}
    >
      {countries.map((country) => {
        const coords = countryCoords[country.countryCode];
        if (!coords) return null;
        const isFocused = country.countryCode === focusedCode;
        const color = isFocused ? "#3B82F6" : getMarkerColor(country.tariffRate);

        return (
          <Marker
            key={country.countryCode}
            coordinate={{ latitude: coords.lat, longitude: coords.lng }}
            onPress={() => onSelectCountry(country)}
            anchor={{ x: 0.5, y: 0.5 }}
            tracksViewChanges={isFocused}
            zIndex={isFocused ? 999 : 1}
          >
            {isFocused ? (
              <View style={styles.focusedBubble}>
                <Text style={styles.focusedFlag}>
                  {country.countryCode === "EU" ? "🇪🇺" : "📍"}
                </Text>
                <View style={styles.focusedLabel}>
                  <Text style={styles.focusedName} numberOfLines={1}>
                    {country.countryName}
                  </Text>
                  <Text style={styles.focusedRate}>{country.tariffRate}%</Text>
                </View>
                <View style={styles.focusedTail} />
              </View>
            ) : (
              <View style={[styles.markerOuter, { borderColor: color }]}>
                <View style={[styles.markerInner, { backgroundColor: color }]} />
              </View>
            )}
          </Marker>
        );
      })}
    </MapView>
  );
}

const styles = StyleSheet.create({
  markerOuter: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  markerInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  focusedBubble: {
    backgroundColor: "#3B82F6",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 8,
  },
  focusedFlag: {
    fontSize: 14,
  },
  focusedLabel: {
    gap: 1,
  },
  focusedName: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "700",
    maxWidth: 100,
  },
  focusedRate: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 10,
    fontWeight: "600",
  },
  focusedTail: {
    position: "absolute",
    bottom: -6,
    left: "50%",
    marginLeft: -5,
    width: 0,
    height: 0,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderTopWidth: 6,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderTopColor: "#3B82F6",
  },
});
