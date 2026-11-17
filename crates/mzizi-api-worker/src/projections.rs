//! The fixed bodies of the file-backed routes, verbatim from src/projections.ts
//! (which scripts/extract.ts checks against mzizi-registry's own handlers).

use indexmap::IndexMap;
use mzizi_api_types::{DiscoveryData, DiscoveryDocument, ErrorBody, ErrorWithMessage, Resource};

use crate::js::encode_uri_component;

fn error(error: String) -> ErrorBody {
    ErrorBody { error }
}

/// app/api/v1/ui/[name]/docs/route.ts: the 404 body.
pub fn docs_not_found(name: &str) -> ErrorBody {
    error(format!("Component \"{name}\" not found"))
}

/// app/api/v1/ai/instructions/[name]/route.ts: the 404 body.
pub fn ai_instruction_not_found(name: &str) -> ErrorBody {
    error(format!("AI instruction \"{name}\" not found"))
}

/// app/api/v1/ui/[name]/versions/route.ts: the 503 body.
pub fn versions_not_served() -> ErrorWithMessage {
    ErrorWithMessage {
        error: "Version history is not served by this API".into(),
        message: "Component version history is machine-written data owned by the Mzizi console \
                  (app.mzizi.dev), not part of the registry's files. api.mzizi.dev serves those files \
                  and has no database. Release history is at https://api.mzizi.dev/v1/changelog."
            .into(),
    }
}

/// app/api/v1/rs/[name]/route.ts: the 404 body for an unknown name.
pub fn rs_not_found(name: &str) -> ErrorBody {
    error(format!("Component \"{name}\" not found in registry"))
}

/// app/api/v1/rs/[name]/route.ts: the 404 body for an item with no `.rs`.
pub fn rs_no_rust(name: &str) -> ErrorWithMessage {
    ErrorWithMessage {
        error: format!("\"{name}\" has no Rust implementation"),
        message: format!(
            "This component has no Mzizi Roots (Rust) build yet. Roots components are moving to \
             Mzizi's own Rust renderer: a pure `render(props) -> String`, with behaviour attached in \
             the browser through `web-sys` on the component's `data-slot` root. A Rust build of this \
             component would follow that shape. The contract, tokens and variants are on \
             https://api.mzizi.dev/v1/ui/{}.",
            encode_uri_component(name)
        ),
    }
}

/// app/api/v1/rs/[name]/route.ts: the 500 body when no crate compiles the `.rs`.
pub fn rs_no_crate(name: &str) -> ErrorBody {
    error(format!(
        "\"{name}\" has Rust source but no crate compiles it"
    ))
}

/// /v1/astro/{name}: the 404 body for an unknown name.
pub fn astro_not_found(name: &str) -> ErrorBody {
    error(format!("Component \"{name}\" not found in registry"))
}

/// /v1/astro/{name}: the 404 body for a component with no Astro implementation.
pub fn astro_no_astro(name: &str) -> ErrorWithMessage {
    ErrorWithMessage {
        error: format!("\"{name}\" has no Astro implementation"),
        message: format!(
            "This component ships for React (and maybe Rust) only. The contract, tokens and \
             variants are on https://api.mzizi.dev/v1/ui/{}. \
             Astro implementations are pure .astro files beside the component's .tsx in \
             mzizi-dev/mzizi-registry; add one there (mzizi-registry#397).",
            encode_uri_component(name)
        ),
    }
}

