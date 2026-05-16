import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Diagnostic endpoint — returns whether each critical environment variable
 * is set at runtime, without leaking the values. Use this to confirm Vercel
 * has actually delivered the env vars to the deployed function.
 *
 * Example: curl https://www.xicmo.com/api/health/env
 *
 * { "ok": true, "DATABASE_URL": { "set": true, "len": 142, "preview": "...require" }, ... }
 *
 * "preview" is only the last 8 chars (never enough to leak a secret) and is
 * only included when set — useful to spot trailing-space / wrong-value typos.
 */
function probe(name: string) {
  const v = process.env[name];
  if (!v) return { set: false };
  return {
    set: true,
    len: v.length,
    preview: v.length > 8 ? `…${v.slice(-8)}` : "…(short)",
  };
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    runtime: process.env.VERCEL ? "vercel" : "local",
    nodeEnv: process.env.NODE_ENV,
    region: process.env.VERCEL_REGION ?? null,
    // critical for the register / login flow
    DATABASE_URL: probe("DATABASE_URL"),
    AUTH_SECRET: probe("AUTH_SECRET"),
    AUTH_URL: probe("AUTH_URL"),
    NEXT_PUBLIC_APP_URL: probe("NEXT_PUBLIC_APP_URL"),
    APP_URL: probe("APP_URL"),
    // critical for the AI CMO experience
    ANTHROPIC_API_KEY: probe("ANTHROPIC_API_KEY"),
    OPENAI_API_KEY: probe("OPENAI_API_KEY"),
    GOOGLE_GEMINI_API_KEY: probe("GOOGLE_GEMINI_API_KEY"),
    OPENROUTER_API_KEY: probe("OPENROUTER_API_KEY"),
    PAGESPEED_API_KEY: probe("PAGESPEED_API_KEY"),
    ts: new Date().toISOString(),
  });
}
