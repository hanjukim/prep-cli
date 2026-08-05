import { harnesses } from "./registry.ts";
import type {
  Artifact,
  HandoffResult,
  HarnessPresence,
  MergePlan,
  NextStep,
  SettingsArtifact,
  SetupOutcome,
} from "./types.ts";

/**
 * What to run after setup has had its say.
 *
 * The report already tells a person what happened. This tells them what to do
 * with it, in the same intervention level doctor holds to: a verified command,
 * shown, never run (docs/adr/0002). prep executes none of these.
 *
 * Each step is here because something in the outcome asked for it, so a run
 * with nothing left to do suggests nothing at all — a footer that always says
 * the same three things stops being read after the second run.
 */

/**
 * Whether a file is still waiting on a person before it can land.
 *
 * Only a merge waits. A file prep writes where none existed takes nothing away
 * from anybody, so there is no question to hold it up.
 *
 * Exported because two callers ask it of the same artifact and must not drift:
 * the approval loop, which asks so it can put the question, and this module,
 * which asks so it can say the question is still open.
 */
export function awaitsApproval(
  artifact: Artifact,
): artifact is SettingsArtifact & { plan: MergePlan } {
  return (
    artifact.kind === "claude-settings" && artifact.status === "planned" && artifact.plan !== null
  );
}

/** Whether the run put anything on disk. */
function wrote(artifact: Artifact): boolean {
  return artifact.status === "applied" || artifact.status === "merged";
}

function owed(handoff: readonly HandoffResult[]): boolean {
  return handoff.some((result) => result.status !== "ready");
}

/** The machine check, which is also where a missing harness is offered and installed. */
const DOCTOR = "prep doctor";

/**
 * What to run to get the guidance written, read off the run's own harness rows.
 *
 * A command is only worth pasting if the binary it starts is there, so the
 * suggestion is limited to the harnesses this machine holds. Those were already
 * read once, when the run decided which files to write — reading PATH a second
 * time here would let the footer and the file list disagree about the same
 * machine.
 *
 * With both installed prep names the first and keeps the second as the
 * alternative: which harness somebody works in is not prep's to decide, and
 * printing two commands as though they were two steps would read as an
 * instruction to run both.
 *
 * With none installed there is nothing to paste, so the step becomes getting a
 * harness — which is doctor's scope, and doctor names what closes the gap
 * without closing it (docs/adr/0010).
 */
function harnessStep(present: readonly HarnessPresence[]): NextStep {
  const installed = new Set(present.filter((row) => row.installed).map((row) => row.id));

  // Registry order, not outcome order: the table decides which harness is named
  // first, the same as it decides the order doctor reports them in.
  const [first, second] = harnesses()
    .filter((spec) => installed.has(spec.id))
    .map((spec) => spec.handoffCommand);

  if (first === undefined) {
    return { id: "install-harness", command: DOCTOR, alternative: null };
  }

  return { id: "harness", command: first, alternative: second ?? null };
}

/**
 * Reads the steps off the outcome, in the order they are worth doing.
 *
 * Approval first: it is the only one that finishes work this run started and
 * left unfinished. The harness comes next, since it is what the project is
 * missing. The machine check comes last — it is a different scope, and it is
 * offered only to somebody who just set a project up.
 *
 * Everything it needs is on the outcome, so the whole footer is decided without
 * touching the machine — the run read it once already.
 */
export function nextSteps(outcome: SetupOutcome, dryRun: boolean): NextStep[] {
  const steps: NextStep[] = [];

  // A plan nobody approved is not an observation to sit on. It is the same run,
  // stopped one question short, and the question needs a terminal.
  if (outcome.artifacts.some(awaitsApproval)) {
    steps.push({ id: "approve", command: `prep setup ${outcome.root}`, alternative: null });
  }

  if (owed(outcome.handoff)) steps.push(harnessStep(outcome.harnesses));

  // Only for a run that actually settled the project. A dry run settled
  // nothing, and pointing at the machine before the project is written puts the
  // two scopes in the wrong order.
  //
  // A run already sent to doctor for a harness is not sent there twice. The
  // second line would carry a different reason for the same command, and a
  // footer that repeats itself is the thing this block exists to avoid.
  const sent = steps.some((step) => step.command === DOCTOR);
  if (!dryRun && !sent && outcome.artifacts.some(wrote)) {
    steps.push({ id: "doctor", command: DOCTOR, alternative: null });
  }

  return steps;
}
