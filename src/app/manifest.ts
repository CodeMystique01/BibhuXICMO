import type { MetadataRoute } from "next";
import { SITE_NAME, PRODUCT_LINE } from "@/shared/site";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${SITE_NAME} — ${PRODUCT_LINE}`,
    short_name: SITE_NAME,
    description: `${SITE_NAME} coordinates specialized AI agents for SEO, GEO, social, and content.`,
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    background_color: "#0a0612",
    theme_color: "#0a0612",
    orientation: "any",
    icons: [
      {
        src: "/icon.png",
        sizes: "256x256",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/apple-icon.png",
        sizes: "180x180",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
