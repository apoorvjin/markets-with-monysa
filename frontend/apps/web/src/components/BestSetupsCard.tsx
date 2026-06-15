import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  Card,
  changeClass,
  Chip,
  ChipRow,
  fmtPct,
  fmtPrice,
  FreshnessBar,
  SkeletonList,
} from "@monysa/ui";
import { api } from "../lib/api";

/** Best Setups (scanner backtest win-rate filter) — mirrors
    best_setups_card.dart. cacheWarm:false → keep polling every 30s. */
export function BestSetupsCard() {
  const [version, setVersion] = useState<"v1" | "v2">("v1");

  const { data, isLoading } = useQuery({
    queryKey: ["best-setups", version],
    queryFn: () => api.getBestSetups(version, "assets"),
    staleTime: 30 * 60_000,
    refetchInterval: (q) => (q.state.data?.cacheWarm === false ? 30_000 : false),
  });

  return (
    <Card>
      <div className="page-header">
        <strong>Best Setups</strong>
        <ChipRow>
          <Chip label="v1" active={version === "v1"} onClick={() => setVersion("v1")} />
          <Chip label="v2" active={version === "v2"} onClick={() => setVersion("v2")} />
        </ChipRow>
      </div>
      {isLoading || !data ? (
        <SkeletonList rows={6} height={30} />
      ) : data.cacheWarm === false && data.setups.length === 0 ? (
        <div className="cell-sub" style={{ padding: "var(--s4) 0" }}>
          Computing setups on the server — this refreshes automatically.
        </div>
      ) : (
        <>
          <div className="tbl-wrap" style={{ marginTop: "var(--s3)" }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Asset</th>
                  <th className="num">Signals</th>
                  <th className="num">Price</th>
                  <th className="num">1D %</th>
                  <th className="num">Win 1M</th>
                  <th className="num">Win 3M</th>
                  <th className="num">Win 1Y</th>
                  <th className="num">Avg ret 3M</th>
                </tr>
              </thead>
              <tbody>
                {data.setups.map((s) => (
                  <tr key={s.symbol}>
                    <td>
                      <span style={{ marginRight: 6 }}>{s.flag ?? ""}</span>
                      <span className="cell-main">{s.name}</span>{" "}
                      <span className="cell-sub">{s.symbol}</span>
                    </td>
                    <td className="num cell-main">{s.signalsActive ?? "—"}</td>
                    <td className="num">{fmtPrice(s.price)}</td>
                    <td className={`num ${changeClass(s.changePercent)}`}>
                      {fmtPct(s.changePercent)}
                    </td>
                    <td className="num">{fmtPct(s.winRate1m, false)}</td>
                    <td className="num">{fmtPct(s.winRate3m, false)}</td>
                    <td className="num">{fmtPct(s.winRate1y, false)}</td>
                    <td className={`num ${changeClass(s.avgReturn3m)}`}>
                      {fmtPct(s.avgReturn3m)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <FreshnessBar lastUpdated={data.lastUpdated} />
        </>
      )}
    </Card>
  );
}
