//! Serde types for the Mzizi registry API, [api.mzizi.dev](https://api.mzizi.dev/v1).
//!
//! Every response body the API serves has a type here, and so do the registry
//! data shapes those bodies are built from ([`RegistryItem`] and friends). The
//! Worker that serves api.mzizi.dev serializes these types, and clients such as
//! `mzizi-cli` deserialize them, so both sides compile against one contract.
//!
//! # Field order and absent fields
//!
//! Field order is the order the API sends, so a body serialized from these
//! types matches the served JSON key for key. A field the API omits when it
//! has no value is an `Option` that is skipped when `None`; a field the API
//! sends as `null` is an `Option` that is not skipped.
//!
//! Rows the registry keeps as free-form documents (doctrine rows, helix nodes,
//! changelog entries, skills, sample records) stay [`serde_json::Value`]: their
//! shape is the registry's, and it grows without an API release.
//!
//! ```
//! use mzizi_api_types::UiIndex;
//!
//! let body = r#"{"$schema":"https://ui.shadcn.com/schema/registry.json","name":"mzizi",
//!   "homepage":"https://mzizi.dev","items":[{"name":"button","node":2}],
//!   "meta":{"total":1,"count":1,"offset":0,"limit":null,"registryTotal":693,
//!   "filters":{"node":null,"owner":null,"collection":null,"type":null}}}"#;
//! let index: UiIndex = serde_json::from_str(body).unwrap();
//! assert_eq!(index.items[0].name, "button");
//! ```

#![forbid(unsafe_code)]

mod architecture;
mod brand;
mod content;
mod data;
mod errors;
mod registry;

pub use architecture::*;
pub use brand::*;
pub use content::*;
pub use data::*;
pub use errors::*;
pub use registry::*;

pub use serde_json::{Map, Number, Value};

/// A JSON object whose keys keep the order they were inserted in.
pub type Object = Map<String, Value>;

/// The `$schema` of a registry index (`/v1/ui`).
pub const REGISTRY_SCHEMA: &str = "https://ui.shadcn.com/schema/registry.json";
/// The `$schema` of a registry item (`/v1/ui/{name}`, `/v1/rs/{name}`, `/v1/astro/{name}`).
pub const REGISTRY_ITEM_SCHEMA: &str = "https://ui.shadcn.com/schema/registry-item.json";

/// Declares a projection of a free-form registry row: every field is the
/// row's value as it stands (`null` included), and is left out when the row
/// has no such key.
macro_rules! row_projection {
    (
        $(#[$meta:meta])*
        pub struct $name:ident {
            $( $(#[$fmeta:meta])* $field:ident : $json:literal ),* $(,)?
        }
    ) => {
        $(#[$meta])*
        #[derive(Debug, Clone, Default, PartialEq, ::serde::Serialize, ::serde::Deserialize)]
        pub struct $name {
            $(
                $(#[$fmeta])*
                #[serde(rename = $json, default, skip_serializing_if = "Option::is_none")]
                pub $field: Option<::serde_json::Value>,
            )*
        }
    };
}
pub(crate) use row_projection;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn absent_fields_are_skipped_and_null_fields_are_kept() {
        let meta = UiIndexMeta {
            total: 0,
            count: 0,
            offset: Number::from(0),
            limit: None,
            registry_total: 0,
            filters: UiFilters::default(),
        };
        assert_eq!(
            serde_json::to_string(&meta).unwrap(),
            r#"{"total":0,"count":0,"offset":0,"limit":null,"registryTotal":0,"filters":{"node":null,"owner":null,"collection":null,"type":null}}"#
        );
        let hit = SearchHit {
            name: "button".into(),
            ..SearchHit::default()
        };
        assert_eq!(serde_json::to_string(&hit).unwrap(), r#"{"name":"button"}"#);
    }

    #[test]
    fn round_trips_a_registry_item() {
        let raw = r#"{"author":"Mzizi","name":"button","type":"registry:ui","meta":{"owner":"mzizi","collection":"core","hasDemo":true},"node":2,"files":[{"path":"a.tsx","type":"registry:ui","target":"b.tsx"}]}"#;
        let item: RegistryItem = serde_json::from_str(raw).unwrap();
        assert_eq!(item.meta.as_ref().unwrap().owner.as_deref(), Some("mzizi"));
        assert_eq!(item.node.as_ref().and_then(Number::as_i64), Some(2));
        let back: Value = serde_json::to_value(&item).unwrap();
        assert_eq!(back["meta"]["hasDemo"], Value::Bool(true));
    }
}
