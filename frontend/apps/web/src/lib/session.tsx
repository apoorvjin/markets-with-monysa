import { onAuthStateChanged, type User } from "firebase/auth";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api } from "./api";
import { auth } from "./firebase";

type Plan = "free" | "pro";

interface SessionState {
  /** Firebase user, or null when signed out. Undefined while auth is resolving. */
  user: User | null;
  /** Resolved entitlement. Defaults to "free" until /api/me answers. */
  plan: Plan;
  isPro: boolean;
  /** True until the initial auth state + plan lookup settle. */
  loading: boolean;
  /** Re-fetch the plan (e.g. after the user returns from a mobile purchase). */
  refreshPlan: () => Promise<void>;
}

const SessionContext = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [plan, setPlan] = useState<Plan>("free");
  const [loading, setLoading] = useState(true);

  const resolvePlan = useCallback(async (u: User | null) => {
    // Only paid, verified accounts should ever resolve to Pro. An unverified
    // user can't reach the app anyway (routing gate), so keep them free.
    if (!u || !u.emailVerified) {
      setPlan("free");
      return;
    }
    try {
      const idToken = await u.getIdToken();
      const me = await api.getMe(idToken);
      setPlan(me.plan);
    } catch {
      // Network / token error — fail closed to free rather than guessing Pro.
      setPlan("free");
    }
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      await resolvePlan(u);
      setLoading(false);
    });
    return unsub;
  }, [resolvePlan]);

  const refreshPlan = useCallback(async () => {
    await resolvePlan(auth.currentUser);
  }, [resolvePlan]);

  const value = useMemo<SessionState>(
    () => ({ user, plan, isPro: plan === "pro", loading, refreshPlan }),
    [user, plan, loading, refreshPlan],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionState {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used within SessionProvider");
  return ctx;
}

/** Convenience for the many gated call sites that only care about Pro status. */
export function useIsPro(): boolean {
  return useSession().isPro;
}
