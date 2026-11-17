//! The component registry: `/v1/ui`, `/v1/ui/{name}[/docs|/versions]`,
//! `/v1/rs/{name}`, `/v1/astro[/{name}]`, `/v1/search`, `/v1/stats`. Ported
//! from src/routes/registry.ts, itself mzizi-registry app/api/v1/{ui,rs,search,stats}.

use mzizi_api_types::{
    AstroBody, AstroIndex, AstroIndexEntry, CrateRef, DocsBody, ErrorBody, ItemFile,
    REGISTRY_ITEM_SCHEMA, REGISTRY_SCHEMA, RegistryItem, RegistryItemBody, RsBody, RsFile,
    StatsBody, UiFilters, UiIndex, UiIndexItem, UiIndexMeta,
};
use serde_json::Number;

use crate::app::Ctx;
use crate::data::{self, SourceKind};
use crate::http::{CACHE_5M, CORS, CORS_CACHE, Reply, STATS_CACHE, json};
use crate::search::{SearchAnswer, search};
use crate::{js, projections};

/// app/api/v1/ui/route.ts `positiveInt`.
fn positive_int(raw: Option<&str>) -> Option<f64> {
    let raw = raw?;
    if js::trim(raw).is_empty() {
        return None;
    }
    let n = js::number(raw);
    (js::is_integer(n) && n >= 0.0).then_some(n)
}

/// `params.get(k)?.trim() || undefined`.
fn trimmed(raw: Option<&str>) -> Option<String> {
    raw.map(js::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_owned)
}

/// `Array.prototype.slice(start, end)` for non-negative integer bounds.
/// An item's `meta` block.
fn meta_of(item: &RegistryItem) -> Option<&mzizi_api_types::ItemMeta> {
    item.meta.as_ref()
}

fn slice<T>(items: &[T], start: f64, end: Option<f64>) -> &[T] {
    let len = items.len();
    let clamp = |x: f64| if x >= len as f64 { len } else { x as usize };
    let start = clamp(start);
    let end = end.map_or(len, clamp).max(start);
    &items[start..end]
}

pub fn ui_index(c: &Ctx) -> Reply {
    let node = positive_int(c.query("node").as_deref());
    let owner = trimmed(c.query("owner").as_deref());
    let collection = trimmed(c.query("collection").as_deref());
    let kind = trimmed(c.query("type").as_deref());
    let limit = positive_int(c.query("limit").as_deref());
    let offset = positive_int(c.query("offset").as_deref()).unwrap_or(0.0);

    let all = data::components();
    let matched: Vec<&RegistryItem> = all
        .iter()
        .filter(|item| {
            node.is_none_or(|n| item.node.as_ref().and_then(Number::as_f64) == Some(n))
                && owner
                    .as_ref()
                    .is_none_or(|o| meta_of(item).and_then(|m| m.owner.as_ref()) == Some(o))
                && collection
                    .as_ref()
                    .is_none_or(|o| meta_of(item).and_then(|m| m.collection.as_ref()) == Some(o))
                && kind.as_ref().is_none_or(|t| item.kind.as_ref() == Some(t))
        })
        .collect();
    let page = slice(&matched, offset, limit.map(|l| offset + l));
    let items: Vec<UiIndexItem> = page
        .iter()
        .map(|item| UiIndexItem {
            name: item.name.clone(),
            kind: item.kind.clone(),
            title: item.title.clone(),
            description: item.description.clone(),
            categories: item.categories.clone(),
            dependencies: item.dependencies.clone(),
            registry_dependencies: item.registry_dependencies.clone(),
            node: item.node.clone(),
            node_label: item.node_label.clone(),
            owner: meta_of(item).and_then(|m| m.owner.clone()),
            collection: meta_of(item).and_then(|m| m.collection.clone()),
        })
        .collect();
    let body = UiIndex {
        schema: REGISTRY_SCHEMA.into(),
        name: "mzizi".into(),
        homepage: "https://mzizi.dev".into(),
        meta: UiIndexMeta {
            total: matched.len(),
            count: items.len(),
            offset: js::json_number(offset),
            limit: limit.map(js::json_number),
            registry_total: all.len(),
            filters: UiFilters {
                node: node.map(js::json_number),
                owner,
                collection,
                kind,
            },
        },
        items,
    };
    json(&body, 200, CORS_CACHE)
}

