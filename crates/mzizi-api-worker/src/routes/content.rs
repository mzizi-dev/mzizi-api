//! Discovery, health, brand, changelog, skills, samples, AI instructions and
//! the retired /v1/docs routes. Ported from src/routes/content.ts.

use indexmap::IndexMap;
use mzizi_api_types::{
    AiInstructionSummary, AiInstructionsIndex, BrandBody, ChangelogBody, ChangelogVersionBody,
    ChangelogVersionMeta, EcosystemBrand, ErrorBody, ExperimentalColor, Font, Gone, HealthBody,
    HealthCheck, HealthChecks, HeritageColor, InvalidParameter, Mineral, MongoLocation, SampleSet,
    SampleType, SamplesIndex, SkillBody, SkillNotFound, SkillsBody, SkillsMeta, SpacingStep,
    ThemedColor, TotalMeta, TypeScaleStep, Typography, UnknownSampleType, VersionMeta,
};
use serde_json::Value;

use super::architecture::pick;
use crate::app::Ctx;
use crate::http::{CACHE_5M, CACHE_10M, CORS, CORS_CACHE, GONE_HEADERS, Reply, json};
use crate::{data, js, projections};

pub fn discovery(_: &Ctx) -> Reply {
    json(
        &projections::discovery_document(data::components().len()),
        200,
        CORS_CACHE,
    )
}

pub fn health(c: &Ctx) -> Reply {
    let body = HealthBody {
        status: "healthy".into(),
        timestamp: c.clock.now_iso.clone(),
        checks: HealthChecks {
            api: HealthCheck {
                status: "pass".into(),
                latency_ms: 0,
            },
        },
        version: "unknown".into(),
    };
    json(
        &body,
        200,
        &[
            ("Cache-Control", "no-cache, no-store"),
            ("Access-Control-Allow-Origin", "*"),
        ],
    )
}

/// `brand[key]` as an array of rows (`[]` when absent).
fn brand_rows(key: &str) -> &'static [Value] {
    data::brand()
        .get(key)
        .and_then(Value::as_array)
        .map_or(&[], Vec::as_slice)
}

/// `value ?? fallback`.
fn or(v: Option<Value>, fallback: Value) -> Value {
    match v {
        None | Some(Value::Null) => fallback,
        Some(v) => v,
    }
}

/// `String(v).replace(prefix, "")`: the first occurrence only.
fn strip_first(v: Option<&Value>, pattern: &str) -> String {
    js::to_js_string(v).replacen(pattern, "", 1)
}

