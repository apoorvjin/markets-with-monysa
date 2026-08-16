import sharp from "sharp";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Font stack ends in sans-serif so it always resolves on the build host
// (Inter/Helvetica may be absent on Linux; librsvg falls back gracefully).
const FONT = "Inter, Helvetica, Arial, sans-serif";

export interface OgOptions {
  kicker?: string;
  /** 1–2 title lines. */
  lines: string[];
  stat: string;
  statColor?: string;
}

/** Render a 1200×630 branded OG card to a PNG buffer. */
export async function renderOg({
  kicker = "",
  lines,
  stat,
  statColor = "#00D4AA",
}: OgOptions): Promise<Buffer> {
  const longest = Math.max(...lines.map((l) => l.length), 1);
  const titleSize = longest > 20 ? 74 : longest > 14 ? 88 : 104;
  const titleTop = 300;
  const step = titleSize + 16;
  const titleEls = lines
    .map(
      (l, i) =>
        `<text x="90" y="${titleTop + i * step}" font-family="${FONT}" font-size="${titleSize}" font-weight="800" fill="#F4F6F8">${esc(l)}</text>`,
    )
    .join("");
  const statY = titleTop + lines.length * step + 60;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#04140f"/>
        <stop offset="0.55" stop-color="#050607"/>
        <stop offset="1" stop-color="#000000"/>
      </linearGradient>
      <radialGradient id="glow" cx="18%" cy="14%" r="40%">
        <stop offset="0" stop-color="#00D4AA" stop-opacity="0.22"/>
        <stop offset="1" stop-color="#00D4AA" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="1200" height="630" fill="url(#bg)"/>
    <rect width="1200" height="630" fill="url(#glow)"/>
    <circle cx="112" cy="98" r="26" fill="#00D4AA"/>
    <text x="158" y="112" font-family="${FONT}" font-size="44" font-weight="700" fill="#F4F6F8">FinBrio</text>
    ${kicker ? `<text x="92" y="212" font-family="${FONT}" font-size="28" font-weight="600" letter-spacing="4" fill="#00D4AA">${esc(kicker.toUpperCase())}</text>` : ""}
    ${titleEls}
    <text x="90" y="${statY}" font-family="${FONT}" font-size="112" font-weight="800" fill="${statColor}">${esc(stat)}</text>
    <text x="90" y="590" font-family="${FONT}" font-size="28" font-weight="500" fill="#8A9099">finbrio.net</text>
  </svg>`;

  return sharp(Buffer.from(svg)).png().toBuffer();
}
