import type { CheckFn, PassResult, PassSpec, PassStatus } from "./types.ts";

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

/** The default checker, at the real ceiling. doctor uses it when tests inject nothing. */
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
 * Asks every pass item this machine should be asked about, in table order.
 *
 * A row gated on a harness is skipped when the machine does not hold that
 * harness — a login question for a tool nobody installed has no useful answer.
 * Which harnesses are here comes from the caller, off the same check doctor
 * already ran, so this module never reads PATH itself.
 *
 * The statuses are decided in evidence order: any "no" is a missing item even
 * when another check gave no answer, because one unset half already refuses
 * every commit; only unanswered checks alone make an item unknown.
 */
export async function runPass(
  specs: readonly PassSpec[],
  installedHarnesses: ReadonlySet<string>,
  check: CheckFn,
): Promise<PassResult[]> {
  const asked = specs.filter(
    (spec) => spec.harness === undefined || installedHarnesses.has(spec.harness),
  );

  const results: PassResult[] = [];
  for (const spec of asked) {
    const answers: (boolean | null)[] = [];
    for (const argv of spec.checks) answers.push(await check(argv));

    const status: PassStatus = answers.includes(false)
      ? "missing"
      : answers.includes(null)
        ? "unknown"
        : "ready";

    results.push({
      id: spec.id,
      status,
      checks: spec.checks.map((argv) => argv.join(" ")),
      guidance: spec.guidance,
    });
  }

  return results;
}
