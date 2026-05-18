import ClassicColors from "@/constants/colors";
import { TypeUITokens } from "@/constants/typeuiTokens";

export type AppColors = typeof ClassicColors;
export type AppTokens = typeof TypeUITokens;

export function useColors(): AppColors {
  return ClassicColors;
}

export function useTokens(): AppTokens {
  return TypeUITokens;
}
