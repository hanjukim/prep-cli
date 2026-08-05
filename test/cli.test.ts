import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import { approve, type RunDeps, type RunResult, run as runCli, setupExitCode } from "../src/cli.ts";
import { planMerge } from "../src/merge.ts";
import { nextSteps } from "../src/next.ts";
import type {
  Artifact,
  ConflictSide,
  SettingsArtifact,
  SetupFs,
  SetupOutcome,
  SetupPrompt,
  WhichFn,
} from "../src/types.ts";

/**
 * A fake home directory.
 *
 * Every run goes through here rather than calling the CLI directly, so no test
 * can fall through to the install record in a real home directory.
 */
const HOME = "/home";
const RECORD = "/home/.claude/plugins/installed_plugins.json";

function run(argv: readonly string[], deps: RunDeps = {}): RunResult {
  return runCli(argv, { home: HOME, which: SERVERS_FOUND, ...deps });
}

/** A machine with every language server on PATH, so setup's plugin half is the only variable. */
const SERVERS_FOUND: WhichFn = (binary) => `/usr/bin/${binary}`;

function fakeWhich(found: Record<string, string>): WhichFn {
  return (binary) => found[binary] ?? null;
}

/** A fake file system holding only the given paths. It never touches a real disk. */
function fakeFs(present: readonly string[], contents: Record<string, string> = {}) {
  const written = new Map<string, string>();
  const held = new Map(Object.entries(contents));
  const paths = new Set([...present, ...held.keys()]);
  const fs: SetupFs = {
    exists: (path) => paths.has(path),
    // Only the project root is a directory here. Everything else stands for a file.
    isDirectory: (path) => path === PROJECT && paths.has(PROJECT),
    read: (path) => {
      const text = written.get(path) ?? held.get(path);
      if (text === undefined) throw new Error(`ENOENT: no such file, open '${path}'`);
      return text;
    },
    write: (path, contents) => {
      written.set(path, contents);
      paths.add(path);
    },
  };
  return { fs, written };
}

/** A settings file that is already there, given as its JSON text. */
function withSettings(value: unknown): Record<string, string> {
  return { [SETTINGS]: JSON.stringify(value) };
}

/** A person who answers the same way every time. Records everything put in front of them. */
function fakePrompt(answers: { confirm: boolean; choose?: ConflictSide }) {
  const shown: string[] = [];
  const asked: string[] = [];
  const prompt: SetupPrompt = {
    show: (text) => {
      shown.push(text);
    },
    confirm: (question) => {
      asked.push(question);
      return answers.confirm;
    },
    choose: (conflict) => {
      asked.push(conflict.key);
      return answers.choose ?? "existing";
    },
  };
  return { prompt, shown, asked };
}

const PROJECT = "/project";
const SETTINGS = "/project/.claude/settings.json";
/** The guidance file prep seeds. */
const GUIDANCE = "/project/AGENTS.md";

/** The file pointing Claude Code at the guidance. */
const POINTER = "/project/CLAUDE.md";
/** The Codex permission file. */
const CODEX_CONFIG = "/project/.codex/config.toml";

/**
 * Every file prep writes without asking, already on disk.
 *
 * A run against this has nothing left to do but the merge, which is what the
 * blocks below are about: any write they see is the one under test.
 */
const SEEDED = {
  [GUIDANCE]: "# AGENTS.md\n\n## Language\n\nEnglish in the repository.\n",
  [POINTER]: "@AGENTS.md\n",
  [CODEX_CONFIG]: 'default_permissions = "project-edit"\n',
};

/** A Mac with every standard tool. fd and bat keep their macOS names. */
const STANDARD_DARWIN = {
  git: "/usr/bin/git",
  rg: "/opt/homebrew/bin/rg",
  fd: "/opt/homebrew/bin/fd",
  zoxide: "/opt/homebrew/bin/zoxide",
  gh: "/opt/homebrew/bin/gh",
  bat: "/opt/homebrew/bin/bat",
  eza: "/opt/homebrew/bin/eza",
  fzf: "/opt/homebrew/bin/fzf",
  jq: "/opt/homebrew/bin/jq",
  make: "/usr/bin/make",
};

