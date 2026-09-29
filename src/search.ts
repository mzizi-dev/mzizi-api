/**
 * `/v1/search` over the bundled registry index — mzizi-registry's
 * app/api/v1/search/route.ts as it answered with data present (the handler at
 * 0b1819e, before the registry's Supabase removal reduced it to a 503 stub),
 * with its three readers from `lib/db` (`searchComponents`,
 * `getComponentsByLayer`, `getComponentsByCategory`) applied to the same
 * `readComponents()` output that src/data/components.json holds.
 *
 * Pure: it takes the items and the query string, so scripts/extract.ts can run
 * it against the registry's own readers at build time and fail the build if
 * the two ever disagree. The Worker and that check share this one copy.
 */

/** The fields of a registry item the search handler reads. */
export interface SearchableItem {
  name: string;
  description?: string;
  node?: number;
}

/**
 * A field the handler reads that registry items do not declare — the retired
 * Supabase row's `registry_type`, `category` and `layer`. Read, not assumed
 * absent, so the day an item carries one, both sides see it.
 */
const field = (c: SearchableItem, key: string): unknown =>
  (c as unknown as Record<string, unknown>)[key];

export interface SearchHit {
  name: string;
  type?: unknown;
  description?: unknown;
  category?: unknown;
  layer?: unknown;
}

export type SearchAnswer =
  | { status: 400; body: { error: string } }
  | {
      status: 200;
      body: {
        data: SearchHit[];
        meta: {
          total: number;
          query: string | null;
          layer: string | null;
          category: string | null;
        };
      };
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

/** lib/db `getComponentsByLayer`. */
export function getComponentsByLayer<T extends SearchableItem>(
  items: readonly T[],
  layer: string,
): T[] {
  return items.filter(
    (c) => String(c.node) === layer || field(c, "layer") === layer,
  );
}

/** lib/db `getComponentsByCategory`. */
export function getComponentsByCategory<T extends SearchableItem>(
  items: readonly T[],
  category: string,
): T[] {
  return items.filter((c) => field(c, "category") === category);
}

/**
 * The handler body. Field for field, including what it reads that registry
 * items do not carry (`registry_type`, `category`, `layer` are the retired
 * Supabase row's names): those come out `undefined`, and `JSON.stringify` drops
 * them, exactly as `NextResponse.json` did.
 */
export function search(
  items: readonly SearchableItem[],
  params: URLSearchParams,
): SearchAnswer {
  const q = (params.get("q") ?? "").trim();
  const layer = params.get("layer");
  const category = params.get("category");

  let results: SearchableItem[];
  if (q) results = searchComponents(items, q);
  else if (layer) results = getComponentsByLayer(items, layer);
  else if (category) results = getComponentsByCategory(items, category);
  else
    return {
      status: 400,
      body: { error: "At least one of q, layer, or category is required" },
    };

  if (layer) results = results.filter((c) => field(c, "layer") === layer);
  if (category)
    results = results.filter((c) => field(c, "category") === category);

  const data = results.map((c) => ({
    name: c.name,
    type: field(c, "registry_type"),
    description: c.description,
    category: field(c, "category"),
    layer: field(c, "layer"),
  }));
  return {
    status: 200,
    body: {
      data,
      meta: { total: data.length, query: q || null, layer, category },
    },
  };
}
