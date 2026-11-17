//! The helix and the doctrine-backed architecture documents, plus the retired
//! routes that answer 410. Ported from src/routes/architecture.ts.

use mzizi_api_types::{
    ArchitectureBody, ArchitectureMeta, ArchitecturePrinciple, CloudService, DataLayerBody,
    DataOwnershipRule, EcosystemBody, ErrorWithMessage, FrameworkDecision, Gone, InvalidParameter,
    LocalDataTier, ModelMeta, NodeBody, Object, PipelineBody, PipelineStage, RemovedTechnology,
    SovereigntyAssessment, SovereigntyBody, UbuntuList, UbuntuPillar, UbuntuPrinciple,
};
use serde_json::Value;

use crate::app::Ctx;
use crate::data;
use crate::http::{CORS, CORS_CACHE, GONE_HEADERS, Reply, json};
use crate::js;

/// `doctrine[key] ?? []`.
pub(crate) fn rows(key: &str) -> &'static [Value] {
    data::doctrine()
        .get(key)
        .and_then(Value::as_array)
        .map_or(&[], Vec::as_slice)
}

/// `row.key`: `None` when absent (JS `undefined`), the value otherwise.
pub(crate) fn pick(row: &Value, key: &str) -> Option<Value> {
    row.get(key).cloned()
}

const MODEL: &str = "mzizi-dna-helix";

pub fn architecture(_: &Ctx) -> Reply {
    let helix = &data::helix().model;
    let body = ArchitectureBody {
        meta: ArchitectureMeta {
            model: MODEL.into(),
            node_count: helix.nodes.len(),
            rung_count: helix.rungs.len(),
            strand_count: helix.strands.len(),
            empty: helix.nodes.is_empty() && helix.rungs.is_empty() && helix.strands.is_empty(),
            source: "component_documents/documentation-architecture-{nodes,strands}".into(),
            version: "v1".into(),
        },
        data: helix.clone(),
    };
    json(&body, 200, CORS_CACHE)
}

pub fn node(c: &Ctx) -> Reply {
    let n = c.param(0);
    let parsed = js::parse_int(n);
    let valid = parsed.filter(|p| *p >= 1.0 && js::number_to_string(*p) == js::trim(n));
    let Some(parsed) = valid else {
        return json(
            &InvalidParameter {
                error: "node must be a positive integer".into(),
                received: n.to_owned(),
            },
            400,
            CORS,
        );
    };
    let helix = &data::helix().model;
    let element = helix.nodes.iter().chain(&helix.rungs).find(|e| {
        e.get("node_number")
            .and_then(Value::as_f64)
            .is_some_and(|x| x == parsed)
    });
    let Some(element) = element else {
        return json(
            &ErrorWithMessage {
                error: format!("No node or rung numbered {}", js::number_to_string(parsed)),
                message: "Node numbers are labels, not a sequence — a gap is not an error. GET /api/v1/architecture lists every element the collection currently holds.".into(),
            },
            404,
            CORS,
        );
    };
    let body = NodeBody {
        data: element.clone(),
        meta: ModelMeta {
            model: MODEL.into(),
            version: "v1".into(),
        },
    };
    json(&body, 200, CORS_CACHE)
}

fn tech_article(name: &str) -> (String, String, String) {
    (
        "https://schema.org".into(),
        "TechArticle".into(),
        name.into(),
    )
}

