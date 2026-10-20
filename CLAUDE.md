# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

AGENTS.md (imported above) holds the repo's rules: no Supabase or database, the
read-only API, the `wrangler.jsonc` custom-domain form, the registry pin bot,
the changelog rule and rebase-only merges. This file adds only what it leaves
out. README.md has the full route list, the data pipeline and the cutover
history.

## Commands

```bash
npm ci
npm run build:data          # required first: clones the pinned registry, writes src/data/*.json
npm run typecheck           # tsc --noEmit over src/ and test/
npm run check               # vp check: oxfmt + oxlint + type-aware lint/type check
npm run lint                # vp lint only
npm run fmt                 # vp fmt: fix formatting
npm test                    # vp test (Vitest via vite-plus), test/**/*.test.ts only
npm run dev                 # wrangler dev on http://localhost:8787
npm run build               # build:data + wrangler deploy --dry-run --outdir=.wrangler/dryrun
npm run parity              # live api.mzizi.dev vs a local candidate
```

Single test, by name or file:

```bash
npx vp test -t "health is 200"
npx vp test test/api.test.ts
```

Tests and typecheck import `src/data/*.json`, so they fail until
`npm run build:data` has run. `REGISTRY_DIR=/path/to/mzizi-registry` reuses an
existing checkout, which must be at the pinned commit. Parity flags:
`node scripts/parity.mjs --baseline <url> --candidate <url> [--report parity.md] [--sample N] [--strict]`.

CI (`.github/workflows/ci.yml`, job `worker`) runs, in order: `npm ci`,
`build:data`, `typecheck`, `check`, `test`, then
`npx wrangler deploy --dry-run --outdir=.wrangler/dryrun`. Match that before
pushing. The changelog gate's own test is `bash scripts/changelog-gate.test.sh`.

## Architecture

**Build time, not request time.** `scripts/build-data.mjs` (also wrangler's
`build.command`, so `wrangler dev`/`deploy` and Workers Builds run it):

1. Shallow-clones `mzizi-dev/mzizi-registry` at the `ref` in
   `scripts/registry-ref.json` into `.registry/<sha>`.
2. Bundles `scripts/extract.ts` with esbuild _inside that checkout_ (`@/`
   resolves to the registry; `next/server` → `scripts/next-server-stub.mjs`;
   `@supabase/supabase-js` → `scripts/supabase-stub.mjs`, which throws).
3. Runs it: it reads data through the registry's own `lib/*` readers, checks
   `src/search.ts` and `src/projections.ts` against the ported handlers in
   `scripts/registry-handlers/`, and splits the output into one JSON module per
   concern under `src/data/` (only rewriting files whose content changed).

That is why `scripts/extract.ts` and `scripts/registry-handlers/**` are excluded
from lint and typecheck (`vite.config.ts`, `tsconfig.json`): they only resolve
inside a registry checkout.

**Request path.** `src/index.ts` is the Hono app: a middleware first answers
Next-compatible 308 redirects (repeated slashes, trailing slash, renamed
components via `src/redirects.ts`), then applies security, CORS and `404`
cache headers from `src/http.ts` and stamps
`X-Mzizi-Source: mzizi-api-gateway; registry=<commit>`. `/v1` routes are
registered from `src/routes/{registry,architecture,content}.ts`, which project
the typed imports in `src/data.ts`.

**Generated vs hand-written.** Generated and gitignored: `src/data/`,
`.registry/`, `.wrangler/`. Hand-written: everything in `src/` outside `data/`,
and `scripts/`. `scripts/registry-handlers/` are ports frozen from registry
commit 270af9f, the reference the build checks against, not code to tweak until
a check passes.

**Tests vs parity.** `test/api.test.ts` is offline: it calls the Hono app
directly against the bundled data. `scripts/parity.mjs` is the contract test
against production and needs network; a route change has to pass both.

## Branches, releases and versioning

- `staging` exists and is the integration branch: open feature PRs against
  `staging`. Releases land on `main` as "Release staging to main" PRs.
- Every push to `staging` tags the next **patch** (`staging-version.yml`).
  After CI succeeds on a push to `main`, `main-release.yml` tags the next
  **minor** and creates a GitHub release. Majors are manual
  (`workflow_dispatch`). The version lives in tags; `package.json`'s `version`
  is not bumped by these workflows.
- A push to `main` deploys `api.mzizi.dev` via Cloudflare Workers Builds.
- The pin bot (`bot/registry-pin`) works against `main`, and the Parity
  workflow runs only on PRs into `main` that touch the pin or parity files.
  A PR into `staging` that moves the pin gets no automatic parity run: run
  `npm run parity` yourself and paste the summary into the PR.
- CI runs on PRs into `main`, `staging` and `claude/**`.
