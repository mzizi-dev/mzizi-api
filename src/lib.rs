//! api.mzizi.dev — the Mzizi registry API.
//!
//! # The shape of this migration
//!
//! This is a **strangler fig**, not a rewrite. The registry API is ~30 route
//! handlers in `mzizi-dev/mzizi-registry` — not `mzizi-dev/mzizi`, which is the
//! language research repo — and porting all of them before anything ships would
//! mean `api.mzizi.dev` stays a dead hostname for however long that takes
//! — which is the state that already broke `mzizi-console`, whose API client
//! pointed at this address on the belief it resolved.
//!
//! So: every route is served from day one. A route this Worker implements
//! natively is answered here; everything else is forwarded, unmodified, to the
//! Next.js origin that serves it today. Routes move from [`proxy`] to native one
//! at a time, and the caller never sees the difference.
//!
//! Two properties make that safe to do incrementally:
//!
//! * **The API is read-only.** Every `/v1/*` route is a `GET`. There is no write
//!   path to keep consistent across two implementations, which is what usually
//!   makes a strangler fig expensive.
//! * **A ported route is provably identical or it is not ported.** The fixtures
//!   in `tests/` are captured live responses, so a native implementation is
//!   checked against what the origin actually returns rather than against what
//!   this repo believes it returns. The Svelte console that preceded
//!   `mzizi-console` had types that were self-consistent and wrong; that is the
//!   failure this guards against.

use worker::{event, Context, Env, Fetch, Method, Request, Response, Result, Url};

/// Where unported routes are served from.
///
/// `mzizi.dev/api/v1`, and this is measured rather than assumed:
///
/// ```text
/// api.mzizi.dev      NXDOMAIN — no DNS record
/// mzizi.dev/api/v1   200
/// ```
///
/// Note the recursion this Worker must avoid once it owns `api.mzizi.dev`: the
/// origin is the Vercel app on a DIFFERENT hostname, so a proxied request never
/// re-enters this Worker.
const ORIGIN: &str = "https://mzizi.dev/api";

/// Cache and CORS headers, matching what the Next.js handlers already send.
///
/// Kept identical on purpose. A client cannot tell a ported route from a proxied
/// one, and cache behaviour changing under a caller is exactly the kind of
/// difference a migration is not allowed to introduce.
const CACHE_CONTROL: &str = "public, max-age=3600, s-maxage=86400";

#[event(fetch)]
async fn fetch(req: Request, _env: Env, _ctx: Context) -> Result<Response> {
    let path = req.path();

    // CORS preflight. The API is public and read-only, so this is uniform.
    if req.method() == Method::Options {
        return cors(Response::empty()?);
    }

    // Anything that is not a GET is not part of this API. Answering 405 rather
    // than forwarding keeps a write attempt from reaching the origin at all.
    if req.method() != Method::Get {
        return cors(Response::error("Method Not Allowed", 405)?);
    }

    match path.as_str() {
        // ── native ────────────────────────────────────────────────────────
        "/v1/health" => cors(health()?),

        // ── proxied ───────────────────────────────────────────────────────
        // Everything else, including routes not yet enumerated anywhere. A new
        // route added to the origin works here without a change.
        _ => cors(proxy(&req).await?),
    }
}

/// `GET /v1/health` — the gateway's own liveness.
///
/// Deliberately native rather than proxied, and deliberately first. It is the
/// one endpoint whose answer must describe THIS Worker: proxying it would report
/// the origin's health while saying nothing about whether the gateway in front
/// of it is up, which is worse than not having the endpoint.
fn health() -> Result<Response> {
    Response::from_json(&serde_json::json!({
        "status": "ok",
        "service": "mzizi-api-gateway",
        "version": env!("CARGO_PKG_VERSION"),
        "runtime": "cloudflare-workers/rust",
        // Named so an operator reading a health check can see, without opening
        // the code, that some of this API is still served elsewhere.
        "origin": ORIGIN,
    }))
}

/// Forward a request to the origin, preserving path and query string.
///
/// The response is returned as-is. No re-shaping, no re-serialisation: a proxy
/// that parses and re-emits JSON is a second implementation of every route it
/// touches, and would drift from the origin silently.
async fn proxy(req: &Request) -> Result<Response> {
    let incoming = req.url()?;
    let mut target = Url::parse(ORIGIN)?;

    // `ORIGIN` ends at `/api`, so the incoming `/v1/...` appends cleanly.
    target.set_path(&format!("/api{}", incoming.path()));
    target.set_query(incoming.query());

    Fetch::Url(target).send().await
}

/// Apply the shared cache and CORS headers.
///
/// One place, applied to every response including errors — a 404 that omits
/// `Access-Control-Allow-Origin` surfaces in a browser as an opaque CORS failure
/// rather than as the 404 it is, which sends the reader looking in the wrong
/// place entirely.
fn cors(mut res: Response) -> Result<Response> {
    let headers = res.headers_mut();
    headers.set("Access-Control-Allow-Origin", "*")?;
    headers.set("Access-Control-Allow-Methods", "GET, OPTIONS")?;
    headers.set("Cache-Control", CACHE_CONTROL)?;
    Ok(res)
}
