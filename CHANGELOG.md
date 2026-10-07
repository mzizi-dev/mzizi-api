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

### Changed — the registry pin moves to mzizi-registry `main` at `81a37ed` (v4.7.0) (2026-10-07)

- **The registry pin moves from `0caf9dc` (v4.6.0) to `81a37ed`**, registry
  `main` at v4.7.0 (mzizi-registry#467), which adds #465 and #466. It goes
  through `staging` in place of the bot's #67.
- **No component is added or removed** and no status moves.
- **Changed content:** `markdown-renderer` 1.1.0 (`/v1/ui/markdown-parse`,
  `/v1/rs/markdown-renderer`): link addresses with a control character,
  whitespace or credentials are refused, and rich-text lists stay nested with
  `<ol start>`. The v4.7.0 record leads `/v1/changelog`.
- **`scripts/parity.mjs` `EXPECTED`** lists the 4 differences; the 0caf9dc
  entries are in #65.

### Changed — the registry pin moves to mzizi-registry `main` at `0caf9dc` (v4.6.0) (2026-10-07)

- **The registry pin moves from `9f3631c` (v4.5.0) to `0caf9dc`**, registry
  `main` at v4.6.0 (mzizi-registry#464), which adds #455, #459, #461, #462 and
  #463. It goes through `staging`, as #60 did, in place of the bot's #64.
- **One component is added**: `markdown-parse` (registry:lib, node 2), the
  parser `markdown-renderer` now depends on (656 components, 388 on node 2).
- **One status moves**: `/v1/rs/markdown-renderer` 404 → 200, its new Rust
  build (`mzizi_ui::MarkdownRenderer`). `/v1/ui/markdown-renderer` serves the
  safe-by-construction React build (no `dangerouslySetInnerHTML`), and
  `/v1/astro/markdown-renderer` its new Astro build.
- **Changed content:** `app-brand-mark` renders the Mukoko mark (#459, so its
  `/v1/astro` document carries four images; `test/api.test.ts` expects four);
  `mzizi-tokens-globals` carries the container utilities (#455); the v4.6.0
  record leads `/v1/changelog`.
- **`scripts/parity.mjs` `EXPECTED`** lists the 44 differences from production
  with their reasons, beside #62's two `/v1/brand` entries.

### Added — `AGENTS.md` loads the Mzizi dev skills (2026-10-06)

- **`AGENTS.md` gains "Dev skills, progress reports and the merge gate"**, the
  canonical rule block from nyuchi/.github#87, after "Track big work in GitHub
  issues": load the Mzizi dev skills (`digital-hygiene` and `progress-report`),
  clone only into a directory unique to the agent, run dev work on a 10-minute
  progress-report loop whose ticks never publish, release, merge or deploy
  without the owner's approval, and merge only through the merge gate. Docs
  only: no behaviour changes, and CI is unchanged.

### Fixed — `/v1/brand` serves a brand's `accent` family (2026-10-06)

- **`ecosystem[].accent`** is projected on the rows that carry one, as
  `displayName` and `aliases` are. mzizi-registry#449 gave `circles` (Mukoko
  Circles) `accent: "terracotta"` beside its tanzanite primary and said
  `/v1/brand` serves it, but the projection dropped the field, so
  mzizi-dev/packages-npm's canon snapshot lost the terracotta
  `--brand-accent`. Every other row is unchanged.
- **`scripts/parity.mjs` `EXPECTED`** lists the two routes (`/v1/brand`,
  `/api/v1/brand`); the 9f3631c entries are in #60.

### Changed — the registry pin moves to mzizi-registry `main` at `9f3631c` (v4.5.0) (2026-10-06)

- **The registry pin moves from `5067b5e` (v4.4.0) to `9f3631c`**, registry
  `main` at v4.5.0 (mzizi-registry#454), which adds #448, #449, #450, #451,
  #452 and #453. It goes through `staging`, as #56 did, in place of the bot's
  #59.
- **No component is added or removed**, and no status, header or redirect
  moves. The v4.5.0 record leads `/v1/changelog`.
- **Changed content:** `/v1/brand` serves Mukoko Circles as tanzanite with a
  terracotta accent (#449); `discover-meta-list` 1.1.0 is a valid description
  list that hides an empty row (#450); `discover-result-grid` 1.1.0 has an
  error state (#451); `mzizi-tokens-globals` defines `--text-body-sm` and the
  `circles` brand block (#448, #449).
- **`scripts/parity.mjs` `EXPECTED`** lists the 7 differences from production
  with their reasons; the 5067b5e entries are in #56.

### Added — each release to `main` is tagged as the next minor (2026-10-06)

- **`.github/workflows/main-release.yml` tags each release to `main`** as the
  next minor (`x.y.z` → `x.(y+1).0`) once the `CI` workflow passes on it, and
  creates its GitHub release, under the org versioning policy
  (nyuchi/.github#80). Merges into `staging` stay patches
  (`staging-version.yml`); a major is only made by hand. The releases merged
  untagged were tagged on their existing `main` commits on 2026-10-06:
  `v0.1.0` on `4eccb2e` (#50) and `v0.2.0` on `fcb0f32` (#54), so the next
  release is `v0.3.0`. CI only: no API change.

### Changed — the registry pin moves to mzizi-registry `main` at `5067b5e` (v4.4.0) (2026-10-06)

- **The registry pin moves from `2902393` (v4.3.0) to `5067b5e`**, registry
  `main` at v4.4.0 (mzizi-registry#447), which adds #439, #441, #442, #443 and
  #446. It goes through `staging`, as #53 did, in place of the bot's #55.
- **`/v1/rs/alert` and `/v1/rs/skeleton` answer 200**, the new Rust builds of
  the `ui/alert` and `ui/skeleton` contracts (mzizi-registry#439). Both were
  404 ("has no Rust implementation").
- **No component is added or removed** (655). The v4.4.0 record leads
  `/v1/changelog`.
- **Changed content:** safe-area-frame (React and Rust) is held to its full
  contract (#439); native-select and segmented-control take their full
  contracts (#441); the React toaster is the same component as the Astro one
  (#442); app-bar-chart, app-data-table, app-form-field, app-form-layout and
  ui-variants take the Nyuchi console's deltas (#443). The registry marks the
  safe-area-frame markup and the segmented-control and toaster React APIs
  **Breaking** in its 4.4.0 CHANGELOG.
- **`scripts/parity.mjs` `EXPECTED`** lists the 30 differences from production
  with their reasons; the 2902393 entries are in #53.

### Changed — the registry pin moves to mzizi-registry `main` at `2902393` (v4.3.0) (2026-10-05)

- **The registry pin moves from the hand pin `409a047` (registry staging) to
  `2902393`**, registry `main` at v4.3.0 (mzizi-registry#438), which adds #431,
  #432, #433, #436, #437 and #428. It is back on registry `main`, so the pin bot
  owns it again.
- **`/v1/changelog/4.2.0` answers only the v4.2.0 release.** The pre-1.0
  Doctrine 4.2.0 record is at `/v1/changelog/4.2.0+doctrine`
  (mzizi-registry#436, closing #435). The v4.3.0 and v4.2.0 records lead
  `/v1/changelog`.
- **Six components are added and none removed** (649 → 655): `app-alert`,
  `app-button`, `app-card`, `app-input`, `app-label` and `app-skeleton`
  (mzizi-registry#428).
- **Changed content:** `status-badge` defaults `status` to `stable`. The Rust
  builds of button, card, input, label and status-badge carry their `ui/`
  contract as `CONTRACT` (#428). `discover-open-link` gains the `places`,
  `lingo` and `profile` services (#432, Open in Mukoko 1.2.0).
- `scripts/parity.mjs` `EXPECTED` lists these 50 differences with their
  reasons. mzizi-registry#440 tracks the stable = malachite contract check
  that #428 dropped. No status, header or redirect changes.

### Changed — what the registry pin `409a047` changes in production answers, reviewed for release v0.1.0 (2026-10-05)

- **72 components are added and none removed** (577 → 649): mzizi-registry#398
  (safe-area-frame, preview-canvas, preset-picker, mzizi-email-preview), #418
  (status-badge, mzizi-mark-dark, mzizi-mark-light) and #430 (25 `app-*`
  contract builds, 17 `discover-*` components of the Discover Standard and
  detail pattern, 11 `site-*`, 9 `server-*`, `ui-utils`, `ui-variants`,
  `safe-area`). Counts on `/v1`, `/v1/stats` and `/v1/architecture` follow, and
  list and search answers gain the new names in place; the baseline's own names
  keep their order.
- **`wallet-card` and `mzizi-create-listing` take their colours from N1**
  (mzizi-registry#418, closing #423): mineral gradients with paired container
  text instead of fixed hex under white, and the terracotta cover theme ends on
  `var(--color-terracotta)`.
- `scripts/parity.mjs` `EXPECTED` now lists these 48 differences (and the
  OpenAPI `/astro` paths from #49) with their reasons, replacing the
  mzizi-registry#411 entries production already serves. No status, header or
  redirect changes.

### Added — `GET /v1/astro` and `/v1/astro/{name}`, the Astro target (2026-10-05)

mzizi-registry is now the single source of every component in every format, and a component's pure `.astro` sits beside its `.tsx` and `.rs` there (mzizi-registry#397, #430).

- **`GET /v1/astro/{name}`** serves the Astro implementation as a registry document for `mzizi add --target astro` (agent-tools). It has the `.astro`, or a framework-free `.ts` module the `.astro` files import (`ui-utils`, `server-table`, …), with a `target` under `src/components/mzizi/`. Its flat imports become absolute `/v1/astro/` `registryDependencies`, and its bare imports become npm `dependencies`. Brand assets it imports come as `registry:asset` files with `encoding: "base64"`. An unknown name, or a component with no Astro implementation, is a `404` that says which.
- **`GET /v1/astro`** lists every name it serves.
- The documents are built at build time by the registry's own reader, `lib/astro.ts`, at the pinned commit, so the Worker and the MCP serve the same thing. `scripts/registry-ref.json` moves to the registry commit that adds it.

### Changed — README's rollback no longer points at the registry Worker (2026-10-04)

- **README, "Cutover", step 5 (roll back to the `mzizi-registry` Worker) is
  marked no longer possible.** That Worker served the registry's Next.js app,
  which mzizi-registry removed on 2026-10-02 (mzizi-registry#389), and it is
  being deleted. A new "Rollback" section says what to do instead: revert the
  change in a pull request (the merge redeploys), or, faster, roll this Worker
  back to its previous deployment (`wrangler rollback`, or the Deployments tab
  in the Cloudflare dashboard) and then revert on `main` so the next deploy
  doesn't bring it back. "Status" links it.
- **CONTRIBUTING: the Parity workflow note now says live changes whenever this
  Worker deploys**, not whenever the registry deploys: the registry no longer
  deploys anything. Docs only: no route, response or pin changes.

### Changed — the registry pin bot runs when registry `main` moves, and reads its gate with the workflow token (2026-10-04)

- **Added: `registry-pin-bump.yml` runs on `repository_dispatch`
  (`registry-main-moved`)**, which mzizi-registry's new `notify-pin-bots.yml`
  sends on every push to registry `main` with the existing `RELEASE_BUMP_TOKEN`
  org secret, so a bump opens within minutes of a registry merge. The hourly
  schedule stays as the backstop: on 2026-10-04 GitHub ran it 2–3 hours apart.
- **Changed: the gate reads check runs, commit status and branch rules with the
  workflow's `GITHUB_TOKEN`**, which `registry-pin-bump.yml` now grants
  `checks: read` and `statuses: read`. `RELEASE_BUMP_TOKEN` still pushes, opens
  and merges, and needs no Checks or Commit statuses permission. Those reads
  already worked here because this repository is public; on the private
  agent-tools repository they failed with `403`, so its bot never merged a green
  bump (agent-tools#195).
- **Fixed: a run no longer fails when a person merges the bump mid-run.** If
  `bot/registry-pin` is deleted between the bot's two reads of it, the run says
  so and stops cleanly.
- `scripts/registry-pin-bump.mjs` stays byte-identical to the agent-tools copy.
  README, "Registry pin bump", and CONTRIBUTING are updated to match. No route,
  response or pin changes.

### Added — `AGENTS.md` links the published design system (2026-10-04)

- **`AGENTS.md` links the Design System artifact**
  (<https://claude.ai/artifact/G8CCtAbZ8w717uQ3R5itCc>) and names its source of
  truth, the `design-system/` folder in mzizi-registry, which arrives with
  mzizi-registry#418. Edit the folder, never the artifact page. Docs only: no
  route, response or pin changes.

### Changed — Mukoko Events replaces nhimbe in `/v1/brand`, and the brand rows carry `displayName` and `aliases` (2026-10-04)

- **The registry pin moves to mzizi-registry `2af5e5e`** (main, after
  mzizi-registry#411). This is the owner decision of 2026-10-04 under
  mukoko-dev/nhimbe#155: the nhimbe brand is retired, and the events platform is
  Mukoko Events, at events.mukoko.com, in malachite. On `/v1/brand` (and
  `/api/v1/brand`), `ecosystem[4]` is now `events` instead of `nhimbe`. Item copy
  across `/v1/ui`, `/v1/rs` and `/v1/search` follows: `useCases` say `events`,
  and descriptions say Mukoko Events. The tokens, footer, app-switcher and
  sidebar sources now carry the `events` brand, with `nhimbe` kept as a
  deprecated alias. Two Ubuntu doctrine pages say "Mukoko Events gatherings".
  Strict parity against production showed 94 body differences over 1,368
  requests, every one from this rename. No status, header or redirect changed.
- **`/v1/brand` `ecosystem` rows now project `displayName` and `aliases`**, but
  only on rows that carry them, so every other row is unchanged. Today that is
  only `events`, with `displayName: "Mukoko Events"` and `aliases: ["nhimbe"]`.
  A consumer that keys on the retired name can resolve it through `aliases`.

### Changed — kweli, learning, news and weather join `/v1/brand` (2026-10-04)

- **The registry pin moves to mzizi-registry `50fc537`** (main, after
  mzizi-registry#409; owner decisions under mzizi-registry#404). `/v1/brand`
  (and `/api/v1/brand`) lists four more `ecosystem` rows: kweli (malachite),
  learning (gold: Nyuchi Learning, because every Nyuchi brand is gold), news
  (cobalt) and weather (cobalt). The source file served by
  `/v1/ui/mzizi-tokens-globals` gains `[data-brand]` blocks for weather, kweli
  and learning. The one served by `/v1/ui/mzizi-tokens-typescript` adds kweli
  and learning to `BrandId` and `brandOverrides`, moves the Nyuchi `education`
  industry category from cobalt to gold, and adds a Mukoko `trust` category
  (Kweli, malachite). No other answer changes. Strict parity against
  production showed 4 differences over 1,368 requests.

### Changed — shamwari's mini-app accent is sodalite in the TypeScript tokens (2026-10-04)

- **The registry pin moves to mzizi-registry `e78341e`** (main, after
  mzizi-registry#407). One answer changes: the source file served by
  `/v1/ui/mzizi-tokens-typescript` (`files[0].content`,
  `mzizi-tokens-typescript.ts`) gives shamwari the sodalite mini-app accent,
  `brandAccent("sodalite", "#6E83FE")` (it was tanzanite, `#CE9FFF`), and
  lists shamwari's AI industry category under `sodalite` (it was `tanzanite`).
  This matches `/v1/brand`, which already names sodalite as shamwari's
  mineral. No other field of any answer changes. The pin's other registry
  commits (#406's `contracts/`, which no route reads, an audit setting and
  documentation) change nothing the API serves. Strict parity against
  production showed 1 difference over 1,368 requests.

### Security — security reports go to `security@nyuchi.com` (2026-10-03)

- **`/.well-known/security.txt` now names `Contact: mailto:security@nyuchi.com`**, and `SECURITY.md`'s email fallback behind GitHub private advisories matches, in place of `security@bundu.org` (owner decision, 2026-10-03: one security contact for every repository). `Expires`, `Canonical`, `Policy` and `Preferred-Languages` are unchanged.

### Changed — Vite+ 1.0 replaces prettier and vitest (2026-10-03)

- **Dev tooling only; no API change.** `vite-plus` 1.0.0 replaces the `prettier` and `vitest` dev dependencies. `npm run check` (`vp check`: format, lint, type-aware lint and type check) replaces `npm run format:check` in CI, and `npm test` is `vp test`. The test include moved from `vitest.config.ts` into `vite.config.ts`.

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
