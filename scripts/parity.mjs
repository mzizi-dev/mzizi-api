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
import http from "node:http";
import https from "node:https";
import { compareBodies, normaliseBody } from "./parity-body.mjs";

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
 * `added` is narrower than allowing `body`, for a change that only adds keys
 * to the objects of a JSON array:
 * `{ "<top-level key>": { "<new key>": "<value check>", … } }`, where the value
 * check is one of `VALUE_CHECKS` in `scripts/parity-body.mjs` (`hex`,
 * `nonEmptyString`, `index`, `mineralFamily`). Every element of each listed
 * array must be an object carrying every listed key, with a value that passes
 * its check; with those keys removed the body must equal the baseline exactly,
 * key order included. Only then is the difference the kind `body:added`,
 * which the entry's `allow` must name. Anything else, including a non-object
 * element or a null or mistyped added value, stays a plain `body` difference
 * and fails the run.
 *
 * The baseline is api.mzizi.dev, which this Worker already serves, so these
 * are only what the current registry pin changes. Earlier bumps' entries are in
 * the PRs that made them (mzizi-api-gateway#13 for the cutover, #18 for
 * skills 0.8.0, #20 for skills 0.8.1 and the mzizi brand row, #21 for
 * mzizi's hematite default `--primary`, #22 for skills 0.8.2, #25 for skills 0.8.4
 * and the `-text` colour tokens, #27 for skills 0.8.5, #31 for the
 * `mzizi-tokens` description that mzizi-registry#389 rewrote, #37 for
 * shamwari's sodalite accent from mzizi-registry#407, 16742ab for
 * Mukoko Events replacing nhimbe from mzizi-registry#411, #51 for the
 * 409a047 hand pin and the /v1/astro OpenAPI paths, #53 for 2902393, registry
 * v4.3.0, #56 for 5067b5e, registry v4.4.0, #60 for 9f3631c, registry v4.5.0, #65 for 0caf9dc, registry v4.6.0, #68 for 81a37ed,
 * registry v4.7.0, #70 for f70703d, registry v4.8.0, #83 for 7567c0b,
 * registry v4.10.0, #96 for 780457a, registry v4.17.0, #97 for 0d17818,
 * registry v4.18.0, #100 for the binary-only items, and the PR that pins
 * b6773ac, registry v4.20.0).
 */
// The binary-only items' entries (four kweli PNGs, 404 → 200) and the Roots
// 404-message entry (`GET /v1/rs/*`) were pruned once production served them
// (they are in #100 and #76). A trailing `/*` key still matches every path
// under that prefix.
// Production serves registry 4b488a2 (v4.45.0), so the entries that bridged
// 7c6449a to 4b488a2 were pruned (they are in mzizi-api#163). The entries for this
// bump are REG_93600F0 below.
// Pin 4b488a2 (v4.45.0, what production serves) to 93600f0, the merge of
// mzizi-registry#752 on top of v4.49.0 (66aea7e) (mzizi-api#166, #167). Each entry
// is one intended consequence of the registry diff 4b488a2...93600f0. Bodies only;
// every one of the 296 differences is 200 -> 200, and status, headers and shapes
// are unchanged.
const REG_93600F0 = {
  titles:
    'Wordmarks take an initial capital (owner 2026-11-23, mzizi-registry#752): generated item titles read "Mzizi Listing Card", not "mzizi Listing Card". Only the title differs; names and slugs are unchanged.',
  brand:
    "Brand rulings (owner 2026-11-23, mzizi-registry#752): voiceAndTone says to write wordmarks with an initial capital, Shamwari is an AI companion with open weights (not sovereign AI), the bundu row names pillars, initiatives, projects and the Mukoko apps (no sister brands), plus the v4.46 to v4.49 brand text.",
  changelog: "Changelog gains the 4.46.0 to 4.49.0 releases (newest 4.49.0).",
  data: "Registry v4.46.0 to v4.49.0 data and #752: component sources, docs, descriptions, the skills bundle, the architecture strands, AI instructions and the doctrine as the registry now ships them, with wordmarks capitalised in prose.",
};
const expectFor = (why, paths) =>
  Object.fromEntries(paths.map((p) => [`GET ${p}`, { allow: ["body"], why }]));
