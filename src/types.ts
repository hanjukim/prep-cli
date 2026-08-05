/**
 * Domain data structures. A pure type module with no runtime code, so importing
 * it from anywhere creates no dependency direction.
 */

export type Platform = "darwin" | "linux";

/**
 * How far prep intervenes.
 * - Level 1 manual: it only tells you what to do.
 * - Level 2 command: it shows a verified command, but a human runs it.
 *
 * There is no third level. prep starts no process on any path (docs/adr/0010),
 * so the union describes everything prep does about a gap: it prints a command
 * or it prints a note, and something else acts on it.
 */
export type Guidance =
  | { kind: "manual"; note: string; url?: string }
  | { kind: "command"; command: string };

export type PlatformSpec = {
  /**
   * The name this platform's package ships the executable under, when that is
   * not the tool's own name. Debian ships bat as batcat and fd-find as fdfind,
   * because both names were taken by packages that were there first.
   *
   * It does not change what is looked up. The canonical name is what counts —
   * it is what anybody types and what every alias and script names — so a
   * machine holding batcat and no bat is a gap like any other, and the guidance
   * beside this installs the package and says nothing about a name.
   *
   * What turns the two names into a name that answers is one step of the
   * bootstrap script, over every renamed tool at once (docs/adr/0025). This is
   * the fact that step reads, which is why it is carried out to `--json` rather
   * than spent inside a command.
   */
  renamed?: string;
  guidance: Guidance;
};

export type ToolSpec = {
  /** The name people call it by. "ripgrep" */
  id: string;
  /**
   * The name the tool is called by, and the name looked up on every platform.
   * "rg"
   *
   * A distribution that ships the executable under another one says so in that
   * platform's `renamed`, and that changes what closes the gap rather than what
   * is asked for.
   */
  binary: string;
  /** One-line purpose. */
  summary: string;
  /**
   * What the entry is for.
   * - prerequisite: the package manager everything else installs through.
   * - standard: the CLI tools daily work runs on.
   * - harness: the agent CLIs prep hands the project over to. Held apart from
   *   the standard tools because setup reads the tier to decide which
   *   permission files a project gets — nothing hands a project to ripgrep.
   *
   * The report does not read the tier for a gap line. A gap with a command
   * prints its command and a gap with manual guidance prints its note,
   * whichever tier it sits in (docs/adr/0010).
   */
  tier: "prerequisite" | "standard" | "harness";
  /** A platform with no key here is reported as unsupported. */
  platforms: Partial<Record<Platform, PlatformSpec>>;
  /**
   * What to run to hand a project over to this harness, once it is on the
   * machine. Harness entries only — nothing hands a project to ripgrep.
   *
   * It sits beside the install command on purpose: both answer a question about
   * the same tool, and splitting them would let a harness be added to one table
   * and forgotten in the other.
   *
   * Unlike the install commands, this one does not vary by platform. The
   * harnesses are invoked the same way wherever they run.
   */
  handoffCommand?: string;
};

/**
 * The harnesses prep knows how to write for.
 *
 * A union rather than a bare string, because two other modules name these ids to
 * decide which files a project gets. A typo in either would drop a file with
 * nothing to catch it — the run would simply write less than it meant to.
 */
export type HarnessId = "claude-code" | "codex";

/**
 * A harness entry, narrowed to what a harness always carries.
 *
 * The field is optional on `ToolSpec` because most entries have nothing to hand
 * a project to. Narrowing it here means the caller that reads it — the setup
 * footer — takes the command straight off the spec, instead of proving all over
 * again that a harness has one.
 */
export type HarnessSpec = ToolSpec & { id: HarnessId; tier: "harness"; handoffCommand: string };

export type CheckStatus = "installed" | "missing" | "unsupported";

