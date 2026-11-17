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
#      have one), a pinned rustup-init is downloaded, its SHA-256 is checked, and
#      it runs non-interactively with the minimal profile and no default toolchain.
#      The toolchain is the one rust-toolchain.toml names, which rustup installs
#      from this repository; the script then checks rustc is that version.
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
rustup_init_version=1.29.3

log "registry data: node scripts/build-data.mjs"
node scripts/build-data.mjs

# rustup's env file puts ~/.cargo/bin on PATH. Source it when it exists.
if [ -f "$HOME/.cargo/env" ]; then
  # shellcheck disable=SC1091
  . "$HOME/.cargo/env"
fi

channel="$(sed -n 's/^channel *= *"\(.*\)"/\1/p' "$root/rust-toolchain.toml" | head -1)"
if [ -z "$channel" ]; then
  log "rust-toolchain.toml names no channel"
  exit 1
fi

if ! command -v cargo >/dev/null 2>&1; then
  case "$(uname -m)" in
    x86_64) triple=x86_64-unknown-linux-gnu ;;
    aarch64) triple=aarch64-unknown-linux-gnu ;;
    *) log "no pinned rustup-init for $(uname -m)"; exit 1 ;;
  esac
  base="https://static.rust-lang.org/rustup/archive/$rustup_init_version/$triple"
  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' EXIT
  log "cargo not found: installing rustup $rustup_init_version (no default toolchain; $channel comes from rust-toolchain.toml)"
  curl --proto '=https' --tlsv1.2 -sSf -o "$tmp/rustup-init" "$base/rustup-init"
  curl --proto '=https' --tlsv1.2 -sSf -o "$tmp/rustup-init.sha256" "$base/rustup-init.sha256"
  expected="$(cut -d' ' -f1 "$tmp/rustup-init.sha256")"
  echo "$expected  $tmp/rustup-init" | sha256sum -c --quiet -
  chmod +x "$tmp/rustup-init"
  "$tmp/rustup-init" -y --profile minimal --default-toolchain none
  # shellcheck disable=SC1091
  . "$HOME/.cargo/env"
fi
export PATH="$HOME/.cargo/bin:$PATH"

# Run inside the repository, so rustup resolves rust-toolchain.toml's pinned
# toolchain (and installs it, with its components, on first use).
log "toolchain: $(cargo --version) ($(rustc --version))"
case "$(rustc --version)" in
  "rustc $channel "*) ;;
  *) log "rustc is not $channel (rust-toolchain.toml): $(rustc --version)"; exit 1 ;;
esac

if command -v rustup >/dev/null 2>&1; then
  rustup target add "$target"
elif [ ! -d "$(rustc --print sysroot)/lib/rustlib/$target" ]; then
  log "cargo is not managed by rustup and has no $target target; install one first"
  exit 1
fi

if ! worker-build --version 2>/dev/null | grep -qxF "$worker_build_version"; then
  log "installing worker-build $worker_build_version"
  cargo install -q worker-build --version "$worker_build_version" --locked
fi

log "worker-build --release crates/mzizi-api-worker"
worker-build --release crates/mzizi-api-worker
