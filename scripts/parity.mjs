#!/usr/bin/env node
/**
 * Parity: the acceptance test for this Worker.
 *
 *   npm run parity                     # https://api.mzizi.dev vs http://localhost:8787
 *   node scripts/parity.mjs --baseline <url> --candidate <url> [--report parity.md] [--sample N] [--strict]
 *
 * Before the cutover the baseline is api.mzizi.dev (the registry Worker) and the
 * candidate is this Worker (wrangler dev, or its workers.dev URL). After it, the
 * baseline is the registry Worker's own workers.dev URL and the candidate is
 * api.mzizi.dev. `--live`/`--local` are accepted as aliases.
 *
 * Requests every /v1 route — every component slug on /v1/ui/{name} and
 * /v1/rs/{name}, the renamed `nyuchi-*` names, the query filters, the error
 * paths, the /api/v1 spellings and the method handling — from both targets with
 * read-only GET/HEAD/OPTIONS requests (plus one POST per probed path, which
 * both targets must refuse with 405 without reading it) and diffs:
 *
 *   status · Location (redirects) · content-type · the CORS, cache and security
 *   headers · body (JSON deep-equal, text otherwise)
 *
 * Genuinely volatile values (the health timestamp, security.txt's Expires) are
 * normalised. Differences this port makes ON PURPOSE are listed in EXPECTED
 * with the reason; anything else fails the run (exit 1).
 *
 * `--strict` ignores EXPECTED: every difference is unexplained. CI passes it on
 * a pull request that doesn't touch this file (every automated pin bump), since
 * EXPECTED then only holds an earlier bump's reasons, which production already
 * serves, and they must not excuse a new difference on the same route.
 */
import { readFileSync, writeFileSync } from "node:fs";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => {
    if (a.startsWith("--"))
      acc.push([
        a.slice(2),
        all[i + 1]?.startsWith("--") ? true : (all[i + 1] ?? true),
      ]);
    return acc;
  }, []),
);
const LIVE = (args.baseline ?? args.live ?? "https://api.mzizi.dev").replace(
  /\/$/,
  "",
);
const LOCAL = (args.candidate ?? args.local ?? "http://localhost:8787").replace(
  /\/$/,
  "",
);
const SAMPLE = args.sample ? Number(args.sample) : Infinity;
const STRICT = args.strict === true;
const CONCURRENCY = 6;

const HEADERS = [
  "content-type",
  "cache-control",
  "access-control-allow-origin",
  "access-control-allow-methods",
  "access-control-allow-headers",
  "allow",
  "x-frame-options",
  "x-content-type-options",
  "referrer-policy",
  "permissions-policy",
  "strict-transport-security",
  "x-dns-prefetch-control",
  "x-openapi-version",
  // RFC 9745; /v1/search sends `Deprecation: true` for the `?layer=` alias.
  "deprecation",
];

/**
 * Differences made on purpose. Keyed by `METHOD path` (`*` = any method).
 * `allow` lists the only kinds of difference the entry excuses — `status`,
 * `location`, `body` or `header:<name>` — so a new regression on the same
 * request (a 500, a lost header) still fails the run.
 *
 * The baseline is api.mzizi.dev, which this Worker already serves, so these
 * are only what the current registry pin changes. Earlier bumps' entries are in
 * the PRs that made them (mzizi-api-gateway#13 for the cutover, #18 for
 * skills 0.8.0, #20 for skills 0.8.1 and the mzizi brand row, #21 for
 * mzizi's hematite default `--primary`, #22 for skills 0.8.2, #25 for skills 0.8.4
 * and the `-text` colour tokens, #27 for skills 0.8.5, #31 for the
 * `mzizi-tokens` description that mzizi-registry#389 rewrote, #37 for
 * shamwari's sodalite accent from mzizi-registry#407, 16742ab for
 * Mukoko Events replacing nhimbe from mzizi-registry#411).
 */
