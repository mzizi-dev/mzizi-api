/**
 * Offline checks of parity's body comparison (scripts/parity-body.mjs): the
 * `added` check that lets an EXPECTED entry excuse only named new keys.
 */
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import {
  checkAddedSpec,
  compareBodies,
  firstDiff,
  isRecord,
  normaliseBody,
  onlyAdded,
  parseJson,
  VALUE_CHECKS,
  type AddedSpec,
} from "../scripts/parity-body.mjs";

const ADDED: AddedSpec = {
  minerals: {
    role: "nonEmptyString",
    family: "mineralFamily",
    textLight: "hex",
    sortOrder: "index",
  },
  heritage: { textLight: "hex" },
};

const baseline = {
  version: "1",
  minerals: [{ name: "cobalt", hex: "#0047AB" }],
  heritage: [{ name: "ochre", hex: "#CC7722" }],
};

const candidate = () => ({
  version: "1",
  minerals: [
    {
      name: "cobalt",
      role: "Knowledge",
      family: "deep-earth",
      hex: "#0047AB",
      textLight: "#002966",
      sortOrder: 0,
    },
  ],
  heritage: [{ name: "ochre", hex: "#CC7722", textLight: "#7A3E00" }],
});

describe("onlyAdded", () => {
  it("passes when only the listed keys are added, with valid values", () => {
    expect(onlyAdded(baseline, candidate(), ADDED)).toBeNull();
  });

  it("does not change the bodies it is given", () => {
    const c = candidate();
    const before = JSON.stringify(c);
    onlyAdded(baseline, c, ADDED);
    expect(JSON.stringify(c)).toBe(before);
  });

  it("reports a non-object element instead of throwing", () => {
    for (const row of [5, "cobalt", true, null, ["cobalt"]]) {
      const c = { ...candidate(), heritage: [row] };
      expect(() => onlyAdded(baseline, c, ADDED)).not.toThrow();
      expect(onlyAdded(baseline, c, ADDED)).toBe("$.heritage.0: not an object");
    }
  });

  it("reports a missing added key", () => {
    const c = candidate();
    delete (c.minerals[0] as Partial<(typeof c.minerals)[0]>).sortOrder;
    expect(onlyAdded(baseline, c, ADDED)).toBe(
      "$.minerals.0.sortOrder: missing",
    );
  });

  it("rejects null or mistyped values for the added keys", () => {
    const cases: [string, unknown][] = [
      ["textLight", null],
      ["textLight", "002966"],
      ["textLight", "#00296"],
      ["textLight", 2966],
      ["sortOrder", "0"],
      ["sortOrder", 1.5],
      ["sortOrder", -1],
      ["sortOrder", null],
      ["role", ""],
      ["role", null],
      ["family", "mineral"],
    ];
    for (const [k, v] of cases) {
      const c = candidate();
      (c.minerals[0] as Record<string, unknown>)[k] = v;
      const got = onlyAdded(baseline, c, ADDED);
      expect(got?.startsWith(`$.minerals.0.${k}: `)).toBe(true);
      expect(got).toContain(" is not ");
    }
  });

  it("still catches a change to a field served before", () => {
    const c = candidate();
    c.minerals[0]!.hex = "#000000";
    expect(onlyAdded(baseline, c, ADDED)).toMatch(/^\$\.minerals\.0\.hex: /);
  });

  it("still catches a key that is added but not listed", () => {
    const c = candidate();
    (c.heritage[0] as Record<string, unknown>).textDark = "#FFB366";
    expect(onlyAdded(baseline, c, ADDED)).toMatch(
      /^\$\.heritage\.0\.textDark: /,
    );
  });

  it("reports bodies that are not JSON objects with the listed arrays", () => {
    expect(onlyAdded(undefined, candidate(), ADDED)).toBe("body is not JSON");
    expect(onlyAdded(baseline, [1], ADDED)).toBe("$: not an object");
    expect(onlyAdded(baseline, { ...candidate(), heritage: {} }, ADDED)).toBe(
      "$.heritage: not an array",
    );
  });

  it("names an unknown value check rather than passing it", () => {
    const spec = { heritage: { textLight: "colour" } } as unknown as AddedSpec;
    expect(onlyAdded(baseline, candidate(), spec)).toBe(
      'added.heritage.textLight: unknown value check "colour"',
    );
  });

  it("treats Object.prototype names as unknown checks, without throwing", () => {
    for (const name of [
      "constructor",
      "valueOf",
      "toString",
      "hasOwnProperty",
      "__proto__",
    ]) {
      const spec = { heritage: { textLight: name } } as unknown as AddedSpec;
      expect(() => onlyAdded(baseline, candidate(), spec)).not.toThrow();
      expect(onlyAdded(baseline, candidate(), spec)).toBe(
        `added.heritage.textLight: unknown value check ${JSON.stringify(name)}`,
      );
    }
  });

  it("reports a typo in the spec even when the array is empty", () => {
    const spec = { heritage: { textLight: "hexx" } } as unknown as AddedSpec;
    const empty = { ...candidate(), heritage: [] };
    expect(onlyAdded({ ...baseline, heritage: [] }, empty, spec)).toBe(
      'added.heritage.textLight: unknown value check "hexx"',
    );
  });
});