/** Linux with the same set installed. fd is found as fdfind, bat as batcat. */
const STANDARD_LINUX = {
  git: "/usr/bin/git",
  rg: "/usr/bin/rg",
  fdfind: "/usr/bin/fdfind",
  zoxide: "/usr/bin/zoxide",
  gh: "/usr/bin/gh",
  batcat: "/usr/bin/batcat",
  eza: "/usr/bin/eza",
  fzf: "/usr/bin/fzf",
  jq: "/usr/bin/jq",
  make: "/usr/bin/make",
};

/** Both supported harnesses. Neither one's name differs by platform. */
const HARNESSES = { claude: "/usr/local/bin/claude", codex: "/usr/local/bin/codex" };

const ALL_PRESENT_DARWIN = { brew: "/opt/homebrew/bin/brew", ...STANDARD_DARWIN, ...HARNESSES };
const ALL_PRESENT_LINUX = { apt: "/usr/bin/apt", ...STANDARD_LINUX, ...HARNESSES };

describe("exit codes", () => {
  test("no gaps is 0", () => {
    const result = run(["doctor"], {
      platformName: "darwin",
      which: fakeWhich(ALL_PRESENT_DARWIN),
    });
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
  });

  test("gaps found is 1", () => {
    const result = run(["doctor"], {
      platformName: "darwin",
      which: fakeWhich({ brew: "/opt/homebrew/bin/brew" }),
    });
    expect(result.exitCode).toBe(1);
  });

  test("a missing prerequisite alone is 1", () => {
    const result = run(["doctor"], {
      platformName: "darwin",
      which: fakeWhich({ ...STANDARD_DARWIN, ...HARNESSES }),
    });
    expect(result.exitCode).toBe(1);
  });

  test("an unsupported OS is 2", () => {
    const result = run(["doctor"], { platformName: "win32", which: fakeWhich({}) });
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("WSL");
  });

  test("an unknown subcommand is 2", () => {
    const result = run(["install"], { platformName: "darwin", which: fakeWhich({}) });
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("install");
  });

  test("no subcommand gives 2 and the usage text", () => {
    const result = run([], { platformName: "darwin", which: fakeWhich({}) });
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("prep doctor");
  });

  test("--help is 0", () => {
    const result = run(["--help"], { platformName: "darwin", which: fakeWhich({}) });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("prep doctor");
  });
});

describe("per-platform guidance", () => {
  test("macOS shows brew commands", () => {
    const result = run(["doctor"], {
      platformName: "darwin",
      which: fakeWhich({ brew: "/opt/homebrew/bin/brew", git: "/usr/bin/git" }),
    });
    expect(result.stdout).toContain("brew install ripgrep");
    expect(result.stdout).not.toContain("apt install");
  });

  test("Linux shows apt commands", () => {
    const result = run(["doctor"], {
      platformName: "linux",
      which: fakeWhich({ apt: "/usr/bin/apt", git: "/usr/bin/git" }),
    });
    expect(result.stdout).toContain("sudo apt install -y ripgrep");
    expect(result.stdout).not.toContain("brew install");
  });

  test("on Linux, fdfind counts fd as installed", () => {
    const result = run(["doctor"], {
      platformName: "linux",
      which: fakeWhich({ apt: "/usr/bin/apt", fdfind: "/usr/bin/fdfind" }),
    });
    expect(result.stdout).toContain("✓ fd");
    expect(result.stdout).not.toContain("sudo apt install -y fd-find");
  });

  test("on macOS, fdfind does not fill fd", () => {
    const result = run(["doctor"], {
      platformName: "darwin",
      which: fakeWhich({ brew: "/opt/homebrew/bin/brew", fdfind: "/usr/bin/fdfind" }),
    });
    expect(result.stdout).toContain("brew install fd");
  });
});

