// Types for scripts/parity-body.mjs, so test/parity-body.test.ts type-checks.

export type ValueCheck = "hex" | "nonEmptyString" | "index" | "mineralFamily";

/** `{ "<top-level array>": { "<added key>": "<value check>" } }` */
export type AddedSpec = Record<string, Record<string, ValueCheck>>;

export const VALUE_CHECKS: Record<ValueCheck, (v: unknown) => boolean>;

export function parseJson(text: string): unknown;

export function isRecord(v: unknown): v is Record<string, unknown>;

export function checkAddedSpec(added: unknown): string | null;

export function firstDiff(a: unknown, b: unknown, at?: string): string | null;

export function onlyAdded(
  baseline: unknown,
  candidate: unknown,
  added: AddedSpec,
): string | null;

export function normaliseBody(
  path: string,
  status: number,
  text: string,
): string;

export function compareBodies(
  lb: string,
  cb: string,
  contentType: string | null | undefined,
  expected?: { added?: AddedSpec },
): { kind: "body" | "body:added"; diff: string } | null;
