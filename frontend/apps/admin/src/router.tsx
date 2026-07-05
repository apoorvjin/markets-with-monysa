import {
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
} from "@tanstack/react-router";
import { AdminShell } from "./components/AdminShell";
import { LoginPage } from "./components/LoginPage";
import { DashboardPage } from "./pages/DashboardPage";
import { UsersPage } from "./pages/UsersPage";
import { SubscriptionsPage } from "./pages/SubscriptionsPage";
import { AlertsPage } from "./pages/AlertsPage";
import { RemoteConfigPage } from "./pages/RemoteConfigPage";
import { OpsPage } from "./pages/OpsPage";
import { PerformancePage } from "./pages/PerformancePage";
import { isAuthenticated } from "./lib/auth";

const rootRoute = createRootRoute({ component: AdminShell });

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  component: LoginPage,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  beforeLoad: () => { throw redirect({ to: "/dashboard" }); },
});

const dashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/dashboard",
  beforeLoad: () => { if (!isAuthenticated()) throw redirect({ to: "/login" }); },
  component: DashboardPage,
});

const usersRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/users",
  beforeLoad: () => { if (!isAuthenticated()) throw redirect({ to: "/login" }); },
  validateSearch: (s: Record<string, unknown>) => ({ uid: typeof s.uid === "string" ? s.uid : undefined }),
  component: UsersPage,
});

const subscriptionsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/subscriptions",
  beforeLoad: () => { if (!isAuthenticated()) throw redirect({ to: "/login" }); },
  component: SubscriptionsPage,
});

const alertsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/alerts",
  beforeLoad: () => { if (!isAuthenticated()) throw redirect({ to: "/login" }); },
  component: AlertsPage,
});

const remoteConfigRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/remote-config",
  beforeLoad: () => { if (!isAuthenticated()) throw redirect({ to: "/login" }); },
  component: RemoteConfigPage,
});

const opsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/ops",
  beforeLoad: () => { if (!isAuthenticated()) throw redirect({ to: "/login" }); },
  component: OpsPage,
});

const performanceRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/performance",
  beforeLoad: () => { if (!isAuthenticated()) throw redirect({ to: "/login" }); },
  component: PerformancePage,
});

const routeTree = rootRoute.addChildren([
  loginRoute,
  indexRoute,
  dashboardRoute,
  usersRoute,
  subscriptionsRoute,
  alertsRoute,
  remoteConfigRoute,
  opsRoute,
  performanceRoute,
]);

// BASE_URL is set by Vite from the `base` option.
// Dev: "/" → basepath "/"   Prod build (VITE_ADMIN_BASE=/admin/): "/admin/" → basepath "/admin"
const basepath = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "") || "/";
export const router = createRouter({ routeTree, basepath });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
