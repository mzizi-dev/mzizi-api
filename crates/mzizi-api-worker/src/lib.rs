//! api.mzizi.dev, the Mzizi registry API, as a workers-rs Cloudflare Worker.
//!
//! Every route answers from data generated at build time out of
//! mzizi-dev/mzizi-registry's repository files (`scripts/build-data.mjs`,
//! pinned in `scripts/registry-ref.json`) and embedded in this Worker. There is
//! no origin, no database and no Supabase.
//!
//! The contract is the one api.mzizi.dev serves (paths, methods, query
//! parameters, status codes, bodies, CORS and cache headers), and
//! `npm run parity` holds this Worker to it. The router is plain Rust
//! ([`app::handle`]) so `cargo test` runs it natively; the Workers glue is a
//! thin wrapper compiled only for `wasm32`.

#![forbid(unsafe_code)]

pub mod app;
pub mod data;
pub mod http;
pub mod js;
pub mod projections;
pub mod routes;
pub mod search;

pub use app::{Clock, handle};
pub use http::Reply;

#[cfg(target_arch = "wasm32")]
mod worker_glue;
