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
npm run check           # vp check: format, lint, type check (vp fmt to fix)
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
  the registry's last `app/api/v1/**/route.ts` handlers (mzizi-registry
  270af9f). The one query-time computation, `/v1/search`, lives in
  `src/search.ts`, and the projections for docs, AI instructions, versions and
  discovery live in `src/projections.ts`. `extract.ts` runs the registry
  handlers ported into `scripts/registry-handlers/` (with `next/server`
  stubbed, against the pinned registry's `lib/`) and fails the build if either
  disagrees with them. Change both sides together, or neither.
- **The registry has no route handlers any more.** mzizi-registry#389 removed
  its Next.js app on 2026-10-02: the registry is the registry and nothing else,
  and this Worker is the API. Nothing here may import the registry's `app/`
  tree. `scripts/registry-handlers/` holds the six handlers the build checks
  against, ported from 270af9f. Don't edit them to make a check pass: an
  intentional change to one of those routes changes the copy and `src/` in the
  same pull request, with a CHANGELOG entry and the parity difference recorded.
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
  (`docs/roots/RFC-roots.md` in mzizi-registry, proposed); don't add
  Roots-specific routes here ahead of it (README, "Mzizi Roots").

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

## The registry pin moves by itself

`.github/workflows/registry-pin-bump.yml` keeps one bot pull request, branch
`bot/registry-pin`, that moves `scripts/registry-ref.json` to mzizi-registry
`main`, and merges it (rebase) when every check, including a `--strict` parity
run against production, is green (README, "Registry pin bump").

- **Never push to `bot/registry-pin` unless you're taking the bump over.** Any
  commit the bot didn't make hands the branch to people: the bot stops
  rebuilding and merging it. Delete the branch to hand it back.
- **A bump that stops for review** usually needs a handler ported. Do it on
  that branch, or in your own pull request (the bot opens none while an open
  pull request moves the pin to registry `main`).
- **`--strict` parity ignores `EXPECTED`** on any pull request that doesn't edit
  `scripts/parity.mjs`. After a bump deploys, its `EXPECTED` entries are stale;
  a later change may prune them.
- Keep `scripts/registry-pin-bump.mjs` identical to the copy in
  `mzizi-dev/agent-tools`.

## Changelog (hard rule)

Owner's rule, 2026-09-30: "changelogs are super important".

- **Every pull request that changes behaviour, an API response, a dependency,
  a default, the registry pin or a documented fact adds an entry under
  `## [Unreleased]` in `CHANGELOG.md`**, in the same pull request. Use the Keep
  a Changelog headings (Added, Changed, Deprecated, Removed, Fixed, Security),
  mark breaking changes **Breaking**, and say what changed for a caller of the
  API, not the commit text.
- The `changelog / entry required` check (`.github/workflows/changelog.yml`)
  fails a pull request without one. It is exempt for the pin bot's own pull
  request on `bot/registry-pin` while it changes only
  `scripts/registry-ref.json` (its body lists the registry commits), for pull
  requests that touch only `.github/`,
  lockfiles or lint config, and for pull requests labelled `no-changelog`
  (pure CI, lint or typo changes). If you take a bump over to port a handler,
  add the entry.
- The logic is `scripts/changelog-gate.sh`, tested by
  `scripts/changelog-gate.test.sh`. Keep both identical to the copies in the
  other Mzizi repositories.

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

## Track big work in GitHub issues

Any substantial build, migration, investigation or multi-step task gets a GitHub
issue in the repo that owns it — before or as work starts — so another session,
agent or person can pick it up.

- The issue holds the goal, the owner's decisions (verbatim where given), the
  plan, acceptance criteria, owner-only steps and links.
- Every PR references its issue (`Refs #n`; `Fixes #n` only when the merge
  completes it).
- Post progress, decisions and a hand-off note (what's done, what's left, branch
  names) as issue comments — at each merge and before a session or agent
  finishes.
- Work spanning repos gets a tracking issue that links the per-repo issues.
- Never put secrets, credential status or exploitable detail in issues on public
  repos.
