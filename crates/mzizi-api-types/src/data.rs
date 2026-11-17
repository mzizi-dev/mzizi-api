//! The registry data shapes: what mzizi-registry's `registry.json` and its
//! readers produce, and what the API bundles at build time.

use serde::{Deserialize, Serialize};
use serde_json::{Number, Value};

use crate::Object;

/// A file a registry item declares (`files[]` in `registry.json`).
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct RegistryFile {
    pub path: String,
    #[serde(rename = "type")]
    pub kind: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub target: Option<String>,
}

/// An item's `meta` block. `owner` and `collection` are what the API filters
/// on; the rest (docs, demo flags, contracts) is kept as the registry wrote it.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct ItemMeta {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub owner: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub collection: Option<String>,
    #[serde(flatten)]
    pub extra: Object,
}

/// A registry item: mzizi-registry `lib/registry.ts` `RegistryItem`, with the
/// two Roots fields the build adds (`rsPath`, `rsCrate`).
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegistryItem {
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
    pub files: Option<Vec<RegistryFile>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub meta: Option<ItemMeta>,
    /// The item's node on the helix. A label, not a sequence.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub node: Option<Number>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub node_label: Option<String>,
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
    /// `sources.rs` from the registry's on-disk index, when the item has a Rust file.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub rs_path: Option<String>,
    /// The crate that compiles the item's `.rs` (mzizi-registry `crateFor`).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub rs_crate: Option<String>,
}

/// A file as `/v1/ui/{name}` ships it: the declared file plus its content.
/// Binary-only items (PNG icons) carry `encoding: "base64"` and a `mime` type.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct ItemFile {
    pub path: String,
    #[serde(rename = "type")]
    pub kind: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub target: Option<String>,
    pub content: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub encoding: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mime: Option<String>,
}

/// A file of an Astro document (`/v1/astro/{name}`). Assets carry
/// `encoding: "base64"`.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct AstroFile {
    pub path: String,
    #[serde(rename = "type")]
    pub kind: String,
    pub target: String,
    pub content: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub encoding: Option<String>,
}

/// mzizi-registry `lib/astro.ts` `AstroDocument`: a component's pure `.astro`
/// (or a framework-free `.ts` module) as a registry document.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AstroDocument {
    #[serde(rename = "$schema", default, skip_serializing_if = "Option::is_none")]
    pub schema: Option<String>,
    pub name: String,
    #[serde(rename = "type")]
    pub kind: String,
    pub target: String,
    pub dependencies: Vec<String>,
    pub registry_dependencies: Vec<String>,
    pub files: Vec<AstroFile>,
}

/// mzizi-registry `getComponentWithDocs(name)`: the docs row and demo flag.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct ComponentDocs {
    #[serde(default)]
    pub docs: Value,
    #[serde(default)]
    pub demo: Value,
}
