"use server";

import { z } from "zod";
import { prisma } from "@/backend/db";
import { sendEmail } from "@/backend/email";
import { createPasswordResetForUser } from "@/backend/password-reset";
import { env } from "@/shared/env";
import { SITE_NAME } from "@/shared/site";

const emailSchema = z.object({
  email: z.string().email("Enter a valid email address."),
});

export type ForgotResult =
  | { ok: true; message: string }
  | { ok: false; error: string };

/** Same user-visible message whether or not the account exists (avoid email enumeration). */
const GENERIC_SUCCESS =
  "If an account exists for that email, you will receive a password reset link shortly.";

export async function requestPasswordResetAction(
  _prev: ForgotResult | null,
  formData: FormData
): Promise<ForgotResult> {
  const parsed = emailSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid email" };
  }

  const email = parsed.data.email.toLowerCase();
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, passwordHash: true },
  });

  if (!user?.passwordHash) {
    return { ok: true, message: GENERIC_SUCCESS };
  }

  const plaintext = await createPasswordResetForUser(user.id);
  const resetUrl = `${env.APP_URL.replace(/\/$/, "")}/reset-password?token=${encodeURIComponent(plaintext)}`;

  const html = `
  <p>Hi,</p>
  <p>Someone requested a password reset for your ${SITE_NAME} account. Click the link below to choose a new password. This link expires in one hour.</p>
  <p><a href="${resetUrl}">Reset your password</a></p>
  <p>If you did not request this, you can ignore this email.</p>
  `;

  const sent = await sendEmail({
    to: email,
    subject: `Reset your ${SITE_NAME} password`,
    html,
  });

  if (sent.skipped) {
    console.warn(
      "[password-reset] RESEND_API_KEY not set; reset link not emailed. Token was created in DB — add Resend in production."
    );
    if (process.env.NODE_ENV === "development") {
      console.info("[password-reset dev] reset URL:", resetUrl);
    }
  }

  return { ok: true, message: GENERIC_SUCCESS };
}
