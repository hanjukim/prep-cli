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
   *   the standard tools because the setup footer reads the tier to decide
   *   which command can hand the project over — nothing hands a project to
   *   ripgrep.
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
 * The harnesses prep hands a project over to.
 *
 * A union rather than a bare string, because the registry and the pass table
 * both name these ids — one to say which command hands the project over, the
 * other to gate a login row on its harness. A typo in either would drop a row
 * with nothing to catch it.
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

/**
 * The five things prep can read as absent but must not close: a directory that
 * is not a git repository, a GitHub login, a git identity, and a login per
 * installed harness. What separates a pass item from a gap is who may close it —
 * the bootstrap script closes a gap, and a pass item is closed by the person or
 * not at all.
 *
 * "Not at all" covers two things, and the repository is the second. A browser
 * login needs a person's hands; turning somebody's directory into a repository
 * needs a person's decision. Neither is a script's to take (docs/adr/0027).
 *
 * Every id names the thing that is absent, never the command that closes it —
 * `git-repository` and not `git-init`. The command is the item's guidance, and an
 * id naming one would read as a step to take rather than a state to be in.
 */
export type PassItemId =
  | "git-repository"
  | "github-login"
  | "git-identity"
  | "claude-login"
  | "codex-login";

/**
 * What answers a pass item.
 * - machine: a fixed read-only command, asked of the machine (docs/adr/0026).
 * - project: a path inside the project chef was given. Asked only when there
 *   is a project — `prep chef` with no argument never guesses one
 *   (docs/adr/0027).
 */
export type PassScope = "machine" | "project";

/**
 * How one pass item stands.
 * - ready: every check answered yes.
 * - missing: a check answered no. A legitimate state, not a failure — an
 *   account nobody has opened can stay unopened for years, so this never moves
 *   the exit code.
 * - unknown: a check could not be asked — it timed out, or its binary is not
 *   here. The report names the check command so a person can ask it themselves.
 *   A project row never reaches this: a path is either there or it is not.
 */
export type PassStatus = "ready" | "missing" | "unknown";

/**
 * One fixed read-only question, as the argv it is asked with.
 *
 * An array rather than a string on purpose: no shell ever sees it, so nothing
 * in it can expand, split, or chain (docs/adr/0026).
 */
export type PassCheck = readonly string[];

type PassSpecCommon = {
  id: PassItemId;
  /** One-line purpose. Human-facing wording, kept out of `--json` the way `ToolSpec.summary` is. */
  summary: string;
  /**
   * What closes the item. Always taken by a person — the bootstrap script reads
   * gaps, not pass items, so nothing here is ever run unattended.
   */
  guidance: Guidance;
};

/** A pass item the machine answers, through the fixed read-only checks. */
export type MachinePassSpec = PassSpecCommon & {
  scope: "machine";
  /** The fixed questions, all of which must answer yes for ready. */
  checks: readonly PassCheck[];
  /**
   * The harness whose absence takes this row off the table. A login question
   * for a harness nobody installed has no useful answer. Absent means the row
   * is always asked.
   */
  harness?: HarnessId;
};

/** A pass item the project answers, by whether one path inside it is there. */
export type ProjectPassSpec = PassSpecCommon & {
  scope: "project";
  /**
   * The path, relative to the project root, whose presence answers the item.
   * `.git` for a repository — a file there rather than a directory is a worktree
   * or a submodule, and either one is a repository, so presence is the question
   * and not what kind of entry it is.
   */
  marker: string;
};

/**
 * One pass item, of either scope.
 *
 * A union on `scope` rather than one shape with optional fields, because the two
 * are answered by different things: a machine row carries an argv nothing but
 * `pass.ts` may start, and a project row carries a path. Optional fields would
 * let a row arrive with both and neither, and the runner would have to decide
 * which it meant.
 */
export type PassSpec = MachinePassSpec | ProjectPassSpec;

export type PassResult = {
  id: PassItemId;
  status: PassStatus;
  /**
   * The checks as typed commands, so an `unknown` can name what to ask. Empty on
   * a project row: nothing was asked as a command, so there is no command to
   * hand back.
   */
  checks: string[];
  guidance: Guidance;
};

/**
 * How one fixed check is asked. Tests replace it, so no test starts a real
 * process (the same seam `which` opens for the PATH reads).
 *
 * true means the command exited 0, false any other exit, and null that it could
 * not be asked at all — a timeout, or a binary that is not here.
 */
