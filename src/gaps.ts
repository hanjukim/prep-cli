import type { CheckResult, Row, ToolSpec } from "./types.ts";

/**
 * What the report reads off a chef run.
 *
 * Two answers: which entry is which, and whether a missing package manager has
 * made every install command untrustworthy. Both are selections over the
 * results, held apart from the wording that renders them.
 */

/** Pairs each result with the entry it came from, dropping anything unpaired. */
export function rows(specs: readonly ToolSpec[], results: readonly CheckResult[]): Row[] {
  const byId = new Map(specs.map((spec) => [spec.id, spec]));

  return results.flatMap((result) => {
    const spec = byId.get(result.id);
    return spec === undefined ? [] : [{ spec, result }];
  });
}

/**
 * The package managers that are not there.
 *
 * Another OS's manager is not this machine's concern, so an unsupported one is
 * not missing — it is simply not part of the question.
 */
export function missingPrerequisites(rows: readonly Row[]): Row[] {
  return rows.filter((row) => row.spec.tier === "prerequisite" && row.result.status === "missing");
}
