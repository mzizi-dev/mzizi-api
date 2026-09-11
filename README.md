# mzizi-api-gateway

`api.mzizi.dev` — the Mzizi registry API, as a **pure-Rust Cloudflare Worker**.

## Status

**Scaffold.** One route is native; the rest are proxied. See [The migration](#the-migration).

## Why this exists

The registry API is served today by ~30 Next.js route handlers in
[`mzizi-dev/mzizi-registry`](https://github.com/mzizi-dev/mzizi-registry), running on Vercel at
`mzizi.dev/api/v1`.

`api.mzizi.dev` is the address the ecosystem already writes down — and it did not
exist. `mzizi-console`'s API client pointed at it, with a comment asserting the
old address "still resolves". Measured, the reverse was true:

```
api.mzizi.dev      ->  NXDOMAIN, no DNS record at all
mzizi.dev/api/v1   ->  200
```

The console would have rendered every view empty against a "healthy" API. This
Worker is what makes that address real.

## Why `workers-rs` and not an in-house framework

Worth stating plainly, because "build it in our own framework" was the starting
brief and the honest answer is that there isn't one to use yet:

- **`mzizi-rs/crates/*`** are UI and assurance layers — `mzizi-tokens` (N1),
  `mzizi-ui` (N2), `mzizi-shell` (N7), `mzizi-assurance` (N8), `mzizi-fundi`
  (N9), `mzizi-docs` (N10), `mzizi-discovery` (N11). None serves HTTP.
- **`mzizi-lang`** is Phase 0 research. Its own README: the front end is a
  prototype, *"contract bodies parse but are not evaluated"*, and *"nothing here
  has yet been measured against the charter's kill criteria"*. A public API
  gateway is the wrong first production load for a language that cannot yet
  evaluate a contract body.

`workers-rs` is Cloudflare's own Rust SDK, and the DNA architecture doc already
names it as the target runtime for the fundi rung — so using it here is
consistent with a decision the ecosystem recorded rather than a new one.

**Where in-house crates do fit, they should be used.** `mzizi-assurance` (N8) is
the obvious one: a gateway is exactly where request telemetry belongs. That is
deliberately not wired up yet — a scaffold that pulls in a dependency it does not
exercise is harder to read, not easier.

## The migration

This is a **strangler fig**, not a rewrite.

```
             ┌─────────────────────┐
GET /v1/*  → │  mzizi-api-gateway  │ ── native ──→  answered here
             │   api.mzizi.dev     │
             └──────────┬──────────┘
                        └── proxied ──→  mzizi.dev/api/v1  (Next.js, Vercel)
```

Every route is served from day one. A route implemented natively is answered
here; everything else is forwarded unmodified to the origin. Routes move from
proxied to native one at a time, and callers never see the difference.

Two things make that safe to do incrementally:

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

| Route | Notes |
|---|---|
| `GET /v1/health` | The gateway's own liveness. Native on purpose — proxying it would report the origin's health while saying nothing about whether the gateway in front of it is up. |

### Proxied

Everything else, including routes not enumerated here — a new route added to the
origin works through this Worker without a change. The current surface:

`/v1` · `/v1/ai/instructions` · `/v1/architecture` · `/v1/architecture/nodes/[n]` ·
`/v1/brand` · `/v1/changelog` · `/v1/data-layer` · `/v1/docs` · `/v1/ecosystem` ·
`/v1/health` · `/v1/pipeline` · `/v1/rs/[name]` · `/v1/samples` · `/v1/search` ·
`/v1/skills` · `/v1/skills/[name]` · `/v1/skills/summary` · `/v1/sovereignty` ·
`/v1/stats` · `/v1/ui`

Note `/v1/architecture/frontend/axes` and `/v1/architecture/frontend/layers`
answer **410 Gone** at the origin — the retired axis model, replaced by the DNA
double helix at `/v1/architecture`. They are proxied like anything else, so the
410 is preserved rather than becoming a 404 here.

### Suggested order

The routes the console actually calls are the ones whose latency and
availability a user sees, so they are the ones worth porting — but check where a
route's data actually lives before picking it up. Measured 2026-09-11:

| Candidate | Real data source | Portable? |
|---|---|---|
| `/v1/ui` | `registry.json` + `lib/registry.generated.ts` | **No** — see [Data](#data) |
| `/v1/architecture` | `content/doctrine/**` via `lib/doctrine.ts`; only the node counts are Supabase | **No** — the helix is files |
| `/v1/brand` | `brand_minerals`, `brand_semantic_colors`, `brand_typography`, `brand_spacing`, `brand_ecosystem`, `brand_meta` | **Yes** — start here |

**`/v1/brand` is the one to port first.** All six views return `200` to the anon
key, with row counts matching the live response, and the response is ~24 KB. Two
caveats to handle rather than discover: `heritage` and `experimental` come from
`lib/tokens/palette.generated` (7 entries each, generated from `app/globals.css`
by `pnpm tokens:sync`), and `radii`, `accessibility`, `voiceAndTone` and
`philosophy` are literals in the route file. Both are small, but both are
*copies* — the fixture round-trip is what keeps them honest.

[`CONTRIBUTING.md`](CONTRIBUTING.md) has the step-by-step: find the real data
source, capture the fixture, implement, round-trip the fixture against your
production types, move the arm in the router, update the table above.

## Data

**This section previously said that ported routes read Supabase
(`component_documents`) directly, "the same source the Next.js handlers use via
`lib/db`". Measured against the origin, that is false, and it is the kind of
plausible-but-wrong claim that costs a day — so here is what is actually true.**

The registry is **not in the database**. `docs/db-contents-rule.md` in
`mzizi-dev/mzizi-registry` records the owner's decision of 2026-08-04:

> The DB only exists for version history, node counts, fundi-related logging,
> the issue log and the self-healing log. [...] **Everything else is in the
> repo.**

The test is *who writes it*: a script, a release, or telemetry writes to the
database; a human writes to a file. So the content routes read files compiled
into the origin's Vercel bundle — `registry.json` for components,
`content/doctrine/**` for the helix — through `lib/registry.ts` and
`lib/doctrine.ts`. Several route docblocks still say `component_documents`; they
predate the migration and have not caught up.

What that means for this Worker: **a route whose data is a file in another
repository's build output cannot be ported here at all**, because there is no
source this Worker can read that is the same source. Reading Supabase instead
and hoping the two agree is precisely the failure the fixture rule exists to
catch — see [`/v1/ui`](#the-v1ui-index) below.

Where a route *is* genuinely database-backed, it reads Supabase with the anon
key under RLS. There is no service-role credential in this Worker and there
should never be one: the registry is public, read-only data.

### The `/v1/ui` index

Measured 2026-09-11 and left proxied deliberately. `GET /api/v1/ui` projects
eleven fields per item from `registry.json`, joined to the file listing in
`lib/registry.generated.ts` (which is where `node` and `nodeLabel` come from —
derived from the directory a component's file lives in, so they cannot disagree
with where the code is).

It is not reconstructible from `component_documents`:

| | Origin response | `component_documents` |
|---|---|---|
| Items | 575 | 3,062 rows / 1,580 distinct names |
| `title` present | 575 / 575 | 100 / 3,062 |
| `categories` present | 575 / 575 | **0 / 3,062** |
| `type` present | 575 / 575 | 3 / 3,062 |

Four of the 575 names do not exist in the table at all, and 1,009 names in the
table must not appear in the index. `categories` — required on every item — is
on no row anywhere. Porting this route means first moving the registry index
into the database, which is a decision the origin repo has explicitly taken in
the opposite direction.

## Local development

```bash
cargo check --target wasm32-unknown-unknown --all-targets
cargo clippy --target wasm32-unknown-unknown --all-targets -- -D warnings
cargo fmt --all -- --check

# worker-build's minor version must match the `worker` dependency in Cargo.toml
# — they are released in lockstep, and the build tool derives the wasm-bindgen
# CLI it downloads from the version in Cargo.lock. A mismatched pair fails with
# "linked against a different version of wasm-bindgen".
cargo install -q worker-build --version ^0.8
worker-build --release          # the real artefact

npx wrangler dev                # serve it locally
npx wrangler deploy --dry-run   # validate the config without deploying
```

## Deployment

Cloudflare Workers Builds, on push to `main`. The custom-domain route provisions
`api.mzizi.dev` on the first successful production deploy, since the zone is on
Cloudflare.

Worth knowing before touching `wrangler.jsonc`: **Workers Builds previews upload a
version without applying routes**, so a route error is only caught on the
production deploy — the same commit reads green on a PR and red on `main`. That
form silently broke two Workers in this org already, which is why the route here
is a bare hostname with no `/*` and no `zone_name`.

## Contributing

[`CONTRIBUTING.md`](CONTRIBUTING.md) — how to port a route, the build and its
two version-lockstep traps, the `wrangler.jsonc` rules that only fail on
production, and the merge-only convention.

[`SECURITY.md`](SECURITY.md) · [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md)

## Licence

Apache-2.0.