// mzizi-api-gateway#49 and the hand pin to mzizi-registry staging 409a047
// (#430), released in mzizi-registry v4.2.0 (#434). The registry adds 72
// components and removes none; list, search and count routes follow, and two
// existing components take their colours from N1 (mzizi-registry#418, closing
// #423). The OpenAPI spec gains the /v1/astro routes. Every difference is a
// body difference on a 200; no status, header or redirect moves. The previous
// bump's entries (mzizi-registry#411, nhimbe → Mukoko Events) are in 16742ab.
const EXPECTED = {
  "GET /api/openapi": {
    allow: ["body"],
    why: "mzizi-api-gateway#49: the spec adds `/astro` and `/astro/{name}` (GET /v1/astro, the Astro target from mzizi-registry#430). Pure addition: no existing path or schema changes.",
  },
  "GET /api/v1/architecture": {
    allow: ["body"],
    why: "Per-node component counts follow the additions (N2 371 → 381, N3 68 → 74, N4 14 → 23, N6 52 → 90, N7 16 → 25). mzizi-registry#398, #418 and #430 add 72 components (577 → 649) and remove none: #398 safe-area-frame, preview-canvas, preset-picker, mzizi-email-preview; #418 status-badge, mzizi-mark-dark, mzizi-mark-light; #430 the 25 `app-*` contract builds, the 17 `discover-*` components of the Discover Standard (#415) and detail pattern with Open in Mukoko, the `site-*`, `server-*` and `ui-*` modules and safe-area.",
  },
  "GET /api/v1/search?layer=2": {
    allow: ["body"],
    why: "List and search results gain the new components, so later items shift position; restricted to the baseline's names, the order is unchanged and nothing is dropped. mzizi-registry#398, #418 and #430 add 72 components (577 → 649) and remove none: #398 safe-area-frame, preview-canvas, preset-picker, mzizi-email-preview; #418 status-badge, mzizi-mark-dark, mzizi-mark-light; #430 the 25 `app-*` contract builds, the 17 `discover-*` components of the Discover Standard (#415) and detail pattern with Open in Mukoko, the `site-*`, `server-*` and `ui-*` modules and safe-area.",
  },
  "GET /api/v1/search?q=x": {
    allow: ["body"],
    why: "List and search results gain the new components, so later items shift position; restricted to the baseline's names, the order is unchanged and nothing is dropped. mzizi-registry#398, #418 and #430 add 72 components (577 → 649) and remove none: #398 safe-area-frame, preview-canvas, preset-picker, mzizi-email-preview; #418 status-badge, mzizi-mark-dark, mzizi-mark-light; #430 the 25 `app-*` contract builds, the 17 `discover-*` components of the Discover Standard (#415) and detail pattern with Open in Mukoko, the `site-*`, `server-*` and `ui-*` modules and safe-area.",
  },
  "GET /api/v1/stats": {
    allow: ["body"],
    why: "Per-node component counts follow the additions (N2 371 → 381, N3 68 → 74, N4 14 → 23, N6 52 → 90, N7 16 → 25). mzizi-registry#398, #418 and #430 add 72 components (577 → 649) and remove none: #398 safe-area-frame, preview-canvas, preset-picker, mzizi-email-preview; #418 status-badge, mzizi-mark-dark, mzizi-mark-light; #430 the 25 `app-*` contract builds, the 17 `discover-*` components of the Discover Standard (#415) and detail pattern with Open in Mukoko, the `site-*`, `server-*` and `ui-*` modules and safe-area.",
  },
  "GET /api/v1/ui?node=3": {
    allow: ["body"],
    why: "List and search results gain the new components, so later items shift position; restricted to the baseline's names, the order is unchanged and nothing is dropped. mzizi-registry#398, #418 and #430 add 72 components (577 → 649) and remove none: #398 safe-area-frame, preview-canvas, preset-picker, mzizi-email-preview; #418 status-badge, mzizi-mark-dark, mzizi-mark-light; #430 the 25 `app-*` contract builds, the 17 `discover-*` components of the Discover Standard (#415) and detail pattern with Open in Mukoko, the `site-*`, `server-*` and `ui-*` modules and safe-area.",
  },
  "GET /api/v1": {
    allow: ["body"],
    why: "`data.components` 577 → 649. mzizi-registry#398, #418 and #430 add 72 components (577 → 649) and remove none: #398 safe-area-frame, preview-canvas, preset-picker, mzizi-email-preview; #418 status-badge, mzizi-mark-dark, mzizi-mark-light; #430 the 25 `app-*` contract builds, the 17 `discover-*` components of the Discover Standard (#415) and detail pattern with Open in Mukoko, the `site-*`, `server-*` and `ui-*` modules and safe-area.",
  },
  "GET /openapi?format=json": {
    allow: ["body"],
    why: "mzizi-api-gateway#49: the spec adds `/astro` and `/astro/{name}` (GET /v1/astro, the Astro target from mzizi-registry#430). Pure addition: no existing path or schema changes.",
  },
  "GET /openapi": {
    allow: ["body"],
    why: "mzizi-api-gateway#49: the spec adds `/astro` and `/astro/{name}` (GET /v1/astro, the Astro target from mzizi-registry#430). Pure addition: no existing path or schema changes.",
  },
  "GET /v1/architecture/nodes/2": {
    allow: ["body"],
    why: "Per-node component counts follow the additions (N2 371 → 381, N3 68 → 74, N4 14 → 23, N6 52 → 90, N7 16 → 25). mzizi-registry#398, #418 and #430 add 72 components (577 → 649) and remove none: #398 safe-area-frame, preview-canvas, preset-picker, mzizi-email-preview; #418 status-badge, mzizi-mark-dark, mzizi-mark-light; #430 the 25 `app-*` contract builds, the 17 `discover-*` components of the Discover Standard (#415) and detail pattern with Open in Mukoko, the `site-*`, `server-*` and `ui-*` modules and safe-area.",
  },
  "GET /v1/architecture/nodes/3": {
    allow: ["body"],
    why: "Per-node component counts follow the additions (N2 371 → 381, N3 68 → 74, N4 14 → 23, N6 52 → 90, N7 16 → 25). mzizi-registry#398, #418 and #430 add 72 components (577 → 649) and remove none: #398 safe-area-frame, preview-canvas, preset-picker, mzizi-email-preview; #418 status-badge, mzizi-mark-dark, mzizi-mark-light; #430 the 25 `app-*` contract builds, the 17 `discover-*` components of the Discover Standard (#415) and detail pattern with Open in Mukoko, the `site-*`, `server-*` and `ui-*` modules and safe-area.",
  },
  "GET /v1/architecture/nodes/4": {
    allow: ["body"],
    why: "Per-node component counts follow the additions (N2 371 → 381, N3 68 → 74, N4 14 → 23, N6 52 → 90, N7 16 → 25). mzizi-registry#398, #418 and #430 add 72 components (577 → 649) and remove none: #398 safe-area-frame, preview-canvas, preset-picker, mzizi-email-preview; #418 status-badge, mzizi-mark-dark, mzizi-mark-light; #430 the 25 `app-*` contract builds, the 17 `discover-*` components of the Discover Standard (#415) and detail pattern with Open in Mukoko, the `site-*`, `server-*` and `ui-*` modules and safe-area.",
  },
  "GET /v1/architecture/nodes/6": {
    allow: ["body"],
    why: "Per-node component counts follow the additions (N2 371 → 381, N3 68 → 74, N4 14 → 23, N6 52 → 90, N7 16 → 25). mzizi-registry#398, #418 and #430 add 72 components (577 → 649) and remove none: #398 safe-area-frame, preview-canvas, preset-picker, mzizi-email-preview; #418 status-badge, mzizi-mark-dark, mzizi-mark-light; #430 the 25 `app-*` contract builds, the 17 `discover-*` components of the Discover Standard (#415) and detail pattern with Open in Mukoko, the `site-*`, `server-*` and `ui-*` modules and safe-area.",
  },
  "GET /v1/architecture/nodes/7": {
    allow: ["body"],
    why: "Per-node component counts follow the additions (N2 371 → 381, N3 68 → 74, N4 14 → 23, N6 52 → 90, N7 16 → 25). mzizi-registry#398, #418 and #430 add 72 components (577 → 649) and remove none: #398 safe-area-frame, preview-canvas, preset-picker, mzizi-email-preview; #418 status-badge, mzizi-mark-dark, mzizi-mark-light; #430 the 25 `app-*` contract builds, the 17 `discover-*` components of the Discover Standard (#415) and detail pattern with Open in Mukoko, the `site-*`, `server-*` and `ui-*` modules and safe-area.",
  },
  "GET /v1/architecture": {
    allow: ["body"],
    why: "Per-node component counts follow the additions (N2 371 → 381, N3 68 → 74, N4 14 → 23, N6 52 → 90, N7 16 → 25). mzizi-registry#398, #418 and #430 add 72 components (577 → 649) and remove none: #398 safe-area-frame, preview-canvas, preset-picker, mzizi-email-preview; #418 status-badge, mzizi-mark-dark, mzizi-mark-light; #430 the 25 `app-*` contract builds, the 17 `discover-*` components of the Discover Standard (#415) and detail pattern with Open in Mukoko, the `site-*`, `server-*` and `ui-*` modules and safe-area.",
  },
  "GET /v1/search?category=primitives": {
    allow: ["body"],
    why: "List and search results gain the new components, so later items shift position; restricted to the baseline's names, the order is unchanged and nothing is dropped. mzizi-registry#398, #418 and #430 add 72 components (577 → 649) and remove none: #398 safe-area-frame, preview-canvas, preset-picker, mzizi-email-preview; #418 status-badge, mzizi-mark-dark, mzizi-mark-light; #430 the 25 `app-*` contract builds, the 17 `discover-*` components of the Discover Standard (#415) and detail pattern with Open in Mukoko, the `site-*`, `server-*` and `ui-*` modules and safe-area.",
  },
  "GET /v1/search?layer=2": {
    allow: ["body"],
    why: "List and search results gain the new components, so later items shift position; restricted to the baseline's names, the order is unchanged and nothing is dropped. mzizi-registry#398, #418 and #430 add 72 components (577 → 649) and remove none: #398 safe-area-frame, preview-canvas, preset-picker, mzizi-email-preview; #418 status-badge, mzizi-mark-dark, mzizi-mark-light; #430 the 25 `app-*` contract builds, the 17 `discover-*` components of the Discover Standard (#415) and detail pattern with Open in Mukoko, the `site-*`, `server-*` and `ui-*` modules and safe-area.",
  },
  "GET /v1/search?layer=3&node=2": {
    allow: ["body"],
    why: "List and search results gain the new components, so later items shift position; restricted to the baseline's names, the order is unchanged and nothing is dropped. mzizi-registry#398, #418 and #430 add 72 components (577 → 649) and remove none: #398 safe-area-frame, preview-canvas, preset-picker, mzizi-email-preview; #418 status-badge, mzizi-mark-dark, mzizi-mark-light; #430 the 25 `app-*` contract builds, the 17 `discover-*` components of the Discover Standard (#415) and detail pattern with Open in Mukoko, the `site-*`, `server-*` and `ui-*` modules and safe-area.",
  },
  "GET /v1/search?node=2": {
    allow: ["body"],
    why: "List and search results gain the new components, so later items shift position; restricted to the baseline's names, the order is unchanged and nothing is dropped. mzizi-registry#398, #418 and #430 add 72 components (577 → 649) and remove none: #398 safe-area-frame, preview-canvas, preset-picker, mzizi-email-preview; #418 status-badge, mzizi-mark-dark, mzizi-mark-light; #430 the 25 `app-*` contract builds, the 17 `discover-*` components of the Discover Standard (#415) and detail pattern with Open in Mukoko, the `site-*`, `server-*` and `ui-*` modules and safe-area.",
  },
  "GET /v1/search?q=button&node=2&category=primitives": {
    allow: ["body"],
    why: "List and search results gain the new components, so later items shift position; restricted to the baseline's names, the order is unchanged and nothing is dropped. mzizi-registry#398, #418 and #430 add 72 components (577 → 649) and remove none: #398 safe-area-frame, preview-canvas, preset-picker, mzizi-email-preview; #418 status-badge, mzizi-mark-dark, mzizi-mark-light; #430 the 25 `app-*` contract builds, the 17 `discover-*` components of the Discover Standard (#415) and detail pattern with Open in Mukoko, the `site-*`, `server-*` and `ui-*` modules and safe-area.",
  },
  "GET /v1/search?q=button": {
    allow: ["body"],
    why: "List and search results gain the new components, so later items shift position; restricted to the baseline's names, the order is unchanged and nothing is dropped. mzizi-registry#398, #418 and #430 add 72 components (577 → 649) and remove none: #398 safe-area-frame, preview-canvas, preset-picker, mzizi-email-preview; #418 status-badge, mzizi-mark-dark, mzizi-mark-light; #430 the 25 `app-*` contract builds, the 17 `discover-*` components of the Discover Standard (#415) and detail pattern with Open in Mukoko, the `site-*`, `server-*` and `ui-*` modules and safe-area.",
  },
  "GET /v1/stats?days=500": {
    allow: ["body"],
    why: "Per-node component counts follow the additions (N2 371 → 381, N3 68 → 74, N4 14 → 23, N6 52 → 90, N7 16 → 25). mzizi-registry#398, #418 and #430 add 72 components (577 → 649) and remove none: #398 safe-area-frame, preview-canvas, preset-picker, mzizi-email-preview; #418 status-badge, mzizi-mark-dark, mzizi-mark-light; #430 the 25 `app-*` contract builds, the 17 `discover-*` components of the Discover Standard (#415) and detail pattern with Open in Mukoko, the `site-*`, `server-*` and `ui-*` modules and safe-area.",
  },
  "GET /v1/stats?days=7": {
    allow: ["body"],
    why: "Per-node component counts follow the additions (N2 371 → 381, N3 68 → 74, N4 14 → 23, N6 52 → 90, N7 16 → 25). mzizi-registry#398, #418 and #430 add 72 components (577 → 649) and remove none: #398 safe-area-frame, preview-canvas, preset-picker, mzizi-email-preview; #418 status-badge, mzizi-mark-dark, mzizi-mark-light; #430 the 25 `app-*` contract builds, the 17 `discover-*` components of the Discover Standard (#415) and detail pattern with Open in Mukoko, the `site-*`, `server-*` and `ui-*` modules and safe-area.",
  },
  "GET /v1/stats?days=abc": {
    allow: ["body"],
    why: "Per-node component counts follow the additions (N2 371 → 381, N3 68 → 74, N4 14 → 23, N6 52 → 90, N7 16 → 25). mzizi-registry#398, #418 and #430 add 72 components (577 → 649) and remove none: #398 safe-area-frame, preview-canvas, preset-picker, mzizi-email-preview; #418 status-badge, mzizi-mark-dark, mzizi-mark-light; #430 the 25 `app-*` contract builds, the 17 `discover-*` components of the Discover Standard (#415) and detail pattern with Open in Mukoko, the `site-*`, `server-*` and `ui-*` modules and safe-area.",
  },
  "GET /v1/stats": {
    allow: ["body"],
    why: "Per-node component counts follow the additions (N2 371 → 381, N3 68 → 74, N4 14 → 23, N6 52 → 90, N7 16 → 25). mzizi-registry#398, #418 and #430 add 72 components (577 → 649) and remove none: #398 safe-area-frame, preview-canvas, preset-picker, mzizi-email-preview; #418 status-badge, mzizi-mark-dark, mzizi-mark-light; #430 the 25 `app-*` contract builds, the 17 `discover-*` components of the Discover Standard (#415) and detail pattern with Open in Mukoko, the `site-*`, `server-*` and `ui-*` modules and safe-area.",
  },
  "GET /v1/ui?collection=components": {
    allow: ["body"],
    why: "List and search results gain the new components, so later items shift position; restricted to the baseline's names, the order is unchanged and nothing is dropped. mzizi-registry#398, #418 and #430 add 72 components (577 → 649) and remove none: #398 safe-area-frame, preview-canvas, preset-picker, mzizi-email-preview; #418 status-badge, mzizi-mark-dark, mzizi-mark-light; #430 the 25 `app-*` contract builds, the 17 `discover-*` components of the Discover Standard (#415) and detail pattern with Open in Mukoko, the `site-*`, `server-*` and `ui-*` modules and safe-area.",
  },
  "GET /v1/ui?collection=documentation": {
    allow: ["body"],
    why: "List and search results gain the new components, so later items shift position; restricted to the baseline's names, the order is unchanged and nothing is dropped. mzizi-registry#398, #418 and #430 add 72 components (577 → 649) and remove none: #398 safe-area-frame, preview-canvas, preset-picker, mzizi-email-preview; #418 status-badge, mzizi-mark-dark, mzizi-mark-light; #430 the 25 `app-*` contract builds, the 17 `discover-*` components of the Discover Standard (#415) and detail pattern with Open in Mukoko, the `site-*`, `server-*` and `ui-*` modules and safe-area.",
  },
  "GET /v1/ui?collection=primitives": {
    allow: ["body"],
    why: "List and search results gain the new components, so later items shift position; restricted to the baseline's names, the order is unchanged and nothing is dropped. mzizi-registry#398, #418 and #430 add 72 components (577 → 649) and remove none: #398 safe-area-frame, preview-canvas, preset-picker, mzizi-email-preview; #418 status-badge, mzizi-mark-dark, mzizi-mark-light; #430 the 25 `app-*` contract builds, the 17 `discover-*` components of the Discover Standard (#415) and detail pattern with Open in Mukoko, the `site-*`, `server-*` and `ui-*` modules and safe-area.",
  },
  "GET /v1/ui?limit=0": {
    allow: ["body"],
    why: "List and search results gain the new components, so later items shift position; restricted to the baseline's names, the order is unchanged and nothing is dropped. mzizi-registry#398, #418 and #430 add 72 components (577 → 649) and remove none: #398 safe-area-frame, preview-canvas, preset-picker, mzizi-email-preview; #418 status-badge, mzizi-mark-dark, mzizi-mark-light; #430 the 25 `app-*` contract builds, the 17 `discover-*` components of the Discover Standard (#415) and detail pattern with Open in Mukoko, the `site-*`, `server-*` and `ui-*` modules and safe-area.",
  },
  "GET /v1/ui?limit=abc": {
    allow: ["body"],
    why: "List and search results gain the new components, so later items shift position; restricted to the baseline's names, the order is unchanged and nothing is dropped. mzizi-registry#398, #418 and #430 add 72 components (577 → 649) and remove none: #398 safe-area-frame, preview-canvas, preset-picker, mzizi-email-preview; #418 status-badge, mzizi-mark-dark, mzizi-mark-light; #430 the 25 `app-*` contract builds, the 17 `discover-*` components of the Discover Standard (#415) and detail pattern with Open in Mukoko, the `site-*`, `server-*` and `ui-*` modules and safe-area.",
  },
  "GET /v1/ui?node=-1": {
    allow: ["body"],
    why: "List and search results gain the new components, so later items shift position; restricted to the baseline's names, the order is unchanged and nothing is dropped. mzizi-registry#398, #418 and #430 add 72 components (577 → 649) and remove none: #398 safe-area-frame, preview-canvas, preset-picker, mzizi-email-preview; #418 status-badge, mzizi-mark-dark, mzizi-mark-light; #430 the 25 `app-*` contract builds, the 17 `discover-*` components of the Discover Standard (#415) and detail pattern with Open in Mukoko, the `site-*`, `server-*` and `ui-*` modules and safe-area.",
  },
  "GET /v1/ui?node=2&limit=5&offset=3": {
    allow: ["body"],
    why: "List and search results gain the new components, so later items shift position; restricted to the baseline's names, the order is unchanged and nothing is dropped. mzizi-registry#398, #418 and #430 add 72 components (577 → 649) and remove none: #398 safe-area-frame, preview-canvas, preset-picker, mzizi-email-preview; #418 status-badge, mzizi-mark-dark, mzizi-mark-light; #430 the 25 `app-*` contract builds, the 17 `discover-*` components of the Discover Standard (#415) and detail pattern with Open in Mukoko, the `site-*`, `server-*` and `ui-*` modules and safe-area.",
  },
  "GET /v1/ui?node=2": {
    allow: ["body"],
    why: "List and search results gain the new components, so later items shift position; restricted to the baseline's names, the order is unchanged and nothing is dropped. mzizi-registry#398, #418 and #430 add 72 components (577 → 649) and remove none: #398 safe-area-frame, preview-canvas, preset-picker, mzizi-email-preview; #418 status-badge, mzizi-mark-dark, mzizi-mark-light; #430 the 25 `app-*` contract builds, the 17 `discover-*` components of the Discover Standard (#415) and detail pattern with Open in Mukoko, the `site-*`, `server-*` and `ui-*` modules and safe-area.",
  },
  "GET /v1/ui?node=999": {
    allow: ["body"],
    why: "List and search results gain the new components, so later items shift position; restricted to the baseline's names, the order is unchanged and nothing is dropped. mzizi-registry#398, #418 and #430 add 72 components (577 → 649) and remove none: #398 safe-area-frame, preview-canvas, preset-picker, mzizi-email-preview; #418 status-badge, mzizi-mark-dark, mzizi-mark-light; #430 the 25 `app-*` contract builds, the 17 `discover-*` components of the Discover Standard (#415) and detail pattern with Open in Mukoko, the `site-*`, `server-*` and `ui-*` modules and safe-area.",
  },
  "GET /v1/ui?offset=570": {
    allow: ["body"],
    why: "List and search results gain the new components, so later items shift position; restricted to the baseline's names, the order is unchanged and nothing is dropped. mzizi-registry#398, #418 and #430 add 72 components (577 → 649) and remove none: #398 safe-area-frame, preview-canvas, preset-picker, mzizi-email-preview; #418 status-badge, mzizi-mark-dark, mzizi-mark-light; #430 the 25 `app-*` contract builds, the 17 `discover-*` components of the Discover Standard (#415) and detail pattern with Open in Mukoko, the `site-*`, `server-*` and `ui-*` modules and safe-area.",
  },
  "GET /v1/ui?owner=framework": {
    allow: ["body"],
    why: "List and search results gain the new components, so later items shift position; restricted to the baseline's names, the order is unchanged and nothing is dropped. mzizi-registry#398, #418 and #430 add 72 components (577 → 649) and remove none: #398 safe-area-frame, preview-canvas, preset-picker, mzizi-email-preview; #418 status-badge, mzizi-mark-dark, mzizi-mark-light; #430 the 25 `app-*` contract builds, the 17 `discover-*` components of the Discover Standard (#415) and detail pattern with Open in Mukoko, the `site-*`, `server-*` and `ui-*` modules and safe-area.",
  },
  "GET /v1/ui?owner=mzizi": {
    allow: ["body"],
    why: "List and search results gain the new components, so later items shift position; restricted to the baseline's names, the order is unchanged and nothing is dropped. mzizi-registry#398, #418 and #430 add 72 components (577 → 649) and remove none: #398 safe-area-frame, preview-canvas, preset-picker, mzizi-email-preview; #418 status-badge, mzizi-mark-dark, mzizi-mark-light; #430 the 25 `app-*` contract builds, the 17 `discover-*` components of the Discover Standard (#415) and detail pattern with Open in Mukoko, the `site-*`, `server-*` and `ui-*` modules and safe-area.",
  },
  "GET /v1/ui?owner=nyuchi": {
    allow: ["body"],
    why: "List and search results gain the new components, so later items shift position; restricted to the baseline's names, the order is unchanged and nothing is dropped. mzizi-registry#398, #418 and #430 add 72 components (577 → 649) and remove none: #398 safe-area-frame, preview-canvas, preset-picker, mzizi-email-preview; #418 status-badge, mzizi-mark-dark, mzizi-mark-light; #430 the 25 `app-*` contract builds, the 17 `discover-*` components of the Discover Standard (#415) and detail pattern with Open in Mukoko, the `site-*`, `server-*` and `ui-*` modules and safe-area.",
  },
  "GET /v1/ui?type=registry%3Abase": {
    allow: ["body"],
    why: "List and search results gain the new components, so later items shift position; restricted to the baseline's names, the order is unchanged and nothing is dropped. mzizi-registry#398, #418 and #430 add 72 components (577 → 649) and remove none: #398 safe-area-frame, preview-canvas, preset-picker, mzizi-email-preview; #418 status-badge, mzizi-mark-dark, mzizi-mark-light; #430 the 25 `app-*` contract builds, the 17 `discover-*` components of the Discover Standard (#415) and detail pattern with Open in Mukoko, the `site-*`, `server-*` and `ui-*` modules and safe-area.",
  },
  "GET /v1/ui?type=registry%3Ablock": {
    allow: ["body"],
    why: "List and search results gain the new components, so later items shift position; restricted to the baseline's names, the order is unchanged and nothing is dropped. mzizi-registry#398, #418 and #430 add 72 components (577 → 649) and remove none: #398 safe-area-frame, preview-canvas, preset-picker, mzizi-email-preview; #418 status-badge, mzizi-mark-dark, mzizi-mark-light; #430 the 25 `app-*` contract builds, the 17 `discover-*` components of the Discover Standard (#415) and detail pattern with Open in Mukoko, the `site-*`, `server-*` and `ui-*` modules and safe-area.",
  },
  "GET /v1/ui?type=registry%3Ahook": {
    allow: ["body"],
    why: "List and search results gain the new components, so later items shift position; restricted to the baseline's names, the order is unchanged and nothing is dropped. mzizi-registry#398, #418 and #430 add 72 components (577 → 649) and remove none: #398 safe-area-frame, preview-canvas, preset-picker, mzizi-email-preview; #418 status-badge, mzizi-mark-dark, mzizi-mark-light; #430 the 25 `app-*` contract builds, the 17 `discover-*` components of the Discover Standard (#415) and detail pattern with Open in Mukoko, the `site-*`, `server-*` and `ui-*` modules and safe-area.",
  },
  "GET /v1/ui?type=registry%3Alib": {
    allow: ["body"],
    why: "List and search results gain the new components, so later items shift position; restricted to the baseline's names, the order is unchanged and nothing is dropped. mzizi-registry#398, #418 and #430 add 72 components (577 → 649) and remove none: #398 safe-area-frame, preview-canvas, preset-picker, mzizi-email-preview; #418 status-badge, mzizi-mark-dark, mzizi-mark-light; #430 the 25 `app-*` contract builds, the 17 `discover-*` components of the Discover Standard (#415) and detail pattern with Open in Mukoko, the `site-*`, `server-*` and `ui-*` modules and safe-area.",
  },
  "GET /v1/ui?type=registry%3Atheme": {
    allow: ["body"],
    why: "List and search results gain the new components, so later items shift position; restricted to the baseline's names, the order is unchanged and nothing is dropped. mzizi-registry#398, #418 and #430 add 72 components (577 → 649) and remove none: #398 safe-area-frame, preview-canvas, preset-picker, mzizi-email-preview; #418 status-badge, mzizi-mark-dark, mzizi-mark-light; #430 the 25 `app-*` contract builds, the 17 `discover-*` components of the Discover Standard (#415) and detail pattern with Open in Mukoko, the `site-*`, `server-*` and `ui-*` modules and safe-area.",
  },
  "GET /v1/ui?type=registry%3Aui": {
    allow: ["body"],
    why: "List and search results gain the new components, so later items shift position; restricted to the baseline's names, the order is unchanged and nothing is dropped. mzizi-registry#398, #418 and #430 add 72 components (577 → 649) and remove none: #398 safe-area-frame, preview-canvas, preset-picker, mzizi-email-preview; #418 status-badge, mzizi-mark-dark, mzizi-mark-light; #430 the 25 `app-*` contract builds, the 17 `discover-*` components of the Discover Standard (#415) and detail pattern with Open in Mukoko, the `site-*`, `server-*` and `ui-*` modules and safe-area.",
  },
  "GET /v1/ui/mzizi-create-listing": {
    allow: ["body"],
    why: "mzizi-registry#418 (fixes mzizi-registry#423): the terracotta cover theme ends on `var(--color-terracotta)` instead of hex #A0522D, and the swapped gold/terracotta comments are corrected.",
  },
  "GET /v1/ui/wallet-card": {
    allow: ["body"],
    why: "mzizi-registry#418 (fixes mzizi-registry#423): wallet-card fills each token type from its N1 mineral (`--color-<mineral>` to `-on-container`, text in `-container`) instead of fixed hex gradients under white text, so it is theme-adaptive.",
  },
  "GET /v1/ui": {
    allow: ["body"],
    why: "List and search results gain the new components, so later items shift position; restricted to the baseline's names, the order is unchanged and nothing is dropped. mzizi-registry#398, #418 and #430 add 72 components (577 → 649) and remove none: #398 safe-area-frame, preview-canvas, preset-picker, mzizi-email-preview; #418 status-badge, mzizi-mark-dark, mzizi-mark-light; #430 the 25 `app-*` contract builds, the 17 `discover-*` components of the Discover Standard (#415) and detail pattern with Open in Mukoko, the `site-*`, `server-*` and `ui-*` modules and safe-area.",
  },
  "GET /v1": {
    allow: ["body"],
    why: "`data.components` 577 → 649. mzizi-registry#398, #418 and #430 add 72 components (577 → 649) and remove none: #398 safe-area-frame, preview-canvas, preset-picker, mzizi-email-preview; #418 status-badge, mzizi-mark-dark, mzizi-mark-light; #430 the 25 `app-*` contract builds, the 17 `discover-*` components of the Discover Standard (#415) and detail pattern with Open in Mukoko, the `site-*`, `server-*` and `ui-*` modules and safe-area.",
  },
};

