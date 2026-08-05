import { describe, expect, test } from "bun:test";

import { missingPrerequisites, rows } from "../src/gaps.ts";
import { checkAll } from "../src/probe.ts";
import { all } from "../src/registry.ts";
import type { Platform, Row, WhichFn } from "../src/types.ts";

function fakeWhich(found: Record<string, string>): WhichFn {
  return (binary) => found[binary] ?? null;
}

function read(platform: Platform, found: Record<string, string>): Row[] {
  const specs = all();
  return rows(specs, checkAll(specs, platform, fakeWhich(found)));
}

const BREW = { brew: "/opt/homebrew/bin/brew" };

const ids = (list: readonly Row[]): string[] => list.map((row) => row.spec.id);

describe("rows", () => {
  test("pairs every result with the entry it came from", () => {
    const specs = all();
    const paired = rows(specs, checkAll(specs, "darwin", fakeWhich({})));
    expect(paired.length).toBe(specs.length);
    for (const row of paired) expect(row.spec.id).toBe(row.result.id);
  });

  test("keeps the order the results arrive in", () => {
    const specs = all();
    expect(ids(rows(specs, checkAll(specs, "darwin", fakeWhich({}))))).toEqual(
      specs.map((spec) => spec.id),
    );
  });

  test("drops a result no entry accounts for", () => {
    const specs = all();
    const stray = {
      id: "nothing",
      status: "missing" as const,
      binary: null,
      path: null,
      renamed: null,
      guidance: null,
    };
    expect(ids(rows(specs, [stray]))).toEqual([]);
  });
});

describe("missingPrerequisites", () => {
  test("names the manager this platform wants and does not have", () => {
    expect(ids(missingPrerequisites(read("darwin", {})))).toEqual(["homebrew"]);
    expect(ids(missingPrerequisites(read("linux", {})))).toEqual(["apt"]);
  });

  test("says nothing once the manager is there", () => {
    expect(missingPrerequisites(read("darwin", BREW))).toEqual([]);
  });

  test("another platform's manager is not missing, it is not asked about", () => {
    // apt has no darwin entry at all, so it reports unsupported rather than missing.
    expect(ids(missingPrerequisites(read("darwin", BREW)))).toEqual([]);
  });
});
