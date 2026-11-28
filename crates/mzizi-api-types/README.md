# mzizi-api-types

Serde types for the Mzizi registry API, [api.mzizi.dev](https://api.mzizi.dev/v1):
every response body it serves, and the registry data shapes those bodies are
built from (`RegistryItem`, `AstroDocument` and the rest).

The Worker that serves api.mzizi.dev serializes these types, and clients such
as `mzizi-cli` deserialize them, so both compile against one contract.

```toml
[dependencies]
mzizi-api-types = "0.1"
```

```rust,ignore
use mzizi_api_types::RegistryItemBody;

let body = reqwest::blocking::get("https://api.mzizi.dev/v1/ui/button")?.text()?;
let item: RegistryItemBody = serde_json::from_str(&body)?;
println!("{} ships {} file(s)", item.name, item.files.map_or(0, |f| f.len()));
```

## Conventions

- **Field order is the order the API sends.** Serializing a body gives the
  served JSON key for key.
- **Absent and `null` are different.** A field the API leaves out when it has no
  value is an `Option` skipped when `None`; a field the API sends as `null` is
  an `Option` that is not skipped.
- **Free-form registry rows stay `serde_json::Value`.** Doctrine rows, helix
  nodes, changelog records, skills and sample records grow with the registry,
  without an API release.

## Licence

Apache-2.0. Source: [mzizi-dev/mzizi-api](https://github.com/mzizi-dev/mzizi-api),
`crates/mzizi-api-types`.
