import "dotenv/config";
import bcrypt from "bcryptjs";
import { prisma } from "@/backend/db";
import { seedFreeCredits } from "@/backend/credits";
import { slugify } from "@/shared/utils";

async function main() {
  console.log("Seeding demo data…");

  const email = "demo@example.com";
  const password = "demo12345";

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`User ${email} already exists, skipping.`);
    return;
  }

  const user = await prisma.user.create({
    data: {
      email,
      name: "Demo User",
      passwordHash: await bcrypt.hash(password, 12),
    },
  });

  const workspace = await prisma.workspace.create({
    data: {
      name: "Demo Workspace",
      slug: slugify("demo-workspace"),
      websiteUrl: "https://example.com",
      industry: "SaaS",
      icp: "Solo founders building dev tools",
      ownerUserId: user.id,
      members: { create: { userId: user.id, role: "OWNER" } },
      subscription: { create: { plan: "FREE", status: "ACTIVE" } },
      voiceProfile: {
        tone: "Confident, direct, helpful",
        styleGuidelines: ["Lead with value", "Cite specifics", "Avoid jargon"],
        avoid: ["Hype", "Vague claims"],
        positioning: "The only growth stack a solo founder needs.",
        valueProps: ["Saves $14k/mo", "Every channel one command", "You stay in control"],
        topicClusters: [
          { theme: "AI marketing", keywords: ["ai cmo", "ai marketing", "marketing automation"] },
          { theme: "GEO", keywords: ["generative engine optimization", "chatgpt seo"] },
        ],
      },
    },
  });

  await seedFreeCredits(workspace.id);

  await prisma.actionItem.createMany({
    data: [
      {
        workspaceId: workspace.id,
        agent: "onboarding",
        type: "onboarding.next_step",
        title: "Connect Google Search Console",
        summary: "Unlock keyword and ranking data for the SEO agent.",
        priority: "HIGH",
        cta: "Connect",
        href: "/integrations",
      },
      {
        workspaceId: workspace.id,
        agent: "onboarding",
        type: "onboarding.next_step",
        title: "Run first SEO audit",
        summary: "Produce your initial site audit and first action items.",
        priority: "HIGH",
        cta: "Run audit",
        href: "/agents/seo",
      },
      {
        workspaceId: workspace.id,
        agent: "onboarding",
        type: "onboarding.next_step",
        title: "Draft your first blog post",
        summary: "Let the Content Writer produce a pillar article.",
        priority: "MEDIUM",
        cta: "Write",
        href: "/agents/content",
      },
    ],
  });

  console.log(`\nDone!\n  Email:    ${email}\n  Password: ${password}\n`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