/// app/api/v1/route.ts: the discovery document.
pub fn discovery_document(component_count: usize) -> DiscoveryDocument {
    let r = |href: &str, description: &str| Resource {
        href: href.into(),
        description: description.into(),
        status: None,
    };
    let mut resources = IndexMap::new();
    for (key, resource) in [
        (
            "brand",
            r(
                "/api/v1/brand",
                "Brand system — Seven African Minerals palette, typography, spacing, ecosystem brands.",
            ),
        ),
        (
            "ui",
            r(
                "/api/v1/ui",
                &format!(
                    "Component registry — {component_count} items, served from the registry's files."
                ),
            ),
        ),
        (
            "ecosystem",
            r(
                "/api/v1/ecosystem",
                "Architecture principles, framework decision, and Ubuntu philosophy.",
            ),
        ),
        (
            "architecture",
            r(
                "/api/v1/architecture",
                "The Mzizi DNA double helix — every node and rung with its covenant and live component count, plus the strands grouping them by backbone. No axes, no outliers.",
            ),
        ),
        (
            "architectureNode",
            r(
                "/api/v1/architecture/nodes/{n}",
                "One node or rung of the helix. `n` has no upper bound — node numbers are labels, not a sequence, and the set is never capped.",
            ),
        ),
        (
            "dataLayer",
            r(
                "/api/v1/data-layer",
                "Local-first data layer and cloud services.",
            ),
        ),
        (
            "pipeline",
            r(
                "/api/v1/pipeline",
                "Open data pipeline — Redpanda, Flink, Doris.",
            ),
        ),
        (
            "sovereignty",
            r("/api/v1/sovereignty", "Technology sovereignty assessments."),
        ),
        ("health", r("/api/v1/health", "Service health check.")),
        (
            "ubuntuPillars",
            r(
                "/api/v1/ubuntu/pillars",
                "Five Ubuntu pillars — spheres in which Ubuntu is lived.",
            ),
        ),
        (
            "ubuntuPrinciples",
            r(
                "/api/v1/ubuntu/principles",
                "Five Ubuntu principles — operating rules translating Ubuntu to software.",
            ),
        ),
        (
            "mcp",
            r(
                "https://mcp.mzizi.dev/mcp",
                "Model Context Protocol server — Streamable HTTP transport.",
            ),
        ),
        (
            "search",
            r(
                "/api/v1/search",
                "Search components by name or description; filter by node and category (`layer` is a deprecated alias of `node`).",
            ),
        ),
        (
            "componentDocs",
            r(
                "/api/v1/ui/{name}/docs",
                "Component documentation — use cases, variants, accessibility.",
            ),
        ),
        (
            "componentVersions",
            r("/api/v1/ui/{name}/versions", "Component version history."),
        ),
        (
            "docs",
            Resource {
                status: Some("gone".into()),
                ..r(
                    "/api/v1/docs",
                    "GONE (HTTP 410). Long-form documentation moved to the standalone Mzizi docs site — see https://docs.mzizi.dev.",
                )
            },
        ),
        ("changelog", r("/api/v1/changelog", "Release changelog.")),
        (
            "aiInstructions",
            r(
                "/api/v1/ai/instructions",
                "AI assistant instructions (Claude, Copilot, Cursor, MCP).",
            ),
        ),
        (
            "skills",
            r(
                "/api/v1/skills",
                "Agent-skill MDX bodies — reusable workflows AI assistants invoke on specific tasks. Use /skills/{name} for a single skill's full body, /skills/summary for the cheap version-drift check.",
            ),
        ),
        (
            "stats",
            r("/api/v1/stats", "Public usage statistics (CC BY 4.0)."),
        ),
    ] {
        resources.insert(key.to_owned(), resource);
    }
    DiscoveryDocument {
        schema: "https://mzizi.dev/schema/api.json".into(),
        context: "https://schema.org".into(),
        kind: "WebAPI".into(),
        name: "Mzizi API".into(),
        version: "1.0.0".into(),
        description: "The Mzizi API — components, brand, architecture, and design system, served from the files in the Mzizi registry. Mzizi owns and operates the registry and this API; it is an open-architecture project of the Bundu Foundation.".into(),
        homepage: "https://mzizi.dev".into(),
        data: DiscoveryData {
            source: "files".into(),
            repository: "https://github.com/mzizi-dev/mzizi-registry".into(),
            components: component_count,
        },
        resources,
    }
}