describe("checkAddedSpec", () => {
  it("accepts a well-formed spec and rejects malformed ones", () => {
    expect(checkAddedSpec(ADDED)).toBeNull();
    expect(checkAddedSpec(null)).toBe("added: not an object");
    expect(checkAddedSpec(["minerals"])).toBe("added: not an object");
    expect(checkAddedSpec({ minerals: ["textLight"] })).toBe(
      "added.minerals: not an object",
    );
    expect(checkAddedSpec({ minerals: { textLight: 7 } })).toBe(
      "added.minerals.textLight: unknown value check 7",
    );
  });
});

describe("normaliseBody", () => {
  it("blanks /health's timestamp", () => {
    expect(
      normaliseBody("/v1/health", 200, '{"status":"ok","timestamp":"t1"}'),
    ).toBe('{"status":"ok","timestamp":"<timestamp>"}');
  });

  it("returns a 200 /health body that is not a JSON object unchanged", () => {
    for (const text of ["<html>oops</html>", "", "[1]", "null", "5"]) {
      expect(() => normaliseBody("/v1/health", 200, text)).not.toThrow();
      expect(normaliseBody("/v1/health", 200, text)).toBe(text);
    }
  });

  it("blanks security.txt's Expires", () => {
    expect(
      normaliseBody("/.well-known/security.txt", 200, "A\nExpires: x\nB"),
    ).toBe("A\nExpires: <expires>\nB");
  });
});

describe("compareBodies", () => {
  afterEach(() => vi.restoreAllMocks());
  const json = "application/json";
  const expected = { added: ADDED };

  it("never parses identical bodies", () => {
    const parse = vi.spyOn(JSON, "parse");
    expect(compareBodies('{"a":1}', '{"a":1}', json)).toBeNull();
    expect(parse).not.toHaveBeenCalled();
  });

  it("parses each differing body once", () => {
    const parse = vi.spyOn(JSON, "parse");
    compareBodies(
      JSON.stringify(baseline),
      JSON.stringify(candidate()),
      json,
      expected,
    );
    expect(parse).toHaveBeenCalledTimes(2);
  });

  it("ignores a serialisation-only difference for JSON content", () => {
    expect(compareBodies('{"a":1}', '{ "a": 1 }', json)).toBeNull();
    expect(compareBodies('{"a":1}', '{ "a": 1 }', "text/plain")).toEqual({
      kind: "body",
      diff: "body differs (serialisation)",
    });
  });

  it("excuses only the listed additions", () => {
    expect(
      compareBodies(
        JSON.stringify(baseline),
        JSON.stringify(candidate()),
        json,
        expected,
      )?.kind,
    ).toBe("body:added");
    const c = candidate();
    c.minerals[0]!.hex = "#000000";
    const got = compareBodies(
      JSON.stringify(baseline),
      JSON.stringify(c),
      json,
      expected,
    );
    expect(got?.kind).toBe("body");
    expect(got?.diff).toContain("(beyond the added keys: $.minerals.0.hex: ");
  });

  it("reports non-JSON bodies by size, without throwing", () => {
    expect(compareBodies("<a>", "<bb>", "text/html")).toEqual({
      kind: "body",
      diff: "body differs (3 vs 4 bytes)",
    });
  });
});

describe("parseJson, firstDiff, isRecord and VALUE_CHECKS", () => {
  it("parseJson returns undefined for text that is not JSON", () => {
    expect(parseJson("<html>")).toBeUndefined();
    expect(parseJson('{"a":1}')).toEqual({ a: 1 });
  });

  it("firstDiff finds key-order and value differences", () => {
    expect(firstDiff({ a: 1, b: 2 }, { a: 1, b: 2 })).toBeNull();
    expect(firstDiff({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(
      "$: key order differs",
    );
    expect(firstDiff({ a: [1, 2] }, { a: [1, 3] })).toMatch(/^\$\.a\.1: /);
  });

  it("firstDiff counts only own keys for key order", () => {
    // `toString` is on b's prototype, not on b: a missing key, not key order.
    expect(firstDiff({ x: 1, toString: "t" }, { x: 1 })).toBe(
      '$.toString: "t" ≠ undefined',
    );
  });

  it("isRecord is true only for plain JSON objects", () => {
    expect(isRecord({})).toBe(true);
    for (const v of [null, [], 1, "s", true, undefined])
      expect(isRecord(v)).toBe(false);
  });

  it("hex accepts #RRGGBB only", () => {
    expect(VALUE_CHECKS.hex("#B3E5FC")).toBe(true);
    expect(VALUE_CHECKS.hex("#b3e5fc")).toBe(true);
    expect(VALUE_CHECKS.hex("#B3E5FC80")).toBe(false);
    expect(VALUE_CHECKS.hex("#FFF")).toBe(false);
  });
});