export type CheckResult = {
  id: string;
  status: CheckStatus;
  /** The name actually looked up. null when unsupported. */
  binary: string | null;
  /** Where it was found. null when it was not. */
  path: string | null;
  /**
   * The name this platform's package ships the executable under, when that is
   * not `binary`. null everywhere else, which is almost everywhere.
   *
   * Carried through so a reader outside prep can pair the name a machine owes
   * with the one it actually holds, without a table of the two names of its own
   * (docs/adr/0025). It says nothing about `status`: the canonical name is what
   * was asked for, and what was asked for is what the status answers.
   */
  renamed: string | null;
  guidance: Guidance | null;
};

/** How executables are found. Tests replace it with a fake. */
export type WhichFn = (binary: string) => string | null;

/** One entry's wanted state paired with what the machine actually holds. */
export type Row = { spec: ToolSpec; result: CheckResult };

/** The project types prep knows how to write a baseline for. */
export type ProjectType = "node" | "python";

/**
 * A project type's static security baseline: the commands that type's routine
 * work needs, and nothing else.
 *
 * The list holds bare commands, not permission rules — `Bash(npm install)` is
 * assembled where the file is written, so the settings schema is known in one
 * place and this table stays plain data.
 */
export type Preset = {
  type: ProjectType;
  /** The one file whose presence decides the type. "package.json" */
  marker: string;
  /** Commands the agent may run without asking. "npm install", "npm run:*" */
  bash: readonly string[];
};

/**
 * A Claude Code plugin prep recommends for a project type.
 *
 * Static data, decided in the repository and read back as it is (docs/adr/0002):
 * the same stance the presets take. prep never asks a model what a language's
 * tooling is, so a type it has no entry for is recommended nothing at all.
 */
export type PluginRef = {
  /** The plugin's own name. "typescript-lsp" */
  name: string;
  /** The marketplace it is installed from. "claude-plugins-official" */
  marketplace: string;
};

export type PluginSpec = PluginRef & {
  /** The type whose projects want it. */
  type: ProjectType;
  /**
   * The language server the plugin points Claude Code at.
   *
   * The plugin carries a configuration and nothing else — which command to run
   * for which file extension. The command itself is an ordinary executable a
   * person installs, and neither the plugin nor prep puts it there.
   */
  binary: string;
  /** How a person installs that executable. Shown, never run — the same level doctor holds to. */
  install: string;
};

/**
 * Whether the executable the plugin names is on this machine.
 *
 * Held apart from the plugin's own status because the two fail independently,
 * and the combination that matters most is the quiet one: a plugin switched on
 * for a server that is not there loads nothing at all, and looks equipped.
 */
export type LanguageServer = { binary: string; status: "installed" | "missing" };

/**
 * How far one recommended plugin has come.
 * - missing: this machine does not hold it. prep shows the install command and
 *   writes nothing — an enable entry for a plugin that is not there would read
 *   as set up while doing nothing at all.
 * - installed: the machine holds it and this project's settings say nothing
 *   about it. This is the one prep acts on.
 * - answered: the settings file already carries an entry for it. prep leaves
 *   that entry exactly as it is, and says nothing further.
 *
 * The last one is not called "enabled" on purpose. The entry may stand at
 * `false`, which is somebody having switched the plugin off — an answer as
 * binding as switching it on, and one that a status reading "enabled" would
 * report back as its opposite.
 */
export type PluginStatus = "missing" | "installed" | "answered";

export type PluginRecommendation = PluginRef & {
  status: PluginStatus;
  /** The executable the plugin would run, and whether it is on this machine. */
  server: LanguageServer;
};

/**
 * Where one install of one plugin counts.
 * - user: the whole machine, so it counts in any project.
 * - project: the one directory in `projectPath`, and nowhere else.
 */
export type InstallScope = "user" | "project";

/** One entry of the harness's install record, reduced to what prep decides from. */
export type InstalledPlugin = {
  /** "typescript-lsp@claude-plugins-official" */
  id: string;
  scope: InstallScope;
  /** The project a scoped install belongs to. null for a machine-wide one. */
  projectPath: string | null;
};

