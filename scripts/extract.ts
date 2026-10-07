/**
 * Runs INSIDE the registry checkout's module graph (bundled by build-data.mjs,
 * with `@/` aliased to the checkout) and writes the data every /v1 route needs
 * as one JSON document to the file named by argv[2]. Not stdout: the handlers
 * below log through the registry's logger, which writes to the console.
 *
 * Everything here calls mzizi-registry's own readers — `lib/registry`,
 * `lib/doctrine`, `lib/db` (file-only since the registry's Supabase removal),
 * the generated changelog, skills, tokens, samples and OpenAPI modules — so the
 * shapes are the ones the Next.js handlers serve, not a reimplementation of
 * them. The route-level projection (which fields each endpoint emits) lives in
 * src/routes/.
 *
 * The routes that project or compute rather than pass a reader's value
 * through — `/v1/search` (src/search.ts), the discovery document, component
 * docs, single AI instruction sets and the versions 503 (src/projections.ts) —
 * are checked here against mzizi-registry's route handlers, run in this
 * process with `next/server` stubbed (scripts/next-server-stub.mjs). The
 * registry no longer ships them (mzizi-registry#389 removed its Next.js app),
 * so they are ported from 270af9f, its last commit with them, into
 * scripts/registry-handlers/, and still call the pinned registry's own lib/
 * readers. Nothing here imports the registry's deleted `app/` tree. The
 * checks cover search on about 1,300 queries (status, body and the
 * `Deprecation` header), docs for every component, every AI instruction key,
 * `/v1/rs/{name}` (source, file path and the crate that compiles it) and
 * `/v1/py/{name}` (source, file path, the PyPI package and module) for every
 * component. Any disagreement fails the build.
 */
import { readComponents, readNodeCounts } from "@/lib/registry";
import {
  readComponentSource,
  readComponentSourceFor,
} from "@/lib/registry-source";
import {
  getHelixModel,
  getChangelogEntries,
  getChangelogByVersion,
  getArchitecturePrinciples,
  getFrameworkDecision,
  getLocalDataLayer,
  getCloudLayer,
  getDataOwnership,
  getPipeline,
  getSovereignty,
  getRemovedTechnologies,
  getUbuntuPillars,
  getUbuntuPrinciples,
  getAllAiInstructions,
  getAiInstruction,
  getAiInstructionByTarget,
  getComponentWithDocs,
} from "@/lib/db";
import {
  listSkills,
  getSkill,
  listSkillNames,
  skillsVersion,
} from "@/lib/skills";
import { sampleData } from "@/lib/samples/data";
import {
  minerals,
  heritageColors,
  experimentalColors,
} from "@/lib/tokens/palette.generated";
import {
  backgroundColors,
  brandMeta,
  ecosystem,
  mineralApiHex,
  semanticColors,
  spacing,
  typography,
} from "@/lib/tokens/brand.source";
import { OPENAPI_YAML } from "@/lib/openapi.generated";
import { COMPONENT_RENAMES } from "@/lib/component-renames";
import { CRATE_GIT, crateFor } from "@/lib/rust-crates";
import { pythonPackageFor } from "@/lib/python-packages";
import { astroDocument } from "@/lib/astro";
import { GET as discoveryHandler } from "./registry-handlers/discovery";
import { GET as searchHandler } from "./registry-handlers/search";
import { GET as docsHandler } from "./registry-handlers/ui-docs";
import { GET as versionsHandler } from "./registry-handlers/ui-versions";
import { GET as aiInstructionHandler } from "./registry-handlers/ai-instruction";
import { GET as rsHandler } from "./registry-handlers/rs";
import { GET as pyHandler } from "./registry-handlers/py";
import { writeFileSync } from "node:fs";
import { search, type SearchableItem } from "../src/search";
import {
  VERSIONS_NOT_SERVED,
  aiInstructionNotFound,
  discoveryDocument,
  docsBody,
  docsNotFound,
  pyBody,
  pyNoPython,
  pyNotFound,
  rsBody,
  rsNoCrate,
  rsNoRust,
  rsNotFound,
  type DocsItem,
  type PyItem,
  type RsItem,
} from "../src/projections";

