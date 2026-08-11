import type { HandoffItemId, HandoffResult } from "../types.ts";
import { INDENT, join, pad, widest } from "./layout.ts";

/**
 * The handoff rows, shared by the two reports that print them.
 *
 * `checkHandoff` is one reader, so setup and chef cannot disagree about what an
 * item's status is (docs/adr/0027). These rows are what keeps them from
 * disagreeing about the wording either — one sentence per item, in one place.
 *
 * What is not here is the framing around them. setup says what it has just
 * written and what is still owed; chef says what this project owes. Both are
 * honest, they differ, and each report keeps its own.
 */

/**
 * How each owed item is worded. The check reports a status and a path; the
 * sentence that goes with them lives here, so no wording reaches the outcome
 * and none of it can leak into the JSON contract.
 */
const HANDOFF: Record<
  HandoffItemId,
  { title: string; missing: string; empty: (path: string) => string }
> = {
  language: {
    title: "language",
    missing: "no AGENTS.md and no CLAUDE.md",
    empty: (path) => `${path} has no Language section`,
  },
  "issue-tracker": {
    title: "issue tracker",
    missing: "no docs/agents/issue-tracker.md",
    empty: (path) => `${path} names no tracker`,
  },
  "domain-docs": {
    title: "domain docs",
    missing: "no docs/agents/domain.md",
    empty: (path) => `${path} is empty`,
  },
};

/** What one item's line says on the right. A path when it is settled, what is wrong when it is not. */
function owedNote(result: HandoffResult): string {
  const wording = HANDOFF[result.id];
  if (result.path === null) return wording.missing;
  return result.status === "ready" ? result.path : wording.empty(result.path);
}

/** One indented row per item, in the order they arrive. */
export function handoffRows(results: readonly HandoffResult[]): string[] {
  const width = widest(results.map((result) => HANDOFF[result.id].title));

  return results.map((result) => {
    const mark = result.status === "ready" ? "✓" : "✗";
    return INDENT + join(`${mark} ${pad(HANDOFF[result.id].title, width)}`, owedNote(result));
  });
}
