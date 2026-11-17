//! The helix and the doctrine-backed architecture documents:
//! `/v1/architecture[/nodes/{n}]`, `/v1/data-layer`, `/v1/ecosystem`,
//! `/v1/pipeline`, `/v1/sovereignty` and `/v1/ubuntu/{pillars,principles}`.

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::row_projection;

/// The Mzizi DNA double helix: nodes, rungs and strands, as the registry's
/// doctrine holds them.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct Helix {
    pub nodes: Vec<Value>,
    pub rungs: Vec<Value>,
    pub strands: Vec<Value>,
}

/// `/v1/architecture`.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct ArchitectureBody {
    pub data: Helix,
    pub meta: ArchitectureMeta,
}

/// `/v1/architecture` `meta`.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct ArchitectureMeta {
    /// `mzizi-dna-helix`.
    pub model: String,
    pub node_count: usize,
    pub rung_count: usize,
    pub strand_count: usize,
    pub empty: bool,
    pub source: String,
    pub version: String,
}

/// `/v1/architecture/nodes/{n}`: one node or rung.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct NodeBody {
    pub data: Value,
    pub meta: ModelMeta,
}

/// `{ "model": "mzizi-dna-helix", "version": "v1" }`.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct ModelMeta {
    pub model: String,
    pub version: String,
}

/// `/v1/data-layer`.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DataLayerBody {
    #[serde(rename = "@context")]
    pub context: String,
    #[serde(rename = "@type")]
    pub kind: String,
    pub name: String,
    pub local_data_layer: Vec<LocalDataTier>,
    pub cloud_layer: Vec<CloudService>,
    pub data_ownership: Vec<DataOwnershipRule>,
}

row_projection! {
    /// A local data-layer tier.
    pub struct LocalDataTier {
        name: "name", role: "role", platform: "platform",
        description: "description", sovereignty: "sovereignty",
    }
}

row_projection! {
    /// A cloud data service.
    pub struct CloudService {
        name: "name", role: "role", consistency_model: "consistencyModel",
        database: "database", data_categories: "dataCategories",
        description: "description", sovereignty: "sovereignty",
    }
}

row_projection! {
    /// Who owns a category of data, and how conflicts resolve.
    pub struct DataOwnershipRule {
        category: "category", consistency_model: "consistencyModel",
        database: "database", examples: "examples",
        conflict_resolution: "conflictResolution", ownership: "ownership",
        description: "description",
    }
}

/// `/v1/ecosystem`.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EcosystemBody {
    #[serde(rename = "@context")]
    pub context: String,
    #[serde(rename = "@type")]
    pub kind: String,
    pub name: String,
    pub principles: Vec<ArchitecturePrinciple>,
    /// `null` when the doctrine holds no framework decision.
    pub framework_decision: Option<FrameworkDecision>,
}

row_projection! {
    /// An architecture principle.
    pub struct ArchitecturePrinciple {
        name: "name", title: "title", description: "description",
        rationale: "rationale", implementation: "implementation",
    }
}

row_projection! {
    /// The framework decision.
    pub struct FrameworkDecision {
        name: "name", approach: "approach", framework: "framework",
        rationale: "rationale", sovereignty_advantage: "sovereigntyAdvantage",
        platforms: "platforms", harmony_os: "harmonyOs",
    }
}

/// `/v1/pipeline`.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct PipelineBody {
    #[serde(rename = "@context")]
    pub context: String,
    #[serde(rename = "@type")]
    pub kind: String,
    pub name: String,
    pub stages: Vec<PipelineStage>,
}

row_projection! {
    /// A stage of the open data pipeline.
    pub struct PipelineStage {
        name: "name", role: "role", description: "description", sovereignty: "sovereignty",
    }
}

/// `/v1/sovereignty`.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SovereigntyBody {
    #[serde(rename = "@context")]
    pub context: String,
    #[serde(rename = "@type")]
    pub kind: String,
    pub name: String,
    pub assessments: Vec<SovereigntyAssessment>,
    pub removed_technologies: Vec<RemovedTechnology>,
}

row_projection! {
    /// A technology's sovereignty assessment.
    pub struct SovereigntyAssessment {
        technology: "technology", role: "role", license: "license",
        governance: "governance", sovereignty_risk: "sovereigntyRisk",
        forkable: "forkable", self_hostable: "selfHostable", rationale: "rationale",
    }
}

row_projection! {
    /// A technology the stack removed, and what replaced it.
    pub struct RemovedTechnology {
        name: "name", previous_role: "previousRole", reason: "reason",
        replacement: "replacement", migration_path: "migrationPath",
    }
}

/// `/v1/ubuntu/pillars` and `/v1/ubuntu/principles`.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UbuntuList<T> {
    #[serde(rename = "@context")]
    pub context: String,
    #[serde(rename = "@type")]
    pub kind: String,
    pub name: String,
    pub description: String,
    pub item_list_element: Vec<T>,
}

row_projection! {
    /// An Ubuntu pillar: a sphere in which Ubuntu is lived.
    pub struct UbuntuPillar {
        name: "name", shona: "shona", title: "title", description: "description",
        sphere: "sphere", platform_surface: "platformSurface", source: "source",
        sort_order: "sortOrder",
    }
}

row_projection! {
    /// An Ubuntu principle: an operating rule for software.
    pub struct UbuntuPrinciple {
        name: "name", shona: "shona", title: "title", description: "description",
        expression: "expression", source: "source", sort_order: "sortOrder",
    }
}
