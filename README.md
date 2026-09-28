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

**Built and parity-tested. Not yet serving `api.mzizi.dev`.**

`api.mzizi.dev` is still attached to the `mzizi-registry` Worker (the registry's
Next.js app on OpenNext; its responses carry `x-opennext: 1`). Moving the custom
domain to this Worker is a deliberate owner step, described in
[Cutover](#cutover). That's why `wrangler.jsonc` declares **no route**: a merge
deploys to `workers.dev` only.

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
| `GET /v1/rs/{name}`                                                                                           | The Dioxus (`.rs`) source, where one exists       |
| `GET /v1/brand`                                                                                               | `lib/tokens`: 21 colour families, and the rest    |
| `GET /v1/architecture` · `/v1/architecture/nodes/{n}`                                                         | The DNA double helix: 8 nodes, 4 rungs, 6 strands |
| `GET /v1/data-layer` · `/ecosystem` · `/pipeline` · `/sovereignty` · `/ubuntu/pillars` · `/ubuntu/principles` | `content/doctrine/**`                             |
| `GET /v1/ai/instructions`                                                                                     | `content/doctrine/**`                             |
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
- **`503 {"error":"Database not configured"}`** for `/v1/ui/{name}/docs`,
  `/v1/ui/{name}/versions`, `/v1/search` and `/v1/ai/instructions/{name}`. See
  [Not served from files](#not-served-from-files).
- `308 /mcp` → `https://mcp.mzizi.dev/mcp`, and a `308` that strips a trailing
  slash.
- **Read-only.** A path with a `GET` handler answers `OPTIONS` with `204` and
  `Allow: GET, HEAD, OPTIONS`, and every other method with an empty `405`.

Only two things differ from today, both on purpose: the bare `/v1` now serves the
discovery document (live answers it with the website's HTML 404), and an unknown
path gets a small JSON 404 instead of that 93 KB HTML page. `security.txt` also
has its new contact.

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
   `lib/registry-source`, the file-backed functions of `lib/db`,
   `lib/doctrine`, and the generated changelog, skills, tokens, samples and
   OpenAPI modules. So the shapes are the ones the registry serves, not a
   reimplementation. `@supabase/supabase-js` is replaced by a stub that throws,
   so a reader that reached for the database would fail the build.
3. Writes `src/data/*.json` (gitignored). The Worker imports it as JSON modules.

Wrangler runs this as its custom build (`build.command` in `wrangler.jsonc`), so
`wrangler dev`, `wrangler deploy` and Workers Builds all build the same bundle
from the same pin.

**Size:** 4.3 MB raw, **~917 KiB gzipped**, under the 3 MiB Workers limit with
room to spare. So the data is bundled into the Worker. R2 would add a network
hop and a second deploy artefact for no benefit at this size. Revisit it only if
`wrangler deploy --dry-run` approaches the limit.

### Not served from files

Genuinely dynamic data belongs to the Mzizi console, the one place that talks
to Supabase. This Worker doesn't implement it:

| Data                                                 | Where it lives                        | What this Worker does                                                   |
| ---------------------------------------------------- | ------------------------------------- | ----------------------------------------------------------------------- |
| Component version history (`component_versions`)     | Supabase, written by releases         | `/v1/ui/{name}/versions` → `503`, as today                              |
| Usage telemetry (`usage_events`)                     | Supabase, written by request tracking | `/v1/stats` reports zeroed totals, as today; per-node counts are real   |
| Fundi issues, self-healing log, observability, chaos | Supabase                              | `/api/health/{name}`, `/api/chaos/{name}` not served (both `503` today) |
| Accounts, users, keys, anything per-user             | The console                           | Not part of this API                                                    |

Three routes return `503` today even though their data **is** in files:
`/v1/ui/{name}/docs` (the item's `meta` in `registry.json`), `/v1/search`
(component names and descriptions), and `/v1/ai/instructions/{name}` (doctrine).
The registry handlers gate them on Supabase credentials that aren't configured
on the live Worker. The discovery document's `database` block reads
`not_configured` / `0` for the same reason. They're kept byte-identical here so
the cutover changes nothing a client sees. Switching them on from files is a
small, separate change, best made after the cutover, when there's one
implementation to change.

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

Owner steps. Nothing in this repository performs them.

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
   add `api.mzizi.dev`. To make it reviewable, add the route to
   `wrangler.jsonc` in the same form as the comment there, so the next deploy
   keeps it.
4. **Re-run parity** with baseline `https://mzizi-registry.nyuchi.workers.dev`
   and candidate `https://api.mzizi.dev`, and check that `X-Mzizi-Source` is
   present on `https://api.mzizi.dev/v1/health`.
5. **Roll back** if needed. Remove `api.mzizi.dev` from `mzizi-api-gateway` and
   re-add it to `mzizi-registry`, in the same dashboard pages. The registry
   Worker is untouched by all of this, so rolling back is only this domain move.

## Related repositories

| Repository                                                      | What it is                                     | Address                                |
| --------------------------------------------------------------- | ---------------------------------------------- | -------------------------------------- |
| [`mzizi`](https://github.com/mzizi-dev/mzizi)                   | The language: Rust compiler research, Phase 0  | —                                      |
| [`mzizi-registry`](https://github.com/mzizi-dev/mzizi-registry) | The component registry, brand and architecture | Currently serves `api.mzizi.dev`       |
| [`mzizi-console`](https://github.com/mzizi-dev/mzizi-console)   | The console, run under Nyuchi; reads this API  | [app.mzizi.dev](https://app.mzizi.dev) |
| [`mzizi-site`](https://github.com/mzizi-dev/mzizi-site)         | Mzizi's front door                             | [mzizi.dev](https://mzizi.dev)         |
| `mzizi-api-gateway`                                             | This repository                                | Target: `api.mzizi.dev`                |

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
