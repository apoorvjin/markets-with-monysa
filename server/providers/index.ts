import { yahooProvider } from "./yahoo";
import type { ChartProvider } from "./types";

const PROVIDERS: Record<string, ChartProvider> = {
  yahoo: yahooProvider,
};

export function getAvailableProviders(): Array<{ name: string; label: string }> {
  return [{ name: "yahoo", label: "Yahoo Finance" }];
}

// Future: add other providers to PROVIDERS and getAvailableProviders()
export function getProvider(name?: string): ChartProvider {
  return PROVIDERS[name ?? "yahoo"] ?? yahooProvider;
}

export { yahooProvider };