export type CheckFn = (argv: PassCheck) => Promise<boolean | null> | boolean | null;

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

/** The project types prep recognises. The type decides which plugins are recommended, and nothing else. */
export type ProjectType = "node" | "python";

/**
 * A Claude Code plugin prep recommends for a project type.
 *
 * Static data, decided in the repository and read back as it is. prep never
 * asks a model what a language's tooling is, so a type it has no entry for is
 * recommended nothing at all.
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
  /** The one file whose presence decides the type. "package.json" */
  marker: string;
  /**
   * The language server the plugin points Claude Code at.
   *
   * The plugin carries a configuration and nothing else — which command to run
   * for which file extension. The command itself is an ordinary executable a
   * person installs, and neither the plugin nor prep puts it there.
   */
  binary: string;
  /** How a person installs that executable. Shown, never run — the same level chef holds to. */
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
 * - missing: this machine does not hold it. prep shows the install command.
 * - installed: the machine holds it and this project's settings say nothing
 *   about it. prep shows the command that turns it on here.
 * - answered: the settings file already carries an entry for it, and prep says
 *   nothing further.
 *
 * prep writes nothing in any of the three (docs/adr/0031).
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
 * `read` is the one call that can fail on a file that is there, so everything
 * reading through it turns a failure into a tool error naming the path.
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
 * - planned: a dry run. Nothing was written, and the artifact carries what would be.
 * - skipped: a file already stands there, and prep leaves it exactly as it is.
 */
export type ArtifactStatus = "applied" | "planned" | "skipped";

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
 * The project a chef run was given, and what reading it produced.
 *
 * One type because the pair travels together to three places — the runner, the
 * human report, and the JSON contract — and each of them needs both halves: the
 * rows say what is owed and the root says which directory they are about. Absent
 * rather than empty on a run with no path, since a project nobody named and a
 * project that owes nothing are different answers (docs/adr/0027).
 */
export type ChefProject = {
  /** The project directory, as it was given. The same as `SetupOutcome.root`. */
  root: string;
  handoff: readonly HandoffResult[];
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
 * One file a setup run produces.
 *
 * Both are files of prose today. The name is kept apart from `GuidanceArtifact`
 * so a new kind of file arrives as another member of a union here, rather than
 * as optional fields on the one shape.
 */
export type Artifact = GuidanceArtifact;

/**
 * One harness, and whether this machine holds it.
 *
 * Read for one thing: which command can hand the project over. No file prep
 * writes depends on it (docs/adr/0031).
 */
export type HarnessPresence = {
  id: HarnessId;
  installed: boolean;
};

/**
 * A step prep suggests taking next.
 * - harness: the harness side still owes something, and a harness is here to
 *   be asked for it.
 * - install-harness: the same thing is owed, but nothing on this machine can be
 *   asked. The step turns into getting a harness first.
 * - chef: the project is set up, so the machine is the next scope out.
 */
export type NextStepId = "harness" | "install-harness" | "chef";

/**
 * One thing to run after setup.
 *
 * The command and nothing else: why it is worth running is wording, and wording
 * lives in the report. This is level 2 intervention, the same as chef's — a
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
   * Every one carries its own path and its own status, and the run's exit code
   * is read off the list rather than off a single verdict.
   */
  artifacts: Artifact[];
  /**
   * The harnesses prep knows about, in registry order, each with whether this
   * machine holds it. It is what the next steps are read off.
   */
  harnesses: HarnessPresence[];
  /**
   * The language servers this project's types call for, in table order. Empty
   * when no type was recognised.
   *
   * A recommendation is not an artifact: prep installs none of them and turns
   * none of them on. This list is what a person reads to know what to run.
   */
  plugins: PluginRecommendation[];
  /**
   * What the harness side still owes, in table order.
   *
   * Read on every run whatever else happened, because it says nothing about
   * what prep wrote — a project prep had nothing to write for still needs to be
   * told which guidance is missing.
   */
  handoff: HandoffResult[];
  /**
   * What to run next, in the order it is worth running. Empty when the run left
   * nothing to do.
   *
   * Read off the rest of the outcome, and decided without touching the machine
   * a second time.
   */
  next: NextStep[];
};
