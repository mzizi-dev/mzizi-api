//! `/v1/search` over the bundled registry index: mzizi-registry's
//! app/api/v1/search/route.ts (mzizi-registry#373). `q` is a case-insensitive
//! substring of a component's name or description, `node` its node on the
//! helix, `category` one of its `categories`; they combine (AND). `?layer=` is
//! a deprecated alias of `?node=`.

use mzizi_api_types::{ErrorBody, RegistryItem, SearchBody, SearchHit, SearchMeta};

use crate::js;

/// The registry handler's `LAYER_DEPRECATION`.
pub const LAYER_DEPRECATION: &str =
    "`layer` is a deprecated alias of `node` and will be removed. Filter with `?node=` instead.";

/// The handler's answer, before headers.
#[derive(Debug, PartialEq)]
pub enum SearchAnswer {
    /// 200; `deprecated` adds `Deprecation: true` (the `?layer=` alias).
    Found { body: SearchBody, deprecated: bool },
    /// 400: no `q`, `node` or `category`.
    Missing(ErrorBody),
}

/// A query parameter: the first value, `URLSearchParams.get`.
pub type Param<'a> = Option<&'a str>;

/// `params.get(k)?.trim() || null`.
fn non_empty(p: Param<'_>) -> Option<String> {
    p.map(js::trim).filter(|s| !s.is_empty()).map(str::to_owned)
}

fn on_node(c: &RegistryItem, node: &str) -> bool {
    c.node
        .as_ref()
        .and_then(serde_json::Number::as_f64)
        .is_some_and(|n| js::number_to_string(n) == node)
}

fn in_category(c: &RegistryItem, category: &str) -> bool {
    c.categories
        .as_deref()
        .unwrap_or_default()
        .iter()
        .any(|x| x == category)
}

/// lib/db `searchComponents`: case-insensitive substring of name or description.
fn matches_query(c: &RegistryItem, q: &str) -> bool {
    c.name.to_lowercase().contains(q)
        || c.description
            .as_deref()
            .unwrap_or("")
            .to_lowercase()
            .contains(q)
}

/// The handler, field for field.
pub fn search(
    items: &[RegistryItem],
    q: Param<'_>,
    node: Param<'_>,
    layer: Param<'_>,
    category: Param<'_>,
) -> SearchAnswer {
    let q = js::trim(q.unwrap_or("")).to_owned();
    let node_param = non_empty(node);
    let layer_param = non_empty(layer);
    let via_layer = node_param.is_none() && layer_param.is_some();
    let node = node_param.or(layer_param);
    let category = non_empty(category);

    let needle = q.to_lowercase();
    let mut results: Vec<&RegistryItem> = if !q.is_empty() {
        // `searchComponents` trims again and lowercases; `q` is trimmed already.
        items.iter().filter(|c| matches_query(c, &needle)).collect()
    } else if let Some(n) = &node {
        items.iter().filter(|c| on_node(c, n)).collect()
    } else if let Some(cat) = &category {
        items.iter().filter(|c| in_category(c, cat)).collect()
    } else {
        return SearchAnswer::Missing(ErrorBody {
            error: "At least one of q, node, or category is required".into(),
        });
    };
    if let Some(n) = &node {
        results.retain(|c| on_node(c, n));
    }
    if let Some(cat) = &category {
        results.retain(|c| in_category(c, cat));
    }

    let data: Vec<SearchHit> = results
        .into_iter()
        .map(|c| SearchHit {
            name: c.name.clone(),
            kind: c.kind.clone(),
            title: c.title.clone(),
            description: c.description.clone(),
            categories: c.categories.clone(),
            node: c.node.clone(),
            node_label: c.node_label.clone(),
        })
        .collect();
    SearchAnswer::Found {
        body: SearchBody {
            meta: SearchMeta {
                total: data.len(),
                query: (!q.is_empty()).then_some(q),
                node,
                category,
                deprecation: via_layer.then(|| LAYER_DEPRECATION.to_owned()),
            },
            data,
        },
        deprecated: via_layer,
    }
}
