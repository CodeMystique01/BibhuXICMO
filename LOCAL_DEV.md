# Running XIcmo locally

This guide gets a fully working XIcmo site running on your own laptop at
`http://localhost:3000`.

## Prerequisites

Install these once:

- [Node.js 20+](https://nodejs.org) (Node 22 LTS recommended) — includes `npm`
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (for local
  Postgres + Redis) — alternatively install Postgres 16 and Redis 7 yourself
- `git`

## Quick start (one command)

```bash
git clone https://github.com/nayakqche/BibhuXICMO.git
cd BibhuXICMO
bash scripts/dev-local.sh
```

The script will:

1. Start Postgres + Redis via `docker compose` (the `docker-compose.yml` shipped
   in the repo).
2. Create a `.env` from `.env.example` with a freshly generated `AUTH_SECRET`.
3. Install npm dependencies.
4. Generate the Prisma client and push the schema into the local Postgres.
5. Start the Next.js dev server.

When you see `✓ Ready in …`, open <http://localhost:3000> in your browser.

## Manual setup (if you'd rather run each step)

```bash
git clone https://github.com/nayakqche/BibhuXICMO.git
cd BibhuXICMO

# 1. Postgres + Redis
docker compose up -d postgres redis

# 2. Environment
cp .env.example .env
# Replace AUTH_SECRET with a long random string, e.g.:
#   openssl rand -base64 32

# 3. Dependencies
npm install

# 4. Database schema
npx prisma generate
npx prisma db push

# 5. Dev server
npm run dev
```

## What works out of the box

- Marketing pages: `/`, `/pricing`
- Email/password sign-up + sign-in: `/register`, `/login`
- Authenticated agent dashboards: `/agent`, `/agent/cmo` (after you sign up)
- Health check: `/api/health`

## What needs extra API keys

These features stay disabled until you add the matching keys to `.env`:

| Feature                                  | Keys                                                           |
| ---------------------------------------- | -------------------------------------------------------------- |
| "Continue with Google" / GitHub buttons  | `GOOGLE_CLIENT_ID/SECRET`, `GITHUB_CLIENT_ID/SECRET`           |
| AI chat & content generation             | any of `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_GEMINI_API_KEY`, `OPENROUTER_API_KEY`, `DEEPSEEK_API_KEY`, `MISTRAL_API_KEY`, `PERPLEXITY_API_KEY`, `GROQ_API_KEY` |
| Stripe checkout / billing                | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_PRICE_MAX_MONTHLY` |
| Transactional email                      | `RESEND_API_KEY`, `EMAIL_FROM`                                 |
| Reddit / X / LinkedIn channels           | `REDDIT_*`, `X_*`, `LINKEDIN_*`                                |
| Search Console & PageSpeed audits        | `GSC_CLIENT_ID/SECRET`, `PAGESPEED_API_KEY`                    |
| Object storage (uploads)                 | `S3_*`                                                         |
| Error tracking                           | `SENTRY_DSN`                                                   |

After editing `.env`, restart the dev server (`Ctrl+C` then `npm run dev`).

## Common commands

```bash
npm run dev           # Next.js dev server (hot reload)
npm run build         # Production build (runs `prisma generate` first)
npm run start         # Serve the production build
npm run lint          # ESLint
npm run typecheck     # tsc --noEmit
npm test              # Vitest unit tests
npm run e2e           # Playwright end-to-end tests
npm run prisma:studio # Browse the local database in your browser
npm run worker        # Background job worker (BullMQ)
```

## Tearing it down

```bash
docker compose down            # stop Postgres + Redis (keeps data)
docker compose down -v         # ...and delete the data volumes
```

## Troubleshooting

- **`ERR_CONNECTION_REFUSED` on `localhost:3000`** — the dev server isn't
  running. Re-run `npm run dev` and watch for the `Ready in …` line.
- **`P1001: Can't reach database server`** — Postgres isn't up. Run
  `docker compose up -d postgres` and wait a few seconds.
- **OAuth buttons missing on `/login`** — that's intentional; they appear only
  when the matching client ID/secret pair is set in `.env`.
- **AI chat says "no provider configured"** — add at least one LLM API key in
  `.env` and restart the dev server.