/**
 * How prep touches the file system. Tests replace it with a fake.
 *
 * `read` exists so an existing settings file can be merged into rather than
 * abandoned (docs/adr/0003). It is the one call that can fail on a file that is
 * there, so everything reading through it turns a failure into a tool error
 * naming the path.
 */
export type SetupFs = {
  exists: (path: string) => boolean;
  /** Whether the path is a directory. A file handed in as the project root is an error, not a no-op. */
  isDirectory: (path: string) => boolean;
  /** Reads the file as text. Throws when the path cannot be read. */
  read: (path: string) => string;
  /** Writes the file, creating parent directories. */
  write: (path: string, contents: string) => void;
};

/**
 * What one setup run did to one file.
 * - applied: there was no file, and one was written.
 * - planned: nothing was written, and the artifact carries what would be — a dry
 *   run, or a merge nobody has approved yet.
 * - merged: an existing file was read, merged into, and written back.
 * - declined: an existing file was left exactly as it was, because the person
 *   said no or was never asked.
 * - skipped: an existing file already covers what prep would put there, so there
 *   was nothing to propose.
 *
 * There is no status for "no type recognised". Most of the baseline — the
 * secrets it denies, the edits it allows, the mode it starts in — holds for any
 * project, so an unrecognised one still gets that much; only the type's own
 * command list is left out.
 */
export type ArtifactStatus = "applied" | "planned" | "merged" | "declined" | "skipped";

/** The permission sections prep merges rule by rule. */
export type RuleSection = "deny" | "allow" | "ask";

export type Permissions = { defaultMode: string; deny: string[]; allow: string[]; ask: string[] };

/**
 * The settings file prep composes: a permissions block, and the plugins it turns
 * on where there are any. No schema line, no server wiring, no prep-specific
 * keys — everything prep does not name is left at Claude Code's own default.
 */
export type ClaudeSettings = {
  permissions: Permissions;
  /** Absent when there is nothing to turn on, so a run that enables nothing writes no empty block. */
  enabledPlugins?: Record<string, boolean>;
};

/**
 * A settings file as it ends up on disk: the permissions block prep reasons
 * about, plus every other key the file already held, carried over untouched.
 */
export type SettingsDocument = { permissions: Permissions & Record<string, unknown> } & Record<
  string,
  unknown
>;

/** An existing settings file, parsed. prep knows only `permissions` and reads the rest as opaque. */
export type ParsedSettings = Record<string, unknown>;

/**
 * A single value the existing file and the baseline disagree on.
 *
 * Rules never conflict — merging them is a union, so both sides keep what they
 * had. A scalar has room for one answer, so this is the only kind of decision
 * prep hands back to the person instead of settling itself.
 */
export type SettingsConflict = { key: string; existing: string; preset: string };

/** Which side of a conflict wins. */
export type ConflictSide = "existing" | "preset";

/**
 * What merging the baseline into an existing file would do.
 *
 * Held apart from the write on purpose: the plan is what gets shown and
 * approved, and only then does anything land on disk.
 */
export type MergePlan = {
  /** The file as it stands. */
  existing: ParsedSettings;
  /** The file as it would stand, with every conflict still at its existing value. */
  merged: SettingsDocument;
  /** The rules the baseline adds, per section. Empty where the file already covers it. */
  added: Record<RuleSection, string[]>;
  /**
   * The plugin entries the baseline adds, by id. Held apart from `added`, which
   * is about permission rules — a plugin is not one, and folding it in would
   * make "adds 4 rules" count something that is not a rule.
   */
  addedPlugins: string[];
  /** The values only a person can settle. Empty when the merge is pure addition. */
  conflicts: SettingsConflict[];
};

/**
 * How prep asks the person. Tests replace it; a non-interactive run gets none,
 * and then nothing lands on disk.
 *
 * One type rather than a base and an extension, because merging an existing
 * settings file is the only thing prep asks about at all (docs/adr/0003). doctor
 * asks nothing, so there is no second caller that needs a narrower shape.
 */
