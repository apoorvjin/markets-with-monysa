import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

export type Strategy = "1" | "2" | "3";

interface StrategyContextValue {
  strategy: Strategy;
  setStrategy: (s: Strategy) => void;
  strategyLabel: string;
}

const STRATEGY_LABELS: Record<Strategy, string> = {
  "1": "S1 Technical",
  "2": "S2 Multi-Factor",
  "3": "S3 Hybrid",
};

const StrategyContext = createContext<StrategyContextValue>({
  strategy: "1",
  setStrategy: () => {},
  strategyLabel: "S1 Technical",
});

const STORAGE_KEY = "@trading_strategy";

export function StrategyProvider({ children }: { children: ReactNode }) {
  const [strategy, setStrategyState] = useState<Strategy>("1");

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((saved) => {
        if (saved === "1" || saved === "2" || saved === "3") {
          setStrategyState(saved);
        }
      })
      .catch(() => {});
  }, []);

  const setStrategy = useCallback((s: Strategy) => {
    setStrategyState(s);
    AsyncStorage.setItem(STORAGE_KEY, s).catch(() => {});
  }, []);

  return (
    <StrategyContext.Provider
      value={{ strategy, setStrategy, strategyLabel: STRATEGY_LABELS[strategy] }}
    >
      {children}
    </StrategyContext.Provider>
  );
}

export function useStrategy() {
  return useContext(StrategyContext);
}
