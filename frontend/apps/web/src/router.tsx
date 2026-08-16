import {
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
} from "@tanstack/react-router";
import { AppShell } from "./components/AppShell";
import { AuthPage } from "./features/auth/AuthPage";
import { EmailVerificationPage } from "./features/auth/EmailVerificationPage";
import { AssetPage } from "./features/asset/AssetPage";
import { InvestingPage } from "./features/investing/InvestingPage";
import { MacroPage } from "./features/macro/MacroPage";
import { MarketsPage } from "./features/markets/MarketsPage";
import { TradingPage } from "./features/trading/TradingPage";
import { TerminalPage } from "./features/terminal/TerminalPage";
import { WirePage } from "./features/wire/WirePage";
import { SplcPage } from "./features/splc/SplcPage";
import { DataCentersPage } from "./features/datacenters/DataCentersPage";
import { TankersPage } from "./features/tankers/TankersPage";

const rootRoute = createRootRoute({ component: AppShell });

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  beforeLoad: () => {
    throw redirect({ to: "/markets" });
  },
});

const marketsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/markets",
  component: MarketsPage,
});

const tradingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/trading",
  component: TradingPage,
});

const investingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/investing",
  component: InvestingPage,
});

const macroRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/macro",
  component: MacroPage,
});

const wireRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/wire",
  component: WirePage,
});

const terminalRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/terminal",
  component: TerminalPage,
});

const datacentersRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/datacenters",
  component: DataCentersPage,
});

const tankersRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/tankers",
  component: TankersPage,
});

const splcRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/splc",
  component: SplcPage,
});

const authRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/auth",
  component: AuthPage,
});

const verifyEmailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/verify-email",
  component: EmailVerificationPage,
});

const assetRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/asset/$symbol",
  validateSearch: (search: Record<string, unknown>) => ({
    name: typeof search.name === "string" ? search.name : undefined,
  }),
  component: AssetRouteComponent,
});

function AssetRouteComponent() {
  const { symbol } = assetRoute.useParams();
  const { name } = assetRoute.useSearch();
  return <AssetPage key={symbol} symbol={symbol} name={name} />;
}

const routeTree = rootRoute.addChildren([
  indexRoute,
  marketsRoute,
  tradingRoute,
  investingRoute,
  macroRoute,
  wireRoute,
  terminalRoute,
  datacentersRoute,
  tankersRoute,
  splcRoute,
  authRoute,
  verifyEmailRoute,
  assetRoute,
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
