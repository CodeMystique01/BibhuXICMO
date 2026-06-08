/**
 * Normalizes Supabase Postgres URLs before Prisma connects.
 *
 * Render start runs this first so a single DATABASE_URL (transaction pooler)
 * is enough — DIRECT_URL is derived automatically when omitted.
 *
 * Usage:
 *   node scripts/ensure-db-env.mjs          # validate + print summary
 *   node scripts/ensure-db-env.mjs --export # print shell exports for bash
 */
import process from "node:process";

function ensureSsl(url) {
  if (/sslmode=/i.test(url)) return url;
  return url + (url.includes("?") ? "&" : "?") + "sslmode=require";
}

function ensurePgbouncer(url) {
  if (!/:6543\//.test(url)) return url;
  if (/pgbouncer=true/i.test(url)) return url;
  return url + (url.includes("?") ? "&" : "?") + "pgbouncer=true&connection_limit=1";
}

function cleanQueryParams(url) {
  let u = url
    .replace(/([?&])pgbouncer=true&?/gi, "$1")
    .replace(/([?&])connection_limit=\d+&?/gi, "$1")
    .replace(/\?&/g, "?")
    .replace(/[?&]$/g, "");
  return u;
}

function deriveDirectUrl(databaseUrl) {
  const explicit = process.env.DIRECT_URL?.trim();
  if (explicit) return ensureSsl(explicit);

  let direct = databaseUrl;
  // Supabase transaction pooler (6543) → session pooler (5432), same host.
  direct = direct.replace(":6543/", ":5432/");
  direct = cleanQueryParams(direct);
  return ensureSsl(direct);
}

function maskUrl(url) {
  try {
    const u = new URL(url);
    if (u.password) u.password = "***";
    return u.toString();
  } catch {
    return "(invalid url)";
  }
}

const raw = process.env.DATABASE_URL?.trim();
if (!raw) {
  console.error("[db] ERROR: DATABASE_URL is not set in Render → Environment.");
  console.error("[db] Add your Supabase transaction pooler URL (port 6543).");
  process.exit(1);
}

const databaseUrl = ensurePgbouncer(ensureSsl(raw));
const directUrl = deriveDirectUrl(databaseUrl);

process.env.DATABASE_URL = databaseUrl;
process.env.DIRECT_URL = directUrl;

const exportMode = process.argv.includes("--export");

if (exportMode) {
  const esc = (s) => `'${s.replace(/'/g, `'\\''`)}'`;
  process.stdout.write(`export DATABASE_URL=${esc(databaseUrl)}\n`);
  process.stdout.write(`export DIRECT_URL=${esc(directUrl)}\n`);
} else {
  console.log("[db] DATABASE_URL:", maskUrl(databaseUrl));
  console.log("[db] DIRECT_URL: ", maskUrl(directUrl));
  if (!process.env.DIRECT_URL?.trim() || process.env.DIRECT_URL === directUrl) {
    if (!raw.includes(":5432/") && raw.includes(":6543/")) {
      console.log("[db] DIRECT_URL derived from DATABASE_URL (6543 → 5432).");
    }
  }
}
