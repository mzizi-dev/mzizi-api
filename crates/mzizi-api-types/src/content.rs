//! Discovery, health, changelog, skills, samples, AI instructions and OpenAPI.

use indexmap::IndexMap;
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::{Object, row_projection};

/// `/v1`: the discovery document.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct DiscoveryDocument {
    #[serde(rename = "$schema")]
    pub schema: String,
    #[serde(rename = "@context")]
    pub context: String,
    #[serde(rename = "@type")]
    pub kind: String,
    pub name: String,
    pub version: String,
    pub description: String,
    pub homepage: String,
    pub data: DiscoveryData,
    /// Every resource the API serves, keyed by name.
    pub resources: IndexMap<String, Resource>,
}

/// Where the API's data comes from.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct DiscoveryData {
    /// `files`: the registry's repository files, not a database.
    pub source: String,
    pub repository: String,
    /// Items in the registry.
    pub components: usize,
}

/// A resource in the discovery document.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct Resource {
    pub href: String,
    pub description: String,
    /// `gone` for a retired resource.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub status: Option<String>,
}

/// `/v1/health`.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct HealthBody {
    /// `healthy`.
    pub status: String,
    /// ISO 8601, with milliseconds.
    pub timestamp: String,
    pub checks: HealthChecks,
    pub version: String,
}

/// `/v1/health` `checks`.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct HealthChecks {
    pub api: HealthCheck,
}

/// One health check.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HealthCheck {
    /// `pass`.
    pub status: String,
    pub latency_ms: u64,
}

/// `/v1/changelog`: every release record, newest first.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct ChangelogBody {
    pub data: Vec<Value>,
    pub meta: TotalMeta,
}

/// `{ "total": n }`.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct TotalMeta {
    pub total: usize,
}

/// `/v1/changelog/{version}`: the first record of the version, spread at the
/// top level, then every record of the version.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct ChangelogVersionBody {
    #[serde(flatten)]
    pub entry: Object,
    pub data: Vec<Value>,
    pub meta: ChangelogVersionMeta,
}

/// `/v1/changelog/{version}` `meta`.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct ChangelogVersionMeta {
    pub version: String,
    pub entries: usize,
}

/// `/v1/skills` and `/v1/skills/summary`: the agent-skills bundle.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct SkillsBody {
    pub data: Vec<Value>,
    pub meta: SkillsMeta,
}

/// `/v1/skills` `meta`.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct SkillsMeta {
    pub count: usize,
    /// The `@nyuchi/mzizi-skills` version.
    pub version: Value,
}

/// `/v1/skills/{name}`: one skill's full body.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct SkillBody {
    pub data: Value,
    pub meta: VersionMeta,
}

/// `{ "version": … }`.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct VersionMeta {
    pub version: Value,
}

/// `/v1/samples`: the sample-data catalogue.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct SamplesIndex {
    #[serde(rename = "@context")]
    pub context: String,
    #[serde(rename = "@type")]
    pub kind: String,
    pub name: String,
    pub description: String,
    pub sample: bool,
    pub types: Vec<SampleType>,
    pub notes: Vec<String>,
}

/// One sample type in `/v1/samples`.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct SampleType {
    #[serde(rename = "type")]
    pub kind: String,
    pub count: usize,
    pub href: String,
    pub mongodb: MongoLocation,
}

/// The MongoDB database and collection the samples load into.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct MongoLocation {
    pub database: String,
    pub collection: String,
}

/// `/v1/samples/{type}`: every sample record of a type.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct SampleSet {
    #[serde(rename = "@context")]
    pub context: String,
    #[serde(rename = "@type")]
    pub kind: String,
    pub name: String,
    pub description: String,
    pub sample: bool,
    #[serde(rename = "type")]
    pub sample_type: String,
    pub count: usize,
    pub mongodb: MongoLocation,
    pub records: Vec<Value>,
}

/// `/v1/ai/instructions`: every AI instruction set, without its text.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct AiInstructionsIndex {
    pub data: Vec<AiInstructionSummary>,
    pub meta: TotalMeta,
}

row_projection! {
    /// One AI instruction set in `/v1/ai/instructions`. The full row, with
    /// `instruction_text`, is `/v1/ai/instructions/{name}`.
    pub struct AiInstructionSummary {
        name: "name", target: "target", title: "title", description: "description",
        version: "version", updated_at: "updated_at",
    }
}

/// `/openapi?format=json`: the OpenAPI YAML, wrapped.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct OpenApiJson {
    pub message: String,
    pub yaml: String,
}
