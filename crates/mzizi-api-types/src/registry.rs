//! The component registry: `/v1/ui`, `/v1/ui/{name}[/docs]`, `/v1/rs/{name}`,
//! `/v1/astro[/{name}]`, `/v1/search` and `/v1/stats`.

use serde::{Deserialize, Serialize};
use serde_json::{Number, Value};

use crate::{AstroFile, ItemFile, Object};

/// `/v1/ui`: the registry index, in shadcn's registry shape.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct UiIndex {
    #[serde(rename = "$schema")]
    pub schema: String,
    pub name: String,
    pub homepage: String,
    pub items: Vec<UiIndexItem>,
    pub meta: UiIndexMeta,
}

/// One entry of `/v1/ui`.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UiIndexItem {
    pub name: String,
    #[serde(rename = "type", default, skip_serializing_if = "Option::is_none")]
    pub kind: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub categories: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub dependencies: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub registry_dependencies: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub node: Option<Number>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub node_label: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub owner: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub collection: Option<String>,
}

/// `/v1/ui` `meta`: paging and the filters that applied.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UiIndexMeta {
    /// Items matching the filters, before paging.
    pub total: usize,
    /// Items in this page.
    pub count: usize,
    pub offset: Number,
    /// `null` when no `?limit=` applied.
    pub limit: Option<Number>,
    /// Every item in the registry.
    pub registry_total: usize,
    pub filters: UiFilters,
}

/// The `/v1/ui` filters; `null` when not given.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct UiFilters {
    pub node: Option<Number>,
    pub owner: Option<String>,
    pub collection: Option<String>,
    #[serde(rename = "type")]
    pub kind: Option<String>,
}

/// `/v1/ui/{name}`: one installable registry item. A component carries
/// `files` with their source; a data item (tokens, a base style) carries its
/// CSS variables or style instead.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegistryItemBody {
    #[serde(rename = "$schema")]
    pub schema: String,
    pub name: String,
    #[serde(rename = "type", default, skip_serializing_if = "Option::is_none")]
    pub kind: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub author: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub categories: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub docs: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub dependencies: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub registry_dependencies: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub css_vars: Option<Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub css: Option<Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub style: Option<Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub icon_library: Option<Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub base_color: Option<Value>,
    /// shadcn's optional `tailwind` config block, passed through opaquely on
    /// the one legacy data item that still has it. Components carry no styling
    /// assumptions: the registry is moving to Lightning CSS and unstyled
    /// components, so this field is expected to disappear and nothing here
    /// reads it.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tailwind: Option<Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub files: Option<Vec<ItemFile>>,
}

/// `/v1/ui/{name}/docs`: the component's docs row and demo flag.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocsBody {
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub node: Option<Number>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub node_label: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub owner: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub collection: Option<String>,
    /// Use cases, variants, sizes, features, accessibility, examples; `null` when none.
    pub docs: Value,
    /// `{ "has_demo": … }`, or `null`.
    pub demo: Value,
}

/// `/v1/rs/{name}`: a Mzizi Roots (Rust) component and the crate that compiles it.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct RsBody {
    #[serde(rename = "$schema")]
    pub schema: String,
    pub name: String,
    #[serde(rename = "type", default, skip_serializing_if = "Option::is_none")]
    pub kind: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(rename = "crate")]
    pub krate: CrateRef,
    pub files: Vec<RsFile>,
}

/// The crate a Roots component ships in.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct CrateRef {
    pub name: String,
    /// `crates.io`.
    pub registry: String,
    /// The git install, for a crate not yet on crates.io.
    pub git: String,
}

/// A Roots component's `.rs` file.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct RsFile {
    pub path: String,
    /// `registry:rust`.
    #[serde(rename = "type")]
    pub kind: String,
    pub content: String,
}

/// `/v1/astro`: every name the Astro target serves.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct AstroIndex {
    /// `astro`.
    pub target: String,
    pub install: String,
    pub count: usize,
    pub components: Vec<AstroIndexEntry>,
}

/// One entry of `/v1/astro`.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct AstroIndexEntry {
    pub name: String,
    pub url: String,
}

/// `/v1/astro/{name}`: the Astro document plus the component's title and description.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AstroBody {
    #[serde(rename = "$schema")]
    pub schema: String,
    pub name: String,
    #[serde(rename = "type")]
    pub kind: String,
    /// `astro`.
    pub target: String,
    pub dependencies: Vec<String>,
    /// Absolute `/v1/astro/{name}` URLs.
    pub registry_dependencies: Vec<String>,
    pub files: Vec<AstroFile>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
}

/// `/v1/search`: components matching `q`, `node` and `category`.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct SearchBody {
    pub data: Vec<SearchHit>,
    pub meta: SearchMeta,
}

/// One `/v1/search` hit.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchHit {
    pub name: String,
    #[serde(rename = "type", default, skip_serializing_if = "Option::is_none")]
    pub kind: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub categories: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub node: Option<Number>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub node_label: Option<String>,
}

/// `/v1/search` `meta`. `node` is the query string's value, as given.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct SearchMeta {
    pub total: usize,
    pub query: Option<String>,
    pub node: Option<String>,
    pub category: Option<String>,
    /// Present only when `?layer=` (the deprecated alias of `?node=`) was used.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub deprecation: Option<String>,
}

/// `/v1/stats`: public usage statistics (CC BY 4.0). The telemetry counters
/// are zero; the per-node component counts are real.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct StatsBody {
    #[serde(rename = "@context")]
    pub context: String,
    #[serde(rename = "@type")]
    pub kind: String,
    pub name: String,
    pub description: String,
    pub license: String,
    pub period_days: i64,
    pub total_api_calls: u64,
    pub total_mcp_calls: u64,
    pub total_errors: u64,
    pub overall_error_rate: u64,
    pub avg_duration_ms: u64,
    pub top_endpoints: Vec<Value>,
    pub top_mcp_tools: Vec<Value>,
    pub top_components: Vec<Value>,
    pub calls_by_day: Vec<Value>,
    /// Components per node, keyed by node number.
    pub layers: Object,
}
