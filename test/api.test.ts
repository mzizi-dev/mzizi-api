/**
 * Offline checks of the Worker against its bundled data. The live contract is
 * held by `npm run parity`; these catch a broken build or routing regression in
 * CI without touching the network. Requires `npm run build:data` first.
 */
import { describe, expect, it } from "vitest";
import app from "../src/index";
import { components } from "../src/data";

const get = (path: string, init?: RequestInit) => app.request(path, init);

describe("discovery and health", () => {
  it("serves the discovery document at /v1 and /api/v1", async () => {
    for (const path of ["/v1", "/api/v1"]) {
      const res = await get(path);
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        name: string;
        resources: Record<string, unknown>;
      };
      expect(body.name).toBe("Mzizi API");
      expect(Object.keys(body.resources)).toContain("architecture");
    }
  });

  it("health is 200 and uncached", async () => {
    const res = await get("/v1/health");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-cache, no-store");
    expect(res.headers.get("x-mzizi-source")).toMatch(
      /^mzizi-api-gateway; registry=[0-9a-f]{12}$/,
    );
  });
});

describe("registry", () => {
  it("indexes every bundled component, with shadcn keys first", async () => {
    const res = await get("/v1/ui");
    const body = (await res.json()) as {
      items: unknown[];
      meta: { registryTotal: number };
    };
    expect(Object.keys(body).slice(0, 4)).toEqual([
      "$schema",
      "name",
      "homepage",
      "items",
    ]);
    expect(body.items.length).toBe(components.length);
    expect(body.meta.registryTotal).toBe(components.length);
    expect(res.headers.get("cache-control")).toBe(
      "public, max-age=3600, s-maxage=86400",
    );
  });

  it("filters and pages without a 400 on bad input", async () => {
    const body = (await (
      await get("/v1/ui?node=2&limit=3&offset=1")
    ).json()) as {
      items: Array<{ node: number }>;
      meta: { limit: number; offset: number };
    };
    expect(body.items.length).toBeLessThanOrEqual(3);
    expect(body.items.every((i) => i.node === 2)).toBe(true);
    expect((await get("/v1/ui?limit=abc")).status).toBe(200);
  });

  it("serves an installable item with its source", async () => {
    const body = (await (await get("/v1/ui/button")).json()) as {
      files: Array<{ content: string }>;
    };
    expect(body.files).toHaveLength(1);
    expect(body.files[0].content.length).toBeGreaterThan(100);
  });

  it("404s an unknown component", async () => {
    const res = await get("/v1/ui/does-not-exist");
    expect(res.status).toBe(404);
    expect(res.headers.get("cache-control")).toBe(
      "private, no-cache, no-store, max-age=0, must-revalidate",
    );
  });

  it("308s a renamed component, keeping sub-path and query", async () => {
    const res = await get("/v1/ui/nyuchi-a11y/docs?x=1");
    expect(res.status).toBe(308);
    expect(res.headers.get("location")).toBe("/v1/ui/mzizi-a11y/docs?x=1");
    const api = await get("/api/v1/rs/nyuchi-a11y");
    expect(api.headers.get("location")).toBe("/api/v1/rs/mzizi-a11y");
  });

  it("keeps the Supabase-gated routes at the 503 api.mzizi.dev answers today", async () => {
    for (const path of [
      "/v1/ui/button/docs",
      "/v1/ui/button/versions",
      "/v1/search?q=x",
    ]) {
      const res = await get(path);
      expect(res.status).toBe(503);
      expect(await res.json()).toEqual({ error: "Database not configured" });
    }
  });
});

describe("architecture and content", () => {
  it("serves the helix: 8 nodes, 4 rungs, 6 strands", async () => {
    const body = (await (await get("/v1/architecture")).json()) as {
      meta: { node_count: number; rung_count: number; strand_count: number };
    };
    expect([
      body.meta.node_count,
      body.meta.rung_count,
      body.meta.strand_count,
    ]).toEqual([8, 4, 6]);
  });

  it("validates node numbers", async () => {
    expect((await get("/v1/architecture/nodes/1")).status).toBe(200);
    expect((await get("/v1/architecture/nodes/0")).status).toBe(400);
    expect((await get("/v1/architecture/nodes/01")).status).toBe(400);
    expect((await get("/v1/architecture/nodes/9999")).status).toBe(404);
  });

  it("serves 21 colour families on /v1/brand", async () => {
    const body = (await (await get("/v1/brand")).json()) as Record<
      string,
      unknown[]
    >;
    expect(
      body.minerals.length + body.heritage.length + body.experimental.length,
    ).toBe(21);
  });

  it("keeps retired routes at 410", async () => {
    for (const path of [
      "/v1/architecture/axes",
      "/v1/architecture/frontend/axes",
      "/v1/architecture/frontend/layers",
      "/v1/architecture/layers/3",
      "/v1/docs",
      "/v1/docs/introduction",
    ]) {
      expect((await get(path)).status).toBe(410);
    }
  });
});

describe("HTTP behaviour", () => {
  it("is read-only: 405 for writes, 204 + Allow for OPTIONS", async () => {
    expect((await get("/v1/ui", { method: "POST" })).status).toBe(405);
    expect((await get("/v1/ui/button", { method: "DELETE" })).status).toBe(405);
    const opt = await get("/v1/ui", { method: "OPTIONS" });
    expect(opt.status).toBe(204);
    expect(opt.headers.get("allow")).toBe("GET, HEAD, OPTIONS");
  });

  it("adds Next's /api/* CORS headers only on the /api spelling", async () => {
    const api = await get("/api/v1/health");
    expect(api.headers.get("access-control-allow-methods")).toBe(
      "GET, POST, DELETE, OPTIONS",
    );
    expect(
      (await get("/v1/health")).headers.get("access-control-allow-methods"),
    ).toBeNull();
  });

  it("sends the security headers", async () => {
    const res = await get("/v1/brand");
    expect(res.headers.get("x-frame-options")).toBe("SAMEORIGIN");
    expect(res.headers.get("strict-transport-security")).toContain(
      "max-age=63072000",
    );
  });

  it("strips a trailing slash with a 308", async () => {
    const res = await get("/v1/ui/");
    expect(res.status).toBe(308);
    expect(res.headers.get("location")).toBe("/v1/ui");
    // A path of only slashes must not redirect to an empty Location.
    expect((await get("//")).headers.get("location")).toBe("/");
  });

  it("collapses repeated slashes instead of redirecting off-site", async () => {
    // What api.mzizi.dev answers today for each of these.
    const cases: Array<[string, string]> = [
      ["//evil.com/", "/evil.com/"],
      ["/\\evil.com/", "/evil.com/"],
      ["///evil.com/", "/evil.com/"],
      ["//v1/ui", "/v1/ui"],
      ["/v1//ui?x=1", "/v1/ui?x=1"],
    ];
    for (const [path, location] of cases) {
      const res = await get(`https://api.mzizi.dev${path}`);
      expect(res.status, path).toBe(308);
      expect(res.headers.get("location"), path).toBe(location);
    }
  });

  it("publishes security.txt with the owner-chosen contact", async () => {
    const text = await (await get("/.well-known/security.txt")).text();
    expect(text).toContain("Contact: mailto:security@bundu.org");
    expect(text).toMatch(/^Expires: \d{4}-/m);
  });

  it("serves the OpenAPI document", async () => {
    const res = await get("/openapi");
    expect(res.headers.get("content-type")).toBe(
      "application/yaml; charset=utf-8",
    );
    expect(await res.text()).toMatch(/^openapi: /m);
  });
});
