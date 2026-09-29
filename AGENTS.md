# AGENTS.md — mzizi-api-gateway

> Vendor-neutral instructions for any AI agent working in this repository. See
> [`README.md`](./README.md) for the status, the data pipeline and the cutover
> steps, and [`CONTRIBUTING.md`](./CONTRIBUTING.md) for the change procedure.

## What this repo is

A **Hono (TypeScript) Cloudflare Worker** serving `api.mzizi.dev`, the
Mzizi registry API. **Owner decision, 2026-09-28:** the API Worker is Hono,
running its own API, and nothing touches Supabase except the Mzizi console. That
replaces this repo's earlier "pure-Rust `workers-rs`" position. The Rust proxy is
retired and its sources are gone; don't bring `workers-rs` back.

Every route answers from JSON generated at build time out of
`mzizi-dev/mzizi-registry`'s repository files, at the commit pinned in
`scripts/registry-ref.json`, and bundled into the Worker. No origin, no proxying,
no database, no Supabase client.

**Read README's "Status" section before touching deployment.** This Worker has
served `api.mzizi.dev` since 2026-09-29, and a merge to `main` deploys to it.

## Build, test, run

```bash
npm ci
npm run build:data      # checkout the pinned registry ref → src/data/*.json
npm run typecheck
npm test                # offline route tests
npm run format:check
npm run dev             # wrangler dev, http://localhost:8787
npm run parity          # live api.mzizi.dev vs local; must report 0 unexplained
npx wrangler deploy --dry-run --outdir=.wrangler/dryrun
```

`src/data/` and `.registry/` are generated and gitignored. Never commit them, and
never hand-edit generated data. Change the pin or the registry instead.
`build-data.mjs` is also wrangler's `build.command`. It rewrites a file only when
its content changes, because `wrangler dev` watches `src/` and would otherwise
restart forever.

## Changing a route

- **The contract is api.mzizi.dev's, and parity is the test.** A route change
  must leave `npm run parity` at 0 unexplained differences. An intentional
  difference goes into `EXPECTED` in `scripts/parity.mjs` with its reason, and
  into the PR description.
- **Reuse the registry's readers, don't reimplement them.** Data shapes come from
  `scripts/extract.ts`, which calls mzizi-registry's own `lib/*` functions.
  Route handlers in `src/routes/` do only the per-endpoint projection, mirroring
  `app/api/v1/**/route.ts` in the registry. The one query-time computation,
  `/v1/search`, lives in `src/search.ts`, and `extract.ts` fails the build if it
  disagrees with the registry's `searchComponents`, `getComponentsByLayer` or
  `getComponentsByCategory`. Change both sides together, or neither.
- **Port handlers; don't fix them here.** A registry handler's quirk (for example
  `/v1/search` filtering on fields registry items don't carry) is fixed in the
  registry first and reaches this Worker through a pin bump.
- **The API is read-only.** Every `/v1/*` route is a `GET`. Other methods get
  `405` (`OPTIONS` gets `204` + `Allow`). There's no write path. Don't add one.
- **No Supabase, ever.** The registry holds no database, and
  `scripts/supabase-stub.mjs` makes the build fail if a registry reader ever
  imports the client again. `/v1/ui/{name}/docs`, `/v1/search` and
  `/v1/ai/instructions/{name}` serve from files (README, "File-backed routes").
  `/v1/ui/{name}/versions` stays `503`: version history is console-owned data
  (README, "Not served from files"). Don't add a database to serve it.
- **Rust first.** Mzizi Roots (Rust components) are the direction; React/TSX
  components are deprioritised but keep working. Present a Rust implementation
  first where one exists. Roots routes follow the registry's Roots RFC
  (`docs/roots/` in mzizi-registry, in progress). Until it lands, don't add
  Roots-specific routes here (README, "Mzizi Roots").

## Deployment: read this before touching `wrangler.jsonc`

Cloudflare Workers Builds, on push to `main`, deploys to `api.mzizi.dev`.
**`wrangler.jsonc` declares that custom domain** (moved here from the registry
Worker on 2026-09-29). Keep it a **bare hostname**, with no `/*` and no
`zone_name` (the three-field form broke `mzizi-mcp` and the console):

```jsonc
"routes": [{ "pattern": "api.mzizi.dev", "custom_domain": true }],
```

**Workers Builds previews upload a version without applying routes**, so a route
error only shows on the production deploy. The same commit can be green on a PR
and red on `main`.

## Merge convention

This repository is rebase-only: `allow_rebase_merge` is `true`, and
`allow_merge_commit` and `allow_squash_merge` are both `false` (read off the
GitHub API 2026-09-12, org-wide). Land changes with
`gh pr merge <n> --rebase --auto`. Never use `--admin`.

## Honesty rules

- **No database behind the registry.** It's disk: `registry.json`,
  `content/doctrine/**` and the generated `lib/*` modules in mzizi-registry.
  Any claim that Supabase, D1 or any database is the source of truth for
  components, brand or tokens is wrong and should be deleted, not softened. D1
  exists only for the MCP server and fundi logging. Supabase is the console's.
- **"Axis", "axes" and "layer" are retired vocabulary.** The architecture is the
  DNA double helix: 8 nodes, 4 rungs, 6 strands. Those words survive only in the
  retired route names that answer 410 (`/v1/architecture/axes`,
  `/v1/architecture/frontend/{axes,layers}`, `/v1/architecture/layers/{n}`), not
  in prose.
- **The palette is 21 colour families**: minerals, heritage and experimental,
  seven each. Not five, and not seven as the whole set.
- **Canonical install form is `https://api.mzizi.dev/v1/ui/<name>`, never
  `mzizi.dev/api/v1/...`.** That host no longer serves the API at all.
