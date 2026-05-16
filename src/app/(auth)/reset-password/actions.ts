"use server";

import { z } from "zod";
import bcrypt from "bcryptjs";
import { consumePasswordResetToken } from "@/backend/password-reset";

const schema = z.object({
  token: z.string().min(1, "Missing reset token."),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

export type ResetPasswordResult =
  | { ok: true }
  | { ok: false; error: string };

export async function resetPasswordAction(
  _prev: ResetPasswordResult | null,
  formData: FormData
): Promise<ResetPasswordResult> {
  const parsed = schema.safeParse({
    token: formData.get("token"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { ok: false, error: first?.message ?? "Invalid input" };
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  const result = await consumePasswordResetToken(parsed.data.token, passwordHash);

  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  return { ok: true };
}
