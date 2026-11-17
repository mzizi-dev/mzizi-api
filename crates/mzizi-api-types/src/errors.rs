//! Error and retired-route bodies.

use serde::{Deserialize, Serialize};

use crate::Object;

/// `{ "error": "…" }`: most 4xx and 5xx bodies.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct ErrorBody {
    pub error: String,
}

/// An error with a longer explanation: `/v1/rs/{name}` and `/v1/astro/{name}`
/// for a component with no build in that target, `/v1/ui/{name}/versions`
/// (503) and `/v1/architecture/nodes/{n}` for a number with no node.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct ErrorWithMessage {
    pub error: String,
    pub message: String,
}

/// A 400 for a malformed path parameter, echoing what was received.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct InvalidParameter {
    pub error: String,
    pub received: String,
}

/// `/v1/skills/{name}` for a name the bundle does not hold.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct SkillNotFound {
    pub error: String,
    pub received: String,
    pub available: Vec<String>,
}

/// `/v1/samples/{type}` for a type with no samples.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct UnknownSampleType {
    pub error: String,
    pub available: Vec<String>,
}

/// The 404 for a path no route serves.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct RouteNotFound {
    pub error: String,
    pub path: String,
}

/// A 410 for a retired route, with where its content went.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct Gone {
    pub error: String,
    pub message: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub migrated_to: Option<Object>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub slug: Option<String>,
}
