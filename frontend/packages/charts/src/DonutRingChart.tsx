import { useState } from "react";

export interface DonutSegment {
  label: string;
  value: number;
  color: string;
  /** Optional sub-label shown in legend (e.g. "±1.23%"). */
  sublabel?: string;
}

export interface DonutRingChartProps {
  segments: DonutSegment[];
  centerLabel?: string;
  centerValue?: string;
  size?: number;
  strokeWidth?: number;
}

function polarToCartesian(
  cx: number,
  cy: number,
  r: number,
  angleDeg: number,
): { x: number; y: number } {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function describeArc(
  cx: number,
  cy: number,
  r: number,
  startDeg: number,
  endDeg: number,
): string {
  const clampedEnd = Math.min(endDeg, startDeg + 359.99);
  const start = polarToCartesian(cx, cy, r, startDeg);
  const end = polarToCartesian(cx, cy, r, clampedEnd);
  const largeArc = clampedEnd - startDeg > 180 ? 1 : 0;
  return [
    "M",
    start.x.toFixed(3),
    start.y.toFixed(3),
    "A",
    r,
    r,
    0,
    largeArc,
    1,
    end.x.toFixed(3),
    end.y.toFixed(3),
  ].join(" ");
}

export function DonutRingChart({
  segments,
  centerLabel = "Total",
  centerValue,
  size = 200,
  strokeWidth = 24,
}: DonutRingChartProps) {
  const [hovered, setHovered] = useState<number | null>(null);

  const total = segments.reduce((a, s) => a + Math.max(0, s.value), 0);
  if (total === 0) return null;

  const cx = size / 2;
  const cy = size / 2;
  const r = (size - strokeWidth) / 2 - 2;

  const GAP_DEG = 2.5;
  let currentAngle = 0;

  const arcs = segments.map((seg, i) => {
    const fraction = Math.max(0, seg.value) / total;
    const arcDeg = fraction * 360 - GAP_DEG;
    const startAngle = currentAngle + GAP_DEG / 2;
    const endAngle = startAngle + Math.max(0, arcDeg);
    currentAngle += fraction * 360;
    return { ...seg, startAngle, endAngle, fraction, index: i };
  });

  const hoveredSeg = hovered !== null ? segments[hovered] : null;
  const hoveredArc = hovered !== null ? arcs[hovered] : null;
  const displayLabel = hoveredSeg ? hoveredSeg.label : centerLabel;
  const displayValue = hoveredArc
    ? `${(hoveredArc.fraction * 100).toFixed(0)}%`
    : (centerValue ?? `${segments.length}`);

  return (
    <div className="donut-wrap">
      <div className="donut-svg-wrap" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          style={{ display: "block" }}
        >
          {/* Background ring */}
          <circle
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke="rgba(255,255,255,0.06)"
            strokeWidth={strokeWidth}
          />
          {arcs.map((arc) => (
            <path
              key={arc.label}
              d={describeArc(cx, cy, r, arc.startAngle, arc.endAngle)}
              fill="none"
              stroke={arc.color}
              strokeWidth={strokeWidth}
              strokeLinecap="butt"
              opacity={
                hovered === null || hovered === arc.index ? 1 : 0.35
              }
              style={{ cursor: "pointer", transition: "opacity 150ms" }}
              onMouseEnter={() => setHovered(arc.index)}
              onMouseLeave={() => setHovered(null)}
            />
          ))}
        </svg>
        <div className="donut-center">
          <span className="donut-center-label">{displayLabel}</span>
          <span className="donut-center-value">{displayValue}</span>
        </div>
      </div>
      <div className="donut-legend">
        {segments.map((seg, i) => (
          <div
            key={seg.label}
            className="donut-legend-item"
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
            style={{ cursor: "default" }}
          >
            <div className="donut-dot" style={{ background: seg.color }} />
            <span className="donut-legend-name" title={seg.label}>
              {seg.label}
            </span>
            {seg.sublabel && (
              <span
                className="donut-legend-pct"
                style={{
                  color:
                    seg.sublabel.startsWith("+")
                      ? "var(--positive)"
                      : seg.sublabel.startsWith("-")
                        ? "var(--danger)"
                        : "var(--text-secondary)",
                }}
              >
                {seg.sublabel}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
