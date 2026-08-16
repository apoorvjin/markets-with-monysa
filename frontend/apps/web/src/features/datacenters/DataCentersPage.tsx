import { useQuery } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import type { CountyPipelinePoint, DataCenterFacility } from "@monysa/contracts";
import { Chip, ChipRow, timeAgo } from "@monysa/ui";
import { api } from "../../lib/api";
import { DataCentersMap, type DataCentersMapHandle } from "./DataCentersMap";

type Tab = "facilities" | "pipeline" | "announcements";

export function DataCentersPage() {
  const [tab, setTab] = useState<Tab>("pipeline");
  const [showFacilities, setShowFacilities] = useState(true);
  const [showPipeline, setShowPipeline] = useState(true);
  const [search, setSearch] = useState("");
  const mapRef = useRef<DataCentersMapHandle>(null);

  // Fly to a clicked sidebar row, ensuring its layer is visible first so the
  // point isn't focused behind a toggled-off layer.
  const focusFacility = (f: DataCenterFacility) => {
    if (f.lat == null || f.lon == null) return;
    setShowFacilities(true);
    mapRef.current?.flyTo(f.lon, f.lat, 11);
  };
  const focusPipeline = (p: CountyPipelinePoint) => {
    if (p.lat == null || p.lon == null) return;
    setShowPipeline(true);
    mapRef.current?.flyTo(p.lon, p.lat, 7);
  };

  const facilitiesQuery = useQuery({
    queryKey: ["dc-facilities"],
    queryFn: () => api.getDatacenterFacilities(),
    staleTime: 60 * 60_000,
  });

  const pipelineQuery = useQuery({
    queryKey: ["dc-pipeline"],
    queryFn: () => api.getDatacenterPipeline(),
    staleTime: 60 * 60_000,
    // Cold cache returns a cacheWarm:false skeleton while the server scrapes
    // + geocodes in the background (can take minutes on the very first run
    // of the day) — poll until it's warm, same pattern as Best Setups.
    refetchInterval: (query) => (query.state.data?.cacheWarm === false ? 20_000 : false),
  });

  const announcementsQuery = useQuery({
    queryKey: ["dc-announcements"],
    queryFn: () => api.getDatacenterAnnouncements(),
    staleTime: 30 * 60_000,
  });

  const facilities = facilitiesQuery.data?.items ?? [];
  const pipeline = pipelineQuery.data?.points ?? [];
  const announcements = announcementsQuery.data?.items ?? [];
  const pipelineWarm = pipelineQuery.data?.cacheWarm ?? false;
  const facSource = facilitiesQuery.data?.source ?? null;
  const facUpdated = facilitiesQuery.data?.lastUpdated ?? null;

  const filteredFacilities = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return facilities;
    return facilities.filter(
      (f) => f.name.toLowerCase().includes(q) || (f.operator ?? "").toLowerCase().includes(q),
    );
  }, [facilities, search]);

  const filteredPipeline = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return pipeline;
    return pipeline.filter(
      (p) => p.county.toLowerCase().includes(q) || p.regionName.toLowerCase().includes(q),
    );
  }, [pipeline, search]);

  const totals = useMemo(() => {
    const t = { Operational: 0, Construction: 0, Proposed: 0 };
    for (const p of pipeline) {
      t.Operational += p.counts.Operational ?? 0;
      t.Construction += p.counts.Construction ?? 0;
      t.Proposed += p.counts.Proposed ?? 0;
    }
    return t;
  }, [pipeline]);

  return (
    <div className="dc-page">
      <header className="dc-head">
        <div className="dc-head-title">
          <span className="dc-live-dot" aria-hidden />
          <h1>DATA CENTERS</h1>
          <span className="dc-head-sub">
            {facilities.length.toLocaleString()} FACILITIES (OSM) · {pipeline.length.toLocaleString()} COUNTIES TRACKED
          </span>
          {facSource && (
            <span className="dc-source" data-source={facSource} title={facUpdated ? `Facilities updated ${new Date(facUpdated).toLocaleString()}` : undefined}>
              <span className="dc-source-dot" />
              {facSource === "live"
                ? `OSM LIVE${facUpdated ? ` · ${timeAgo(facUpdated)}` : ""}`
                : "OSM SNAPSHOT (Overpass unreachable)"}
            </span>
          )}
        </div>
        <input
          className="dc-search"
          placeholder="Search facility, operator, county…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </header>

      <div className="dc-stats">
        <StatChip label="Operational" value={totals.Operational} color="#00d4aa" />
        <StatChip label="Under construction" value={totals.Construction} color="#ffb84d" />
        <StatChip label="Proposed" value={totals.Proposed} color="#4d7cff" />
        {!pipelineWarm && <span className="dc-warming">Pipeline data warming up — checking back automatically…</span>}
      </div>

      <div className="dc-body">
        <div className="dc-map-panel">
          <div className="dc-map-toggles">
            <ChipRow>
              <Chip label="Facilities" active={showFacilities} onClick={() => setShowFacilities((v) => !v)} />
              <Chip label="Pipeline" active={showPipeline} onClick={() => setShowPipeline((v) => !v)} />
            </ChipRow>
            <LayerInfo />
          </div>
          <DataCentersMap
            ref={mapRef}
            facilities={facilities}
            pipeline={pipeline}
            showFacilities={showFacilities}
            showPipeline={showPipeline}
          />
        </div>

        <aside className="dc-sidebar">
          <ChipRow>
            <Chip label="Pipeline" active={tab === "pipeline"} onClick={() => setTab("pipeline")} />
            <Chip label="Facilities" active={tab === "facilities"} onClick={() => setTab("facilities")} />
            <Chip label="Announcements" active={tab === "announcements"} onClick={() => setTab("announcements")} />
          </ChipRow>

          <div className="dc-sidebar-body">
            {tab === "pipeline" && (
              <PipelineList points={filteredPipeline} loading={pipelineQuery.isLoading} onSelect={focusPipeline} />
            )}
            {tab === "facilities" && (
              <FacilitiesList items={filteredFacilities} loading={facilitiesQuery.isLoading} onSelect={focusFacility} />
            )}
            {tab === "announcements" && (
              <AnnouncementsList
                items={announcements}
                loading={announcementsQuery.isLoading}
              />
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
    <div className="dc-info">
      <button
        type="button"
        className="dc-info-btn"
        aria-label="What are Facilities and Pipeline?"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        ?
      </button>
      {open && (
        <>
          <div className="dc-info-backdrop" onClick={() => setOpen(false)} />
          <div className="dc-info-pop" role="dialog" aria-label="Layer definitions">
            <div className="dc-info-block">
              <div className="dc-info-head">
                <span className="dc-info-dot" style={{ background: "#00d4aa" }} />
                Facilities
              </div>
              <p>
                Data centers that <strong>already exist and operate</strong>, mapped in
                OpenStreetMap (~4,500 worldwide). Precise locations, but crowdsourced — coverage
                is strongest in the US and Europe.
              </p>
            </div>
            <div className="dc-info-block">
              <div className="dc-info-head">
                <span className="dc-info-dot" style={{ background: "#4d7cff" }} />
                Pipeline
              </div>
              <p>
                US &amp; Canada data-center projects tracked through the{" "}
                <strong>power-grid interconnection process</strong> (interconnection.fyi) — the
                forward-looking AI build-out signal. Grouped by county and colored by status:
                proposed, under construction, or operational.
              </p>
            </div>
            <p className="dc-info-note">
              Two different sources with different coverage — not the same data in two views.
            </p>
          </div>
        </>
      )}
    </div>
  );
}

function StatChip(props: { label: string; value: number; color: string }) {
  return (
    <div className="dc-stat-chip">
      <span className="dc-stat-dot" style={{ background: props.color }} />
      <span className="dc-stat-value">{props.value.toLocaleString()}</span>
      <span className="dc-stat-label">{props.label}</span>
    </div>
  );
}

function PipelineList(props: {
  points: CountyPipelinePoint[];
  loading: boolean;
  onSelect: (p: CountyPipelinePoint) => void;
}) {
  if (props.loading) return <ListSkeleton />;
  if (props.points.length === 0) return <div className="dc-empty">No pipeline data yet.</div>;
  return (
    <div className="dc-list">
      {props.points.map((p) => {
        const locatable = p.lat != null && p.lon != null;
        return (
          <button
            key={`${p.region}-${p.county}`}
            type="button"
            className="dc-row dc-row-btn"
            disabled={!locatable}
            title={locatable ? "Show on map" : "No coordinates"}
            onClick={() => props.onSelect(p)}
          >
            <div className="dc-row-main">
              <span className="dc-row-title">{p.county}, {p.region}</span>
              <span className="dc-row-total">{p.total}</span>
            </div>
            <div className="dc-row-breakdown">
              {(p.counts.Operational ?? 0) > 0 && <span data-status="Operational">{p.counts.Operational} op</span>}
              {(p.counts.Construction ?? 0) > 0 && <span data-status="Construction">{p.counts.Construction} constr</span>}
              {(p.counts.Proposed ?? 0) > 0 && <span data-status="Proposed">{p.counts.Proposed} proposed</span>}
            </div>
          </button>
        );
      })}
    </div>
  );
}

function FacilitiesList(props: {
  items: DataCenterFacility[];
  loading: boolean;
  onSelect: (f: DataCenterFacility) => void;
}) {
  if (props.loading) return <ListSkeleton />;
  if (props.items.length === 0) return <div className="dc-empty">No facilities match.</div>;
  return (
    <div className="dc-list">
      {props.items.slice(0, 300).map((f) => (
        <button key={f.id} type="button" className="dc-row dc-row-btn" title="Show on map" onClick={() => props.onSelect(f)}>
          <div className="dc-row-main">
            <span className="dc-row-title">{f.name}</span>
          </div>
          {(f.operator || f.tier) && (
            <div className="dc-row-breakdown">
              {f.operator && <span>{f.operator}</span>}
              {f.tier && <span>Tier {f.tier}</span>}
            </div>
          )}
        </button>
      ))}
      {props.items.length > 300 && (
        <div className="dc-empty">+{(props.items.length - 300).toLocaleString()} more on the map</div>
      )}
    </div>
  );
}

function AnnouncementsList(props: {
  items: Array<{ title: string; link: string; pubDate: string; source: string; tickers?: string[] | null }>;
  loading: boolean;
}) {
  if (props.loading) return <ListSkeleton />;
  if (props.items.length === 0) return <div className="dc-empty">No recent hyperscaler PRs matched.</div>;
  return (
    <div className="dc-list">
      {props.items.map((a) => (
        <a key={a.link} className="dc-row dc-row-link" href={a.link} target="_blank" rel="noopener noreferrer">
          <div className="dc-row-main">
            <span className="dc-row-title">{a.title}</span>
          </div>
          <div className="dc-row-breakdown">
            <span>{a.source}</span>
            <span>{timeAgo(a.pubDate)}</span>
            {a.tickers?.map((t) => (
              <span key={t} className="dc-ticker">${t}</span>
            ))}
          </div>
        </a>
      ))}
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="dc-list">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="dc-row-skel" />
      ))}
    </div>
  );
}