// ── Build the request list ─────────────────────────────────────────────────
const index = await (await fetch(`${LIVE}/v1/ui`)).json();
const names = index.items.map((i) => i.name);
// The pinned rename map (src/data/meta.json, from `npm run build:data`).
const renames = Object.keys(
  JSON.parse(
    readFileSync(new URL("../src/data/meta.json", import.meta.url), "utf8"),
  ).renames,
);
const skills = (await (await fetch(`${LIVE}/v1/skills`)).json()).data.map(
  (s) => s.name,
);
const samples = (await (await fetch(`${LIVE}/v1/samples`)).json()).types.map(
  (t) => t.type,
);
const versions = [
  ...new Set(
    (await (await fetch(`${LIVE}/v1/changelog`)).json()).data.map(
      (e) => e.version,
    ),
  ),
];
const owners = [...new Set(index.items.map((i) => i.owner).filter(Boolean))];
const collections = [
  ...new Set(index.items.map((i) => i.collection).filter(Boolean)),
];
const types = [...new Set(index.items.map((i) => i.type).filter(Boolean))];

const step = Number.isFinite(SAMPLE)
  ? Math.max(1, Math.floor(names.length / SAMPLE))
  : 1;
const slugSet = names.filter((_, i) => i % step === 0);

const paths = [
  "/v1",
  "/api/v1",
  "/v1/health",
  "/v1/ui",
  "/v1/ui?node=2",
  "/v1/ui?node=2&limit=5&offset=3",
  "/v1/ui?node=999",
  "/v1/ui?limit=abc",
  "/v1/ui?limit=0",
  "/v1/ui?offset=570",
  "/v1/ui?node=-1",
  ...owners.slice(0, 3).map((o) => `/v1/ui?owner=${encodeURIComponent(o)}`),
  ...collections
    .slice(0, 3)
    .map((o) => `/v1/ui?collection=${encodeURIComponent(o)}`),
  ...types.map((t) => `/v1/ui?type=${encodeURIComponent(t)}`),
  ...slugSet.map((n) => `/v1/ui/${n}`),
  ...slugSet.map((n) => `/v1/rs/${n}`),
  "/v1/ui/does-not-exist",
  "/v1/rs/does-not-exist",
  "/v1/ui/button/docs",
  "/v1/ui/mzizi-tokens/docs",
  "/v1/ui/does-not-exist/docs",
  "/v1/ui/button/versions",
  ...renames
    .slice(0, 3)
    .flatMap((r) => [
      `/v1/ui/${r}`,
      `/v1/ui/${r}/docs`,
      `/v1/rs/${r}`,
      `/api/v1/ui/${r}?x=1`,
    ]),
  "/v1/ui/",
  "/v1/ui/button/",
  // Repeated slashes: collapsed in one hop, never a protocol-relative Location.
  "//evil.com/",
  "/%5Cevil.com/",
  "//v1/ui",
  "/v1//ui?x=1",
  "/v1/search",
  "/v1/search?q=button",
  "/v1/search?layer=2",
  "/v1/search?category=forms",
  "/v1/search?node=2",
  "/v1/search?layer=3&node=2",
  "/v1/search?category=primitives",
  "/v1/search?q=button&node=2&category=primitives",
  "/v1/stats",
  "/v1/stats?days=7",
  "/v1/stats?days=500",
  "/v1/stats?days=abc",
  "/v1/brand",
  "/v1/architecture",
  ...Array.from({ length: 14 }, (_, i) => `/v1/architecture/nodes/${i}`),
  "/v1/architecture/nodes/abc",
  "/v1/architecture/nodes/1.5",
  "/v1/architecture/nodes/01",
  "/v1/architecture/axes",
  "/v1/architecture/frontend/axes",
  "/v1/architecture/frontend/layers",
  "/v1/architecture/layers/3",
  "/v1/architecture/layers/x",
  "/v1/changelog",
  ...versions.map((v) => `/v1/changelog/${v}`),
  "/v1/changelog/0.0.0",
  "/v1/data-layer",
  "/v1/ecosystem",
  "/v1/pipeline",
  "/v1/sovereignty",
  "/v1/ubuntu/pillars",
  "/v1/ubuntu/principles",
  "/v1/docs",
  "/v1/docs/introduction",
  "/v1/samples",
  ...samples.map((t) => `/v1/samples/${t}`),
  "/v1/samples/unknown",
  "/v1/skills",
  "/v1/skills/summary",
  ...skills.map((s) => `/v1/skills/${s}`),
  "/v1/skills/Nope",
  "/v1/skills/does-not-exist",
  "/v1/ai/instructions",
  "/v1/ai/instructions/claude",
  "/v1/ai/instructions/nope",
  "/v1/ai/instructions/nyuchi-mcp-system-prompt",
  "/v1/ai/instructions/mcp-server",
  "/v1/this-route-does-not-exist",
  // The /api/v1 spelling — every resource, since Next applies extra CORS headers there.
  "/api/v1/health",
  "/api/v1/ui?node=3",
  "/api/v1/ui/button",
  "/api/v1/brand",
  "/api/v1/architecture",
  "/api/v1/architecture/nodes/1",
  "/api/v1/changelog",
  "/api/v1/skills",
  "/api/v1/stats",
  "/api/v1/samples",
  "/api/v1/search?q=x",
  "/api/v1/search?layer=2",
  "/api/v1/ui/button/docs",
  "/api/v1/ui/button/versions",
  "/api/v1/ai/instructions/github-copilot",
  "/api/v1/docs",
  "/api/v1/this-route-does-not-exist",
  "/openapi",
  "/api/openapi",
  "/openapi?format=json",
  "/mcp",
  "/.well-known/security.txt",
];

