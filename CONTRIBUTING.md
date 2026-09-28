# Contributing

`api.mzizi.dev` is a Hono Worker that serves the Mzizi registry API from data
bundled at build time. Almost every change here is one of three things: changing
a route, moving the registry pin, or keeping the build honest.

- [Setup](#setup)
- [Changing a route](#changing-a-route)
- [Bumping the registry pin](#bumping-the-registry-pin)
- [`wrangler.jsonc` rules that bite](#wranglerjsonc-rules-that-bite)
- [Pull requests](#pull-requests)
- [Code of conduct](#code-of-conduct)

## Setup

```bash
npm ci
npm run build:data   # needs git and network access to github.com
npm run dev
```

## Changing a route

1. **Find the registry handler.** Each route here mirrors
   `app/api/v1/**/route.ts` in
   [`mzizi-registry`](https://github.com/mzizi-dev/mzizi-registry). Read it, and
   read which `lib/*` reader it calls.
2. **Get the data through the registry's reader.** If the route needs data not
   yet in `src/data/`, add it to `scripts/extract.ts` by calling that reader. Don't
   re-derive it from raw files: the registry's readers are the definition of the
   shape.
3. **Project it in `src/routes/`.** Keep field order. Clients and the parity
   script both see it.
4. **Test.** Add a case to `test/api.test.ts`, then run `npm run parity` against
   live. **0 unexplained differences** is the bar. A deliberate difference goes
   into `EXPECTED` in `scripts/parity.mjs` with a reason.

## Bumping the registry pin

```bash
# edit scripts/registry-ref.json → "ref": "<mzizi-registry commit sha>"
npm run build:data && npm test && npm run parity
```

Paste the parity summary into the PR. A difference after a bump usually means
the registry changed a handler, not only its data. Port the handler change here
in the same PR.

## `wrangler.jsonc` rules that bite

### No route until the owner cuts over

`wrangler.jsonc` has no `routes` block, on purpose (README, "Cutover"). Adding
one moves `api.mzizi.dev` on the next production build.

### A custom domain takes a bare hostname, nothing else

```jsonc
"routes": [{ "pattern": "api.mzizi.dev", "custom_domain": true }],
```

- **No `/*`.** Wildcards are rejected ("Wildcard operators (\*) are not allowed
  in Custom Domains"), and a custom domain already routes every path.
- **No `zone_name`.** It's inferred.

**Workers Builds previews upload a version without applying routes.** A bad
route only fails the production deploy, so a green PR isn't evidence that a
route is valid. This form broke `mzizi-mcp` (agent-tools#102) and the console.

## Pull requests

### Rebase-only

Merge commits and squash merges are disabled org-wide (read off the GitHub API,
2026-09-12). Land with:

```bash
gh pr merge <n> --rebase --auto
```

Write commit messages that are worth keeping: what changed and _why_.

### CI gates

| Job           | What it proves                                                                                       |
| ------------- | ---------------------------------------------------------------------------------------------------- |
| `worker`      | Data builds from the pin; typecheck, tests and Prettier pass; `wrangler deploy --dry-run` bundles it |
| `secret scan` | `gitleaks` finds no credential in the diff or the history                                            |
| `lint / *`    | The org lint gate: actionlint, JSON, Prettier, markdownlint, yamllint                                |

The `pull_request` trigger covers `main` **and** `claude/**`, so stacked PRs get
checks.

The **Parity** workflow is manual (`workflow_dispatch`). It's the acceptance test
against live, not a merge gate, because live changes whenever the registry
deploys.

### Deployment

Cloudflare Workers Builds, on push to `main`, to `workers.dev` until the owner
moves the custom domain. See README, "Cutover".

## Code of conduct

By participating you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).
Security issues go through [SECURITY.md](SECURITY.md), not a public issue.

## Licence

Contributions are accepted under [Apache-2.0](LICENSE), the repo's licence.
