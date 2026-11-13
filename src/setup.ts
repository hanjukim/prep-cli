import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname } from "node:path/posix";

import { HandoffError, checkHandoff } from "./handoff.ts";
import { nextSteps } from "./next.ts";
import {
  PluginsError,
  detectTypes,
  readEnabledPlugins,
  readInstalledPlugins,
  recommend,
} from "./plugins.ts";
import { bunWhich } from "./probe.ts";
import { harnesses } from "./registry.ts";
import { SeedError, pointerArtifact, seedArtifact } from "./seed.ts";
import type {
  Artifact,
  HarnessPresence,
  InstalledPlugin,
  ProjectType,
  SetupFs,
  SetupOutcome,
  WhichFn,
} from "./types.ts";

/**
 * The only place that touches the file system.
 *
 * Same boundary probe.ts holds over the shell: every read and every write goes
 * through an injected `SetupFs`, so the whole decision path is verifiable
 * without a real directory.
 */
export const nodeFs: SetupFs = {
  exists: (path) => existsSync(path),
  isDirectory: (path) => existsSync(path) && statSync(path).isDirectory(),
  read: (path) => readFileSync(path, "utf8"),
  write: (path, contents) => {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, contents);
  },
};

/** A tool error: the run could not be carried out. Separate from a legitimate no-op. */
export class SetupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SetupError";
  }
}

/**
 * Refuses a path that is not a directory.
 *
 * A path that is missing, or is a file, is a tool error. Reporting it as
 * "nothing to do" would hide a typo behind a legitimate-looking no-op. Both
 * subcommands take a project path, so both come through here and a mistyped one
 * gets the same sentence whichever was asked (docs/adr/0027).
 */
export function requireDirectory(root: string, fs: SetupFs): void {
  if (!fs.isDirectory(root)) throw new SetupError(`Not a project directory: ${root}`);
}

export type SetupInput = {
  /** The project directory. */
  root: string;
  /** Show the plan without writing. */
  dryRun?: boolean;
  fs?: SetupFs;
  /** Where the harness's install record lives. Injected so no test reads a real home directory. */
  home?: string;
  /**
   * How the machine is read for the executables setup names: the language server
   * a plugin points at, and the harness to hand the project to. Nothing here
   * writes or runs — the lookups decide what a recommendation says and which
   * command the footer prints.
   */
  which?: WhichFn;
};

/**
 * Reads what the harness side still owes.
 *
 * A file that is there but cannot be read stops the run. Being owed something
 * is not a failure and never changes the exit code — but a failed read is not a
 * judgement at all, and
 * reporting it as "empty" would put a reason on the screen that is not true.
 */
function readHandoff(root: string, fs: SetupFs) {
  try {
    return checkHandoff(root, fs);
  } catch (error) {
    if (error instanceof HandoffError) throw new SetupError(error.message);
    throw error;
  }
}

/**
 * Reads a file a recommendation is decided from, where anything could come of it.
 *
 * Two files go through here: the harness's install record, and the project's
 * settings file. A project with no recognised type is recommended no plugin, so
 * neither has any bearing on the run and neither is opened at all — a file prep
 * cannot read should not fail a run whose answer would have been the same either
 * way.
 *
 * Where one is read, an unreadable one is a tool error, the same as any file prep
 * decides from.
 */
function whereTyped<T>(detected: readonly ProjectType[], absent: T, read: () => T): T {
  if (detected.length === 0) return absent;

  try {
    return read();
  } catch (error) {
    if (error instanceof PluginsError) throw new SetupError(error.message);
    throw error;
  }
}

/**
 * Runs one artifact's own producer, and turns its failure into a tool error.
 *
 * Every producer fails the same way — a file it had to write did not land — and
 * every one of those is a run prep could not carry out.
 */
function produce<T>(make: () => T): T {
  try {
    return make();
  } catch (error) {
    if (error instanceof SeedError) throw new SetupError(error.message);
    throw error;
  }
}

/**
 * Reads the machine for the harnesses.
 *
 * One `which` per registry entry. Nothing prep writes depends on the answer
 * (docs/adr/0031) — it decides which command the footer offers for handing the
 * project over, and it is read here so the footer never reads PATH itself.
 */
function harnessPresence(which: WhichFn): HarnessPresence[] {
  return harnesses().map((spec) => ({ id: spec.id, installed: which(spec.binary) !== null }));
}

/**
 * Detects the project type, then produces every artifact.
 *
 * Two files, and both are prose: the guidance file, and the one line that sends
 * Claude Code to it. prep writes no permission file for any harness and changes
 * no settings file (docs/adr/0031). The type decides only which plugins are
 * named in the report.
 *
 * Only an unusable path, an unreadable file, or a failed write throws.
 */
export function setup(input: SetupInput): SetupOutcome {
  const { root, dryRun = false } = input;
  const fs = input.fs ?? nodeFs;
  // Settled once: the recommendations and the footer read the machine for
  // different executables, and a run must not answer the two from different
  // views of the same PATH.
  const which = input.which ?? bunWhich;

  requireDirectory(root, fs);

  const detected = detectTypes(root, fs);
  const presence = harnessPresence(which);

  // Reported whether or not Claude Code is on this machine. The project is set
  // up once and the machine can be equipped later, so what the project's type
  // calls for is worth saying either way.
  const plugins = recommend({
    detected,
    root,
    enabled: whereTyped(detected, {}, () => readEnabledPlugins(root, fs)),
    installed: whereTyped<InstalledPlugin[]>(detected, [], () =>
      readInstalledPlugins(input.home ?? homedir(), fs),
    ),
    which,
  });

  // The file that holds the guidance comes before the file that points at it.
  const artifacts: Artifact[] = [];
  const guidance = produce(() => seedArtifact(root, dryRun, fs));
  artifacts.push(guidance);

  // Only where the guidance ended up in AGENTS.md. A project whose guidance is
  // already in CLAUDE.md needs nothing pointing at it, and reporting the same
  // file twice would make one file look like two. Written whichever harness is
  // here: it is one line, and a project is handed to more machines than this one.
  const pointer = produce(() => pointerArtifact(root, guidance, dryRun, fs));
  if (pointer !== null) artifacts.push(pointer);

  // Read last, so it answers for the project as this run leaves it. A seeded
  // guidance file is on disk by now, and reporting it as missing right after
  // writing it would put a gap on the screen that prep had just closed.
  const handoff = readHandoff(root, fs);
  const outcome = { root, detected, artifacts, harnesses: presence, plugins, handoff, next: [] };

  return { ...outcome, next: nextSteps(outcome) };
}