const ORIGIN = "https://api.mzizi.dev";

/** A handler's answer, reduced to what a check compares. */
async function answer(res: Response, headers: string[] = []) {
  return JSON.stringify({
    status: res.status,
    body: await res.json(),
    headers: Object.fromEntries(headers.map((h) => [h, res.headers.get(h)])),
  });
}

function agree(route: string, want: string, got: string) {
  if (want !== got) {
    throw new Error(
      `extract: the gateway disagrees with the registry handler for ${route}\n` +
        `  registry: ${want.slice(0, 400)}\n  gateway:  ${got.slice(0, 400)}`,
    );
  }
}

/** Next's dynamic-segment context, as the App Router passes it. */
const segment = (name: string) => ({ params: Promise.resolve({ name }) });

/**
 * Fails the build if src/search.ts and the registry's search handler ever
 * disagree: status, body, and the `Deprecation` header `?layer=` adds.
 */
async function checkSearch(items: SearchableItem[]): Promise<number> {
  const words = new Set<string>(["", "   ", "button", "BUTTON", " card "]);
  for (const c of items) {
    words.add(c.name);
    words.add(c.name.slice(0, 3));
    const first = String(c.description ?? "").split(/\s+/)[0];
    if (first) words.add(first);
  }
  const nodes = new Set<string>([
    "",
    " ",
    "0",
    "02",
    " 2 ",
    "999",
    "abc",
    "-1",
  ]);
  for (const c of items) nodes.add(String(c.node));
  const categories = new Set<string>(["", " ", "forms", "nope"]);
  for (const c of items)
    for (const cat of c.categories ?? []) categories.add(cat);

  const probes: URLSearchParams[] = [new URLSearchParams()];
  for (const q of words) probes.push(new URLSearchParams({ q }));
  for (const node of nodes) {
    probes.push(new URLSearchParams({ node }));
    probes.push(new URLSearchParams({ layer: node }));
    probes.push(new URLSearchParams({ q: "button", node }));
    probes.push(new URLSearchParams({ q: "button", layer: node }));
    probes.push(new URLSearchParams({ node, layer: "3" }));
    probes.push(new URLSearchParams({ layer: node, node: "" }));
  }
  for (const category of categories) {
    probes.push(new URLSearchParams({ category }));
    probes.push(new URLSearchParams({ q: "card", category }));
    probes.push(new URLSearchParams({ node: "2", category }));
    probes.push(new URLSearchParams({ layer: "2", category }));
  }

  for (const params of probes) {
    const want = await answer(
      await searchHandler(new Request(`${ORIGIN}/api/v1/search?${params}`)),
      ["deprecation"],
    );
    const got = search(items, params);
    agree(
      `/v1/search?${params}`,
      want,
      JSON.stringify({
        status: got.status,
        body: got.body,
        headers: { deprecation: got.headers.Deprecation ?? null },
      }),
    );
  }
  return probes.length;
}

/**
 * Fails the build if src/projections.ts and the registry's discovery, docs,
 * versions and AI-instruction handlers ever disagree.
 */
