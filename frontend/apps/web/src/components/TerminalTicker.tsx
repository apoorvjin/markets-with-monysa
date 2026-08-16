import { useQuery } from "@tanstack/react-query";
import type { QuoteItem } from "@monysa/contracts";
import { fmtPrice, fmtPct } from "@monysa/ui";
import { api } from "../lib/api";

/**
 * Scrolling ticker tape across the top of the Terminal. Poll-based (Phase 0) —
 * shares the `["quotes"]` query with Trading so there's one poll, not two.
 * The track is duplicated so the CSS marquee (translateX -50%) loops seamlessly.
 */
export function TerminalTicker() {
  const { data } = useQuery({
    queryKey: ["quotes"],
    queryFn: () => api.getQuotes(),
    refetchInterval: 30_000,
  });

  const quotes = data?.quotes ?? [];
  if (quotes.length === 0) return null;

  return (
    <div className="fbt-ticker" aria-hidden="true">
      <div className="fbt-ticker-track">
        {quotes.map((q) => (
          <TickerCell key={`a-${q.symbol}`} q={q} />
        ))}
        {quotes.map((q) => (
          <TickerCell key={`b-${q.symbol}`} q={q} />
        ))}
      </div>
    </div>
  );
}

function TickerCell({ q }: { q: QuoteItem }) {
  const chg = q.changePercent ?? null;
  const dir = chg == null ? "" : chg >= 0 ? "up" : "dn";
  return (
    <span className="fbt-tk">
      <b>{q.symbol}</b>
      <span className="fbt-tk-px">{fmtPrice(q.price, q.currency)}</span>
      {chg != null && <span className={dir}>{fmtPct(chg)}</span>}
    </span>
  );
}
