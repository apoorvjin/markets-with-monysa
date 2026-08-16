// ── AIS ship-type classification ─────────────────────────────────────────────
// The AIS "Type" integer (ITU-R M.1371, carried in ShipStaticData /
// ExtendedClassBPositionReport) encodes ~100 vessel classes in two digits. We
// collapse them into a handful of display categories.
//
// IMPORTANT: the base type code does NOT separate LNG/LPG gas carriers from oil
// or chemical tankers — 80–89 is *all* "Tanker". So gas carriers can't be
// classified authoritatively from AIS type alone; isGasCarrierName() is a soft
// name heuristic used only to *highlight* likely gas carriers, not to reclassify
// them. Keep that honest in any UI copy.

export const VESSEL_CATEGORIES = [
  "tanker",
  "cargo",
  "passenger",
  "highspeed",
  "tug_special",
  "fishing",
  "pleasure",
  "other",
] as const;

export type VesselCategory = (typeof VESSEL_CATEGORIES)[number];

/** Map a raw AIS ship-type code to a display category. Unknown / not-available
 *  (0, null) → "other". */
export function categoryForType(type: number | null | undefined): VesselCategory {
  if (type == null || !Number.isFinite(type) || type <= 0) return "other";
  if (type >= 80 && type <= 89) return "tanker";
  if (type >= 70 && type <= 79) return "cargo";
  if (type >= 60 && type <= 69) return "passenger";
  if (type >= 40 && type <= 49) return "highspeed";
  if (type >= 50 && type <= 59) return "tug_special"; // pilot/tug/SAR/law/anti-pollution
  if (type === 30) return "fishing";
  if (type === 36 || type === 37) return "pleasure"; // sailing / pleasure craft
  return "other"; // WIG (20s), misc special ops (33–35), other (90s)
}

// Oil tankers and LNG/LPG gas carriers share the 80–89 type range, so the only
// free signal separating them is the ship's broadcast name. Best-effort only.
const GAS_NAME = /(^|[^A-Z])(LNG|LPG|LPGC|LNGC|LIQUEFIED|GAS CARRIER)([^A-Z]|$)/i;

/** Heuristic: does this vessel's name suggest a gas carrier? Only meaningful for
 *  vessels already classified as tankers. Not authoritative. */
export function isGasCarrierName(name: string | null | undefined): boolean {
  return !!name && GAS_NAME.test(name);
}
