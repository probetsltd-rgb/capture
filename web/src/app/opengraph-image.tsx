import { ImageResponse } from "next/og";

export const alt = "Capture — Turn more demand into revenue";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Matches the design system's ink-on-paper palette (see globals.css) rather
// than introducing new brand colors just for the share preview.
export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#fcfcfb",
          padding: "72px",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ width: 14, height: 14, background: "#0e5c3d" }} />
          <div style={{ fontSize: 34, color: "#15171a", fontWeight: 600 }}>Capture</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 24, maxWidth: 980 }}>
          <div style={{ fontSize: 60, color: "#15171a", fontWeight: 600, lineHeight: 1.15 }}>
            Stop losing sales from delayed DM responses.
          </div>
          <div style={{ fontSize: 28, color: "#5b6169" }}>
            Instant Instagram and WhatsApp replies, qualified enquiries, and a person in the loop
            for anything that needs one.
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
