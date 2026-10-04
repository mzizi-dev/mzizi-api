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
[Cutover](#cutover) for how it was done, and [Rollback](#rollback) for undoing
a bad deploy (the move itself can no longer be reversed).

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
| `GET /v1/search` (`q`, `node`, `category`; `layer` is a deprecated alias of `node`)                           | `registry.json`                                   |
| `GET /v1/brand`                                                                                               | `lib/tokens`: 21 colour families, and the rest    |
| `GET /v1/architecture` · `/v1/architecture/nodes/{n}`                                                         | The DNA double helix: 8 nodes, 4 rungs, 6 strands |
| `GET /v1/data-layer` · `/ecosystem` · `/pipeline` · `/sovereignty` · `/ubuntu/pillars` · `/ubuntu/principles` | `content/doctrine/**`                             |
| `GET /v1/ai/instructions` · `/v1/ai/instructions/{name}`                                                      | `content/doctrine/**`                             |
| `GET /v1/changelog` · `/v1/changelog/{version}`                                                               | `lib/changelog.generated.ts`                      |
| `GET /v1/skills` · `/v1/skills/summary` · `/v1/skills/{name}`                                                 | `lib/skills.generated.ts`                         |
| `GET /v1/samples` · `/v1/samples/{type}`                                                                      | `lib/samples/data.ts`                             |
| `GET /v1/stats`                                                                                               | Zeroed usage figures plus real per-node counts    |
| `GET /openapi` · `/api/openapi`                                                                               | `lib/openapi.generated.ts`                        |
| `GET /.well-known/security.txt`                                                                               | Contact `security@nyuchi.com`                     |

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

The differences from the registry Worker this replaced were all on purpose, and
were listed in `EXPECTED` in [`scripts/parity.mjs`](scripts/parity.mjs) at the
cutover (mzizi-api-gateway#13 and before). Since then the baseline is
api.mzizi.dev itself, so `EXPECTED` lists only what the current pin bump
changes. The cutover differences were:

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
credentials that were never set on the registry Worker. This Worker started
serving them from files at the cutover, porting the handlers from
[`0b1819e`](https://github.com/mzizi-dev/mzizi-registry/tree/0b1819e10dd34c7acb24a990b5434708d56c78ec/app/api/v1).
The registry's own handlers now serve them from files too
([mzizi-registry#373](https://github.com/mzizi-dev/mzizi-registry/pull/373)),
so this Worker ports the handlers at the pin:

| Route                        | Reader (mzizi-registry `lib/db`)                                                | Answer                                                                                                                                                          |
| ---------------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/v1/ui/{name}/docs`         | `getComponentWithDocs`: the docs row and demo flag from the item's `meta` block | `name`, `description`, `node`, `nodeLabel`, `owner`, `collection`, `docs`, `demo`; `404` for an unknown name                                                    |
| `/v1/search`                 | `searchComponents`, then `node` and `categories` filters                        | `{ data, meta: { total, query, node, category } }`, each hit `name`, `type`, `title`, `description`, `categories`, `node`, `nodeLabel`; `400` with no parameter |
| `/v1/ai/instructions/{name}` | `getAiInstruction`, then `getAiInstructionByTarget`                             | The whole doctrine row, by name or by target; `404` for neither                                                                                                 |

`build-data` stores what the first and third need (`src/data/component-docs.json`,
`src/data/ai-instruction-index.json`). Search is computed per request, so it runs
[`src/search.ts`](src/search.ts) over `components.json`, which is the output of
`readComponents()`. The per-route projections for docs, AI instructions, the
versions `503`, the discovery document and `/v1/rs/{name}` are in
[`src/projections.ts`](src/projections.ts).

**Both are checked against the registry's route handlers at build time.**
The registry removed its Next.js app, and with it `app/api/v1/**/route.ts`, in
[mzizi-registry#389](https://github.com/mzizi-dev/mzizi-registry/pull/389), so
the six handlers this check needs are ported from its last commit with them,
[`270af9f`](https://github.com/mzizi-dev/mzizi-registry/tree/270af9fbbded5dcca3fad4dcbc09ee3b7e307c7d/app/api/v1),
into [`scripts/registry-handlers/`](scripts/registry-handlers/), unchanged but
for formatting. They still call the pinned registry's own `lib/` readers.
`scripts/extract.ts` runs them in-process, with `next/server` replaced by
[`scripts/next-server-stub.mjs`](scripts/next-server-stub.mjs) (just
`NextResponse.json`). It compares their answers with this Worker's: search on
about 1,300 queries (status, body and the `Deprecation` header), docs for every
component and for unknown names, every AI instruction key, the versions `503`,
the discovery document, and `/v1/rs/{name}` for every component (the `.rs`
source, its path and the crate that compiles it) and for unknown names. A
disagreement fails the build.

**Search filters on `node` and `categories`,** combined (AND), as the registry
handler does since mzizi-registry#373. `?layer=` still works as a **deprecated
alias of `?node=`**: the answer carries `meta.deprecation` and a
`Deprecation: true` header, and `node` wins when both are given. Before that
the handler filtered on `layer` and `category`, the retired database row's
field names, so those filters matched nothing and a hit had only `name` and
`description`.

**The discovery document says what serves it.** Its `data` block is
`{ source: "files", repository, components }`, with the live count, and its
description names Mzizi as the operator of the registry and this API, and the
Bundu Foundation as the project's home. It used to carry
`database: { status: "not_configured", components: 0 }`.

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

### Registry pin bump

The pin is deliberate: a registry change reaches `api.mzizi.dev` only through a
commit to this repository that CI has checked. **Owner decision, 2026-09-30:**
keep the pin, and move it automatically.
[`.github/workflows/registry-pin-bump.yml`](.github/workflows/registry-pin-bump.yml)
runs [`scripts/registry-pin-bump.mjs`](scripts/registry-pin-bump.mjs), which
keeps one bot pull request, from the branch `bot/registry-pin`, that sets `ref`
in `scripts/registry-ref.json` to registry `main`:

1. **Whenever registry `main` moves**, and every hour as a backstop, it
   compares the pin on `main` with mzizi-registry `main` (`git ls-remote`,
   public, no token). mzizi-registry's `notify-pin-bots.yml` sends this
   workflow a `repository_dispatch` (`registry-main-moved`) on every push to
   registry `main`; the hourly schedule catches anything that misses, since
   GitHub delays and drops scheduled runs under load. When they differ,
   `bot/registry-pin` becomes one bot commit on top of the current `main` that
   moves the pin, and the pull request is opened, or updated if one is open.
   There is only ever one. Its body lists the registry commits between the old
   pin and the new one. It's rebuilt whenever `main` or registry `main` moves,
   so it's never behind `main`.
2. **CI runs on it** like on any pull request: `worker` (build, typecheck,
   tests, format, wrangler bundle), `secret scan`, the five `lint / *` checks,
   Workers Builds, and **`parity`**: [`parity.yml`](.github/workflows/parity.yml)
   runs on every pull request that changes `scripts/registry-ref.json` (or
   parity itself),
   building the pull request under `wrangler dev` and comparing it with
   production `https://api.mzizi.dev`. On a pull request that doesn't edit
   `scripts/parity.mjs`, as every bot bump, parity runs `--strict`: `EXPECTED`
   then holds only an earlier bump's reasons, which production already serves,
   so any difference at all fails it.
3. **When a check finishes** on `bot/registry-pin` (`workflow_run` for CI, Lint
   and Parity; `check_run` for Workers Builds), and on every other run, the
   bot gates the pull request. It merges (rebase) only when the pull request is
   the bot's single commit on the current `main`, changes nothing but
   `scripts/registry-ref.json`, moves the pin forward along registry `main`, and
   every check and status on its head commit has finished green, including
   `worker`, `secret scan`, `parity`, Workers Builds and every check `main`'s
   rules require. If GitHub doesn't allow the merge yet, it turns on auto-merge
   (rebase) instead, which waits for the required checks. Nothing bypasses the
   branch rules. The merge deploys through Workers Builds as usual.
4. **A failed check stops it.** The bot comments with the failed checks and
   waits for a person. An unexplained parity difference usually means the
   registry changed data or a `lib/` reader a route serves, which has to be
   reviewed, and explained in `EXPECTED`, here (see
   [CONTRIBUTING.md](CONTRIBUTING.md), "Bumping the registry pin"). To take
   the bump over, push to `bot/registry-pin`: the bot leaves a branch with any
   commit it didn't make alone, and a person merges it. Delete the branch to
   hand the bump back. Closing the pull request without merging declines that
   registry commit; the bot opens a new one when registry `main` moves again.
5. **A bump by hand still works.** While another open pull request moves the
   pin to registry `main`, the bot opens none. When a bump lands on `main` any
   other way, the bot closes its own pull request and deletes the branch.

Every trigger runs the same idempotent reconcile from `main`'s copy of the
workflow, and no step checks out or runs pull request code.
`node scripts/registry-pin-bump.mjs --dry-run` (with `GITHUB_REPOSITORY` and
`PIN_FILE` set) prints what it would do without writing anything. The same
script and workflow are in `mzizi-dev/agent-tools` for `mzizi-mcp`'s pin.

#### Owner setup

`GITHUB_TOKEN` can't do this: GitHub starts no workflows for a push or a pull
request made with it, so no required check would ever run on the bump. The bot
uses its own token:

1. **Create a fine-grained personal access token** (GitHub, Settings,
   Developer settings, Fine-grained tokens), ideally on a machine account with
   write access that isn't an organisation owner, so the org ruleset's owner
   bypass can never apply to it:
   - Resource owner: `mzizi-dev`.
   - Repository access: only `mzizi-dev/mzizi-api-gateway` and
     `mzizi-dev/agent-tools`.
   - Repository permissions: **Contents: Read and write**, **Pull requests:
     Read and write**, **Workflows: Read and write** (Metadata: Read is added
     automatically). Workflows is there only because the bot moves its branch
     onto the current `main`: GitHub refuses a token push that carries a
     workflow file change, even one already on `main`, without it. The script
     writes only the pin file. It needs no Checks or Commit statuses
     permission: the bot reads the bump's check runs, commit status and
     branch rules with the workflow's own `GITHUB_TOKEN` (`checks: read`,
     `statuses: read`). Until 2026-10-04 it read them with this token, which
     has neither, and on the private agent-tools repository every read failed
     with `403 Resource not accessible by personal access token`, so no green
     bump merged itself there (agent-tools#195). This repository is public,
     so the same reads worked here.
   - If the organisation requires approval for fine-grained tokens, approve it
     (organisation Settings, Personal access tokens, Pending requests).
2. **Store it as the Actions secret `RELEASE_BUMP_TOKEN`** in both repositories
   (Settings, Secrets and variables, Actions), or once as an organisation
   secret shared with those two repositories and mzizi-registry (step 4).
   Until it exists, every run logs a warning and does nothing.
3. **Allow auto-merge** (Settings, General, Pull Requests) must stay on, with
   rebase merging. Both are on in both repositories (read off the GitHub API on
   2026-09-30).
4. **Keep the secret visible to mzizi-registry.** Its `notify-pin-bots.yml`
   sends the `registry-main-moved` dispatch with the same `RELEASE_BUMP_TOKEN`
   org secret, which needs Contents: Read and write here (it has it already).
   If the registry can't see the secret, that workflow warns and the bot waits
   for its hourly run. To see it work, run **Registry pin bump** from the
   Actions tab. When the token expires, the runs fail at checkout, so renew it
   before then.

## Mzizi Roots: Rust components first

**Direction, not shipped.** Mzizi's own branded components are being converted
to Rust as **Mzizi Roots**: UI and server components built for the agentic web.
React/TSX components keep working, but they're deprioritised: they aren't the
lead and aren't where new work goes. Where a Rust implementation exists, it
comes first.

What that means for this API:

- **Today**, `/v1/rs/{name}` serves the Rust (Dioxus) source for every item
  that has one (55 at the current pin), and `/v1/ui/{name}` serves the React
  source that the shadcn CLI installs. Both come from the same pinned registry
  files. Neither changes in this repository before the registry changes.
- **`crate` on `/v1/rs/{name}`** names the crate that compiles the component,
  read from the registry's `mzizi-rs/crate-for-node.json` at build time:
  `mzizi-ui` for the N2 primitives, `mzizi-brand` for the N3 brand components
  (Roots batch 1, mzizi-registry#372), `mzizi-shell`, `mzizi-assurance`,
  `mzizi-fundi`, `mzizi-docs`, `mzizi-discovery` and `mzizi-tokens` for the
  rest. It also carries `git`, the install that resolves before and after a
  crates.io release. `scripts/extract.ts` checks every `/v1/rs/{name}` answer
  against the registry's last handler for it (`scripts/registry-handlers/rs.ts`,
  ported from 270af9f).
- **The direction** is for Rust to be the first answer: Roots components listed
  and described ahead of their React counterparts, and new component endpoints
  designed around the Rust implementation. The registry has had no route
  handlers since mzizi-registry#389, so such a change lands here, with a
  CHANGELOG entry and parity recording the difference.
- **The design** is the
  [Roots RFC](https://github.com/mzizi-dev/mzizi-registry/blob/main/docs/roots/RFC-roots.md)
  in mzizi-registry (status: proposed). Roots-specific routes follow it, and
  land in the registry first; don't build them here ahead of it.

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

The **Parity** GitHub workflow does the same, with the report as the job
summary. It runs by hand against any two URLs, and on every pull request that
changes `scripts/registry-ref.json`, against production. There it passes
`--strict` unless the pull request edits `scripts/parity.mjs`: `--strict`
ignores `EXPECTED`, so every difference counts as unexplained (see
[Registry pin bump](#registry-pin-bump)).

## Cutover

**Done 2026-09-29.** Parity before the move, against the deployed Worker on
`workers.dev`: 1359 requests, 0 unexplained differences. The steps are kept
here as the record.

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
5. **Roll back** to the registry Worker: no longer possible. It served the
   registry's Next.js app, which mzizi-registry removed on 2026-10-02, and the
   Worker is being deleted. See [Rollback](#rollback).

### Rollback

There is no older Worker to move `api.mzizi.dev` back to. To undo a bad
change, revert it in a pull request; the merge redeploys. To undo a bad deploy
faster than that, roll this Worker back to its previous deployment
(`wrangler rollback`, or _Workers & Pages → `mzizi-api-gateway` → Deployments_
in the Cloudflare dashboard), then revert on `main` so the next deploy does not
bring the change back.

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
