import type { Request, Response, NextFunction } from "express";

export type ChartRenderer = "yahoo" | "tradingview" | "inhouse";

const VALID_RENDERERS: ReadonlySet<string> = new Set([
  "yahoo",
  "tradingview",
  "inhouse",
]);

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      chartRenderer: ChartRenderer;
    }
  }
}

/**
 * Reads the `X-Chart-Renderer` header set by the Flutter Dio interceptor and
 * attaches it to `req.chartRenderer`. Defaults to `yahoo` when the header is
 * missing or unrecognised, preserving the legacy WebView payload shape for
 * older clients.
 */
export function parseChartRenderer(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const raw = req.headers["x-chart-renderer"];
  const value = Array.isArray(raw) ? raw[0] : raw;
  req.chartRenderer =
    typeof value === "string" && VALID_RENDERERS.has(value)
      ? (value as ChartRenderer)
      : "yahoo";
  next();
}
