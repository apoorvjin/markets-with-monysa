import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import {
  INSTITUTIONAL_FLOW_TYPES,
  type InstitutionalFlowAsset,
  type InstitutionalFlowType,
} from "@monysa/contracts";
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

/** Mirrors _typeBadges in moby/lib/features/investing/investing_screen.dart —
    same fields, same thresholds, same formatting (data-display parity). */
function typeBadges(s: InstitutionalFlowAsset, type: InstitutionalFlowType) {
  const badges: Array<{ label: string; tone: string }> = [];
  if (s.volumeRatio != null && s.volumeRatio > 0) {
    badges.push({ label: `${s.volumeRatio.toFixed(1)}× vol`, tone: "buy" });
  }
  switch (type) {
    case "vwap":
      if (s.vwapDeviation != null) {
        badges.push({
          label: `${s.vwapDeviation >= 0 ? "+" : ""}${s.vwapDeviation.toFixed(1)}% VWAP`,
          tone: s.vwapDeviation >= 0 ? "buy" : "sell",
        });
      }
      break;
    case "obv":
      if (s.obvSlopeRatio != null) {
        badges.push({ label: `OBV +${s.obvSlopeRatio.toFixed(1)}d`, tone: "buy" });
      }
      if (s.periodChangePercent != null) {
        badges.push({
          label: `${s.periodChangePercent >= 0 ? "+" : ""}${s.periodChangePercent.toFixed(1)}% 14d`,
          tone: s.periodChangePercent >= 0 ? "buy" : "sell",
        });
      }
      break;
    case "short":
      if (s.shortPercentFloat != null) {
        badges.push({ label: `${s.shortPercentFloat.toFixed(1)}% SI`, tone: "hold" });
      }
      if (s.shortRatio != null) {
        badges.push({ label: `${s.shortRatio.toFixed(1)}d cover`, tone: "neutral" });
      }
      break;
    case "insider":
      if (s.insiderCount != null) {
        badges.push({ label: `${s.insiderCount} insiders`, tone: "buy" });
      }
      if (
        s.filingCount != null &&
        s.insiderCount != null &&
        s.filingCount > s.insiderCount
      ) {
        badges.push({ label: `${s.filingCount} filings`, tone: "neutral" });
      }
      break;
  }
  return badges;
}

export function InstitutionalFlowCard() {
  const navigate = useNavigate();
  const [type, setType] = useState<InstitutionalFlowType>("accumulation");
  const { data, isLoading, error } = useQuery({
    queryKey: ["institutional-flow", type],
    queryFn: () => api.getInstitutionalFlow(type),
    staleTime: 30 * 60_000, // mirrors server INST_FLOW_TTL
  });

  return (
    <Card>
      <div className="page-header">
        <strong>Institutional Flow</strong>
        <FreshnessBar lastUpdated={data?.lastUpdated} />
      </div>
      <div className="cell-sub" style={{ marginBottom: "var(--s3)" }}>
        Top 10 US stocks showing institutional buying, selling, or squeeze
        pressure
      </div>
      <ChipRow>
        {INSTITUTIONAL_FLOW_TYPES.map((t) => (
          <Chip
            key={t.param}
            label={t.label}
            active={type === t.param}
            onClick={() => setType(t.param)}
          />
        ))}
      </ChipRow>
      {error ? (
        <div className="cell-sub">Unable to load institutional flow data</div>
      ) : isLoading || !data ? (
        <SkeletonList rows={6} height={26} />
      ) : data.assets.length === 0 ? (
        <div className="cell-sub">No stocks match the current filter right now.</div>
      ) : (
        <table className="tbl">
          <tbody>
            {data.assets.map((s) => (
              <tr
                key={s.symbol}
                className="clickable"
                onClick={() =>
                  void navigate({
                    to: "/asset/$symbol",
                    params: { symbol: s.symbol },
                    search: { name: s.name },
                  })
                }
              >
                <td>
                  <span className="cell-main">{s.symbol}</span>{" "}
                  <span className="cell-sub">{s.name}</span>
                </td>
                <td>
                  {typeBadges(s, type).map((b) => (
                    <span
                      key={b.label}
                      className="ui-badge"
                      data-tone={b.tone}
                      style={{ marginRight: "var(--s2)" }}
                    >
                      {b.label}
                    </span>
                  ))}
                </td>
                <td className="num">{fmtPrice(s.price)}</td>
                <td className={`num ${changeClass(s.changePercent)}`}>
                  {fmtPct(s.changePercent)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}
