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

/** A JSON object: not null, not an array, not a primitive. */
export const isRecord = (v) =>
  typeof v === "object" && v !== null && !Array.isArray(v);

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
    keys.every((k) => Object.hasOwn(a, k) && Object.hasOwn(b, k))
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
 * Checks an `added` spec on its own, before any body is looked at, so a typo
 * in a check name is reported even when the array it covers is empty. Only
 * VALUE_CHECKS' own names count: `constructor`, `valueOf` and the rest of
 * Object.prototype are unknown checks. Returns null, or what is wrong.
 */
export function checkAddedSpec(added) {
  if (!isRecord(added)) return "added: not an object";
  for (const [section, keys] of Object.entries(added)) {
    if (!isRecord(keys)) return `added.${section}: not an object`;
    for (const [k, check] of Object.entries(keys))
      if (typeof check !== "string" || !Object.hasOwn(VALUE_CHECKS, check))
        return `added.${section}.${k}: unknown value check ${JSON.stringify(check)}`;
  }
  return null;
}

/**
 * An EXPECTED entry's `added` check, on parsed bodies. `added` maps each
 * top-level array to the keys it gains and the VALUE_CHECKS name each value
 * must pass: `{ minerals: { textLight: "hex", sortOrder: "index" } }`.
 *
 * Returns null when the spec is valid, every element of each listed array is
 * an object carrying every listed key with a value of its shape, and the
 * candidate with those keys removed equals the baseline exactly (key order
 * included). Otherwise it returns what else differs, which the caller counts
 * as a plain `body` difference.
 */
export function onlyAdded(baseline, candidate, added) {
  const specError = checkAddedSpec(added);
  if (specError) return specError;
  if (baseline === undefined || candidate === undefined)
    return "body is not JSON";
  if (!isRecord(candidate)) return "$: not an object";
  const stripped = { ...candidate };
  for (const [section, keys] of Object.entries(added)) {
    const rows = candidate[section];
    if (!Array.isArray(rows)) return `$.${section}: not an array`;
    const out = [];
    for (const [i, row] of rows.entries()) {
      if (!isRecord(row)) return `$.${section}.${i}: not an object`;
      const rest = { ...row };
      for (const [k, check] of Object.entries(keys)) {
        if (!Object.hasOwn(row, k)) return `$.${section}.${i}.${k}: missing`;
        if (!VALUE_CHECKS[check](row[k]))
          return `$.${section}.${i}.${k}: ${JSON.stringify(row[k])?.slice(0, 40)} is not ${check}`;
        delete rest[k];
      }
      out.push(rest);
    }
    stripped[section] = out;
  }
  return firstDiff(baseline, stripped);
}

/**
 * A response body with its run-to-run noise replaced: /health's `timestamp`
 * and security.txt's `Expires`. A 200 /health body that isn't a JSON object
 * comes back unchanged, to be compared (and reported) as it is.
 */
export function normaliseBody(path, status, text) {
  if (path.endsWith("/health") && status === 200) {
    const j = parseJson(text);
    if (!isRecord(j)) return text;
    j.timestamp = "<timestamp>";
    return JSON.stringify(j);
  }
  if (path.endsWith("security.txt"))
    return text.replace(/^Expires: .*$/m, "Expires: <expires>");
  return text;
}

/**
 * One request's body comparison: `null` when the bodies match, else
 * `{ kind, diff }`, `kind` being `body:added` (excused by `expected.added`)
 * or `body`. Identical text is never parsed; otherwise each body is parsed
 * once. A JSON content type compares the parsed values, so a serialisation
 * difference alone isn't one. The report's detail is worked out only for a
 * `body` difference.
 */
export function compareBodies(lb, cb, contentType, expected) {
  if (lb === cb) return null;
  const lj = parseJson(lb);
  const cj = parseJson(cb);
  const parsed = lj !== undefined && cj !== undefined;
  if (
    contentType?.includes("json") &&
    parsed &&
    JSON.stringify(lj) === JSON.stringify(cj)
  )
    return null;
  const rest = expected?.added ? onlyAdded(lj, cj, expected.added) : "n/a";
  if (rest === null)
    return {
      kind: "body:added",
      diff: `body: only adds ${Object.entries(expected.added)
        .map(([k, v]) => `${k}[].{${Object.keys(v).join(",")}}`)
        .join(", ")}`,
    };
  const detail = parsed
    ? "body " + (firstDiff(lj, cj) ?? "differs (serialisation)")
    : `body differs (${lb.length} vs ${cb.length} bytes)`;
  return {
    kind: "body",
    diff: expected?.added
      ? `${detail} (beyond the added keys: ${rest})`
      : detail,
  };
}
