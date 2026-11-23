//! Offline checks of the Rust Worker against its bundled data: the port of
//! test/api.test.ts. The live contract is held by `npm run parity`; these catch
//! a broken build or a routing regression without the network. Requires
//! `npm run build:data` first.

use mzizi_api_worker::{Clock, Reply, data, handle};
use serde_json::{Value, json};

fn clock() -> Clock {
    Clock {
        now_iso: "2026-11-17T00:00:00.000Z".into(),
        expires_iso: "2027-11-17T00:00:00.000Z".into(),
    }
}

fn request(method: &str, path: &str) -> Reply {
    let url = if path.starts_with("http") {
        path.to_owned()
    } else {
        format!("http://localhost{path}")
    };
    handle(method, &url, &clock())
}

fn get(path: &str) -> Reply {
    request("GET", path)
}

fn body(reply: &Reply) -> Value {
    serde_json::from_str(reply.body_text()).expect("a JSON body")
}

fn keys(v: &Value) -> Vec<&str> {
    v.as_object()
        .expect("an object")
        .keys()
        .map(String::as_str)
        .collect()
}

fn header<'a>(reply: &'a Reply, name: &str) -> Option<&'a str> {
    reply.headers.get(name)
}

const NO_STORE: &str = "private, no-cache, no-store, max-age=0, must-revalidate";
const CACHE_1H: &str = "public, max-age=3600, s-maxage=86400";

// ── discovery and health ───────────────────────────────────────────────────

#[test]
fn serves_the_discovery_document_at_v1_and_api_v1() {
    for path in ["/v1", "/api/v1"] {
        let res = get(path);
        assert_eq!(res.status, 200);
        let b = body(&res);
        assert_eq!(b["name"], "Mzizi API");
        assert!(b["resources"].get("architecture").is_some());
        assert!(b.get("database").is_none());
        assert_eq!(
            b["data"],
            json!({
                "source": "files",
                "repository": "https://github.com/mzizi-dev/mzizi-registry",
                "components": data::components().len(),
            })
        );
        let text = res.body_text().to_lowercase();
        assert!(!text.contains("operated and developed by nyuchi"));
        assert!(!text.contains("served from database"));
    }
}

#[test]
fn health_is_200_and_uncached() {
    let res = get("/v1/health");
    assert_eq!(res.status, 200);
    assert_eq!(header(&res, "cache-control"), Some("no-cache, no-store"));
    let source = header(&res, "x-mzizi-source").unwrap();
    let hash = source.strip_prefix("mzizi-api-gateway; registry=").unwrap();
    assert_eq!(hash.len(), 12);
    assert!(
        hash.chars()
            .all(|c| c.is_ascii_hexdigit() && !c.is_ascii_uppercase())
    );
    assert_eq!(body(&res)["timestamp"], "2026-11-17T00:00:00.000Z");
}

// ── registry ───────────────────────────────────────────────────────────────

#[test]
fn indexes_every_bundled_component_with_shadcn_keys_first() {
    let res = get("/v1/ui");
    let b = body(&res);
    assert_eq!(keys(&b)[..4], ["$schema", "name", "homepage", "items"]);
    assert_eq!(
        b["items"].as_array().unwrap().len(),
        data::components().len()
    );
    assert_eq!(b["meta"]["registryTotal"], data::components().len());
    assert_eq!(header(&res, "cache-control"), Some(CACHE_1H));
}

#[test]
fn filters_and_pages_without_a_400_on_bad_input() {
    let b = body(&get("/v1/ui?node=2&limit=3&offset=1"));
    let items = b["items"].as_array().unwrap();
    assert!(items.len() <= 3);
    assert!(items.iter().all(|i| i["node"] == 2));
    assert_eq!(b["meta"]["limit"], 3);
    assert_eq!(b["meta"]["offset"], 1);
    assert_eq!(get("/v1/ui?limit=abc").status, 200);
    assert_eq!(body(&get("/v1/ui?limit=abc"))["meta"]["limit"], Value::Null);
}

#[test]
fn serves_an_installable_item_with_its_source() {
    let b = body(&get("/v1/ui/button"));
    let files = b["files"].as_array().unwrap();
    assert_eq!(files.len(), 1);
    assert!(files[0]["content"].as_str().unwrap().len() > 100);
}

#[test]
fn not_found_for_an_unknown_component() {
    let res = get("/v1/ui/does-not-exist");
    assert_eq!(res.status, 404);
    assert_eq!(header(&res, "cache-control"), Some(NO_STORE));
}

#[test]
fn redirects_a_renamed_component_keeping_sub_path_and_query() {
    let res = get("/v1/ui/nyuchi-a11y/docs?x=1");
    assert_eq!(res.status, 308);
    assert_eq!(header(&res, "location"), Some("/v1/ui/mzizi-a11y/docs?x=1"));
    let api = get("/api/v1/rs/nyuchi-a11y");
    assert_eq!(header(&api, "location"), Some("/api/v1/rs/mzizi-a11y"));
    // A redirect carries no other header but X-Mzizi-Source.
    assert!(header(&api, "x-frame-options").is_none());
    assert!(header(&api, "x-mzizi-source").is_some());
    assert!(res.body.is_none());
}

