import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import { CodexError, codexArtifact } from "./codex.ts";
import { HandoffError, checkHandoff } from "./handoff.ts";
import { MergeError, changesNothing, parseSettings, planMerge } from "./merge.ts";
import { nextSteps } from "./next.ts";
import { PluginsError, readInstalledPlugins, recommend, toEnable } from "./plugins.ts";
import {
  ALWAYS_ALLOW,
  ALWAYS_ASK,
  ALWAYS_BASH,
  ALWAYS_DENY,
  DEFAULT_MODE,
  all,
} from "./presets.ts";
import { bunWhich } from "./probe.ts";
import { harnesses } from "./registry.ts";
import { SeedError, pointerArtifact, seedArtifact } from "./seed.ts";
import type {
  Artifact,
  ClaudeSettings,
  HarnessId,
  HarnessPresence,
  InstalledPlugin,
  ParsedSettings,
  PluginRecommendation,
  Preset,
  ProjectType,
  SetupFs,
  SetupOutcome,
  SettingsArtifact,
  SettingsDocument,
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

const SETTINGS_RELATIVE_PATH = join(".claude", "settings.json");

/**
 * Turns presets into the settings file.
 *
 * The only place that knows Claude Code's schema. Presets hold bare commands;
 * the rule wrapper is put on here, so widening the baseline never means editing
 * the schema in two places.
 *
 * What the preset does not name stays at Claude Code's own default, which is to
 * ask — prep never widens beyond these lists.
 */
function compose(
  presets: readonly Preset[],
  plugins: readonly PluginRecommendation[],
): ClaudeSettings {
  // What every project runs comes first, then the detected types in table
  // order, each command once. With no recognised type only the first half is
  // left, which is why an unknown project still gets a usable baseline.
  const commands = [...new Set([...ALWAYS_BASH, ...presets.flatMap((preset) => preset.bash)])];

  const settings: ClaudeSettings = {
    permissions: {
      defaultMode: DEFAULT_MODE,
      // Deny leads, because it is the one section that holds no matter what the
      // rest of the file says.
      deny: [...ALWAYS_DENY],
      // The type-independent rules come first, since they hold for every
      // project and do not come from the merged presets.
      allow: [...ALWAYS_ALLOW, ...commands.map((command) => `Bash(${command})`)],
      ask: [...ALWAYS_ASK],
    },
  };

  // Only the plugins this machine already holds. An entry for one that is not
  // installed would leave the file reading as set up while nothing loads.
  const enable = toEnable(plugins);
  if (enable.length > 0) {
    settings.enabledPlugins = Object.fromEntries(enable.map((id) => [id, true]));
  }

  return settings;
}

/** Serialises and writes. The one place a settings file is put on disk. */
export function writeSettings(
  settingsPath: string,
  settings: SettingsDocument,
  fs: SetupFs = nodeFs,
): void {
  try {
    fs.write(settingsPath, JSON.stringify(settings, null, 2) + "\n");
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new SetupError(`Could not write ${settingsPath}: ${reason}`);
  }
}

/** Reads and parses the file that is already there. Anything unreadable or unmergeable stops the run. */
function readExisting(settingsPath: string, fs: SetupFs) {
  let text: string;
  try {
    text = fs.read(settingsPath);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new SetupError(`Could not read ${settingsPath}: ${reason}`);
  }

  try {
    return parseSettings(text);
  } catch (error) {
    if (error instanceof MergeError) {
      throw new SetupError(`Cannot merge into ${settingsPath}: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Reads what the harness side still owes.
 *
 * A file that is there but cannot be read stops the run, the same as an
 * unreadable settings file. Being owed something is not a failure and never
 * changes the exit code — but a failed read is not a judgement at all, and
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
 * Produces the Claude Code settings file, or plans it.
 *
 * Two paths, and the split is deliberate. With no file there, prep writes: there
 * is nothing of anybody's to lose. With a file there, prep only ever plans —
 * the merge is handed back for a person to see and approve, and writing it is a
 * separate call (docs/adr/0003).
 */
function settingsArtifact(
  path: string,
  presets: readonly Preset[],
  plugins: readonly PluginRecommendation[],
  existing: ParsedSettings | null,
  dryRun: boolean,
  fs: SetupFs,
): SettingsArtifact {
  const settings = compose(presets, plugins);

  if (existing !== null) {
    const plan = planMerge(existing, settings);

    // A file that already covers the baseline is left alone with nothing to
    // show — this is what keeps a second run over prep's own output quiet.
    if (changesNothing(plan)) {
      return { kind: "claude-settings", path, status: "skipped", settings: null, plan };
    }

    return { kind: "claude-settings", path, status: "planned", settings: plan.merged, plan };
  }

  if (dryRun) {
    return { kind: "claude-settings", path, status: "planned", settings, plan: null };
  }

  writeSettings(path, settings, fs);

  return { kind: "claude-settings", path, status: "applied", settings, plan: null };
}

/**
 * Reads the harness's install record, where anything could come of it.
 *
 * A project with no recognised type is recommended no plugin, so the record has
 * no bearing on the run and is not opened at all — a record prep cannot read
 * should not fail a run whose answer would have been the same either way.
 *
 * Where it is read, an unreadable one is a tool error, the same as any file prep
 * decides from.
 */
function readInstalled(
  detected: readonly ProjectType[],
  home: string,
  fs: SetupFs,
): InstalledPlugin[] {
  if (detected.length === 0) return [];

  try {
    return readInstalledPlugins(home, fs);
  } catch (error) {
    if (error instanceof PluginsError) throw new SetupError(error.message);
    throw error;
  }
}

/**
 * Runs one artifact's own producer, and turns its failure into a tool error.
 *
 * Every producer fails the same way — a file it had to read or write did not
 * work — and every one of those is a run prep could not carry out. Naming the
 * module errors here is what keeps that translation in one place instead of once
 * per file kind.
 */
function produce<T>(make: () => T): T {
  try {
    return make();
  } catch (error) {
    if (error instanceof SeedError || error instanceof CodexError) {
      throw new SetupError(error.message);
    }
    throw error;
  }
}

/**
 * Which harness reads which of the files prep writes.
 *
 * Held here rather than on the registry entries: the registry is a table of what
 * a machine should hold, and doctor reads it without ever hearing about a
 * project. Which file a project needs is setup's question.
 */
const CLAUDE_CODE: HarnessId = "claude-code";
const CODEX: HarnessId = "codex";

/**
 * Reads the machine for the harnesses, and decides whose files this run writes.
 *
 * A permission file for a harness that is not installed is a file nobody opens,
 * so what is on the machine decides what lands in the project. The lookup is one
 * `which` per entry, the same one the footer uses to pick a handoff command.
 *
 * With no harness at all, the Claude files are written anyway. The project still
 * needs the baseline somewhere, and the machine is one `prep doctor` away from
 * holding a harness — whereas the project is only set up once, by whoever ran
 * this. Writing nothing would leave that person with neither.
 */
function harnessPresence(which: WhichFn): HarnessPresence[] {
  const rows = harnesses().map((spec) => ({
    id: spec.id,
    installed: which(spec.binary) !== null,
    covered: false,
  }));

  const none = rows.every((row) => !row.installed);

  return rows.map((row) => ({
    ...row,
    covered: row.installed || (none && row.id === CLAUDE_CODE),
  }));
}

/** Whether this run writes the files one harness reads. */
function covers(presence: readonly HarnessPresence[], id: HarnessId): boolean {
  return presence.some((row) => row.id === id && row.covered);
}

/**
 * Detects the project type, then produces every artifact that follows from it.
 *
 * An unrecognised project still gets the type-independent half of the baseline.
 * Only an unusable path, an unreadable file, or a failed write throws.
 */
export function setup(input: SetupInput): SetupOutcome {
  const { root, dryRun = false } = input;
  const fs = input.fs ?? nodeFs;
  // Settled once: the recommendations and the footer read the machine for
  // different executables, and a run must not answer the two from different
  // views of the same PATH.
  const which = input.which ?? bunWhich;

  // A path that is missing, or is a file, is a tool error. Reporting it as
  // "nothing to do" would hide a typo behind a legitimate-looking no-op.
  if (!fs.isDirectory(root)) throw new SetupError(`Not a project directory: ${root}`);

  const presets = all().filter((preset) => fs.exists(join(root, preset.marker)));
  const detected = presets.map((preset) => preset.type);

  // Settled before anything is composed, because it decides what there is to
  // compose: a machine with no Claude Code gets no settings file, and nothing
  // that only goes into a settings file is worth working out.
  const presence = harnessPresence(which);
  const forClaude = covers(presence, CLAUDE_CODE);
  const forCodex = covers(presence, CODEX);

  // Read once, before anything is composed: what the file already says about a
  // plugin decides whether prep proposes an entry for it at all, and composing
  // first would mean reading the same file twice to answer that.
  const settingsPath = join(root, SETTINGS_RELATIVE_PATH);
  const existing = forClaude && fs.exists(settingsPath) ? readExisting(settingsPath, fs) : null;

  // Plugins are Claude Code's, and the only thing prep does about one is write an
  // entry into that harness's settings file. With no such file to write, there is
  // no recommendation to make and no install record in a home directory to open.
  const plugins = forClaude
    ? recommend({
        detected,
        root,
        enabled: existing?.enabledPlugins,
        installed: readInstalled(detected, input.home ?? homedir(), fs),
        which,
      })
    : [];

  // Permission files first, in registry order, then the prose. Within the prose,
  // the file that holds the guidance comes before the file that points at it.
  const artifacts: Artifact[] = [];
  if (forClaude) artifacts.push(settingsArtifact(settingsPath, presets, plugins, existing, dryRun, fs));
  if (forCodex) artifacts.push(produce(() => codexArtifact(root, dryRun, fs)));

  const guidance = produce(() => seedArtifact(root, dryRun, fs));
  artifacts.push(guidance);

  // Only where the guidance ended up in AGENTS.md. A project whose guidance is
  // already in CLAUDE.md needs nothing pointing at it, and reporting the same
  // file twice would make one file look like two.
  const pointer = forClaude ? produce(() => pointerArtifact(root, guidance, dryRun, fs)) : null;
  if (pointer !== null) artifacts.push(pointer);

  // Read last, so it answers for the project as this run leaves it. A seeded
  // guidance file is on disk by now, and reporting it as missing right after
  // writing it would put a gap on the screen that prep had just closed.
  const handoff = readHandoff(root, fs);
  const outcome = { root, detected, artifacts, harnesses: presence, plugins, handoff, next: [] };

  return { ...outcome, next: nextSteps(outcome, dryRun) };
}
