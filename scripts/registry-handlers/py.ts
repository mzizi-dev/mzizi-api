// Written for mzizi-registry#472 in the shape of ./rs.ts (ported from
// mzizi-registry 270af9f), because the registry has had no route handlers since
// mzizi-registry#389: this is the reference `/v1/py/{name}` answer, built only
// from the pinned registry's own lib/ readers (`lib/registry`,
// `lib/registry-source` and `lib/python-packages`). scripts/extract.ts runs it
// for every component and fails the build if this Worker answers differently.
// Build-time only: not part of the Worker bundle.

import { NextResponse } from "next/server";
import { readComponent } from "@/lib/registry";
import { readComponentSourceFor } from "@/lib/registry-source";
import { pythonPackageFor } from "@/lib/python-packages";

const CORS_CACHE = {
  "Cache-Control": "public, max-age=3600, s-maxage=86400",
  "Access-Control-Allow-Origin": "*",
};

/**
 * GET /v1/py/{name} — a component's PYTHON implementation.
 *
 * One component, one contract, several builds: `circuit-breaker` is implemented in
 * `circuit-breaker.ts`, `.rs` and `.py` side by side in one node directory. This
 * route serves the `.py`, and names the PyPI package that ships it (read from
 * `mzizi-py/package-for-node.json` through `lib/python-packages.ts`, the map the
 * registry's `pnpm py:generate` packages from), the `pip install` line and the
 * module to import.
 *
 * A component with no Python sibling is a 404, deliberately, as on /v1/rs: never
 * present a target as though a build exists when it does not.
 *
 * A READ SURFACE, NOT AN INSTALL PATH: a Python consumer installs the package
 * (`package` in the payload). `package` is null for Python that is not packaged, a
 * single-file module a consumer copies (N1's `mzizi-tokens-python.py`).
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params;

  const component = readComponent(name);
  if (!component) {
    return NextResponse.json(
      { error: `Component "${name}" not found in registry` },
      { status: 404, headers: { "Access-Control-Allow-Origin": "*" } },
    );
  }

  const source = readComponentSourceFor(name, "py");
  if (source === null) {
    return NextResponse.json(
      {
        error: `"${name}" has no Python implementation`,
        message:
          "This component has no Python build. The contract, tokens and variants are on " +
          `https://api.mzizi.dev/v1/ui/${encodeURIComponent(name)}. Python builds are ` +
          "`.py` files beside the component's other builds in mzizi-dev/mzizi-registry " +
          "(mzizi-registry#472).",
      },
      { status: 404, headers: { "Access-Control-Allow-Origin": "*" } },
    );
  }

  const pyPath = component.sources?.py ?? `${name}.py`;
  const pkg = pythonPackageFor(pyPath);

  return NextResponse.json(
    {
      $schema: "https://ui.shadcn.com/schema/registry-item.json",
      name: component.name,
      type: component.type,
      target: "python",
      description: component.description,
      package: pkg
        ? {
            name: pkg.name,
            registry: "pypi",
            pip: pkg.pip,
            import: pkg.importName,
            module: pkg.module,
            url: pkg.pypi,
            git: pkg.git,
          }
        : null,
      files: [{ path: pyPath, type: "registry:python", content: source }],
    },
    { headers: CORS_CACHE },
  );
}
