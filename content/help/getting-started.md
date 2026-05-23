---
title: Getting started with Xicmo
date: 2026-05-01
description: Onboard in under 5 minutes.
---

# Getting started

Xicmo is designed to do useful work within minutes of sign-up. Here's how to get the most out of your first session.

## 1. Add your website

After you sign up, you'll land on the onboarding wizard. Paste your website URL. We'll crawl it, read your copy, and generate a **strategy document** — industry, ICP, voice, positioning — that every agent uses as its source of truth.

## 2. Connect your channels

The Integrations page lets you connect Reddit, X, LinkedIn, Google Search Console, and GA4. The **Hacker News agent** needs no API key — it searches via Algolia and drafts Show HN, Ask HN, and comments for you to submit manually on news.ycombinator.com.

The **X / Twitter agent** posts via the free X OAuth tier (no paid X API needed). For tweet *discovery* (scanning buying-intent conversations to reply to), it uses Apify — set `APIFY_TOKEN` in your environment to enable it. Daily post drafts work without Apify.

### Instagram — two paths in one agent

The **Instagram agent** ships with two distinct capabilities you can mix and match:

- **Path A — Content & engagement (ToS-safe)**. Connect an Instagram Business or Creator account via the Facebook Login button on the Integrations page (set `FACEBOOK_CLIENT_ID` / `FACEBOOK_CLIENT_SECRET`). The agent uses the official Graph API to fetch comments on your own posts, draft replies in your voice, and publish daily Post / Reel / Story drafts directly once you attach a `mediaUrl`. Without Facebook OAuth the agent still drafts captions; you publish manually.
- **Path B — Influencer outreach & negotiation (opt-in)**. Apify discovers creators in your niche, the LLM ranks them for brand fit, and the agent drafts cold first-DMs. For the actual sending, the agent uses an Apify DM-automation actor that signs into Instagram with session cookies you add in `/agents/instagram` (behind an explicit ToS warning). Once a creator replies, the negotiation autopilot drafts counter-offers within your budget; anything above a 10% headroom escalates to you for approval. Set `APIFY_TOKEN` (or the dedicated `APIFY_IG_TOKEN`) to enable. **Bulk DM automation may violate Instagram's ToS — use a dedicated account, not your personal one.** A hard daily cap of 20 first-DMs per workspace protects against accidents.

## 3. Review your first Action Items

Within a few minutes you'll see action items in the dashboard: keyword opportunities, Reddit threads with drafted replies, on-page SEO fixes, and a first blog post draft. Review, edit, and approve.

## 4. Set your auto-publish preferences

By default nothing is posted automatically. If you trust a channel, flip auto-publish on in that agent's Settings tab and the approval queue becomes just a notification feed.
