# Mzizi API gateway

> `api.mzizi.dev` — the Mzizi registry API, as a **pure-Rust Cloudflare Worker**. A strangler fig in front of the Next.js handlers that serve the API today.

[![CI](https://github.com/mzizi-dev/mzizi-api-gateway/actions/workflows/ci.yml/badge.svg)](https://github.com/mzizi-dev/mzizi-api-gateway/actions/workflows/ci.yml)
[![Lint](https://github.com/mzizi-dev/mzizi-api-gateway/actions/workflows/lint.yml/badge.svg)](https://github.com/mzizi-dev/mzizi-api-gateway/actions/workflows/lint.yml)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://www.apache.org/licenses/LICENSE-2.0)
![Rust](https://img.shields.io/badge/Rust-workers--rs_0.8-000000?style=flat-square&logo=rust&logoColor=white)
![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?style=flat-square&logo=cloudflare&logoColor=white)

**Crate:** `mzizi-api-gateway` 0.1.0 (`publish = false`) | **Live API:** [api.mzizi.dev](https://api.mzizi.dev/api/v1) | **Docs:** [docs.bundu.org](https://docs.bundu.org)

---

## Status

**Scaffold, and not currently the thing serving `api.mzizi.dev`.**

Both halves of that need saying plainly, because the previous version of this
README asserted the second half the other way round.

`api.mzizi.dev` is up. Measured 2026-09-12, `/v1/ui`, `/v1/brand`,
`/v1/architecture`, `/v1/health` and the `/api/v1/*` forms of all of them return
`200`. **But the responses are not this Worker's.** Every one arrives with
`x-opennext: 1` and Next.js `vary` headers, and `GET /v1/health` returns

```json
{ "status": "healthy", "timestamp": "…", "checks": { … }, "version": "unknown" }
```

with **no `origin` field** — where this Worker's native health route
([`src/lib.rs`](src/lib.rs)) always emits one. So the hostname is currently
answered by the registry's own Next.js app running on Cloudflare via OpenNext,
not by the code in this repository.

Neither this repository's `wrangler.jsonc` nor `mzizi-registry`'s explains which
Worker holds the custom domain — the attachment was made in the Cloudflare
dashboard, outside version control, the same way the `mzizi.dev` apex changed
hands. That is worth fixing before anything here is ported, because **a route
that exists only in a dashboard is a route nobody can review**.

What is true of the code: one route is native, the rest are proxied. See
[The migration](#the-migration).

## The two base paths

| Base                                  | State                                                                                           |
| ------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `https://api.mzizi.dev/api/v1`        | **The working base today.** The discovery document and every resource answer `200`              |
| `https://api.mzizi.dev/v1/<resource>` | Works — `/v1/ui`, `/v1/brand`, `/v1/architecture`, `/v1/ui/<name>` all `200`                    |
| `https://api.mzizi.dev/v1`            | **404.** The bare discovery document is served at `/api/v1` only, and `/v1` returns an HTML 404 |
| `https://mzizi.dev/api/v1`            | **404. Never write this form.** The apex no longer serves the API at all                        |

[`mzizi-registry#335`](https://github.com/mzizi-dev/mzizi-registry/pull/335),
"serve `/v1` at the root", is **merged** — and the bare `/v1` index still does
not answer, while every resource beneath it does. Report what a request returns,
not what a merge implies.

The canonical install form is:

```bash
npx shadcn@latest add https://api.mzizi.dev/v1/ui/<name>
```

Checked 2026-09-12: `https://api.mzizi.dev/v1/ui/button` returns `200` with a
`registry-item.json` document. `https://api.mzizi.dev/api/v1/ui/button` returns
the same. Use the canonical form.

## Why this exists

The registry API is served by ~30 Next.js route handlers in
[`mzizi-dev/mzizi-registry`](https://github.com/mzizi-dev/mzizi-registry).

`api.mzizi.dev` is the address the ecosystem already writes down — and it did not
exist. `mzizi-console`'s API client pointed at it, with a comment asserting the
old address "still resolves". Measured, the reverse was true:

```text
api.mzizi.dev      ->  NXDOMAIN, no DNS record at all
mzizi.dev/api/v1   ->  200
```

The console would have rendered every view empty against a "healthy" API. Both
of those measurements have since inverted — `api.mzizi.dev` resolves and
`mzizi.dev/api/v1` is gone — which is the argument for the hostname made in one
line: **the name outlives whatever is behind it.**

## Why `workers-rs` and not an in-house framework

Worth stating plainly, because "build it in our own framework" was the starting
brief and the honest answer is that there isn't one to use yet:

- **`mzizi-rs/crates/*`** are UI and assurance layers — `mzizi-tokens` (N1),
  `mzizi-ui` (N2), `mzizi-shell` (N7), `mzizi-assurance` (N8), `mzizi-fundi`
  (N9), `mzizi-docs` (N10), `mzizi-discovery` (N11). None serves HTTP.
- **[`mzizi-dev/mzizi`](https://github.com/mzizi-dev/mzizi)**, the language, is
  Phase 0 research — a Rust compiler and runtime for the agentic web, not the
  registry, and the two are routinely confused. Its own README: the front end is
  a prototype and _"nothing here has yet been measured against the charter's
  kill criteria"_. A public API gateway is the wrong first production load for a
  language that has not run its own benchmark.

`workers-rs` is Cloudflare's own Rust SDK, and the DNA architecture doc already
names it as the target runtime for the fundi rung — so using it here is
consistent with a decision the ecosystem recorded rather than a new one.

**Where in-house crates do fit, they should be used.** `mzizi-assurance` (N8) is
the obvious one: a gateway is exactly where request telemetry belongs. That is
deliberately not wired up yet — a scaffold that pulls in a dependency it does not
exercise is harder to read, not easier.

## The migration

This is a **strangler fig**, not a rewrite.

```text
             ┌─────────────────────┐
GET /v1/*  → │  mzizi-api-gateway  │ ── native ──→  answered here
             │   api.mzizi.dev     │
             └──────────┬──────────┘
                        └── proxied ──→  the registry's Next.js handlers
```

Every route is served from day one. A route implemented natively is answered
here; everything else is forwarded unmodified to the origin. Routes move from
proxied to native one at a time, and callers never see the difference.

**`ORIGIN` in [`src/lib.rs`](src/lib.rs) is `https://mzizi.dev/api`, and that
address now 404s.** It was correct when written. Whatever is currently answering
`api.mzizi.dev` is not this Worker (see [Status](#status)), so nothing is
presently broken by it — but this constant must be repointed at an origin that
actually serves before this Worker is put in front of the hostname. **That is the
first thing to fix in this repository.**

Two things make the incremental port safe to do:

- **The API is read-only.** Every `/v1/*` route is a `GET`. There is no write
  path to keep consistent across two implementations, which is what usually
  makes a strangler fig expensive. Non-`GET` requests get a `405` here rather
  than reaching the origin.
- **A ported route is provably identical, or it is not ported.** Fixtures are
  captured live responses, so a native implementation is checked against what the
  origin actually returns — not against what this repo believes it returns. The
  Svelte console that preceded `mzizi-console` had types that were
  self-consistent and wrong; that is the failure this guards against.

### Ported

| Route            | Notes                                                                                                                                                                                                                                                          |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /v1/health` | The gateway's own liveness. Native on purpose — proxying it would report the origin's health while saying nothing about whether the gateway in front of it is up. It emits an `origin` field, which is how you can tell this Worker's answer from the origin's |

### Proxied

Everything else, including routes not enumerated here — a new route added to the
origin works through this Worker without a change. The current surface:

`/v1` · `/v1/ai/instructions` · `/v1/architecture` · `/v1/architecture/nodes/[n]` ·
`/v1/brand` · `/v1/changelog` · `/v1/data-layer` · `/v1/docs` · `/v1/ecosystem` ·
`/v1/health` · `/v1/pipeline` · `/v1/rs/[name]` · `/v1/samples` · `/v1/search` ·
`/v1/skills` · `/v1/skills/[name]` · `/v1/skills/summary` · `/v1/sovereignty` ·
`/v1/stats` · `/v1/ui`

Note `/v1/architecture/frontend/axes` and `/v1/architecture/frontend/layers`
answer **410 Gone** at the origin. The axis model is retired — the architecture
is the **DNA double helix: 8 nodes, 4 rungs, 6 strands**, served at
`/v1/architecture`. "Axis", "axes" and "layer" survive in those legacy route
names and nowhere else; they are not vocabulary to use in prose. The 410s are
proxied like anything else, so they are preserved rather than becoming a 404
here.

### Suggested order

The routes the console actually calls are the ones whose latency and
availability a user sees, so they are the ones worth porting — but check where a
route's data actually lives before picking it up. Measured 2026-09-11:

| Candidate          | Real data source                                                      | Portable?                   |
| ------------------ | --------------------------------------------------------------------- | --------------------------- |
| `/v1/ui`           | `registry.json` + `lib/registry.generated.ts`                         | **No** — see [Data](#data)  |
| `/v1/architecture` | `content/doctrine/**` via `lib/doctrine.ts`; node counts only from D1 | **No** — the helix is files |
| `/v1/brand`        | The brand document, assembled in the route handler                    | Assess before starting      |

The brand payload is the smallest — ~24 KB — and it is worth knowing its shape
before porting: it carries **21 colour families in three groups of seven**,
`minerals`, `heritage` and `experimental`. Not five, and not seven. A port that
drops two of the three arrays would look correct against a console that renders
only the minerals.

[`CONTRIBUTING.md`](CONTRIBUTING.md) has the step-by-step: find the real data
source, capture the fixture, implement, round-trip the fixture against your
production types, move the arm in the router, update the table above.

## Data

**There is no database behind the registry.** The registry is disk.
`docs/db-contents-rule.md` in `mzizi-dev/mzizi-registry` records the owner's
decision of 2026-08-04:

> The DB only exists for version history, node counts, fundi-related logging,
> the issue log and the self-healing log. [...] **Everything else is in the
> repo.**

The test is _who writes it_: a script, a release, or telemetry writes to the
database; a human writes to a file. So the content routes read files compiled
into the origin's build output — `registry.json` for components,
`content/doctrine/**` for the helix — through `lib/registry.ts` and
`lib/doctrine.ts`. Several route docblocks still name database tables; they
predate the migration and have not caught up.

**Any claim that Supabase, D1 or any database is the source of truth for
components, brand or tokens is wrong and should be deleted rather than
softened.** D1 exists for the MCP server and for fundi logging.

What that means for this Worker: **a route whose data is a file in another
repository's build output cannot be ported here at all**, because there is no
source this Worker can read that is the same source. Reading a database instead
and hoping the two agree is precisely the failure the fixture rule exists to
catch — see [`/v1/ui`](#the-v1ui-index) below.

### The `/v1/ui` index

Measured 2026-09-11 and left proxied deliberately. `GET /v1/ui` projects eleven
fields per item from `registry.json`, joined to the file listing in
`lib/registry.generated.ts` (which is where `node` and `nodeLabel` come from —
derived from the directory a component's file lives in, so they cannot disagree
with where the code is).

It is not reconstructible from the `component_documents` table:

|                      | Origin response | `component_documents`             |
| -------------------- | --------------- | --------------------------------- |
| Items                | 575             | 3,062 rows / 1,580 distinct names |
| `title` present      | 575 / 575       | 100 / 3,062                       |
| `categories` present | 575 / 575       | **0 / 3,062**                     |
| `type` present       | 575 / 575       | 3 / 3,062                         |

Four of the 575 names do not exist in the table at all, and 1,009 names in the
table must not appear in the index. `categories` — required on every item — is
on no row anywhere. Porting this route means first moving the registry index
into a database, which is a decision the origin repo has explicitly taken in the
opposite direction.

## Commands

| Command                                                                     | What it does                          |
| --------------------------------------------------------------------------- | ------------------------------------- |
| `cargo check --target wasm32-unknown-unknown --all-targets`                 | Typecheck against the real target     |
| `cargo clippy --target wasm32-unknown-unknown --all-targets -- -D warnings` | Lints                                 |
| `cargo fmt --all -- --check`                                                | Formatting                            |
| `cargo install -q worker-build --version ^0.8`                              | The build tool, version-locked        |
| `worker-build --release`                                                    | The real artefact                     |
| `npx wrangler dev`                                                          | Serve it locally                      |
| `npx wrangler deploy --dry-run`                                             | Validate the config without deploying |

`worker-build`'s minor version must match the `worker` dependency in
`Cargo.toml` — they are released in lockstep, and the build tool derives the
wasm-bindgen CLI it downloads from the version in `Cargo.lock`. A mismatched
pair fails with "linked against a different version of wasm-bindgen".

## Deployment

Cloudflare Workers Builds, on push to `main`. `wrangler.jsonc` declares
`api.mzizi.dev` as a custom-domain route — a **bare hostname**, no `/*` and no
`zone_name`, because the three-field form silently broke two Workers in this org
already.

**Workers Builds previews upload a version without applying routes**, so a route
error is only caught on the production deploy — the same commit reads green on a
PR and red on `main`.

**Before deploying this Worker to production, read [Status](#status).** A custom
domain on a hostname something else already serves **takes** that hostname;
`api.mzizi.dev` is currently answered by the registry's app, and this Worker's
`ORIGIN` points at an address that 404s. Deploying it in that state would
replace a working API with a proxy to nothing. That failure mode is not
hypothetical — it is what happened to the `mzizi.dev` apex; see
[`mzizi-site`](https://github.com/mzizi-dev/mzizi-site#readme).

## Ecosystem

| Repository                                                      | What it is                                     | Address                                |
| --------------------------------------------------------------- | ---------------------------------------------- | -------------------------------------- |
| [`mzizi`](https://github.com/mzizi-dev/mzizi)                   | The language — Rust compiler research, Phase 0 | —                                      |
| [`mzizi-registry`](https://github.com/mzizi-dev/mzizi-registry) | The component registry, brand and architecture | Portal currently unrouted              |
| [`mzizi-console`](https://github.com/mzizi-dev/mzizi-console)   | The console — reads this API at runtime        | [app.mzizi.dev](https://app.mzizi.dev) |
| [`mzizi-site`](https://github.com/mzizi-dev/mzizi-site)         | The ecosystem front door                       | [mzizi.dev](https://mzizi.dev)         |
| `mzizi-api-gateway`                                             | This repository                                | Target: `api.mzizi.dev`                |

## Contributing

[`CONTRIBUTING.md`](CONTRIBUTING.md) — how to port a route, the build and its
two version-lockstep traps, and the `wrangler.jsonc` rules that only fail on
production.

[`SECURITY.md`](SECURITY.md) · [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md)

**This repository is rebase-only.** Read off the API on 2026-09-12,
`allow_rebase_merge` is `true` with merge commits and squash both disabled, on
all nine repos in `mzizi-dev` and all 75 in the enterprise. Auto-merge is on.

```sh
gh pr merge <n> --rebase --auto
```

Never `--admin`. `CONTRIBUTING.md` still describes the merge-only convention
that preceded this; the API is the authority.

## Licence

Licensed under the [Apache License 2.0](LICENSE).

Mzizi is an open-architecture project of the **Bundu Foundation**, operated and
developed by **Nyuchi**.
