# Security Policy

## What this is, and what it therefore is not

`mzizi-api-gateway` is a **public, read-only API gateway**. It serves the Mzizi
registry API at `api.mzizi.dev`, either answering a route natively or forwarding
it unmodified to `https://mzizi.dev/api/v1`.

Sizing the policy to that honestly:

- **No authentication, no sessions, no cookies.** Every route is public.
- **No writes.** There is no mutation path in this Worker, and adding one would
  be a design change, not a feature.
- **No end-user data.** The registry is component metadata — names,
  descriptions, dependencies. There is no PII here to leak.
- **No service-role credential, ever.** Where a ported route reads Supabase it
  uses the anon / publishable key, which grants only the `anon` role that RLS
  restricts to read-only `SELECT` on public tables. That key and the project URL
  are public by design (see `mzizi-dev/agent-tools/mzizi-mcp/src/defaults.ts`).
  A service-role key in this Worker would be the single most serious finding
  this repo could have — report it as one.

So the realistic risk here is not data theft. It is **integrity of what the
gateway serves**: this Worker sits in front of an address that downstream apps
and the shadcn CLI install from, so a response this gateway can be made to
forge is a supply-chain problem for everything that consumes it.

## Controls that already exist

| Control | Where | What it stops |
| --- | --- | --- |
| Non-`GET` answered `405` locally | `src/lib.rs` | A write attempt never reaches the origin — it is rejected at the edge, before any forwarding happens |
| Origin host is a compile-time constant | `ORIGIN` in `src/lib.rs` | The proxy cannot be aimed at an attacker-controlled host by request input; only the path and query travel |
| Origin is a *different* hostname | `mzizi.dev` vs `api.mzizi.dev` | A proxied request cannot re-enter this Worker, so there is no recursion to amplify |
| No secrets or bindings | `wrangler.jsonc` | There is nothing in the Worker's environment to exfiltrate |
| `gitleaks` on full history | `.github/workflows/ci.yml` | A credential committed by accident fails CI rather than shipping |
| `unsafe_code = "forbid"` | `Cargo.toml` | Memory-safety classes are excluded by the compiler, not by review |

`Access-Control-Allow-Origin: *` is deliberate and is not a finding. The data is
public, no route is credentialed, and browsers never attach cookies to these
requests — so a wildcard grants a caller nothing it could not get with `curl`.
It is applied to error responses too, so that a `404` surfaces in a browser as a
`404` rather than as an opaque CORS failure.

## Reporting a vulnerability

**Do not open a public issue or pull request.**

1. Use GitHub's private advisory flow:
   <https://github.com/mzizi-dev/mzizi-api-gateway/security/advisories/new>
2. If that is unavailable to you, email `security@nyuchi.com`.

Include the request that reproduces it (full URL and method), what the gateway
returned, what you expected, and the commit SHA or deploy time if you have it.
PGP is not required.

| Stage | Target |
| --- | --- |
| Acknowledgement | Within 48 hours |
| Triage and reproduction | Within 5 business days |
| Fix merged to `main` (critical / high) | Within 7 days of triage |
| Fix merged to `main` (medium / low) | Within 30 days of triage |
| Public disclosure | After the fix ships, coordinated with the reporter |

## Scope

In scope — anything this repository owns:

- `src/**` — the router, the native route handlers, the proxy
- `wrangler.jsonc` — routes, bindings, and the `build.command` that Cloudflare
  Workers Builds executes
- `.github/workflows/**` — malicious-input, token-exfiltration, or
  privilege-escalation issues in CI
- Any way the gateway can be induced to return a response the origin did not
  produce, or to forward a request the origin should never have seen

Out of scope — report these to the repository that owns them:

- The Next.js origin at `mzizi.dev/api/v1` and its Supabase RLS policies →
  [`mzizi-dev/mzizi-registry`](https://github.com/mzizi-dev/mzizi-registry).
  While a route is still proxied, its behaviour is that repo's, not this one's.
- Applications that consume the registry → their own repositories.
- Volumetric denial of service against Cloudflare or Vercel — those platforms
  own their edge.
- Findings that require a compromised maintainer account as a precondition.
- Social engineering or physical attacks.

## Safe harbour

Testing against `api.mzizi.dev` is welcome, provided you do not generate
disruptive load, do not degrade service for others, and extract no more data
than is needed to demonstrate the issue. Good-faith testing within those limits
will not be pursued as a violation of computer-misuse law or terms of service.

## Supported versions

`main` only. The Worker is deployed continuously from `main`; there are no
release branches to backport to, and the deployed artefact is always the head of
`main`. `GET /v1/health` reports the running version.
