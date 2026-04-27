import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery } from "@tanstack/react-query";
import { getApiUrl } from "@/lib/query-client";

const STORAGE_KEY = "@trading_alerts";

export interface PriceAlert {
  id: string;
  symbol: string;
  name: string;
  targetPrice: number;
  direction: "above" | "below";
}

export interface FiredAlert extends PriceAlert {
  actualPrice: number;
}

interface AlertContextType {
  alerts: PriceAlert[];
  addAlert: (alert: Omit<PriceAlert, "id">) => Promise<void>;
  removeAlert: (id: string) => Promise<void>;
  updateAlert: (id: string, updates: Partial<Pick<PriceAlert, "targetPrice" | "direction">>) => Promise<void>;
  firedAlerts: FiredAlert[];
  dismissFiredAlert: () => void;
  hasAlertForSymbol: (symbol: string) => boolean;
}

const AlertContext = createContext<AlertContextType | null>(null);

interface QuoteItem {
  symbol: string;
  price: number | null;
}

interface QuotesResponse {
  quotes: QuoteItem[];
  timestamp: string;
}

export function AlertProvider({ children }: { children: React.ReactNode }) {
  const [alerts, setAlerts] = useState<PriceAlert[]>([]);
  const [firedAlerts, setFiredAlerts] = useState<FiredAlert[]>([]);
  const firedIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((raw) => {
      if (raw) {
        try {
          setAlerts(JSON.parse(raw));
        } catch {}
      }
    });
  }, []);

  const persistAlerts = useCallback(async (next: PriceAlert[]) => {
    setAlerts(next);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }, []);

  const addAlert = useCallback(
    async (alertData: Omit<PriceAlert, "id">) => {
      const id =
        Date.now().toString() + Math.random().toString(36).substr(2, 9);
      const next = [...alerts, { ...alertData, id }];
      await persistAlerts(next);
    },
    [alerts, persistAlerts]
  );

  const removeAlert = useCallback(
    async (id: string) => {
      const next = alerts.filter((a) => a.id !== id);
      await persistAlerts(next);
    },
    [alerts, persistAlerts]
  );

  const updateAlert = useCallback(
    async (id: string, updates: Partial<Pick<PriceAlert, "targetPrice" | "direction">>) => {
      const next = alerts.map((a) => (a.id === id ? { ...a, ...updates } : a));
      await persistAlerts(next);
    },
    [alerts, persistAlerts]
  );

  const dismissFiredAlert = useCallback(() => {
    setFiredAlerts((prev) => prev.slice(1));
  }, []);

  const hasAlertForSymbol = useCallback(
    (symbol: string) => alerts.some((a) => a.symbol === symbol),
    [alerts]
  );

  const { data: quotesData } = useQuery<QuotesResponse>({
    queryKey: ["/api/trading/quotes"],
    queryFn: async () => {
      const url = new URL("/api/trading/quotes", getApiUrl());
      const res = await fetch(url.toString());
      if (!res.ok) throw new Error(`${res.status}`);
      return res.json();
    },
    staleTime: 10_000,
    refetchInterval: 10_000,
    enabled: alerts.length > 0,
  });

  useEffect(() => {
    if (!quotesData || alerts.length === 0) return;

    const newlyFired: FiredAlert[] = [];
    const toRemove: string[] = [];

    for (const alert of alerts) {
      if (firedIdsRef.current.has(alert.id)) continue;

      const quote = quotesData.quotes.find((q) => q.symbol === alert.symbol);
      if (!quote || quote.price == null) continue;

      const triggered =
        (alert.direction === "above" && quote.price >= alert.targetPrice) ||
        (alert.direction === "below" && quote.price <= alert.targetPrice);

      if (triggered) {
        firedIdsRef.current.add(alert.id);
        newlyFired.push({ ...alert, actualPrice: quote.price });
        toRemove.push(alert.id);
      }
    }

    if (newlyFired.length > 0) {
      setFiredAlerts((prev) => [...prev, ...newlyFired]);
      const next = alerts.filter((a) => !toRemove.includes(a.id));
      persistAlerts(next);
    }
  }, [quotesData, alerts, persistAlerts]);

  return (
    <AlertContext.Provider
      value={{
        alerts,
        addAlert,
        removeAlert,
        updateAlert,
        firedAlerts,
        dismissFiredAlert,
        hasAlertForSymbol,
      }}
    >
      {children}
    </AlertContext.Provider>
  );
}

export function useAlerts() {
  const ctx = useContext(AlertContext);
  if (!ctx) throw new Error("useAlerts must be used within AlertProvider");
  return ctx;
}