async function checkHandlers(
  components: (DocsItem & RsItem & PyItem)[],
  componentDocs: Record<string, { docs: unknown; demo: unknown }>,
  aiInstructions: unknown[],
  aiInstructionIndex: Record<string, number>,
  sources: Record<
    string,
    { primary: string | null; rs: string | null; py: string | null }
  >,
): Promise<number> {
  let checks = 0;
  const check = (
    route: string,
    want: string,
    status: number,
    body: unknown,
  ) => {
    agree(route, want, JSON.stringify({ status, body, headers: {} }));
    checks++;
  };

  check(
    "/v1",
    await answer(await discoveryHandler()),
    200,
    discoveryDocument(components.length),
  );

  const req = (path: string) => new Request(`${ORIGIN}/api/v1${path}`);
  for (const c of components) {
    const path = `/ui/${c.name}/docs`;
    check(
      path,
      await answer(await docsHandler(req(path), segment(c.name))),
      200,
      docsBody(c, componentDocs[c.name]),
    );
  }
  // Unknown names only. A renamed `nyuchi-*` name never reaches this route on
  // either side: next.config.mjs and src/redirects.ts 308 it first.
  for (const name of ["does-not-exist", "Button"]) {
    if (components.some((c) => c.name === name)) continue;
    const path = `/ui/${name}/docs`;
    check(
      path,
      await answer(await docsHandler(req(path), segment(name))),
      404,
      docsNotFound(name),
    );
  }

  const path = "/ui/button/versions";
  check(
    path,
    await answer(await versionsHandler(req(path), segment("button"))),
    503,
    VERSIONS_NOT_SERVED,
  );

  // /v1/rs/{name}: every component (200 with its crate, or the no-Rust 404),
  // plus an unknown name. The 200 carries the whole `.rs` file.
  for (const c of components) {
    const path = `/rs/${c.name}`;
    const rs = sources[c.name]?.rs ?? null;
    const crate = c.rsCrate ?? null;
    const [status, body] =
      rs === null
        ? [404, rsNoRust(c.name)]
        : crate === null
          ? [500, rsNoCrate(c.name)]
          : [200, rsBody(c, c.name, rs, crate, CRATE_GIT)];
    check(
      path,
      await answer(await rsHandler(req(path), segment(c.name))),
      status,
      body,
    );
  }
  for (const name of ["does-not-exist", "Button"]) {
    if (components.some((c) => c.name === name)) continue;
    const path = `/rs/${name}`;
    check(
      path,
      await answer(await rsHandler(req(path), segment(name))),
      404,
      rsNotFound(name),
    );
  }

  // /v1/py/{name} (mzizi-registry#472): every component (200 with its
  // package, or the no-Python 404), plus an unknown name.
  for (const c of components) {
    const path = `/py/${c.name}`;
    const py = sources[c.name]?.py ?? null;
    check(
      path,
      await answer(await pyHandler(req(path), segment(c.name))),
      py === null ? 404 : 200,
      py === null ? pyNoPython(c.name) : pyBody(c, c.name, py),
    );
  }
  for (const name of ["does-not-exist", "Button"]) {
    if (components.some((c) => c.name === name)) continue;
    const path = `/py/${name}`;
    check(
      path,
      await answer(await pyHandler(req(path), segment(name))),
      404,
      pyNotFound(name),
    );
  }

  for (const key of [...Object.keys(aiInstructionIndex), "nope", "claude"]) {
    const path = `/ai/instructions/${key}`;
    const at = aiInstructionIndex[key];
    check(
      path,
      await answer(await aiInstructionHandler(req(path), segment(key))),
      at === undefined ? 404 : 200,
      at === undefined ? aiInstructionNotFound(key) : aiInstructions[at],
    );
  }
  return checks;
}

