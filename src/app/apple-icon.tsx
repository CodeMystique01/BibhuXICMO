import { ImageResponse } from "next/og";

export const runtime = "edge";
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          fontSize: 120,
          background:
            "linear-gradient(135deg, #6d28d9 0%, #c026d3 50%, #1f0b3a 100%)",
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "white",
          fontWeight: 800,
          fontFamily: "system-ui, -apple-system, sans-serif",
          borderRadius: 36,
        }}
      >
        x
      </div>
    ),
    { ...size }
  );
}
