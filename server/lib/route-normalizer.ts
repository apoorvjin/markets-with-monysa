const PARAM_RULES: Array<[RegExp, string]> = [
  [/^\/api\/trading\/signals\/(.+)$/, "/api/trading/signals/:symbol"],
  [/^\/api\/trading\/backtest\/(.+)$/, "/api/trading/backtest/:symbol"],
  [/^\/api\/trading\/news\/(.+)$/, "/api/trading/news/:symbol"],
  [/^\/api\/trading\/analyst-note\/(.+)$/, "/api/trading/analyst-note/:symbol"],
  [/^\/api\/chart\/(.+)$/, "/api/chart/:symbol"],
  [/^\/api\/stocks\/(.+)$/, "/api/stocks/:country"],
  [/^\/api\/country-data\/(.+)$/, "/api/country-data/:code"],
];

export function normaliseRoute(method: string, rawPath: string): string {
  const path = rawPath.split("?")[0] ?? rawPath;
  for (const [re, canonical] of PARAM_RULES) {
    if (re.test(path)) return `${method} ${canonical}`;
  }
  return `${method} ${path}`;
}
