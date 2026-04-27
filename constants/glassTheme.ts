import Colors from "./colors";

export const glassColors = {
  background: "transparent",
  surface: "rgba(255, 255, 255, 0.07)",
  surfaceElevated: "rgba(255, 255, 255, 0.12)",
  border: "rgba(255, 255, 255, 0.12)",
  text: "#FFFFFF",
  textSecondary: "rgba(255,255,255,0.68)",
  textMuted: "rgba(255,255,255,0.40)",
  accent: Colors.accent,
  accentDim: "rgba(0, 212, 170, 0.18)",
  danger: Colors.danger,
  dangerDim: Colors.dangerDim,
  warning: Colors.warning,
  warningDim: Colors.warningDim,
  positive: Colors.positive,
  positiveDim: Colors.positiveDim,
  headerBg: "rgba(6, 10, 22, 0.55)",
  searchBg: "rgba(255,255,255,0.06)",
};

export function getThemeColors(isGlass: boolean) {
  if (!isGlass) return Colors;
  return {
    ...Colors,
    ...glassColors,
  };
}