#[test]
fn serves_a_roots_brand_components_rust_naming_its_crate() {
    let res = get("/v1/rs/mzizi-meta-tile");
    assert_eq!(res.status, 200);
    let b = body(&res);
    assert!(b.get("target").is_none());
    assert_eq!(
        b["crate"],
        json!({
            "name": "mzizi-brand",
            "registry": "crates.io",
            "git": "https://github.com/mzizi-dev/mzizi-registry",
        })
    );
    assert_eq!(
        b["files"][0]["path"],
        "components/registry/n3-brand/mzizi-meta-tile.rs"
    );
    assert!(!b["files"][0]["content"].as_str().unwrap().is_empty());
}

#[test]
fn names_the_crate_by_node_directory() {
    let mut crates = std::collections::HashMap::new();
    for c in data::components().iter().filter(|c| c.rs_path.is_some()) {
        let res = get(&format!("/v1/rs/{}", c.name));
        assert_eq!(res.status, 200, "{}", c.name);
        let dir = c.rs_path.as_deref().unwrap().rsplit('/').nth(1).unwrap();
        crates.insert(dir.to_owned(), body(&res)["crate"]["name"].clone());
    }
    assert_eq!(crates["n2-primitives"], "mzizi-ui");
    assert_eq!(crates["n3-brand"], "mzizi-brand");
    assert_eq!(crates["n7-shell"], "mzizi-shell");
}

#[test]
fn not_found_on_v1_rs_for_a_component_with_no_rust() {
    let tsx_only = data::components()
        .iter()
        .find(|c| c.rs_path.is_none())
        .unwrap();
    let res = get(&format!("/v1/rs/{}", tsx_only.name));
    assert_eq!(res.status, 404);
    assert_eq!(
        body(&res)["error"],
        format!("\"{}\" has no Rust implementation", tsx_only.name)
    );
}

// ── /v1/astro ──────────────────────────────────────────────────────────────

#[test]
fn serves_a_components_pure_astro() {
    let res = get("/v1/astro/app-data-table");
    assert_eq!(res.status, 200);
    assert_eq!(header(&res, "access-control-allow-origin"), Some("*"));
    let b = body(&res);
    assert_eq!(b["target"], "astro");
    assert_eq!(b["type"], "registry:astro");
    assert_eq!(
        b["files"][0]["path"],
        "components/registry/n6-pages/app-data-table.astro"
    );
    assert_eq!(
        b["files"][0]["target"],
        "src/components/mzizi/app-data-table.astro"
    );
    assert!(
        !b["dependencies"]
            .as_array()
            .unwrap()
            .contains(&json!("react"))
    );
    for url in b["registryDependencies"].as_array().unwrap() {
        let name = url
            .as_str()
            .unwrap()
            .strip_prefix("https://api.mzizi.dev/v1/astro/")
            .unwrap();
        assert!(
            name.chars()
                .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
        );
    }
}

#[test]
fn resolves_every_dependency_of_every_astro_document() {
    let list = body(&get("/v1/astro"));
    let components = list["components"].as_array().unwrap();
    assert!(components.len() > 40);
    let names: std::collections::HashSet<&str> = components
        .iter()
        .map(|c| c["name"].as_str().unwrap())
        .collect();
    for name in &names {
        let b = body(&get(&format!("/v1/astro/{name}")));
        for url in b["registryDependencies"].as_array().unwrap() {
            let dep = url.as_str().unwrap().rsplit('/').next().unwrap();
            assert!(names.contains(dep), "{name} -> {url}");
        }
    }
}

#[test]
fn ships_a_brand_marks_images_beside_it_base64() {
    let b = body(&get("/v1/astro/app-brand-mark"));
    let assets: Vec<&Value> = b["files"]
        .as_array()
        .unwrap()
        .iter()
        .filter(|f| f["type"] == "registry:asset")
        .collect();
    assert_eq!(assets.len(), 6);
    assert!(assets.iter().all(|a| a["encoding"] == "base64"));
}

#[test]
fn not_found_for_no_astro_implementation_and_unknown_name() {
    let res = get("/v1/astro/accordion");
    assert_eq!(res.status, 404);
    assert_eq!(
        body(&res)["error"],
        "\"accordion\" has no Astro implementation"
    );
    assert_eq!(get("/v1/astro/does-not-exist").status, 404);
}

// ── file-backed routes ─────────────────────────────────────────────────────

