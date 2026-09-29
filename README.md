# Mzizi API gateway

> `api.mzizi.dev`: the Mzizi registry API as a **Hono Cloudflare Worker**, served from registry data bundled at build time. No origin, no database, no Supabase.

[![CI](https://github.com/mzizi-dev/mzizi-api-gateway/actions/workflows/ci.yml/badge.svg)](https://github.com/mzizi-dev/mzizi-api-gateway/actions/workflows/ci.yml)
[![Lint](https://github.com/mzizi-dev/mzizi-api-gateway/actions/workflows/lint.yml/badge.svg)](https://github.com/mzizi-dev/mzizi-api-gateway/actions/workflows/lint.yml)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://www.apache.org/licenses/LICENSE-2.0)
![Hono](https://img.shields.io/badge/Hono-4-E36002?style=flat-square&logo=hono&logoColor=white)
![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?style=flat-square&logo=cloudflare&logoColor=white)

**Package:** `mzizi-api-gateway` (private) | **Live API:** [api.mzizi.dev](https://api.mzizi.dev/v1/health) | **Docs:** [docs.mzizi.dev](https://docs.mzizi.dev)

---

## Owner decision (2026-09-28)

**The API Worker for `api.mzizi.dev` is Hono, running its own API. Nothing
touches Supabase except the Mzizi console.**

That replaces this repository's earlier "pure-Rust `workers-rs`" position, for
this repository. The Rust proxy that stood here (a strangler fig forwarding to
the registry's Next.js handlers) is retired. This Worker implements the whole
public `/v1` API itself, from files.

## Status

**Live on `api.mzizi.dev` since 2026-09-29.**

The owner moved the custom domain from the `mzizi-registry` Worker (the
registry's Next.js app on OpenNext) to this Worker on 2026-09-29, and
`wrangler.jsonc` now declares it, so every production deploy keeps it. See
[Cutover](#cutover) for how it was done and how to roll it back.

You can tell which Worker answered: every response from this one carries
`X-Mzizi-Source: mzizi-api-gateway; registry=<commit>`.

## What it serves

The same contract `api.mzizi.dev` serves today: the same paths, methods, query
parameters, status codes, response bodies, CORS headers and cache headers. Both
base paths answer: `/v1/...` (canonical) and `/api/v1/...`.

| Route                                                                                                         | Data                                              |
| ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `GET /v1` · `/api/v1`                                                                                         | Discovery document                                |
| `GET /v1/health`                                                                                              | This Worker's liveness                            |
| `GET /v1/ui` (`node`, `owner`, `collection`, `type`, `limit`, `offset`)                                       | `registry.json` joined to the files on disk       |
| `GET /v1/ui/{name}`: the shadcn install endpoint                                                              | Item plus its source file                         |
| `GET /v1/ui/{name}/docs`                                                                                      | The item's `meta` block in `registry.json`        |
| `GET /v1/rs/{name}`                                                                                           | The Dioxus (`.rs`) source, where one exists       |
| `GET /v1/search` (`q`, and the handler's two legacy filters)                                                  | Component names and descriptions                  |
| `GET /v1/brand`                                                                                               | `lib/tokens`: 21 colour families, and the rest    |
| `GET /v1/architecture` · `/v1/architecture/nodes/{n}`                                                         | The DNA double helix: 8 nodes, 4 rungs, 6 strands |
| `GET /v1/data-layer` · `/ecosystem` · `/pipeline` · `/sovereignty` · `/ubuntu/pillars` · `/ubuntu/principles` | `content/doctrine/**`                             |
| `GET /v1/ai/instructions` · `/v1/ai/instructions/{name}`                                                      | `content/doctrine/**`                             |
| `GET /v1/changelog` · `/v1/changelog/{version}`                                                               | `lib/changelog.generated.ts`                      |
| `GET /v1/skills` · `/v1/skills/summary` · `/v1/skills/{name}`                                                 | `lib/skills.generated.ts`                         |
| `GET /v1/samples` · `/v1/samples/{type}`                                                                      | `lib/samples/data.ts`                             |
| `GET /v1/stats`                                                                                               | Zeroed usage figures plus real per-node counts    |
| `GET /openapi` · `/api/openapi`                                                                               | `lib/openapi.generated.ts`                        |
| `GET /.well-known/security.txt`                                                                               | Contact `security@bundu.org`                      |

Also answered, as they are today:

- **`308` for renamed components.** `nyuchi-*` → `mzizi-*` on `/v1/ui`,
  `/v1/rs` (and their `/api` forms), keeping the sub-path and query. The map is
  the registry's `lib/component-renames.json`.
- **`410 Gone`** for retired routes: `/v1/docs`, `/v1/docs/{slug}`,
  `/v1/architecture/axes`, `/v1/architecture/frontend/{axes,layers}`,
  `/v1/architecture/layers/{n}`.
- **`503`** for `/v1/ui/{name}/versions`, whose body says why: version history
  is console-owned data, and this API has no database. See
  [Not served from files](#not-served-from-files).
- `308 /mcp` → `https://mcp.mzizi.dev/mcp`, and a `308` that strips a trailing
  slash.
- **Read-only.** A path with a `GET` handler answers `OPTIONS` with `204` and
  `Allow: GET, HEAD, OPTIONS`, and every other method with an empty `405`.

The differences from the registry Worker this replaced are all on purpose, and
each is listed in `EXPECTED` in [`scripts/parity.mjs`](scripts/parity.mjs):

- The bare `/v1` serves the discovery document (the registry Worker answered it
  with the website's HTML 404).
- An unknown path gets a small JSON 404 instead of that 93 KB HTML page.
- `security.txt` has its new contact.
- `/v1/ui/{name}/docs`, `/v1/search` and `/v1/ai/instructions/{name}` serve
  their data from files, where the registry Worker answered
  `503 {"error":"Database not configured"}`. See
  [File-backed routes](#file-backed-routes).
- `/v1/ui/{name}/versions` is still `503`, with a body that gives the real
  reason instead of `Database not configured`.

## Data

**There is no database behind the registry.** Components, doctrine, brand,
changelog, skills and samples are files in
[`mzizi-dev/mzizi-registry`](https://github.com/mzizi-dev/mzizi-registry), and
that's where this Worker reads them. It reads them at build time, not at request
time.

`npm run build:data` ([`scripts/build-data.mjs`](scripts/build-data.mjs)):

1. Checks out `mzizi-registry` at the commit pinned in
   [`scripts/registry-ref.json`](scripts/registry-ref.json) (shallow, cached
   under `.registry/`).
2. Bundles [`scripts/extract.ts`](scripts/extract.ts) against that checkout with
   esbuild. The extractor calls **the registry's own readers**: `lib/registry`,
   `lib/registry-source`, `lib/db` (file-only since the registry dropped
   Supabase), `lib/doctrine`, and the generated changelog, skills, tokens,
   samples and OpenAPI modules. So the shapes are the ones the registry serves,
   not a reimplementation. `@supabase/supabase-js` stays replaced by a stub that
   throws, so a reader that ever reached for a database again would fail the
   build.
3. Writes `src/data/*.json` (gitignored). The Worker imports it as JSON modules.

Wrangler runs this as its custom build (`build.command` in `wrangler.jsonc`), so
`wrangler dev`, `wrangler deploy` and Workers Builds all build the same bundle
from the same pin.

**Size:** 4.6 MB raw, **~961 KiB gzipped**, under the 3 MiB Workers limit with
room to spare. So the data is bundled into the Worker. R2 would add a network
hop and a second deploy artefact for no benefit at this size. Revisit it only if
`wrangler deploy --dry-run` approaches the limit.

### File-backed routes

Three routes used to answer `503 {"error":"Database not configured"}` even though
their data was in files: the registry handlers gated them on Supabase
credentials that were never set on the registry Worker. The registry has since
dropped Supabase and reduced those handlers to `503` stubs, noting that serving
them from files was a deliberate follow-up. This Worker is that follow-up. Each
route answers what its registry handler answered with data present, from the
registry's own readers. The handlers are the ones at
[`0b1819e`](https://github.com/mzizi-dev/mzizi-registry/tree/0b1819e10dd34c7acb24a990b5434708d56c78ec/app/api/v1),
the last registry commit before the Supabase removal
([mzizi-registry#368](https://github.com/mzizi-dev/mzizi-registry/pull/368)):

| Route                        | Reader (mzizi-registry `lib/db`)                                                | Answer                                                                                                       |
| ---------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `/v1/ui/{name}/docs`         | `getComponentWithDocs`: the docs row and demo flag from the item's `meta` block | `name`, `description`, `node`, `nodeLabel`, `owner`, `collection`, `docs`, `demo`; `404` for an unknown name |
| `/v1/search`                 | `searchComponents`, `getComponentsByLayer`, `getComponentsByCategory`           | `{ data, meta: { total, query, layer, category } }`; `400` with none of the three parameters                 |
| `/v1/ai/instructions/{name}` | `getAiInstruction`, then `getAiInstructionByTarget`                             | The whole doctrine row, by name or by target; `404` for neither                                              |

`build-data` stores what the first and third need (`src/data/component-docs.json`,
`src/data/ai-instruction-index.json`). Search is computed per request, so it runs
[`src/search.ts`](src/search.ts) over `components.json`, which is the output of
`readComponents()`. `scripts/extract.ts` checks that code against the
registry's own three readers on about 1,200 queries, and fails the build if
they ever disagree.

**Search carries its handler's quirks, on purpose.** Registry items carry `node`
and `categories`. The handler filters on `layer` and `category` (the retired
database row's field names), so a `layer` or `category` parameter matches
nothing, and a hit has only `name` and `description`. A port that fixed this
here would fork the contract from the registry. The fix belongs in the
registry's handler first, and a pin bump brings it here.

The discovery document is unchanged. Its `database` block still reads
`not_configured` / `0`, as the registry's does.

### Not served from files

Genuinely dynamic data belongs to the Mzizi console, the one place that talks
to Supabase. This Worker doesn't implement it:

| Data                                                 | Where it lives                              | What this Worker does                                                   |
| ---------------------------------------------------- | ------------------------------------------- | ----------------------------------------------------------------------- |
| Component version history (`component_versions`)     | The console's Supabase, written by releases | `/v1/ui/{name}/versions` → `503`, saying so                             |
| Usage telemetry (`usage_events`)                     | Supabase, written by request tracking       | `/v1/stats` reports zeroed totals, as today; per-node counts are real   |
| Fundi issues, self-healing log, observability, chaos | Supabase                                    | `/api/health/{name}`, `/api/chaos/{name}` not served (both `503` today) |
| Accounts, users, keys, anything per-user             | The console                                 | Not part of this API                                                    |

`/v1/ui/{name}/versions` keeps its `503` status and headers. Its body now reads:

```json
{
  "error": "Version history is not served by this API",
  "message": "Component version history is machine-written data owned by the Mzizi console (app.mzizi.dev), not part of the registry's files. api.mzizi.dev serves those files and has no database. Release history is at https://api.mzizi.dev/v1/changelog."
}
```

### Rebuilding when the registry changes

The pin is deliberate: a registry change reaches `api.mzizi.dev` only through a
commit to this repository that CI (typecheck, tests, bundle) has checked. It's
**not wired up yet**. This is the intended mechanism:

1. **In `mzizi-registry`**, a workflow on `push` to `main` checks out this
   repository, sets `ref` in `scripts/registry-ref.json` to `${{ github.sha }}`,
   and opens (or updates) a pull request here, for example with
   `peter-evans/create-pull-request`.
2. **The secret it needs:** `MZIZI_API_GATEWAY_TOKEN`, stored in
   `mzizi-registry`'s Actions secrets. That's a fine-grained personal access
   token, or better, a GitHub App installation token, scoped to
   `mzizi-dev/mzizi-api-gateway` only, with **Contents: read and write** and
   **Pull requests: read and write**. The default `GITHUB_TOKEN` can't write to
   another repository.
3. CI runs here on that pull request. Merging it (by hand, or with
   `gh pr merge --rebase --auto`) pushes to `main`, and Workers Builds redeploys.
   Before merging, run the **Parity** workflow if the bump changes what live
   serves.

A Workers Builds deploy hook alone wouldn't do it: rebuilding at an unchanged
pin produces an identical bundle. The pin has to move, and moving it is a
commit.

## Mzizi Roots: Rust components first

**Direction, not shipped.** Mzizi's own branded components are being converted
to Rust as **Mzizi Roots**: UI and server components built for the agentic web.
React/TSX components keep working, but they're deprioritised: they aren't the
lead and aren't where new work goes. Where a Rust implementation exists, it
comes first.

What that means for this API:

- **Today**, `/v1/rs/{name}` serves the Rust (Dioxus) source for every item
  that has one, and `/v1/ui/{name}` serves the React source that the shadcn CLI
  installs. Both come from the same pinned registry files. Neither changes in
  this repository before the registry changes.
- **The direction** is for Rust to be the first answer: Roots components listed
  and described ahead of their React counterparts, and new component endpoints
  designed around the Rust implementation. Each such change lands in the
  registry's handlers first and reaches this Worker through a pin bump, with
  parity recording the difference.
- **The design** is the Roots RFC, which is being written in `mzizi-registry`
  under `docs/roots/`. This section will link it once it lands. Until then,
  don't build Roots-specific routes here.

## Developing

```bash
npm ci
npm run build:data     # clone the pinned registry ref, generate src/data/
npm run dev            # wrangler dev on http://localhost:8787
npm test               # offline route tests (vitest)
npm run typecheck
npm run parity         # live api.mzizi.dev vs the local Worker
```

`REGISTRY_DIR=/path/to/mzizi-registry` reuses an existing checkout, but it must
be at the pinned commit.

## Parity

[`scripts/parity.mjs`](scripts/parity.mjs) is the acceptance test. It sends
read-only requests to a baseline and a candidate: every route, **every
component slug** on `/v1/ui/{name}` and `/v1/rs/{name}`, the renamed names, the
query filters, the error paths, the `/api/v1` spellings and the method handling.
It diffs status, `Location`, content type, the CORS, cache and security headers,
and the body (JSON deep-equal). The only values it normalises are the health
timestamp and `security.txt`'s `Expires`. Intentional differences are listed in
the script with their reasons. Anything else fails the run.

```bash
node scripts/parity.mjs --baseline https://api.mzizi.dev --candidate http://localhost:8787
```

The **Parity** GitHub workflow (run by hand) does the same, with the report as
the job summary.

## Cutover

**Done 2026-09-29.** Parity before the move, against the deployed Worker on
`workers.dev`: 1359 requests, 0 unexplained differences. The steps are kept
here as the record, and because rollback reverses step 3.

1. **Deploy.** Merge to `main`. Workers Builds builds and deploys this Worker
   to `workers.dev` (see the Workers Builds settings in the pull request that
   introduced this README).
2. **Verify on workers.dev.** Run the Parity workflow with baseline
   `https://api.mzizi.dev` and candidate
   `https://mzizi-api-gateway.nyuchi.workers.dev`. Expect **0 unexplained
   differences**.
3. **Move the domain.** In the Cloudflare dashboard: _Workers & Pages →
   `mzizi-registry` → Settings → Domains & Routes_, remove `api.mzizi.dev`. Then
   _`mzizi-api-gateway` → Settings → Domains & Routes → Add → Custom domain_,
   add `api.mzizi.dev`. Then declare it in `wrangler.jsonc` (done), so the
   next deploy keeps it.
4. **Re-run parity** with baseline `https://mzizi-registry.nyuchi.workers.dev`
   and candidate `https://api.mzizi.dev`, and check that `X-Mzizi-Source` is
   present on `https://api.mzizi.dev/v1/health`.
5. **Roll back** if needed. Revert the `routes` entry in `wrangler.jsonc`
   first, or the next deploy takes the domain back. Then remove `api.mzizi.dev`
   from `mzizi-api-gateway` and re-add it to `mzizi-registry`, in the same
   dashboard pages. The registry Worker is untouched by all of this and still
   answers on `mzizi-registry.nyuchi.workers.dev`.

## Related repositories

| Repository                                                      | What it is                                     | Address                                |
| --------------------------------------------------------------- | ---------------------------------------------- | -------------------------------------- |
| [`mzizi`](https://github.com/mzizi-dev/mzizi)                   | The language: Rust compiler research, Phase 0  | —                                      |
| [`mzizi-registry`](https://github.com/mzizi-dev/mzizi-registry) | The component registry, brand and architecture | [mzizi.dev](https://mzizi.dev)         |
| [`mzizi-console`](https://github.com/mzizi-dev/mzizi-console)   | The console, run under Nyuchi; reads this API  | [app.mzizi.dev](https://app.mzizi.dev) |
| [`mzizi-site`](https://github.com/mzizi-dev/mzizi-site)         | Mzizi's front door                             | [mzizi.dev](https://mzizi.dev)         |
| `mzizi-api-gateway`                                             | This repository                                | [api.mzizi.dev](https://api.mzizi.dev) |

## Contributing

[`CONTRIBUTING.md`](CONTRIBUTING.md) covers changing a route, bumping the
registry pin, and the `wrangler.jsonc` rules that only fail on production.
[`AGENTS.md`](AGENTS.md) has the same in agent-facing form, plus the merge
convention.

[`SECURITY.md`](SECURITY.md) · [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md)

## Licence

Licensed under the [Apache License 2.0](LICENSE).

Mzizi is an independent open-architecture project that owns, operates and
develops its framework, design system, registry, docs and this API gateway. The
Mzizi console and everything revenue-generating are run under **Nyuchi**.
