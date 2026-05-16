"use server";

import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/backend/db";
import { signIn } from "@/backend/auth";
import { slugify } from "@/shared/utils";
import { seedFreeCredits } from "@/backend/credits";
import { renderWelcomeEmail, sendEmail } from "@/backend/email";
import { env } from "@/shared/env";
import { SITE_NAME } from "@/shared/site";

const schema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  email: z.string().email("Invalid email"),
  password: z.string().min(8, "At least 8 characters"),
});

export type RegisterResult =
  | { ok: true }
  | { ok: false; error: string; field?: "name" | "email" | "password" };

export async function registerAction(
  _prev: RegisterResult | null,
  formData: FormData
): Promise<RegisterResult> {
  const parsed = schema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return {
      ok: false,
      error: first.message,
      field: first.path[0] as "name" | "email" | "password",
    };
  }

  const { name, email, password } = parsed.data;
  const lowered = email.toLowerCase();

  const existing = await prisma.user.findUnique({ where: { email: lowered } });
  if (existing) {
    return { ok: false, error: "An account with that email already exists.", field: "email" };
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const user = await prisma.user.create({
    data: {
      name,
      email: lowered,
      passwordHash,
    },
  });

  const baseSlug = slugify(name) || "workspace";
  let slug = baseSlug;
  let attempt = 1;
  while (await prisma.workspace.findUnique({ where: { slug } })) {
    slug = `${baseSlug}-${attempt++}`;
  }

  const workspace = await prisma.workspace.create({
    data: {
      name: `${name}'s workspace`,
      slug,
      ownerUserId: user.id,
      members: { create: { userId: user.id, role: "OWNER" } },
      subscription: { create: { plan: "FREE", status: "ACTIVE" } },
    },
  });

  await seedFreeCredits(workspace.id);

  // Fire-and-forget welcome email. Don't block signup if Resend is misconfigured.
  void sendEmail({
    to: lowered,
    subject: `Welcome to ${SITE_NAME} — 3 things to try`,
    html: renderWelcomeEmail({
      name,
      appUrl: env.NEXT_PUBLIC_APP_URL,
    }),
  }).catch((err) => {
    console.warn("[register] welcome email failed:", err);
  });

  await signIn("credentials", {
    email: lowered,
    password,
    redirect: false,
  });

  return { ok: true };
}