describe("idempotence", () => {
  test("same input gives same output and same exit code", () => {
    const deps = { platformName: "linux", which: fakeWhich(ALL_PRESENT_LINUX) };
    const first = run(["doctor"], deps);
    const second = run(["doctor"], deps);
    expect(second).toEqual(first);
  });
});

/** A prompt that answers every question the same way and records what it was asked. */
function doctorPrompt(answer: boolean) {
  const asked: string[] = [];
  const prompt: SetupPrompt = {
    show: () => {},
    confirm: (question) => {
      asked.push(question);
      return answer;
    },
    choose: () => "existing",
  };
  return { prompt, asked };
}

describe("doctor changes nothing", () => {
  const HALF_DARWIN = { brew: "/opt/homebrew/bin/brew", ...STANDARD_DARWIN };

  test("a terminal on the other end is asked nothing", () => {
    const { prompt, asked } = doctorPrompt(true);
    const result = run(["doctor"], {
      platformName: "darwin",
      which: fakeWhich(HALF_DARWIN),
      prompt,
    });
    expect(asked).toEqual([]);
    expect(result.exitCode).toBe(1);
  });

  test("the report never claims to have closed a gap", () => {
    const { prompt } = doctorPrompt(true);
    const result = run(["doctor"], {
      platformName: "darwin",
      which: fakeWhich(HALF_DARWIN),
      prompt,
    });
    expect(result.stdout).not.toContain("Installed claude-code");
    expect(result.stdout).not.toContain("(declined)");
    expect(result.stdout).toContain("Run the commands above yourself");
  });

  test("a missing harness stays a gap, so the run ends at 1", () => {
    const result = run(["doctor"], {
      platformName: "darwin",
      which: fakeWhich(HALF_DARWIN),
    });
    expect(result.stdout).toContain("claude-code");
    expect(result.exitCode).toBe(1);
  });

  test("a terminal run and a piped run report the same thing", () => {
    const deps = { platformName: "darwin", which: fakeWhich(HALF_DARWIN) };
    const { prompt } = doctorPrompt(true);
    expect(run(["doctor"], { ...deps, prompt })).toEqual(run(["doctor"], deps));
  });

  test("Linux reports the same way, with nothing to approve", () => {
    const { prompt, asked } = doctorPrompt(true);
    const result = run(["doctor"], {
      platformName: "linux",
      which: fakeWhich({ apt: "/usr/bin/apt", ...STANDARD_LINUX }),
      prompt,
    });
    expect(asked).toEqual([]);
    expect(result.exitCode).toBe(1);
  });
});

describe("setup exit codes", () => {
  test("writing the baseline is 0", () => {
    const { fs, written } = fakeFs([PROJECT, "/project/package.json"]);
    const result = run(["setup", PROJECT], { fs });
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(written.has(SETTINGS)).toBe(true);
  });

  test("no known marker still writes the type-independent half, so 0", () => {
    const { fs, written } = fakeFs([PROJECT]);
    const result = run(["setup", PROJECT], { fs });
    expect(result.exitCode).toBe(0);
    expect(written.has(SETTINGS)).toBe(true);
  });

  test("a run with nothing left to write is 1", () => {
    const { fs, written } = fakeFs([PROJECT, "/project/package.json"], {
      ...SEEDED,
      ...withSettings({ permissions: { allow: [] } }),
    });
    const result = run(["setup", PROJECT], { fs });
    expect(result.exitCode).toBe(1);
    expect(written.size).toBe(0);
  });

  test("an existing settings file with nobody to ask is left alone, and the seed still counts", () => {
    const { fs, written } = fakeFs(
      [PROJECT, "/project/package.json"],
      withSettings({ permissions: { allow: [] } }),
    );
    // One file written is enough for 0. The settings file is untouched, and the
    // report says so — a run that did part of what it came for is not a failure.
    const result = run(["setup", PROJECT], { fs });
    expect(result.exitCode).toBe(0);
    expect(written.has(SETTINGS)).toBe(false);
    expect(written.has(GUIDANCE)).toBe(true);
  });

  test("a path that does not exist is 2", () => {
    const { fs } = fakeFs([]);
    const result = run(["setup", "/nope"], { fs });
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("/nope");
  });

  test("a dry run that has something to write is 0", () => {
    const { fs, written } = fakeFs([PROJECT, "/project/pyproject.toml"]);
    const result = run(["setup", PROJECT, "--dry-run"], { fs });
    expect(result.exitCode).toBe(0);
    expect(written.size).toBe(0);
  });
});

