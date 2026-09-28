/**
 * api.mzizi.dev — the Mzizi registry API as a Hono Cloudflare Worker.
 *
 * Every route answers from data generated at build time out of
 * mzizi-dev/mzizi-registry's repository files (scripts/build-data.mjs, pinned in
 * scripts/registry-ref.json) and bundled into this Worker. There is no origin to
 * proxy to, no database and no Supabase: the Mzizi console is the only thing in
 * the estate that talks to Supabase.
 *
 * The contract is the one api.mzizi.dev already serves — paths, methods, query
 * parameters, status codes, bodies, CORS and cache headers — and
 * `npm run parity` is what holds this Worker to it.
 */
import { Hono } from "hono";
import { openapiYaml } from "./data";
import { renamedComponentPath } from "./redirects";
import {
  API_PREFIX_CORS,
  MCP_CORS,
  SECURITY_HEADERS,
  SOURCE,
  internalError,
  json,
} from "./http";
import { registerArchitecture } from "./routes/architecture";
import { registerContent } from "./routes/content";
import { registerRegistry } from "./routes/registry";

const v1 = new Hono();
registerRegistry(v1);
registerArchitecture(v1);
registerContent(v1);

const app = new Hono();

// ── Redirects. Answered before routing, exactly as Next's are: bare 308s with a
// relative Location and no other headers. ─────────────────────────────────────

const redirect = (location: string) =>
  new Response(null, { status: 308, headers: { Location: location } });

app.use("*", async (c, next) => {
  const url = new URL(c.req.url);
  const { pathname, search } = url;

  // Next's default `trailingSlash: false`.
  if (pathname.length > 1 && pathname.endsWith("/")) {
    c.res = redirect((pathname.replace(/\/+$/, "") || "/") + search);
  } else {
    const renamed = renamedComponentPath(pathname);
    if (renamed) {
      c.res = redirect(renamed + search);
    } else {
      await next();
      // Next applies `headers()` to rendered responses, not to its redirects.
      for (const [k, v] of Object.entries(SECURITY_HEADERS))
        c.res.headers.set(k, v);
      if (pathname.startsWith("/api/")) {
        for (const [k, v] of Object.entries(API_PREFIX_CORS))
          c.res.headers.set(k, v);
      } else if (pathname === "/mcp") {
        for (const [k, v] of Object.entries(MCP_CORS)) c.res.headers.set(k, v);
      }
      // Next marks every 404 it serves uncacheable unless the handler said otherwise.
      if (c.res.status === 404 && !c.res.headers.has("Cache-Control")) {
        c.res.headers.set(
          "Cache-Control",
          "private, no-cache, no-store, max-age=0, must-revalidate",
        );
      }
    }
  }
  c.res.headers.set("X-Mzizi-Source", SOURCE);
});

// Both base paths answer, as they do today: `/v1` is canonical on the api.
// host; `/api/v1` is what Next serves natively and what old clients call.
app.route("/v1", v1);
app.route("/api/v1", v1);

// ── /mcp (app/mcp/route.ts). The MCP server lives on its own host; old
// clients configured with api.mzizi.dev/mcp are sent there. ────────────────
const mcpRedirect = () =>
  new Response(null, {
    status: 308,
    headers: {
      Location: "https://mcp.mzizi.dev/mcp",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=3600",
    },
  });
app.on(["GET", "POST", "DELETE"], "/mcp", mcpRedirect);
app.options("/mcp", () => new Response(null, { status: 204 }));

// ── OpenAPI (app/api/openapi, rewritten from /openapi). ─────────────────────
const OPENAPI_CACHE = {
  "Access-Control-Allow-Origin": "*",
  "Cache-Control": "public, max-age=3600, s-maxage=86400",
};
for (const path of ["/openapi", "/api/openapi"]) {
  app.get(path, (c) => {
    if (new URL(c.req.url).searchParams.get("format") === "json") {
      return json(
        {
          message: "Use ?format=yaml (default) or fetch the raw YAML.",
          yaml: openapiYaml,
        },
        200,
        OPENAPI_CACHE,
      );
    }
    return new Response(openapiYaml, {
      status: 200,
      headers: {
        "Content-Type": "application/yaml; charset=utf-8",
        ...OPENAPI_CACHE,
        "X-OpenAPI-Version": "3.1.0",
      },
    });
  });
  app.options(
    path,
    () =>
      new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      }),
  );
}

// ── RFC 9116. Contact is security@bundu.org by owner decision (2026-09-28). ──
app.get("/.well-known/security.txt", () => {
  const expires = new Date();
  expires.setFullYear(expires.getFullYear() + 1);
  const body = `Contact: mailto:security@bundu.org
Expires: ${expires.toISOString()}
Canonical: https://api.mzizi.dev/.well-known/security.txt
Policy: https://github.com/mzizi-dev/mzizi-api-gateway/blob/main/SECURITY.md
Preferred-Languages: en
`;
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=86400",
    },
  });
});

// ── Method handling, as Next's route handlers do it. A path with a GET handler
// answers OPTIONS with 204 + `Allow` and any other method with an empty 405;
// the API is read-only, so nothing but GET/HEAD ever reaches a handler. ─────
const getRoutes = app.routes
  .filter((r) => r.method === "GET")
  .map(
    (r) =>
      new RegExp(
        "^" +
          r.path
            .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
            .replace(/:[A-Za-z]+/g, "[^/]+") +
          "$",
      ),
  );

app.notFound((c) => {
  const { pathname } = new URL(c.req.url);
  if (getRoutes.some((re) => re.test(pathname))) {
    if (c.req.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: { Allow: "GET, HEAD, OPTIONS" },
      });
    }
    return new Response(null, { status: 405 });
  }
  return json({ error: "Not found", path: pathname }, 404);
});

app.onError(() => internalError());

export default app;