const requests = [
  ...paths.map((p) => ({ method: "GET", path: p })),
  ...[
    "/v1/ui",
    "/v1/stats",
    "/api/v1/ui",
    "/v1/ui/button",
    "/api/openapi",
    "/mcp",
    "/v1/does-not-exist",
  ].flatMap((p) => [
    { method: "OPTIONS", path: p },
    { method: "POST", path: p },
    { method: "HEAD", path: p },
  ]),
];

// ── Run ─────────────────────────────────────────────────────────────────────
async function hit(base, { method, path }) {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(base + path, { method, redirect: "manual" });
      const text = await res.text();
      const headers = Object.fromEntries(
        HEADERS.map((h) => [h, res.headers.get(h)]),
      );
      return {
        status: res.status,
        location: res.headers.get("location"),
        headers,
        text,
      };
    } catch (e) {
      if (attempt >= 3)
        return { status: 0, location: null, headers: {}, text: String(e) };
      await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
    }
  }
}

function normalise(path, r) {
  if (path.endsWith("/health") && r.status === 200) {
    const j = JSON.parse(r.text);
    j.timestamp = "<timestamp>";
    return JSON.stringify(j);
  }
  if (path.endsWith("security.txt"))
    return r.text.replace(/^Expires: .*$/m, "Expires: <expires>");
  return r.text;
}