describe("setup argument parsing", () => {
  test("with no path it falls back to the working directory", () => {
    const { fs, written } = fakeFs([PROJECT, "/project/package.json"]);
    const result = run(["setup"], { fs, cwd: PROJECT });
    expect(result.exitCode).toBe(0);
    expect([...written.keys()]).toEqual([SETTINGS, CODEX_CONFIG, GUIDANCE, POINTER]);
  });

  test("the flag may come before the path", () => {
    const { fs } = fakeFs([PROJECT, "/project/package.json"]);
    const before = run(["setup", "--dry-run", PROJECT], { fs });
    const after = run(["setup", PROJECT, "--dry-run"], { fs });
    expect(before).toEqual(after);
  });

  test("a second path is refused instead of being ignored", () => {
    const { fs } = fakeFs([PROJECT]);
    const result = run(["setup", PROJECT, "/other"], { fs });
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("/other");
  });

  test("an unknown flag is refused", () => {
    const { fs } = fakeFs([PROJECT, "/project/package.json"]);
    const result = run(["setup", PROJECT, "--force"], { fs });
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("--force");
  });

  test("--dry-run on doctor is refused, since it would do nothing there", () => {
    const result = run(["doctor", "--dry-run"], {
      platformName: "darwin",
      which: fakeWhich(ALL_PRESENT_DARWIN),
    });
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("--dry-run");
  });

  test("--help mentions setup", () => {
    expect(run(["--help"], {}).stdout).toContain("prep setup");
  });
});

describe("setup output", () => {
  test("names the detected type and the file it wrote", () => {
    const { fs } = fakeFs([PROJECT, "/project/package.json"]);
    const stdout = run(["setup", PROJECT], { fs }).stdout;
    expect(stdout).toContain("node");
    expect(stdout).toContain("package.json");
    expect(stdout).toContain("Bash(npm:*)");
    expect(stdout).toContain(SETTINGS);
  });

  test("a polyglot project shows both types and both allowlists", () => {
    const { fs } = fakeFs([PROJECT, "/project/package.json", "/project/pyproject.toml"]);
    const stdout = run(["setup", PROJECT], { fs }).stdout;
    expect(stdout).toContain("node");
    expect(stdout).toContain("python");
    expect(stdout).toContain("Bash(npm:*)");
    expect(stdout).toContain("Bash(uv:*)");
  });

  test("an existing file with nobody to ask shows the merge and says nothing was written", () => {
    const { fs } = fakeFs(
      [PROJECT, "/project/package.json"],
      withSettings({ permissions: { allow: [] } }),
    );
    const stdout = run(["setup", PROJECT], { fs }).stdout;
    expect(stdout).toContain("already exists");
    expect(stdout).toContain("Nothing has been written yet");
    expect(stdout).toContain("+ Bash(npm:*)");
  });

  test("with no marker it names the markers it looked for and what it still wrote", () => {
    const stdout = run(["setup", PROJECT], { fs: fakeFs([PROJECT]).fs }).stdout;
    expect(stdout).toContain("package.json");
    expect(stdout).toContain("pyproject.toml");
    expect(stdout).toContain("type-independent");
    expect(stdout).toContain("Read(./.env)");
    expect(stdout).toContain("Bash(git:*)");
    expect(stdout).not.toContain("Bash(npm:*)");
  });

  test("a dry run says nothing was written, but still shows the rules", () => {
    const { fs } = fakeFs([PROJECT, "/project/package.json"]);
    const stdout = run(["setup", PROJECT, "--dry-run"], { fs }).stdout;
    expect(stdout).toContain("Bash(npm:*)");
    expect(stdout).toContain("Dry run");
  });
});

