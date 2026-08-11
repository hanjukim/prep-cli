import { join } from "node:path";

import type {
  CheckFn,
  PassResult,
  PassSpec,
  PassStatus,
  ProjectPassSpec,
  SetupFs,
} from "./types.ts";

/**
 * The pass runner: asks the registry's fixed read-only questions and reports
 * who has to act on each answer — always the person, never a script.
 *
 * This is the one module in prep that starts a process, and the narrowing of
 * "prep starts no process on any path" is argued in docs/adr/0026: no file
 * answers a login question honestly, and the token files that would come close
 * are exactly the paths prep's own presets deny. Every spawn here takes a fixed
 * argv from the registry, runs without a shell, and has its output thrown away
 * unread — an account name printed by `gh auth status` never exists in this
 * process as data.
 *
 * A project row asks nothing of the machine and starts nothing at all: it reads
 * one path through the injected file system, the same boundary setup writes
 * through (docs/adr/0027). So the module's spawn story is unchanged — what
 * widened is which questions it answers, not what it is allowed to run.
 */

/**
 * The ceiling on one check. `gh auth status` asks GitHub to validate the token,
 * so offline it waits — this is what turns that wait into an `unknown` instead
 * of a hung report.
 */
export const CHECK_TIMEOUT_MS = 5000;

/**
 * How long a check runs before the terminal is told about it. Under the delay
 * nothing is shown at all, so the warm-machine run never flickers.
 */
export const PROGRESS_DELAY_MS = 400;

/**
 * A checker that really spawns, with the timeout applied.
 *
 * The timeout is a parameter so the timeout path is testable with a short one;
 * `spawnCheck` below is this at the real ceiling. Output streams are ignored at
 * the spawn itself — not read and discarded, never opened — which is what keeps
 * the "no identity is reported" promise structural.
 */
export function spawnChecker(timeoutMs: number = CHECK_TIMEOUT_MS): CheckFn {
  return async (argv) => {
    let child: ReturnType<typeof Bun.spawn>;
    try {
      child = Bun.spawn([...argv], { stdin: "ignore", stdout: "ignore", stderr: "ignore" });
    } catch {
      // The binary is not here to ask. That is not a "no" — it is no answer.
      return null;
    }

    // SIGKILL, not SIGTERM: a status check owes no cleanup, and a check that
    // catches SIGTERM mid-network-call would hold the report past the ceiling
    // the timeout exists to guarantee.
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    await child.exited;
    clearTimeout(timer);

    // A killed check answered nothing. Reading its exit code as "no" would
    // report a slow network as a missing login.
    if (child.signalCode !== null) return null;
    return child.exitCode === 0;
  };
}

/** The default checker, at the real ceiling. chef uses it when tests inject nothing. */
export const spawnCheck: CheckFn = spawnChecker();

/**
 * Wraps a checker so a slow check names itself on the terminal.
 *
 * The caller decides whether a terminal is there at all — this only decides
 * when: past the delay the check's own command is written, and cleared once the
 * answer is in, so a fast check never appears.
 */
export function withProgress(
  check: CheckFn,
  write: (text: string) => void,
  delayMs: number = PROGRESS_DELAY_MS,
): CheckFn {
  return async (argv) => {
    let shown = false;
    const timer = setTimeout(() => {
      shown = true;
      write(`… asking ${argv.join(" ")}`);
    }, delayMs);

    try {
      return await check(argv);
    } finally {
      clearTimeout(timer);
      if (shown) write("\r\u001b[2K");
    }
  };
}

/**
 * The project a run was given, and how to read it.
 *
 * Absent rather than empty when chef was given no path, because the two say
 * different things: no project means the project rows were never asked, and a
 * project whose rows all came back missing is an answer.
 */
export type PassProject = { root: string; fs: SetupFs };

/**
 * Answers one project row: the marker is there, or it is not.
 *
 * `exists` and not `isDirectory`, because a `.git` file is what a worktree and a
 * submodule carry, and both of those are repositories. There is no `unknown`
 * here — a path does not time out, and nothing was asked as a command, so the
 * row hands back no command either.
 */
function readProjectItem(spec: ProjectPassSpec, project: PassProject): PassResult {
  const there = project.fs.exists(join(project.root, spec.marker));
  return {
    id: spec.id,
    status: there ? "ready" : "missing",
    checks: [],
    guidance: spec.guidance,
  };
}

/** Answers one machine row by asking every check it carries. */
async function askMachineItem(
  spec: Extract<PassSpec, { scope: "machine" }>,
  check: CheckFn,
): Promise<PassResult> {
  const answers: (boolean | null)[] = [];
  for (const argv of spec.checks) answers.push(await check(argv));

  // Evidence order: any "no" is a missing item even when another check gave no
  // answer, because one unset half already refuses every commit; only unanswered
  // checks alone make an item unknown.
  const status: PassStatus = answers.includes(false)
    ? "missing"
    : answers.includes(null)
      ? "unknown"
      : "ready";

  return {
    id: spec.id,
    status,
    checks: spec.checks.map((argv) => argv.join(" ")),
    guidance: spec.guidance,
  };
}

/**
 * Asks every pass item this run should be asked about, in table order.
 *
 * Two things take a row off the table, one per scope. A row gated on a harness is
 * skipped when the machine does not hold that harness — a login question for a
 * tool nobody installed has no useful answer. A project row is skipped when there
 * is no project, which is every run of `prep chef` with no argument: chef
 * does not guess which project it is in (docs/adr/0027).
 *
 * Which harnesses are here comes from the caller, off the same check chef
 * already ran, so this module never reads PATH itself.
 */
export async function runPass(
  specs: readonly PassSpec[],
  installedHarnesses: ReadonlySet<string>,
  check: CheckFn,
  project: PassProject | null = null,
): Promise<PassResult[]> {
  const results: PassResult[] = [];

  for (const spec of specs) {
    if (spec.scope === "project") {
      if (project !== null) results.push(readProjectItem(spec, project));
      continue;
    }

    if (spec.harness !== undefined && !installedHarnesses.has(spec.harness)) continue;
    results.push(await askMachineItem(spec, check));
  }

  return results;
}
