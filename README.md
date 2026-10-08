# HR2-AI-44A0D3F7

HACKERING 2.0 Round 2 project for Team CodebaLe (Agentic AI Track).

# LocalMind

Multi-agent marketing app: describe a promotion in plain language (or by voice), and LocalMind plans a
campaign, writes platform-native content in the languages you choose, checks every number against your
locked offer facts, predicts performance, and — only after you approve — publishes to Instagram,
Facebook, WhatsApp and LinkedIn.

## Quick start (demo mode, no API keys)

```bash
cd backend
python -m venv .venv && .venv/Scripts/python -m pip install -r requirements.txt   # Windows
cp ../.env.example .env          # then set DEMO_MODE=true and a JWT_SECRET
.venv/Scripts/python -m uvicorn app.main:app --port 8000

cd ../frontend && npm install && npm run dev     # http://localhost:5173
```

`DEMO_MODE=true` swaps the model providers for a deterministic offline stand-in, so the whole pipeline
(strategy, copy, localization, truth check, images, video scripts) runs without Agnes. Publishing works
through **simulated accounts** (Accounts page → "Add simulated …"); every simulated post is labelled as
such in the UI and in analytics.

SQLite is the default database and needs no setup. For Postgres, set `DATABASE_URL` and run
`alembic upgrade head` (the Docker backend does this on start).

## Docker (Postgres + Redis worker + MinIO)

```bash
cp .env.example .env    # fill in keys
docker compose up --build
```

## Configuration

See `.env.example`. The important groups:

| Group | What |
|---|---|
| `AGNES_*` | Primary model provider (OpenAI-compatible). `OPENAI_*` / `GEMINI_*` are fallbacks tried in the order of `TEXT_PROVIDERS`, `IMAGE_PROVIDERS`, `VIDEO_PROVIDERS`. |
| `LOCALITY_PROVIDER` | `osm` (Nominatim + Overpass, no key) or `google` (`GOOGLE_PLACES_API_KEY`). |
| `STT_*` / `BHASHINI_*` | Voice input. `STT_PROVIDER=openai` (Whisper-compatible) or `bhashini`. |
| `META_*`, `WHATSAPP_*`, `LINKEDIN_*` | OAuth apps for real publishing. |
| `TOKEN_ENCRYPTION_KEY` | Fernet key; OAuth tokens are encrypted at rest. |
| `USE_WORKER` | `true` runs jobs on the arq/Redis worker; otherwise they run in-process. |

## How a campaign works

1. **Create** — type or record a message ("Mode A" lets the AI choose formats, "Mode B" you pick them),
   plus the languages you want.
2. **Plan** — Campaign Manager extracts the offer facts, Business Agent profiles the brand, Locality
   Agent grounds the campaign in real nearby places, Audience and Strategy agents propose a plan.
3. **Review the strategy** — edit platforms, formats, languages and tone, then accept.
4. **Produce** — core message → content director briefs → per-platform variants (A/B/C) → localization
   with back-translation → Truth Engine → performance prediction → optimization → images and video.
5. **Truth Engine** — deterministic checks (discount, price, dates, times, claims, format limits) plus an
   LLM pass. Failures are regenerated with the feedback, up to 3 times, then escalated to you. Approval
   is blocked while any selected asset is unverified.
6. **Change a fact** — editing e.g. the discount creates a new campaign version and regenerates only the
   assets that depend on it.
7. **Approve, then publish** — immediately or scheduled. WhatsApp goes out as an approved MARKETING
   template to opted-in contacts only; offer cards become the template's header image.
8. **Analytics** — actual platform metrics (kept separate from the AI predictions) are pulled back and
   turned into learnings that feed the next campaign.

Progress streams live over SSE (`/api/campaigns/{id}/stream`).

## Tests

```bash
cd backend && .venv/Scripts/python -m pytest -q
```

Includes the end-to-end Bengaluru café demo (Kannada + English, Instagram + WhatsApp, a 20% → 25%
discount change, approval gating, simulated publishing and analytics), publishing flows against the real
Graph API shapes, and prompt snapshots. Regenerate prompt snapshots with
`UPDATE_SNAPSHOTS=1 pytest tests/test_prompts.py`.

## Layout

```
backend/app
  agents/        one module per agent (campaign manager, locality, platform, truth, ...)
  graph/         Campaign Brain schema + LangGraph plan/produce pipelines
  prompts/       vendored agency-agents personas, manifest, per-agent contracts
  integrations/  instagram, facebook, whatsapp, linkedin, mock publishing adapters
  services/      model gateway, locality, media storage, publishing, analytics, speech, oauth
  workers/       arq tasks: plan, produce, video polling, publishing, analytics, token refresh
frontend/src     React + Vite + Tailwind: dashboard, campaign studio, accounts
```