describe("setup idempotence", () => {
  test("the second run over the first run's own file does nothing", () => {
    const { fs, written } = fakeFs([PROJECT, "/project/package.json"]);
    expect(run(["setup", PROJECT], { fs }).exitCode).toBe(0);
    const first = written.get(SETTINGS);

    const second = run(["setup", PROJECT], { fs });
    expect(second.exitCode).toBe(1);
    expect(written.get(SETTINGS)).toBe(first);
  });

  test("a merge somebody approved is not proposed again", () => {
    const { fs, written } = fakeFs(
      [PROJECT, "/project/package.json"],
      withSettings({ permissions: { allow: ["Bash(terraform:*)"] } }),
    );
    const { prompt } = fakePrompt({ confirm: true });

    expect(run(["setup", PROJECT], { fs, prompt }).exitCode).toBe(0);
    const merged = written.get(SETTINGS);

    const second = run(["setup", PROJECT], { fs, prompt });
    expect(second.exitCode).toBe(1);
    expect(second.stdout).toContain("already covers this baseline");
    expect(written.get(SETTINGS)).toBe(merged);
  });
});

describe("merging into an existing settings file", () => {
  // A guidance file is already there, so the seed has nothing to do and every
  // write in this block is the merge under test.
  const PRESENT = [PROJECT, "/project/package.json"];
  const MINE = {
    ...SEEDED,
    ...withSettings({
      permissions: { defaultMode: "plan", allow: ["Bash(terraform:*)"] },
      model: "opus",
    }),
  };

  test("approving writes the merge and is 0", () => {
    const { fs, written } = fakeFs(PRESENT, MINE);
    const { prompt } = fakePrompt({ confirm: true });

    const result = run(["setup", PROJECT], { fs, prompt });
    expect(result.exitCode).toBe(0);

    const settings = JSON.parse(written.get(SETTINGS)!);
    expect(settings.permissions.allow).toContain("Bash(terraform:*)");
    expect(settings.permissions.allow).toContain("Bash(npm:*)");
    expect(settings.model).toBe("opus");
  });

  test("refusing leaves the file byte for byte as it was, and is 1", () => {
    const { fs, written } = fakeFs(PRESENT, MINE);
    const { prompt } = fakePrompt({ confirm: false });

    const result = run(["setup", PROJECT], { fs, prompt });
    expect(result.exitCode).toBe(1);
    expect(written.size).toBe(0);
    expect(result.stdout).toContain("exactly as it was");
  });

  test("the diff is in front of the person before the first question", () => {
    const { fs } = fakeFs(PRESENT, MINE);
    const { prompt, shown, asked } = fakePrompt({ confirm: true });

    run(["setup", PROJECT], { fs, prompt });
    expect(shown[0]).toContain("+ Bash(npm:*)");
    expect(shown[0]).toContain("To decide (1)");
    expect(asked).toEqual(["defaultMode", "Apply this merge?"]);
  });

  test("the last thing shown before writing is what will land", () => {
    const { fs } = fakeFs(PRESENT, MINE);
    const { prompt, shown } = fakePrompt({ confirm: true, choose: "preset" });

    run(["setup", PROJECT], { fs, prompt });
    const summary = shown[shown.length - 1]!;
    expect(summary).toContain(SETTINGS);
    expect(summary).toContain("acceptEdits");
  });

  test("the answer to a conflict is the value that lands", () => {
    for (const [side, mode] of [
      ["existing", "plan"],
      ["preset", "acceptEdits"],
    ] as const) {
      const { fs, written } = fakeFs(PRESENT, MINE);
      const { prompt } = fakePrompt({ confirm: true, choose: side });

      run(["setup", PROJECT], { fs, prompt });
      expect(JSON.parse(written.get(SETTINGS)!).permissions.defaultMode).toBe(mode);
    }
  });

  describe("turning an installed plugin on", () => {
    const TYPESCRIPT = "typescript-lsp@claude-plugins-official";
    /** The install record of a machine holding it across every project. */
    const HELD = {
      [RECORD]: JSON.stringify({ version: 2, plugins: { [TYPESCRIPT]: [{ scope: "user" }] } }),
    };

    test("the entry shows in the diff before anybody answers, and lands once they do", () => {
      const { fs, written } = fakeFs(PRESENT, { ...MINE, ...HELD });
      const { prompt, shown } = fakePrompt({ confirm: true });

      const result = run(["setup", PROJECT], { fs, prompt });
      expect(result.exitCode).toBe(0);
      expect(shown[0]).toContain(`+ ${TYPESCRIPT}`);
      expect(JSON.parse(written.get(SETTINGS)!).enabledPlugins).toEqual({ [TYPESCRIPT]: true });
    });

    test("the summary before writing says a plugin is being turned on", () => {
      const { fs } = fakeFs(PRESENT, { ...MINE, ...HELD });
      const { prompt, shown } = fakePrompt({ confirm: true });

      run(["setup", PROJECT], { fs, prompt });
      expect(shown[shown.length - 1]).toContain("1 plugin");
    });

    test("refusing the merge leaves no entry behind", () => {
      const { fs, written } = fakeFs(PRESENT, { ...MINE, ...HELD });
      const { prompt } = fakePrompt({ confirm: false });

      expect(run(["setup", PROJECT], { fs, prompt }).exitCode).toBe(1);
      expect(written.size).toBe(0);
    });

    test("a plugin the machine does not hold is named, and no entry is written", () => {
      const { fs, written } = fakeFs(PRESENT, MINE);
      const { prompt } = fakePrompt({ confirm: true });

      const result = run(["setup", PROJECT], { fs, prompt });
      expect(result.stdout).toContain(`claude plugin install ${TYPESCRIPT}`);
      expect(JSON.parse(written.get(SETTINGS)!).enabledPlugins).toBeUndefined();
    });

    test("an entry somebody switched off survives the merge untouched", () => {
      const { fs, written } = fakeFs(PRESENT, {
        ...SEEDED,
        ...HELD,
        ...withSettings({ permissions: { allow: [] }, enabledPlugins: { [TYPESCRIPT]: false } }),
      });
      const { prompt } = fakePrompt({ confirm: true });

      const result = run(["setup", PROJECT], { fs, prompt });
      expect(JSON.parse(written.get(SETTINGS)!).enabledPlugins).toEqual({ [TYPESCRIPT]: false });
      // Nothing is recommended once the file has answered, so the block is gone.
      expect(result.stdout).not.toContain("Plugins (");
    });
  });

  test("a merge with nothing to decide asks once and writes", () => {
    const { fs, written } = fakeFs(PRESENT, withSettings({ permissions: { allow: [] } }));
    const { prompt, asked } = fakePrompt({ confirm: true });

    expect(run(["setup", PROJECT], { fs, prompt }).exitCode).toBe(0);
    expect(asked).toEqual(["Apply this merge?"]);
    expect(written.has(SETTINGS)).toBe(true);
  });

  test("--json asks nothing and writes nothing, so a pipe never stops on a question", () => {
    const { fs, written } = fakeFs(PRESENT, MINE);
    const { prompt, asked, shown } = fakePrompt({ confirm: true });

    const result = run(["setup", PROJECT, "--json"], { fs, prompt });
    expect(asked).toEqual([]);
    expect(shown).toEqual([]);
    expect(written.size).toBe(0);
    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout).artifacts[0].status).toBe("planned");
  });

  test("--dry-run asks nothing, writes nothing, and is 0", () => {
    const { fs, written } = fakeFs(PRESENT, MINE);
    const { prompt, asked } = fakePrompt({ confirm: true });

    const result = run(["setup", PROJECT, "--dry-run"], { fs, prompt });
    expect(asked).toEqual([]);
    expect(written.size).toBe(0);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("+ Bash(npm:*)");
  });

  test("a file prep cannot merge is 2, with the path on stderr and nothing written", () => {
    const { fs, written } = fakeFs(PRESENT, { [SETTINGS]: "{ not json" });
    const { prompt } = fakePrompt({ confirm: true });

    const result = run(["setup", PROJECT], { fs, prompt });
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain(SETTINGS);
    expect(written.size).toBe(0);
  });

  test("a project with no settings file is written without a question", () => {
    const { fs, written } = fakeFs(PRESENT);
    const { prompt, asked } = fakePrompt({ confirm: false });

    expect(run(["setup", PROJECT], { fs, prompt }).exitCode).toBe(0);
    expect(asked).toEqual([]);
    expect(written.has(SETTINGS)).toBe(true);
  });
});

