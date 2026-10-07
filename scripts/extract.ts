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
 * and `/v1/rs/{name}` (source, file path and the crate that compiles it) for
 * every component. Any disagreement fails the build.
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
import { textOnBaseTier } from "@/scripts/render-globals-css";
import { OPENAPI_YAML } from "@/lib/openapi.generated";
import { COMPONENT_RENAMES } from "@/lib/component-renames";
import { CRATE_GIT, crateFor } from "@/lib/rust-crates";
import { astroDocument } from "@/lib/astro";
import { GET as discoveryHandler } from "./registry-handlers/discovery";
import { GET as searchHandler } from "./registry-handlers/search";
import { GET as docsHandler } from "./registry-handlers/ui-docs";
import { GET as versionsHandler } from "./registry-handlers/ui-versions";
import { GET as aiInstructionHandler } from "./registry-handlers/ai-instruction";
import { GET as rsHandler } from "./registry-handlers/rs";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { search, type SearchableItem } from "../src/search";
import {
  VERSIONS_NOT_SERVED,
  aiInstructionNotFound,
  discoveryDocument,
  docsBody,
  docsNotFound,
  rsBody,
  rsNoCrate,
  rsNoRust,
  rsNotFound,
  type DocsItem,
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
  components: (DocsItem & RsItem)[],
  componentDocs: Record<string, { docs: unknown; demo: unknown }>,
  aiInstructions: unknown[],
  aiInstructionIndex: Record<string, number>,
  sources: Record<string, { primary: string | null; rs: string | null }>,
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

/**
 * The 21 colour families, each entry with its `-text` pair merged in:
 * `textLight` / `textDark`, the family as text on `--base`
 * (mzizi-registry#316). The values come from the registry's own
 * `textOnBaseTier()` (scripts/render-globals-css.ts), called on all 21
 * families as `renderGlobalsCss()` calls it, so they are the values the
 * registry writes as `--{mineral,heritage,exp}-<name>-text` in
 * mzizi-tokens-globals.css.
 *
 * Fails the build if any family has no text pair, and if any value differs
 * from the one in that stylesheet at the pinned commit (read from the checkout,
 * whose path build-data.mjs passes as argv[3]), or the stylesheet carries a
 * `-text` family this data doesn't.
 */
function withTextOnBase() {
  const sections = [
    { key: "minerals", prefix: "mineral", rows: minerals },
    { key: "heritageColors", prefix: "heritage", rows: heritageColors },
    { key: "experimentalColors", prefix: "exp", rows: experimentalColors },
  ] as const;
  const tier = textOnBaseTier(
    sections.flatMap((s) =>
      s.rows.map((r) => ({
        name: r.name,
        lightHex: r.lightHex,
        darkHex: r.darkHex,
      })),
    ),
  );

  const registryDir = process.argv[3];
  if (!registryDir)
    throw new Error("extract: argv[3] must be the registry checkout");
  const css = readFileSync(
    join(registryDir, "components/registry/n1-tokens/mzizi-tokens-globals.css"),
    "utf8",
  );
  const block = (selector: string) => {
    const at = css.indexOf(`\n${selector} {\n`);
    if (at < 0)
      throw new Error(`mzizi-tokens-globals.css: no \`${selector} {\` block`);
    const body = css.slice(at, css.indexOf("\n}", at));
    return new Map(
      [
        ...body.matchAll(
          /--((?:mineral|heritage|exp)-[a-z]+)-text:\s*(#[0-9a-fA-F]{6});/g,
        ),
      ].map(([, name, hex]) => [name, hex.toUpperCase()]),
    );
  };
  const cssText = {
    light: block(":root"),
    dark: block('[data-theme="dark"]'),
  };

  const problems: string[] = [];
  const served = new Set<string>();
  const out = Object.fromEntries(
    sections.map((s) => [
      s.key,
      s.rows.map((r) => {
        const t = tier.get(r.name);
        const id = `${s.prefix}-${r.name}`;
        served.add(id);
        if (!t?.light.hex || !t?.dark.hex) {
          problems.push(`${id}: textOnBaseTier() gave no text pair`);
          return r;
        }
        for (const mode of ["light", "dark"] as const) {
          const want = cssText[mode].get(id);
          if (want !== t[mode].hex)
            problems.push(
              `${id} ${mode}: textOnBaseTier() ${t[mode].hex}, mzizi-tokens-globals.css --${id}-text ${want ?? "(absent)"}`,
            );
        }
        return { ...r, textLight: t.light.hex, textDark: t.dark.hex };
      }),
    ]),
  );
  for (const mode of ["light", "dark"] as const)
    for (const id of cssText[mode].keys())
      if (!served.has(id))
        problems.push(
          `mzizi-tokens-globals.css (${mode}) has --${id}-text, which no family serves`,
        );
  if (problems.length)
    throw new Error(
      `extract: the -text pair disagrees with the registry:\n  ${problems.join("\n  ")}`,
    );
  return out;
}

async function main() {
  const components = readComponents().map((c) => {
    // `sources`/`sourcePath` are the on-disk index; no route serves them except
    // `sources.rs` (the Rust file path on /v1/rs/{name}), kept below.
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
    };
  });

  const sources: Record<string, { primary: string | null; rs: string | null }> =
    {};
  for (const c of components) {
    sources[c.name] = {
      primary: readComponentSource(c.name),
      rs: readComponentSourceFor(c.name, "rs"),
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
    components as (DocsItem & RsItem)[],
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
      ...withTextOnBase(),
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
