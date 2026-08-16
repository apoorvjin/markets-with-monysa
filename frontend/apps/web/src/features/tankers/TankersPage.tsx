import { useQuery } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import {
  VESSEL_CATEGORIES,
  type Chokepoint,
  type MaritimeVessel,
  type VesselCategory,
} from "@monysa/contracts";
import { Chip, ChipRow, timeAgo } from "@monysa/ui";
import { api } from "../../lib/api";
import { TankersMap, type TankersMapHandle, CATEGORY_COLORS, GAS_COLOR } from "./TankersMap";

type Tab = "chokepoints" | "vessels";

const CATEGORY_LABELS: Record<VesselCategory, string> = {
  tanker: "Tankers",
  cargo: "Cargo",
  passenger: "Passenger",
  highspeed: "High-speed",
  tug_special: "Tug / Special",
  fishing: "Fishing",
  pleasure: "Pleasure / Sail",
  other: "Other",
};

export function TankersPage() {
  const [tab, setTab] = useState<Tab>("chokepoints");
  const [active, setActive] = useState<Set<VesselCategory>>(new Set(VESSEL_CATEGORIES));
  const [showChokepoints, setShowChokepoints] = useState(true);
  const [search, setSearch] = useState("");
  const mapRef = useRef<TankersMapHandle>(null);

  // Only send a `types` filter when the user has narrowed it — all-on means the
  // full firehose (server still caps the count).
  const typesParam =
    active.size === VESSEL_CATEGORIES.length ? undefined : [...active].join(",");

  const vesselsQuery = useQuery({
    queryKey: ["maritime-vessels", typesParam ?? "all"],
    queryFn: () => api.getMaritimeVessels({ types: typesParam }),
    staleTime: 15_000,
    refetchInterval: 20_000, // live snapshot — poll like a ticker
  });

  const chokepointsQuery = useQuery({
    queryKey: ["maritime-chokepoints"],
    queryFn: () => api.getMaritimeChokepoints(),
    staleTime: 15_000,
    refetchInterval: 20_000,
  });

  const vessels = vesselsQuery.data?.vessels ?? [];
  const total = vesselsQuery.data?.total ?? 0;
  const source = vesselsQuery.data?.source ?? null;
  const lastUpdated = vesselsQuery.data?.lastUpdated ?? null;
  const chokepoints = chokepointsQuery.data?.chokepoints ?? [];

  const toggleCategory = (c: VesselCategory) =>
    setActive((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      // never allow zero categories — that would blank the map confusingly
      return next.size ? next : prev;
    });

  const focusVessel = (v: MaritimeVessel) => mapRef.current?.flyTo(v.lon, v.lat, 10);
  const focusChokepoint = (c: Chokepoint) => {
    setShowChokepoints(true);
    mapRef.current?.flyTo(c.lon, c.lat, 7);
  };

  const filteredVessels = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return vessels;
    return vessels.filter(
      (v) => (v.name ?? "").toLowerCase().includes(q) || (v.dest ?? "").toLowerCase().includes(q),
    );
  }, [vessels, search]);

  const tankerTotal = useMemo(() => chokepoints.reduce((s, c) => s + c.tankers, 0), [chokepoints]);

  return (
    <div className="tk-page">
      <header className="tk-head">
        <div className="tk-head-title">
          <span className="tk-live-dot" aria-hidden />
          <h1>TANKERS</h1>
          <span className="tk-head-sub">
            {total.toLocaleString()} VESSELS TRACKED · {tankerTotal.toLocaleString()} TANKERS IN CHOKEPOINTS
          </span>
          {source && (
            <span
              className="tk-source"
              data-source={source}
              title={lastUpdated ? `Feed updated ${new Date(lastUpdated).toLocaleString()}` : undefined}
            >
              <span className="tk-source-dot" />
              {source === "live"
                ? `AIS LIVE${lastUpdated ? ` · ${timeAgo(lastUpdated)}` : ""}`
                : "AIS FEED COLD — aisstream unavailable"}
            </span>
          )}
        </div>
        <input
          className="tk-search"
          placeholder="Search vessel name or destination…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </header>

      {source === "cold" && (
        <div className="tk-cold-note" role="status">
          Live AIS positions are momentarily unavailable (the free aisstream.io feed is a beta service
          with no uptime guarantee). Strategic chokepoints are shown below — vessel positions repopulate
          automatically the moment the feed resumes.
        </div>
      )}

      <div className="tk-legend">
        {VESSEL_CATEGORIES.map((c) => (
          <button
            key={c}
            type="button"
            className="tk-legend-chip"
            data-off={active.has(c) ? undefined : "true"}
            onClick={() => toggleCategory(c)}
            title={active.has(c) ? "Hide on map" : "Show on map"}
          >
            <span className="tk-legend-dot" style={{ background: CATEGORY_COLORS[c] }} />
            {CATEGORY_LABELS[c]}
          </button>
        ))}
        <span className="tk-legend-sep" />
        <span className="tk-legend-chip tk-legend-static" title="Likely LNG/LPG carrier (name heuristic)">
          <span className="tk-legend-dot" style={{ background: GAS_COLOR }} />
          Gas carrier
        </span>
      </div>

      <div className="tk-body">
        <div className="tk-map-panel">
          <div className="tk-map-toggles">
            <ChipRow>
              <Chip label="Chokepoints" active={showChokepoints} onClick={() => setShowChokepoints((v) => !v)} />
            </ChipRow>
            <LayerInfo />
          </div>
          <TankersMap
            ref={mapRef}
            vessels={vessels}
            chokepoints={chokepoints}
            showVessels
            showChokepoints={showChokepoints}
          />
        </div>

        <aside className="tk-sidebar">
          <ChipRow>
            <Chip label="Chokepoints" active={tab === "chokepoints"} onClick={() => setTab("chokepoints")} />
            <Chip label="Vessels" active={tab === "vessels"} onClick={() => setTab("vessels")} />
          </ChipRow>

          <div className="tk-sidebar-body">
            {tab === "chokepoints" && (
              <ChokepointList points={chokepoints} loading={chokepointsQuery.isLoading} onSelect={focusChokepoint} />
            )}
            {tab === "vessels" && (
              <VesselList items={filteredVessels} loading={vesselsQuery.isLoading} onSelect={focusVessel} />
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

function LayerInfo() {
  const [open, setOpen] = useState(false);
  return (
    <div className="tk-info">
      <button
        type="button"
        className="tk-info-btn"
        aria-label="About this data"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        ?
      </button>
      {open && (
        <>
          <div className="tk-info-backdrop" onClick={() => setOpen(false)} />
          <div className="tk-info-pop" role="dialog" aria-label="Data notes">
            <div className="tk-info-block">
              <div className="tk-info-head">Live positions (AIS)</div>
              <p>
                Vessel positions stream live over <strong>AIS</strong>. Coverage is{" "}
                <strong>terrestrial</strong> — reception is strongest near coasts, ports and straits;
                ships far out in open ocean can drop off until they're back in range.
              </p>
            </div>
            <div className="tk-info-block">
              <div className="tk-info-head">Ship types</div>
              <p>
                Colored by AIS ship type. <strong>Tankers</strong> (orange) carry oil/chemicals;{" "}
                <strong>gas carriers</strong> (yellow) are LNG/LPG — flagged by name, since AIS can't
                separate them from other tankers on its own.
              </p>
            </div>
            <div className="tk-info-block">
              <div className="tk-info-head">Chokepoints</div>
              <p>
                Rings mark 13 strategic straits and canals; ring size tracks the number of tankers
                currently transiting each.
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function ChokepointList(props: {
  points: Chokepoint[];
  loading: boolean;
  onSelect: (c: Chokepoint) => void;
}) {
  if (props.loading) return <ListSkeleton />;
  if (props.points.length === 0) return <div className="tk-empty">No chokepoint data yet.</div>;
  return (
    <div className="tk-list">
      {props.points.map((c) => (
        <button key={c.id} type="button" className="tk-row tk-row-btn" title="Show on map" onClick={() => props.onSelect(c)}>
          <div className="tk-row-main">
            <span className="tk-row-title">{c.name}</span>
            <span className="tk-row-total">{c.total}</span>
          </div>
          <div className="tk-row-breakdown">
            {c.tankers > 0 && <span data-kind="tanker">{c.tankers} tankers</span>}
            {c.gasCarriers > 0 && <span data-kind="gas">{c.gasCarriers} gas</span>}
            {(c.byCategory.cargo ?? 0) > 0 && <span data-kind="cargo">{c.byCategory.cargo} cargo</span>}
          </div>
        </button>
      ))}
    </div>
  );
}

function VesselList(props: {
  items: MaritimeVessel[];
  loading: boolean;
  onSelect: (v: MaritimeVessel) => void;
}) {
  if (props.loading) return <ListSkeleton />;
  if (props.items.length === 0) return <div className="tk-empty">No vessels in range.</div>;
  return (
    <div className="tk-list">
      {props.items.slice(0, 300).map((v) => (
        <button key={v.mmsi} type="button" className="tk-row tk-row-btn" title="Show on map" onClick={() => props.onSelect(v)}>
          <div className="tk-row-main">
            <span className="tk-row-title">
              <span className="tk-row-dot" style={{ background: v.gas ? GAS_COLOR : CATEGORY_COLORS[v.category] }} />
              {v.name ?? `MMSI ${v.mmsi}`}
            </span>
            {v.sog != null && v.sog >= 0 && <span className="tk-row-total">{v.sog.toFixed(1)} kn</span>}
          </div>
          <div className="tk-row-breakdown">
            <span>{v.gas ? "gas carrier" : CATEGORY_LABELS[v.category]}</span>
            {v.dest && <span>→ {v.dest}</span>}
          </div>
        </button>
      ))}
      {props.items.length > 300 && (
        <div className="tk-empty">+{(props.items.length - 300).toLocaleString()} more on the map</div>
      )}
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="tk-list">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="tk-row-skel" />
      ))}
    </div>
  );
}
