#!/usr/bin/env node
/**
 * Generates src/data/*.json — everything the Worker serves — from
 * mzizi-dev/mzizi-registry's repository files at the ref pinned in
 * scripts/registry-ref.json.
 *
 *   1. Check out the registry at exactly that commit (shallow, cached under
 *      .registry/<sha>). REGISTRY_DIR=/path/to/checkout uses an existing one.
 *   2. Bundle scripts/extract.ts against the checkout with esbuild. `@/` resolves
 *      into the checkout. The registry holds no database (its `lib/db` reads
 *      files only), and @supabase/supabase-js stays replaced by a stub that
 *      throws, so a reader that ever reached for one again fails the build
 *      instead of silently shipping empty data.
 *      `next/server` is replaced by scripts/next-server-stub.mjs (just
 *      `NextResponse.json`), so extract.ts can run the registry's route
 *      handlers and check this Worker's answers against theirs. The registry
 *      removed its Next.js app (mzizi-registry#389), so those handlers are
 *      ported from its last commit with them, 270af9f, into
 *      scripts/registry-handlers/; they still call the pinned checkout's lib/.
 *   3. Run the bundle, which checks this Worker's search and projections
 *      against the registry's route handlers, and split its output (a JSON
 *      file) into one JSON module per concern.
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
        b.onResolve({ filter: /^next\/server$/ }, () => ({
          path: join(root, "scripts/next-server-stub.mjs"),
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

const dataFile = join(
  root,
  ".registry",
  `extract-${pin.ref.slice(0, 12)}.json`,
);
execFileSync(process.execPath, [outfile, dataFile], {
  // The extractor's stdout is the registry handlers' log lines: onto stderr.
  stdio: ["ignore", 2, "inherit"],
  // Unset, so any registry code that checks for Supabase sees "not configured".
  env: { PATH: process.env.PATH },
});
const data = JSON.parse(readFileSync(dataFile, "utf8"));

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
  "component-docs.json": data.componentDocs,
  "ai-instruction-index.json": data.aiInstructionIndex,
  "skills.json": data.skills,
  "samples.json": data.samples,
  "brand.json": data.brand,
  "meta.json": {
    repository: pin.repository,
    ref: pin.ref,
    renames: data.renames,
    crateGit: data.crateGit,
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
    `${data.changelog.length} changelog entries, ${data.skills.names.length} skills, ` +
    `${Object.keys(data.componentDocs).length} docs rows, ` +
    `${Object.keys(data.aiInstructionIndex).length} AI instruction keys, ` +
    `search checked on ${data.searchProbes} probes, ` +
    `${data.handlerChecks} answers checked against the registry's handlers → src/data/`,
);
