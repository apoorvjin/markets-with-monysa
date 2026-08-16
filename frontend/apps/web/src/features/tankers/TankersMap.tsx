import {
  Map as MaplibreMap,
  NavigationControl,
  Popup,
  setWorkerUrl,
  type GeoJSONSource,
  type MapLayerMouseEvent,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
// Same maplibre-worker fix as DataCentersMap — without the bundled worker the
// map renders blank with no tiles and no error. See DataCentersMap.tsx +
// vite.config.ts (`worker: { format: "es" }`).
import maplibreWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type { Chokepoint, MaritimeVessel, VesselCategory } from "@monysa/contracts";
import { getTheme } from "../../lib/theme";

setWorkerUrl(maplibreWorkerUrl);

export interface TankersMapHandle {
  flyTo: (lon: number, lat: number, zoom: number) => void;
}

const DARK_STYLE = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";
const LIGHT_STYLE = "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";
const styleForTheme = () => (getTheme() === "light" ? LIGHT_STYLE : DARK_STYLE);

// Category → dot color. Gas carriers (a tanker subset) override to yellow so
// they read as a distinct highlighted class. Kept in sync with the legend in
// TankersPage.tsx.
export const CATEGORY_COLORS: Record<VesselCategory, string> = {
  tanker: "#ff9500",
  cargo: "#4d7cff",
  passenger: "#00d4aa",
  highspeed: "#bf5af2",
  tug_special: "#8a8f98",
  fishing: "#30d158",
  pleasure: "#64d2ff",
  other: "#7a828c",
};
export const GAS_COLOR = "#ffd60a";

interface PointFeatureCollection {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    geometry: { type: "Point"; coordinates: [number, number] };
    properties: Record<string, string | number>;
  }>;
}

function vesselsGeoJson(items: MaritimeVessel[]): PointFeatureCollection {
  return {
    type: "FeatureCollection",
    features: items.map((v) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [v.lon, v.lat] },
      properties: {
        name: v.name ?? "",
        category: v.category,
        gas: v.gas ? 1 : 0, // maplibre match works cleanest on numbers, not bools
        sog: v.sog ?? -1,
        dest: v.dest ?? "",
      },
    })),
  };
}

function chokepointsGeoJson(items: Chokepoint[]): PointFeatureCollection {
  return {
    type: "FeatureCollection",
    features: items.map((c) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [c.lon, c.lat] },
      properties: { name: c.name, tankers: c.tankers, total: c.total, gas: c.gasCarriers },
    })),
  };
}

interface MapData {
  vessels: MaritimeVessel[];
  chokepoints: Chokepoint[];
  showVessels: boolean;
  showChokepoints: boolean;
}

