import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Inter, JetBrains_Mono } from "next/font/google";
import { Toaster } from "sonner";
import { auth } from "@/backend/auth";
import { AuthProvider } from "@/app/auth-provider";
import { ThemeProvider } from "@/app/theme-provider";
import { RouteProgress } from "@/frontend/components/ui/route-progress";
import { env } from "@/shared/env";
import { PRODUCT_LINE, SITE_NAME } from "@/shared/site";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(env.NEXT_PUBLIC_APP_URL),
  title: {
    default: `${SITE_NAME} — ${PRODUCT_LINE}`,
    template: `%s · ${SITE_NAME}`,
  },
  description: `${SITE_NAME} coordinates specialized AI agents for SEO, GEO, social, and content — one workspace, credits you control, approve-before-publish.`,
  keywords: [
    SITE_NAME,
    "xicmo.com",
    "AI marketing",
    "SEO agent",
    "GEO agent",
    "Reddit marketing",
    "content automation",
  ],
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: SITE_NAME,
    statusBarStyle: "black-translucent",
  },
  openGraph: {
    title: `${SITE_NAME} — ${PRODUCT_LINE}`,
    description: `Autonomous marketing agents for growth teams — ${PRODUCT_LINE}.`,
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_NAME,
    description: `Autonomous marketing agents for growth teams — ${PRODUCT_LINE}.`,
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0612" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  return (
    <html lang="en" className={`${inter.variable} ${mono.variable}`} suppressHydrationWarning>
      <body className="min-h-screen bg-background text-foreground">
        <ThemeProvider>
          <Suspense fallback={null}>
            <RouteProgress />
          </Suspense>
          <AuthProvider session={session}>{children}</AuthProvider>
          <Toaster position="top-right" richColors closeButton />
        </ThemeProvider>
      </body>
    </html>
  );
}
