# Changelog

All notable changes to `mzizi-api-gateway`, the Worker that serves
[api.mzizi.dev](https://api.mzizi.dev/v1/health), are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
The Worker deploys on every merge to `main` and publishes no versioned
releases, so sections are dated by the day the change merged (UTC), newest
first. Within a section, entries sit under Added, Changed, Deprecated, Removed,
Fixed or Security, and a breaking change is marked **Breaking**.

**The rule (owner, 2026-09-30):** every pull request that changes behaviour, an
API response, a dependency, a default, the registry pin or a documented fact
adds an entry under `## [Unreleased]` in the same pull request. The
`changelog / entry required` check fails a pull request that doesn't. Two
exemptions: the registry-pin bot's own pull request on `bot/registry-pin`,
which changes only `scripts/registry-ref.json` and lists the registry commits
in its body, and pull requests labelled `no-changelog` (pure CI, lint or typo
changes). When a dated section is cut, the Unreleased entries move under it.

To see which registry commit production is serving, read the
`X-Mzizi-Source` header on any response.

## [Unreleased]

### Changed — the registry pin moves past the registry's Next.js app (2026-10-02)

- **The registry pin moves to mzizi-registry `a38a4d8`** (main, after
  mzizi-registry#389 and #391, which removed the registry's Next.js app and its
  `mzizi-api` Worker). One string the API serves changes: the `mzizi-tokens`
  description now says the tokens are generated from `styles/globals.css` in
  mzizi-dev/mzizi-registry, so the theme and the stylesheet it is read from
  cannot disagree (it said `app/globals.css`, so the registry and the site
  cannot disagree). It appears on `/v1/ui`, `/v1/ui/mzizi-tokens`,
  `/v1/ui/mzizi-tokens/docs` and anywhere else the item's description is
  listed or searched. No other field of any answer changes.
- **The build no longer imports the registry's `app/` tree.** `scripts/extract.ts`
  checks `/v1/search`, the discovery document, `/v1/ui/{name}/docs`,
  `/v1/ui/{name}/versions`, `/v1/ai/instructions/{name}` and `/v1/rs/{name}`
  against the registry's route handlers, which #389 deleted. Those six
  handlers are now ported, unchanged but for formatting, from the registry's
  last commit with them (`270af9f`) into `scripts/registry-handlers/`. They still
  call the pinned registry's own `lib/` readers, so the check is the same
  1,289 search probes and 1,168 handler answers as before. At `270af9f` the
  ported check produces byte-identical `src/data/`.

### Security — undici 7.29.1 (2026-10-02)

- **`undici` 7.29.0 → 7.29.1 and `wrangler` 4.142.0 → 4.147.0** (development
  dependencies; supersedes dependabot's mzizi-api-gateway#28). undici 7.29.1
  fixes two high-severity advisories (GHSA-w293-vg96-wgc3: `BalancedPool`
  could drop custom TLS validation callbacks; GHSA-rfgv-xxqx-mfg5: an
  unrequested WebSocket subprotocol could crash the process) and several
  medium and low ones. undici reaches this repository only through wrangler
  and miniflare, for `wrangler dev` and the build; it is not in the Worker
  bundle, so nothing `api.mzizi.dev` serves changes.

### Changed — lint runs once, from the org-required workflow (2026-10-03)

- **Removed `.github/workflows/lint.yml`.** The `mzizi-dev` org ruleset now runs the shared lint on every pull request through `mzizi-dev/.github`'s `org-lint.yml`, publishing the same five `lint / …` checks, so the repo's own caller only ran lint a second time.

### Added

- `CHANGELOG.md`, backfilled from every merged pull request since the
  repository began (2026-09-09).
- The `changelog / entry required` check (`.github/workflows/changelog.yml`,
  `scripts/changelog-gate.sh`), which fails a pull request that changes a
  non-exempt file without adding to this file. `scripts/changelog-gate.test.sh`
  tests the gate, and the check runs it first. The registry-pin bot's own
  pull request is exempt only while it changes nothing but the pin; a bump that
  someone takes over to port a handler change needs an entry like any other.

### Changed

- **`/v1/skills` serves `@nyuchi/mzizi-skills` 0.8.5**, with the same five
  skills and `meta.version` `0.8.5`. The skills now follow language main
  `62a0f32`:
  - `mzizi-language` says to check `LANGUAGE-TRACKER.md` before claiming a
    capability. It teaches the backend `service` (RFC-0011), `mz contract` on
    a service, `mz build` and the MZ08xx codes, and cites RFC-0012 (the
    harness, a draft) and charter v0.4.
  - `mzizi-backend` describes the language's one backend slice: no Workers
    target, and nothing live.
  - `mzizi-roots` says only a service lowers, not a component.

  The `mzizi-language` and `mzizi-backend` descriptions change too.
  `mzizi-design` and `discoverability` are unchanged. The registry pin moves
  to mzizi-registry `270af9f` (registry #387). Strict parity against
  production showed 8 differences, all on `/v1/skills*`.

- **`/v1/skills` serves `@nyuchi/mzizi-skills` 0.8.4**: the same five
  skills and descriptions, with `meta.version` `0.8.4`. Three bodies now
  describe Mzizi as a programming language:
  - `mzizi-language` opens with Mzizi as a general-purpose programming
    language built to make Rust better, the way TypeScript makes JavaScript
    better. It tells the language, the harness at its core and the toolchain
    apart, and states its goals as goals, not results.
  - `mzizi-roots` says Roots is the language's component model, not the
    language.
  - `mzizi-design` names the language and its toolchain first in the
    ecosystem identity.

  `mzizi-backend` and `discoverability` are unchanged (registry #386).

- **`/v1/ui/mzizi-tokens-globals` gains a `-text` token per colour family**,
  the value to use as text on `--base`: `--mineral-*-text`,
  `--heritage-*-text`, `--exp-*-text` and their `--color-*-text` aliases, in
  both themes. Every existing token keeps its value (registry #385).
- The registry pin moves to mzizi-registry `43446ab` (registry #385, #386).
  Strict parity against production showed 9 differences: the eight
  `/v1/skills*` requests and `/v1/ui/mzizi-tokens-globals`.
- The registry pin bot reads the Actions secret `RELEASE_BUMP_TOKEN`, not
  `PIN_BUMP_TOKEN`, the name the owner is creating. The workflow,
  `scripts/registry-pin-bump.mjs` (still byte-identical to agent-tools' copy),
  README and SECURITY.md use the new name. Until the secret exists, every run
  warns and does nothing, as before.

- **`/v1/skills` serves `@nyuchi/mzizi-skills` 0.8.2**, the same five skills,
  with `meta.version` `0.8.2`. `mzizi-design` now has the Mzizi row
  (hematite, Root) in its brand constellation, says hematite is a Heritage
  tone, and says copper is the ecosystem layer rather than Mzizi's own
  surfaces. Its description changes to match. `mzizi-roots` adds "a Mzizi
  surface = hematite" to its `--brand-accent` examples. `discoverability`'s
  OG image guidance names the brand's colour. `mzizi-language` and
  `mzizi-backend` are unchanged. The registry pin moves to mzizi-registry
  `06389e5` (registry #384). Strict parity against production showed 8
  differences, all on `/v1/skills*`.
- **`/v1/ui/mzizi-tokens-globals`: mzizi's default `--primary` is hematite.**
  The stylesheet sets `--primary: var(--heritage-hematite-aa)`, where it was
  `var(--mineral-gold-aa)`. That covers both the default and the
  `[data-brand="mzizi"]` block, and the value is read from the `/v1/brand`
  mzizi row. A page that loads this stylesheet without setting `data-brand`
  now gets hematite instead of gold. The registry pin moves to mzizi-registry
  `e1c1c89` (registry #380, #382, #383). #382 and #383 change nothing the API
  serves. Strict parity against production showed 1 difference, on that item.
- **`/v1/skills` serves `@nyuchi/mzizi-skills` 0.8.1**, the same five skills.
  `meta.version` is `0.8.1`, and each skill's `source` names the repository
  that holds it, `mzizi-dev/agent-tools/mzizi-skills/skills/<name>` (it said
  `mzizi-tools/mzizi-skills/skills/<name>`). `mzizi-roots` now points at the
  public Claude Code plugin (`/plugin marketplace add mzizi-dev/mzizi-registry`,
  `/plugin install mzizi@mzizi`) instead of the private agent-tools one. The
  registry pin moves to mzizi-registry `bcb9b57` (registry #378, #379, #381).
- **`/v1/brand` lists mzizi in the ecosystem table**: meaning Root, Swahili,
  mineral hematite (registry #378).
- **`/v1/architecture` and `/v1/architecture/nodes/12`**: the N12 skills rung
  now says skills are authored in `mzizi-dev/agent-tools` and served from the
  published package, with no database copy (registry #381).
- **`/openapi`**: the `/skills` docs drop the retired `nyuchi-design skills`
  CLI subcommands, and the skill-name example is `mzizi-design` (registry #381).
- Strict parity against production showed 16 differences, all on those four
  route families. `EXPECTED` in `scripts/parity.mjs` now holds only this bump's
  reasons.
- The registry-pin bot (`registry-pin-bump.yml`) also re-checks its pull
  request when the Changelog workflow finishes, so a bump never waits an hour
  for that check.

### Fixed

- README, "Registry pin bump", lists **Checks: Read-only** and **Commit statuses:
  Read-only** for `RELEASE_BUMP_TOKEN`. The bot reads a bump's check runs and
  status before merging; without them it fails with a 403.

## [2026-09-30]

### Changed

- **`/v1/skills` serves `@nyuchi/mzizi-skills` 0.8.0: five skills**
  (`mzizi-language`, `mzizi-roots`, `mzizi-design`, `mzizi-backend`,
  `discoverability`). The registry pin moves to mzizi-registry `eb4935e`
  (registry #377). **Breaking:** the eight 0.5.1 skill names that 0.8.0 no
  longer carries now answer 404 at `/v1/skills/{name}`. Strict parity against
  production showed 13 differences, all under `/v1/skills`. (#18)
- The code of conduct names `support@bundu.org` as the reporting address.
  Security reports stay at `security@bundu.org`. (#17)
- **`/v1/rs/{name}` names the crate that compiles each component**, instead of
  `mzizi-ui` for every one, and adds a `git` field. The pin moves to
  mzizi-registry `9b86e03`, which also brings the first Mzizi Roots batch:
  twelve N3 brand components that answer `/v1/rs/{name}` with 200 where they
  answered 404. `/v1/rs/{name}` is now checked against the registry's own
  handler for every component at build time. (#15)

### Added

- **The registry pin moves by itself.** `registry-pin-bump.yml` keeps one bot
  pull request on `bot/registry-pin` that sets `scripts/registry-ref.json` to
  mzizi-registry `main`. It merges (rebase) only when it is the bot's single
  commit, changes only the pin, moves forward along registry `main`, and every
  check on it is green; otherwise it waits for review. It needs the
  `PIN_BUMP_TOKEN` secret and does nothing without it. (#16)
- The Parity workflow runs on every pull request that changes the pin, or
  parity itself, against production, in `--strict` mode unless the pull request
  edits `scripts/parity.mjs`. (#16)

## [2026-09-29]

### Changed

- **Search filters on `node` and `category`** (combined with AND), and each hit
  carries `name`, `type`, `title`, `description`, `categories`, `node` and
  `nodeLabel`. It used to filter on fields no registry item carries, so the
  filters matched nothing. `?layer=` is **deprecated**: it still works as an
  alias of `?node=`, and its responses carry `meta.deprecation` and a
  `Deprecation: true` header. The discovery document describes the data as
  files (`data: { source: "files", repository, components }`) and names Mzizi
  as the operator. The pin moves to mzizi-registry `ce68c64` (registry #373).
  (#14)
- **`/v1/ui/{name}/docs`, `/v1/search` and `/v1/ai/instructions/{name}` answer
  from the registry's files** instead of `503 {"error":"Database not
configured"}`. `/v1/ui/{name}/versions` still answers 503, and its body now
  says why: version history is console-owned data and this API has no
  database. The pin moves to mzizi-registry `f19bb0b`. (#13)
- `wrangler.jsonc` declares `api.mzizi.dev` as this Worker's custom domain, so
  every production deploy keeps it. The owner moved the domain from the
  mzizi-registry Worker to this one on 2026-09-29; parity after the move was
  1,359 requests with 0 unexplained differences. (#12)

### Added

- **A Hono Worker serves the whole public `/v1` API itself**, from registry
  data generated at a pinned mzizi-registry commit (`scripts/registry-ref.json`)
  and bundled into the Worker. It has no origin, no database and no Supabase.
  It keeps the contract api.mzizi.dev served: both `/v1` and `/api/v1`, the
  same query parameters, status codes, bodies and CORS, cache and security
  headers, the `nyuchi-*` to `mzizi-*` 308 redirects and the 410s.
  `scripts/parity.mjs` compares all of it with production. Every response
  carries `X-Mzizi-Source: mzizi-api-gateway; registry=<commit>`, and
  `/.well-known/security.txt` names `security@bundu.org`. (#11)

### Removed

- **Breaking for contributors:** the retired `workers-rs` Rust proxy
  (`Cargo.toml`, `src/lib.rs`) and its build configuration. (#11)

### Security

- A path with repeated leading slashes (`//evil.com/`) no longer produces a
  protocol-relative `Location` on the trailing-slash redirect, which a browser
  would have followed off-site. Repeated slashes are collapsed first, as the
  registry's Next.js host does. (#11)

## [2026-09-27]

### Changed

- README and AGENTS.md: Mzizi owns and operates the gateway, the framework,
  the registry and the docs; Nyuchi runs the console and the revenue side. The
  Bundu Foundation is no longer named as owner. (#9, #10)
- The README's Docs link points at docs.mzizi.dev. (#8)
- The README is split: the human narrative stays in `README.md`, and the
  commands, deployment mechanics and honesty rules move to a new `AGENTS.md`.
  (#8)

## [2026-09-26]

### Fixed

- The Rust proxy answered 500 on every proxied route, because it tried to add
  CORS headers to the runtime's immutable response headers. It now copies
  status, headers and body into a new response. Its origin also moved from the
  apex (which was becoming the static site) to the mzizi-registry Worker. (#6)
- The proxy no longer forwards the origin's `Content-Encoding` and
  `Content-Length` on a body it has already decompressed. (#7)

## [2026-09-11]

### Added

- `CONTRIBUTING.md`, `SECURITY.md` and `CODE_OF_CONDUCT.md` (Contributor
  Covenant 2.1). (#2)
- The org lint gate (`lint / actionlint`, `lint / JSON validity`,
  `lint / prettier`, `lint / markdownlint`, `lint / yamllint`) and its config
  files, later brought in line with the current org canon. (#3, #5)

### Fixed

- The README no longer says ported routes read Supabase: the registry's data
  is its files. It also says api.mzizi.dev was answered by the registry's own
  Worker, not this one, at the time. The origin repository is named as
  mzizi-dev/mzizi-registry, not mzizi-dev/mzizi (the language). (#2, #4)

## [2026-09-09]

### Added

- The first version: a `workers-rs` Worker for api.mzizi.dev that answered
  `/v1/health` itself, forwarded every other read-only `/v1` route to the
  registry, and answered 405 to anything but GET. It was replaced by the Hono
  Worker on 2026-09-29.

### Fixed

- `worker build` now uses a `worker-build` version that matches the `worker`
  0.8 library, and the release profile strips only debug info, so wasm-bindgen
  can generate its catch wrappers. (#1)
