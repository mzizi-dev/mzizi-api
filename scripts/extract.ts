/**
 * Runs INSIDE the registry checkout's module graph (bundled by build-data.mjs,
 * with `@/` aliased to the checkout) and prints the data every /v1 route needs
 * as one JSON document on stdout.
 *
 * Everything here calls mzizi-registry's own readers — `lib/registry`,
 * `lib/doctrine`, `lib/db`'s file-backed functions, the generated changelog,
 * skills, tokens, samples and OpenAPI modules — so the shapes are the ones the
 * Next.js handlers serve, not a reimplementation of them. The route-level
 * projection (which fields each endpoint emits) lives in src/routes/.
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
      aiInstructions: await getAllAiInstructions(),
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
  };
  process.stdout.write(JSON.stringify(out));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
