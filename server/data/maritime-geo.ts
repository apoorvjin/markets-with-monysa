// ── Maritime geography ───────────────────────────────────────────────────────
// Two curated geo tables driving the Tankers pillar, kept together because they
// are the pillar's only hardcoded geography (same "curated universe" spirit as
// index_constituents.ts / ETF_UNIVERSE):
//
//   CHOKEPOINTS       — tight bounding boxes around strategic straits/canals,
//                       used to COUNT vessels transiting each (chokepoint panels).
//   SUBSCRIPTION_BOXES — coarse regional boxes we actually LISTEN to on the AIS
//                       feed. Deliberately NOT the whole planet: free AIS is
//                       terrestrial/coastal, and an all-Earth firehose is 100k+
//                       vessels that would swamp the server and browser. These
//                       cover the strategic tanker theatres and every chokepoint
//                       below. Widen these (or swap to a satellite provider) for
//                       true mid-ocean coverage.
//
// All boxes are GeoJSON bbox order: [west, south, east, north] (minLon, minLat,
// maxLon, maxLat). centers are [lon, lat].

export type BBox = [number, number, number, number];

export interface Chokepoint {
  id: string;
  name: string;
  /** [west, south, east, north] */
  bbox: BBox;
  /** [lon, lat] — camera target for the sidebar "fly to" action. */
  center: [number, number];
}

// 13 strategic maritime chokepoints (oil-flow relevant). Boxes are tight enough
// that a vessel inside is genuinely "in the strait", not just the general region.
export const CHOKEPOINTS: Chokepoint[] = [
  { id: "hormuz", name: "Strait of Hormuz", bbox: [55.2, 25.5, 57.2, 27.1], center: [56.3, 26.6] },
  { id: "malacca", name: "Strait of Malacca", bbox: [98.0, 1.0, 103.0, 6.2], center: [100.4, 3.2] },
  { id: "singapore", name: "Singapore Strait", bbox: [103.4, 1.0, 104.2, 1.45], center: [103.8, 1.22] },
  { id: "suez", name: "Suez Canal", bbox: [32.15, 29.85, 32.65, 31.35], center: [32.35, 30.6] },
  { id: "babelmandeb", name: "Bab-el-Mandeb", bbox: [42.9, 12.3, 43.7, 13.1], center: [43.3, 12.7] },
  { id: "bosphorus", name: "Bosphorus", bbox: [28.9, 41.0, 29.2, 41.3], center: [29.05, 41.15] },
  { id: "dardanelles", name: "Dardanelles", bbox: [26.0, 40.0, 26.75, 40.35], center: [26.4, 40.2] },
  { id: "panama", name: "Panama Canal", bbox: [-80.05, 8.8, -79.4, 9.45], center: [-79.7, 9.1] },
  { id: "gibraltar", name: "Strait of Gibraltar", bbox: [-5.95, 35.75, -5.25, 36.2], center: [-5.6, 35.97] },
  { id: "dover", name: "Strait of Dover", bbox: [0.9, 50.6, 2.0, 51.2], center: [1.4, 50.9] },
  { id: "danish", name: "Danish Straits", bbox: [10.5, 54.5, 13.0, 56.3], center: [11.7, 55.5] },
  { id: "taiwan", name: "Taiwan Strait", bbox: [118.3, 23.2, 121.2, 25.6], center: [119.8, 24.4] },
  { id: "kerch", name: "Kerch Strait", bbox: [36.3, 45.0, 36.75, 45.55], center: [36.5, 45.3] },
];

// Coarse regions we subscribe to. Their union contains every chokepoint above
// plus the major tanker lanes feeding them. 7 boxes keeps the stream dense but
// bounded.
export const SUBSCRIPTION_BOXES: BBox[] = [
  [47, 22, 62, 30], // Persian Gulf · Hormuz · Gulf of Oman
  [32, 12, 44, 31], // Red Sea · Suez · Bab-el-Mandeb
  [-6, 30, 37, 46], // Mediterranean · Gibraltar · Bosphorus · Black Sea approaches
  [-6, 48, 16, 61], // NW Europe · North Sea · Dover · Danish Straits · Baltic approaches
  [95, -8, 122, 25], // SE Asia · Malacca · Singapore · South China Sea · Taiwan
  [-98, 8, -60, 31], // US Gulf · Caribbean · Panama
  [118, 20, 142, 41], // East Asia · Japan · Korea
];
