/**
 * `/v1/search` over the bundled registry index — mzizi-registry's
 * app/api/v1/search/route.ts (mzizi-registry#373): `q` is a case-insensitive
 * substring of a component's name or description, `node` its node on the
 * helix, `category` one of its `categories`; they combine (AND). `?layer=` is a
 * deprecated alias of `?node=`.
 *
 * Pure: it takes the items and the query string, so scripts/extract.ts can run
 * it against the registry's own handler at build time and fail the build if
 * the two ever disagree — status, body and headers. The Worker and that check
 * share this one copy.
 */

/** The fields of a registry item the search handler reads and returns. */
export interface SearchableItem {
  name: string;
  type?: string;
  title?: string;
  description?: string;
  categories?: string[];
  node?: number;
  nodeLabel?: string;
}

export interface SearchHit {
  name: string;
  type?: string;
  title?: string;
  description?: string;
  categories?: string[];
  node?: number;
  nodeLabel?: string;
}

/** The registry handler's `LAYER_DEPRECATION`. */
export const LAYER_DEPRECATION =
  "`layer` is a deprecated alias of `node` and will be removed. Filter with `?node=` instead.";

export type SearchAnswer =
  | { status: 400; body: { error: string }; headers: Record<string, string> }
  | {
      status: 200;
      body: {
        data: SearchHit[];
        meta: {
          total: number;
          query: string | null;
          node: string | null;
          category: string | null;
          deprecation?: string;
        };
      };
      /** Beyond the route's cache headers: `Deprecation: true` for `?layer=`. */
      headers: Record<string, string>;
    };

/** lib/db `searchComponents`: case-insensitive substring of name or description. */
export function searchComponents<T extends SearchableItem>(
  items: readonly T[],
  query: string,
): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return items.filter((c) => {
    const name = String(c.name ?? "").toLowerCase();
    const desc = String(c.description ?? "").toLowerCase();
    return name.includes(q) || desc.includes(q);
  });
}

const onNode = (c: SearchableItem, node: string) =>
  typeof c.node === "number" && String(c.node) === node;
const inCategory = (c: SearchableItem, category: string) =>
  (c.categories ?? []).includes(category);

/** The handler body, field for field. */
export function search(
  items: readonly SearchableItem[],
  params: URLSearchParams,
): SearchAnswer {
  const q = (params.get("q") ?? "").trim();
  const nodeParam = params.get("node")?.trim() || null;
  const layerParam = params.get("layer")?.trim() || null;
  const node = nodeParam ?? layerParam;
  const viaLayer = nodeParam === null && layerParam !== null;
  const category = params.get("category")?.trim() || null;

  let results: SearchableItem[];
  if (q) results = searchComponents(items, q);
  else if (node) results = items.filter((c) => onNode(c, node));
  else if (category) results = items.filter((c) => inCategory(c, category));
  else
    return {
      status: 400,
      body: { error: "At least one of q, node, or category is required" },
      headers: {},
    };

  if (node) results = results.filter((c) => onNode(c, node));
  if (category) results = results.filter((c) => inCategory(c, category));

  const data = results.map((c) => ({
    name: c.name,
    type: c.type,
    title: c.title,
    description: c.description,
    categories: c.categories,
    node: c.node,
    nodeLabel: c.nodeLabel,
  }));
  return {
    status: 200,
    body: {
      data,
      meta: {
        total: data.length,
        query: q || null,
        node,
        category,
        ...(viaLayer ? { deprecation: LAYER_DEPRECATION } : {}),
      },
    },
    headers: viaLayer ? { Deprecation: "true" } : {},
  };
}