export type SetupPrompt = {
  /** Puts a block in front of the person before the next question. */
  show: (text: string) => void;
  /** Yes or no. Anything other than an explicit yes means no. */
  confirm: (question: string) => boolean;
  /** What merging asks on top of a yes or no: which side of a conflict wins. */
  choose: (conflict: SettingsConflict) => ConflictSide;
};

/**
 * The pieces of harness-side setup prep looks for once its own work is done.
 *
 * These are what `/setup-matt-pocock-skills` leaves behind, plus the language
 * guidance that decides what the agent writes in. prep does not produce any of
 * them — it only reports which are still owed.
 */
export type HandoffItemId = "language" | "issue-tracker" | "domain-docs";

/**
 * How far one item has come.
 * - ready: it is there and it says something.
 * - missing: no file holds it yet.
 * - empty: a file holds it, but the part that matters is blank or unfilled.
 *
 * The split between the last two is what the report is for: missing means
 * nothing has been started, empty means something was and stopped halfway.
 */
export type HandoffStatus = "ready" | "missing" | "empty";

export type HandoffResult = {
  id: HandoffItemId;
  status: HandoffStatus;
  /** The file read, relative to the project root. null when no candidate was there. */
  path: string | null;
};

/**
 * The Claude Code settings file: the one artifact prep composes from presets.
 *
 * Its `settings` and `plan` are shaped by the permission schema, which is why
 * the artifact is a kind of its own rather than a bag of common fields — a file
 * of prose has nothing to put in either.
 */
export type SettingsArtifact = {
  kind: "claude-settings";
  /** Where the file is, as prep would write it. */
  path: string;
  status: ArtifactStatus;
  /** What was written, or would be. null whenever nothing was composed. */
  settings: SettingsDocument | null;
  /** How the baseline meets the existing file. null when there was no file to merge into. */
  plan: MergePlan | null;
};

/**
 * A file of prose the harness reads before it does anything else.
 *
 * Two of them, told apart by `kind` and nothing else, because what prep does
 * with either is the same: write the whole file where none stands, and leave any
 * file that does stand exactly as it is.
 *
 * - agents-md: the guidance itself, seeded as a shape. prep stays out of the
 *   contents — what language a project is written in is the harness's answer to
 *   give, and a file prep had filled in would read as settled when nobody had
 *   settled it (docs/adr/0005).
 * - claude-md: one line, `@AGENTS.md`. Claude Code reads CLAUDE.md and not
 *   AGENTS.md, so without it a project whose guidance sits in AGENTS.md is a
 *   project Claude starts blind in. It carries the import and nothing else: the
 *   guidance lives in one file, and this one only says where.
 */
export type GuidanceArtifact = {
  kind: "agents-md" | "claude-md";
  /** Where the file is, or the file that already stands in its place. */
  path: string;
  status: ArtifactStatus;
  /** The text written, or that would be. null when there was nothing to write. */
  contents: string | null;
};

/**
 * The permission profile Codex reads, before it is a file.
 *
 * Deny lists rather than tables, because every entry means the same thing: a
 * path Codex may not touch. What separates the two is where the path is measured
 * from — inside the project, or anywhere on the machine.
 *
 * None of these values is decided here. They are the same preset the Claude
 * settings file is composed from, carried into the other schema.
 */
export type CodexConfig = {
  /** The profile name every rule hangs off, and the default the file selects. */
  profile: string;
  /** The built-in stance the profile starts from. ":workspace" */
  extends: string;
  /** When Codex stops to ask. "on-request" */
  approvalPolicy: string;
  /** Denied paths measured from the project root, in preset order. */
  workspace: string[];
  /** Denied paths measured from the machine — home directories and the like. */
  outside: string[];
};

/**
 * The permission file Codex reads.
 *
 * Never merged into. An existing file is left as it stands and reported, because
 * the merge the Claude side does needs a parser, and a parser is a dependency
 * (docs/adr/0007).
 */
