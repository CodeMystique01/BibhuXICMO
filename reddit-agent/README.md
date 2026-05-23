# Reddit Sales Agent — Python backend for XIcmo

FastAPI service that powers the `/agents/reddit-sales` page in the main
XIcmo Next.js app. Deployed as a **separate Render web service**
(`reddit-agent`) so a hanging Reddit scrape never takes the main app
with it.

The Next.js frontend reads `NEXT_PUBLIC_REDDIT_AGENT_URL` and POSTs to
`/api/analyze`, `/api/threads/stream`, and `/api/posts` on this
service.

## Required env vars (Render Dashboard → `reddit-agent` → Environment)

| Key | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | LLM for business-profile + subreddit + reply / post drafts |
| `APIFY_TOKEN_REDDIT` | Apify token for the `trudax/reddit-scraper-lite` actor that fetches live threads |
| `PYTHON_VERSION` | `3.11.9` (Render hint) |
| `ANTHROPIC_MODEL` | Default `claude-sonnet-4-6` |
| `APIFY_ACTOR_ID` | Default `trudax~reddit-scraper-lite` |

Optional:
- `OPENAI_API_KEY` — fallback LLM.
- `REDDIT_CLIENT_ID` / `REDDIT_CLIENT_SECRET` — switch from Apify to direct PRAW.

## Local dev

```bash
cd reddit-agent/backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
ANTHROPIC_API_KEY=... APIFY_TOKEN_REDDIT=... python -m uvicorn main:app --reload --port 8000
```

Then in `/.env` of the Next.js app:
```
NEXT_PUBLIC_REDDIT_AGENT_URL=http://localhost:8000
```

## Health check

`GET /api/health` returns LLM + Reddit-backend status plus which keys
are configured. The XIcmo dashboard page renders these as small
pills under the URL input.
