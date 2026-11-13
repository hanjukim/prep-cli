import { describe, expect, test } from "bun:test";

import { nextSteps } from "../src/next.ts";
import type {
  ArtifactStatus,
  HandoffResult,
  HarnessPresence,
  NextStep,
  NextStepId,
  SetupOutcome,
} from "../src/types.ts";

const ROOT = "/project";
const AGENTS_MD = "/project/AGENTS.md";

const CLAUDE_COMMAND = "claude '/setup-matt-pocock-skills'";
const CODEX_COMMAND = "codex '$setup-matt-pocock-skills'";

const OWED: HandoffResult[] = [
  { id: "language", status: "missing", path: null },
  { id: "issue-tracker", status: "ready", path: "docs/agents/issue-tracker.md" },
  { id: "domain-docs", status: "ready", path: "docs/agents/domain.md" },
];

const SETTLED: HandoffResult[] = OWED.map((result) =>
  result.id === "language" ? { ...result, status: "ready", path: "CLAUDE.md" } : result,
);

/**
 * A run that found exactly these harnesses on the machine.
 *
 * The footer reads them off the outcome rather than off PATH, so this is the
 * whole machine as far as these tests are concerned.
 */
function holding(...ids: readonly string[]): HarnessPresence[] {
  return (["claude-code", "codex"] as const).map((id) => ({
    id,
    installed: ids.includes(id),
  }));
}

const BOTH = holding("claude-code", "codex");
const NEITHER = holding();

function outcome(
  status: ArtifactStatus,
  handoff: HandoffResult[] = SETTLED,
  harnesses: HarnessPresence[] = BOTH,
): SetupOutcome {
  return {
    root: ROOT,
    detected: ["node"],
    artifacts: [{ kind: "agents-md", path: AGENTS_MD, status, contents: null }],
    harnesses,
    plugins: [],
    handoff,
    next: [],
  };
}

/** The ids suggested, in order, for a run that found these harnesses. */
function ids(source: SetupOutcome, harnesses: HarnessPresence[] = BOTH): NextStepId[] {
  return nextSteps({ ...source, harnesses }).map((step) => step.id);
}

/** The one step of a kind, or undefined when it was not suggested. */
function step(
  source: SetupOutcome,
  id: NextStepId,
  harnesses: HarnessPresence[] = BOTH,
): NextStep | undefined {
  return nextSteps({ ...source, harnesses }).find((found) => found.id === id);
}

describe("what to run next", () => {
  test("with nothing owed the harness is not mentioned", () => {
    expect(ids(outcome("applied"))).not.toContain("harness");
    expect(ids(outcome("applied"), NEITHER)).not.toContain("install-harness");
  });

  test("a run that wrote something offers the machine check", () => {
    expect(ids(outcome("applied"))).toEqual(["chef"]);
  });

  test("a run that wrote nothing offers it too — what is owed does not depend on this run", () => {
    expect(ids(outcome("skipped"))).toEqual(["chef"]);
    expect(ids(outcome("planned"))).toEqual(["chef"]);
  });

  test("a run with nothing project-side to do still points at the machine", () => {
    expect(nextSteps(outcome("skipped"))).toEqual([
      { id: "chef", command: "prep chef", alternative: null },
    ]);
  });

  test("the order is the harness, then the machine", () => {
    expect(ids(outcome("applied", OWED))).toEqual(["harness", "chef"]);
  });

  test("no step sends anybody back to prep setup — the run asks nothing and leaves nothing open", () => {
    for (const status of ["applied", "planned", "skipped"] as const) {
      for (const step of nextSteps(outcome(status, OWED))) {
        expect(step.command).not.toContain("prep setup");
      }
    }
  });
});

describe("the command that hands the project over", () => {
  const owing = outcome("applied", OWED);

  test("what is owed comes back as a command for a harness this machine holds", () => {
    expect(step(owing, "harness", holding("claude-code"))).toEqual({
      id: "harness",
      command: CLAUDE_COMMAND,
      alternative: null,
    });
  });

  test("the harness that is there is the one named, whichever it is", () => {
    expect(step(owing, "harness", holding("codex"))).toEqual({
      id: "harness",
      command: CODEX_COMMAND,
      alternative: null,
    });
  });

  test("with both installed one is suggested and the other stands as the alternative", () => {
    expect(step(owing, "harness", BOTH)).toEqual({
      id: "harness",
      command: CLAUDE_COMMAND,
      alternative: CODEX_COMMAND,
    });
  });

  test("with no harness at all the person is sent to install one instead", () => {
    // There is no point pasting a command for a binary that is not there. The
    // machine check is where a missing harness gets offered and installed.
    expect(step(owing, "install-harness", NEITHER)).toEqual({
      id: "install-harness",
      command: "prep chef",
      alternative: null,
    });
    expect(ids(owing, NEITHER)).not.toContain("harness");
  });

  test("being sent to the machine check does not put the same command twice", () => {
    // The chef step would be the same command under a second reason, so the
    // install step absorbs it.
    expect(ids(owing, NEITHER)).toEqual(["install-harness"]);
  });

  test("a run that wrote nothing names the harness too — what is owed was read either way", () => {
    expect(ids(outcome("planned", OWED), holding("claude-code"))).toEqual([
      "harness",
      "chef",
    ]);
  });
});