function sameBody(a, b, contentType) {
  if (contentType?.includes("json")) {
    try {
      return JSON.stringify(JSON.parse(a)) === JSON.stringify(JSON.parse(b));
    } catch {
      return a === b;
    }
  }
  return a === b;
}

/** JSON-path of the first difference, for the report. */
function firstDiff(a, b, at = "$") {
  if (
    typeof a !== typeof b ||
    Array.isArray(a) !== Array.isArray(b) ||
    a === null ||
    b === null
  ) {
    return a === b
      ? null
      : `${at}: ${JSON.stringify(a)?.slice(0, 80)} ≠ ${JSON.stringify(b)?.slice(0, 80)}`;
  }
  if (typeof a !== "object")
    return a === b
      ? null
      : `${at}: ${JSON.stringify(a).slice(0, 80)} ≠ ${JSON.stringify(b).slice(0, 80)}`;
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])];
  if (
    !Array.isArray(a) &&
    Object.keys(a).join() !== Object.keys(b).join() &&
    keys.every((k) => k in a && k in b)
  ) {
    return `${at}: key order differs`;
  }
  for (const k of keys) {
    const d = firstDiff(a[k], b[k], `${at}.${k}`);
    if (d) return d;
  }
  return null;
}

const results = [];
let cursor = 0;
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    while (cursor < requests.length) {
      const req = requests[cursor++];
      const [live, local] = await Promise.all([
        hit(LIVE, req),
        hit(LOCAL, req),
      ]);
      const diffs = [];
      const kinds = [];
      if (live.status !== local.status) {
        kinds.push("status");
        diffs.push(`status ${live.status} ≠ ${local.status}`);
      }
      if (live.location !== local.location) {
        kinds.push("location");
        diffs.push(`location ${live.location} ≠ ${local.location}`);
      }
      for (const h of HEADERS) {
        if ((live.headers[h] ?? null) !== (local.headers[h] ?? null)) {
          kinds.push(`header:${h}`);
          diffs.push(
            `header ${h}: ${JSON.stringify(live.headers[h])} ≠ ${JSON.stringify(local.headers[h])}`,
          );
        }
      }
      const lb = normalise(req.path, live);
      const cb = normalise(req.path, local);
      if (!sameBody(lb, cb, live.headers["content-type"])) {
        let detail = "body differs";
        try {
          detail =
            "body " +
            (firstDiff(JSON.parse(lb), JSON.parse(cb)) ??
              "differs (serialisation)");
        } catch {
          detail = `body differs (${lb.length} vs ${cb.length} bytes)`;
        }
        kinds.push("body");
        diffs.push(detail);
      }
      results.push({
        ...req,
        liveStatus: live.status,
        localStatus: local.status,
        diffs,
        kinds,
      });
    }
  }),
);