/// app/api/v1/ui/[name]/docs/route.ts.
pub fn ui_docs(c: &Ctx) -> Reply {
    let name = c.param(0);
    let found = data::read_component(name)
        .and_then(|component| Some((component, data::component_docs().get(&component.name)?)));
    let Some((component, with_docs)) = found else {
        return json(&projections::docs_not_found(name), 404, CORS);
    };
    let meta = component.meta.as_ref();
    let body = DocsBody {
        name: component.name.clone(),
        description: component.description.clone(),
        node: component.node.clone(),
        node_label: component.node_label.clone(),
        owner: meta.and_then(|m| m.owner.clone()),
        collection: meta.and_then(|m| m.collection.clone()),
        docs: with_docs.docs.clone(),
        demo: with_docs.demo.clone(),
    };
    json(&body, 200, CORS_CACHE)
}

/// Version history is console-owned data with no file behind it: 503, saying why.
pub fn ui_versions(_: &Ctx) -> Reply {
    json(&projections::versions_not_served(), 503, CORS)
}

/// app/api/v1/search/route.ts.
pub fn search_route(c: &Ctx) -> Reply {
    let (q, node, layer, category) = (
        c.query("q"),
        c.query("node"),
        c.query("layer"),
        c.query("category"),
    );
    match search(
        data::components(),
        q.as_deref(),
        node.as_deref(),
        layer.as_deref(),
        category.as_deref(),
    ) {
        SearchAnswer::Found { body, deprecated } => {
            let mut headers = CACHE_5M.to_vec();
            if deprecated {
                headers.push(("Deprecation", "true"));
            }
            json(&body, 200, &headers)
        }
        SearchAnswer::Missing(body) => json(&body, 400, CORS),
    }
}

/// shadcn's registry-item head, shared by every `/v1/ui/{name}` 200.
fn item_head(component: &RegistryItem) -> RegistryItemBody {
    RegistryItemBody {
        schema: REGISTRY_ITEM_SCHEMA.into(),
        name: component.name.clone(),
        kind: component.kind.clone(),
        title: component.title.clone(),
        description: component.description.clone(),
        author: component.author.clone(),
        categories: component.categories.clone(),
        docs: component.docs.clone(),
        dependencies: component.dependencies.clone(),
        registry_dependencies: component.registry_dependencies.clone(),
        ..RegistryItemBody::default()
    }
}

/// `...(value ? { key: value } : {})`.
fn if_truthy(v: &Option<serde_json::Value>) -> Option<serde_json::Value> {
    js::truthy(v.as_ref()).then(|| v.clone()).flatten()
}

pub fn ui_item(c: &Ctx) -> Reply {
    let name = c.param(0);
    let Some(component) = data::read_component(name) else {
        return json(
            &ErrorBody {
                error: format!("Component \"{name}\" not found in registry"),
            },
            404,
            CORS,
        );
    };

    let declared_files = component.files.as_deref().unwrap_or_default();
    let is_data_item = js::truthy(component.css_vars.as_ref())
        || js::truthy(component.css.as_ref())
        || matches!(
            component.kind.as_deref(),
            Some("registry:base" | "registry:style")
        );
    if is_data_item && declared_files.is_empty() {
        let body = RegistryItemBody {
            css_vars: if_truthy(&component.css_vars),
            css: if_truthy(&component.css),
            style: if_truthy(&component.style),
            icon_library: if_truthy(&component.icon_library),
            base_color: if_truthy(&component.base_color),
            tailwind: if_truthy(&component.tailwind),
            ..item_head(component)
        };
        return json(&body, 200, CORS_CACHE);
    }

    // Keyed by the name asked for, as the registry's readComponentSource(name) is.
    let source = data::read_source(name, SourceKind::Primary);
    // A binary-only item (PNG icons): its files ship as base64 with their MIME type.
    if source.is_none()
        && let Some(files) = data::binary().get(&component.name)
    {
        let body = RegistryItemBody {
            files: Some(files.clone()),
            ..item_head(component)
        };
        return json(&body, 200, CORS_CACHE);
    }
    let Some(source) = source else {
        return json(
            &ErrorBody {
                error: format!("No source code available for \"{name}\""),
            },
            404,
            CORS,
        );
    };
    if declared_files.len() > 1 {
        return json(
            &ErrorBody {
                error: format!(
                    "Registry item \"{name}\" declares {} files but a component has exactly one source. \
                     This is a manifest bug in registry.json, not a bad request — serving it would hand you empty files.",
                    declared_files.len()
                ),
            },
            500,
            CORS,
        );
    }
    let files = declared_files
        .iter()
        .map(|f| ItemFile {
            path: f.path.clone(),
            kind: f.kind.clone(),
            target: f.target.clone().filter(|t| !t.is_empty()),
            content: source.to_owned(),
            encoding: None,
            mime: None,
        })
        .collect();
    let body = RegistryItemBody {
        files: Some(files),
        ..item_head(component)
    };
    json(&body, 200, CORS_CACHE)
}