#[test]
fn serves_component_docs_from_the_registrys_meta_block() {
    let res = get("/v1/ui/button/docs");
    assert_eq!(res.status, 200);
    assert_eq!(header(&res, "cache-control"), Some(CACHE_1H));
    assert_eq!(header(&res, "access-control-allow-origin"), Some("*"));
    let b = body(&res);
    assert_eq!(
        keys(&b),
        [
            "name",
            "description",
            "node",
            "nodeLabel",
            "owner",
            "collection",
            "docs",
            "demo"
        ]
    );
    let button = data::read_component("button").unwrap();
    assert_eq!(b["description"], button.description.as_deref().unwrap());
    assert_eq!(
        b["owner"],
        button.meta.as_ref().unwrap().owner.as_deref().unwrap()
    );
    assert_eq!(b["docs"]["component_name"], "button");
    assert!(!b["docs"]["use_cases"].as_array().unwrap().is_empty());
    assert!(!b["docs"]["a11y"].as_array().unwrap().is_empty());
    assert_eq!(b["demo"]["has_demo"], true);
    assert!(b.get("layer").is_none());
}

#[test]
fn serves_docs_for_every_component_including_data_items() {
    for c in data::components() {
        assert_eq!(
            get(&format!("/v1/ui/{}/docs", c.name)).status,
            200,
            "{}",
            c.name
        );
    }
    let tokens = body(&get("/v1/ui/mzizi-tokens/docs"));
    assert_eq!(tokens["docs"]["component_name"], "mzizi-tokens");
}

#[test]
fn not_found_for_docs_of_an_unknown_component_uncached() {
    let res = get("/v1/ui/does-not-exist/docs");
    assert_eq!(res.status, 404);
    assert_eq!(
        body(&res),
        json!({ "error": "Component \"does-not-exist\" not found" })
    );
    assert_eq!(header(&res, "cache-control"), Some(NO_STORE));
}

#[test]
fn keeps_version_history_at_503() {
    for path in ["/v1/ui/button/versions", "/api/v1/ui/button/versions"] {
        let res = get(path);
        assert_eq!(res.status, 503);
        assert_eq!(header(&res, "access-control-allow-origin"), Some("*"));
        let b = body(&res);
        assert_eq!(b["error"], "Version history is not served by this API");
        let message = b["message"].as_str().unwrap();
        assert!(message.contains("Mzizi console"));
        assert!(!message.contains("Database not configured"));
    }
}

#[test]
fn searches_names_and_descriptions_case_insensitively() {
    let res = get("/v1/search?q=%20BUTTON%20");
    assert_eq!(res.status, 200);
    assert_eq!(
        header(&res, "cache-control"),
        Some("public, max-age=300, s-maxage=3600")
    );
    assert!(header(&res, "deprecation").is_none());
    let b = body(&res);
    let data_len = b["data"].as_array().unwrap().len();
    assert_eq!(
        b["meta"],
        json!({ "total": data_len, "query": "BUTTON", "node": null, "category": null })
    );
    let names: Vec<&str> = b["data"]
        .as_array()
        .unwrap()
        .iter()
        .map(|d| d["name"].as_str().unwrap())
        .collect();
    let expected: Vec<&str> = data::components()
        .iter()
        .filter(|c| {
            c.name.to_lowercase().contains("button")
                || c.description
                    .as_deref()
                    .unwrap_or("")
                    .to_lowercase()
                    .contains("button")
        })
        .map(|c| c.name.as_str())
        .collect();
    assert!(names.contains(&"button"));
    assert_eq!(names, expected);
    let button = b["data"]
        .as_array()
        .unwrap()
        .iter()
        .find(|d| d["name"] == "button")
        .unwrap();
    assert_eq!(
        keys(button),
        [
            "name",
            "type",
            "title",
            "description",
            "categories",
            "node",
            "nodeLabel"
        ]
    );
    assert_eq!(button["type"], "registry:ui");
    assert!(button["node"].is_number());
}

#[test]
fn answers_400_without_a_query() {
    for path in [
        "/v1/search",
        "/v1/search?q=%20%20",
        "/v1/search?node=",
        "/v1/search?layer=",
    ] {
        let res = get(path);
        assert_eq!(res.status, 400, "{path}");
        assert_eq!(
            body(&res),
            json!({ "error": "At least one of q, node, or category is required" })
        );
    }
}

