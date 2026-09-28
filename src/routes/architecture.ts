/**
 * The helix and the doctrine-backed architecture documents: /v1/architecture,
 * /v1/architecture/nodes/{n}, /v1/data-layer, /v1/ecosystem, /v1/pipeline,
 * /v1/sovereignty, /v1/ubuntu/{pillars,principles} — plus the retired routes that
 * answer 410. Ported from mzizi-registry app/api/v1/**. Rows come from
 * content/doctrine/** via the registry's own lib/doctrine readers.
 */
import type { Hono } from "hono";
import { doctrine, helix } from "../data";
import { CORS, CORS_CACHE, json } from "../http";

type Row = Record<string, unknown>;
const rows = (key: string): Row[] => (doctrine[key] ?? []) as Row[];

/** The 410 routes send Cache-Control with their CORS header. */
const GONE_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Cache-Control": "public, max-age=3600, s-maxage=86400",
};

export function registerArchitecture(v1: Hono) {
  v1.get("/architecture", () => {
    const empty =
      helix.nodes.length === 0 &&
      helix.rungs.length === 0 &&
      helix.strands.length === 0;
    return json(
      {
        data: helix,
        meta: {
          model: "mzizi-dna-helix",
          node_count: helix.nodes.length,
          rung_count: helix.rungs.length,
          strand_count: helix.strands.length,
          empty,
          source:
            "component_documents/documentation-architecture-{nodes,strands}",
          version: "v1",
        },
      },
      200,
      CORS_CACHE,
    );
  });

  v1.get("/architecture/nodes/:n", (c) => {
    const n = c.req.param("n");
    const parsed = Number.parseInt(n, 10);
    if (
      !Number.isInteger(parsed) ||
      parsed < 1 ||
      String(parsed) !== n.trim()
    ) {
      return json(
        { error: "node must be a positive integer", received: n },
        400,
        CORS,
      );
    }
    const element = [...helix.nodes, ...helix.rungs].find(
      (e) => e.node_number === parsed,
    );
    if (!element) {
      return json(
        {
          error: `No node or rung numbered ${parsed}`,
          message:
            "Node numbers are labels, not a sequence — a gap is not an error. GET /api/v1/architecture lists every element the collection currently holds.",
        },
        404,
        CORS,
      );
    }
    return json(
      { data: element, meta: { model: "mzizi-dna-helix", version: "v1" } },
      200,
      CORS_CACHE,
    );
  });

  v1.get("/data-layer", () =>
    json(
      {
        "@context": "https://schema.org",
        "@type": "TechArticle",
        name: "Mukoko Data Layer Architecture",
        localDataLayer: rows("dataLayer").map((t) => ({
          name: t.name,
          role: t.role,
          platform: t.platform,
          description: t.description,
          sovereignty: t.sovereignty,
        })),
        cloudLayer: rows("cloudLayer").map((s) => ({
          name: s.name,
          role: s.role,
          consistencyModel: s.consistency_model,
          database: s.database,
          dataCategories: s.data_categories,
          description: s.description,
          sovereignty: s.sovereignty,
        })),
        dataOwnership: rows("dataOwnership").map((r) => ({
          category: r.category,
          consistencyModel: r.consistency_model,
          database: r.database,
          examples: r.examples,
          conflictResolution: r.conflict_resolution,
          ownership: r.ownership,
          description: r.description,
        })),
      },
      200,
      CORS_CACHE,
    ),
  );

  v1.get("/ecosystem", () => {
    const f = doctrine.framework as Row | null;
    return json(
      {
        "@context": "https://schema.org",
        "@type": "TechArticle",
        name: "Mukoko Ecosystem Architecture",
        principles: rows("principles").map((p) => ({
          name: p.name,
          title: p.title,
          description: p.description,
          rationale: p.rationale,
          implementation: p.implementation,
        })),
        frameworkDecision: f
          ? {
              name: f.name,
              approach: f.approach,
              framework: f.framework,
              rationale: f.rationale,
              sovereigntyAdvantage: f.sovereignty_advantage,
              platforms: f.platforms,
              harmonyOs: f.harmony_os,
            }
          : null,
      },
      200,
      CORS_CACHE,
    );
  });

  v1.get("/pipeline", () =>
    json(
      {
        "@context": "https://schema.org",
        "@type": "TechArticle",
        name: "Mukoko Open Data Pipeline",
        stages: rows("pipeline").map((p) => ({
          name: p.name,
          role: p.role,
          description: p.description,
          sovereignty: p.sovereignty,
        })),
      },
      200,
      CORS_CACHE,
    ),
  );

  v1.get("/sovereignty", () =>
    json(
      {
        "@context": "https://schema.org",
        "@type": "TechArticle",
        name: "Mukoko Technology Sovereignty",
        assessments: rows("sovereignty").map((a) => ({
          technology: a.technology,
          role: a.role,
          license: a.license,
          governance: a.governance,
          sovereigntyRisk: a.sovereignty_risk,
          forkable: a.forkable,
          selfHostable: a.self_hostable,
          rationale: a.rationale,
        })),
        removedTechnologies: rows("removed").map((r) => ({
          name: r.name,
          previousRole: r.previous_role,
          reason: r.reason,
          replacement: r.replacement,
          migrationPath: r.migration_path,
        })),
      },
      200,
      CORS_CACHE,
    ),
  );

  v1.get("/ubuntu/pillars", () =>
    json(
      {
        "@context": "https://schema.org",
        "@type": "ItemList",
        name: "Ubuntu Pillars",
        description:
          "The five pillars — spheres in which Ubuntu is lived. Each pillar maps a region of life to a platform surface so the doctrine translates to software.",
        itemListElement: rows("ubuntuPillars").map((r) => ({
          name: r.name,
          shona: r.shona,
          title: r.title,
          description: r.description,
          sphere: r.sphere,
          platformSurface: r.platform_surface,
          source: r.source,
          sortOrder: r.sort_order,
        })),
      },
      200,
      CORS_CACHE,
    ),
  );

  v1.get("/ubuntu/principles", () =>
    json(
      {
        "@context": "https://schema.org",
        "@type": "ItemList",
        name: "Ubuntu Principles",
        description:
          "The five operating principles — rules that translate Ubuntu to software engineering decisions.",
        itemListElement: rows("ubuntuPrinciples").map((r) => ({
          name: r.name,
          shona: r.shona,
          title: r.title,
          description: r.description,
          expression: r.expression,
          source: r.source,
          sortOrder: r.sort_order,
        })),
      },
      200,
      CORS_CACHE,
    ),
  );

  // ── Retired routes. The helix replaced the old model; these answer 410 with
  // pointers, verbatim from the registry handlers. ─────────────────────────────
  v1.get("/architecture/axes", () =>
    json(
      {
        error: "Gone",
        message:
          "The axis model is retired. Mzizi serves the DNA double helix — nodes on an engineering and a meaning backbone, held by cross-cutting rungs. There are no axes and no outliers. This route previously returned four axis rows with every count zeroed.",
        model: "mzizi-dna-helix",
        migrated_to: {
          architecture: "https://api.mzizi.dev/v1/architecture",
          "node detail": "https://api.mzizi.dev/v1/architecture/layers/{n}",
          "nodes (MCP)": "get_node_documents",
          "per-node counts (MCP)": "get_node_counts",
        },
      },
      410,
      GONE_HEADERS,
    ),
  );

  v1.get("/architecture/frontend/axes", () =>
    json(
      {
        error: "Gone",
        message:
          "The axis model is retired. Mzizi serves the DNA double helix — nodes on an engineering and a meaning backbone, held by cross-cutting rungs. This route served axis rows with a horizontal/vertical/depth/external geometry field.",
        model: "mzizi-dna-helix",
        migrated_to: {
          architecture: "https://api.mzizi.dev/v1/architecture",
          "strands + nodes (MCP)": "get_node_documents",
        },
      },
      410,
      GONE_HEADERS,
    ),
  );

  v1.get("/architecture/frontend/layers", () =>
    json(
      {
        error: "Gone",
        message:
          "The axis/layer model is retired. Mzizi serves the DNA double helix — nodes on strands, held by cross-cutting rungs. This route served layerNumber/axisName rows, which assumed every unit belonged to an axis.",
        model: "mzizi-dna-helix",
        migrated_to: {
          "node detail": "https://api.mzizi.dev/v1/architecture/nodes/{n}",
          architecture: "https://api.mzizi.dev/v1/architecture",
          "nodes + strands (MCP)": "get_node_documents",
        },
      },
      410,
      GONE_HEADERS,
    ),
  );

  v1.get("/architecture/layers/:n", (c) =>
    json(
      {
        error: "Gone",
        message:
          "The layer model is retired. Mzizi serves the DNA double helix — nodes on strands, held by cross-cutting rungs. This route served an axis_name per row behind a 1-10 bound; node numbers are labels, not a sequence, and the set is never capped.",
        model: "mzizi-dna-helix",
        migrated_to: {
          "node detail": `https://api.mzizi.dev/v1/architecture/nodes/${encodeURIComponent(c.req.param("n"))}`,
          architecture: "https://api.mzizi.dev/v1/architecture",
          "nodes + strands (MCP)": "get_node_documents",
        },
      },
      410,
      GONE_HEADERS,
    ),
  );
}
