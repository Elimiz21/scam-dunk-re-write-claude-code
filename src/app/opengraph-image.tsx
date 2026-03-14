import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "ScamDunk - Detect Stock Scam Red Flags";
export const size = {
  width: 1200,
  height: 630,
};

export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    <div
      style={{
        fontSize: 48,
        background: "linear-gradient(135deg, #0f0f23 0%, #1a1a2e 100%)",
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "system-ui, -apple-system, sans-serif",
        color: "white",
        padding: "40px",
        gap: "20px",
      }}
    >
      {/* Shield icon SVG */}
      <svg
        viewBox="0 0 256 256"
        width="120"
        height="120"
        style={{
          filter: "drop-shadow(0 4px 6px rgba(0, 0, 0, 0.3))",
        }}
      >
        <defs>
          <linearGradient id="shieldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FF6B4A" />
            <stop offset="50%" stopColor="#FF9F1C" />
            <stop offset="100%" stopColor="#2A9D8F" />
          </linearGradient>
        </defs>
        <path
          d="M 128 20 L 200 60 L 200 140 C 200 200 128 236 128 236 C 128 236 56 200 56 140 L 56 60 Z"
          fill="url(#shieldGrad)"
          stroke="white"
          strokeWidth="2"
        />
        <g transform="translate(128, 128) scale(0.7)">
          <line
            x1="-30"
            y1="0"
            x2="-10"
            y2="20"
            stroke="white"
            strokeWidth="12"
            strokeLinecap="round"
          />
          <line
            x1="-10"
            y1="20"
            x2="30"
            y2="-20"
            stroke="white"
            strokeWidth="12"
            strokeLinecap="round"
          />
        </g>
      </svg>

      {/* Main text */}
      <div
        style={{
          fontSize: 56,
          fontWeight: "bold",
          textAlign: "center",
          letterSpacing: "-2px",
        }}
      >
        ScamDunk
      </div>

      {/* Tagline */}
      <div
        style={{
          fontSize: 32,
          color: "rgba(255, 255, 255, 0.8)",
          textAlign: "center",
        }}
      >
        Detect Stock Scam Red Flags
      </div>

      {/* Bottom text */}
      <div
        style={{
          fontSize: 20,
          color: "rgba(255, 255, 255, 0.6)",
          marginTop: "20px",
        }}
      >
        AI-powered fraud detection for retail investors
      </div>
    </div>,
    {
      ...size,
    },
  );
}
