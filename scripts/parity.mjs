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
 * registry v4.10.0).
 */
// The registry pin moves from registry main 7567c0b (v4.10.0) to 780457a, the
// v4.17.0 release (mzizi-registry#580), taking in v4.11.0 to v4.17.0: 19 new
// components (656 to 675; N2 388 to 394, N3 74 to 84, N6 90 to 93), the kweli
// brand entry and its marks, --radius-xs, the --tier-*, --assurance-* and
// --attestation-* roles, and new versions of existing components. Every
// difference below is a 200 body that the new registry content changes; no
// status, header or redirect moves. The earlier BRAND_ADDED entry is gone:
// production serves those keys since the v0.8.0 release (#78). Remove these
// entries once production serves 780457a.
const PIN_780457A = {
  allow: ["body"],
  why: "Registry pin 7567c0b (v4.10.0) to 780457a (v4.17.0, mzizi-registry#580): new components, the kweli brand entry and marks, --radius-xs and the trust-model token roles, and updated component sources and descriptions. Only response bodies differ.",
};
const PIN_780457A_REQUESTS = [
  "GET /api/v1/architecture",
  "GET /api/v1/brand",
  "GET /api/v1/changelog",
  "GET /api/v1/search?layer=2",
  "GET /api/v1/search?q=x",
  "GET /api/v1/stats",
  "GET /api/v1/ui?node=3",
  "GET /api/v1",
  "GET /v1/architecture/nodes/2",
  "GET /v1/architecture/nodes/3",
  "GET /v1/architecture/nodes/6",
  "GET /v1/architecture",
  "GET /v1/brand",
  "GET /v1/changelog/4.10.0",
  "GET /v1/changelog",
  "GET /v1/rs/mzizi-alert-banner",
  "GET /v1/rs/mzizi-cover-header",
  "GET /v1/rs/mzizi-gauge-card",
  "GET /v1/rs/mzizi-suitability-card",
  "GET /v1/rs/mzizi-tokens-rust",
  "GET /v1/search?category=primitives",
  "GET /v1/search?layer=2",
  "GET /v1/search?layer=3&node=2",
  "GET /v1/search?node=2",
  "GET /v1/search?q=button&node=2&category=primitives",
  "GET /v1/search?q=button",
  "GET /v1/stats?days=500",
  "GET /v1/stats?days=7",
  "GET /v1/stats?days=abc",
  "GET /v1/stats",
  "GET /v1/ui?collection=components",
  "GET /v1/ui?collection=documentation",
  "GET /v1/ui?collection=primitives",
  "GET /v1/ui?limit=0",
  "GET /v1/ui?limit=abc",
  "GET /v1/ui?node=-1",
  "GET /v1/ui?node=2&limit=5&offset=3",
  "GET /v1/ui?node=2",
  "GET /v1/ui?node=999",
  "GET /v1/ui?offset=570",
  "GET /v1/ui?owner=framework",
  "GET /v1/ui?owner=mzizi",
  "GET /v1/ui?owner=nyuchi",
  "GET /v1/ui?type=registry%3Abase",
  "GET /v1/ui?type=registry%3Ablock",
  "GET /v1/ui?type=registry%3Ahook",
  "GET /v1/ui?type=registry%3Aitem",
  "GET /v1/ui?type=registry%3Alib",
  "GET /v1/ui?type=registry%3Atheme",
  "GET /v1/ui?type=registry%3Aui",
  "GET /v1/ui/ancestry-memorial",
  "GET /v1/ui/api-usage-meter",
  "GET /v1/ui/app-brand-mark",
  "GET /v1/ui/app-data-table",
  "GET /v1/ui/app-form-field",
  "GET /v1/ui/chart-area-icons",
  "GET /v1/ui/chart-area-legend",
  "GET /v1/ui/chart-bar-interactive",
  "GET /v1/ui/chart-bar-mixed",
  "GET /v1/ui/chart-bar-multiple",
  "GET /v1/ui/chart-line-multiple",
  "GET /v1/ui/chart-pie-donut-active",
  "GET /v1/ui/chart-pie-donut-text",
  "GET /v1/ui/chart-pie-donut",
  "GET /v1/ui/chart-pie-interactive",
  "GET /v1/ui/chart-pie-label-custom",
  "GET /v1/ui/chart-pie-label-list",
  "GET /v1/ui/chart-pie-label",
  "GET /v1/ui/chart-pie-legend",
  "GET /v1/ui/chart-pie-separator-none",
  "GET /v1/ui/chart-pie-simple",
  "GET /v1/ui/chart-pie-stacked",
  "GET /v1/ui/chart-radar-grid-custom",
  "GET /v1/ui/chart-radial-shape",
  "GET /v1/ui/chart-tooltip-icons",
  "GET /v1/ui/discover-category-chip",
  "GET /v1/ui/driver-profile-card",
  "GET /v1/ui/escrow-status",
  "GET /v1/ui/filter-bar",
  "GET /v1/ui/individual-profile-page",
  "GET /v1/ui/itinerary-timeline",
  "GET /v1/ui/maintenance-page",
  "GET /v1/ui/map-marker",
  "GET /v1/ui/moderation-queue-item",
  "GET /v1/ui/mzizi-alert-banner",
  "GET /v1/ui/mzizi-calendar",
  "GET /v1/ui/mzizi-cover-header",
  "GET /v1/ui/mzizi-cover-wash-header",
  "GET /v1/ui/mzizi-create-listing",
  "GET /v1/ui/mzizi-event-card",
  "GET /v1/ui/mzizi-footer",
  "GET /v1/ui/mzizi-gauge-card",
  "GET /v1/ui/mzizi-group-card",
  "GET /v1/ui/mzizi-harness-prewire",
  "GET /v1/ui/mzizi-harness",
  "GET /v1/ui/mzizi-icons",
  "GET /v1/ui/mzizi-notification-item",
  "GET /v1/ui/mzizi-offer-card",
  "GET /v1/ui/mzizi-permission-gate",
  "GET /v1/ui/mzizi-place-card",
  "GET /v1/ui/mzizi-profile-block",
  "GET /v1/ui/mzizi-programme-item",
  "GET /v1/ui/mzizi-provider-card",
  "GET /v1/ui/mzizi-resilience",
  "GET /v1/ui/mzizi-review-card",
  "GET /v1/ui/mzizi-search-view",
  "GET /v1/ui/mzizi-source-badge",
  "GET /v1/ui/mzizi-suitability-card",
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
  "GET /v1/ui/mzizi-tokens",
  "GET /v1/ui/mzizi-trust-gate",
  "GET /v1/ui/mzizi-trust-meter",
  "GET /v1/ui/mzizi-verified-badge",
  "GET /v1/ui/mzizi-wallet-gate",
  "GET /v1/ui/nft-card",
  "GET /v1/ui/note-card",
  "GET /v1/ui/org-profile-page",
  "GET /v1/ui/permission-badge",
  "GET /v1/ui/priority-selector",
  "GET /v1/ui/rating",
  "GET /v1/ui/reminder-card",
  "GET /v1/ui/route-card",
  "GET /v1/ui/schema-viewer",
  "GET /v1/ui/site-icons",
  "GET /v1/ui/symptom-checker",
  "GET /v1/ui/task-board",
  "GET /v1/ui/timeline",
  "GET /v1/ui/ui-utils",
  "GET /v1/ui/ui-variants",
  "GET /v1/ui/verification-review-card",
  "GET /v1/ui",
  "GET /v1",
];
const EXPECTED = {
  ...Object.fromEntries(PIN_780457A_REQUESTS.map((r) => [r, PIN_780457A])),
  // A trailing `/*` matches every path under that prefix. Used here because the
  // no-Rust answer is one 404 per component (596 slugs), and only its message differs.
  "GET /v1/rs/*": {
    allow: ["body"],
    status: 404,
    only: "body $.message:",
    why: "Roots copy: the no-Rust 404 message now says the component has no Mzizi Roots (Rust) build yet, and that Roots is moving to Mzizi's own Rust renderer (Dioxus was the wording before). Status, error text and every 200 body are unchanged. Remove this entry once production serves the new message.",
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