pub fn brand(_: &Ctx) -> Reply {
    let brand = data::brand();
    let meta = brand.get("brandMeta").cloned().unwrap_or(Value::Null);
    let api_hex = brand.get("mineralApiHex");
    let typography = brand_rows("typography");
    let entry_type =
        |t: &Value, kind: &str| t.get("entryType").and_then(Value::as_str) == Some(kind);

    let mut fonts = IndexMap::new();
    for f in typography.iter().filter(|t| entry_type(t, "font")) {
        fonts.insert(
            strip_first(f.get("name"), "font-"),
            Font {
                family: or(pick(f, "family"), Value::String(String::new())),
                usage: pick(f, "usage"),
                reason: or(pick(f, "reason"), Value::String(String::new())),
            },
        );
    }

    let body = BrandBody {
        schema: "https://mzizi.dev/schema/brand.json".into(),
        context: "https://schema.org".into(),
        kind: "Brand".into(),
        version: pick(&meta, "version"),
        name: pick(&meta, "name"),
        last_updated: pick(&meta, "lastUpdated"),
        homepage: pick(&meta, "homepage"),
        minerals: brand_rows("minerals")
            .iter()
            .map(|m| {
                let api = api_hex
                    .and_then(|h| h.get(js::to_js_string(m.get("name"))))
                    .filter(|v| !v.is_null())
                    .cloned();
                Mineral {
                    name: pick(m, "name"),
                    role: pick(m, "role"),
                    family: pick(m, "family"),
                    hex: api.or_else(|| pick(m, "darkHex")),
                    light_hex: pick(m, "lightHex"),
                    dark_hex: pick(m, "darkHex"),
                    container_light: pick(m, "containerLight"),
                    container_dark: pick(m, "containerDark"),
                    on_container_light: pick(m, "onContainerLight"),
                    on_container_dark: pick(m, "onContainerDark"),
                    text_light: pick(m, "textLight"),
                    text_dark: pick(m, "textDark"),
                    css_var: pick(m, "cssVar"),
                    sort_order: pick(m, "sortOrder"),
                    origin: pick(m, "origin"),
                    symbolism: pick(m, "symbolism"),
                    usage: pick(m, "usage"),
                }
            })
            .collect(),
        ecosystem: brand_rows("ecosystem")
            .iter()
            .map(|b| {
                let truthy = |k: &str| pick(b, k).filter(|v| js::truthy(Some(v)));
                EcosystemBrand {
                    name: pick(b, "name"),
                    meaning: pick(b, "meaning"),
                    language: pick(b, "language"),
                    role: pick(b, "role"),
                    description: pick(b, "description"),
                    voice: pick(b, "voice"),
                    mineral: pick(b, "mineral"),
                    url: pick(b, "url"),
                    display_name: truthy("displayName"),
                    accent: truthy("accent"),
                    aliases: pick(b, "aliases")
                        .filter(|v| v.as_array().is_some_and(|a| !a.is_empty())),
                }
            })
            .collect(),
        typography: Typography {
            fonts,
            scale: typography
                .iter()
                .filter(|t| entry_type(t, "scale"))
                .map(|t| TypeScaleStep {
                    name: pick(t, "name"),
                    size_px: or(pick(t, "sizePx"), Value::from(0)),
                    size_rem: or(pick(t, "sizeRem"), Value::from("")),
                    line_height: or(pick(t, "lineHeight"), Value::from("")),
                    weight: or(pick(t, "weight"), Value::from(400)),
                    font: or(pick(t, "font"), Value::from("sans")),
                    usage: pick(t, "usage"),
                })
                .collect(),
        },
        spacing: brand_rows("spacing")
            .iter()
            .map(|s| SpacingStep {
                name: pick(s, "name"),
                px: pick(s, "px"),
                rem: pick(s, "rem"),
                usage: pick(s, "usage"),
            })
            .collect(),
        radii: pick(&meta, "radii"),
        semantic_colors: brand_rows("semanticColors")
            .iter()
            .map(|c| ThemedColor {
                name: pick(c, "name"),
                light: pick(c, "lightValue"),
                dark: pick(c, "darkValue"),
                usage: pick(c, "usage"),
            })
            .collect(),
        backgrounds: brand_rows("backgroundColors")
            .iter()
            .map(|c| ThemedColor {
                name: Some(Value::String(strip_first(c.get("name"), "bg-"))),
                light: pick(c, "lightValue"),
                dark: pick(c, "darkValue"),
                usage: pick(c, "usage"),
            })
            .collect(),
        heritage: brand_rows("heritageColors")
            .iter()
            .map(|h| HeritageColor {
                name: pick(h, "name"),
                hex: pick(h, "darkHex"),
                light_hex: pick(h, "lightHex"),
                dark_hex: pick(h, "darkHex"),
                text_light: pick(h, "textLight"),
                text_dark: pick(h, "textDark"),
                css_var: pick(h, "cssVar"),
                origin: pick(h, "origin"),
                symbolism: pick(h, "symbolism"),
                usage: pick(h, "usage"),
            })
            .collect(),
        experimental: brand_rows("experimentalColors")
            .iter()
            .map(|e| ExperimentalColor {
                name: pick(e, "name"),
                hex: pick(e, "darkHex"),
                light_hex: pick(e, "lightHex"),
                dark_hex: pick(e, "darkHex"),
                container_light: pick(e, "containerLight"),
                container_dark: pick(e, "containerDark"),
                on_container_light: pick(e, "onContainerLight"),
                on_container_dark: pick(e, "onContainerDark"),
                text_light: pick(e, "textLight"),
                text_dark: pick(e, "textDark"),
                ui_light: pick(e, "uiLight"),
                ui_dark: pick(e, "uiDark"),
                css_var: Some(Value::String(format!(
                    "--color-{}",
                    js::to_js_string(e.get("name"))
                ))),
                heptagon_index: pick(e, "heptagonIndex"),
            })
            .collect(),
        component_specs: pick(&meta, "componentSpecs"),
        accessibility: pick(&meta, "accessibility"),
        voice_and_tone: pick(&meta, "voiceAndTone"),
        philosophy: pick(&meta, "philosophy"),
    };
    json(&body, 200, CORS_CACHE)
}