pub fn data_layer(_: &Ctx) -> Reply {
    let (context, kind, name) = tech_article("Mukoko Data Layer Architecture");
    let body = DataLayerBody {
        context,
        kind,
        name,
        local_data_layer: rows("dataLayer")
            .iter()
            .map(|t| LocalDataTier {
                name: pick(t, "name"),
                role: pick(t, "role"),
                platform: pick(t, "platform"),
                description: pick(t, "description"),
                sovereignty: pick(t, "sovereignty"),
            })
            .collect(),
        cloud_layer: rows("cloudLayer")
            .iter()
            .map(|s| CloudService {
                name: pick(s, "name"),
                role: pick(s, "role"),
                consistency_model: pick(s, "consistency_model"),
                database: pick(s, "database"),
                data_categories: pick(s, "data_categories"),
                description: pick(s, "description"),
                sovereignty: pick(s, "sovereignty"),
            })
            .collect(),
        data_ownership: rows("dataOwnership")
            .iter()
            .map(|r| DataOwnershipRule {
                category: pick(r, "category"),
                consistency_model: pick(r, "consistency_model"),
                database: pick(r, "database"),
                examples: pick(r, "examples"),
                conflict_resolution: pick(r, "conflict_resolution"),
                ownership: pick(r, "ownership"),
                description: pick(r, "description"),
            })
            .collect(),
    };
    json(&body, 200, CORS_CACHE)
}

pub fn ecosystem(_: &Ctx) -> Reply {
    let (context, kind, name) = tech_article("Mukoko Ecosystem Architecture");
    let framework = data::doctrine()
        .get("framework")
        .filter(|f| js::truthy(Some(f)));
    let body = EcosystemBody {
        context,
        kind,
        name,
        principles: rows("principles")
            .iter()
            .map(|p| ArchitecturePrinciple {
                name: pick(p, "name"),
                title: pick(p, "title"),
                description: pick(p, "description"),
                rationale: pick(p, "rationale"),
                implementation: pick(p, "implementation"),
            })
            .collect(),
        framework_decision: framework.map(|f| FrameworkDecision {
            name: pick(f, "name"),
            approach: pick(f, "approach"),
            framework: pick(f, "framework"),
            rationale: pick(f, "rationale"),
            sovereignty_advantage: pick(f, "sovereignty_advantage"),
            platforms: pick(f, "platforms"),
            harmony_os: pick(f, "harmony_os"),
        }),
    };
    json(&body, 200, CORS_CACHE)
}

pub fn pipeline(_: &Ctx) -> Reply {
    let (context, kind, name) = tech_article("Mukoko Open Data Pipeline");
    let body = PipelineBody {
        context,
        kind,
        name,
        stages: rows("pipeline")
            .iter()
            .map(|p| PipelineStage {
                name: pick(p, "name"),
                role: pick(p, "role"),
                description: pick(p, "description"),
                sovereignty: pick(p, "sovereignty"),
            })
            .collect(),
    };
    json(&body, 200, CORS_CACHE)
}

pub fn sovereignty(_: &Ctx) -> Reply {
    let (context, kind, name) = tech_article("Mukoko Technology Sovereignty");
    let body = SovereigntyBody {
        context,
        kind,
        name,
        assessments: rows("sovereignty")
            .iter()
            .map(|a| SovereigntyAssessment {
                technology: pick(a, "technology"),
                role: pick(a, "role"),
                license: pick(a, "license"),
                governance: pick(a, "governance"),
                sovereignty_risk: pick(a, "sovereignty_risk"),
                forkable: pick(a, "forkable"),
                self_hostable: pick(a, "self_hostable"),
                rationale: pick(a, "rationale"),
            })
            .collect(),
        removed_technologies: rows("removed")
            .iter()
            .map(|r| RemovedTechnology {
                name: pick(r, "name"),
                previous_role: pick(r, "previous_role"),
                reason: pick(r, "reason"),
                replacement: pick(r, "replacement"),
                migration_path: pick(r, "migration_path"),
            })
            .collect(),
    };
    json(&body, 200, CORS_CACHE)
}

fn item_list<T>(name: &str, description: &str, items: Vec<T>) -> UbuntuList<T> {
    UbuntuList {
        context: "https://schema.org".into(),
        kind: "ItemList".into(),
        name: name.into(),
        description: description.into(),
        item_list_element: items,
    }
}

