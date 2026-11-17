//! `/v1/brand`: the brand system — 21 colour families (seven minerals, seven
//! heritage, seven experimental), the ecosystem brands, typography, spacing.

use indexmap::IndexMap;
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::row_projection;

/// `/v1/brand`.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrandBody {
    #[serde(rename = "$schema")]
    pub schema: String,
    #[serde(rename = "@context")]
    pub context: String,
    #[serde(rename = "@type")]
    pub kind: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub version: Option<Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_updated: Option<Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub homepage: Option<Value>,
    pub minerals: Vec<Mineral>,
    pub ecosystem: Vec<EcosystemBrand>,
    pub typography: Typography,
    pub spacing: Vec<SpacingStep>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub radii: Option<Value>,
    pub semantic_colors: Vec<ThemedColor>,
    pub backgrounds: Vec<ThemedColor>,
    pub heritage: Vec<HeritageColor>,
    pub experimental: Vec<ExperimentalColor>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub component_specs: Option<Value>,
    /// The Bundu floor: minimum hit regions, body size, spacing and contrast.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub accessibility: Option<Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub voice_and_tone: Option<Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub philosophy: Option<Value>,
}

row_projection! {
    /// One of the seven African minerals, with its full palette record.
    pub struct Mineral {
        name: "name", role: "role", family: "family", hex: "hex",
        light_hex: "lightHex", dark_hex: "darkHex",
        container_light: "containerLight", container_dark: "containerDark",
        on_container_light: "onContainerLight", on_container_dark: "onContainerDark",
        text_light: "textLight", text_dark: "textDark", css_var: "cssVar",
        sort_order: "sortOrder", origin: "origin", symbolism: "symbolism", usage: "usage",
    }
}

row_projection! {
    /// A brand of the ecosystem. `displayName`, `accent` and `aliases` appear
    /// only on the rows that carry them.
    pub struct EcosystemBrand {
        name: "name", meaning: "meaning", language: "language", role: "role",
        description: "description", voice: "voice", mineral: "mineral", url: "url",
        display_name: "displayName", accent: "accent", aliases: "aliases",
    }
}

/// `/v1/brand` `typography`.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct Typography {
    /// Keyed by role: `sans`, `serif`, `mono`.
    pub fonts: IndexMap<String, Font>,
    pub scale: Vec<TypeScaleStep>,
}

/// A font family and why it was chosen.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct Font {
    pub family: Value,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub usage: Option<Value>,
    pub reason: Value,
}

/// A step of the type scale.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TypeScaleStep {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<Value>,
    pub size_px: Value,
    pub size_rem: Value,
    pub line_height: Value,
    pub weight: Value,
    pub font: Value,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub usage: Option<Value>,
}

row_projection! {
    /// A step of the spacing scale.
    pub struct SpacingStep { name: "name", px: "px", rem: "rem", usage: "usage" }
}

/// A colour with a light and a dark value: the semantic colours and the backgrounds.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct ThemedColor {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub light: Option<Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub dark: Option<Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub usage: Option<Value>,
}

row_projection! {
    /// A heritage colour family.
    pub struct HeritageColor {
        name: "name", hex: "hex", light_hex: "lightHex", dark_hex: "darkHex",
        text_light: "textLight", text_dark: "textDark", css_var: "cssVar",
        origin: "origin", symbolism: "symbolism", usage: "usage",
    }
}

row_projection! {
    /// An experimental colour family.
    pub struct ExperimentalColor {
        name: "name", hex: "hex", light_hex: "lightHex", dark_hex: "darkHex",
        container_light: "containerLight", container_dark: "containerDark",
        on_container_light: "onContainerLight", on_container_dark: "onContainerDark",
        text_light: "textLight", text_dark: "textDark", ui_light: "uiLight",
        ui_dark: "uiDark", css_var: "cssVar", heptagon_index: "heptagonIndex",
    }
}