async function main() {
  const components = readComponents().map((c) => {
    // `sources`/`sourcePath` are the on-disk index; no route serves them except
    // `sources.rs` (the Rust file path on /v1/rs/{name}) and `sources.py` (the
    // Python file path on /v1/py/{name}), kept below.
    const {
      sources,
      sourcePath: _sourcePath,
      ...item
    } = c as typeof c & {
      sources?: Record<string, string>;
      sourcePath?: string;
    };
    return {
      ...item,
      ...(sources?.rs
        ? { rsPath: sources.rs, rsCrate: crateFor(sources.rs) }
        : {}),
      ...(sources?.py
        ? { pyPath: sources.py, pyPackage: pythonPackageFor(sources.py) }
        : {}),
    };
  });

  const sources: Record<
    string,
    { primary: string | null; rs: string | null; py: string | null }
  > = {};
  for (const c of components) {
    sources[c.name] = {
      primary: readComponentSource(c.name),
      rs: readComponentSourceFor(c.name, "rs"),
      py: readComponentSourceFor(c.name, "py"),
    };
  }

  // /v1/astro/{name} (mzizi-registry#397): the Astro implementation document for
  // every name that has one (a `.astro`, or a framework-free `.ts` it imports),
  // built by the registry's own reader, lib/astro.ts. It throws on a broken flat
  // import, which fails this build rather than shipping an uninstallable closure.
  const astro: Record<string, unknown> = {};
  for (const c of components) {
    const doc = astroDocument(c.name);
    if (doc) astro[c.name] = doc;
  }

  const changelog = await getChangelogEntries();
  const changelogByVersion: Record<string, unknown[]> = {};
  for (const v of new Set(changelog.map((e) => e.version))) {
    changelogByVersion[v] = await getChangelogByVersion(v);
  }

  // /v1/ui/{name}/docs: the docs row and demo flag `getComponentWithDocs` builds
  // from each item's `meta` block. The rest of that route's payload (name,
  // description, node, owner, collection) is the component itself, already in
  // components.json, so only these two are stored.
  const componentDocs: Record<string, { docs: unknown; demo: unknown }> = {};
  for (const c of components) {
    const withDocs = await getComponentWithDocs(c.name);
    if (!withDocs) throw new Error(`extract: no docs row for "${c.name}"`);
    componentDocs[c.name] = {
      docs: withDocs.docs ?? null,
      demo: withDocs.demo ?? null,
    };
  }

  // /v1/ai/instructions/{name}: by name, then by target — the handler's
  // `getAiInstruction(name) ?? getAiInstructionByTarget(name)`. Only a name or a
  // target can match, so every key that resolves is one of those; each maps to
  // its row's index in doctrine.aiInstructions.
  const aiInstructions = await getAllAiInstructions();
  const aiInstructionIndex: Record<string, number> = {};
  const aiKeys = new Set(
    aiInstructions.flatMap((i) => [i.name, i.target]).filter(Boolean),
  );
  for (const key of aiKeys) {
    const row =
      (await getAiInstruction(key)) ?? (await getAiInstructionByTarget(key));
    if (!row) continue;
    const at = aiInstructions.findIndex(
      (i) => JSON.stringify(i) === JSON.stringify(row),
    );
    if (at < 0) throw new Error(`extract: AI instruction "${key}" not listed`);
    aiInstructionIndex[key] = at;
  }

  const searchProbes = await checkSearch(components as SearchableItem[]);
  const handlerChecks = await checkHandlers(
    components as (DocsItem & RsItem & PyItem)[],
    componentDocs,
    aiInstructions,
    aiInstructionIndex,
    sources,
  );

  const skillNames = listSkillNames();
  const skills: Record<string, unknown> = {};
  for (const n of skillNames) skills[n] = getSkill(n);

  const out = {
    components,
    sources,
    astro,
    nodeCounts: readNodeCounts(),
    helix: await getHelixModel(),
    changelog,
    changelogByVersion,
    doctrine: {
      principles: await getArchitecturePrinciples(),
      framework: await getFrameworkDecision(),
      dataLayer: await getLocalDataLayer(),
      cloudLayer: await getCloudLayer(),
      dataOwnership: await getDataOwnership(),
      pipeline: await getPipeline(),
      sovereignty: await getSovereignty(),
      removed: await getRemovedTechnologies(),
      ubuntuPillars: await getUbuntuPillars(),
      ubuntuPrinciples: await getUbuntuPrinciples(),
      aiInstructions,
    },
    skills: {
      list: listSkills(),
      byName: skills,
      names: skillNames,
      version: skillsVersion(),
    },
    samples: sampleData,
    brand: {
      minerals,
      heritageColors,
      experimentalColors,
      backgroundColors,
      brandMeta,
      ecosystem,
      mineralApiHex,
      semanticColors,
      spacing,
      typography,
    },
    openapiYaml: OPENAPI_YAML,
    renames: COMPONENT_RENAMES,
    crateGit: CRATE_GIT,
    componentDocs,
    aiInstructionIndex,
    searchProbes,
    handlerChecks,
  };
  writeFileSync(process.argv[2], JSON.stringify(out));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
