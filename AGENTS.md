# AGENTS.md — mzizi-api-gateway

> Vendor-neutral instructions for any AI agent working in this repository. See
> [`README.md`](./README.md) for the strangler-fig migration story and current route status,
> and [`CONTRIBUTING.md`](./CONTRIBUTING.md) for the step-by-step route-porting process.

## What this repo is

A pure-Rust Cloudflare Worker (`workers-rs`), meant to front `api.mzizi.dev` — the Mzizi
registry API, currently served by ~30 Next.js route handlers in `mzizi-registry`. It is a
**strangler fig, not a rewrite**: every route is served from day one, natively where ported
and proxied unmodified to the origin everywhere else. **Read README's "Status" section
before touching deployment** — this repo is not currently the thing answering
`api.mzizi.dev`, and deploying it in that state would replace a working API with a proxy to
an origin that 404s.

## Build, test, run

```bash
cargo check --target wasm32-unknown-unknown --all-targets
cargo clippy --target wasm32-unknown-unknown --all-targets -- -D warnings
cargo fmt --all -- --check
cargo install -q worker-build --version ^0.8
worker-build --release
npx wrangler dev              # serve locally
npx wrangler deploy --dry-run # validate config without deploying
```

**`worker-build`'s minor version must match the `worker` dependency in `Cargo.toml`** — the
two are released in lockstep, and `worker-build` derives the `wasm-bindgen` CLI it downloads
from the version resolved in `Cargo.lock`. A mismatched pair fails with "linked against a
different version of wasm-bindgen". Keep the pinned `worker-build` version identical to
`build.command` in `wrangler.jsonc` — that's what Cloudflare Workers Builds actually runs,
and drift there fails the deploy while leaving CI green.

## Porting a route

`CONTRIBUTING.md` has the full procedure. The two invariants that make it safe:

- **The API is read-only.** Every `/v1/*` route is a `GET`; non-`GET` requests get a `405`
  here rather than reaching the origin. No write path to keep consistent across two
  implementations.
- **A ported route is provably identical, or it isn't ported.** Fixtures are captured live
  responses — round-trip your native implementation against a real captured fixture, not
  against what you believe the origin returns. Check where a route's data actually lives
  first (see "Data" in README) — a route whose source is a database table this Worker can't
  read, or a file compiled into another repo's build output, cannot be ported here at all.

## Deployment — read this before touching `wrangler.jsonc` or `routes`

Cloudflare Workers Builds, on push to `main`. `wrangler.jsonc` declares `api.mzizi.dev` as a
custom-domain route — a **bare hostname**, no `/*` and no `zone_name` (the three-field form
silently broke two other Workers in this org already).

**Workers Builds previews upload a version without applying routes**, so a route error is
only caught on the production deploy — the same commit reads green on a PR and red on
`main`.

**Before deploying to production, read README's "Status" section.** A custom domain on a
hostname something else already serves **takes** that hostname; that's exactly what
happened to the `mzizi.dev` apex (see
[`mzizi-site`](https://github.com/mzizi-dev/mzizi-site#readme)) and this repo's own `ORIGIN`
constant in `src/lib.rs` currently points at an address that 404s.

## Merge convention

This repository is rebase-only: `allow_rebase_merge` is `true`, `allow_merge_commit` and
`allow_squash_merge` are both `false` (read off the GitHub API 2026-09-12, org-wide).
`CONTRIBUTING.md` still describes the merge-commit convention that preceded this — the live
API is the authority. Land changes with `gh pr merge <n> --rebase --auto`. Never `--admin`.

## Honesty rules

- **No database behind the registry.** It's disk — `registry.json` and
  `content/doctrine/**` compiled into the origin's build output, read through
  `lib/registry.ts`/`lib/doctrine.ts`. Any claim that Supabase, D1, or any database is the
  source of truth for components, brand, or tokens is wrong and should be deleted, not
  softened. D1 exists only for the MCP server and fundi logging.
- **"Axis", "axes" and "layer" are retired vocabulary.** The architecture is the DNA double
  helix — 8 nodes, 4 rungs, 6 strands. Those words survive only in two legacy route names
  (`/v1/architecture/frontend/{axes,layers}`, both proxied 410s) — not in prose.
- **The palette is 21 colour families** — minerals, heritage, experimental, seven each. Not
  five, not seven as the whole set.
- **Canonical install form is `/v1/ui/<name>`, never `mzizi.dev/api/v1/...`** — that host no
  longer serves the API at all.
