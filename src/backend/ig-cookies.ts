/**
 * Per-workspace storage for Instagram session cookies used by the Apify
 * DM-automation actor.
 *
 * Cookies are wrapped with AES-256-GCM using `AUTH_SECRET` as the key
 * material (HKDF-stretched to 32 bytes). The encrypted payload lives on
 * `Integration.meta.dmCookies`; plaintext never touches the database.
 *
 * This is best-effort symmetric crypto suitable for a self-hosted SaaS:
 * if `AUTH_SECRET` is rotated, stored cookies become unreadable (the agent
 * surfaces an `IGCookiesExpiredError` and the user is prompted to re-enter).
 */
import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
} from "crypto";
import { env } from "@/shared/env";
import { prisma } from "@/backend/db";
import { getIntegration } from "@/integrations/oauth";

const ALGO = "aes-256-gcm";
const IV_LEN = 12;

function deriveKey(): Buffer {
  const ikm = Buffer.from(env.AUTH_SECRET, "utf8");
  const salt = Buffer.from("xicmo:ig:cookies:v1", "utf8");
  const derived = hkdfSync("sha256", ikm, salt, Buffer.alloc(0), 32);
  return Buffer.from(derived);
}

export function encryptCookiesPayload(plaintext: string): string {
  const key = deriveKey();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    "v1",
    iv.toString("base64"),
    tag.toString("base64"),
    enc.toString("base64"),
  ].join(".");
}

export function decryptCookiesPayload(blob: string): string {
  const [version, ivB64, tagB64, encB64] = blob.split(".");
  if (version !== "v1") throw new Error("Unsupported cookie payload version");
  const key = deriveKey();
  const decipher = createDecipheriv(
    ALGO,
    key,
    Buffer.from(ivB64, "base64")
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const dec = Buffer.concat([
    decipher.update(Buffer.from(encB64, "base64")),
    decipher.final(),
  ]);
  return dec.toString("utf8");
}

/** Persist cookies for the given workspace. Accepts raw JSON or sessionid string. */
export async function saveIGCookies(
  workspaceId: string,
  cookiesPlaintext: string
) {
  const integration = await getIntegration(workspaceId, "INSTAGRAM");
  if (!integration) {
    throw new Error("Connect Instagram via Facebook OAuth first.");
  }
  const meta = (integration.meta ?? {}) as Record<string, unknown>;
  const nextMeta = {
    ...meta,
    dmCookies: encryptCookiesPayload(cookiesPlaintext),
    dmCookiesSavedAt: new Date().toISOString(),
  };
  await prisma.integration.update({
    where: { id: integration.id },
    data: { meta: JSON.parse(JSON.stringify(nextMeta)) },
  });
  return { ok: true as const };
}

export async function clearIGCookies(workspaceId: string) {
  const integration = await getIntegration(workspaceId, "INSTAGRAM");
  if (!integration) return { ok: true as const };
  const meta = (integration.meta ?? {}) as Record<string, unknown>;
  delete meta.dmCookies;
  delete meta.dmCookiesSavedAt;
  await prisma.integration.update({
    where: { id: integration.id },
    data: { meta: JSON.parse(JSON.stringify(meta)) },
  });
  return { ok: true as const };
}

/** Returns parsed cookies (or string sessionid) ready for the Apify DM actor. */
export async function loadIGCookies(
  workspaceId: string
): Promise<unknown | null> {
  const integration = await getIntegration(workspaceId, "INSTAGRAM");
  if (!integration) return null;
  const meta = (integration.meta ?? {}) as Record<string, unknown>;
  const blob = meta.dmCookies;
  if (typeof blob !== "string" || !blob) return null;
  const decrypted = decryptCookiesPayload(blob);
  // Accept either a raw JSON cookie jar or a plain sessionId string.
  try {
    return JSON.parse(decrypted);
  } catch {
    return decrypted;
  }
}

export async function hasIGCookies(workspaceId: string): Promise<boolean> {
  const integration = await getIntegration(workspaceId, "INSTAGRAM");
  if (!integration) return false;
  const meta = (integration.meta ?? {}) as Record<string, unknown>;
  return typeof meta.dmCookies === "string" && meta.dmCookies.length > 0;
}
