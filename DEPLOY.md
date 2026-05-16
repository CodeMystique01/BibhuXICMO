# Deployment checklist (Vercel / production)

You add values in the Vercel dashboard (or your host’s env UI). This file lists what the app expects—no secrets here.

## Required for core product

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string (use a pooled URL on serverless, e.g. Neon). |
| `AUTH_SECRET` | Random string for Auth.js session signing (`openssl rand -base64 32`). |
| `NEXT_PUBLIC_APP_URL` | Public site URL, e.g. `https://your-app.vercel.app` (optional on Vercel if `VERCEL_URL` is set; the app derives URLs when unset). |

After setting `DATABASE_URL`, apply the schema:

```bash
npx prisma db push
# or, if you use migrations:
npx prisma migrate deploy
```

## Email & password reset

| Variable | Purpose |
|----------|---------|
| `RESEND_API_KEY` | Sends password-reset emails via Resend. |
| `EMAIL_FROM` | From address (must be allowed in Resend). |

Password reset rows use the existing **`VerificationToken`** table (`identifier` prefix `pwdreset:`), so no extra migration table is required beyond your normal Auth.js schema.

Without `RESEND_API_KEY`, reset tokens are still created, but no email is sent. In **development** only, the reset URL is printed to the server console.

## Optional: Google / GitHub sign-in

| Variable | Purpose |
|----------|---------|
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | OAuth “Continue with Google”. Redirect URI: `{APP_URL}/api/auth/callback/google` |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | OAuth “Continue with GitHub”. Redirect: `{APP_URL}/api/auth/callback/github` |

## Stripe (checkout vs webhook)

| Variable | Purpose |
|----------|---------|
| `STRIPE_SECRET_KEY` | Stripe API secret. |
| `STRIPE_PRICE_MAX_MONTHLY` | Price ID for the Max subscription. |
| `STRIPE_WEBHOOK_SECRET` | Verifies `/api/stripe/webhook` events. |

- **Checkout / portal** work when `STRIPE_SECRET_KEY` and `STRIPE_PRICE_MAX_MONTHLY` are set.
- **Automatic subscription sync** after payment needs `STRIPE_WEBHOOK_SECRET` and a webhook endpoint in Stripe pointing to `{APP_URL}/api/stripe/webhook`.

## Optional: Redis

| Variable | Purpose |
|----------|---------|
| `REDIS_URL` | If set, API rate limiting (e.g. chat) uses Redis instead of in-memory only—recommended on multi-instance serverless. |

## Optional: LLM providers

Set at least one of: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, etc. (see `.env.example`) for agents and chat.

## Optional: observability

| Variable | Purpose |
|----------|---------|
| `SENTRY_DSN` | Wire Sentry when you add `@sentry/nextjs` and project config (not bundled in this repo by default). |

## Background worker

`npm run worker` (BullMQ) is a **long-lived process** and does not run inside Vercel’s serverless runtime. Run workers on a VM, Railway, Fly.io, etc., with the same `DATABASE_URL` and `REDIS_URL` as production.