pub fn changelog(_: &Ctx) -> Reply {
    let entries = &data::changelog().entries;
    let body = ChangelogBody {
        data: entries.clone(),
        meta: TotalMeta {
            total: entries.len(),
        },
    };
    json(&body, 200, CACHE_10M)
}

pub fn changelog_version(c: &Ctx) -> Reply {
    let version = c.param(0);
    let entries = data::changelog()
        .by_version
        .get(version)
        .filter(|e| !e.is_empty());
    let Some(entries) = entries else {
        return json(
            &ErrorBody {
                error: format!("Version \"{version}\" not found"),
            },
            404,
            CORS,
        );
    };
    // `{ ...entries[0], data, meta }`. A record never carries `data` or
    // `meta`; if one did, the spread's later keys would replace it.
    let mut entry = entries[0].as_object().cloned().unwrap_or_default();
    entry.shift_remove("data");
    entry.shift_remove("meta");
    let body = ChangelogVersionBody {
        entry,
        data: entries.clone(),
        meta: ChangelogVersionMeta {
            version: version.to_owned(),
            entries: entries.len(),
        },
    };
    json(&body, 200, CORS_CACHE)
}

/// `/v1/skills` and `/v1/skills/summary` serve the same document.
pub fn skills(_: &Ctx) -> Reply {
    let skills = data::skills();
    let body = SkillsBody {
        data: skills.list.clone(),
        meta: SkillsMeta {
            count: skills.list.len(),
            version: skills.version.clone(),
        },
    };
    json(&body, 200, CORS_CACHE)
}

/// `/^[a-z][a-z0-9-]*$/`.
fn is_skill_name(name: &str) -> bool {
    let mut chars = name.chars();
    chars.next().is_some_and(|c| c.is_ascii_lowercase())
        && chars.all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
}

pub fn skill(c: &Ctx) -> Reply {
    let name = c.param(0);
    if !is_skill_name(name) {
        return json(
            &InvalidParameter {
                error: "Invalid skill name".into(),
                received: name.to_owned(),
            },
            400,
            CORS,
        );
    }
    let skills = data::skills();
    match skills.by_name.get(name).filter(|s| js::truthy(Some(s))) {
        None => json(
            &SkillNotFound {
                error: "Skill not found".into(),
                received: name.to_owned(),
                available: skills.names.clone(),
            },
            404,
            CORS,
        ),
        Some(skill) => json(
            &SkillBody {
                data: skill.clone(),
                meta: VersionMeta {
                    version: skills.version.clone(),
                },
            },
            200,
            CORS_CACHE,
        ),
    }
}

fn mongo(collection: &str) -> MongoLocation {
    MongoLocation {
        database: "mzizi_samples".into(),
        collection: collection.into(),
    }
}

pub fn samples(_: &Ctx) -> Reply {
    let body = SamplesIndex {
        context: "https://schema.org".into(),
        kind: "DataCatalog".into(),
        name: "Mzizi sample data".into(),
        description:
            "Curated sample records in the same shapes as the platform's MongoDB collections. \
                      Every component preview on mzizi.dev renders against these."
                .into(),
        sample: true,
        types: data::samples()
            .iter()
            .map(|(kind, records)| SampleType {
                kind: kind.clone(),
                count: records.len(),
                href: format!("https://api.mzizi.dev/v1/samples/{kind}"),
                mongodb: mongo(kind),
            })
            .collect(),
        notes: vec![
            "These are fixtures, not live data. Places are real; businesses and people are not."
                .into(),
            "Shapes mirror the production validators, so a query written here ships unchanged."
                .into(),
            "`pnpm samples:push` loads the identical documents into MongoDB `mzizi_samples`."
                .into(),
        ],
    };
    json(&body, 200, CORS_CACHE)
}

