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
// The registry pin moves from 0d17818 (v4.18.0), which production serves, to
// b6773ac, the v4.20.0 release (mzizi-registry#602), taking in v4.19.0 and
// v4.20.0: skills 0.15.0 (nine skills, with mukoko-design and
// mzizi-architecture), attestation provenance in ui/mzizi-verified-badge and
// app/tier-status 1.2.0 (mzizi-registry#593, which also rewrites the
// trust-model descriptions), and the v4.19.0 and v4.20.0 changelog records.
// Every difference below is a body that the new registry content changes; no
// status, header or redirect moves. Remove these entries once production
// serves b6773ac.
const PIN_B6773AC = {
  allow: ["body"],
  why: "Registry pin 0d17818 (v4.18.0) to b6773ac (v4.20.0, mzizi-registry#602): skills 0.15.0, attestation provenance and the trust-model descriptions (#593), and the v4.19.0 and v4.20.0 changelog records. Only response bodies differ.",
};
const PIN_B6773AC_REQUESTS = [
  "GET /api/v1/changelog",
  "GET /api/v1/search?q=x",
  "GET /api/v1/skills",
  "GET /api/v1/ui?node=3",
  "GET /v1/changelog",
  "GET /v1/skills",
  "GET /v1/skills/digital-hygiene",
  "GET /v1/skills/discoverability",
  "GET /v1/skills/does-not-exist",
  "GET /v1/skills/mzizi-backend",
  "GET /v1/skills/mzizi-design",
  "GET /v1/skills/mzizi-language",
  "GET /v1/skills/mzizi-roots",
  "GET /v1/skills/progress-report",
  "GET /v1/skills/summary",
  "GET /v1/ui",
  "GET /v1/ui/app-tier-status",
  "GET /v1/ui/mzizi-trust-tier-data",
  "GET /v1/ui/mzizi-verified-badge",
  "GET /v1/ui?limit=abc",
  "GET /v1/ui?node=-1",
  "GET /v1/ui?owner=mzizi",
  "GET /v1/ui?owner=nyuchi",
  "GET /v1/ui?type=registry%3Alib",
  "GET /v1/ui?type=registry%3Aui",
];
// The registry pin moves from b6773ac (v4.20.0) to efb5f3a, the v4.23.0 release
// (mzizi-registry#615), taking in v4.21.0 and v4.22.0 and the Bundu floor
// (mzizi-registry#597, #614): body text 17px, captions 14px and a 49px hit region
// on every control on every device, and the WCAG 7:1, 4.5:1 and 3:1 contrast
// floors (#610), which darken the light `-text` tier. `/v1/brand` serves
// `accessibility.minTouchTarget` 49 (production: 48) and `defaultTouchTarget` 49
// (production: 56), typography Body 17px and Caption 14px (production: 16px and
// 12px), and new `textLight` values; `/v1/architecture` and the AI instructions
// state the new sizes; component sources (`/v1/ui/{name}`, `/v1/rs/{name}`) move
// to 14px type and the size roles. Every difference below is a body that the new
// registry content changes; no status, header or redirect moves. Remove these
// entries once production serves efb5f3a.
const PIN_EFB5F3A = {
  allow: ["body"],
  why: "Registry pin b6773ac (v4.20.0) to efb5f3a (v4.23.0, mzizi-registry#615): the Bundu floor (49px hit region, 17px body, 14px captions; mzizi-registry#597, #614), the WCAG 7:1 text tier (#610) and the changelog and skills records that follow. Only response bodies differ.",
};
const PIN_EFB5F3A_REQUESTS = [
  "GET /api/v1/ai/instructions/github-copilot",
  "GET /api/v1/architecture",
  "GET /api/v1/brand",
  "GET /api/v1/ui/button",
  "GET /v1/ai/instructions/mcp-server",
  "GET /v1/ai/instructions/nyuchi-mcp-system-prompt",
  "GET /v1/architecture",
  "GET /v1/architecture/nodes/2",
  "GET /v1/brand",
  "GET /v1/ecosystem",
  "GET /v1/rs/badge",
  "GET /v1/rs/button",
  "GET /v1/rs/input",
  "GET /v1/rs/mzizi-ai-context",
  "GET /v1/rs/mzizi-alert-banner",
  "GET /v1/rs/mzizi-avatar-stack",
  "GET /v1/rs/mzizi-bottom-nav",
  "GET /v1/rs/mzizi-connectivity-bar",
  "GET /v1/rs/mzizi-empty-state",
  "GET /v1/rs/mzizi-meta-tile",
  "GET /v1/rs/mzizi-notification-center",
  "GET /v1/rs/mzizi-stats-row",
  "GET /v1/rs/mzizi-tokens-rust",
  "GET /v1/rs/status-badge",
  "GET /v1/skills/mukoko-design",
  "GET /v1/skills/mzizi-architecture",
  "GET /v1/ui/admin-page",
  "GET /v1/ui/ancestry-memorial",
  "GET /v1/ui/api-explorer-page",
  "GET /v1/ui/api-usage-meter",
  "GET /v1/ui/appointment-card",
  "GET /v1/ui/assignee-picker",
  "GET /v1/ui/avatar-group",
  "GET /v1/ui/badge",
  "GET /v1/ui/booking-calendar",
  "GET /v1/ui/button",
  "GET /v1/ui/calendar",
  "GET /v1/ui/calendar-day-view",
  "GET /v1/ui/calendar-month-view",
  "GET /v1/ui/calendar-week-view",
  "GET /v1/ui/camera-viewfinder",
  "GET /v1/ui/caption-editor",
  "GET /v1/ui/chapter-list",
  "GET /v1/ui/chart-bar-label",
  "GET /v1/ui/chart-bar-label-custom",
  "GET /v1/ui/chart-line-label",
  "GET /v1/ui/chart-line-label-custom",
  "GET /v1/ui/chart-radar-label-custom",
  "GET /v1/ui/chart-radar-radius",
  "GET /v1/ui/chat-list",
  "GET /v1/ui/co-author-strip",
  "GET /v1/ui/code-block",
  "GET /v1/ui/command-center",
  "GET /v1/ui/comment-on-paragraph",
  "GET /v1/ui/content-calendar",
  "GET /v1/ui/dao-proposal-card",
  "GET /v1/ui/deployment-status-card",
  "GET /v1/ui/discover-search",
  "GET /v1/ui/driver-profile-card",
  "GET /v1/ui/endpoint-card",
  "GET /v1/ui/escrow-status",
  "GET /v1/ui/event-block",
  "GET /v1/ui/exchange-rate",
  "GET /v1/ui/feature-flag-toggle",
  "GET /v1/ui/field",
  "GET /v1/ui/gas-estimator",
  "GET /v1/ui/group-info-card",
  "GET /v1/ui/health-record-summary",
  "GET /v1/ui/input",
  "GET /v1/ui/invite-link",
  "GET /v1/ui/itinerary-timeline",
  "GET /v1/ui/kbd",
  "GET /v1/ui/location-picker",
  "GET /v1/ui/location-share",
  "GET /v1/ui/log-viewer",
  "GET /v1/ui/map-card",
  "GET /v1/ui/map-marker",
  "GET /v1/ui/map-view",
  "GET /v1/ui/media-filter-strip",
  "GET /v1/ui/medication-reminder",
  "GET /v1/ui/member-list",
  "GET /v1/ui/mention-input",
  "GET /v1/ui/mobile-money-selector",
  "GET /v1/ui/moderation-queue-item",
  "GET /v1/ui/music-selector",
  "GET /v1/ui/mzizi-ai-context",
  "GET /v1/ui/mzizi-alert-banner",
  "GET /v1/ui/mzizi-application-tracker",
  "GET /v1/ui/mzizi-article-card",
  "GET /v1/ui/mzizi-avatar-stack",
  "GET /v1/ui/mzizi-badge-display",
  "GET /v1/ui/mzizi-bottom-nav",
  "GET /v1/ui/mzizi-calendar",
  "GET /v1/ui/mzizi-command-palette",
  "GET /v1/ui/mzizi-commute-card",
  "GET /v1/ui/mzizi-content-composer",
  "GET /v1/ui/mzizi-conversation-row",
  "GET /v1/ui/mzizi-cover-wash-header",
  "GET /v1/ui/mzizi-create-listing",
  "GET /v1/ui/mzizi-credential-card",
  "GET /v1/ui/mzizi-detail-layout",
  "GET /v1/ui/mzizi-detail-page",
  "GET /v1/ui/mzizi-empty-state",
  "GET /v1/ui/mzizi-event-card",
  "GET /v1/ui/mzizi-feed-page",
  "GET /v1/ui/mzizi-forecast-card",
  "GET /v1/ui/mzizi-group-card",
  "GET /v1/ui/mzizi-health-dashboard",
  "GET /v1/ui/mzizi-job-card",
  "GET /v1/ui/mzizi-leaderboard-row",
  "GET /v1/ui/mzizi-lesson-card",
  "GET /v1/ui/mzizi-listing-card",
  "GET /v1/ui/mzizi-media",
  "GET /v1/ui/mzizi-message-bubble",
  "GET /v1/ui/mzizi-meta-tile",
  "GET /v1/ui/mzizi-mission-card",
  "GET /v1/ui/mzizi-notification-center",
  "GET /v1/ui/mzizi-notification-item",
  "GET /v1/ui/mzizi-offer-card",
  "GET /v1/ui/mzizi-payment-summary",
  "GET /v1/ui/mzizi-phrase-card",
  "GET /v1/ui/mzizi-place-card",
  "GET /v1/ui/mzizi-profile-block",
  "GET /v1/ui/mzizi-profile-page-layout",
  "GET /v1/ui/mzizi-programme-item",
  "GET /v1/ui/mzizi-provider-card",
  "GET /v1/ui/mzizi-registration-card",
  "GET /v1/ui/mzizi-resilience",
  "GET /v1/ui/mzizi-review-card",
  "GET /v1/ui/mzizi-route-planner",
  "GET /v1/ui/mzizi-rsvp-button",
  "GET /v1/ui/mzizi-search-view",
  "GET /v1/ui/mzizi-share-card",
  "GET /v1/ui/mzizi-sidebar",
  "GET /v1/ui/mzizi-sidebar-nav",
  "GET /v1/ui/mzizi-source-badge",
  "GET /v1/ui/mzizi-stats-row",
  "GET /v1/ui/mzizi-ticket-card",
  "GET /v1/ui/mzizi-timeline",
  "GET /v1/ui/mzizi-tokens-arkts",
  "GET /v1/ui/mzizi-tokens-globals",
  "GET /v1/ui/mzizi-tokens-kotlin",
  "GET /v1/ui/mzizi-tokens-python",
  "GET /v1/ui/mzizi-tokens-react-native",
  "GET /v1/ui/mzizi-tokens-rust",
  "GET /v1/ui/mzizi-tokens-swift",
  "GET /v1/ui/mzizi-tokens-typescript",
  "GET /v1/ui/mzizi-trust-meter",
  "GET /v1/ui/native-select",
  "GET /v1/ui/nearby-list",
  "GET /v1/ui/nft-card",
  "GET /v1/ui/node-status-card",
  "GET /v1/ui/note-editor",
  "GET /v1/ui/notification-bell",
  "GET /v1/ui/notification-center",
  "GET /v1/ui/novel-cover",
  "GET /v1/ui/onboarding-flow",
  "GET /v1/ui/permission-badge",
  "GET /v1/ui/pinned-message",
  "GET /v1/ui/pod-storage-meter",
  "GET /v1/ui/poll",
  "GET /v1/ui/read-receipts",
  "GET /v1/ui/reminder-card",
  "GET /v1/ui/revenue-dashboard-widget",
  "GET /v1/ui/route-card",
  "GET /v1/ui/schema-viewer",
  "GET /v1/ui/search-bar",
  "GET /v1/ui/send-money-flow",
  "GET /v1/ui/session-list",
  "GET /v1/ui/sidebar",
  "GET /v1/ui/split-bill",
  "GET /v1/ui/status-badge",
  "GET /v1/ui/stop-card",
  "GET /v1/ui/symptom-checker",
  "GET /v1/ui/task-board",
  "GET /v1/ui/time-picker",
  "GET /v1/ui/todo-item",
  "GET /v1/ui/token-balance-card",
  "GET /v1/ui/transaction-receipt",
  "GET /v1/ui/translation-indicator",
  "GET /v1/ui/ui-variants",
  "GET /v1/ui/user-management-row",
  "GET /v1/ui/verification-review-card",
  "GET /v1/ui/video-trimmer",
  "GET /v1/ui/vitals-display",
  "GET /v1/ui/voice-note-player",
  "GET /v1/ui/wallet-card",
  "GET /v1/ui/wallet-connect-button",
];
const EXPECTED = {
  ...Object.fromEntries(PIN_B6773AC_REQUESTS.map((r) => [r, PIN_B6773AC])),
  ...Object.fromEntries(PIN_EFB5F3A_REQUESTS.map((r) => [r, PIN_EFB5F3A])),
  // A request both pins change carries both reasons.
  ...Object.fromEntries(
    PIN_B6773AC_REQUESTS.filter((r) => PIN_EFB5F3A_REQUESTS.includes(r)).map(
      (r) => [
        r,
        {
          allow: ["body"],
          why: PIN_B6773AC.why + " " + PIN_EFB5F3A.why,
        },
      ],
    ),
  ),
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
