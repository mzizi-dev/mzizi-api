# Security Policy

## What this is, and what it therefore is not

`mzizi-api-gateway` is a **public, read-only API**. It serves the Mzizi registry
API at `api.mzizi.dev` from data generated at build time out of
`mzizi-dev/mzizi-registry`'s repository files and bundled into the Worker.

Sizing the policy to that honestly:

- **No authentication, no sessions, no cookies.** Every route is public.
- **No writes.** There's no mutation path in this Worker. Adding one would be a
  design change, not a feature.
- **No end-user data.** The registry is component metadata and source, brand
  tokens and doctrine. There's no PII here to leak.
- **No credentials at all.** The Worker has no secrets, no bindings and no
  database client. It doesn't talk to Supabase. A credential of any kind in
  this Worker or its build would be a serious finding. Report it as one.

So the realistic risk isn't data theft. It's the **integrity of what the Worker
serves**. Downstream apps and the shadcn CLI install from this address, so
anything that could make it serve source the registry didn't contain is a
supply-chain problem for everything that consumes it.

## Controls that already exist

| Control                              | Where                                         | What it stops                                                                                                     |
| ------------------------------------ | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Non-`GET` answered `405` locally     | `src/index.ts`                                | No request method other than `GET`/`HEAD`/`OPTIONS` reaches a handler                                             |
| Data pinned to one registry commit   | `scripts/registry-ref.json`, `build-data.mjs` | The build fails unless the checkout is exactly the pinned SHA; changing what is served is a commit that passes CI |
| No request-time fetches              | `src/`                                        | No request input can steer the Worker to another host; there is no origin to poison or SSRF                       |
| Supabase replaced by a throwing stub | `scripts/supabase-stub.mjs`                   | A registry reader that reached for the database fails the build instead of shipping                               |
| No secrets or bindings               | `wrangler.jsonc`                              | There's nothing in the Worker's environment to exfiltrate                                                         |
| `gitleaks` on full history           | `.github/workflows/ci.yml`                    | A credential committed by accident fails CI rather than shipping                                                  |

**The automated pin bump** (README, "Registry pin bump") merges without a
person only a commit that moves the pin forward along mzizi-registry `main`,
changes nothing else, and passes CI and a `--strict` parity run against
production with zero differences. Anything else waits for review. Its token,
`RELEASE_BUMP_TOKEN`, is an Actions secret used only by
`.github/workflows/registry-pin-bump.yml`, which runs from `main` and never
checks out pull request code.

`Access-Control-Allow-Origin: *` is deliberate and isn't a finding. The data is
public, no route takes credentials, and browsers never attach cookies to these
requests, so a wildcard gives a caller nothing it couldn't get with `curl`.

## Reporting a vulnerability

**Do not open a public issue or pull request.**

1. Use GitHub's private advisory flow:
   <https://github.com/mzizi-dev/mzizi-api-gateway/security/advisories/new>
2. If that is unavailable to you, email `security@bundu.org` (also the
   `Contact` in `https://api.mzizi.dev/.well-known/security.txt`).

Include the request that reproduces it (full URL and method), what the gateway
returned, what you expected, and the commit SHA or deploy time if you have it.
PGP is not required.

| Stage                                  | Target                                             |
| -------------------------------------- | -------------------------------------------------- |
| Acknowledgement                        | Within 48 hours                                    |
| Triage and reproduction                | Within 5 business days                             |
| Fix merged to `main` (critical / high) | Within 7 days of triage                            |
| Fix merged to `main` (medium / low)    | Within 30 days of triage                           |
| Public disclosure                      | After the fix ships, coordinated with the reporter |

## Scope

In scope — anything this repository owns:

- `src/**` — the router and the route handlers
- `scripts/**` — the data build (`build-data.mjs`, `extract.ts`) and the parity
  script
- `wrangler.jsonc` — routes, bindings, and the `build.command` that Cloudflare
  Workers Builds executes
- `.github/workflows/**` — malicious-input, token-exfiltration, or
  privilege-escalation issues in CI
- Any way the Worker can be induced to serve content that is not in the
  registry at the pinned commit

Out of scope — report these to the repository that owns them:

- The registry's content and its Next.js app →
  [`mzizi-dev/mzizi-registry`](https://github.com/mzizi-dev/mzizi-registry).
- Supabase and anything per-user → the Mzizi console.
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
`main`. Every response's `X-Mzizi-Source` header names the registry commit
the running build was generated from.
