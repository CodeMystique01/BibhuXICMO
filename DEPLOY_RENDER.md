# XIcmo deploy on Render — easy guide (Hindi + English)

This walks you through deploying XIcmo to [Render](https://render.com) with
a single Blueprint click. Total time: ~15 minutes, mostly waiting for the
first build.

## What you'll end up with

- **Web service** — `https://xicmo-web-xxxx.onrender.com` (free Next.js host)
- **PostgreSQL** — managed by Render, free for 90 days
- **Redis** — Render Key Value, free
- **Auto-deploys** — every push to `main` (or any branch you pick) rebuilds

---

## Prerequisites

1. **A Render account** — free at <https://dashboard.render.com>. Sign in with GitHub.
2. **This repo on GitHub** — already there at `nayakqche/BibhuXICMO`.
3. **API keys you want to use** (collect these first so you can paste at deploy time):

| Key | Where to get | Required? |
|---|---|---|
| `ANTHROPIC_API_KEY` | <https://console.anthropic.com/settings/keys> | yes (for AI chat + social-handle auto-detect) |
| `APIFY_TOKEN` | <https://console.apify.com/settings/integrations> | yes (for Ahrefs panel) |
| `PAGESPEED_API_KEY` | <https://developers.google.com/speed/docs/insights/v5/get-started> | optional (free Lighthouse on `/tools/site-audit`) |
| `OPENAI_API_KEY` | <https://platform.openai.com/api-keys> | optional (fallback LLM) |
| `RESEND_API_KEY` | <https://resend.com/api-keys> | optional (password-reset emails) |
| `GOOGLE_CLIENT_ID` / `_SECRET` | <https://console.cloud.google.com/apis/credentials> | optional ("Continue with Google" button) |
| `GITHUB_CLIENT_ID` / `_SECRET` | <https://github.com/settings/developers> | optional ("Continue with GitHub" button) |
| `STRIPE_SECRET_KEY` + 3 others | <https://dashboard.stripe.com/apikeys> | optional (paid plans) |

For your first deploy you really only need **`ANTHROPIC_API_KEY`** and
**`APIFY_TOKEN`**. Everything else can be added later.

---

## Step-by-step deploy (Blueprint method, recommended)

### 1. Open the Blueprint wizard

- Sign in: <https://dashboard.render.com>
- Top-right purple button: **"New +"** → **"Blueprint"**

### 2. Connect your GitHub

- If first time: click **"Connect GitHub"** → authorize Render → pick **"All repositories"** or just **`BibhuXICMO`**.
- You'll see a list — pick **`nayakqche/BibhuXICMO`**.
- Branch: **`main`** (or `cursor/import-xicmo-source-2224` if PR #1 isn't merged yet).
- Click **"Continue"**.

### 3. Confirm services

- Render reads `render.yaml` from the repo and shows what it will create:
  - **xicmo-db** (PostgreSQL)
  - **xicmo-redis** (Key Value)
  - **xicmo-web** (Web Service)
- Service group name: anything you want (e.g. `xicmo-prod`).
- Click **"Apply"**.

Render now creates all three. **Don't close the tab.**

### 4. Wait for the first build (~5–10 min)

- Click **xicmo-web** → **"Logs"** tab — you'll see `npm install` + `next build` running.
- The first build will **succeed** but the app will fail to fully boot until you fill in the missing env vars (next step).
- That's fine — go to the next step in parallel.

### 5. Fill in the API keys

- Open **xicmo-web** → **"Environment"** tab (left sidebar).
- For each key below, click **"Edit"** next to it and paste the value.
- Click **"Save Changes"** at the bottom — Render will redeploy automatically.

**Always set these first (3 keys):**

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_APP_URL` | Your Render URL, e.g. `https://xicmo-web-abcd.onrender.com` (copy from top of the service page) |
| `APP_URL` | Same as above |
| `AUTH_URL` | Same as above |

**Then add the AI + Apify keys:**

| Variable | Value |
|---|---|
| `ANTHROPIC_API_KEY` | `sk-ant-api03-...` (from console.anthropic.com) |
| `APIFY_TOKEN` | `apify_api_...` (from console.apify.com) |

**Optional (add later as needed):**

| Variable | Value |
|---|---|
| `PAGESPEED_API_KEY` | `AIza...` (Google Cloud Console) — enables Lighthouse on `/tools/site-audit` |
| `OPENAI_API_KEY` | `sk-...` — used as fallback LLM |
| `RESEND_API_KEY` | `re_...` — needed for password-reset emails |
| `EMAIL_FROM` | `YourBrand <hello@yourdomain.com>` — must be a verified Resend sender |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | OAuth credentials, redirect URI: `{APP_URL}/api/auth/callback/google` |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | OAuth credentials, redirect URI: `{APP_URL}/api/auth/callback/github` |
| `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` + `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` + `STRIPE_PRICE_MAX_MONTHLY` | Stripe live or test keys |

### 6. Watch the redeploy

- After "Save Changes", **xicmo-web** automatically rebuilds.
- Logs should show `✓ Ready in ...` near the end.
- The pre-deploy step `npx prisma db push` will create all tables in your Postgres.

### 7. Open your live site

- Top of the **xicmo-web** page: click the URL (e.g. `https://xicmo-web-abcd.onrender.com`).
- Sign up at `/register`, then go to:
  - **`/settings`** → set website URL → click **"✨ Auto-detect"** to confirm Anthropic works.
  - **`/agents/seo`** → click **"Fetch data"** to confirm Apify Ahrefs works.

You're live.

---

## Manual deploy (if you don't want the Blueprint)

If you'd rather create things yourself:

### 1. Create the database

- Render → **New +** → **PostgreSQL**
- Name: `xicmo-db`, plan: Free, region: closest to you
- Click **Create Database** → wait for "Available" status
- Copy the **Internal Database URL** (you'll paste it into env vars later)

### 2. Create Redis

- Render → **New +** → **Key Value**
- Name: `xicmo-redis`, plan: Free, IP allowlist: empty (private)
- Copy the **Internal Connection URL**

### 3. Create the web service

- Render → **New +** → **Web Service**
- Connect your `BibhuXICMO` repo, branch `main`
- Runtime: **Node**
- Build Command: `npm install && npm run build`
- Start Command: `npm start`
- Pre-Deploy Command: `npx prisma db push --skip-generate`
- Health Check Path: `/api/health`
- Plan: Free
- Add Environment Variables: paste **all** the keys from step 5 above, including `DATABASE_URL` and `REDIS_URL` from steps 1–2.
- Click **Create Web Service**.

---

## Common issues

### ❌ "Module not found: @prisma/client"

The build skipped `prisma generate`. Make sure `buildCommand` is `npm install && npm run build` (the `build` script in `package.json` runs `prisma generate && next build`).

### ❌ Auth pages loop / "AUTH_URL invalid"

You forgot to set `AUTH_URL` to your real `*.onrender.com` URL after the first deploy. Set it, save, redeploy.

### ❌ "Cannot connect to database"

Inside Render the `DATABASE_URL` is automatically wired by the Blueprint. If you set it manually, use the **Internal** URL (`...-internal.render.com:5432/...`), not the external one — internal is free and faster.

### ❌ Free tier "spinning down"

Render's free web tier sleeps after 15 minutes of inactivity. First request after sleep takes ~30 seconds (cold start). Upgrade to **Starter ($7/mo)** to keep the service warm.

### ❌ Free Postgres expires after 90 days

You'll get an email warning. Upgrade to Starter ($7/mo) or migrate to [Neon](https://neon.tech) (free forever for hobby projects) and just update `DATABASE_URL`.

### ❌ Ahrefs panel shows "Apify actor returned no items"

Either your Apify account has $0 credit (top up at <https://console.apify.com/billing>), or the domain you queried isn't in Ahrefs' index (try a well-known one like `vercel.com` to confirm wiring).

---

## Adding the background worker (later)

The app ships with a BullMQ worker (`workers/index.ts`) that processes
scheduled posts, audits, etc. To run it on Render:

- Render → **New +** → **Background Worker**
- Same repo, branch `main`
- Build Command: `npm install`
- Start Command: `npm run worker`
- Add **the same env vars** as the web service (Render lets you copy from another service in the env editor).

---

## Adding cron jobs (later)

The app has 2 cron endpoints: `/api/cron/daily` and `/api/cron/digest`. To run them on Render:

- Render → **New +** → **Cron Job**
- Schedule (UTC):
  - Daily: `0 6 * * *`
  - Digest: `0 7 * * *`
- Command:
  ```
  curl -sS -X POST -H "Authorization: Bearer $CRON_SECRET" $APP_URL/api/cron/daily
  ```
- Add env vars: `APP_URL` (your onrender URL) + `CRON_SECRET` (copy from web service)

That's it. Push to GitHub → auto-deploys to Render → done.