#[test]
fn filters_on_node_and_categories_combined() {
    let on_node_2: Vec<&str> = data::components()
        .iter()
        .filter(|c| c.node.as_ref().and_then(|n| n.as_i64()) == Some(2))
        .map(|c| c.name.as_str())
        .collect();
    assert!(!on_node_2.is_empty());
    let res = get("/v1/search?node=2");
    assert!(header(&res, "deprecation").is_none());
    let b = body(&res);
    let names: Vec<&str> = b["data"]
        .as_array()
        .unwrap()
        .iter()
        .map(|d| d["name"].as_str().unwrap())
        .collect();
    assert_eq!(names, on_node_2);
    assert_eq!(
        b["meta"],
        json!({ "total": on_node_2.len(), "query": null, "node": "2", "category": null })
    );

    let category = data::components()[0].categories.as_ref().unwrap()[0].clone();
    let both = body(&get(&format!(
        "/api/v1/search?q=a&node=2&category={category}"
    )));
    let want: Vec<&str> = data::components()
        .iter()
        .filter(|c| {
            c.node.as_ref().and_then(|n| n.as_i64()) == Some(2)
                && c.categories
                    .as_ref()
                    .is_some_and(|cs| cs.contains(&category))
                && (c.name.contains('a')
                    || c.description
                        .as_deref()
                        .unwrap_or("")
                        .to_lowercase()
                        .contains('a'))
        })
        .map(|c| c.name.as_str())
        .collect();
    let got: Vec<&str> = both["data"]
        .as_array()
        .unwrap()
        .iter()
        .map(|d| d["name"].as_str().unwrap())
        .collect();
    assert_eq!(got, want);
    assert_eq!(both["meta"]["query"], "a");
    assert_eq!(both["meta"]["node"], "2");
    assert_eq!(both["meta"]["category"], category.as_str());
}

#[test]
fn keeps_layer_as_a_deprecated_alias_of_node() {
    let node = body(&get("/v1/search?node=2"));
    let res = get("/v1/search?layer=2");
    assert_eq!(res.status, 200);
    assert_eq!(header(&res, "deprecation"), Some("true"));
    let layer = body(&res);
    assert_eq!(layer["data"], node["data"]);
    assert_eq!(layer["meta"]["node"], "2");
    assert!(
        layer["meta"]["deprecation"]
            .as_str()
            .unwrap()
            .contains("deprecated alias of `node`")
    );
    assert!(layer["meta"].get("layer").is_none());

    let res2 = get("/v1/search?layer=3&node=2");
    assert!(header(&res2, "deprecation").is_none());
    let both = body(&res2);
    assert_eq!(both["data"], node["data"]);
    assert!(both["meta"].get("deprecation").is_none());
}

#[test]
fn serves_an_ai_instruction_set_by_name_and_by_target() {
    let list = body(&get("/v1/ai/instructions"));
    let rows = list["data"].as_array().unwrap();
    assert!(!rows.is_empty());
    for row in rows {
        let (name, target) = (
            row["name"].as_str().unwrap(),
            row["target"].as_str().unwrap(),
        );
        for key in [name, target] {
            let res = get(&format!("/v1/ai/instructions/{key}"));
            assert_eq!(res.status, 200, "{key}");
            assert_eq!(
                header(&res, "cache-control"),
                Some("public, max-age=300, s-maxage=3600")
            );
            let b = body(&res);
            assert_eq!(b["name"], name);
            assert_eq!(b["target"], target);
            assert!(b["instruction_text"].as_str().unwrap().len() > 100);
        }
    }
}

#[test]
fn not_found_for_an_unknown_ai_instruction_set() {
    for key in ["nope", "claude", "__proto__", "constructor"] {
        let res = get(&format!("/v1/ai/instructions/{key}"));
        assert_eq!(res.status, 404, "{key}");
        assert_eq!(
            body(&res),
            json!({ "error": format!("AI instruction \"{key}\" not found") })
        );
    }
}

// ── architecture and content ───────────────────────────────────────────────

#[test]
fn serves_the_helix() {
    let b = body(&get("/v1/architecture"));
    assert_eq!(
        [
            &b["meta"]["node_count"],
            &b["meta"]["rung_count"],
            &b["meta"]["strand_count"]
        ],
        [&json!(8), &json!(4), &json!(6)]
    );
}

#[test]
fn validates_node_numbers() {
    assert_eq!(get("/v1/architecture/nodes/1").status, 200);
    assert_eq!(get("/v1/architecture/nodes/0").status, 400);
    assert_eq!(get("/v1/architecture/nodes/01").status, 400);
    assert_eq!(get("/v1/architecture/nodes/1.5").status, 400);
    assert_eq!(get("/v1/architecture/nodes/abc").status, 400);
    assert_eq!(get("/v1/architecture/nodes/%201").status, 200);
    assert_eq!(get("/v1/architecture/nodes/9999").status, 404);
}

fn brand() -> Value {
    body(&get("/v1/brand"))
}

#[test]
fn serves_21_colour_families_on_v1_brand() {
    let b = brand();
    let len = |k: &str| b[k].as_array().unwrap().len();
    assert_eq!(len("minerals") + len("heritage") + len("experimental"), 21);
}

#[test]
fn serves_the_spacing_floor_on_v1_brand_accessibility() {
    let a = &brand()["accessibility"];
    assert_eq!(a["minInset"], 14);
    assert_eq!(a["minControlGap"], 9);
    assert_eq!(a["minLabelGap"], 7);
    assert_eq!(a["minItemGap"], 7);
    assert_eq!(a["minBodyLeading"], 1.5);
}

