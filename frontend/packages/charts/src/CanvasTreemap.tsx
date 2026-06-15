import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export interface TreemapDatum {
  id: string;
  label: string;
  /** drives tile area (e.g. effectiveMarketCap) */
  value: number;
  /** drives tile color (% change) */
  change: number;
  sublabel?: string;
  group?: string;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Placed extends Rect {
  datum: TreemapDatum;
}

/** Bruls/Huijzing/van Wijk squarified treemap — port of sector_treemap.dart. */
function squarify(items: TreemapDatum[], rect: Rect): Placed[] {
  const total = items.reduce((s, d) => s + d.value, 0);
  if (total <= 0 || rect.w <= 0 || rect.h <= 0) return [];
  const scale = (rect.w * rect.h) / total;
  const sorted = [...items].sort((a, b) => b.value - a.value);
  const out: Placed[] = [];

  let { x, y, w, h } = rect;
  let row: TreemapDatum[] = [];
  let rowArea = 0;

  const worst = (areaSum: number, minA: number, maxA: number, side: number) => {
    const s2 = areaSum * areaSum;
    const side2 = side * side;
    return Math.max((side2 * maxA) / s2, s2 / (side2 * minA));
  };

  const layoutRow = () => {
    if (row.length === 0) return;
    const horizontal = w < h; // lay row along the shorter side
    const side = horizontal ? w : h;
    const thickness = rowArea / side;
    let offset = 0;
    for (const d of row) {
      const len = (d.value * scale) / thickness;
      out.push(
        horizontal
          ? { x: x + offset, y, w: len, h: thickness, datum: d }
          : { x, y: y + offset, w: thickness, h: len, datum: d },
      );
      offset += len;
    }
    if (horizontal) {
      y += thickness;
      h -= thickness;
    } else {
      x += thickness;
      w -= thickness;
    }
    row = [];
    rowArea = 0;
  };

  for (const d of sorted) {
    const area = d.value * scale;
    const side = Math.min(w, h);
    if (row.length > 0) {
      const areas = row.map((r) => r.value * scale);
      const minA = Math.min(...areas);
      const maxA = Math.max(...areas);
      const current = worst(rowArea, minA, maxA, side);
      const withNext = worst(
        rowArea + area,
        Math.min(minA, area),
        Math.max(maxA, area),
        side,
      );
      if (withNext > current) layoutRow();
    }
    row.push(d);
    rowArea += area;
  }
  layoutRow();
  return out;
}

function hexToRgb(hex: string): [number, number, number] {
  const m = hex.replace("#", "");
  return [
    parseInt(m.slice(0, 2), 16),
    parseInt(m.slice(2, 4), 16),
    parseInt(m.slice(4, 6), 16),
  ];
}

function mix(a: [number, number, number], b: [number, number, number], t: number) {
  return `rgb(${Math.round(a[0] + (b[0] - a[0]) * t)},${Math.round(
    a[1] + (b[1] - a[1]) * t,
  )},${Math.round(a[2] + (b[2] - a[2]) * t)})`;
}

const NEUTRAL: [number, number, number] = [42, 46, 57];
const UP = hexToRgb("#00d4aa");
const DOWN = hexToRgb("#ff4d6a");

/** Diverging color: clamp change to ±3% like Finviz-style maps. */
function tileColor(change: number): string {
  const t = Math.max(-1, Math.min(1, change / 3));
  if (t >= 0) return mix(NEUTRAL, UP, t * 0.85);
  return mix(NEUTRAL, DOWN, -t * 0.85);
}

interface GroupRect extends Rect {
  name: string;
  hasHeader: boolean;
}

const GROUP_HEADER_H = 18;
const TOOLTIP_GAP = 14;
const TOOLTIP_EST_W = 280;
const TOOLTIP_EST_H = 92;

/** Two-level layout (port of sector_treemap.dart _computeLayout): squarify
 * groups across the canvas, then squarify each group's items inside its rect,
 * reserving a header strip so the group name stays readable. */
function computeGroupedLayout(
  items: TreemapDatum[],
  rect: Rect,
): { tiles: Placed[]; groups: GroupRect[] } {
  const byGroup = new Map<string, TreemapDatum[]>();
  for (const d of items) {
    const g = d.group ?? "Other";
    const arr = byGroup.get(g);
    if (arr) arr.push(d);
    else byGroup.set(g, [d]);
  }
  const sum = (ds: TreemapDatum[]) => ds.reduce((a, b) => a + b.value, 0);
  const groupItems: TreemapDatum[] = [...byGroup.entries()].map(([name, ds]) => ({
    id: name,
    label: name,
    value: sum(ds),
    change: 0,
  }));

  const groupRects = squarify(groupItems, rect);
  const tiles: Placed[] = [];
  const groups: GroupRect[] = [];
  for (const gr of groupRects) {
    const hasHeader = gr.h >= 28 && gr.w >= 80;
    groups.push({ x: gr.x, y: gr.y, w: gr.w, h: gr.h, name: gr.datum.label, hasHeader });
    const inner: Rect = hasHeader
      ? { x: gr.x, y: gr.y + GROUP_HEADER_H, w: gr.w, h: gr.h - GROUP_HEADER_H }
      : { x: gr.x, y: gr.y, w: gr.w, h: gr.h };
    tiles.push(...squarify(byGroup.get(gr.datum.label)!, inner));
  }
  return { tiles, groups };
}

export function CanvasTreemap(props: {
  data: TreemapDatum[];
  height?: number;
  onSelect?: (d: TreemapDatum | null) => void;
  /** Fires when a group header strip is clicked (sector drill-in). */
  onGroupSelect?: (group: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: props.height ?? 560 });
  const [hovered, setHovered] = useState<TreemapDatum | null>(null);
  const [hoveredGroup, setHoveredGroup] = useState<string | null>(null);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const height = props.height ?? 560;

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setSize({ w: el.clientWidth, h: height });
    });
    ro.observe(el);
    setSize({ w: el.clientWidth, h: height });
    return () => ro.disconnect();
  }, [height]);

  const grouped = useMemo(() => props.data.some((d) => d.group != null), [props.data]);

  const layout = useMemo(() => {
    const items = props.data.filter((d) => d.value > 0);
    const rect = { x: 0, y: 0, w: size.w, h: size.h };
    if (grouped) return computeGroupedLayout(items, rect);
    return { tiles: squarify(items, rect), groups: [] as GroupRect[] };
  }, [props.data, size, grouped]);
  const placed = layout.tiles;

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || size.w === 0) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size.w * dpr;
    canvas.height = size.h * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, size.w, size.h);

    // Group header strips behind the tiles (mirrors _SectorHeader).
    for (const g of layout.groups) {
      if (!g.hasHeader) continue;
      const isHover = hoveredGroup === g.name;
      ctx.fillStyle = isHover ? "rgba(0,0,0,0.55)" : "rgba(0,0,0,0.35)";
      ctx.fillRect(g.x, g.y, g.w, GROUP_HEADER_H);
      if (g.h >= 24 && g.w >= 60) {
        ctx.fillStyle = isHover ? "rgba(255,255,255,0.95)" : "#cccccc";
        ctx.font = "700 9px Inter, sans-serif";
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText(g.name.toUpperCase(), g.x + 7, g.y + GROUP_HEADER_H / 2, g.w - 14);
      }
    }

    for (const p of placed) {
      const isHover = hovered?.id === p.datum.id;
      ctx.fillStyle = tileColor(p.datum.change);
      ctx.fillRect(p.x, p.y, p.w, p.h);
      ctx.strokeStyle = isHover ? "rgba(255,255,255,0.9)" : "rgba(0,0,0,0.55)";
      ctx.lineWidth = isHover ? 2 : 1;
      ctx.strokeRect(p.x + 0.5, p.y + 0.5, p.w - 1, p.h - 1);

      // Ticker labels — scale the font down to fit the tile (FittedBox port);
      // only slivers too thin for a single readable glyph stay blank.
      if (p.w >= 14 && p.h >= 10) {
        let fontSize = Math.max(9, Math.min(18, Math.sqrt(p.w * p.h) / 7));
        ctx.font = `600 ${fontSize}px Inter, sans-serif`;
        const textW = ctx.measureText(p.datum.label).width;
        const fit = Math.min(1, (p.w - 5) / textW, (p.h - 3) / (fontSize * 1.2));
        fontSize *= fit;
        if (fontSize >= 5) {
          // Stack %change under the symbol only when there's vertical room.
          const showChange = p.h >= 30 && p.w >= 36 && fontSize >= 8;
          ctx.fillStyle = "rgba(255,255,255,0.95)";
          ctx.font = `600 ${fontSize}px Inter, sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          const cx = p.x + p.w / 2;
          const cy = p.y + p.h / 2;
          ctx.fillText(p.datum.label, cx, cy - (showChange ? fontSize * 0.55 : 0), p.w - 4);
          if (showChange) {
            ctx.fillStyle = "rgba(255,255,255,0.75)";
            ctx.font = `500 ${fontSize * 0.78}px Inter, sans-serif`;
            const sign = p.datum.change > 0 ? "+" : "";
            ctx.fillText(`${sign}${p.datum.change.toFixed(2)}%`, cx, cy + fontSize * 0.65, p.w - 4);
          }
        }
      }
    }

    // Group boundary outlines on top of tiles, in the page background colour,
    // so sectors look visibly separated (mirrors the mobile 2.5px outline).
    if (layout.groups.length > 0) {
      const bg =
        getComputedStyle(canvas).getPropertyValue("--bg").trim() || "#000000";
      ctx.strokeStyle = bg;
      ctx.lineWidth = 2.5;
      for (const g of layout.groups) {
        ctx.strokeRect(g.x, g.y, g.w, g.h);
      }
    }
  }, [placed, layout.groups, hovered, hoveredGroup, size]);

  useEffect(() => {
    draw();
  }, [draw]);

  const toLocal = (e: React.MouseEvent): { x: number; y: number } | null => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const hitTest = (e: React.MouseEvent): TreemapDatum | null => {
    const pt = toLocal(e);
    if (!pt) return null;
    for (const p of placed) {
      if (pt.x >= p.x && pt.x <= p.x + p.w && pt.y >= p.y && pt.y <= p.y + p.h)
        return p.datum;
    }
    return null;
  };

  // Header strips sit above the tile area, so only hit when no tile matched.
  const hitTestGroupHeader = (e: React.MouseEvent): string | null => {
    if (!props.onGroupSelect) return null;
    const pt = toLocal(e);
    if (!pt) return null;
    for (const g of layout.groups) {
      if (
        g.hasHeader &&
        pt.x >= g.x &&
        pt.x <= g.x + g.w &&
        pt.y >= g.y &&
        pt.y <= g.y + GROUP_HEADER_H
      )
        return g.name;
    }
    return null;
  };

  return (
    <div ref={wrapRef} style={{ width: "100%", position: "relative" }}>
      <canvas
        ref={canvasRef}
        style={{
          width: size.w,
          height: size.h,
          display: "block",
          borderRadius: "var(--r-md)",
          cursor: hovered || hoveredGroup ? "pointer" : "default",
        }}
        onMouseMove={(e) => {
          const tile = hitTest(e);
          setHovered(tile);
          setHoveredGroup(tile ? null : hitTestGroupHeader(e));
          setCursor(toLocal(e));
        }}
        onMouseLeave={() => {
          setHovered(null);
          setHoveredGroup(null);
          setCursor(null);
        }}
        onClick={(e) => {
          const tile = hitTest(e);
          if (!tile) {
            const group = hitTestGroupHeader(e);
            if (group) {
              props.onGroupSelect?.(group);
              return;
            }
          }
          props.onSelect?.(tile);
        }}
      />
      {hovered && cursor && (
        <div
          style={{
            position: "absolute",
            // Follow the cursor; flip to the other side near the right/bottom
            // edges so the card never leaves the canvas.
            left: Math.max(
              4,
              cursor.x + TOOLTIP_GAP + TOOLTIP_EST_W > size.w
                ? cursor.x - TOOLTIP_GAP - TOOLTIP_EST_W
                : cursor.x + TOOLTIP_GAP,
            ),
            top: Math.max(
              4,
              cursor.y + TOOLTIP_GAP + TOOLTIP_EST_H > size.h
                ? cursor.y - TOOLTIP_GAP - TOOLTIP_EST_H
                : cursor.y + TOOLTIP_GAP,
            ),
            maxWidth: TOOLTIP_EST_W,
            pointerEvents: "none",
            background: "var(--header-bg)",
            border: "1px solid var(--border-strong)",
            borderRadius: "var(--r-sm)",
            padding: "var(--s3) var(--s4)",
            font: "500 var(--fs-md) var(--font-sans)",
            color: "var(--text-primary)",
            backdropFilter: "blur(8px)",
          }}
        >
          <div style={{ fontWeight: 600 }}>{hovered.label}</div>
          {hovered.sublabel && (
            <div style={{ color: "var(--text-secondary)" }}>{hovered.sublabel}</div>
          )}
          <div className={hovered.change >= 0 ? "num-up" : "num-down"}>
            {hovered.change > 0 ? "+" : ""}
            {hovered.change.toFixed(2)}%
          </div>
        </div>
      )}
    </div>
  );
}
