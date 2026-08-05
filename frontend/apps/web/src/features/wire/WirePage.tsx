import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  WIRE_DESKS,
  WIRE_DESK_LABELS,
  type WireDesk,
  type WireItem,
} from "@monysa/contracts";
import { Chip, ChipRow, timeAgo } from "@monysa/ui";
import { api } from "../../lib/api";
import { IntelligencePage } from "./IntelligencePage";
import {
  isWireOrderCustomized,
  moveWireDesk,
  nudgeWireDesk,
  resetWireDeskOrder,
  useWireDeskOrder,
} from "../../lib/wireDeskOrder";

const REFETCH_MS = 90_000;
const NEW_WINDOW_MS = 60 * 60_000; // items in the last hour count as "NEW"

type WireTab = "terminal" | "intelligence";

export function WirePage() {
  const [tab, setTab] = useState<WireTab>(() =>
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("tab") === "intelligence"
      ? "intelligence"
      : "terminal",
  );
  return (
    <div className="wire-terminal">
      <header className="wire-head">
        <div className="wire-head-title">
          <span className="wire-live-dot" aria-hidden />
          <h1>WIRE</h1>
          <span className="wire-head-sub">
            {tab === "terminal"
              ? `GLOBAL INTELLIGENCE TERMINAL · ${WIRE_DESKS.length} DESKS · LIVE`
              : "SIGNALS · SEISMIC · MARKETS · MARITIME · AVIATION"}
          </span>
        </div>
        <ChipRow>
          <Chip label="Terminal" active={tab === "terminal"} onClick={() => setTab("terminal")} />
          <Chip
            label="Intelligence"
            active={tab === "intelligence"}
            onClick={() => setTab("intelligence")}
          />
        </ChipRow>
      </header>

      {tab === "terminal" ? <TerminalView /> : <IntelligencePage />}
    </div>
  );
}

function TerminalView() {
  const order = useWireDeskOrder();
  const [draggingDesk, setDraggingDesk] = useState<WireDesk | null>(null);
  const customized = isWireOrderCustomized();

  return (
    <>
      <div className="wire-toolbar">
        <div className="wire-legend">
          <span className="wire-badge" data-sev="breaking">BREAKING</span>
          <span className="wire-badge" data-sev="alert">ALERT</span>
          <span className="wire-badge" data-sev="caution">CAUTION</span>
          <span className="wire-tag" data-cat="conflict">CONFLICT</span>
          <span className="wire-tag" data-cat="disaster">DISASTER</span>
        </div>
        {customized && (
          <button
            type="button"
            className="wire-reset-order"
            onClick={() => resetWireDeskOrder()}
          >
            RESET ORDER
          </button>
        )}
      </div>

      <div className="wire-grid">
        {order.map((desk) => (
          <DeskColumn
            key={desk}
            desk={desk}
            isDragging={draggingDesk === desk}
            onDragStart={() => setDraggingDesk(desk)}
            onDragEnd={() => setDraggingDesk(null)}
            onDropOver={() => {
              if (draggingDesk) moveWireDesk(draggingDesk, desk);
            }}
          />
        ))}
      </div>
    </>
  );
}

interface DeskColumnProps {
  desk: WireDesk;
  isDragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDropOver: () => void;
}

function DeskColumn({
  desk,
  isDragging,
  onDragStart,
  onDragEnd,
  onDropOver,
}: DeskColumnProps) {
  const { data, isLoading, error, isFetching } = useQuery({
    queryKey: ["wire-items", desk],
    queryFn: () => api.getWireItems(desk, 40),
    staleTime: 60_000,
    refetchInterval: REFETCH_MS,
    refetchIntervalInBackground: false,
  });

  const items = data?.items ?? [];
  const newCount = useMemo(
    () => items.filter((i) => withinWindow(i.pubDate, NEW_WINDOW_MS)).length,
    [items],
  );

  return (
    <section
      className="wire-col"
      data-desk={desk}
      data-dragging={isDragging ? "true" : "false"}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
      }}
      onDrop={(e) => {
        e.preventDefault();
        onDropOver();
      }}
    >
      <div className="wire-col-head">
        <button
          type="button"
          className="wire-col-handle"
          draggable
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("text/plain", desk);
            onDragStart();
          }}
          onDragEnd={onDragEnd}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
              e.preventDefault();
              nudgeWireDesk(desk, -1);
            } else if (e.key === "ArrowRight" || e.key === "ArrowDown") {
              e.preventDefault();
              nudgeWireDesk(desk, 1);
            }
          }}
          aria-label={`Drag to reorder ${WIRE_DESK_LABELS[desk]}, or use arrow keys`}
          title="Drag to reorder"
        >
          ⠿
        </button>
        <span className="wire-col-name">{WIRE_DESK_LABELS[desk]}</span>
        <div className="wire-col-meta">
          {newCount > 0 && <span className="wire-new">{newCount} NEW</span>}
          <span className="wire-status" data-on={error ? "false" : "true"}>
            <span className="wire-status-dot" data-pulse={isFetching ? "true" : "false"} />
            {error ? "OFFLINE" : "LIVE"}
          </span>
          <span className="wire-col-count">{items.length}</span>
        </div>
      </div>

      <div className="wire-col-body">
        {isLoading ? (
          <div className="wire-col-loading">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="wire-skel" />
            ))}
          </div>
        ) : error ? (
          <div className="wire-col-empty">Feed unavailable.</div>
        ) : items.length === 0 ? (
          <div className="wire-col-empty">No headlines.</div>
        ) : (
          items.map((item) => <WireCard key={item.link} item={item} />)
        )}
      </div>
    </section>
  );
}

function WireCard({ item }: { item: WireItem }) {
  const sev = item.severity || "normal";
  const cat = item.category || "general";
  return (
    <a
      className="wire-card"
      data-sev={sev}
      href={item.link}
      target="_blank"
      rel="noopener noreferrer"
    >
      <div className="wire-card-meta">
        <span className="wire-card-source">{item.source}</span>
        {sev !== "normal" && (
          <span className="wire-badge" data-sev={sev}>
            {sev.toUpperCase()}
          </span>
        )}
        {cat !== "general" && (
          <span className="wire-tag" data-cat={cat}>
            {cat.toUpperCase()}
          </span>
        )}
      </div>
      <div className="wire-card-title">{item.title}</div>
      {item.tickers && item.tickers.length > 0 && (
        <div className="wire-card-tickers">
          {item.tickers.map((t) => (
            <span key={t} className="wire-card-ticker">
              {t}
            </span>
          ))}
        </div>
      )}
      {item.pubDate && <div className="wire-card-time">{timeAgo(item.pubDate)}</div>}
    </a>
  );
}

function withinWindow(iso: string, windowMs: number): boolean {
  const t = Date.parse(iso);
  return !Number.isNaN(t) && Date.now() - t <= windowMs;
}