pub fn ubuntu_pillars(_: &Ctx) -> Reply {
    let body = item_list(
        "Ubuntu Pillars",
        "The five pillars — spheres in which Ubuntu is lived. Each pillar maps a region of life to a platform surface so the doctrine translates to software.",
        rows("ubuntuPillars")
            .iter()
            .map(|r| UbuntuPillar {
                name: pick(r, "name"),
                shona: pick(r, "shona"),
                title: pick(r, "title"),
                description: pick(r, "description"),
                sphere: pick(r, "sphere"),
                platform_surface: pick(r, "platform_surface"),
                source: pick(r, "source"),
                sort_order: pick(r, "sort_order"),
            })
            .collect(),
    );
    json(&body, 200, CORS_CACHE)
}

pub fn ubuntu_principles(_: &Ctx) -> Reply {
    let body = item_list(
        "Ubuntu Principles",
        "The five operating principles — rules that translate Ubuntu to software engineering decisions.",
        rows("ubuntuPrinciples")
            .iter()
            .map(|r| UbuntuPrinciple {
                name: pick(r, "name"),
                shona: pick(r, "shona"),
                title: pick(r, "title"),
                description: pick(r, "description"),
                expression: pick(r, "expression"),
                source: pick(r, "source"),
                sort_order: pick(r, "sort_order"),
            })
            .collect(),
    );
    json(&body, 200, CORS_CACHE)
}

fn migrated(pairs: &[(&str, &str)]) -> Object {
    pairs
        .iter()
        .map(|(k, v)| ((*k).to_owned(), Value::String((*v).to_owned())))
        .collect()
}

fn gone(message: &str, pairs: &[(&str, &str)]) -> Reply {
    let body = Gone {
        error: "Gone".into(),
        message: message.into(),
        model: Some(MODEL.into()),
        migrated_to: Some(migrated(pairs)),
        slug: None,
    };
    json(&body, 410, GONE_HEADERS)
}

pub fn axes_gone(_: &Ctx) -> Reply {
    gone(
        "The axis model is retired. Mzizi serves the DNA double helix — nodes on an engineering and a meaning backbone, held by cross-cutting rungs. There are no axes and no outliers. This route previously returned four axis rows with every count zeroed.",
        &[
            ("architecture", "https://api.mzizi.dev/v1/architecture"),
            (
                "node detail",
                "https://api.mzizi.dev/v1/architecture/layers/{n}",
            ),
            ("nodes (MCP)", "get_node_documents"),
            ("per-node counts (MCP)", "get_node_counts"),
        ],
    )
}

pub fn frontend_axes_gone(_: &Ctx) -> Reply {
    gone(
        "The axis model is retired. Mzizi serves the DNA double helix — nodes on an engineering and a meaning backbone, held by cross-cutting rungs. This route served axis rows with a horizontal/vertical/depth/external geometry field.",
        &[
            ("architecture", "https://api.mzizi.dev/v1/architecture"),
            ("strands + nodes (MCP)", "get_node_documents"),
        ],
    )
}

pub fn frontend_layers_gone(_: &Ctx) -> Reply {
    gone(
        "The axis/layer model is retired. Mzizi serves the DNA double helix — nodes on strands, held by cross-cutting rungs. This route served layerNumber/axisName rows, which assumed every unit belonged to an axis.",
        &[
            (
                "node detail",
                "https://api.mzizi.dev/v1/architecture/nodes/{n}",
            ),
            ("architecture", "https://api.mzizi.dev/v1/architecture"),
            ("nodes + strands (MCP)", "get_node_documents"),
        ],
    )
}

pub fn layer_gone(c: &Ctx) -> Reply {
    let detail = format!(
        "https://api.mzizi.dev/v1/architecture/nodes/{}",
        js::encode_uri_component(c.param(0))
    );
    gone(
        "The layer model is retired. Mzizi serves the DNA double helix — nodes on strands, held by cross-cutting rungs. This route served an axis_name per row behind a 1-10 bound; node numbers are labels, not a sequence, and the set is never capped.",
        &[
            ("node detail", detail.as_str()),
            ("architecture", "https://api.mzizi.dev/v1/architecture"),
            ("nodes + strands (MCP)", "get_node_documents"),
        ],
    )
}
