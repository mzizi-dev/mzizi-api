#!/usr/bin/env node
/**
 * Generates src/data/*.json — everything the Worker serves — from
 * mzizi-dev/mzizi-registry's repository files at the ref pinned in
 * scripts/registry-ref.json.
 *
 *   1. Check out the registry at exactly that commit (shallow, cached under
 *      .registry/<sha>). REGISTRY_DIR=/path/to/checkout uses an existing one.
 *   2. Bundle scripts/extract.ts against the checkout with esbuild. `@/` resolves
 *      into the checkout and @supabase/supabase-js is replaced by a stub that
 *      throws, so a registry reader that reached for the database fails the build
 *      instead of silently shipping empty data.
 *   3. Run the bundle and split its output into one JSON module per concern.
 *
 * No registry dependencies are installed: the modules it reads (registry.json,
 * lib/*.generated.*, lib/tokens, lib/samples, content-derived doctrine) are
 * plain TypeScript and JSON. It needs git, network access to GitHub and Node.
 */
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pin = JSON.parse(
  readFileSync(join(root, "scripts/registry-ref.json"), "utf8"),
);
const git = (cwd, ...args) =>
  execFileSync("git", args, { cwd, stdio: ["ignore", "pipe", "inherit"] })
    .toString()
    .trim();

function checkout() {
  if (process.env.REGISTRY_DIR) {
    const dir = resolve(process.env.REGISTRY_DIR);
    const head = git(dir, "rev-parse", "HEAD");
    if (head !== pin.ref) {
      throw new Error(
        `REGISTRY_DIR is at ${head}, but scripts/registry-ref.json pins ${pin.ref}. ` +
          "Check out the pinned ref, or bump the pin deliberately.",
      );
    }
    return dir;
  }
  const dir = join(root, ".registry", pin.ref);
  if (existsSync(join(dir, ".git"))) {
    try {
      if (git(dir, "rev-parse", "HEAD") === pin.ref) return dir;
    } catch {
      // fall through and re-fetch
    }
    rmSync(dir, { recursive: true, force: true });
  }
  mkdirSync(dir, { recursive: true });
  git(dir, "init", "-q");
  git(dir, "remote", "add", "origin", pin.repository);
  // GIT_LFS_SKIP_SMUDGE: nothing this reads is in LFS, and CI runners may lack it.
  execFileSync("git", ["fetch", "-q", "--depth", "1", "origin", pin.ref], {
    cwd: dir,
    stdio: "inherit",
    env: { ...process.env, GIT_LFS_SKIP_SMUDGE: "1" },
  });
  execFileSync("git", ["checkout", "-q", "FETCH_HEAD"], {
    cwd: dir,
    stdio: "inherit",
    env: { ...process.env, GIT_LFS_SKIP_SMUDGE: "1" },
  });
  const head = git(dir, "rev-parse", "HEAD");
  if (head !== pin.ref) throw new Error(`fetched ${head}, expected ${pin.ref}`);
  return dir;
}

const registryDir = checkout();
console.error(
  `build-data: mzizi-registry @ ${pin.ref.slice(0, 12)} (${registryDir})`,
);

const outfile = join(root, ".registry", `extract-${pin.ref.slice(0, 12)}.mjs`);
await build({
  entryPoints: [join(root, "scripts/extract.ts")],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  outfile,
  logLevel: "warning",
  plugins: [
    {
      name: "registry-resolve",
      setup(b) {
        b.onResolve({ filter: /^@supabase\/supabase-js$/ }, () => ({
          path: join(root, "scripts/supabase-stub.mjs"),
        }));
        b.onResolve({ filter: /^@\// }, (args) =>
          b.resolve("./" + args.path.slice(2), {
            resolveDir: registryDir,
            kind: args.kind,
          }),
        );
      },
    },
  ],
});

const raw = execFileSync(process.execPath, [outfile], {
  maxBuffer: 256 * 1024 * 1024,
  stdio: ["ignore", "pipe", "inherit"],
  // Unset, so any registry code that checks for Supabase sees "not configured".
  env: { PATH: process.env.PATH },
});
const data = JSON.parse(raw.toString());

const outDir = join(root, "src/data");
mkdirSync(outDir, { recursive: true });
const files = {
  "components.json": data.components,
  "sources.json": data.sources,
  "helix.json": { model: data.helix, nodeCounts: data.nodeCounts },
  "changelog.json": {
    entries: data.changelog,
    byVersion: data.changelogByVersion,
  },
  "doctrine.json": data.doctrine,
  "skills.json": data.skills,
  "samples.json": data.samples,
  "brand.json": data.brand,
  "meta.json": {
    repository: pin.repository,
    ref: pin.ref,
    renames: data.renames,
    openapiYaml: data.openapiYaml,
  },
};
// Write only what changed: `wrangler dev` runs this as its custom build and
// watches src/, so rewriting identical files would restart it forever.
for (const [name, value] of Object.entries(files)) {
  const path = join(outDir, name);
  const next = JSON.stringify(value);
  if (!existsSync(path) || readFileSync(path, "utf8") !== next)
    writeFileSync(path, next);
}
console.error(
  `build-data: ${data.components.length} components, ` +
    `${data.helix.nodes.length} nodes / ${data.helix.rungs.length} rungs / ${data.helix.strands.length} strands, ` +
    `${data.changelog.length} changelog entries, ${data.skills.names.length} skills → src/data/`,
);
