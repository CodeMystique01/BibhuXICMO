import { Resend } from "resend";
import { env } from "@/shared/env";
import { SITE_NAME } from "@/shared/site";

let _resend: Resend | null = null;

function getResend() {
  if (_resend) return _resend;
  if (!env.RESEND_API_KEY) return null;
  _resend = new Resend(env.RESEND_API_KEY);
  return _resend;
}

export async function sendEmail({
  to,
  subject,
  html,
  text,
}: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}) {
  const r = getResend();
  if (!r) {
    console.warn(`[email] RESEND_API_KEY not set, would have sent to ${to}: ${subject}`);
    return { skipped: true as const };
  }
  await r.emails.send({
    from: env.EMAIL_FROM,
    to,
    subject,
    html,
    text: text ?? stripHtml(html),
  });
  return { sent: true as const };
}

function stripHtml(html: string) {
  return html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

export function renderDigestEmail({
  workspaceName,
  actionItems,
  geoScore,
  seoScore,
  appUrl,
}: {
  workspaceName: string;
  actionItems: Array<{ title: string; summary: string | null; href: string | null }>;
  geoScore: number | null;
  seoScore: number | null;
  appUrl: string;
}): string {
  const items = actionItems
    .slice(0, 5)
    .map(
      (a) =>
        `<li style="margin:12px 0"><strong style="color:#111">${escapeHtml(a.title)}</strong>${
          a.summary ? `<br><span style="color:#555">${escapeHtml(a.summary)}</span>` : ""
        }${
          a.href
            ? `<br><a href="${appUrl}${a.href.startsWith("/") ? a.href : `/${a.href}`}" style="color:#7c3aed">Open →</a>`
            : ""
        }</li>`
    )
    .join("");

  return `<!DOCTYPE html>
<html>
  <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background:#fafafa; padding:24px">
    <div style="max-width:560px; margin:0 auto; background:white; border-radius:12px; padding:32px; border:1px solid #eee">
      <h1 style="margin:0 0 8px; font-size:20px">Good morning from ${escapeHtml(SITE_NAME)}</h1>
      <p style="margin:0 0 24px; color:#555">Your daily digest for <strong>${escapeHtml(workspaceName)}</strong></p>

      <div style="display:flex; gap:16px; margin:24px 0">
        <div style="flex:1; padding:16px; background:#f5f3ff; border-radius:8px">
          <div style="font-size:11px; color:#555; text-transform:uppercase; letter-spacing:0.05em">SEO score</div>
          <div style="font-size:28px; font-weight:700">${seoScore ?? "—"}</div>
        </div>
        <div style="flex:1; padding:16px; background:#f5f3ff; border-radius:8px">
          <div style="font-size:11px; color:#555; text-transform:uppercase; letter-spacing:0.05em">GEO score</div>
          <div style="font-size:28px; font-weight:700">${geoScore ?? "—"}</div>
        </div>
      </div>

      <h2 style="margin:24px 0 12px; font-size:16px">Top action items</h2>
      ${items ? `<ul style="padding-left:18px; margin:0">${items}</ul>` : '<p style="color:#777">Nothing urgent.</p>'}

      <a href="${appUrl}/dashboard" style="display:inline-block; margin-top:24px; padding:10px 16px; background:#7c3aed; color:white; text-decoration:none; border-radius:8px; font-weight:600">Open dashboard</a>
    </div>
    <p style="text-align:center; margin-top:16px; font-size:12px; color:#999">
      ${escapeHtml(SITE_NAME)} · Your AI marketing team
    </p>
  </body>
</html>`;
}

/**
 * Welcome email — sent right after signup. Three concrete next steps so the
 * user has a path even if they leave the tab before activating.
 */
export function renderWelcomeEmail({
  name,
  appUrl,
}: {
  name: string | null;
  appUrl: string;
}): string {
  const greeting = name ? `Hi ${escapeHtml(name.split(" ")[0])},` : "Hi there,";
  return `<!DOCTYPE html>
<html>
  <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background:#fafafa; padding:24px">
    <div style="max-width:560px; margin:0 auto; background:white; border-radius:12px; padding:32px; border:1px solid #eee">
      <h1 style="margin:0 0 8px; font-size:20px">Welcome to ${escapeHtml(SITE_NAME)} 👋</h1>
      <p style="margin:0 0 24px; color:#555">${greeting} thanks for signing up. Here are three things to try next:</p>

      <div style="border-left:3px solid #7c3aed; padding:8px 16px; margin:16px 0; background:#faf7ff">
        <strong style="display:block; margin-bottom:4px">1. Run your first SEO audit</strong>
        <p style="margin:0; color:#555; font-size:14px">Live page scrape, Lighthouse scores, and rule-based fixes — done in 30 seconds.</p>
        <a href="${appUrl}/agents/seo" style="color:#7c3aed; font-size:13px; font-weight:600">Open SEO agent →</a>
      </div>

      <div style="border-left:3px solid #7c3aed; padding:8px 16px; margin:16px 0; background:#faf7ff">
        <strong style="display:block; margin-bottom:4px">2. Connect Search Console + Analytics</strong>
        <p style="margin:0; color:#555; font-size:14px">Plug in GSC + GA4 to seed your dashboard with real keyword and traffic data.</p>
        <a href="${appUrl}/integrations" style="color:#7c3aed; font-size:13px; font-weight:600">Open integrations →</a>
      </div>

      <div style="border-left:3px solid #7c3aed; padding:8px 16px; margin:16px 0; background:#faf7ff">
        <strong style="display:block; margin-bottom:4px">3. Open the AI CMO command center</strong>
        <p style="margin:0; color:#555; font-size:14px">Live agent terminal, multi-channel actions, and chat with full workspace context.</p>
        <a href="${appUrl}/agent/cmo" style="color:#7c3aed; font-size:13px; font-weight:600">Open CMO →</a>
      </div>

      <p style="margin-top:24px; color:#777; font-size:13px">
        Reply to this email anytime — I read every reply.
      </p>
    </div>
    <p style="text-align:center; margin-top:16px; font-size:12px; color:#999">
      ${escapeHtml(SITE_NAME)} · You're receiving this because you signed up at ${appUrl}
    </p>
  </body>
</html>`;
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
