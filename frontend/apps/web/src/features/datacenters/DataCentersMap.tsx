import { Map as MaplibreMap, NavigationControl, Popup, setWorkerUrl, type GeoJSONSource, type MapLayerMouseEvent } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
// Bundle maplibre's tile-parsing worker (with its deps) as a self-contained
// asset and point maplibre at its URL. Without this, maplibre computes the
// worker path dynamically from import.meta.url — a sibling file neither Vite
// dev nor the Rollup build emits, so it 404s and the map renders blank with no
// tiles and no error. See vite.config.ts (`worker: { format: "es" }`).
import maplibreWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type { CountyPipelinePoint, DataCenterFacility } from "@monysa/contracts";
import { getTheme } from "../../lib/theme";

setWorkerUrl(maplibreWorkerUrl);

export interface DataCentersMapHandle {
  /** Fly the camera to a point (e.g. a clicked sidebar row). */
  flyTo: (lon: number, lat: number, zoom: number) => void;
}

const DARK_STYLE = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";
const LIGHT_STYLE = "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";

const styleForTheme = () => (getTheme() === "light" ? LIGHT_STYLE : DARK_STYLE);

// Minimal local shape — just enough of GeoJSON for maplibre's setData(), no
// @types/geojson dependency needed for two point-feature builders.
interface PointFeatureCollection {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    geometry: { type: "Point"; coordinates: [number, number] };
    properties: Record<string, string | number>;
  }>;
}

function facilitiesGeoJson(items: DataCenterFacility[]): PointFeatureCollection {
  return {
    type: "FeatureCollection",
    features: items
      .filter((f): f is DataCenterFacility & { lat: number; lon: number } => f.lat != null && f.lon != null)
      .map((f) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [f.lon, f.lat] },
        properties: { name: f.name, operator: f.operator ?? "", tier: f.tier ?? "" },
      })),
  };
}

/** Dominant non-cancelled/unknown status drives the bubble color. */
function dominantStatus(counts: Record<string, number>): string {
  let best = "Operational";
  let bestN = -1;
  for (const s of ["Operational", "Construction", "Proposed"]) {
    const n = counts[s] ?? 0;
    if (n > bestN) {
      best = s;
      bestN = n;
    }
  }
  return best;
}

function pipelineGeoJson(points: CountyPipelinePoint[]): PointFeatureCollection {
  return {
    type: "FeatureCollection",
    features: points
      .filter((p): p is CountyPipelinePoint & { lat: number; lon: number } => p.lat != null && p.lon != null)
      .map((p) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [p.lon, p.lat] },
        properties: {
          county: p.county,
          region: p.region,
          total: p.total,
          status: dominantStatus(p.counts),
          operational: p.counts.Operational ?? 0,
          construction: p.counts.Construction ?? 0,
          proposed: p.counts.Proposed ?? 0,
        },
      })),
  };
}

interface MapData {
  facilities: DataCenterFacility[];
  pipeline: CountyPipelinePoint[];
  showFacilities: boolean;
  showPipeline: boolean;
}

