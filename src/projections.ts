/**
 * The per-route projections for the file-backed routes, kept pure (no Hono, no
 * bundled data) so scripts/extract.ts can run them against mzizi-registry's own
 * route handlers at build time and fail the build if the answers differ. The
 * routes in src/routes/ and that check share this one copy.
 */

/** The fields of a registry item `/v1/ui/{name}/docs` reads. */
export interface DocsItem {
  name: string;
  description?: string;
  node?: number;
  nodeLabel?: string;
  meta?: { owner?: string; collection?: string } & Record<string, unknown>;
}

/** app/api/v1/ui/[name]/docs/route.ts: the 200 body. */
export const docsBody = (
  component: DocsItem,
  withDocs: { docs: unknown; demo: unknown },
) => ({
  name: component.name,
  description: component.description,
  node: component.node,
  nodeLabel: component.nodeLabel,
  owner: component.meta?.owner,
  collection: component.meta?.collection,
  docs: withDocs.docs ?? null,
  demo: withDocs.demo ?? null,
});

/** app/api/v1/ui/[name]/docs/route.ts: the 404 body. */
export const docsNotFound = (name: string) => ({
  error: `Component "${name}" not found`,
});

/** app/api/v1/ai/instructions/[name]/route.ts: the 404 body. */
export const aiInstructionNotFound = (name: string) => ({
  error: `AI instruction "${name}" not found`,
});

/** app/api/v1/ui/[name]/versions/route.ts: the 503 body. */
export const VERSIONS_NOT_SERVED = {
  error: "Version history is not served by this API",
  message:
    "Component version history is machine-written data owned by the Mzizi console " +
    "(app.mzizi.dev), not part of the registry's files. api.mzizi.dev serves those files " +
    "and has no database. Release history is at https://api.mzizi.dev/v1/changelog.",
};

/**
 * app/api/v1/route.ts: the discovery document, with `componentCount` from the
 * same reader `/v1/ui` uses (`getAllComponents()`, i.e. every bundled item).
 */
export const discoveryDocument = (componentCount: number) => ({
  $schema: "https://mzizi.dev/schema/api.json",
  "@context": "https://schema.org",
  "@type": "WebAPI",
  name: "Mzizi API",
  version: "1.0.0",
  description:
    "The Mzizi API — components, brand, architecture, and design system, served from the files in the Mzizi registry. Mzizi owns and operates the registry and this API; it is an open-architecture project of the Bundu Foundation.",
  homepage: "https://mzizi.dev",
  data: {
    source: "files",
    repository: "https://github.com/mzizi-dev/mzizi-registry",
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
      description: `Component registry — ${componentCount} items, served from the registry's files.`,
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
      description: "Service health check.",
    },
    ubuntuPillars: {
      href: "/api/v1/ubuntu/pillars",
      description: "Five Ubuntu pillars — spheres in which Ubuntu is lived.",
    },
    ubuntuPrinciples: {
      href: "/api/v1/ubuntu/principles",
      description:
        "Five Ubuntu principles — operating rules translating Ubuntu to software.",
    },
    mcp: {
      href: "https://mcp.mzizi.dev/mcp",
      description: "Model Context Protocol server — Streamable HTTP transport.",
    },
    search: {
      href: "/api/v1/search",
      description:
        "Search components by name or description; filter by node and category (`layer` is a deprecated alias of `node`).",
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
      description: "AI assistant instructions (Claude, Copilot, Cursor, MCP).",
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
});

/** The fields of a registry item `/v1/rs/{name}` reads. */
export interface RsItem {
  name: string;
  type?: string;
  description?: string;
  /** `sources.rs` from the registry's on-disk index. */
  rsPath?: string;
  /**
   * mzizi-registry `crateFor(rsPath)` (lib/rust-crates.ts): the crate that
   * compiles this component, from `mzizi-rs/crate-for-node.json`. `null` when
   * the item's node directory has no crate, which the registry's generator
   * refuses, so it only appears on an item with no Rust source.
   */
  rsCrate?: string | null;
}

/** app/api/v1/rs/[name]/route.ts: the 404 body for an unknown name. */
export const rsNotFound = (name: string) => ({
  error: `Component "${name}" not found in registry`,
});

/** app/api/v1/rs/[name]/route.ts: the 404 body for an item with no `.rs`. */
export const rsNoRust = (name: string) => ({
  error: `"${name}" has no Rust implementation`,
  message:
    "This component ships for React only. The contract, tokens and variants are on " +
    `https://api.mzizi.dev/v1/ui/${encodeURIComponent(name)} — the Dioxus source is ` +
    "yours to write against them.",
});

/** app/api/v1/rs/[name]/route.ts: the 500 body when no crate compiles the `.rs`. */
export const rsNoCrate = (name: string) => ({
  error: `"${name}" has Rust source but no crate compiles it`,
});

/**
 * app/api/v1/rs/[name]/route.ts: the 200 body. `crate` names the crate that
 * compiles the component (mzizi-registry#372); it read `mzizi-ui` for every
 * component before, which was wrong for everything outside N2.
 */
export const rsBody = (
  component: RsItem,
  name: string,
  source: string,
  crate: string,
  crateGit: string,
) => ({
  $schema: "https://ui.shadcn.com/schema/registry-item.json",
  name: component.name,
  type: component.type,
  target: "dioxus",
  description: component.description,
  crate: { name: crate, registry: "crates.io", git: crateGit },
  files: [
    {
      path: component.rsPath ?? `${name}.rs`,
      type: "registry:rust",
      content: source,
    },
  ],
});

/** /v1/astro/{name}: the 404 body for an unknown name. */
export const astroNotFound = (name: string) => ({
  error: `Component "${name}" not found in registry`,
});

/** /v1/astro/{name}: the 404 body for a component with no Astro implementation. */
export const astroNoAstro = (name: string) => ({
  error: `"${name}" has no Astro implementation`,
  message:
    "This component ships for React (and maybe Rust) only. The contract, tokens and " +
    `variants are on https://api.mzizi.dev/v1/ui/${encodeURIComponent(name)}. ` +
    "Astro implementations are pure .astro files beside the component's .tsx in " +
    "mzizi-dev/mzizi-registry; add one there (mzizi-registry#397).",
});
