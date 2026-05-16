import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/backend/db";

const RESET_TTL_MS = 60 * 60 * 1000; // 1 hour
const PREFIX = "pwdreset:" as const;

function resetIdentifier(userId: string): string {
  return `${PREFIX}${userId}`;
}

export function hashResetToken(plaintext: string): string {
  return createHash("sha256").update(plaintext, "utf8").digest("hex");
}

export function generateResetToken(): string {
  return randomBytes(32).toString("hex");
}

/**
 * Stores a one-time reset using the shared VerificationToken table (Auth.js–compatible schema).
 * Namespace: identifier `pwdreset:{userId}`, `token` = SHA-256 of the secret in the email link.
 */
export async function createPasswordResetForUser(userId: string): Promise<string> {
  const plaintext = generateResetToken();
  const tokenHash = hashResetToken(plaintext);
  const expires = new Date(Date.now() + RESET_TTL_MS);
  const identifier = resetIdentifier(userId);

  await prisma.$transaction([
    prisma.verificationToken.deleteMany({ where: { identifier } }),
    prisma.verificationToken.create({
      data: { identifier, token: tokenHash, expires },
    }),
  ]);

  return plaintext;
}

export async function consumePasswordResetToken(
  plaintext: string,
  newPasswordHash: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const tokenHash = hashResetToken(plaintext);
  const row = await prisma.verificationToken.findUnique({
    where: { token: tokenHash },
  });

  if (!row || !row.identifier.startsWith(PREFIX)) {
    return { ok: false, error: "This reset link is invalid or has already been used." };
  }
  if (row.expires.getTime() < Date.now()) {
    await prisma.verificationToken.deleteMany({ where: { token: tokenHash } });
    return { ok: false, error: "This reset link has expired. Request a new one." };
  }

  const userId = row.identifier.slice(PREFIX.length);
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });
  if (!user) {
    return { ok: false, error: "This reset link is invalid or has already been used." };
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: { passwordHash: newPasswordHash },
    }),
    prisma.verificationToken.deleteMany({
      where: { identifier: resetIdentifier(userId) },
    }),
  ]);

  return { ok: true };
}
