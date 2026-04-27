import ClassicColors from "@/constants/colors";

export type AppColors = typeof ClassicColors;

export function useColors(): AppColors {
  return ClassicColors;
}
