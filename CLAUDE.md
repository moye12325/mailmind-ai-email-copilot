# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MailMind is a local-first, multi-mailbox AI email copilot for Gmail and IMAP. It syncs email, runs it through an LLM pipeline, and produces a structured Daily Digest with prioritized items and suggested actions.

- **License:** Apache-2.0
- **Python:** >=3.11 (managed via `uv`)
- **Node.js:** compatible with Next.js 15

## Development Commands

### Infrastructure

```bash
docker compose -f docker/docker-compose.yml up -d postgres redis
```

### Backend (from `backend/`)

```bash
uv sync                                    # install dependencies
uv run alembic upgrade head                # run migrations
uv run uvicorn app.main:app --reload --host 127.0.0.1 --port 8000  # dev server
uv run celery -A app.jobs.celery_app worker --loglevel=info --pool=solo  # worker (Windows requires --pool=solo)
uv run pytest                              # run all tests
uv run pytest tests/test_health.py         # run single test file
uv run pytest tests/test_health.py::test_fn # run single test
uv run python -m compileall app tests      # syntax check
```

### Frontend (from `frontend/`)

```bash
npm install
npm run dev        # dev server on port 3000
npm run build      # production build
npm run typecheck  # tsc --noEmit
npm run lint       # eslint .
```

### Desktop (from `desktop/`)

```bash
npm install
npm run dev        # build + launch Electron
npm run typecheck  # tsc --noEmit
npm run build      # compile TypeScript
npm run pack       # unpacked app (local testing)
npm run dist       # installer (requires proxy for GitHub downloads in China: HTTPS_PROXY=http://127.0.0.1:7897)
```

### PowerShell Scripts (from `scripts/`)

```powershell
.\scripts\dev-all.ps1       # launch backend + worker + frontend
.\scripts\dev-backend.ps1   # backend only
.\scripts\dev-frontend.ps1  # frontend only
.\scripts\dev-worker.ps1    # celery worker only
```

## Architecture

Monorepo with three independent applications:

```
backend/    Python FastAPI API server
frontend/   Next.js 15 App Router
desktop/    Electron shell (loads frontend URL, no embedded services)
docker/     PostgreSQL 15 + Redis 7 (infrastructure only)
```

### Backend Layered Architecture

```
API Routers (api/) → Services (services/) → Database Models (db/models/) + Providers (providers/)
                   ↘ Schemas (schemas/) for request/response validation
```

- **8 API routers:** auth, gmail_auth, imap_auth, mailboxes, emails, digests, actions, jobs
- **14 services** handle business logic; services are stateless, receive `Session` via dependency injection
- **11 SQLAlchemy models** in `db/models/`; all use UUID primary keys
- **Provider abstraction:** `MailboxProvider` Protocol in `providers/base.py` with Gmail, IMAP, Outlook implementations
- **AI pipeline:** `ai/` contains LLM provider protocol, mock provider, OpenAI-compatible provider, prompt builder, and output parser
- **Background jobs:** Celery with Redis broker; tasks in `jobs/tasks.py`; supports eager mode (`BACKGROUND_JOBS_EAGER=true`) for testing without Redis
- **Config:** `core/config.py` uses pydantic-settings; reads `backend/.env` then `backend/.env.local`; secret fields use `SecretStr`; `get_settings()` is `@lru_cache`d

### API Response Envelope

All API responses follow one of two envelopes:

```json
{ "data": { ... }, "meta": { ... } }   // success
{ "error": { "code": "...", "message": "...", "retryable": false, "details": null } }  // error
```

### Frontend Architecture

- **Next.js App Router** with dashboard-first design (Daily Digest is the home page)
- **Provider hierarchy** in `layout.tsx`: ThemeProvider > MailMindI18nProvider > AuthProvider
- **API client** (`lib/api-client.ts`): typed fetch with `credentials: "include"` (HttpOnly cookie auth); organized by domain namespace (auth, digest, emails, mailboxes, jobs, actions)
- **Theme system:** 6 presets (neon-cyber, glass-aurora, gradient-flow, soft-clay, noir-pulse, dense-minimal) × 2 modes (light/dark); CSS custom properties; pre-hydration inline script prevents FOUC
- **i18n:** i18next with `locales/en.json` and `locales/zh.json`
- **No external UI library** — plain CSS design tokens in `styles/globals.css`, no Tailwind or shadcn
- **State management:** React Context (auth, theme, i18n) + component-local useState; no Redux/Zustand

### Database

- **PostgreSQL 15** with SQLAlchemy 2 ORM and Alembic migrations
- **11 tables:** users, auth_accounts, sessions, mailboxes, mailbox_credentials, emails, daily_digests, digest_items, ai_runs, sync_jobs, user_actions
- Alembic migrations in `backend/alembic/versions/`; run with `uv run alembic upgrade head`

### Desktop Shell

Electron wrapper that loads the running web UI (default `http://127.0.0.1:3000`). Does **not** embed backend, database, or Redis. Health-checks the API before loading; shows fallback page if services are down.

## Environment Configuration

Copy `.env.example` to `.env` (root) and `backend/.env.example` to `backend/.env`. Key variables:

| Variable | Purpose |
|---|---|
| `APP_SECRET_KEY` | Session signing |
| `APP_ENCRYPTION_KEY` | Encrypts stored OAuth/IMAP credentials (Fernet) |
| `DATABASE_URL` | PostgreSQL connection |
| `REDIS_URL` | Redis for Celery |
| `GOOGLE_CLIENT_ID/SECRET` | Gmail OAuth |
| `AI_PROVIDER_MODE` | `env` for real LLM; empty for mock fallback |
| `BACKGROUND_JOBS_EAGER` | `true` to run tasks in-process (no Redis needed) |

**Never commit `.env` or `.env.local` files.** Only `.env.example` is tracked.

## Conventions

- Backend uses `uv` (not pip) for Python dependency management
- Frontend uses npm; `package-lock.json` is gitignored except in `desktop/`
- All API endpoints return the `{ data, meta }` / `{ error }` envelope
- Errors are redacted before storage/API response — tokens, keys, and raw prompts never leak
- LLM prompts have sensitive data redacted via `utils/redaction.py` before sending to providers
- Session tokens are SHA-256 hashed before storage; OAuth refresh tokens are Fernet-encrypted at rest
- Windows: Celery requires `--pool=solo` (no fork support)
- Tests use `fastapi.testclient.TestClient` for API tests and `monkeypatch` for config tests
- i18n keys are in `frontend/src/i18n/locales/en.json` and `zh.json`; use `useI18n()` hook in components