describe("the handoff on the way out", () => {
  /** The three files the harness side leaves behind, all filled in. */
  const SETTLED = {
    "/project/CLAUDE.md": "# p\n\n## Language\n\nEnglish in the repository.\n",
    "/project/docs/agents/issue-tracker.md": "# Issue tracker: GitHub\n\nIssues live there.\n",
    "/project/docs/agents/domain.md": "# Domain Docs\n\nRead CONTEXT.md first.\n",
  };

  const NODE = [PROJECT, "/project/package.json"];

  /**
   * The machine the handoff is read against.
   *
   * Every run here names one. What the footer suggests depends on which
   * harnesses are installed, so a run left to read the real PATH would say
   * something different on each machine the suite runs on.
   */
  const WITH_HARNESSES = fakeWhich(HARNESSES);
  const WITHOUT_HARNESSES = fakeWhich({});

  test("a project that still owes the harness's two is told what to run", () => {
    const { fs } = fakeFs(NODE);
    const result = run(["setup", PROJECT], { fs, which: WITH_HARNESSES });
    expect(result.stdout).toContain("2 still owed");
    expect(result.stdout).toContain("claude '/setup-matt-pocock-skills'");
  });

  test("a project with the guidance in place is told there is nothing left", () => {
    const { fs } = fakeFs(NODE, SETTLED);
    const result = run(["setup", PROJECT], { fs, which: WITH_HARNESSES });
    expect(result.stdout).toContain("Nothing owed");
    expect(result.stdout).not.toContain("setup-matt-pocock-skills");
  });

  test("the command names a harness this machine actually holds", () => {
    const { fs } = fakeFs(NODE);
    const result = run(["setup", PROJECT], { fs, which: fakeWhich({ codex: HARNESSES.codex }) });
    expect(result.stdout).toContain("codex '$setup-matt-pocock-skills'");
    expect(result.stdout).not.toContain("claude '");
  });

  test("with no harness here the person is sent to install one, not handed a dead command", () => {
    const { fs } = fakeFs(NODE);
    const result = run(["setup", PROJECT], { fs, which: WITHOUT_HARNESSES });
    expect(result.stdout).toContain("no agent CLI here");
    expect(result.stdout).not.toContain("setup-matt-pocock-skills");
  });

  test("what is still owed does not change the exit code", () => {
    const owing = run(["setup", PROJECT], { fs: fakeFs(NODE).fs, which: WITH_HARNESSES });
    const settled = run(["setup", PROJECT], {
      fs: fakeFs(NODE, SETTLED).fs,
      which: WITH_HARNESSES,
    });
    expect(owing.exitCode).toBe(0);
    expect(settled.exitCode).toBe(owing.exitCode);
  });

  test("which harness is here does not change it either", () => {
    const held = run(["setup", PROJECT], { fs: fakeFs(NODE).fs, which: WITH_HARNESSES });
    const none = run(["setup", PROJECT], { fs: fakeFs(NODE).fs, which: WITHOUT_HARNESSES });
    expect(none.exitCode).toBe(held.exitCode);
  });

  test("suggesting a command is all it does — no source file can start one", () => {
    // The footer names commands to run next. Reading them back as something
    // prep runs is the mistake this guards: no path through setup, and no path
    // anywhere else, reaches a process (docs/adr/0010).
    const started: string[] = [];
    for (const relative of new Bun.Glob("**/*.ts").scanSync("src")) {
      const source = readFileSync(`src/${relative}`, "utf8");
      if (/Bun\.spawn|child_process|execSync/.test(source)) started.push(relative);
    }
    expect(started).toEqual([]);
  });

  test("a dry run reports it without writing", () => {
    const { fs, written } = fakeFs(NODE);
    const result = run(["setup", PROJECT, "--dry-run"], { fs, which: WITH_HARNESSES });
    expect(result.stdout).toContain("3 still owed");
    expect(result.stdout).toContain("claude '/setup-matt-pocock-skills'");
    expect(written.size).toBe(0);
  });
});

