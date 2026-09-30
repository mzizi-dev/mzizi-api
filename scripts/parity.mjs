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
 * skills 0.8.0).
 */
// mzizi-registry#381: `@nyuchi/mzizi-skills` ^0.8.0 -> ^0.8.1. Still the same
// five skills; `meta.version` is 0.8.1, and every skill's `source` names the
// repository that really holds it (mzizi-dev/agent-tools, mzizi-skills/) instead
// of the old `mzizi-tools/mzizi-skills` path. #381 also rewrote N12's text and
// the /skills examples in openapi.yaml. mzizi-registry#378 adds the mzizi row
// (mineral hematite) to the brand ecosystem table. #379, also in this range,
// adds only the public plugin's files, which the API doesn't serve.
const SKILLS_081 =
  "mzizi-registry#381 serves @nyuchi/mzizi-skills 0.8.1: the same five skills, `meta.version` 0.8.1, and each skill's `source` is `mzizi-dev/agent-tools/mzizi-skills/skills/<name>` (was `mzizi-tools/mzizi-skills/skills/<name>`).";
const SKILLS = [
  "mzizi-language",
  "mzizi-design",
  "mzizi-backend",
  "discoverability",
];
const N12 =
  "mzizi-registry#381 rewrites the N12 skills rung: skills are authored in mzizi-dev/agent-tools and served from the published package, with no database projection (`role`, `description`, `implementation_rules[2..3]`).";
const OPENAPI =
  "mzizi-registry#381 updates openapi.yaml's /skills docs: the retired `nyuchi-design skills` CLI subcommands are gone from two descriptions, and the skill-name example is `mzizi-design`.";
const BRAND =
  "mzizi-registry#378 adds the mzizi row to the ecosystem table (`ecosystem[17]`: meaning Root, Swahili, mineral hematite).";
const EXPECTED = {
  "GET /v1/skills": {
    allow: ["body"],
    why: `${SKILLS_081} The list carries the five new \`source\` values.`,
  },
  "GET /api/v1/skills": {
    allow: ["body"],
    why: `${SKILLS_081} The /api/v1 spelling serves the same list.`,
  },
  "GET /v1/skills/summary": {
    allow: ["body"],
    why: `${SKILLS_081} The summary carries the same five \`source\` values.`,
  },
  ...Object.fromEntries(
    SKILLS.map((name) => [
      `GET /v1/skills/${name}`,
      {
        allow: ["body"],
        why: `${SKILLS_081} \`${name}\`'s text is unchanged; only \`source\` and \`meta.version\` differ.`,
      },
    ]),
  ),
  "GET /v1/skills/mzizi-roots": {
    allow: ["body"],
    why: `${SKILLS_081} \`mzizi-roots\`'s 0.8.1 text also replaces the private agent-tools plugin install with the public plugin (\`/plugin marketplace add mzizi-dev/mzizi-registry\`, \`/plugin install mzizi@mzizi\`).`,
  },
  "GET /v1/brand": { allow: ["body"], why: BRAND },
  "GET /api/v1/brand": {
    allow: ["body"],
    why: `${BRAND} The /api/v1 spelling serves the same table.`,
  },
  "GET /v1/architecture": {
    allow: ["body"],
    why: `${N12} The rung list carries it at \`rungs[3]\`.`,
  },
  "GET /api/v1/architecture": {
    allow: ["body"],
    why: `${N12} The /api/v1 spelling serves the same rungs.`,
  },
  "GET /v1/architecture/nodes/12": { allow: ["body"], why: N12 },
  "GET /openapi": { allow: ["body"], why: OPENAPI },
  "GET /api/openapi": {
    allow: ["body"],
    why: `${OPENAPI} /api/openapi serves the same document.`,
  },
  "GET /openapi?format=json": {
    allow: ["body"],
    why: `${OPENAPI} The JSON wrapper's \`yaml\` carries the same text.`,
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
