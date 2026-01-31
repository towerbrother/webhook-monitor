# webhook-monitor

A minimal Turborepo monorepo for backend-focused learning.

## Structure

```
apps/           # Application packages (add your apps here)
packages/       # Shared packages
  eslint-config/   # Shared ESLint configuration
  typescript-config/  # Shared TypeScript configurations
```

## Scripts

```bash
pnpm install    # Install dependencies
pnpm dev        # Run all apps in dev mode
pnpm build      # Build all apps
pnpm lint       # Lint all packages
```

## What was removed

This repo was scaffolded from `create-turbo` and cleaned up:

- **apps/web, apps/docs**: Example Next.js apps (boilerplate)
- **packages/ui**: Unused React component library
- **prettier**: Removed from root (add per-package if needed)
- **volta config**: Removed (use your preferred version manager)
- **"ui" option in turbo.json**: Removed (default is fine)
- **Format script**: Removed (add when needed)

## Turborepo

Pipelines defined in `turbo.json`:

- `dev` – persistent, not cached
- `build` – outputs to `dist/`
- `lint` – no dependencies
- `typecheck` – no dependencies