describe("a run with several files", () => {
  const OTHER = "/project/.other/settings.json";

  /** A baseline that adds one rule to a file holding one rule of its own. */
  function pending(path: string): SettingsArtifact {
    const plan = planMerge(
      { permissions: { allow: ["Bash(terraform:*)"] } },
      {
        permissions: {
          defaultMode: "acceptEdits",
          deny: [],
          allow: ["Bash(npm:*)"],
          ask: [],
        },
      },
    );
    return { kind: "claude-settings", path, status: "planned", settings: plan.merged, plan };
  }

  function outcomeOf(artifacts: Artifact[]): SetupOutcome {
    const base: SetupOutcome = {
      root: PROJECT,
      detected: ["node"],
      artifacts,
      harnesses: [],
      plugins: [],
      handoff: [],
      next: [],
    };
    return { ...base, next: nextSteps(base, false) };
  }

  /** A person who answers each question in turn, so one file can be taken and the next refused. */
  function answering(confirms: boolean[]) {
    const asked: string[] = [];
    const prompt: SetupPrompt = {
      show: () => {},
      confirm: (question) => {
        asked.push(question);
        return confirms[asked.length - 1] ?? false;
      },
      choose: () => "existing",
    };
    return { prompt, asked };
  }

  test("each file is asked about on its own", () => {
    const { fs } = fakeFs([PROJECT]);
    const { prompt, asked } = answering([true, true]);

    approve(outcomeOf([pending(SETTINGS), pending(OTHER)]), prompt, { fs });
    expect(asked).toEqual(["Apply this merge?", "Apply this merge?"]);
  });

  test("refusing one file does not stop the next from being written", () => {
    const { fs, written } = fakeFs([PROJECT]);
    const { prompt } = answering([false, true]);

    const after = approve(outcomeOf([pending(SETTINGS), pending(OTHER)]), prompt, { fs });
    expect(after.artifacts.map((one) => one.status)).toEqual(["declined", "merged"]);
    expect([...written.keys()]).toEqual([OTHER]);
  });

  test("a file that was already settled is not asked about again", () => {
    const { fs, written } = fakeFs([PROJECT]);
    const { prompt, asked } = answering([true]);
    const settled: Artifact = {
      kind: "claude-settings",
      path: SETTINGS,
      status: "skipped",
      settings: null,
      plan: null,
    };

    const after = approve(outcomeOf([settled, pending(OTHER)]), prompt, { fs });
    expect(asked).toHaveLength(1);
    expect(after.artifacts[0]!.status).toBe("skipped");
    expect([...written.keys()]).toEqual([OTHER]);
  });

  test("one written file is enough for 0, whatever the others ended on", () => {
    const cases: [Artifact["status"][], boolean, number][] = [
      // One written, one refused: the run did part of what it came for.
      [["merged", "declined"], false, 0],
      [["applied", "skipped"], false, 0],
      // Nothing written at all is the ordinary observation, not a failure.
      [["declined", "skipped"], false, 1],
      [["planned", "planned"], false, 1],
      // A dry run was asked for a plan and produced one.
      [["planned", "skipped"], true, 0],
      [["skipped", "skipped"], true, 1],
    ];

    for (const [statuses, dryRun, code] of cases) {
      const artifacts = statuses.map((status, index): Artifact => ({
        kind: "claude-settings",
        path: index === 0 ? SETTINGS : OTHER,
        status,
        settings: null,
        plan: null,
      }));
      expect(setupExitCode(outcomeOf(artifacts), dryRun)).toBe(code);
    }
  });
});
