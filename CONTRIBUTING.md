# Contributing

`api.mzizi.dev` is a **strangler fig** around the Next.js registry API. Almost
every change to this repo is one of two things: porting a route from proxied to
native, or keeping the build honest. This file covers both, and the handful of
configuration rules that have already cost this org a broken deploy.

- [The strangler fig](#the-strangler-fig)
- [Porting a route](#porting-a-route)
- [The build](#the-build)
- [`wrangler.jsonc` rules that bite](#wranglerjsonc-rules-that-bite)
- [Pull requests](#pull-requests)
- [Code of conduct](#code-of-conduct)

## The strangler fig

```
             ┌─────────────────────┐
GET /v1/*  → │  mzizi-api-gateway  │ ── native ──→  answered here
             │   api.mzizi.dev     │
             └──────────┬──────────┘
                        └── proxied ──→  mzizi.dev/api/v1  (Next.js, Vercel)
```

Every route is served from day one. A route this Worker implements natively is
answered here; everything else is forwarded unmodified to the origin. Routes
move from proxied to native **one at a time**, and callers never see the
difference.

Two properties make that safe to do incrementally:

- **The API is read-only.** Every `/v1/*` route is a `GET`. There is no write
  path to keep consistent across two implementations, which is what usually
  makes a strangler fig expensive. Non-`GET` gets a `405` here rather than
  reaching the origin at all.
- **A ported route is provably identical, or it is not ported.** Fixtures are
  captured live responses, so an implementation is checked against what the
  origin *actually returns* — never against what this repo believes it returns.

That second property is not theoretical. The Svelte console that preceded
`mzizi-console` had types that were self-consistent and wrong, and rendered
empty against a "healthy" API for weeks. **A route that returns subtly wrong
JSON is worse than one that is still proxied**, because the proxy is at least
never wrong. If a port cannot be made byte-identical, leave it proxied and say
why.

## Porting a route

Five steps, in this order. Step 0 is the one people skip, and it is the one that
kills ports.

### 0. Find out where the data actually is

**Do not assume the origin reads Supabase.** Open the route handler in
[`mzizi-dev/mzizi-registry`](https://github.com/mzizi-dev/mzizi-registry) —
`app/api/v1/<route>/route.ts` — and follow what it calls in `lib/` down to the
actual source.

The registry deliberately does **not** live in the database. `docs/db-contents-rule.md`
in that repo records the owner's decision of 2026-08-04:

> The DB only exists for version history, node counts, fundi-related logging,
> the issue log and the self-healing log. Subscriptions and customer data live
> in their own store. **Everything else is in the repo.**

The test is *who writes it*: a script, a release, or telemetry writes to the
database; a human writes to a file, where a diff and a reviewer can see it. So
the content routes read files that are compiled into the Vercel bundle —
`registry.json` and `content/doctrine/**` — not rows. A route whose docblock
still says `component_documents` may simply predate that migration; several do.

This matters because **a route backed by a file in another repo's build output
is not portable to this Worker at all**. Reading a different source and hoping
it agrees is exactly the failure mode the fixture rule exists to catch. If you
land here, stop and open an issue rather than shipping a near-match.

### 1. Capture the fixture, before writing anything

```bash
mkdir -p tests/fixtures
curl -s https://mzizi.dev/api/v1/<route> > tests/fixtures/<route>.json
```

Capture it *first*. A fixture captured after the implementation exists is a
fixture unconsciously shaped to agree with it.

Record the capture date in the test that reads it. Fixtures go stale; a stale
fixture that fails loudly is fine, one that nobody can date is not.

### 2. Implement it

Add a module under `src/`, and keep the projection explicit — name every field
the origin emits, in the order it emits them. Serialising a struct you inferred
from three sample items is how `type` and `registryDependencies` silently
vanished from the origin's own index for months.

Notes:

- `serde` field order is the struct's declaration order, so declare in the
  origin's order.
- The origin's `NextResponse.json` drops `undefined` keys. Match that with
  `#[serde(skip_serializing_if = "Option::is_none")]`, not with `null`.
- Where the origin reads Supabase, use the **anon / publishable key only** —
  the URL and key are public by design (see
  `mzizi-dev/agent-tools/mzizi-mcp/src/defaults.ts` for the values and the
  reasoning). **Never put a service-role key in this Worker.** There is no
  write path here and there should never be one.

### 3. Test against the fixture

Decode the captured fixture with your **production** types — not a test-only
mirror of them. The point is to prove the types you ship can round-trip what the
origin sends.

```rust
#[test]
fn ui_fixture_round_trips() {
    let raw = include_str!("fixtures/ui.json");
    let parsed: UiIndex = serde_json::from_str(raw).expect("fixture decodes");
    let reserialised = serde_json::to_value(&parsed).unwrap();
    let original: serde_json::Value = serde_json::from_str(raw).unwrap();
    assert_eq!(original, reserialised, "projection is not byte-identical");
}
```

Round-tripping is the assertion that matters. Decoding alone proves only that
you did not *reject* the origin's JSON — `serde` ignores unknown fields by
default, so a type missing half the response still decodes it happily. Comparing
the re-serialised value against the original is what catches the dropped field.

`cargo test` runs on the host target, so keep fixture tests free of `worker`
types.

### 4. Move it in the router

In `src/lib.rs`, move the path from the `_ =>` proxy arm up into the native
block:

```rust
match path.as_str() {
    // ── native ──────────────────────────────────────────────
    "/v1/health" => cors(health()?),
    "/v1/<route>" => cors(<route>(&req).await?),

    // ── proxied ─────────────────────────────────────────────
    _ => cors(proxy(&req).await?),
}
```

Leave the proxy fallback untouched. It is what makes a route added at the origin
work here without a change.

### 5. Update the README table

Move the route from **Proxied** to **Ported** in `README.md`, with a one-line
note on anything a caller could notice. A ported route that still reads as
proxied in the table is how the next person ports it twice.

## The build

There is no `package.json`; wrangler is invoked through `npx`.

```bash
cargo fmt --all -- --check
cargo clippy --target wasm32-unknown-unknown --all-targets -- -D warnings
cargo check --target wasm32-unknown-unknown --all-targets
cargo test

cargo install -q worker-build --version ^0.8
worker-build --release          # the real artefact
npx wrangler deploy --dry-run   # validate the config without deploying
```

Clippy and `check` run against `wasm32-unknown-unknown` rather than the host: the
`worker` crate's API is `cfg`'d for that target, so a host-only pass checks code
the Worker never runs.

### worker-build must track the `worker` crate — in two files

Since workers-rs **0.7** the library and the build tool are released in
lockstep, and `worker-build` refuses to run against a library outside its own
minor line. There is a second, less obvious reason the pin matters:

- **worker-build `0.8`** reads the resolved `wasm-bindgen` version out of
  `Cargo.lock` and downloads exactly that CLI.
- **worker-build `0.1`** hard-codes the CLI it fetches (`0.2.105`), with no
  knowledge of what the crate actually compiled against.

`wasm-bindgen` refuses to process a module produced by a different version of
itself, so `worker-build ^0.1` against `worker 0.8` — which resolves
`wasm-bindgen 0.2.128` — could only ever fail, with
`linked against a different version of wasm-bindgen`. **This was the repo's
first bug.**

The version therefore appears in two places, and they must stay **identical**:

| File                         | Field           |
| ---------------------------- | --------------- |
| `.github/workflows/ci.yml`   | the `worker-build` step |
| `wrangler.jsonc`             | `build.command` |

`wrangler.jsonc`'s `build.command` is what **Cloudflare Workers Builds actually
runs**. CI does not run it. So if the two drift, CI stays green and the deploy
breaks. Change both or neither.

### `strip = "debuginfo"`, never `strip = true`

`strip = true` is an alias for `strip = "symbols"`, which makes rustc pass
`--strip-all` to `wasm-ld` — and `wasm-ld`'s `--strip-all` skips writing three
synthetic custom sections: `name`, `producers`, and **`target_features`**.

Losing `target_features` is the fatal one. It is where the module advertises
`reference-types`, and that advertisement is the *only* signal `wasm-bindgen`
uses to decide whether to run its externref transform. Stripped, the transform
is silently skipped, no externref table is emitted, and the build dies two
passes later with an error that names neither `strip` nor `target_features`:

```
error: failed to generate catch wrappers
Caused by: externref table required for catch wrappers
```

Those `catch` wrappers are not optional here: `worker-build` invokes
`wasm-bindgen` with `--force-enable-abort-handler`, so every workers-rs build
takes that path. Upstream knows (cloudflare/workers-rs#1014, wasm-bindgen#5205)
and neither fix has shipped.

`"debuginfo"` maps to `--strip-debug`, which drops the `.debug_*` sections and
leaves the other three alone. It is also right on its own merits: `observability`
is enabled in `wrangler.jsonc`, and the `name` section `strip = true` was
discarding is what turns a stack trace in those logs into function names instead
of indices.

The full reasoning is in the comment above the `[profile.release]` block in
`Cargo.toml`. Read it before changing that line.

## `wrangler.jsonc` rules that bite

### A custom domain takes a bare hostname — nothing else

```jsonc
"routes": [
  { "pattern": "api.mzizi.dev", "custom_domain": true },
],
```

- **No `/*`.** Wildcards are rejected outright ("Wildcard operators (*) are not
  allowed in Custom Domains"), and a custom domain already routes every path on
  the hostname, so it is invalid *and* redundant.
- **No `zone_name`.** It is inferred, and only means anything on a
  non-custom-domain route.

The reason this deserves its own section: **Workers Builds previews upload a
version WITHOUT applying routes.** A bad route is therefore only validated on
the *production* deploy — the same commit reads green on the PR and red on
`main`. That form silently broke two Workers in this org already (`mzizi-mcp`,
agent-tools#102, and the console, which never deployed at all). A green PR is
not evidence that the route is valid.

## Pull requests

### Merge-only

Squash and rebase merging are **disabled org-wide**
([`mzizi/MIGRATION.md` §1.1](https://github.com/mzizi-dev/mzizi/blob/main/MIGRATION.md)):
squash discards the per-commit reasoning this project depends on, and the
ecosystem convention is that history stays truthful.

```bash
gh pr merge <n> --merge --delete-branch
```

Write commit messages that are worth keeping, since they are kept: what changed,
and *why* — especially why the obvious alternative was not taken. Most of the
load-bearing knowledge in this repo lives in commit messages and code comments
rather than in a wiki.

### CI gates

All three jobs must be green before merge:

| Job            | What it proves                                                              |
| -------------- | --------------------------------------------------------------------------- |
| `rust`         | `fmt`, `clippy -D warnings` and `check` on wasm32, plus `cargo test`        |
| `worker build` | `worker-build --release` produces something `wrangler deploy --dry-run` accepts |
| `secret scan`  | `gitleaks` finds no credential in the diff or the history                   |

`rust` and `worker build` are separate claims on purpose: `cargo check` proves
the crate compiles; only `worker-build` proves it can be turned into an artefact
wrangler will accept, and that is the one that fails at deploy time.

The `pull_request` trigger covers `main` **and** `claude/**`, so stacked PRs —
which target the branch below them rather than `main` — get checks instead of
silently getting none.

### Deployment

Cloudflare Workers Builds, on push to `main`. The custom-domain route provisions
`api.mzizi.dev` on the first successful production deploy, since the zone is on
Cloudflare. There is nothing to run by hand.

## Code of conduct

By participating you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).
Security issues go through [SECURITY.md](SECURITY.md), not a public issue.

## Licence

Contributions are accepted under [Apache-2.0](LICENSE), the repo's licence.
