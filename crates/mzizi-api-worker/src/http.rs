//! Responses as plain data, so the router runs (and is tested) without the
//! Workers runtime, and the header sets the TypeScript Worker sent.

use serde::Serialize;

/// Header names and values in the order they were first set. Names compare
/// case-insensitively, as `Headers` does.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct HeaderList(Vec<(String, String)>);

impl HeaderList {
    /// `Headers.set`: replaces an existing value in place, or appends.
    pub fn set(&mut self, name: &str, value: &str) {
        match self
            .0
            .iter_mut()
            .find(|(n, _)| n.eq_ignore_ascii_case(name))
        {
            Some(entry) => entry.1 = value.to_owned(),
            None => self.0.push((name.to_owned(), value.to_owned())),
        }
    }

    pub fn get(&self, name: &str) -> Option<&str> {
        self.0
            .iter()
            .find(|(n, _)| n.eq_ignore_ascii_case(name))
            .map(|(_, v)| v.as_str())
    }

    pub fn has(&self, name: &str) -> bool {
        self.get(name).is_some()
    }

    pub fn iter(&self) -> impl Iterator<Item = (&str, &str)> {
        self.0.iter().map(|(n, v)| (n.as_str(), v.as_str()))
    }
}

impl From<&[(&str, &str)]> for HeaderList {
    fn from(pairs: &[(&str, &str)]) -> Self {
        let mut list = HeaderList::default();
        for (n, v) in pairs {
            list.set(n, v);
        }
        list
    }
}

/// A response: status, headers and an optional body.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Reply {
    pub status: u16,
    pub headers: HeaderList,
    pub body: Option<Vec<u8>>,
}

impl Reply {
    /// A response with no body.
    pub fn empty(status: u16, headers: &[(&str, &str)]) -> Self {
        Reply {
            status,
            headers: headers.into(),
            body: None,
        }
    }

    /// A text response with the given headers.
    pub fn text(status: u16, body: impl Into<String>, headers: &[(&str, &str)]) -> Self {
        Reply {
            status,
            headers: headers.into(),
            body: Some(body.into().into_bytes()),
        }
    }

    /// The body as UTF-8 (tests).
    pub fn body_text(&self) -> &str {
        self.body
            .as_deref()
            .and_then(|b| std::str::from_utf8(b).ok())
            .unwrap_or("")
    }
}

/// `NextResponse.json(body, init)`: `JSON.stringify(body)` with
/// `content-type: application/json` (no charset) and then `headers`.
pub fn json<T: Serialize + ?Sized>(body: &T, status: u16, headers: &[(&str, &str)]) -> Reply {
    let mut list = HeaderList::default();
    list.set("Content-Type", "application/json");
    for (n, v) in headers {
        list.set(n, v);
    }
    match serde_json::to_vec(body) {
        Ok(bytes) => Reply {
            status,
            headers: list,
            body: Some(bytes),
        },
        Err(_) => internal_error(),
    }
}

/// `{ "error": "Internal server error" }` with the CORS header.
pub fn internal_error() -> Reply {
    Reply {
        status: 500,
        headers: [
            ("Content-Type", "application/json"),
            ("Access-Control-Allow-Origin", "*"),
        ]
        .as_slice()
        .into(),
        body: Some(br#"{"error":"Internal server error"}"#.to_vec()),
    }
}

/// next.config.mjs `headers()` → `source: "/(.*)"`: on every rendered
/// response, not on redirects.
pub const SECURITY_HEADERS: &[(&str, &str)] = &[
    ("X-Frame-Options", "SAMEORIGIN"),
    ("X-Content-Type-Options", "nosniff"),
    ("Referrer-Policy", "strict-origin-when-cross-origin"),
    (
        "Permissions-Policy",
        "camera=(), microphone=(), geolocation=(), payment=()",
    ),
    (
        "Strict-Transport-Security",
        "max-age=63072000; includeSubDomains; preload",
    ),
    ("X-DNS-Prefetch-Control", "on"),
];

/// next.config.mjs `headers()` → `source: "/api/:path*"`. Matched against the
/// path as requested, so `/api/v1/...` carries these and `/v1/...` does not.
pub const API_PREFIX_CORS: &[(&str, &str)] = &[
    ("Access-Control-Allow-Origin", "*"),
    ("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS"),
    (
        "Access-Control-Allow-Headers",
        "Content-Type, Authorization",
    ),
];

/// next.config.mjs `headers()` → `source: "/mcp"`.
pub const MCP_CORS: &[(&str, &str)] = &[
    ("Access-Control-Allow-Origin", "*"),
    ("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS"),
    (
        "Access-Control-Allow-Headers",
        "Content-Type, MCP-Protocol-Version, MCP-Session-Id",
    ),
];

pub const CORS: &[(&str, &str)] = &[("Access-Control-Allow-Origin", "*")];

/// `public, max-age=3600, s-maxage=86400` with CORS: most 200s.
pub const CORS_CACHE: &[(&str, &str)] = &[
    ("Cache-Control", "public, max-age=3600, s-maxage=86400"),
    ("Access-Control-Allow-Origin", "*"),
];

/// `public, max-age=300, s-maxage=3600` with CORS: search, AI instructions.
pub const CACHE_5M: &[(&str, &str)] = &[
    ("Cache-Control", "public, max-age=300, s-maxage=3600"),
    ("Access-Control-Allow-Origin", "*"),
];

/// `public, max-age=600, s-maxage=3600` with CORS: the changelog.
pub const CACHE_10M: &[(&str, &str)] = &[
    ("Cache-Control", "public, max-age=600, s-maxage=3600"),
    ("Access-Control-Allow-Origin", "*"),
];

/// `public, max-age=60, s-maxage=120` with CORS: stats.
pub const STATS_CACHE: &[(&str, &str)] = &[
    ("Cache-Control", "public, max-age=60, s-maxage=120"),
    ("Access-Control-Allow-Origin", "*"),
];

/// The retired routes' 410: CORS and a cache header.
pub const GONE_HEADERS: &[(&str, &str)] = &[
    ("Access-Control-Allow-Origin", "*"),
    ("Cache-Control", "public, max-age=3600, s-maxage=86400"),
];

/// Next marks every 404 it serves uncacheable unless the handler said otherwise.
pub const NOT_FOUND_CACHE: &str = "private, no-cache, no-store, max-age=0, must-revalidate";