export const TankersMap = forwardRef<TankersMapHandle, MapData>(function TankersMap(props, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MaplibreMap | null>(null);
  const dataRef = useRef<MapData>(props);
  dataRef.current = props;

  useImperativeHandle(
    ref,
    () => ({
      flyTo: (lon, lat, zoom) =>
        mapRef.current?.flyTo({ center: [lon, lat], zoom, duration: 900, essential: true }),
    }),
    [],
  );

  function applyData(map: MaplibreMap) {
    const { vessels, chokepoints, showVessels, showChokepoints } = dataRef.current;
    (map.getSource("tk-vessels") as GeoJSONSource | undefined)?.setData(
      vesselsGeoJson(showVessels ? vessels : []) as never,
    );
    (map.getSource("tk-chokepoints") as GeoJSONSource | undefined)?.setData(
      chokepointsGeoJson(showChokepoints ? chokepoints : []) as never,
    );
  }

  useEffect(() => {
    if (!containerRef.current) return;
    const map = new MaplibreMap({
      container: containerRef.current,
      style: styleForTheme(),
      center: [30, 25],
      zoom: 1.7,
      attributionControl: { compact: true },
    });
    map.addControl(new NavigationControl({ showCompass: false }), "top-right");
    mapRef.current = map;
    map.on("error", (e) => console.error("[tk-map]", e.error));

    const popup = new Popup({ closeButton: false, closeOnClick: false, offset: 10 });

    map.on("style.load", () => {
      // Chokepoint rings first, so vessel dots draw on top of them.
      map.addSource("tk-chokepoints", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({
        id: "tk-chokepoint-rings",
        type: "circle",
        source: "tk-chokepoints",
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["get", "tankers"], 0, 9, 40, 22, 200, 42],
          "circle-color": "#ff9500",
          "circle-opacity": 0.1,
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ff9500",
          "circle-stroke-opacity": 0.7,
        },
      });

      map.addSource("tk-vessels", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({
        id: "tk-vessel-dots",
        type: "circle",
        source: "tk-vessels",
        paint: {
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            1,
            ["match", ["get", "category"], "tanker", 2.6, "cargo", 2, 1.5],
            7,
            ["match", ["get", "category"], "tanker", 5.5, "cargo", 4.5, 3.5],
          ],
          "circle-color": [
            "case",
            ["==", ["get", "gas"], 1],
            GAS_COLOR,
            [
              "match",
              ["get", "category"],
              "tanker", CATEGORY_COLORS.tanker,
              "cargo", CATEGORY_COLORS.cargo,
              "passenger", CATEGORY_COLORS.passenger,
              "highspeed", CATEGORY_COLORS.highspeed,
              "fishing", CATEGORY_COLORS.fishing,
              "tug_special", CATEGORY_COLORS.tug_special,
              "pleasure", CATEGORY_COLORS.pleasure,
              CATEGORY_COLORS.other,
            ],
          ],
          "circle-opacity": 0.9,
          "circle-stroke-width": 0.5,
          "circle-stroke-color": "#04060a",
        },
      });

      applyData(map);
    });

    const onVesselEnter = (e: MapLayerMouseEvent) => {
      map.getCanvas().style.cursor = "pointer";
      const f = e.features?.[0];
      if (!f || f.geometry.type !== "Point") return;
      const p = f.properties as Record<string, unknown>;
      const sog = Number(p.sog);
      const cat = String(p.category);
      const label = Number(p.gas) === 1 ? "gas carrier" : cat;
      const html = `<div class="tk-popup"><strong>${escapeHtml(String(p.name) || "Unknown vessel")}</strong><br/>${escapeHtml(label)}${sog >= 0 ? ` · ${sog.toFixed(1)} kn` : ""}${p.dest ? `<br/>→ ${escapeHtml(String(p.dest))}` : ""}</div>`;
      popup.setLngLat(f.geometry.coordinates as [number, number]).setHTML(html).addTo(map);
    };
    const onChokepointEnter = (e: MapLayerMouseEvent) => {
      map.getCanvas().style.cursor = "pointer";
      const f = e.features?.[0];
      if (!f || f.geometry.type !== "Point") return;
      const p = f.properties as Record<string, unknown>;
      const html = `<div class="tk-popup"><strong>${escapeHtml(String(p.name))}</strong><br/>${p.total} vessels · ${p.tankers} tankers${Number(p.gas) > 0 ? ` (${p.gas} gas)` : ""}</div>`;
      popup.setLngLat(f.geometry.coordinates as [number, number]).setHTML(html).addTo(map);
    };
    const onLeave = () => {
      map.getCanvas().style.cursor = "";
      popup.remove();
    };
    map.on("mouseenter", "tk-vessel-dots", onVesselEnter);
    map.on("mouseleave", "tk-vessel-dots", onLeave);
    map.on("mouseenter", "tk-chokepoint-rings", onChokepointEnter);
    map.on("mouseleave", "tk-chokepoint-rings", onLeave);

    let currentStyle = styleForTheme();
    const themeObserver = new MutationObserver(() => {
      const next = styleForTheme();
      if (next !== currentStyle) {
        currentStyle = next;
        map.setStyle(next);
      }
    });
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    const ro = new ResizeObserver(() => map.resize());
    ro.observe(containerRef.current);

    return () => {
      themeObserver.disconnect();
      ro.disconnect();
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (map?.isStyleLoaded()) applyData(map);
  }, [props.vessels, props.chokepoints, props.showVessels, props.showChokepoints]);

  return <div ref={containerRef} className="tk-map" />;
});

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string,
  );
}
