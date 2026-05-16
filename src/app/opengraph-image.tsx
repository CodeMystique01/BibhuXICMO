import { ImageResponse } from "next/og";
import { SITE_NAME, PRODUCT_LINE } from "@/shared/site";

export const runtime = "edge";
export const alt = `${SITE_NAME} — ${PRODUCT_LINE}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OG() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background:
            "radial-gradient(circle at 20% 20%, #1f0b3a 0%, #0a0612 60%)",
          display: "flex",
          flexDirection: "column",
          padding: 80,
          color: "#fff",
          fontFamily: "system-ui, -apple-system, sans-serif",
        }}
      >
        <div
          style={{
            fontSize: 36,
            fontWeight: 600,
            color: "#a78bfa",
            display: "flex",
            alignItems: "center",
            gap: 16,
          }}
        >
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 16,
              background:
                "linear-gradient(135deg, #6d28d9 0%, #c026d3 50%, #1f0b3a 100%)",
              fontSize: 44,
              fontWeight: 800,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            x
          </div>
          {SITE_NAME}
        </div>
        <div
          style={{
            marginTop: 60,
            fontSize: 80,
            fontWeight: 700,
            lineHeight: 1.05,
            letterSpacing: "-0.03em",
            maxWidth: 1000,
          }}
        >
          {PRODUCT_LINE}
        </div>
        <div
          style={{
            marginTop: 32,
            fontSize: 28,
            color: "#cbd5e1",
            maxWidth: 900,
            lineHeight: 1.4,
          }}
        >
          Autonomous marketing agents for growth teams. SEO, GEO, social, content
          — one workspace, credits you control, approve-before-publish.
        </div>
        <div
          style={{
            marginTop: "auto",
            fontSize: 22,
            color: "#94a3b8",
            display: "flex",
            alignItems: "center",
            gap: 16,
          }}
        >
          xicmo.com · No credit card required
        </div>
      </div>
    ),
    { ...size }
  );
}
