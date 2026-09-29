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
        data: unknown;
        resources: Record<string, unknown>;
      };
      expect(body.name).toBe("Mzizi API");
      expect(Object.keys(body.resources)).toContain("architecture");
      // Files are the data layer; there is no database block, and Mzizi, not
      // Nyuchi, is named as the operator.
      expect(body).not.toHaveProperty("database");
      expect(body.data).toEqual({
        source: "files",
        repository: "https://github.com/mzizi-dev/mzizi-registry",
        components: components.length,
      });
      expect(JSON.stringify(body)).not.toMatch(
        /operated and developed by Nyuchi|served from database/i,
      );
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
});

describe("file-backed routes", () => {
  it("serves component docs from the registry's meta block", async () => {
    const res = await get("/v1/ui/button/docs");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe(
      "public, max-age=3600, s-maxage=86400",
    );
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    const body = (await res.json()) as {
      name: string;
      docs: { component_name: string; use_cases: string[]; a11y: string[] };
      demo: { has_demo: boolean } | null;
    };
    expect(Object.keys(body)).toEqual([
      "name",
      "description",
      "node",
      "nodeLabel",
      "owner",
      "collection",
      "docs",
      "demo",
    ]);
    const button = components.find((c) => c.name === "button")!;
    expect(body).toMatchObject({
      name: "button",
      description: button.description,
      node: button.node,
      nodeLabel: button.nodeLabel,
      owner: button.meta?.owner,
      collection: button.meta?.collection,
    });
    expect(body.docs.component_name).toBe("button");
    expect(body.docs.use_cases.length).toBeGreaterThan(0);
    expect(body.docs.a11y.length).toBeGreaterThan(0);
    expect(body.demo?.has_demo).toBe(true);
    // Never the retired axis model, under any name.
    expect(body).not.toHaveProperty("layer");
  });

  it("serves docs for every component, including data items", async () => {
    for (const c of components) {
      const res = await get(`/v1/ui/${c.name}/docs`);
      expect(res.status, c.name).toBe(200);
    }
    const tokens = (await (await get("/v1/ui/mzizi-tokens/docs")).json()) as {
      docs: { component_name: string };
    };
    expect(tokens.docs.component_name).toBe("mzizi-tokens");
  });

  it("404s docs for an unknown component, uncached", async () => {
    const res = await get("/v1/ui/does-not-exist/docs");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      error: 'Component "does-not-exist" not found',
    });
    expect(res.headers.get("cache-control")).toBe(
      "private, no-cache, no-store, max-age=0, must-revalidate",
    );
  });

  it("keeps version history at 503, saying the console owns it", async () => {
    for (const path of [
      "/v1/ui/button/versions",
      "/api/v1/ui/button/versions",
    ]) {
      const res = await get(path);
      expect(res.status).toBe(503);
      expect(res.headers.get("access-control-allow-origin")).toBe("*");
      const body = (await res.json()) as { error: string; message: string };
      expect(body.error).toBe("Version history is not served by this API");
      expect(body.message).toMatch(/Mzizi console/);
      expect(body.message).not.toMatch(/Database not configured/);
    }
  });

  it("searches names and descriptions, case-insensitively", async () => {
    const res = await get("/v1/search?q=%20BUTTON%20");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe(
      "public, max-age=300, s-maxage=3600",
    );
    expect(res.headers.get("deprecation")).toBeNull();
    const body = (await res.json()) as {
      data: Array<Record<string, unknown>>;
      meta: Record<string, unknown>;
    };
    expect(body.meta).toEqual({
      total: body.data.length,
      query: "BUTTON",
      node: null,
      category: null,
    });
    const names = body.data.map((d) => d.name);
    expect(names).toContain("button");
    const expected = components
      .filter(
        (c) =>
          c.name.toLowerCase().includes("button") ||
          (c.description ?? "").toLowerCase().includes("button"),
      )
      .map((c) => c.name);
    expect(names).toEqual(expected);
    // Each hit carries the fields registry items have.
    const button = body.data.find((d) => d.name === "button");
    expect(Object.keys(button!)).toEqual([
      "name",
      "type",
      "title",
      "description",
      "categories",
      "node",
      "nodeLabel",
    ]);
    expect(button!.type).toBe("registry:ui");
    expect(typeof button!.node).toBe("number");
  });

  it("answers the registry handler's 400 without a query", async () => {
    for (const path of [
      "/v1/search",
      "/v1/search?q=%20%20",
      "/v1/search?node=",
      "/v1/search?layer=",
    ]) {
      const res = await get(path);
      expect(res.status, path).toBe(400);
      expect(await res.json()).toEqual({
        error: "At least one of q, node, or category is required",
      });
    }
  });

  it("filters on node and categories, combined", async () => {
    const onNode2 = components.filter((c) => c.node === 2).map((c) => c.name);
    expect(onNode2.length).toBeGreaterThan(0);
    const res = await get("/v1/search?node=2");
    expect(res.headers.get("deprecation")).toBeNull();
    const node = (await res.json()) as {
      data: Array<{ name: string; node: number }>;
      meta: Record<string, unknown>;
    };
    expect(node.data.map((d) => d.name)).toEqual(onNode2);
    expect(node.meta).toEqual({
      total: onNode2.length,
      query: null,
      node: "2",
      category: null,
    });

    const category = components[0].categories?.[0];
    expect(category).toBeDefined();
    const both = (await (
      await get(`/api/v1/search?q=a&node=2&category=${category}`)
    ).json()) as {
      data: Array<{ name: string; node: number; categories: string[] }>;
      meta: Record<string, unknown>;
    };
    const want = components
      .filter(
        (c) =>
          c.node === 2 &&
          (c.categories ?? []).includes(category!) &&
          (c.name.includes("a") ||
            (c.description ?? "").toLowerCase().includes("a")),
      )
      .map((c) => c.name);
    expect(both.data.map((d) => d.name)).toEqual(want);
    expect(both.meta).toMatchObject({ query: "a", node: "2", category });
  });

  it("keeps ?layer= as a deprecated alias of ?node=", async () => {
    const node = (await (await get("/v1/search?node=2")).json()) as {
      data: unknown[];
    };
    const res = await get("/v1/search?layer=2");
    expect(res.status).toBe(200);
    expect(res.headers.get("deprecation")).toBe("true");
    const layer = (await res.json()) as {
      data: unknown[];
      meta: Record<string, unknown>;
    };
    expect(layer.data).toEqual(node.data);
    expect(layer.meta.node).toBe("2");
    expect(layer.meta.deprecation).toMatch(/deprecated alias of `node`/);
    expect(layer.meta).not.toHaveProperty("layer");

    // `node` wins, and then there is no deprecation notice.
    const res2 = await get("/v1/search?layer=3&node=2");
    expect(res2.headers.get("deprecation")).toBeNull();
    const both = (await res2.json()) as {
      data: unknown[];
      meta: Record<string, unknown>;
    };
    expect(both.data).toEqual(node.data);
    expect(both.meta).not.toHaveProperty("deprecation");
  });

  it("serves an AI instruction set by name and by target", async () => {
    const list = (await (await get("/v1/ai/instructions")).json()) as {
      data: Array<{ name: string; target: string }>;
    };
    expect(list.data.length).toBeGreaterThan(0);
    for (const { name, target } of list.data) {
      for (const key of [name, target]) {
        const res = await get(`/v1/ai/instructions/${key}`);
        expect(res.status, key).toBe(200);
        expect(res.headers.get("cache-control")).toBe(
          "public, max-age=300, s-maxage=3600",
        );
        const body = (await res.json()) as {
          name: string;
          target: string;
          instruction_text: string;
        };
        expect(body.name).toBe(name);
        expect(body.target).toBe(target);
        expect(body.instruction_text.length).toBeGreaterThan(100);
      }
    }
  });

  it("404s an unknown AI instruction set", async () => {
    for (const key of ["nope", "claude", "__proto__", "constructor"]) {
      const res = await get(`/v1/ai/instructions/${key}`);
      expect(res.status, key).toBe(404);
      expect(await res.json()).toEqual({
        error: `AI instruction "${key}" not found`,
      });
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
