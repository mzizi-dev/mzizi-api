//! The router: src/index.ts, step for step.
//!
//! 1. Redirects, answered before routing as Next answers them: bare 308s with
//!    a relative `Location` and no other header but `X-Mzizi-Source`. Repeated
//!    slashes collapse first, then a trailing slash is stripped, then a
//!    renamed `nyuchi-*` component moves to its `mzizi-*` name.
//! 2. Routing, on the path Hono matches (`decodeURI`d), under both `/v1` and
//!    `/api/v1`, plus `/mcp`, `/openapi`, `/api/openapi` and security.txt.
//!    `HEAD` runs the `GET` handler and drops the body.
//! 3. Method handling as Next's route handlers do it: a path with a `GET`
//!    handler answers `OPTIONS` with 204 + `Allow` and any other method with an
//!    empty 405; any other path is the JSON 404.
//! 4. Headers on every rendered response: the security headers, the `/api/*`
//!    or `/mcp` CORS set (by the path as requested), and `Cache-Control:
//!    private, no-cache, …` on a 404 that set none.

use url::Url;

use crate::http::{
    API_PREFIX_CORS, CORS, MCP_CORS, NOT_FOUND_CACHE, Reply, SECURITY_HEADERS, internal_error, json,
};
use crate::routes::{architecture as arch, content, registry};
use crate::{data, js};
use mzizi_api_types::{OpenApiJson, RouteNotFound};

/// The two clock readings a response can carry, taken by the caller (the
/// Worker reads `Date`; tests pass fixed values).
#[derive(Debug, Clone)]
pub struct Clock {
    /// `new Date().toISOString()`: `/v1/health` `timestamp`.
    pub now_iso: String,
    /// A year from now, as `setFullYear(getFullYear() + 1)` gives it: security.txt `Expires`.
    pub expires_iso: String,
}

/// What a handler sees.
pub struct Ctx<'a> {
    params: Vec<String>,
    url: &'a Url,
    pub clock: &'a Clock,
}

impl Ctx<'_> {
    /// The `i`th path parameter, decoded as Hono decodes it.
    pub fn param(&self, i: usize) -> &str {
        self.params.get(i).map_or("", String::as_str)
    }

    /// `URLSearchParams.get(key)`: the first value, or `None`.
    pub fn query(&self, key: &str) -> Option<String> {
        self.url
            .query_pairs()
            .find(|(k, _)| k == key)
            .map(|(_, v)| v.into_owned())
    }
}

type Handler = fn(&Ctx) -> Reply;

/// The routes under `/v1` and `/api/v1`, in registration order. A `:` segment
/// is a parameter.
const V1_GET: &[(&str, Handler)] = &[
    // routes/registry.ts
    ("/ui", registry::ui_index),
    ("/ui/:name/docs", registry::ui_docs),
    ("/ui/:name/versions", registry::ui_versions),
    ("/search", registry::search_route),
    ("/ui/:name", registry::ui_item),
    ("/rs/:name", registry::rs_item),
    ("/astro", registry::astro_index),
    ("/astro/:name", registry::astro_item),
    ("/stats", registry::stats),
    // routes/architecture.ts
    ("/architecture", arch::architecture),
    ("/architecture/nodes/:n", arch::node),
    ("/data-layer", arch::data_layer),
    ("/ecosystem", arch::ecosystem),
    ("/pipeline", arch::pipeline),
    ("/sovereignty", arch::sovereignty),
    ("/ubuntu/pillars", arch::ubuntu_pillars),
    ("/ubuntu/principles", arch::ubuntu_principles),
    ("/architecture/axes", arch::axes_gone),
    ("/architecture/frontend/axes", arch::frontend_axes_gone),
    ("/architecture/frontend/layers", arch::frontend_layers_gone),
    ("/architecture/layers/:n", arch::layer_gone),
    // routes/content.ts
    ("", content::discovery),
    ("/health", content::health),
    ("/brand", content::brand),
    ("/changelog", content::changelog),
    ("/changelog/:version", content::changelog_version),
    ("/skills", content::skills),
    ("/skills/summary", content::skills),
    ("/skills/:name", content::skill),
    ("/samples", content::samples),
    ("/samples/:type", content::sample_set),
    ("/ai/instructions", content::ai_instructions),
    ("/ai/instructions/:name", content::ai_instruction),
    ("/docs", content::docs_gone),
    ("/docs/:slug", content::doc_gone),
];

const V1_OPTIONS: &[(&str, Handler)] = &[("/stats", registry::stats_options)];

/// The routes outside `/v1`.
const APP_GET: &[(&str, Handler)] = &[
    ("/mcp", mcp_redirect),
    ("/openapi", openapi),
    ("/api/openapi", openapi),
    ("/.well-known/security.txt", security_txt),
];

const V1_PREFIXES: &[&str] = &["/v1", "/api/v1"];

/// Matches `path` against a pattern, returning the raw parameter segments.
fn match_pattern<'p>(pattern: &str, path: &'p str) -> Option<Vec<&'p str>> {
    let mut want = pattern.split('/');
    let mut got = path.split('/');
    let mut params = Vec::new();
    loop {
        match (want.next(), got.next()) {
            (None, None) => return Some(params),
            (Some(w), Some(g)) if w.starts_with(':') && !g.is_empty() => params.push(g),
            (Some(w), Some(g)) if w == g => {}
            _ => return None,
        }
    }
}