pub fn sample_set(c: &Ctx) -> Reply {
    let kind = c.param(0);
    let samples = data::samples();
    let Some(records) = samples.get(kind).filter(|_| !kind.is_empty()) else {
        return json(
            &UnknownSampleType {
                error: format!("Unknown sample type \"{kind}\""),
                available: samples.keys().cloned().collect(),
            },
            404,
            CORS,
        );
    };
    let body = SampleSet {
        context: "https://schema.org".into(),
        kind: "Dataset".into(),
        name: format!("Mzizi sample {kind}"),
        description: format!(
            "Curated sample {kind} in the same shape as the platform's MongoDB collection. \
             Used by every component preview on mzizi.dev."
        ),
        sample: true,
        sample_type: kind.to_owned(),
        count: records.len(),
        mongodb: mongo(kind),
        records: records.clone(),
    };
    json(&body, 200, CORS_CACHE)
}

pub fn ai_instructions(_: &Ctx) -> Reply {
    let items: Vec<AiInstructionSummary> = super::architecture::rows("aiInstructions")
        .iter()
        .map(|i| AiInstructionSummary {
            name: pick(i, "name"),
            target: pick(i, "target"),
            title: pick(i, "title"),
            description: pick(i, "description"),
            version: pick(i, "version"),
            updated_at: pick(i, "updated_at"),
        })
        .collect();
    let body = AiInstructionsIndex {
        meta: TotalMeta { total: items.len() },
        data: items,
    };
    json(&body, 200, CACHE_5M)
}

pub fn ai_instruction(c: &Ctx) -> Reply {
    let name = c.param(0);
    match data::read_ai_instruction(name).filter(|v| js::truthy(Some(v))) {
        Some(instruction) => json(instruction, 200, CACHE_5M),
        None => json(&projections::ai_instruction_not_found(name), 404, CORS),
    }
}

pub fn docs_gone(_: &Ctx) -> Reply {
    let migrated_to = [
        (
            "3d-architecture",
            "https://docs.mzizi.dev/architecture/overview",
        ),
        ("fundi-guide", "https://docs.mzizi.dev/tooling"),
        (
            "layer-decision-guide",
            "https://docs.mzizi.dev/architecture/nodes",
        ),
        (
            "component-backlinks",
            "https://docs.mzizi.dev/architecture/backlinks",
        ),
        (
            "brand-guidelines",
            "https://docs.mzizi.dev/foundations/overview",
        ),
        (
            "semantic-tokens",
            "https://docs.mzizi.dev/foundations/tokens",
        ),
        ("introduction", "https://docs.mzizi.dev"),
        ("installation", "https://docs.mzizi.dev/registry/consuming"),
        ("api-reference", "https://docs.mzizi.dev/registry/overview"),
        (
            "contributing",
            "https://docs.mzizi.dev/registry/contributing",
        ),
    ]
    .into_iter()
    .map(|(k, v)| (k.to_owned(), Value::String(v.to_owned())))
    .collect();
    let body = Gone {
        error: "Gone".into(),
        message: "Long-form documentation now lives in the Mzizi docs site at https://docs.mzizi.dev (source: mzizi-dev/mzizi-docs). The documentation_pages Supabase table is historical.".into(),
        model: None,
        migrated_to: Some(migrated_to),
        slug: None,
    };
    json(&body, 410, GONE_HEADERS)
}

pub fn doc_gone(c: &Ctx) -> Reply {
    let body = Gone {
        error: "Gone".into(),
        message: "Long-form documentation now lives in the standalone Mzizi docs site. See GET /api/v1/docs for the per-slug → URL migration map, or browse https://docs.mzizi.dev.".into(),
        model: None,
        migrated_to: None,
        slug: Some(c.param(0).to_owned()),
    };
    json(&body, 410, GONE_HEADERS)
}
