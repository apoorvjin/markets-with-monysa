import { useEffect, useState } from "react";
import { QuotesResponse } from "@monysa/contracts";
import { baseUrl, queryClient } from "./api";

/**
 * Subscribes to the server's SSE quote stream and pushes each frame straight
 * into the shared `["quotes"]` query cache. Every consumer (ticker, board,
 * watchlist, movers) re-renders live with no per-component change. If the
 * stream drops or EventSource is unsupported, the queries' own 30s
 * `refetchInterval` polling is the automatic fallback.
 *
 * Returns whether the stream is currently connected (for a status indicator).
 */
export function useQuoteStream(): boolean {
  const [live, setLive] = useState(false);

  useEffect(() => {
    let es: EventSource | null = null;
    try {
      es = new EventSource(`${baseUrl}/api/trading/stream/quotes`);
      es.onopen = () => setLive(true);
      es.onmessage = (e) => {
        try {
          queryClient.setQueryData(["quotes"], QuotesResponse.parse(JSON.parse(e.data)));
        } catch {
          /* ignore a malformed frame — the next one will be fine */
        }
      };
      es.onerror = () => {
        // EventSource auto-reconnects; mark offline so the UI shows polling mode.
        setLive(false);
      };
    } catch {
      /* EventSource unsupported — polling fallback stays active */
    }
    return () => {
      es?.close();
      setLive(false);
    };
  }, []);

  return live;
}