/// Finds the first route in `table` (mounted under the v1 prefixes when
/// `v1`) that matches `path`.
fn find<'p>(table: &[(&str, Handler)], v1: bool, path: &'p str) -> Option<(Handler, Vec<&'p str>)> {
    if v1 {
        // Hono mounts the whole sub-app under `/v1`, then again under `/api/v1`.
        for prefix in V1_PREFIXES {
            let Some(rest) = path.strip_prefix(prefix) else {
                continue;
            };
            for (pattern, handler) in table {
                if let Some(params) = match_pattern(pattern, rest) {
                    return Some((*handler, params));
                }
            }
        }
        None
    } else {
        table
            .iter()
            .find_map(|(pattern, handler)| Some((*handler, match_pattern(pattern, path)?)))
    }
}

/// The 405/204 test: does any `GET` route's pattern match the path as requested?
fn has_get_route(raw_path: &str) -> bool {
    find(V1_GET, true, raw_path).is_some() || find(APP_GET, false, raw_path).is_some()
}

/// A bare 308 with a relative `Location`.
fn redirect(location: String) -> Reply {
    Reply::empty(308, &[("Location", location.as_str())])
}

/// `/mcp`: the MCP server lives on its own host.
fn mcp_redirect(_: &Ctx) -> Reply {
    Reply::empty(
        308,
        &[
            ("Location", "https://mcp.mzizi.dev/mcp"),
            ("Access-Control-Allow-Origin", "*"),
            ("Cache-Control", "public, max-age=3600"),
        ],
    )
}

const OPENAPI_CACHE: &[(&str, &str)] = &[
    ("Access-Control-Allow-Origin", "*"),
    ("Cache-Control", "public, max-age=3600, s-maxage=86400"),
];

fn openapi(c: &Ctx) -> Reply {
    let yaml = data::OPENAPI_YAML;
    if c.query("format").as_deref() == Some("json") {
        let body = OpenApiJson {
            message: "Use ?format=yaml (default) or fetch the raw YAML.".into(),
            yaml: yaml.to_owned(),
        };
        return json(&body, 200, OPENAPI_CACHE);
    }
    let mut headers = vec![("Content-Type", "application/yaml; charset=utf-8")];
    headers.extend_from_slice(OPENAPI_CACHE);
    headers.push(("X-OpenAPI-Version", "3.1.0"));
    Reply::text(200, yaml, &headers)
}

fn openapi_options(_: &Ctx) -> Reply {
    Reply::empty(
        204,
        &[
            ("Access-Control-Allow-Origin", "*"),
            ("Access-Control-Allow-Methods", "GET, OPTIONS"),
            ("Access-Control-Allow-Headers", "Content-Type"),
        ],
    )
}

/// RFC 9116. Contact is security@nyuchi.com by owner decision (2026-10-03).
fn security_txt(c: &Ctx) -> Reply {
    let body = format!(
        "Contact: mailto:security@nyuchi.com\n\
         Expires: {}\n\
         Canonical: https://api.mzizi.dev/.well-known/security.txt\n\
         Policy: https://github.com/mzizi-dev/mzizi-api-gateway/blob/main/SECURITY.md\n\
         Preferred-Languages: en\n",
        c.clock.expires_iso
    );
    Reply::text(
        200,
        body,
        &[
            ("Content-Type", "text/plain; charset=utf-8"),
            ("Cache-Control", "public, max-age=86400"),
        ],
    )
}

/// Routing and method handling (steps 2 and 3).
///
/// Hono routes on the path sliced from the RAW request URL (`getPath`): dot
/// segments, backslashes and `^` exactly as the client sent them. Everything
/// else src/index.ts does reads `new URL(c.req.url).pathname`, which resolves
/// and re-encodes them; that is `pathname` here.
fn dispatch(method: &str, url: &Url, raw_url: &str, pathname: &str, clock: &Clock) -> Reply {
    let path = js::hono_path(hono_raw_path(raw_url));
    let method = if method == "HEAD" { "GET" } else { method };
    let found = match method {
        "GET" => find(V1_GET, true, &path).or_else(|| find(APP_GET, false, &path)),
        "POST" | "DELETE" => find(&[("/mcp", mcp_redirect)], false, &path),
        "OPTIONS" => find(V1_OPTIONS, true, &path).or_else(|| {
            find(
                &[
                    ("/mcp", (|_| Reply::empty(204, &[])) as Handler),
                    ("/openapi", openapi_options),
                    ("/api/openapi", openapi_options),
                ],
                false,
                &path,
            )
        }),
        _ => None,
    };
    if let Some((handler, params)) = found {
        let ctx = Ctx {
            params: params.into_iter().map(js::decode_param).collect(),
            url,
            clock,
        };
        return handler(&ctx);
    }
    // app.notFound
    if has_get_route(pathname) {
        return if method == "OPTIONS" {
            Reply::empty(204, &[("Allow", "GET, HEAD, OPTIONS")])
        } else {
            Reply::empty(405, &[])
        };
    }
    json(
        &RouteNotFound {
            error: "Not found".into(),
            path: pathname.to_owned(),
        },
        404,
        CORS,
    )
}

