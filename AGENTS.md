# AGENTS.md

## Cursor Cloud specific instructions

### Overview

Silo Storage is a file storage-as-a-service platform built as a pnpm monorepo (Turborepo). The main services are:

- **Next.js dashboard** (`apps/nextjs`) — main web app + tRPC API on port 3000
- **Cloudflare Worker** (`apps/cf-worker`) — file upload/download via TUS protocol (local dev via `wrangler dev` on port 8787)
- **Docker services** — PostgreSQL (5432), Redis (6379), Serverless Redis HTTP (8079), MinIO S3 (9000/9001)

### Running services

1. **Docker services:** `docker compose up -d` from repo root. Starts Postgres, Redis, SRH, MinIO, and pgAdmin.
2. **Database schema:** `pnpm db:push` pushes the Drizzle schema to Postgres. Requires `.env.local` at repo root.
3. **Next.js dev server:** `pnpm -F @silo-storage/nextjs dev` or `pnpm dev:next`. Uses `.env.local` via `dotenv-cli`.
4. **CF Worker dev:** `pnpm dev:worker` (requires `workerd` build approval — see below).

### Environment variables

Create `.env.local` at the repo root based on `.env.example`. See `.env.example` for the Docker-compose-compatible default values. Additional required variables not in `.env.example`:
- `WORKER_DOMAIN` — the worker host without protocol (e.g. `localhost:8787`)
- `CALLBACK_SECRET` — 64-char hex string (generate via `openssl rand -hex 32`)
- `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET` — can use any non-empty placeholder for local dev (email/password auth works without real GitHub OAuth)

### Lint / Typecheck / Format

- `pnpm lint` — ESLint across all packages (pre-existing lint errors exist in `validators`, `cf-worker`, `nextjs`)
- `pnpm typecheck` — TypeScript type checking across all packages (passes clean)
- `pnpm format` — Prettier format check

### Gotchas

- The `pnpm dev` script in root `package.json` calls `vercel env pull .env.local` which requires Vercel CLI auth. For local/cloud dev, run `docker compose up -d` and `pnpm dev:next` separately instead.
- The `preinstall` script runs `pnpm auto-export` (via tsx) which auto-generates package exports for packages with `"autoexport": true` in their `package.json`.
- `pnpm install` may warn about ignored build scripts for `workerd`, `sharp`, `better-sqlite3`, etc. These are controlled by `onlyBuiltDependencies` in `pnpm-workspace.yaml`.
- Docker must be installed and running before `docker compose up -d`. The environment is a nested container (Docker-in-Docker) requiring `fuse-overlayfs` storage driver and `iptables-legacy`.
- The Next.js env validation (`apps/nextjs/src/env.ts`) requires all env vars to be present at startup. It skips validation when `CI=true` or during lint.