results.sort((a, b) => (a.path + a.method).localeCompare(b.path + b.method));
const key = (r) => `${r.method} ${r.path}`;
const expectation = (r) => {
  if (STRICT) return undefined;
  const e = EXPECTED[key(r)] ?? EXPECTED[`* ${r.path}`];
  return e && r.kinds.every((k) => e.allow.includes(k)) ? e : undefined;
};
const failed = results.filter((r) => r.diffs.length && !expectation(r));
const expected = results.filter((r) => r.diffs.length && expectation(r));
const identical = results.filter((r) => !r.diffs.length);

const byStatus = {};
for (const r of identical)
  byStatus[r.liveStatus] = (byStatus[r.liveStatus] ?? 0) + 1;

const lines = [
  `## Parity report`,
  ``,
  `Baseline \`${LIVE}\` vs candidate \`${LOCAL}\` — ${new Date().toISOString()}`,
  ``,
  ...(STRICT
    ? [
        "Strict: `EXPECTED` is ignored, so every difference counts as unexplained.",
        ``,
      ]
    : []),
  `| | Requests |`,
  `| --- | ---: |`,
  `| Total | ${results.length} |`,
  `| Identical (status, headers compared, body) | ${identical.length} |`,
  `| Intentional differences | ${expected.length} |`,
  `| **Unexplained differences** | **${failed.length}** |`,
  ``,
  `Identical by status: ${Object.entries(byStatus)
    .map(([s, n]) => `${s} × ${n}`)
    .join(", ")}. ` +
    `Covers all ${slugSet.length} component slugs on \`/v1/ui/{name}\` and \`/v1/rs/{name}\`.`,
  ``,
];
if (expected.length) {
  lines.push(
    `### Intentional differences`,
    ``,
    `| Request | Baseline → candidate | Difference | Why |`,
    `| --- | --- | --- | --- |`,
  );
  for (const r of expected) {
    lines.push(
      `| \`${key(r)}\` | ${r.liveStatus} → ${r.localStatus} | ${r.diffs.join("; ").replace(/\|/g, "\\|").slice(0, 200)} | ${expectation(r).why} |`,
    );
  }
  lines.push("");
}
if (failed.length) {
  lines.push(
    `### Unexplained differences`,
    ``,
    `| Request | Baseline → candidate | Difference |`,
    `| --- | --- | --- |`,
  );
  for (const r of failed)
    lines.push(
      `| \`${key(r)}\` | ${r.liveStatus} → ${r.localStatus} | ${r.diffs.join("; ").replace(/\|/g, "\\|").slice(0, 300)} |`,
    );
  lines.push("");
}
const report = lines.join("\n");
console.log(report);
if (args.report) writeFileSync(args.report, report + "\n");
process.exit(failed.length ? 1 : 0);
