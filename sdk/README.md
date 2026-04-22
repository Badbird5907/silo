# SDK workspace

This directory contains the publishable SDK packages:

- `@silo-storage/sdk-core`: low-level upload/register and callback primitives
- `@silo-storage/sdk-server`: framework-agnostic router runtime
- `@silo-storage/sdk-next`: Next.js route-handler adapter
- `@silo-storage/sdk-tanstack-start`: TanStack Start server-route adapter
- `@silo-storage/sdk-react`: factory-first React hook + headless components

## Build and typecheck

From repository root:

```powershell
pnpm sdk:build
pnpm sdk:typecheck
```
