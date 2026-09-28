/**
 * Response helpers that reproduce, byte for byte where it matters, what the
 * mzizi-registry Next.js handlers send today — so a client cannot tell which
 * Worker answered except by the `X-Mzizi-Source` header this one adds.
 */
import meta from "./data/meta.json";

/** Registry commit the bundled data was generated from (scripts/registry-ref.json). */
export const REGISTRY_REF: string = meta.ref;

/** Identifies this Worker's answers during and after the api.mzizi.dev cutover. */
export const SOURCE = `mzizi-api-gateway; registry=${REGISTRY_REF.slice(0, 12)}`;

/**
 * next.config.mjs `headers()` → `source: "/(.*)"`. Applied by Next to every
 * response it renders (not to its redirects), so applied here the same way.
 */
export const SECURITY_HEADERS: Record<string, string> = {
  "X-Frame-Options": "SAMEORIGIN",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
  "X-DNS-Prefetch-Control": "on",
};

/**
 * next.config.mjs `headers()` → `source: "/api/:path*"`. Next matches header
 * rules against the path as REQUESTED, before the `/v1/* → /api/v1/*` rewrite,
 * so these three appear on `/api/v1/...` responses and not on `/v1/...` ones.
 * Reproduced exactly, including that asymmetry.
 */
export const API_PREFIX_CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

/** next.config.mjs `headers()` → `source: "/mcp"`. */
export const MCP_CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, MCP-Protocol-Version, MCP-Session-Id",
};

export const CORS = { "Access-Control-Allow-Origin": "*" } as const;

export const cache = (maxAge: number, sMaxAge: number) => ({
  "Cache-Control": `public, max-age=${maxAge}, s-maxage=${sMaxAge}`,
  "Access-Control-Allow-Origin": "*",
});

/** The route-level header set most handlers use. */
export const CORS_CACHE = cache(3600, 86400);

/**
 * `NextResponse.json(body, init)`: `JSON.stringify(body)` with
 * `content-type: application/json` (no charset — Next adds none).
 */
export function json(
  body: unknown,
  status = 200,
  headers: Record<string, string> = CORS,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

/** `{ error: "Internal server error" }` with the CORS header — every handler's catch. */
export const internalError = () =>
  json({ error: "Internal server error" }, 500, CORS);
