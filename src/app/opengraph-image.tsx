import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "ScamDunk - Detect Stock Scam Red Flags";
export const size = {
  width: 1200,
  height: 630,
};

export const contentType = "image/png";

// Paper & Ink palette (agency design, Aug 2026)
const PAPER = "#ffffff";
const INK = "#10161a";
const TEAL = "#215a66";
const MUTED = "#5a6165";
const BORDER = "#d8d4c8";

export default async function Image() {
  return new ImageResponse(
    <div
      style={{
        background: PAPER,
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        justifyContent: "center",
        fontFamily: "system-ui, -apple-system, sans-serif",
        color: INK,
        padding: "80px 96px",
      }}
    >
      {/* Eyebrow */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "14px",
          fontSize: 22,
          letterSpacing: "6px",
          textTransform: "uppercase",
          color: TEAL,
          fontWeight: 600,
        }}
      >
        <div
          style={{
            width: "12px",
            height: "12px",
            borderRadius: "9999px",
            background: TEAL,
          }}
        />
        Free stock scam &amp; fraud checker
      </div>

      {/* Wordmark row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "28px",
          marginTop: "36px",
        }}
      >
        {/* Shield-check mark */}
        <svg viewBox="0 0 256 256" width="110" height="110">
          <path
            d="M 128 20 L 200 60 L 200 140 C 200 200 128 236 128 236 C 128 236 56 200 56 140 L 56 60 Z"
            fill={TEAL}
          />
          <g transform="translate(128, 128) scale(0.7)">
            <line
              x1="-30"
              y1="0"
              x2="-10"
              y2="20"
              stroke={PAPER}
              strokeWidth="14"
              strokeLinecap="round"
            />
            <line
              x1="-10"
              y1="20"
              x2="30"
              y2="-20"
              stroke={PAPER}
              strokeWidth="14"
              strokeLinecap="round"
            />
          </g>
        </svg>
        <div
          style={{
            fontSize: 110,
            fontWeight: 300,
            letterSpacing: "-5px",
            color: INK,
          }}
        >
          ScamDunk
        </div>
      </div>

      {/* Tagline */}
      <div
        style={{
          fontSize: 34,
          color: MUTED,
          marginTop: "28px",
          maxWidth: "860px",
          lineHeight: 1.35,
        }}
      >
        That tip came from someone you trust. That&apos;s exactly why you
        should check it.
      </div>

      {/* Hairline + footer line */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          marginTop: "48px",
          width: "100%",
        }}
      >
        <div style={{ height: "1px", background: BORDER, width: "100%" }} />
        <div
          style={{
            display: "flex",
            marginTop: "22px",
            fontSize: 22,
            color: MUTED,
          }}
        >
          Free · No signup · 15-second scan · scamdunk.com
        </div>
      </div>
    </div>,
    {
      ...size,
    },
  );
}