export const DataCentersMap = forwardRef<DataCentersMapHandle, MapData>(function DataCentersMap(props, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MaplibreMap | null>(null);
  // Always holds the latest props so the "style.load" handler and the update
  // effect below read current data without re-creating the map.
  const dataRef = useRef<MapData>(props);
  dataRef.current = props;

  useImperativeHandle(ref, () => ({
    flyTo: (lon, lat, zoom) =>
      mapRef.current?.flyTo({ center: [lon, lat], zoom, duration: 900, essential: true }),
  }), []);

  function applyData(map: MaplibreMap) {
    const { facilities, pipeline, showFacilities, showPipeline } = dataRef.current;
    (map.getSource("dc-facilities") as GeoJSONSource | undefined)?.setData(
      facilitiesGeoJson(showFacilities ? facilities : []) as never,
    );
    (map.getSource("dc-pipeline") as GeoJSONSource | undefined)?.setData(
      pipelineGeoJson(showPipeline ? pipeline : []) as never,
    );
  }

  // Map init — once per mount.
  useEffect(() => {
    if (!containerRef.current) return;
    const map = new MaplibreMap({
      container: containerRef.current,
      style: styleForTheme(),
      center: [-40, 30],
      zoom: 1.6,
      attributionControl: { compact: true },
    });
    map.addControl(new NavigationControl({ showCompass: false }), "top-right");
    mapRef.current = map;
    map.on("error", (e) => console.error("[dc-map]", e.error));

    const popup = new Popup({ closeButton: false, closeOnClick: false, offset: 10 });

    // Add our two GeoJSON layers whenever a style loads. Registered with `.on`
    // (not `.once`) so it also re-runs after setStyle() on a theme switch —
    // setStyle wipes custom sources/layers, and this re-adds them.
    map.on("style.load", () => {
      map.addSource("dc-facilities", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({
        id: "dc-facilities-dots",
        type: "circle",
        source: "dc-facilities",
        paint: {
          "circle-radius": 3.5,
          "circle-color": "#00d4aa",
          "circle-opacity": 0.85,
          "circle-stroke-width": 1,
          "circle-stroke-color": "#04060a",
        },
      });

      map.addSource("dc-pipeline", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({
        id: "dc-pipeline-bubbles",
        type: "circle",
        source: "dc-pipeline",
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["get", "total"], 1, 5, 50, 12, 400, 32],
          "circle-color": [
            "match",
            ["get", "status"],
            "Operational", "#00d4aa",
            "Construction", "#ffb84d",
            "Proposed", "#4d7cff",
            "#8a8f98",
          ],
          "circle-opacity": 0.55,
          "circle-stroke-width": 1.5,
          "circle-stroke-color": "#04060a",
        },
      });

      applyData(map);
    });

    // Hover popups. Registered once (outside style.load): a layer-scoped handler
    // stays bound to the layer id across setStyle re-creations, so re-registering
    // per style.load would just stack duplicates.
    const onEnter = (kind: "facility" | "pipeline") => (e: MapLayerMouseEvent) => {
      map.getCanvas().style.cursor = "pointer";
      const f = e.features?.[0];
      if (!f || f.geometry.type !== "Point") return;
      const p = f.properties as Record<string, unknown>;
      const html =
        kind === "facility"
          ? `<div class="dc-popup"><strong>${escapeHtml(String(p.name ?? "Unnamed"))}</strong>${p.operator ? `<br/>${escapeHtml(String(p.operator))}` : ""}${p.tier ? `<br/>Tier ${escapeHtml(String(p.tier))}` : ""}</div>`
          : `<div class="dc-popup"><strong>${escapeHtml(String(p.county))}, ${escapeHtml(String(p.region))}</strong><br/>${p.total} project${p.total === 1 ? "" : "s"}<br/>${p.operational} operational · ${p.construction} construction · ${p.proposed} proposed</div>`;
      popup.setLngLat(f.geometry.coordinates as [number, number]).setHTML(html).addTo(map);
    };
    const onLeave = () => {
      map.getCanvas().style.cursor = "";
      popup.remove();
    };
    map.on("mouseenter", "dc-facilities-dots", onEnter("facility"));
    map.on("mouseleave", "dc-facilities-dots", onLeave);
    map.on("mouseenter", "dc-pipeline-bubbles", onEnter("pipeline"));
    map.on("mouseleave", "dc-pipeline-bubbles", onLeave);

    // Keep the basemap in sync with the app's light/dark toggle. The theme is a
    // `data-theme` attribute on <html> (see lib/theme.ts) with no React signal,
    // so observe it directly and swap the basemap style on change. setStyle
    // preserves the camera; the style.load handler above re-adds our layers.
    let currentStyle = styleForTheme();
    const themeObserver = new MutationObserver(() => {
      const next = styleForTheme();
      if (next !== currentStyle) {
        currentStyle = next;
        map.setStyle(next);
      }
    });
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    // Heal the viewport if the container finishes laying out (flex/grid) or the
    // window/sidebar resizes after construction.
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

  // Push data updates once a style is loaded; no-ops harmlessly before then
  // (the style.load handler applies the then-current dataRef itself).
  useEffect(() => {
    const map = mapRef.current;
    if (map?.isStyleLoaded()) applyData(map);
  }, [props.facilities, props.pipeline, props.showFacilities, props.showPipeline]);

  return <div ref={containerRef} className="dc-map" />;
});

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}
