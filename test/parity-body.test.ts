/**
 * Offline checks of parity's body comparison (scripts/parity-body.mjs): the
 * `added` check that lets an EXPECTED entry excuse only named new keys.
 */
import { describe, expect, it } from "vite-plus/test";
import {
  firstDiff,
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
      expect(onlyAdded(baseline, c, ADDED)).toMatch(
        new RegExp(`^\\$\\.minerals\\.0\\.${k}: .* is not `),
      );
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
    expect(onlyAdded(baseline, candidate(), spec)).toMatch(
      /unknown value check "colour"/,
    );
  });
});

describe("parseJson, firstDiff and VALUE_CHECKS", () => {
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

  it("hex accepts #RRGGBB only", () => {
    expect(VALUE_CHECKS.hex("#B3E5FC")).toBe(true);
    expect(VALUE_CHECKS.hex("#b3e5fc")).toBe(true);
    expect(VALUE_CHECKS.hex("#B3E5FC80")).toBe(false);
    expect(VALUE_CHECKS.hex("#FFF")).toBe(false);
  });
});
