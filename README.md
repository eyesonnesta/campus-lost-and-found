# PataTena

**Lost. Matched. Returned.**

PataTena is a secure, responsive campus lost-and-found application for reporting items, discovering credible matches, proving ownership privately, and completing traceable handovers.

## Status

Version 1 is under active development. The repository contains the React and Supabase application foundation and the first reporting and security migration. Connected reporting workflows and later migrations are still being developed against the approved specification.

## Technology

- React, TypeScript, and Vite
- Tailwind CSS and shadcn/ui conventions
- Supabase Auth, PostgreSQL, Storage, and Edge Functions
- TanStack Query, React Hook Form, and Zod
- Vitest, React Testing Library, and Playwright

## Local setup

Requirements:

- Node.js 22.12 (the supported Version 1 runtime)
- npm 10 or newer
- A Supabase project for connected application workflows

```bash
git clone https://github.com/eyesonnesta/campus-lost-and-found.git
cd campus-lost-and-found
npm ci
copy .env.example .env.local
npm run dev
```

On macOS or Linux, use `cp .env.example .env.local` instead of `copy`.

Set the public Supabase project URL and anonymous key in `.env.local`. Never expose a service-role key in browser environment variables.

## Quality checks

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
```

Playwright requires its browser binary once per machine:

```bash
npx playwright install chromium
```

## Project structure

```text
src/
  components/       Reusable interface components
  lib/              Supabase client and shared utilities
  test/             Test environment setup
e2e/                Browser-level workflow tests
```

Database changes live in versioned Supabase migrations; see `supabase/README.md` for the current scope and setup. Client code must use sanitized views and Row-Level Security policies; service-role credentials must never be shipped to the browser.

## Security and privacy

PataTena is designed so that private ownership identifiers, claim answers, evidence, and personal contact details are not exposed in public listings. Security concerns should be reported privately to the repository owner rather than opened as a public issue.

## Licence

PataTena is available under the [MIT License](LICENSE).
