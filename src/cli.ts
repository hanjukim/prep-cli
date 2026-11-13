#!/usr/bin/env bun

import { HandoffError, checkHandoff } from "./handoff.ts";
import { runPass, spawnCheck, withProgress } from "./pass.ts";
import { UnsupportedPlatformError, detectPlatform } from "./platform.ts";
import { bunWhich, checkAll } from "./probe.ts";
import { all, passItems } from "./registry.ts";
import { renderHuman } from "./report/human.ts";
import { renderJson } from "./report/json.ts";
import { renderSetupHuman } from "./report/setup-human.ts";
import { renderSetupJson } from "./report/setup-json.ts";
import { SetupError, nodeFs, requireDirectory, setup as runSetup } from "./setup.ts";
import type { CheckFn, ChefProject, SetupFs, SetupOutcome, WhichFn } from "./types.ts";

export type RunDeps = {
  /** A platform string used instead of detection. Lets tests cover macOS and Linux without either machine. */
  platformName?: string;
  /**
   * How the machine is read. chef checks every tool through it; setup asks it
   * for the language server a plugin points at and for the harness that is here.
   */
  which?: WhichFn;
  /**
   * How chef asks the fixed read-only pass checks (docs/adr/0026). Tests
   * replace it the way they replace `which`, so no test starts a real process.
   */
  check?: CheckFn;
  /**
   * Where a slow pass check names itself. Handed in only when a stream is a
   * terminal, so `run` itself never reads process state.
   */
  progress?: (text: string) => void;
  /**
   * File system access. setup writes through it; chef reads the project it is
   * given through it, and reads nothing at all without one.
   *
   * Tests replace it with a fake.
   */
  fs?: SetupFs;
  /** Where the harness's install record lives. Tests replace it, so no real home directory is read. */
  home?: string;
  /**
   * The directory setup falls back to when no path is given. chef has no such
   * fallback — it never guesses which project it is in (docs/adr/0027).
   */
  cwd?: string;
};

export type RunResult = { stdout: string; stderr: string; exitCode: number };

/**
 * Exit codes. 1 is the ordinary observation both subcommands report — gaps for
 * chef, nothing to write for setup — and stays apart from a tool failure.
 */
const EXIT_OK = 0;
const EXIT_OBSERVED = 1;
const EXIT_ERROR = 2;

const USAGE = [
  "Usage: prep chef [path] [--json]",
  "       prep setup [path] [--dry-run] [--json]",
  "",
  "  chef      Check this machine for the prerequisite package manager, the standard tools, and",
  "            the agent CLIs. Every gap is reported with what closes it; prep installs nothing.",
  "            It also asks a few fixed read-only questions — GitHub login, git identity, and a",
  "            login per installed agent CLI — and reports what only you can close.",
  "            Given a path, it reads that project as well: whether the directory is a git",
  "            repository, and what the agent CLI still owes it. With no path it reads the",
  "            machine alone — chef never guesses which project you are in.",
  "  setup     Seed AGENTS.md where no guidance file exists yet, and write the one-line CLAUDE.md",
  "            that points Claude Code at it. An existing file is left exactly as it is.",
  "            The project type's language server plugin is named, with the command that installs",
  "            it or turns it on. prep writes no permission or settings file and asks no question.",
  "",
  "  --json      Print the report as is, instead of the human wording.",
  "  --dry-run   setup only. Show what would be written without writing it.",
  "",
  "Exit codes: 0 done · 1 chef found gaps, or setup wrote nothing · 2 tool error",
].join("\n");

function usage(): RunResult {
  return { stdout: USAGE + "\n", stderr: "", exitCode: EXIT_OK };
}

function fail(reason: string): RunResult {
  return { stdout: "", stderr: `${reason}\n\n${USAGE}\n`, exitCode: EXIT_ERROR };
}

/** Parses arguments and decides the exit code. Touches no process state, so it tests as is. */
export async function run(argv: readonly string[], deps: RunDeps = {}): Promise<RunResult> {
  const commands: string[] = [];
  let json = false;
  let help = false;
  let dryRun = false;

  // Separate flags from subcommands. No order is enforced, so --json may sit anywhere.
  for (const arg of argv) {
    if (arg === "--json") {
      json = true;
    } else if (arg === "--dry-run") {
      dryRun = true;
    } else if (arg === "--help" || arg === "-h") {
      help = true;
    } else if (arg.startsWith("-")) {
      // Silently ignoring an unknown flag makes a typo look like success.
      return fail(`Unknown flag: ${arg}`);
    } else {
      commands.push(arg);
    }
  }

  const [command, ...operands] = commands;

  if (help || command === "help") return usage();

  if (command === undefined) return fail("A subcommand is required.");

  if (command === "chef") {
    // A flag that does nothing here would read as accepted. Say so instead.
    if (dryRun) return fail("--dry-run applies to setup only.");
    if (operands.length > 1) return fail(`chef takes one path at most: ${operands.join(" ")}`);
    return chef(deps, { path: operands[0], json });
  }

  if (command === "setup") {
    if (operands.length > 1) return fail(`setup takes one path at most: ${operands.join(" ")}`);
    return setup(deps, { path: operands[0], dryRun, json });
  }

  return fail(`Unknown subcommand: ${command}`);
}

type ChefOptions = { path?: string; json: boolean };