export type CodexArtifact = {
  kind: "codex-config";
  path: string;
  status: ArtifactStatus;
  /** The profile written, or that would be. null when a file was already there. */
  config: CodexConfig | null;
  /**
   * Whether the file already there sets a sandbox mode.
   *
   * A fact rather than a warning, so the sentence that goes with it stays in the
   * report. It matters because a `sandbox_mode` makes Codex ignore the
   * permission profile entirely: the file would be read, and none of it applied.
   */
  sandboxMode: boolean;
};

/**
 * One file a setup run produces.
 *
 * A union, so a new kind of file arrives as another member instead of as another
 * set of optional fields on a single shape. Every member carries its own `path`
 * and `status`; everything beyond those two is the member's own.
 */
export type Artifact = SettingsArtifact | GuidanceArtifact | CodexArtifact;

/**
 * One harness, and whether this run wrote for it.
 *
 * Which files a run produces is read off the machine: a harness that is not
 * installed reads nothing, so a permission file for it would be a file nobody
 * opens. This is what lets the report say why a file is absent instead of
 * leaving a gap where it would have been.
 *
 * The two fields part company in exactly one case. With no harness installed at
 * all, prep still writes the Claude files — a project has to carry a baseline
 * somewhere, and the machine will get a harness before the project gets a second
 * chance to be set up.
 */
export type HarnessPresence = {
  id: HarnessId;
  installed: boolean;
  /** Whether this run produced the files this harness reads. */
  covered: boolean;
};

/**
 * A step prep suggests taking next.
 * - approve: a merge was planned and nobody was there to approve it.
 * - harness: the harness side still owes something, and a harness is here to
 *   be asked for it.
 * - install-harness: the same thing is owed, but nothing on this machine can be
 *   asked. The step turns into getting a harness first.
 * - doctor: the project is set up, so the machine is the next scope out.
 */
export type NextStepId = "approve" | "harness" | "install-harness" | "doctor";

/**
 * One thing to run after setup.
 *
 * The command and nothing else: why it is worth running is wording, and wording
 * lives in the report. This is level 2 intervention, the same as doctor's — a
 * verified command, run by a person (see `Guidance`).
 */
export type NextStep = {
  id: NextStepId;
  command: string;
  /**
   * A second command that does the same thing another way. null whenever there
   * is only one way to do it.
   *
   * It exists because a machine can hold both harnesses, and prep has no
   * grounds to decide which one somebody works in. Suggesting one and naming
   * the other keeps the footer to a single line of advice without hiding the
   * choice.
   */
  alternative: string | null;
};

export type SetupOutcome = {
  /** The project directory, as it was given. */
  root: string;
  /** The types found, in table order. Empty when there is no marker. */
  detected: ProjectType[];
  /**
   * The files this run produced, in the order they are reported.
   *
   * Every one carries its own path and its own status: a person can decline one
   * and take another, and the run's exit code is read off the list rather than
   * off a single verdict.
   */
  artifacts: Artifact[];
  /**
   * The harnesses prep knows about, in registry order, each with whether this
   * machine holds it and whether this run wrote for it.
   *
   * Read on every run, because it is the answer to the question the artifact
   * list raises by omission: a run that produced no Codex file did so for a
   * reason, and the reason is here rather than in the wording of the report.
   */
  harnesses: HarnessPresence[];
  /**
   * The language servers this project's types call for, in table order. Empty
   * when no type was recognised.
   *
   * A recommendation is not an artifact: prep installs none of them, and the
   * one thing it does write — an enable entry for a plugin already on the
   * machine — lands inside the settings file and is reported there. This list is
   * what a person reads to know why.
   */
  plugins: PluginRecommendation[];
  /**
   * What the harness side still owes, in table order.
   *
   * Read on every run whatever else happened, because it says nothing about
   * what prep wrote — a project whose settings already covered the baseline
   * still needs to be told which guidance is missing.
   */
  handoff: HandoffResult[];
  /**
   * What to run next, in the order it is worth running. Empty when the run left
   * nothing to do.
   *
   * Read off the rest of the outcome, so it is recomputed whenever the outcome
   * changes — a merge that has just been approved is no longer waiting on one.
   */
  next: NextStep[];
};
