# Web App Guidelines

Next.js frontend for webhook-monitor.

See [root AGENTS.md](../../AGENTS.md) for shared guidelines.

## Responsibilities

- **User interface** – Display webhook data and monitoring status
- **Client-side interactions** – Handle user input and navigation
- **Server-side rendering** – Use Next.js App Router patterns

## Next.js Patterns

- **App Router** – Use Next.js 13+ App Router (not Pages Router)
- **Server Components** – Default to Server Components where possible
- **Client Components** – Use `"use client"` directive when needed
- **Server-side data fetching** – Use Next.js data fetching patterns

## React Patterns

- **New JSX transform** – No need to `import React` in every file
- **Hooks** – Follow React Hooks rules (enforced by eslint-plugin-react-hooks)

## Constraints

- **No frontend API calls in Server Components** – Use Next.js server-side data fetching
- **No direct API imports** – Call API over HTTP, don't import from `@repo/api`
