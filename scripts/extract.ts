/**
 * Runs INSIDE the registry checkout's module graph (bundled by build-data.mjs,
 * with `@/` aliased to the checkout) and prints the data every /v1 route needs
 * as one JSON document on stdout.
 *
 * Everything here calls mzizi-registry's own readers — `lib/registry`,
 * `lib/doctrine`, `lib/db` (file-only since the registry's Supabase removal),
 * the generated changelog, skills, tokens, samples and OpenAPI modules — so the
 * shapes are the ones the Next.js handlers serve, not a reimplementation of
 * them. The route-level projection (which fields each endpoint emits) lives in
 * src/routes/.
 *
 * The one query-time computation, `/v1/search`, is src/search.ts. It is checked
 * here against the registry's own `searchComponents`, `getComponentsByLayer`
 * and `getComponentsByCategory` on about 1,200 queries, and a disagreement
 * fails the build.
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
  searchComponents,
  getComponentsByLayer,
  getComponentsByCategory,
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
import { search, type SearchableItem } from "../src/search";

/**
 * app/api/v1/search/route.ts with data present (mzizi-registry 0b1819e), on the
 * registry's own readers: the reference src/search.ts must reproduce.
 */
async function registrySearch(params: URLSearchParams) {
  const q = (params.get("q") ?? "").trim();
  const layer = params.get("layer");
  const category = params.get("category");
  // Typed loosely, as the handler's `ComponentRow` cast was.
  let results: Array<Record<string, unknown>>;
  if (q) results = (await searchComponents(q)) as never;
  else if (layer) results = (await getComponentsByLayer(layer)) as never;
  else if (category)
    results = (await getComponentsByCategory(category)) as never;
  else
    return {
      status: 400,
      body: { error: "At least one of q, layer, or category is required" },
    };
  if (layer) results = results.filter((c) => c.layer === layer);
  if (category) results = results.filter((c) => c.category === category);
  const data = results.map((c) => ({
    name: c.name,
    type: c.registry_type,
    description: c.description,
    category: c.category,
    layer: c.layer,
  }));
  return {
    status: 200,
    body: {
      data,
      meta: { total: data.length, query: q || null, layer, category },
    },
  };
}

/** Fails the build if src/search.ts and the registry's readers ever disagree. */
async function checkSearch(items: SearchableItem[]): Promise<number> {
  const words = new Set<string>(["", "   ", "button", "BUTTON", " card "]);
  for (const c of items) {
    words.add(c.name);
    words.add(c.name.slice(0, 3));
    const first = String(c.description ?? "").split(/\s+/)[0];
    if (first) words.add(first);
  }
  const layers = new Set<string>(["", "0", "999", "abc", "-1"]);
  for (const c of items) layers.add(String(c.node));
  const categories = new Set<string>(["", "forms", "nope"]);
  for (const c of items)
    for (const cat of (c as { categories?: string[] }).categories ?? [])
      categories.add(cat);

  const probes: URLSearchParams[] = [new URLSearchParams()];
  for (const q of words) probes.push(new URLSearchParams({ q }));
  for (const layer of layers) {
    probes.push(new URLSearchParams({ layer }));
    probes.push(new URLSearchParams({ q: "button", layer }));
  }
  for (const category of categories) {
    probes.push(new URLSearchParams({ category }));
    probes.push(new URLSearchParams({ q: "card", category }));
    probes.push(new URLSearchParams({ layer: "2", category }));
  }

  for (const params of probes) {
    const want = JSON.stringify(await registrySearch(params));
    const got = JSON.stringify(search(items, params));
    if (want !== got) {
      throw new Error(
        `extract: src/search.ts disagrees with the registry's search for ?${params}\n` +
          `  registry: ${want.slice(0, 300)}\n  gateway:  ${got.slice(0, 300)}`,
      );
    }
  }
  return probes.length;
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
    return { ...item, ...(sources?.rs ? { rsPath: sources.rs } : {}) };
  });

  const sources: Record<string, { primary: string | null; rs: string | null }> =
    {};
  for (const c of components) {
    sources[c.name] = {
      primary: readComponentSource(c.name),
      rs: readComponentSourceFor(c.name, "rs"),
    };
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

  const skillNames = listSkillNames();
  const skills: Record<string, unknown> = {};
  for (const n of skillNames) skills[n] = getSkill(n);

  const out = {
    components,
    sources,
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
    componentDocs,
    aiInstructionIndex,
    searchProbes,
  };
  process.stdout.write(JSON.stringify(out));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