const REG_93600F0_ENTRIES = {
  ...Object.fromEntries(
    [
      "/v1/ui/kweli-apple-touch-icon",
      "/v1/ui/kweli-favicon",
      "/v1/ui/kweli-icon-192",
      "/v1/ui/kweli-icon-512",
      "/v1/ui/kweli-icon-maskable-512",
      "/v1/ui/kweli-mark-dark",
      "/v1/ui/kweli-mark-light",
      "/v1/ui/mzizi-a11y",
      "/v1/ui/mzizi-a11y-audit",
      "/v1/ui/mzizi-abr-content",
      "/v1/ui/mzizi-action-sheet",
      "/v1/ui/mzizi-ai-context",
      "/v1/ui/mzizi-alert-banner",
      "/v1/ui/mzizi-alert-engine",
      "/v1/ui/mzizi-api-probe",
      "/v1/ui/mzizi-application-tracker",
      "/v1/ui/mzizi-article-card",
      "/v1/ui/mzizi-auth-card",
      "/v1/ui/mzizi-auth-layout",
      "/v1/ui/mzizi-avatar-stack",
      "/v1/ui/mzizi-badge-display",
      "/v1/ui/mzizi-balance-display",
      "/v1/ui/mzizi-base",
      "/v1/ui/mzizi-bottom-nav",
      "/v1/ui/mzizi-calendar",
      "/v1/ui/mzizi-chain-gate",
      "/v1/ui/mzizi-chain-resilience",
      "/v1/ui/mzizi-changelog-renderer",
      "/v1/ui/mzizi-chaos",
      "/v1/ui/mzizi-command-palette",
      "/v1/ui/mzizi-commute-card",
      "/v1/ui/mzizi-conformity-check",
      "/v1/ui/mzizi-connectivity-bar",
      "/v1/ui/mzizi-content-composer",
      "/v1/ui/mzizi-content-gate",
      "/v1/ui/mzizi-conversation-row",
      "/v1/ui/mzizi-cover-header",
      "/v1/ui/mzizi-cover-wash-header",
      "/v1/ui/mzizi-create-listing",
      "/v1/ui/mzizi-create-page",
      "/v1/ui/mzizi-credential-card",
      "/v1/ui/mzizi-crypto-fallback",
      "/v1/ui/mzizi-crypto-gate",
      "/v1/ui/mzizi-dashboard-layout",
      "/v1/ui/mzizi-data",
      "/v1/ui/mzizi-deep-link-handler",
      "/v1/ui/mzizi-degradation-chain",
      "/v1/ui/mzizi-detail-layout",
      "/v1/ui/mzizi-detail-page",
      "/v1/ui/mzizi-did-gate",
      "/v1/ui/mzizi-docs-api",
      "/v1/ui/mzizi-docs-engine",
      "/v1/ui/mzizi-dx",
      "/v1/ui/mzizi-email-preview",
      "/v1/ui/mzizi-empty-screen",
      "/v1/ui/mzizi-empty-state",
      "/v1/ui/mzizi-error-screen",
      "/v1/ui/mzizi-error-set",
      "/v1/ui/mzizi-error-tracker",
      "/v1/ui/mzizi-escalation-card",
      "/v1/ui/mzizi-event-card",
      "/v1/ui/mzizi-feature-gate",
      "/v1/ui/mzizi-featured-card",
      "/v1/ui/mzizi-feed-page",
      "/v1/ui/mzizi-footer",
      "/v1/ui/mzizi-forecast-card",
      "/v1/ui/mzizi-fundi",
      "/v1/ui/mzizi-fundi-learning",
      "/v1/ui/mzizi-fundi-reporter",
      "/v1/ui/mzizi-gauge-card",
      "/v1/ui/mzizi-geo-gate",
      "/v1/ui/mzizi-grid",
      "/v1/ui/mzizi-group-card",
      "/v1/ui/mzizi-harness",
      "/v1/ui/mzizi-harness-prewire",
      "/v1/ui/mzizi-header",
      "/v1/ui/mzizi-health-dashboard",
      "/v1/ui/mzizi-hero-stat",
      "/v1/ui/mzizi-icons",
      "/v1/ui/mzizi-incident-manager",
      "/v1/ui/mzizi-job-card",
      "/v1/ui/mzizi-layout",
      "/v1/ui/mzizi-leaderboard-row",
      "/v1/ui/mzizi-lesson-card",
      "/v1/ui/mzizi-listing-card",
      "/v1/ui/mzizi-load-shedder",
      "/v1/ui/mzizi-locale",
      "/v1/ui/mzizi-mark-dark",
      "/v1/ui/mzizi-mark-light",
      "/v1/ui/mzizi-media",
      "/v1/ui/mzizi-message-bubble",
      "/v1/ui/mzizi-meta-tile",
      "/v1/ui/mzizi-mini-app-runtime",
      "/v1/ui/mzizi-mission-card",
      "/v1/ui/mzizi-moderation-gate",
      "/v1/ui/mzizi-motion",
      "/v1/ui/mzizi-notification-center",
      "/v1/ui/mzizi-notification-item",
      "/v1/ui/mzizi-offer-card",
      "/v1/ui/mzizi-offline-gate",
      "/v1/ui/mzizi-onboarding-step",
      "/v1/ui/mzizi-otel",
      "/v1/ui/mzizi-page",
      "/v1/ui/mzizi-payment-mandate-card",
      "/v1/ui/mzizi-payment-summary",
      "/v1/ui/mzizi-perf-probe",
      "/v1/ui/mzizi-permission-gate",
      "/v1/ui/mzizi-persistent-player",
      "/v1/ui/mzizi-phrase-card",
      "/v1/ui/mzizi-place-card",
      "/v1/ui/mzizi-platform",
      "/v1/ui/mzizi-platform-health",
      "/v1/ui/mzizi-prefetch-boundary",
      "/v1/ui/mzizi-product-card",
      "/v1/ui/mzizi-product-results",
      "/v1/ui/mzizi-profile-block",
      "/v1/ui/mzizi-profile-header",
      "/v1/ui/mzizi-profile-page",
      "/v1/ui/mzizi-profile-page-layout",
      "/v1/ui/mzizi-profile-settings",
      "/v1/ui/mzizi-programme-item",
      "/v1/ui/mzizi-provider-card",
      "/v1/ui/mzizi-rate-gate",
      "/v1/ui/mzizi-registration-card",
      "/v1/ui/mzizi-resilience",
      "/v1/ui/mzizi-review-card",
      "/v1/ui/mzizi-root-layout",
      "/v1/ui/mzizi-route-guard",
      "/v1/ui/mzizi-route-planner",
      "/v1/ui/mzizi-rsvp-button",
      "/v1/ui/mzizi-rum",
      "/v1/ui/mzizi-search-view",
      "/v1/ui/mzizi-section",
      "/v1/ui/mzizi-seo",
      "/v1/ui/mzizi-settings-page",
      "/v1/ui/mzizi-share-card",
      "/v1/ui/mzizi-sidebar",
      "/v1/ui/mzizi-sidebar-nav",
      "/v1/ui/mzizi-skeleton-set",
      "/v1/ui/mzizi-source-badge",
      "/v1/ui/mzizi-splash-screen",
      "/v1/ui/mzizi-stats-row",
      "/v1/ui/mzizi-success-screen",
      "/v1/ui/mzizi-suitability-card",
      "/v1/ui/mzizi-sync-status",
      "/v1/ui/mzizi-synthetic-probe",
      "/v1/ui/mzizi-theme-provider",
      "/v1/ui/mzizi-ticket-card",
      "/v1/ui/mzizi-timeline",
      "/v1/ui/mzizi-toast-provider",
      "/v1/ui/mzizi-tokens",
      "/v1/ui/mzizi-tokens-arkts",
      "/v1/ui/mzizi-tokens-globals",
      "/v1/ui/mzizi-tokens-kotlin",
      "/v1/ui/mzizi-tokens-python",
      "/v1/ui/mzizi-tokens-react-native",
      "/v1/ui/mzizi-tokens-rust",
      "/v1/ui/mzizi-tokens-swift",
      "/v1/ui/mzizi-tokens-typescript",
      "/v1/ui/mzizi-transaction-row",
      "/v1/ui/mzizi-trust-gate",
      "/v1/ui/mzizi-trust-meter",
      "/v1/ui/mzizi-trust-tier-data",
      "/v1/ui/mzizi-trust-tiers",
      "/v1/ui/mzizi-update-prompt",
      "/v1/ui/mzizi-user-card",
      "/v1/ui/mzizi-user-menu",
      "/v1/ui/mzizi-verified-badge",
      "/v1/ui/mzizi-wallet-gate",
      "/v1/ui/mzizi-washed-theme",
    ].map((p) => [
      `GET ${p}`,
      { allow: ["body"], only: "body $.title:", why: REG_93600F0.titles },
    ]),
  ),
  ...expectFor(REG_93600F0.brand, [
    "/api/v1/brand",
    "/v1/brand",
    "/v1/ecosystem",
  ]),
  ...expectFor(REG_93600F0.changelog, ["/api/v1/changelog", "/v1/changelog"]),
  ...expectFor(REG_93600F0.data, [
    "/api/v1/architecture",
    "/api/v1/search?layer=2",
    "/api/v1/search?q=x",
    "/api/v1/skills",
    "/api/v1/ui?node=3",
    "/v1/ai/instructions/mcp-server",
    "/v1/ai/instructions/nyuchi-mcp-system-prompt",
    "/v1/architecture",
    "/v1/rs/input",
    "/v1/rs/mzizi-ai-context",
    "/v1/rs/mzizi-alert-banner",
    "/v1/rs/mzizi-connectivity-bar",
    "/v1/rs/mzizi-docs-engine",
    "/v1/rs/mzizi-notification-center",
    "/v1/rs/mzizi-success-screen",
    "/v1/rs/mzizi-tokens-rust",
    "/v1/search?category=primitives",
    "/v1/search?layer=2",
    "/v1/search?layer=3&node=2",
    "/v1/search?node=2",
    "/v1/search?q=button",
    "/v1/skills",
    "/v1/skills/digital-hygiene",
    "/v1/skills/discoverability",
    "/v1/skills/mukoko-design",
    "/v1/skills/mzizi-architecture",
    "/v1/skills/mzizi-backend",
    "/v1/skills/mzizi-design",
    "/v1/skills/mzizi-language",
    "/v1/skills/mzizi-roots",
    "/v1/skills/pr-gates",
    "/v1/skills/progress-report",
    "/v1/skills/registry-propagation",
    "/v1/skills/ship-release",
    "/v1/skills/summary",
    "/v1/ui",
    "/v1/ui/address-code",
    "/v1/ui/address-private-row",
    "/v1/ui/address-selector",
    "/v1/ui/address-share-card",
    "/v1/ui/admin-page",
    "/v1/ui/api-explorer-page",
    "/v1/ui/app-account-menu",
    "/v1/ui/app-bar-chart",
    "/v1/ui/app-button",
    "/v1/ui/app-command-palette",
    "/v1/ui/app-data-table",
    "/v1/ui/app-detail-panel",
    "/v1/ui/app-info-tip",
    "/v1/ui/app-page-header",
    "/v1/ui/app-pagination",
    "/v1/ui/app-quick-search",
    "/v1/ui/app-shell",
    "/v1/ui/app-side-nav",
    "/v1/ui/app-switcher",
    "/v1/ui/app-tier-status",
    "/v1/ui/app-toast",
    "/v1/ui/app-toolbar",
    "/v1/ui/app-toolbar-menu",
    "/v1/ui/app-top-bar-action",
    "/v1/ui/app-workspace-switcher",
    "/v1/ui/assignee-picker",
    "/v1/ui/audio-player",
    "/v1/ui/booking-confirmation",
    "/v1/ui/caption-editor",
    "/v1/ui/checklist",
    "/v1/ui/comment-on-paragraph",
    "/v1/ui/data-explorer-page",
    "/v1/ui/dialog",
    "/v1/ui/discover-breadcrumb",
    "/v1/ui/discover-category-chip",
    "/v1/ui/discover-meta-list",
    "/v1/ui/discover-shell",
    "/v1/ui/env-editor",
    "/v1/ui/feature-flag-toggle",
    "/v1/ui/filter-bar",
    "/v1/ui/font-settings-panel",
    "/v1/ui/inline-edit",
    "/v1/ui/input",
    "/v1/ui/invite-link",
    "/v1/ui/logs-page",
    "/v1/ui/member-list",
    "/v1/ui/music-selector",
    "/v1/ui/note-editor",
    "/v1/ui/number-input",
    "/v1/ui/page-header",
    "/v1/ui/preset-picker",
    "/v1/ui/react-checkbox",
    "/v1/ui/react-input",
    "/v1/ui/react-switch",
    "/v1/ui/react-tabs",
    "/v1/ui/recurrence-picker",
    "/v1/ui/segmented-control",
    "/v1/ui/signup-05",
    "/v1/ui/site-social-icon",
    "/v1/ui/split-bill",
    "/v1/ui/subscription-card",
    "/v1/ui/symptom-checker",
    "/v1/ui/tag-input",
    "/v1/ui/time-picker",
    "/v1/ui/time-slot-picker",
    "/v1/ui/todo-item",
    "/v1/ui/toggle",
    "/v1/ui/transaction-receipt",
    "/v1/ui/ui-variants",
    "/v1/ui/vehicle-card",
    "/v1/ui/video-trimmer",
    "/v1/ui/vote-buttons",
    "/v1/ui?collection=primitives",
    "/v1/ui?limit=abc",
    "/v1/ui?node=-1",
    "/v1/ui?node=2",
    "/v1/ui?node=2&limit=5&offset=3",
    "/v1/ui?owner=mzizi",
    "/v1/ui?owner=nyuchi",
    "/v1/ui?type=registry%3Abase",
    "/v1/ui?type=registry%3Ablock",
    "/v1/ui?type=registry%3Aitem",
    "/v1/ui?type=registry%3Alib",
    "/v1/ui?type=registry%3Atheme",
    "/v1/ui?type=registry%3Aui",
  ]),
};
const EXPECTED = {
  ...REG_93600F0_ENTRIES,
  // A trailing `/*` matches every path under that prefix: one 200 per component
  // that has a Rust build.
  "GET /v1/rs/*": {
    allow: ["body"],
    status: 200,
    only: "body $.target:",
    why: 'Dioxus removal (mzizi-registry#635): /v1/rs/{name} no longer carries `target: "dioxus"`. Nothing replaces it; the API names no Rust rendering target. Only that field differs. Remove this entry once production serves the change.',
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

// Paths sent exactly as written, with no client-side resolution: `fetch`
// would resolve the dot segments and turn `\` into `/` before sending. Hono
// routes on the raw request URL while the redirect and header rules read the
// resolved pathname, so `/v1/ui/./button` is a 405 and `/v1/ui/a\b` a
// component 404, not a 200 and a route 404. `^` is percent-encoded in the
// resolved pathname. `wrangler dev` resolves the path before the Worker sees
// it, so these are compared only when neither target is local. A workers.dev
// host also resolves LITERAL `.` and `..` segments before the Worker (the TS
// Worker's own preview answers `/v1/ui/./button` with 200 where
// api.mzizi.dev answers 405), so those compare only between custom domains.
const RAW_PATHS = [
  "/v1/ui/./button",
  "/v1/ui/../ui/button",
  "/v1/ui/%2e%2e/ui/button",
  "/v1/ui/%2E/button",
  "/./v1/ui",
  "/api/../v1/ui/button",
  "/v1/ui/x/%2e%2e/button/docs",
  "/v1/ui/nyuchi-footer/../button",
  "/v1\\ui\\button",
  "/v1/ui/a\\b",
  "/nope/x^",
  "/v1/ui/x^/",
  "/v1/ui/x^",
  "/v1/ui/button/.",
  "/v1/ui/..",
  "/v1/./ui?x=1",
  "/v1/ui/nyuchi-a11y/./docs",
  "/api/v1/./health",
];
const isLocal = (base) =>
  ["localhost", "127.0.0.1", "[::1]"].includes(new URL(base).hostname);
const isWorkersDev = (base) => new URL(base).hostname.endsWith(".workers.dev");
const RAW_COMPARABLE = !isLocal(LIVE) && !isLocal(LOCAL);
const DOTS_COMPARABLE =
  RAW_COMPARABLE && !isWorkersDev(LIVE) && !isWorkersDev(LOCAL);
/** A literal `.` or `..` segment, which a workers.dev host resolves. */
const hasDotSegment = (p) =>
  p
    .split("?")[0]
    .split(/[/\\]/)
    .some((s) => s === "." || s === "..");
const rawPaths = RAW_PATHS.filter((p) => DOTS_COMPARABLE || !hasDotSegment(p));

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
  ...(RAW_COMPARABLE
    ? rawPaths.flatMap((p) =>
        ["GET", "HEAD", "OPTIONS"].map((method) => ({
          method,
          path: p,
          raw: true,
        })),
      )
    : []),
];

/** One request with the path on the wire exactly as given. */
function rawRequest(base, method, path) {
  const url = new URL(base);
  const client = url.protocol === "https:" ? https : http;
  return new Promise((resolve, reject) => {
    const req = client.request(
      { host: url.hostname, port: url.port || undefined, method, path },
      (res) => {
        let text = "";
        res.setEncoding("utf8");
        res.on("data", (c) => (text += c));
        res.on("end", () =>
          resolve({
            status: res.statusCode,
            headers: { get: (h) => res.headers[h] ?? null },
            text: async () => text,
          }),
        );
      },
    );
    req.on("error", reject);
    req.end();
  });
}

// ── Run ─────────────────────────────────────────────────────────────────────
async function hit(base, { method, path, raw }) {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = raw
        ? await rawRequest(base, method, path)
        : await fetch(base + path, { method, redirect: "manual" });
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
      const body = compareBodies(
        normaliseBody(req.path, live.status, live.text),
        normaliseBody(req.path, local.status, local.text),
        live.headers["content-type"],
        STRICT
          ? undefined
          : (EXPECTED[`${req.method} ${req.path}`] ??
              EXPECTED[`* ${req.path}`]),
      );
      if (body) {
        kinds.push(body.kind);
        diffs.push(body.diff);
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

// ── Names only the candidate lists ──────────────────────────────────────────
// The request list above comes from the BASELINE index, so a component that is
// new at the candidate's pin is never probed: production has no such page to
// compare with. That is how four PNG-only items that answered 404 on
// /v1/ui/{name} passed parity at registry v4.18.0 while /v1/ui listed them.
// Every name the candidate lists and the baseline does not is checked against
// the contract instead: /v1/ui/{name} answers 200 with a `files` array, and
// /v1/rs/{name} answers 200 or 404 (a component with no Rust build), never a
// 5xx. These checks have no baseline to differ from, so EXPECTED never excuses
// them, with or without --strict.
const candidateNames = (await (await fetch(`${LOCAL}/v1/ui`)).json()).items.map(
  (i) => i.name,
);
const liveNames = new Set(names);
const newNames = candidateNames.filter((n) => !liveNames.has(n));
const newFailures = [];
let newCursor = 0;
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    while (newCursor < newNames.length) {
      const name = newNames[newCursor++];
      const ui = await hit(LOCAL, { method: "GET", path: `/v1/ui/${name}` });
      let files;
      try {
        files = JSON.parse(ui.text).files;
      } catch {
        files = undefined;
      }
      if (ui.status !== 200 || !Array.isArray(files))
        newFailures.push(
          `\`GET /v1/ui/${name}\` answered ${ui.status}${ui.status === 200 ? " without a files array" : ""}`,
        );
      const rs = await hit(LOCAL, { method: "GET", path: `/v1/rs/${name}` });
      if (rs.status !== 200 && rs.status !== 404)
        newFailures.push(`\`GET /v1/rs/${name}\` answered ${rs.status}`);
    }
  }),
);
newFailures.sort((a, b) => a.localeCompare(b));

