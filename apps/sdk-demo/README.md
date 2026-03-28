# Next.js SDK Example

This example is wired to use the Silo Next.js SDK stack:

- `@silo-storage/sdk-core`
- `@silo-storage/sdk-server`
- `@silo-storage/sdk-next`
- `@silo-storage/sdk-react`

## Getting Started

### 1) Configure environment variables

Add these to `examples/nextjs/.env.local`:

```bash
SILO_URL=
SILO_TOKEN=
```

The upload route reads these values in `app/api/upload/route.ts`.
`SILO_TOKEN` is base64url JSON with compact keys: `v`, `ak`, `eid`, `is`, `ss`.

### 2) Build SDK packages

From repo root:

```bash
pnpm sdk:build
```

### 3) Install dependencies and run the example

From repo root:

```bash
pnpm install
pnpm --filter nextjs dev
```

Open [http://localhost:5714](http://localhost:5714), sign in with Clerk, then upload an image from the home page.
You can also open [http://localhost:5714/tus](http://localhost:5714/tus) for a manual tus upload demo with pause/resume/cancel controls.

## What Was Added

- Typed file router in `app/api/upload/core.ts`
- Next.js route handler in `app/api/upload/route.ts`
- Typed React helper in `lib/upload.ts`
- UI demo component in `components/upload-demo.tsx`
