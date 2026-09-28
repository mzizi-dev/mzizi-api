/**
 * Discovery, health, brand, changelog, skills, samples, AI instructions and the
 * retired /v1/docs routes. Ported from mzizi-registry app/api/v1/**.
 */
import type { Hono } from "hono";
import { brand, changelog, doctrine, samples, skills } from "../data";
import { CORS, CORS_CACHE, cache, json } from "../http";

type Row = Record<string, unknown>;

/**
 * The discovery document gates its `database` block on Supabase being
 * configured, and on api.mzizi.dev it is not — so the live document reads
 * `not_configured` / `0`, and so does this one. (The count would come from
 * files if the gate were lifted; that is a registry-side wording fix, not
 * something to change silently during a cutover.)
 */
const componentCount = 0;

export function registerContent(v1: Hono) {
  v1.get("/", () =>
    json(
      {
        $schema: "https://mzizi.dev/schema/api.json",
        "@context": "https://schema.org",
        "@type": "WebAPI",
        name: "Mzizi API",
        version: "1.0.0",
        description:
          "The Mzizi API — components, brand, architecture, and design system. Mzizi is an independent open-architecture project, operated and developed by Nyuchi.",
        homepage: "https://mzizi.dev",
        database: {
          status: "not_configured",
          components: componentCount,
        },
        resources: {
          brand: {
            href: "/api/v1/brand",
            description:
              "Brand system — Seven African Minerals palette, typography, spacing, ecosystem brands.",
          },
          ui: {
            href: "/api/v1/ui",
            description: `Component registry — ${componentCount} items served from database.`,
          },
          ecosystem: {
            href: "/api/v1/ecosystem",
            description:
              "Architecture principles, framework decision, and Ubuntu philosophy.",
          },
          // The helix is the only architecture model served. #191 removed the
          // two axis entries from this document without adding the helix in
          // their place, which left a live route undiscoverable — retiring the
          // wrong model is only half the job if the right one is not advertised.
          architecture: {
            href: "/api/v1/architecture",
            description:
              "The Mzizi DNA double helix — every node and rung with its covenant and live component count, plus the strands grouping them by backbone. No axes, no outliers.",
          },
          architectureNode: {
            href: "/api/v1/architecture/nodes/{n}",
            description:
              "One node or rung of the helix. `n` has no upper bound — node numbers are labels, not a sequence, and the set is never capped.",
          },
          dataLayer: {
            href: "/api/v1/data-layer",
            description: "Local-first data layer and cloud services.",
          },
          pipeline: {
            href: "/api/v1/pipeline",
            description: "Open data pipeline — Redpanda, Flink, Doris.",
          },
          sovereignty: {
            href: "/api/v1/sovereignty",
            description: "Technology sovereignty assessments.",
          },
          health: {
            href: "/api/v1/health",
            description: "Service health check — database and registry status.",
          },
          ubuntuPillars: {
            href: "/api/v1/ubuntu/pillars",
            description:
              "Five Ubuntu pillars — spheres in which Ubuntu is lived.",
          },
          ubuntuPrinciples: {
            href: "/api/v1/ubuntu/principles",
            description:
              "Five Ubuntu principles — operating rules translating Ubuntu to software.",
          },
          mcp: {
            href: "https://mcp.mzizi.dev/mcp",
            description:
              "Model Context Protocol server — Streamable HTTP transport.",
          },
          search: {
            href: "/api/v1/search",
            description:
              "Search components by name/description; filter by layer and category.",
          },
          componentDocs: {
            href: "/api/v1/ui/{name}/docs",
            description:
              "Component documentation — use cases, variants, accessibility.",
          },
          componentVersions: {
            href: "/api/v1/ui/{name}/versions",
            description: "Component version history.",
          },
          docs: {
            href: "/api/v1/docs",
            description:
              "GONE (HTTP 410). Long-form documentation moved to the standalone Mzizi docs site — see https://docs.mzizi.dev.",
            status: "gone",
          },
          changelog: {
            href: "/api/v1/changelog",
            description: "Release changelog.",
          },
          aiInstructions: {
            href: "/api/v1/ai/instructions",
            description:
              "AI assistant instructions (Claude, Copilot, Cursor, MCP).",
          },
          skills: {
            href: "/api/v1/skills",
            description:
              "Agent-skill MDX bodies — reusable workflows AI assistants invoke on specific tasks. Use /skills/{name} for a single skill's full body, /skills/summary for the cheap version-drift check.",
          },
          stats: {
            href: "/api/v1/stats",
            description: "Public usage statistics (CC BY 4.0).",
          },
        },
      },
      200,
      CORS_CACHE,
    ),
  );

  v1.get("/health", () => {
    const start = performance.now();
    const api = {
      status: "pass" as const,
      latencyMs: Math.round(performance.now() - start),
    };
    return json(
      {
        status: "healthy",
        timestamp: new Date().toISOString(),
        checks: { api },
        version: "unknown",
      },
      200,
      {
        "Cache-Control": "no-cache, no-store",
        "Access-Control-Allow-Origin": "*",
      },
    );
  });

  v1.get("/brand", () => {
    const typography = brand.typography as Row[];
    const fonts: Record<
      string,
      { family: string; usage: unknown; reason: string }
    > = {};
    for (const f of typography.filter((t) => t.entryType === "font")) {
      fonts[String(f.name).replace("font-", "")] = {
        family: (f.family as string) ?? "",
        usage: f.usage,
        reason: (f.reason as string) ?? "",
      };
    }
    const meta = brand.brandMeta as Row;
    const apiHex = brand.mineralApiHex as Record<string, string>;
    return json(
      {
        $schema: "https://mzizi.dev/schema/brand.json",
        "@context": "https://schema.org",
        "@type": "Brand",
        version: meta.version,
        name: meta.name,
        lastUpdated: meta.lastUpdated,
        homepage: meta.homepage,
        minerals: (brand.minerals as Row[]).map((m) => ({
          name: m.name,
          hex: apiHex[m.name as string] ?? m.darkHex,
          lightHex: m.lightHex,
          darkHex: m.darkHex,
          containerLight: m.containerLight,
          containerDark: m.containerDark,
          cssVar: m.cssVar,
          origin: m.origin,
          symbolism: m.symbolism,
          usage: m.usage,
        })),
        ecosystem: (brand.ecosystem as Row[]).map((b) => ({
          name: b.name,
          meaning: b.meaning,
          language: b.language,
          role: b.role,
          description: b.description,
          voice: b.voice,
          mineral: b.mineral,
          url: b.url,
        })),
        typography: {
          fonts,
          scale: typography
            .filter((t) => t.entryType === "scale")
            .map((t) => ({
              name: t.name,
              sizePx: t.sizePx ?? 0,
              sizeRem: t.sizeRem ?? "",
              lineHeight: t.lineHeight ?? "",
              weight: t.weight ?? 400,
              font: t.font ?? "sans",
              usage: t.usage,
            })),
        },
        spacing: (brand.spacing as Row[]).map((s) => ({
          name: s.name,
          px: s.px,
          rem: s.rem,
          usage: s.usage,
        })),
        radii: meta.radii,
        semanticColors: (brand.semanticColors as Row[]).map((c) => ({
          name: c.name,
          light: c.lightValue,
          dark: c.darkValue,
          usage: c.usage,
        })),
        backgrounds: (brand.backgroundColors as Row[]).map((c) => ({
          name: String(c.name).replace("bg-", ""),
          light: c.lightValue,
          dark: c.darkValue,
          usage: c.usage,
        })),
        heritage: (brand.heritageColors as Row[]).map((h) => ({
          name: h.name,
          hex: h.darkHex,
          lightHex: h.lightHex,
          darkHex: h.darkHex,
          cssVar: h.cssVar,
          origin: h.origin,
          symbolism: h.symbolism,
          usage: h.usage,
        })),
        experimental: (brand.experimentalColors as Row[]).map((e) => ({
          name: e.name,
          hex: e.darkHex,
          lightHex: e.lightHex,
          darkHex: e.darkHex,
          containerLight: e.containerLight,
          containerDark: e.containerDark,
          onContainerLight: e.onContainerLight,
          onContainerDark: e.onContainerDark,
          uiLight: e.uiLight,
          uiDark: e.uiDark,
          cssVar: `--color-${e.name}`,
          heptagonIndex: e.heptagonIndex,
        })),
        componentSpecs: meta.componentSpecs,
        accessibility: meta.accessibility,
        voiceAndTone: meta.voiceAndTone,
        philosophy: meta.philosophy,
      },
      200,
      CORS_CACHE,
    );
  });

  v1.get("/changelog", () =>
    json(
      { data: changelog.entries, meta: { total: changelog.entries.length } },
      200,
      cache(600, 3600),
    ),
  );

  v1.get("/changelog/:version", (c) => {
    const version = c.req.param("version");
    const entries = Object.prototype.hasOwnProperty.call(
      changelog.byVersion,
      version,
    )
      ? changelog.byVersion[version]
      : [];
    if (entries.length === 0) {
      return json({ error: `Version "${version}" not found` }, 404, CORS);
    }
    return json(
      {
        ...entries[0],
        data: entries,
        meta: { version, entries: entries.length },
      },
      200,
      CORS_CACHE,
    );
  });

  // /skills and /skills/summary serve the same document, as the registry does.
  const skillList = () =>
    json(
      {
        data: skills.list,
        meta: { count: skills.list.length, version: skills.version },
      },
      200,
      CORS_CACHE,
    );
  v1.get("/skills", skillList);
  v1.get("/skills/summary", skillList);
  v1.get("/skills/:name", (c) => {
    const name = c.req.param("name");
    if (!/^[a-z][a-z0-9-]*$/.test(name)) {
      return json({ error: "Invalid skill name", received: name }, 400, CORS);
    }
    const skill = Object.prototype.hasOwnProperty.call(skills.byName, name)
      ? skills.byName[name]
      : null;
    if (!skill) {
      return json(
        { error: "Skill not found", received: name, available: skills.names },
        404,
        CORS,
      );
    }
    return json(
      { data: skill, meta: { version: skills.version } },
      200,
      CORS_CACHE,
    );
  });

  v1.get("/samples", () =>
    json(
      {
        "@context": "https://schema.org",
        "@type": "DataCatalog",
        name: "Mzizi sample data",
        description:
          "Curated sample records in the same shapes as the platform's MongoDB collections. " +
          "Every component preview on mzizi.dev renders against these.",
        sample: true,
        types: Object.entries(samples).map(([type, records]) => ({
          type,
          count: records.length,
          href: `https://api.mzizi.dev/v1/samples/${type}`,
          mongodb: { database: "mzizi_samples", collection: type },
        })),
        notes: [
          "These are fixtures, not live data. Places are real; businesses and people are not.",
          "Shapes mirror the production validators, so a query written here ships unchanged.",
          "`pnpm samples:push` loads the identical documents into MongoDB `mzizi_samples`.",
        ],
      },
      200,
      CORS_CACHE,
    ),
  );

  v1.get("/samples/:type", (c) => {
    const type = c.req.param("type");
    const known = Object.keys(samples);
    if (!type || !known.includes(type)) {
      return json(
        { error: `Unknown sample type "${type}"`, available: known },
        404,
        CORS,
      );
    }
    const records = samples[type];
    return json(
      {
        "@context": "https://schema.org",
        "@type": "Dataset",
        name: `Mzizi sample ${type}`,
        description:
          `Curated sample ${type} in the same shape as the platform's MongoDB collection. ` +
          "Used by every component preview on mzizi.dev.",
        sample: true,
        type,
        count: records.length,
        mongodb: { database: "mzizi_samples", collection: type },
        records,
      },
      200,
      CORS_CACHE,
    );
  });

  v1.get("/ai/instructions", () => {
    const items = (doctrine.aiInstructions as Row[]).map((i) => ({
      name: i.name,
      target: i.target,
      title: i.title,
      description: i.description,
      version: i.version,
      updated_at: i.updated_at,
    }));
    return json(
      { data: items, meta: { total: items.length } },
      200,
      cache(300, 3600),
    );
  });
  // Supabase-gated in the registry handler (the rows themselves are doctrine
  // files); 503 on api.mzizi.dev today, kept at 503 here. See README "Data".
  v1.get("/ai/instructions/:name", () =>
    json({ error: "Database not configured" }, 503, CORS),
  );

  const GONE_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "public, max-age=3600, s-maxage=86400",
  };
  v1.get("/docs", () =>
    json(
      {
        error: "Gone",
        message:
          "Long-form documentation now lives in the Mzizi docs site at https://docs.mzizi.dev (source: mzizi-dev/mzizi-docs). The documentation_pages Supabase table is historical.",
        migrated_to: {
          "3d-architecture": "https://docs.mzizi.dev/architecture/overview",
          "fundi-guide": "https://docs.mzizi.dev/tooling",
          "layer-decision-guide": "https://docs.mzizi.dev/architecture/nodes",
          "component-backlinks":
            "https://docs.mzizi.dev/architecture/backlinks",
          "brand-guidelines": "https://docs.mzizi.dev/foundations/overview",
          "semantic-tokens": "https://docs.mzizi.dev/foundations/tokens",
          introduction: "https://docs.mzizi.dev",
          installation: "https://docs.mzizi.dev/registry/consuming",
          "api-reference": "https://docs.mzizi.dev/registry/overview",
          contributing: "https://docs.mzizi.dev/registry/contributing",
        },
      },
      410,
      GONE_HEADERS,
    ),
  );
  v1.get("/docs/:slug", (c) =>
    json(
      {
        error: "Gone",
        message:
          "Long-form documentation now lives in the standalone Mzizi docs site. See GET /api/v1/docs for the per-slug → URL migration map, or browse https://docs.mzizi.dev.",
        slug: c.req.param("slug"),
      },
      410,
      GONE_HEADERS,
    ),
  );
}
