/**
 * The component registry: /v1/ui, /v1/ui/{name}[/docs|/versions], /v1/rs/{name},
 * /v1/search, /v1/stats. Ported from mzizi-registry app/api/v1/{ui,rs,search,stats}.
 */
import type { Hono } from "hono";
import {
  components,
  nodeCounts,
  readComponent,
  readComponentDocs,
  readSource,
} from "../data";
import { CORS, CORS_CACHE, cache, json } from "../http";
import { VERSIONS_NOT_SERVED, docsBody, docsNotFound } from "../projections";
import { search } from "../search";

/** app/api/v1/ui/route.ts `positiveInt`. */
function positiveInt(raw: string | null): number | undefined {
  if (raw === null || raw.trim() === "") return undefined;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) return undefined;
  return n;
}

/**
 * Version history is the one registry route with no file behind it. It is
 * machine-written data that the Mzizi console owns, and this Worker holds no
 * database, so it stays at 503 and says why — the registry handler's body.
 */
const versionsNotServed = () => json(VERSIONS_NOT_SERVED, 503, CORS);

export function registerRegistry(v1: Hono) {
  v1.get("/ui", (c) => {
    const params = new URL(c.req.url).searchParams;
    const node = positiveInt(params.get("node"));
    const owner = params.get("owner")?.trim() || undefined;
    const collection = params.get("collection")?.trim() || undefined;
    const type = params.get("type")?.trim() || undefined;
    const limit = positiveInt(params.get("limit"));
    const offset = positiveInt(params.get("offset")) ?? 0;

    const matched = components.filter((item) => {
      if (node !== undefined && item.node !== node) return false;
      if (owner !== undefined && item.meta?.owner !== owner) return false;
      if (collection !== undefined && item.meta?.collection !== collection)
        return false;
      if (type !== undefined && item.type !== type) return false;
      return true;
    });
    const page =
      limit === undefined
        ? matched.slice(offset)
        : matched.slice(offset, offset + limit);
    const items = page.map((item) => ({
      name: item.name,
      type: item.type,
      title: item.title,
      description: item.description,
      categories: item.categories,
      dependencies: item.dependencies,
      registryDependencies: item.registryDependencies,
      node: item.node,
      nodeLabel: item.nodeLabel,
      owner: item.meta?.owner,
      collection: item.meta?.collection,
    }));

    return json(
      {
        $schema: "https://ui.shadcn.com/schema/registry.json",
        name: "mzizi",
        homepage: "https://mzizi.dev",
        items,
        meta: {
          total: matched.length,
          count: items.length,
          offset,
          limit: limit ?? null,
          registryTotal: components.length,
          filters: {
            node: node ?? null,
            owner: owner ?? null,
            collection: collection ?? null,
            type: type ?? null,
          },
        },
      },
      200,
      CORS_CACHE,
    );
  });

  // app/api/v1/ui/[name]/docs/route.ts. The docs row and demo flag come from the
  // registry's `getComponentWithDocs`; the rest is the component itself. The
  // projection is src/projections.ts, checked against the handler at build time.
  v1.get("/ui/:name/docs", (c) => {
    const name = c.req.param("name");
    const component = readComponent(name);
    const withDocs = component ? readComponentDocs(component.name) : null;
    if (!component || !withDocs) return json(docsNotFound(name), 404, CORS);
    return json(docsBody(component, withDocs), 200, CORS_CACHE);
  });

  v1.get("/ui/:name/versions", versionsNotServed);

  // app/api/v1/search/route.ts; see src/search.ts.
  const SEARCH_CACHE = cache(300, 3600);
  v1.get("/search", (c) => {
    const answer = search(components, new URL(c.req.url).searchParams);
    return answer.status === 200
      ? json(answer.body, 200, { ...SEARCH_CACHE, ...answer.headers })
      : json(answer.body, answer.status, CORS);
  });

  v1.get("/ui/:name", (c) => {
    const name = c.req.param("name");
    const component = readComponent(name);
    if (!component) {
      return json(
        { error: `Component "${name}" not found in registry` },
        404,
        CORS,
      );
    }

    const isDataItem = Boolean(
      component.cssVars ||
      component.css ||
      component.type === "registry:base" ||
      component.type === "registry:style",
    );
    if (isDataItem && !component.files?.length) {
      return json(
        {
          $schema: "https://ui.shadcn.com/schema/registry-item.json",
          name: component.name,
          type: component.type,
          title: component.title,
          description: component.description,
          author: component.author,
          categories: component.categories,
          docs: component.docs,
          dependencies: component.dependencies,
          registryDependencies: component.registryDependencies,
          ...(component.cssVars ? { cssVars: component.cssVars } : {}),
          ...(component.css ? { css: component.css } : {}),
          ...(component.style ? { style: component.style } : {}),
          ...(component.iconLibrary
            ? { iconLibrary: component.iconLibrary }
            : {}),
          ...(component.baseColor ? { baseColor: component.baseColor } : {}),
          ...(component.tailwind ? { tailwind: component.tailwind } : {}),
        },
        200,
        CORS_CACHE,
      );
    }

    // Keyed by the name asked for, as the registry's readComponentSource(name) is.
    const source = readSource(name, "primary");
    if (source === null) {
      return json(
        { error: `No source code available for "${name}"` },
        404,
        CORS,
      );
    }

    const declared = component.files ?? [];
    if (declared.length > 1) {
      return json(
        {
          error:
            `Registry item "${name}" declares ${declared.length} files but a component has ` +
            `exactly one source. This is a manifest bug in registry.json, not a bad request — ` +
            `serving it would hand you empty files.`,
        },
        500,
        CORS,
      );
    }
    const files = declared.map((file) => ({
      path: file.path,
      type: file.type,
      ...(file.target ? { target: file.target } : {}),
      content: source,
    }));

    return json(
      {
        $schema: "https://ui.shadcn.com/schema/registry-item.json",
        name: component.name,
        type: component.type,
        title: component.title,
        description: component.description,
        author: component.author,
        categories: component.categories,
        docs: component.docs,
        dependencies: component.dependencies,
        registryDependencies: component.registryDependencies,
        files,
      },
      200,
      CORS_CACHE,
    );
  });

  v1.get("/rs/:name", (c) => {
    const name = c.req.param("name");
    const component = readComponent(name);
    if (!component) {
      return json(
        { error: `Component "${name}" not found in registry` },
        404,
        CORS,
      );
    }
    const source = readSource(name, "rs");
    if (source === null) {
      return json(
        {
          error: `"${name}" has no Rust implementation`,
          message:
            "This component ships for React only. The contract, tokens and variants are on " +
            `https://api.mzizi.dev/v1/ui/${encodeURIComponent(name)} — the Dioxus source is ` +
            "yours to write against them.",
        },
        404,
        CORS,
      );
    }
    return json(
      {
        $schema: "https://ui.shadcn.com/schema/registry-item.json",
        name: component.name,
        type: component.type,
        target: "dioxus",
        description: component.description,
        crate: { name: "mzizi-ui", registry: "crates.io" },
        files: [
          {
            path: component.rsPath ?? `${name}.rs`,
            type: "registry:rust",
            content: source,
          },
        ],
      },
      200,
      CORS_CACHE,
    );
  });

  // Usage telemetry (`usage_events`) is machine-written and lives in Supabase;
  // api.mzizi.dev reports the zeroed shape today because Supabase is not
  // configured there. This Worker has no telemetry store, so it reports the same
  // zeros. The per-node counts are real — derived from the registry's files.
  const STATS_HEADERS = cache(60, 120);
  v1.get("/stats", (c) => {
    const daysParam = new URL(c.req.url).searchParams.get("days");
    const days = daysParam
      ? Math.min(Math.max(parseInt(daysParam, 10) || 30, 1), 90)
      : 30;
    return json(
      {
        "@context": "https://schema.org",
        "@type": "Dataset",
        name: "Mzizi — Usage Statistics",
        description:
          "Public API and MCP usage metrics for the Mzizi component registry. Open data aligned with the bundu ecosystem philosophy.",
        license: "https://creativecommons.org/licenses/by/4.0/",
        period_days: days,
        total_api_calls: 0,
        total_mcp_calls: 0,
        total_errors: 0,
        overall_error_rate: 0,
        avg_duration_ms: 0,
        top_endpoints: [],
        top_mcp_tools: [],
        top_components: [],
        calls_by_day: [],
        layers: { ...nodeCounts },
      },
      200,
      STATS_HEADERS,
    );
  });
  v1.options(
    "/stats",
    () =>
      new Response(null, {
        status: 204,
        headers: { ...STATS_HEADERS, Allow: "GET, OPTIONS" },
      }),
  );
}
