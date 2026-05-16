import { ImageResponse } from "next/og";

export const runtime = "edge";
export const size = { width: 256, height: 256 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          fontSize: 168,
          background: "linear-gradient(135deg, #6d28d9 0%, #c026d3 50%, #1f0b3a 100%)",
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "white",
          fontWeight: 800,
          letterSpacing: "-0.05em",
          fontFamily: "system-ui, -apple-system, sans-serif",
        }}
      >
        x
      </div>
    ),
    { ...size }
  );
}
