#!/usr/bin/env bash
# Builds the Rust Worker (crates/mzizi-api-worker) for wrangler's custom build.
#
# It is the `build.command` of wrangler.jsonc (production, api.mzizi.dev) and of
# wrangler.rust.jsonc (the side-by-side Rust Worker), so Cloudflare Workers Builds,
# `wrangler deploy` and `wrangler dev` all build the same bundle. Every step is
# idempotent: a step already done is skipped, so a second run costs little.
#
#   1. The registry data (src/data/*.json), which the Rust Worker embeds too.
#   2. A Rust toolchain. If cargo is missing (Workers Builds' image may not
#      have one), rustup is installed non-interactively with the minimal profile.
#      The toolchain version is pinned by rust-toolchain.toml, which rustup reads
#      from this repository.
#   3. The wasm32-unknown-unknown target.
#   4. worker-build 0.9.0, pinned and locked.
#   5. worker-build --release crates/mzizi-api-worker, which writes
#      crates/mzizi-api-worker/build/index.js (the wrangler `main`).
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"

log() { printf '[build-rust] %s\n' "$*" >&2; }

target=wasm32-unknown-unknown
worker_build_version=0.9.0

log "registry data: node scripts/build-data.mjs"
node scripts/build-data.mjs

# rustup's env file puts ~/.cargo/bin on PATH. Source it when it exists.
if [ -f "$HOME/.cargo/env" ]; then
  # shellcheck disable=SC1091
  . "$HOME/.cargo/env"
fi

if ! command -v cargo >/dev/null 2>&1; then
  log "cargo not found: installing rustup non-interactively (minimal profile)"
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal
  # shellcheck disable=SC1091
  . "$HOME/.cargo/env"
fi
export PATH="$HOME/.cargo/bin:$PATH"

# Run inside the repository, so rustup resolves rust-toolchain.toml's pinned
# toolchain (and installs it, with its components, on first use).
log "toolchain: $(cargo --version) ($(rustc --version))"

if command -v rustup >/dev/null 2>&1; then
  rustup target add "$target"
elif [ ! -d "$(rustc --print sysroot)/lib/rustlib/$target" ]; then
  log "cargo is not managed by rustup and has no $target target; install one first"
  exit 1
fi

if ! worker-build --version 2>/dev/null | grep -q "$worker_build_version"; then
  log "installing worker-build $worker_build_version"
  cargo install -q worker-build --version "$worker_build_version" --locked
fi

log "worker-build --release crates/mzizi-api-worker"
worker-build --release crates/mzizi-api-worker