async function chef(deps: RunDeps, options: ChefOptions): Promise<RunResult> {
  let platform;
  try {
    platform = detectPlatform(deps.platformName ?? process.platform);
  } catch (error) {
    if (error instanceof UnsupportedPlatformError) {
      // Even under --json, errors go to stderr as plain text. Keeping the shape on
      // stdout to the single { platform, results } spares consumers from branching.
      // The failure already shows up as exit code 2.
      return { stdout: "", stderr: `${error.message}\n`, exitCode: EXIT_ERROR };
    }
    throw error;
  }

  const fs = deps.fs ?? nodeFs;

  // Read before anything is asked of the machine, and only where a path was
  // given: a mistyped path should be answered at once rather than after five
  // seconds of network checks. With no path nothing here runs, so chef opens
  // no directory it was not handed (docs/adr/0027).
  let project: ChefProject | null = null;
  if (options.path !== undefined) {
    try {
      requireDirectory(options.path, fs);
      project = { root: options.path, handoff: checkHandoff(options.path, fs) };
    } catch (error) {
      // Two tool errors, and both are the run failing rather than the project
      // owing something. A path that is not a directory is a typo, and a file
      // that is there and cannot be read is no judgement at all — reporting
      // either as "missing" would put a reason on the screen that is not true.
      // Plain text on stderr even under --json, the same as every other error.
      if (error instanceof SetupError || error instanceof HandoffError) {
        return { stdout: "", stderr: `${error.message}\n`, exitCode: EXIT_ERROR };
      }
      throw error;
    }
  }

  const specs = all();
  const which = deps.which ?? bunWhich;
  // A read on every path, and beyond the PATH reads only the fixed pass checks
  // below (docs/adr/0010, narrowed by docs/adr/0026). chef asks no question,
  // so there is no interactive branch: a run reading from a pipe and a run at a
  // terminal do the same work.
  const results = checkAll(specs, platform, which);

  // The pass rows for a harness are asked only where the harness is, read off
  // the check that just ran rather than a second walk over PATH.
  const installedHarnesses = new Set(
    results.filter((result) => result.status === "installed").map((result) => result.id),
  );

  // Progress only where somebody is watching — `progress` arrives only then —
  // and never under --json, which the bootstrap script reads through a pipe.
  const check = deps.check ?? spawnCheck;
  const ask = !options.json && deps.progress ? withProgress(check, deps.progress) : check;
  // One table, both scopes, in the order somebody walks them. The project rows
  // are dropped where there is no project, so a run with no argument reports
  // exactly the machine rows it reported before.
  const pass = await runPass(
    passItems(),
    installedHarnesses,
    ask,
    project && { root: project.root, fs },
  );

  const stdout = options.json
    ? renderJson({ platform, results, pass, project: project ?? undefined })
    : renderHuman({
        platform,
        specs,
        results,
        passSpecs: passItems(),
        pass,
        project: project ?? undefined,
      });

  // Gaps alone decide the code. A pass item is a legitimate state that can last
  // for years — an account nobody opened is not a broken machine, a directory
  // nobody made a repository is not a broken project, and a handoff still owed
  // is not a failed run.
  const hasGaps = results.some((result) => result.status === "missing");

  return { stdout, stderr: "", exitCode: hasGaps ? EXIT_OBSERVED : EXIT_OK };
}

type SetupOptions = { path?: string; dryRun: boolean; json: boolean };

/**
 * What a setup run exits on, read off the files it produced.
 *
 * Writing nothing is a normal observation, not a failure — the same split
 * chef draws between gaps and errors. A dry run is the exception: it was
 * asked for a plan and it produced one, so it succeeded.
 *
 * With several files, one written file is enough for 0: a run that wrote one
 * and found the other already standing did what there was to do.
 */
export function setupExitCode(outcome: SetupOutcome, dryRun: boolean): number {
  const wrote = outcome.artifacts.some((artifact) => artifact.status === "applied");
  const asked = dryRun && outcome.artifacts.some((artifact) => artifact.status === "planned");

  return wrote || asked ? EXIT_OK : EXIT_OBSERVED;
}

function setup(deps: RunDeps, options: SetupOptions): RunResult {
  const root = options.path ?? deps.cwd ?? process.cwd();

  let outcome;
  try {
    outcome = runSetup({
      root,
      dryRun: options.dryRun,
      fs: deps.fs,
      home: deps.home,
      which: deps.which,
    });
  } catch (error) {
    if (error instanceof SetupError) {
      // Errors stay plain text on stderr even under --json, the same as chef.
      // Exit code 2 already carries the failure.
      return { stdout: "", stderr: `${error.message}\n`, exitCode: EXIT_ERROR };
    }
    throw error;
  }

  const stdout = options.json ? renderSetupJson(outcome) : renderSetupHuman({ outcome });

  return { stdout, stderr: "", exitCode: setupExitCode(outcome, options.dryRun) };
}

export async function main(argv: readonly string[] = Bun.argv.slice(2)): Promise<never> {
  let result: RunResult;
  try {
    // Progress rides the bootstrap script's own condition ([ -t 1 ] || [ -t 2 ])
    // and goes to stderr, since stdout is the report.
    const terminal = process.stdout.isTTY === true || process.stderr.isTTY === true;
    result = await run(argv, {
      progress: terminal ? (text) => process.stderr.write(text) : undefined,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`prep: unexpected error — ${message}\n`);
    process.exit(EXIT_ERROR);
  }

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  process.exit(result.exitCode);
}

if (import.meta.main) await main();
