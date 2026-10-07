/**
 * Discovery, health, brand, changelog, skills, samples, AI instructions and the
 * retired /v1/docs routes. Ported from mzizi-registry app/api/v1/**.
 */
import type { Hono } from "hono";
import {
  brand,
  changelog,
  components,
  doctrine,
  readAiInstruction,
  samples,
  skills,
} from "../data";
import { aiInstructionNotFound, discoveryDocument } from "../projections";
import { CORS, CORS_CACHE, cache, json } from "../http";

type Row = Record<string, unknown>;

export function registerContent(v1: Hono) {
  // app/api/v1/route.ts. The document is src/projections.ts, checked against
  // the handler at build time; the count is every bundled item, as there.
  v1.get("/", () =>
    json(discoveryDocument(components.length), 200, CORS_CACHE),
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
          // Optional canon fields (mzizi-registry#411), projected only on the
          // rows that carry them so every other row's shape is unchanged:
          // `displayName` is the product name where it is not the wordmark
          // (`events` → "Mukoko Events"); `aliases` lists deprecated names that
          // still resolve to the row (`nhimbe`, retired 2026-10-04);
          // `accent` is a second palette family for `--brand-accent`
          // (mzizi-registry#449: `circles` is tanzanite + terracotta).
          ...(b.displayName ? { displayName: b.displayName } : {}),
          ...(b.accent ? { accent: b.accent } : {}),
          ...(Array.isArray(b.aliases) && b.aliases.length
            ? { aliases: b.aliases }
            : {}),
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
  // app/api/v1/ai/instructions/[name]/route.ts: the whole doctrine row, by name
  // and then by target. Checked against the handler at build time.
  v1.get("/ai/instructions/:name", (c) => {
    const name = c.req.param("name");
    const instruction = readAiInstruction(name);
    if (!instruction) {
      return json(aiInstructionNotFound(name), 404, CORS);
    }
    return json(instruction, 200, cache(300, 3600));
  });

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
