//! Fails early, with the fix, when the bundled data has not been generated.

use std::path::Path;

const FILES: &[&str] = &[
    "ai-instruction-index.json",
    "astro.json",
    "binary.json",
    "brand.json",
    "changelog.json",
    "component-docs.json",
    "components.json",
    "doctrine.json",
    "helix.json",
    "meta.json",
    "samples.json",
    "skills.json",
    "sources.json",
];

fn main() {
    let dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../src/data");
    for file in FILES {
        let path = dir.join(file);
        println!("cargo::rerun-if-changed={}", path.display());
        assert!(
            path.exists(),
            "{} is missing. Run `npm ci && npm run build:data` at the repository root first: \
             the Worker embeds the registry data that step generates.",
            path.display()
        );
    }
}
