/**
 * Body comparison for `scripts/parity.mjs`, kept apart from the script so the
 * tests can import it: parity.mjs fetches as soon as it is loaded.
 *
 * Every function here takes bodies already parsed by `parseJson`, so a run
 * parses each body once, and none of them changes the values it is given.
 */

/** A parsed JSON body, or `undefined` when the text is not JSON. */
export function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/**
 * The value checks an `added` entry can name for a key. Each takes the value
 * the candidate serves and says whether it has the field's shape, so a key
 * that is present but null, or of the wrong type, is still a difference.
 */
export const VALUE_CHECKS = {
  /** `#RRGGBB`, as lib/tokens/palette.generated.ts and textOnBaseTier() write it. */
  hex: (v) => typeof v === "string" && /^#[0-9A-Fa-f]{6}$/.test(v),
  nonEmptyString: (v) => typeof v === "string" && v.length > 0,
  /** A whole number of zero or more (`sortOrder`). */
  index: (v) => Number.isInteger(v) && v >= 0,
  /** `MineralToken.family` in lib/tokens/palette.generated.ts. */
  mineralFamily: (v) => v === "deep-earth" || v === "hand",
};

const isObject = (v) => typeof v === "object" && v !== null;

/** JSON-path of the first difference between two parsed values, or null. */
export function firstDiff(a, b, at = "$") {
  if (
    typeof a !== typeof b ||
    Array.isArray(a) !== Array.isArray(b) ||
    a === null ||
    b === null
  ) {
    return a === b
      ? null
      : `${at}: ${JSON.stringify(a)?.slice(0, 80)} ≠ ${JSON.stringify(b)?.slice(0, 80)}`;
  }
  if (typeof a !== "object")
    return a === b
      ? null
      : `${at}: ${JSON.stringify(a).slice(0, 80)} ≠ ${JSON.stringify(b).slice(0, 80)}`;
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])];
  if (
    !Array.isArray(a) &&
    Object.keys(a).join() !== Object.keys(b).join() &&
    keys.every((k) => k in a && k in b)
  ) {
    return `${at}: key order differs`;
  }
  for (const k of keys) {
    const d = firstDiff(a[k], b[k], `${at}.${k}`);
    if (d) return d;
  }
  return null;
}

/**
 * An EXPECTED entry's `added` check, on parsed bodies. `added` maps each
 * top-level array to the keys it gains and the VALUE_CHECKS name each value
 * must pass: `{ minerals: { textLight: "hex", sortOrder: "index" } }`.
 *
 * Returns null when every element of each listed array is an object carrying
 * every listed key with a value of its shape, and the candidate with those
 * keys removed equals the baseline exactly (key order included). Otherwise
 * it returns what else differs, which the caller counts as a plain `body`
 * difference.
 */
export function onlyAdded(baseline, candidate, added) {
  if (baseline === undefined || candidate === undefined)
    return "body is not JSON";
  if (!isObject(candidate) || Array.isArray(candidate))
    return "$: not an object";
  const stripped = { ...candidate };
  for (const [section, keys] of Object.entries(added)) {
    const rows = candidate[section];
    if (!Array.isArray(rows)) return `$.${section}: not an array`;
    const out = [];
    for (const [i, row] of rows.entries()) {
      if (!isObject(row) || Array.isArray(row))
        return `$.${section}.${i}: not an object`;
      const rest = { ...row };
      for (const [k, check] of Object.entries(keys)) {
        const ok = VALUE_CHECKS[check];
        if (!ok)
          return `$.${section}.${i}.${k}: unknown value check "${check}"`;
        if (!Object.hasOwn(row, k)) return `$.${section}.${i}.${k}: missing`;
        if (!ok(row[k]))
          return `$.${section}.${i}.${k}: ${JSON.stringify(row[k])?.slice(0, 40)} is not ${check}`;
        delete rest[k];
      }
      out.push(rest);
    }
    stripped[section] = out;
  }
  return firstDiff(baseline, stripped);
}
