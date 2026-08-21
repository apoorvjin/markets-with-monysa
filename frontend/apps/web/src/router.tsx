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

/** Markets sub-tab lives in the URL so a tab is shareable, survives refresh,
    and answers the back button — `useState` did none of those. */
export const MARKET_TABS = [
  "overview",
  "heatmap",
  "indices",
  "commodities",
  "forex",
  "cftc",
] as const;
export type MarketTab = (typeof MARKET_TABS)[number];

const marketsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/markets",
  // Return type is annotated with an OPTIONAL key (and `{}` when absent) rather
  // than `{ tab: undefined }` — otherwise every existing navigate({to:"/markets"})
  // in the app is forced to pass `tab` explicitly.
  // Sub-tab state rides along too, so "the DAX heatmap" or "the Energy COT
  // table" is a shareable link rather than four clicks. Values are validated
  // by their own tabs, so they stay loose strings here.
  validateSearch: (
    search: Record<string, unknown>,
  ): { tab?: MarketTab; index?: string; tf?: string; cot?: string } => {
    const out: { tab?: MarketTab; index?: string; tf?: string; cot?: string } = {};
    if (MARKET_TABS.includes(search.tab as MarketTab)) out.tab = search.tab as MarketTab;
    if (typeof search.index === "string") out.index = search.index;
    if (typeof search.tf === "string") out.tf = search.tf;
    if (typeof search.cot === "string") out.cot = search.cot;
    return out;
  },
  component: MarketsPage,
});

/** Trading is a four-step funnel: scan for candidates, evaluate the signal,
    track it, act on it. `sym` is the symbol carried between steps. */
export const TRADING_TABS = ["scan", "evaluate", "track", "act"] as const;
export type TradingTab = (typeof TRADING_TABS)[number];

const tradingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/trading",
  validateSearch: (
    search: Record<string, unknown>,
  ): { tab?: TradingTab; sym?: string } => {
    const out: { tab?: TradingTab; sym?: string } = {};
    if (TRADING_TABS.includes(search.tab as TradingTab)) out.tab = search.tab as TradingTab;
    if (typeof search.sym === "string" && search.sym) out.sym = search.sym;
    return out;
  },
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