pub fn rs_item(c: &Ctx) -> Reply {
    let name = c.param(0);
    let Some(component) = data::read_component(name) else {
        return json(&projections::rs_not_found(name), 404, CORS);
    };
    let Some(source) = data::read_source(name, SourceKind::Rs) else {
        return json(&projections::rs_no_rust(name), 404, CORS);
    };
    // The crate that compiles the component; none is the registry handler's 500.
    let Some(krate) = &component.rs_crate else {
        return json(&projections::rs_no_crate(name), 500, CORS);
    };
    let body = RsBody {
        schema: REGISTRY_ITEM_SCHEMA.into(),
        name: component.name.clone(),
        kind: component.kind.clone(),
        description: component.description.clone(),
        krate: CrateRef {
            name: krate.clone(),
            registry: "crates.io".into(),
            git: data::meta().crate_git.clone(),
        },
        files: vec![RsFile {
            path: component
                .rs_path
                .clone()
                .unwrap_or_else(|| format!("{name}.rs")),
            kind: "registry:rust".into(),
            content: source.to_owned(),
        }],
    };
    json(&body, 200, CORS_CACHE)
}

/// The Astro target (mzizi-registry#397).
pub fn astro_index(_: &Ctx) -> Reply {
    let names = data::astro_names();
    let body = AstroIndex {
        target: "astro".into(),
        install: "npx @nyuchi/mzizi-cli add <name> --target astro".into(),
        count: names.len(),
        components: names
            .iter()
            .map(|name| AstroIndexEntry {
                name: name.clone(),
                url: format!("https://api.mzizi.dev/v1/astro/{name}"),
            })
            .collect(),
    };
    json(&body, 200, CORS_CACHE)
}

pub fn astro_item(c: &Ctx) -> Reply {
    let name = c.param(0);
    let Some(component) = data::read_component(name) else {
        return json(&projections::astro_not_found(name), 404, CORS);
    };
    let Some(doc) = data::astro().get(&component.name) else {
        return json(&projections::astro_no_astro(&component.name), 404, CORS);
    };
    // `{ $schema, ...doc, title, description }`: the document's own `$schema` wins.
    let body = AstroBody {
        schema: doc
            .schema
            .clone()
            .unwrap_or_else(|| REGISTRY_ITEM_SCHEMA.into()),
        name: doc.name.clone(),
        kind: doc.kind.clone(),
        target: doc.target.clone(),
        dependencies: doc.dependencies.clone(),
        registry_dependencies: doc.registry_dependencies.clone(),
        files: doc.files.clone(),
        title: component.title.clone(),
        description: component.description.clone(),
    };
    json(&body, 200, CORS_CACHE)
}

/// Usage telemetry is zero (this Worker has no telemetry store); the per-node
/// counts are real.
pub fn stats(c: &Ctx) -> Reply {
    let days = match c.query("days").filter(|d| !d.is_empty()) {
        None => 30.0,
        Some(d) => {
            let n = js::parse_int(&d).filter(|n| *n != 0.0).unwrap_or(30.0);
            n.clamp(1.0, 90.0)
        }
    };
    let body = StatsBody {
        context: "https://schema.org".into(),
        kind: "Dataset".into(),
        name: "Mzizi — Usage Statistics".into(),
        description: "Public API and MCP usage metrics for the Mzizi component registry. Open data aligned with the bundu ecosystem philosophy.".into(),
        license: "https://creativecommons.org/licenses/by/4.0/".into(),
        period_days: days as i64,
        layers: data::helix().node_counts.clone(),
        ..StatsBody::default()
    };
    json(&body, 200, STATS_CACHE)
}

pub fn stats_options(_: &Ctx) -> Reply {
    let mut headers = STATS_CACHE.to_vec();
    headers.push(("Allow", "GET, OPTIONS"));
    Reply::empty(204, &headers)
}
