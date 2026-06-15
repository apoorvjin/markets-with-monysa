import { useEffect, useRef } from "react";

export function Sparkline(props: {
  points: number[];
  width?: number;
  height?: number;
  /** defaults to positive/danger token by trend */
  color?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const w = props.width ?? 96;
  const h = props.height ?? 28;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    const pts = props.points.filter((p) => Number.isFinite(p));
    if (pts.length < 2) return;

    const first = pts[0]!;
    const last = pts[pts.length - 1]!;
    const trendUp = last >= first;
    const styles = getComputedStyle(document.documentElement);
    const color =
      props.color ??
      (trendUp
        ? styles.getPropertyValue("--positive").trim() || "#00d4aa"
        : styles.getPropertyValue("--danger").trim() || "#ff4d6a");

    const min = Math.min(...pts);
    const max = Math.max(...pts);
    const span = max - min || 1;
    const pad = 2;
    const xStep = (w - pad * 2) / (pts.length - 1);
    const yOf = (v: number) => pad + (1 - (v - min) / span) * (h - pad * 2);

    ctx.beginPath();
    ctx.moveTo(pad, yOf(first));
    pts.forEach((p, i) => ctx.lineTo(pad + i * xStep, yOf(p)));
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.lineJoin = "round";
    ctx.stroke();
  }, [props.points, props.color, w, h]);

  return <canvas ref={ref} style={{ width: w, height: h, display: "block" }} />;
}