results.sort((a, b) => (a.path + a.method).localeCompare(b.path + b.method));
const key = (r) => `${r.method} ${r.path}`;
const expectation = (r) => {
  if (STRICT) return undefined;
  const prefix = Object.keys(EXPECTED).find(
    (k) => k.endsWith("/*") && key(r).startsWith(k.slice(0, -1)),
  );
  const e =
    EXPECTED[key(r)] ??
    EXPECTED[`* ${r.path}`] ??
    (prefix ? EXPECTED[prefix] : undefined);
  if (!e || !r.kinds.every((k) => e.allow.includes(k))) return undefined;
  if (e.status !== undefined && r.liveStatus !== e.status) return undefined;
  if (e.only !== undefined && !r.diffs.every((d) => d.startsWith(e.only)))
    return undefined;
  return e;
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
  `| Names only the candidate lists, checked against the contract | ${newNames.length} |`,
  `| **Of those, failing the contract** | **${newFailures.length}** |`,
  ``,
  RAW_COMPARABLE
    ? `Includes ${rawPaths.length * 3} requests with the path sent as-is (dot segments, backslashes, \`^\`)` +
      (DOTS_COMPARABLE
        ? "."
        : `; skipped ${(RAW_PATHS.length - rawPaths.length) * 3} with a literal \`.\` or \`..\` segment, which a workers.dev host resolves before the Worker.`)
    : `Skipped ${RAW_PATHS.length * 3} requests with the path sent as-is: a local \`wrangler dev\` resolves the path before the Worker sees it, so they compare only between deployed Workers.`,
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
if (newFailures.length) {
  lines.push(
    `### Names only the candidate lists that fail the contract`,
    ``,
    ...newFailures.map((f) => `- ${f}`),
    ``,
  );
}
const report = lines.join("\n");
console.log(report);
if (args.report) writeFileSync(args.report, report + "\n");
process.exit(failed.length || newFailures.length ? 1 : 0);