/// Answers one request. `url` is the request URL as the runtime gives it.
pub fn handle(method: &str, raw_url: &str, clock: &Clock) -> Reply {
    let url = raw_url;
    let Ok(url) = Url::parse(url) else {
        let mut reply = internal_error();
        for (n, v) in SECURITY_HEADERS {
            reply.headers.set(n, v);
        }
        reply.headers.set("X-Mzizi-Source", data::source_header());
        return reply;
    };
    let pathname = js_pathname(&url);
    let pathname = pathname.as_str();
    let search = match url.query() {
        Some(q) if !q.is_empty() => format!("?{q}"),
        _ => String::new(),
    };

    let mut reply = if pathname.contains("//") {
        // Next collapses repeated slashes first, in its own hop. Before the
        // trailing-slash rule, or `//evil.com/` would redirect to `//evil.com`,
        // a protocol-relative Location that leaves the site.
        let mut collapsed = String::with_capacity(pathname.len());
        for c in pathname.chars() {
            if !(c == '/' && collapsed.ends_with('/')) {
                collapsed.push(c);
            }
        }
        redirect(collapsed + &search)
    } else if pathname.len() > 1 && pathname.ends_with('/') {
        // Next's default `trailingSlash: false`.
        let trimmed = pathname.trim_end_matches('/');
        redirect(format!(
            "{}{search}",
            if trimmed.is_empty() { "/" } else { trimmed }
        ))
    } else if let Some(renamed) = renamed_component_path(pathname) {
        redirect(renamed + &search)
    } else {
        let mut reply = dispatch(method, &url, raw_url, pathname, clock);
        for (n, v) in SECURITY_HEADERS {
            reply.headers.set(n, v);
        }
        if pathname.starts_with("/api/") {
            for (n, v) in API_PREFIX_CORS {
                reply.headers.set(n, v);
            }
        } else if pathname == "/mcp" {
            for (n, v) in MCP_CORS {
                reply.headers.set(n, v);
            }
        }
        if reply.status == 404 && !reply.headers.has("Cache-Control") {
            reply.headers.set("Cache-Control", NOT_FOUND_CACHE);
        }
        reply
    };
    reply.headers.set("X-Mzizi-Source", data::source_header());
    if method == "HEAD" {
        reply.body = None;
    }
    reply
}

/// Hono's `getPath` slice of the raw request URL: from the first `/` after the
/// scheme's `://` up to the first `?` or `#`, untouched.
pub fn hono_raw_path(url: &str) -> &str {
    let from = url.find(':').map_or(3, |i| i + 4);
    let Some(start) = url
        .get(from..)
        .and_then(|rest| rest.find('/'))
        .map(|i| i + from)
    else {
        return "";
    };
    let rest = &url[start..];
    let end = rest.find(['?', '#']).unwrap_or(rest.len());
    &rest[..end]
}

/// `new URL(url).pathname` as the Workers runtime computes it. The url crate
/// follows the same WHATWG parser, except that the runtime also
/// percent-encodes `^` in a path (production answers `/nope/x^` with
/// `"path":"/nope/x%5E"`).
pub fn js_pathname(url: &Url) -> String {
    url.path().replace('^', "%5E")
}

/// Prefixes whose next segment is a registry item name: the API-host subset
/// of `COMPONENT_PATH_PREFIXES` in mzizi-registry lib/component-renames.ts.
const COMPONENT_PATH_PREFIXES: &[&str] = &[
    "/api/v1/ui",
    "/api/v1/rs",
    "/api/health",
    "/api/chaos",
    "/v1/ui",
    "/v1/rs",
];

/// `/v1/ui/nyuchi-footer/docs` → `/v1/ui/mzizi-footer/docs`, or `None`.
pub fn renamed_component_path(pathname: &str) -> Option<String> {
    for prefix in COMPONENT_PATH_PREFIXES {
        let Some(rest) = pathname
            .strip_prefix(prefix)
            .and_then(|r| r.strip_prefix('/'))
        else {
            continue;
        };
        let (segment, tail) = rest.find('/').map_or((rest, ""), |i| rest.split_at(i));
        let renamed = data::renamed(segment)?;
        return Some(format!("{prefix}/{renamed}{tail}"));
    }
    None
}

#[cfg(test)]
mod tests {
    use super::match_pattern;

    #[test]
    fn matches_literal_and_parameter_segments() {
        assert_eq!(
            match_pattern("/ui/:name", "/ui/button"),
            Some(vec!["button"])
        );
        assert_eq!(match_pattern("/ui/:name", "/ui/"), None);
        assert_eq!(match_pattern("/ui/:name", "/ui/a/b"), None);
        assert_eq!(match_pattern("", ""), Some(vec![]));
        assert_eq!(match_pattern("", "/"), None);
        assert_eq!(match_pattern("/ui", "/uix"), None);
    }
}