#[test]
fn serves_the_spacing_floor_custom_properties_in_mzizi_tokens_globals() {
    let res = get("/v1/ui/mzizi-tokens-globals");
    assert_eq!(res.status, 200);
    let css = body(&res)["files"][0]["content"]
        .as_str()
        .unwrap()
        .to_owned();
    let has = |prop: &str, value: &str| {
        css.split(prop)
            .skip(1)
            .any(|rest| rest.trim_start_matches(':').trim_start().starts_with(value))
    };
    assert!(has("--inset-floor", "0.875rem"));
    assert!(has("--gap-floor", "0.4375rem"));
    assert!(has("--leading-floor", "1.5"));
}

/// A colour family's name and its `textLight` / `textDark`.
type TextPair = (&'static str, &'static str, &'static str);

#[test]
fn serves_a_text_pair_on_every_colour_family() {
    let text: &[(&str, &[TextPair])] = &[
        (
            "minerals",
            &[
                ("cobalt", "#0047AB", "#86DCFF"),
                ("sodalite", "#283593", "#C6CFFF"),
                ("terracotta", "#7B3F23", "#EBCCA3"),
            ],
        ),
        (
            "heritage",
            &[
                ("hematite", "#3E515A", "#C9D2D7"),
                ("savanna", "#614C12", "#EBCF7D"),
                ("kalahari", "#564E3B", "#E8D9B5"),
            ],
        ),
        (
            "experimental",
            &[
                ("storm", "#274AA1", "#C4D1F1"),
                ("ember", "#803B1F", "#EEC9BA"),
                ("protea", "#8F2361", "#F1C4DD"),
            ],
        ),
    ];
    let key_sets: &[(&str, &[&str])] = &[
        (
            "minerals",
            &[
                "name",
                "role",
                "family",
                "hex",
                "lightHex",
                "darkHex",
                "containerLight",
                "containerDark",
                "onContainerLight",
                "onContainerDark",
                "textLight",
                "textDark",
                "cssVar",
                "sortOrder",
                "origin",
                "symbolism",
                "usage",
            ],
        ),
        (
            "heritage",
            &[
                "name",
                "hex",
                "lightHex",
                "darkHex",
                "textLight",
                "textDark",
                "cssVar",
                "origin",
                "symbolism",
                "usage",
            ],
        ),
        (
            "experimental",
            &[
                "name",
                "hex",
                "lightHex",
                "darkHex",
                "containerLight",
                "containerDark",
                "onContainerLight",
                "onContainerDark",
                "textLight",
                "textDark",
                "uiLight",
                "uiDark",
                "cssVar",
                "heptagonIndex",
            ],
        ),
    ];
    let b = brand();
    let is_hex = |v: &Value| {
        v.as_str().is_some_and(|s| {
            s.len() == 7
                && s.starts_with('#')
                && s[1..]
                    .chars()
                    .all(|c| c.is_ascii_digit() || ('A'..='F').contains(&c))
        })
    };
    for ((family, expected), (_, want_keys)) in text.iter().zip(key_sets) {
        let rows = b[*family].as_array().unwrap();
        assert_eq!(rows.len(), 7);
        for row in rows {
            assert_eq!(keys(row), *want_keys, "{family}/{}", row["name"]);
            assert!(is_hex(&row["textLight"]) && is_hex(&row["textDark"]));
        }
        for (name, light, dark) in *expected {
            let row = rows.iter().find(|r| r["name"] == *name).unwrap();
            assert_eq!(row["textLight"], *light, "{family}/{name}");
            assert_eq!(row["textDark"], *dark, "{family}/{name}");
        }
    }
}

#[test]
fn serves_each_minerals_full_palette_record() {
    let b = brand();
    let find = |name: &str| {
        b["minerals"]
            .as_array()
            .unwrap()
            .iter()
            .find(|m| m["name"] == name)
            .unwrap()
            .clone()
    };
    assert_eq!(
        find("sodalite"),
        json!({
            "name": "sodalite",
            "role": "Intelligence",
            "family": "deep-earth",
            "hex": "#283593",
            "lightHex": "#283593",
            "darkHex": "#3D5AFE",
            "containerLight": "#E8EAF6",
            "containerDark": "#0D1442",
            "onContainerLight": "#141A5C",
            "onContainerDark": "#C5CAE9",
            "textLight": "#283593",
            "textDark": "#C6CFFF",
            "cssVar": "--color-sodalite",
            "sortOrder": 5,
            "origin": "Kunene River, Namibia & South Africa",
            "symbolism": "Intelligence, depth, reasoning",
            "usage": "AI/Shamwari surfaces, deep-reasoning states",
        })
    );
    assert_eq!(find("cobalt")["hex"], "#0047AB");
    assert_eq!(find("tanzanite")["hex"], "#B388FF");
}

#[test]
fn serves_the_heritage_and_experimental_text_pairs() {
    let b = brand();
    let find = |family: &str, name: &str| {
        b[family]
            .as_array()
            .unwrap()
            .iter()
            .find(|r| r["name"] == name)
            .unwrap()
            .clone()
    };
    let hematite = find("heritage", "hematite");
    for (k, v) in [
        ("hex", "#90A4AE"),
        ("lightHex", "#546E7A"),
        ("darkHex", "#90A4AE"),
        ("textLight", "#3E515A"),
        ("textDark", "#C9D2D7"),
        ("cssVar", "--color-hematite"),
    ] {
        assert_eq!(hematite[k], v, "hematite.{k}");
    }
    let storm = find("experimental", "storm");
    for (k, v) in [
        ("hex", "#7E9BE0"),
        ("lightHex", "#284CA6"),
        ("darkHex", "#7E9BE0"),
        ("containerLight", "#DBE0EB"),
        ("containerDark", "#212735"),
        ("onContainerLight", "#1A409B"),
        ("onContainerDark", "#99B2EE"),
        ("textLight", "#274AA1"),
        ("textDark", "#C4D1F1"),
        ("uiLight", "#577BD6"),
        ("uiDark", "#426CD1"),
    ] {
        assert_eq!(storm[k], v, "storm.{k}");
    }
    assert_eq!(storm["heptagonIndex"], 4);
}

#[test]
fn projects_a_brands_accent_only_on_rows_that_carry_one() {
    let b = brand();
    let find = |name: &str| {
        b["ecosystem"]
            .as_array()
            .unwrap()
            .iter()
            .find(|r| r["name"] == name)
            .unwrap()
            .clone()
    };
    let circles = find("circles");
    assert_eq!(circles["mineral"], "tanzanite");
    assert_eq!(circles["accent"], "terracotta");
    assert!(find("news").get("accent").is_none());
}

#[test]
fn keeps_retired_routes_at_410() {
    for path in [
        "/v1/architecture/axes",
        "/v1/architecture/frontend/axes",
        "/v1/architecture/frontend/layers",
        "/v1/architecture/layers/3",
        "/v1/docs",
        "/v1/docs/introduction",
    ] {
        assert_eq!(get(path).status, 410, "{path}");
    }
}

// ── HTTP behaviour ─────────────────────────────────────────────────────────

#[test]
fn is_read_only_405_for_writes_204_and_allow_for_options() {
    let post = request("POST", "/v1/ui");
    assert_eq!(post.status, 405);
    assert!(post.body.is_none());
    assert_eq!(request("DELETE", "/v1/ui/button").status, 405);
    let opt = request("OPTIONS", "/v1/ui");
    assert_eq!(opt.status, 204);
    assert_eq!(header(&opt, "allow"), Some("GET, HEAD, OPTIONS"));
    let stats = request("OPTIONS", "/v1/stats");
    assert_eq!(header(&stats, "allow"), Some("GET, OPTIONS"));
}

#[test]
fn head_answers_like_get_without_a_body() {
    let get_reply = get("/v1/ui/button");
    let head = request("HEAD", "/v1/ui/button");
    assert_eq!(head.status, 200);
    assert_eq!(head.headers, get_reply.headers);
    assert!(head.body.is_none());
}

#[test]
fn adds_nexts_api_cors_headers_only_on_the_api_spelling() {
    assert_eq!(
        header(&get("/api/v1/health"), "access-control-allow-methods"),
        Some("GET, POST, DELETE, OPTIONS")
    );
    assert!(header(&get("/v1/health"), "access-control-allow-methods").is_none());
}

#[test]
fn sends_the_security_headers() {
    let res = get("/v1/brand");
    assert_eq!(header(&res, "x-frame-options"), Some("SAMEORIGIN"));
    assert!(
        header(&res, "strict-transport-security")
            .unwrap()
            .contains("max-age=63072000")
    );
}

#[test]
fn strips_a_trailing_slash_with_a_308() {
    let res = get("/v1/ui/");
    assert_eq!(res.status, 308);
    assert_eq!(header(&res, "location"), Some("/v1/ui"));
    assert_eq!(header(&get("//"), "location"), Some("/"));
}

#[test]
fn collapses_repeated_slashes_instead_of_redirecting_off_site() {
    for (path, location) in [
        ("//evil.com/", "/evil.com/"),
        ("/\\evil.com/", "/evil.com/"),
        ("///evil.com/", "/evil.com/"),
        ("//v1/ui", "/v1/ui"),
        ("/v1//ui?x=1", "/v1/ui?x=1"),
    ] {
        let res = get(&format!("https://api.mzizi.dev{path}"));
        assert_eq!(res.status, 308, "{path}");
        assert_eq!(header(&res, "location"), Some(location), "{path}");
    }
}

#[test]
fn publishes_security_txt_with_the_owner_chosen_contact() {
    let text = get("/.well-known/security.txt").body_text().to_owned();
    assert!(text.contains("Contact: mailto:security@nyuchi.com"));
    assert!(text.contains("\nExpires: 2027-11-17T00:00:00.000Z\n"));
}

#[test]
fn serves_the_openapi_document() {
    let res = get("/openapi");
    assert_eq!(
        header(&res, "content-type"),
        Some("application/yaml; charset=utf-8")
    );
    assert!(res.body_text().lines().any(|l| l.starts_with("openapi: ")));
}

#[test]
fn sends_old_mcp_clients_to_the_mcp_host() {
    for method in ["GET", "POST", "DELETE"] {
        let res = request(method, "/mcp");
        assert_eq!(res.status, 308);
        assert_eq!(header(&res, "location"), Some("https://mcp.mzizi.dev/mcp"));
        assert_eq!(
            header(&res, "access-control-allow-headers"),
            Some("Content-Type, MCP-Protocol-Version, MCP-Session-Id")
        );
    }
}

#[test]
fn not_found_for_an_unknown_path_with_its_path() {
    let res = get("/v1/this-route-does-not-exist");
    assert_eq!(res.status, 404);
    assert_eq!(
        body(&res),
        json!({ "error": "Not found", "path": "/v1/this-route-does-not-exist" })
    );
    assert_eq!(header(&res, "cache-control"), Some(NO_STORE));
}

// ── /v1/ui/{name} resolves every name /v1/ui lists ─────────────────────────

#[test]
fn answers_200_for_every_listed_name() {
    let index = body(&get("/v1/ui?limit=10000"));
    let items = index["items"].as_array().unwrap();
    assert_eq!(
        items.len(),
        index["meta"]["total"].as_u64().unwrap() as usize
    );
    assert_eq!(items.len(), data::components().len());
    let failures: Vec<String> = items
        .iter()
        .filter_map(|i| {
            let name = i["name"].as_str().unwrap();
            let status = get(&format!("/v1/ui/{name}")).status;
            (status != 200).then(|| format!("{name} → {status}"))
        })
        .collect();
    assert!(failures.is_empty(), "{failures:?}");
}

#[test]
fn ships_a_binary_only_items_files_as_base64() {
    let res = get("/v1/ui/kweli-icon-512");
    assert_eq!(res.status, 200);
    let b = body(&res);
    assert_eq!(b["name"], "kweli-icon-512");
    let files = b["files"].as_array().unwrap();
    assert_eq!(files.len(), 1);
    assert_eq!(files[0]["encoding"], "base64");
    assert_eq!(files[0]["mime"], "image/png");
    assert_eq!(files[0]["target"], "public/icons/kweli-icon-512.png");
    // A PNG starts with \x89PNG, which is "iVBORw" in base64.
    assert!(files[0]["content"].as_str().unwrap().starts_with("iVBORw"));
}

// ── /v1/skills ─────────────────────────────────────────────────────────────

#[test]
fn lists_the_pinned_skills_bundle() {
    let res = get("/v1/skills");
    assert_eq!(res.status, 200);
    let b = body(&res);
    assert_eq!(b["meta"]["count"], 12);
    assert_eq!(b["meta"]["version"], "0.24.0");
    let names: Vec<&str> = b["data"]
        .as_array()
        .unwrap()
        .iter()
        .map(|s| s["name"].as_str().unwrap())
        .collect();
    assert_eq!(names.len(), 12);
    for added in ["ship-release", "registry-propagation", "pr-gates"] {
        assert!(names.contains(&added), "{added}");
    }
}

#[test]
fn keeps_a_signed_escape_literal_as_hono_does() {
    let res = get("/v1/ui/%+A");
    assert_eq!(res.status, 404);
    assert_eq!(
        body(&res)["error"],
        "Component \"%+A\" not found in registry"
    );
}

// ── Raw request paths (dot segments, backslashes, ^) ───────────────────────

/// Recorded from https://api.mzizi.dev (the Hono Worker) with each path sent
/// as-is: `(method, path, status, Location, body)`, `""` for none.
const RAW_PATH_CASES: &[(&str, &str, u16, &str, &str)] = &[
    ("GET", "/v1/ui/./button", 405, "", ""),
    ("GET", "/v1/ui/../ui/button", 405, "", ""),
    ("GET", "/v1/ui/%2e%2e/ui/button", 405, "", ""),
    ("GET", "/v1/ui/%2E/button", 405, "", ""),
    ("GET", "/./v1/ui", 405, "", ""),
    ("GET", "/api/../v1/ui/button", 405, "", ""),
    ("GET", "/v1/ui/x/%2e%2e/button/docs", 405, "", ""),
    ("GET", "/v1/ui/nyuchi-footer/../button", 405, "", ""),
    ("GET", "/v1\\ui\\button", 405, "", ""),
    (
        "GET",
        "/v1/ui/a\\b",
        404,
        "",
        "{\"error\":\"Component \\\"a\\\\b\\\" not found in registry\"}",
    ),
    (
        "GET",
        "/nope/x^",
        404,
        "",
        "{\"error\":\"Not found\",\"path\":\"/nope/x%5E\"}",
    ),
    ("GET", "/v1/ui/x^/", 308, "/v1/ui/x%5E", ""),
    (
        "GET",
        "/v1/ui/x^",
        404,
        "",
        "{\"error\":\"Component \\\"x^\\\" not found in registry\"}",
    ),
    ("GET", "/v1/ui/button/.", 308, "/v1/ui/button", ""),
    ("GET", "/v1/ui/..", 308, "/v1", ""),
    ("GET", "/v1/./ui?x=1", 405, "", ""),
    (
        "GET",
        "/v1/ui/nyuchi-a11y/./docs",
        308,
        "/v1/ui/mzizi-a11y/docs",
        "",
    ),
    ("GET", "/api/v1/./health", 405, "", ""),
    ("HEAD", "/v1/ui/./button", 405, "", ""),
    ("HEAD", "/v1/ui/../ui/button", 405, "", ""),
    ("HEAD", "/v1/ui/%2e%2e/ui/button", 405, "", ""),
    ("HEAD", "/v1/ui/%2E/button", 405, "", ""),
    ("HEAD", "/./v1/ui", 405, "", ""),
    ("HEAD", "/api/../v1/ui/button", 405, "", ""),
    ("HEAD", "/v1/ui/x/%2e%2e/button/docs", 405, "", ""),
    ("HEAD", "/v1/ui/nyuchi-footer/../button", 405, "", ""),
    ("HEAD", "/v1\\ui\\button", 405, "", ""),
    ("HEAD", "/v1/ui/a\\b", 404, "", ""),
    ("HEAD", "/nope/x^", 404, "", ""),
    ("HEAD", "/v1/ui/x^/", 308, "/v1/ui/x%5E", ""),
    ("HEAD", "/v1/ui/x^", 404, "", ""),
    ("HEAD", "/v1/ui/button/.", 308, "/v1/ui/button", ""),
    ("HEAD", "/v1/ui/..", 308, "/v1", ""),
    ("HEAD", "/v1/./ui?x=1", 405, "", ""),
    (
        "HEAD",
        "/v1/ui/nyuchi-a11y/./docs",
        308,
        "/v1/ui/mzizi-a11y/docs",
        "",
    ),
    ("HEAD", "/api/v1/./health", 405, "", ""),
    ("OPTIONS", "/v1/ui/./button", 204, "", ""),
    ("OPTIONS", "/v1/ui/../ui/button", 204, "", ""),
    ("OPTIONS", "/v1/ui/%2e%2e/ui/button", 204, "", ""),
    ("OPTIONS", "/v1/ui/%2E/button", 204, "", ""),
    ("OPTIONS", "/./v1/ui", 204, "", ""),
    ("OPTIONS", "/api/../v1/ui/button", 204, "", ""),
    ("OPTIONS", "/v1/ui/x/%2e%2e/button/docs", 204, "", ""),
    ("OPTIONS", "/v1/ui/nyuchi-footer/../button", 204, "", ""),
    ("OPTIONS", "/v1\\ui\\button", 204, "", ""),
    (
        "OPTIONS",
        "/v1/ui/a\\b",
        404,
        "",
        "{\"error\":\"Not found\",\"path\":\"/v1/ui/a/b\"}",
    ),
    (
        "OPTIONS",
        "/nope/x^",
        404,
        "",
        "{\"error\":\"Not found\",\"path\":\"/nope/x%5E\"}",
    ),
    ("OPTIONS", "/v1/ui/x^/", 308, "/v1/ui/x%5E", ""),
    ("OPTIONS", "/v1/ui/x^", 204, "", ""),
    ("OPTIONS", "/v1/ui/button/.", 308, "/v1/ui/button", ""),
    ("OPTIONS", "/v1/ui/..", 308, "/v1", ""),
    ("OPTIONS", "/v1/./ui?x=1", 204, "", ""),
    (
        "OPTIONS",
        "/v1/ui/nyuchi-a11y/./docs",
        308,
        "/v1/ui/mzizi-a11y/docs",
        "",
    ),
    ("OPTIONS", "/api/v1/./health", 204, "", ""),
];

/// Hono routes on the path sliced from the raw request URL, while the
/// redirect rules, header rules and 404 body read the resolved pathname.
#[test]
fn routes_on_the_raw_request_path_as_hono_does() {
    for (method, path, status, location, want_body) in RAW_PATH_CASES {
        let res = request(method, &format!("https://api.mzizi.dev{path}"));
        assert_eq!(res.status, *status, "{method} {path}");
        assert_eq!(
            header(&res, "location").unwrap_or(""),
            *location,
            "{method} {path}"
        );
        assert_eq!(res.body_text(), *want_body, "{method} {path}");
    }
}

#[test]
fn slices_the_raw_path_like_hono_get_path() {
    use mzizi_api_worker::app::hono_raw_path;
    assert_eq!(hono_raw_path("https://h/v1/ui/./x?y=1#z"), "/v1/ui/./x");
    assert_eq!(hono_raw_path("http://h/v1\\ui\\b"), "/v1\\ui\\b");
    assert_eq!(hono_raw_path("http://h/a#b?c"), "/a");
    assert_eq!(hono_raw_path("http://h"), "");
}
