import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import { type RunDeps, type RunResult, run as runCli, setupExitCode } from "../src/cli.ts";
import { nextSteps } from "../src/next.ts";
import type { Artifact, SetupFs, SetupOutcome, WhichFn } from "../src/types.ts";

/**
 * A fake home directory.
 *
 * Every run goes through here rather than calling the CLI directly, so no test
 * can fall through to the install record in a real home directory.
 */
const HOME = "/home";
const RECORD = "/home/.claude/plugins/installed_plugins.json";

function run(argv: readonly string[], deps: RunDeps = {}): Promise<RunResult> {
  // The check fake answers yes to everything, so chef's pass half is a
  // constant here and no test starts a real process.
  return runCli(argv, { home: HOME, which: SERVERS_FOUND, check: () => true, ...deps });
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

const PROJECT = "/project";
const SETTINGS = "/project/.claude/settings.json";
/** The guidance file prep seeds. */
const GUIDANCE = "/project/AGENTS.md";

/** The file pointing Claude Code at the guidance. */
const POINTER = "/project/CLAUDE.md";
/** The Codex permission file, which prep neither writes nor opens. */
const CODEX_CONFIG = "/project/.codex/config.toml";

/** Every file prep writes, already on disk. A run against this has nothing left to do. */
const SEEDED = {
  [GUIDANCE]: "# AGENTS.md\n\n## Language\n\nEnglish in the repository.\n",
  [POINTER]: "@AGENTS.md\n",
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
  test("no gaps is 0", async () => {
    const result = await run(["chef"], {
      platformName: "darwin",
      which: fakeWhich(ALL_PRESENT_DARWIN),
    });
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
  });

  test("gaps found is 1", async () => {
    const result = await run(["chef"], {
      platformName: "darwin",
      which: fakeWhich({ brew: "/opt/homebrew/bin/brew" }),
    });
    expect(result.exitCode).toBe(1);
  });

  test("a missing prerequisite alone is 1", async () => {
    const result = await run(["chef"], {
      platformName: "darwin",
      which: fakeWhich({ ...STANDARD_DARWIN, ...HARNESSES }),
    });
    expect(result.exitCode).toBe(1);
  });

  test("an unsupported OS is 2", async () => {
    const result = await run(["chef"], { platformName: "win32", which: fakeWhich({}) });
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("WSL");
  });

  test("an unknown subcommand is 2", async () => {
    const result = await run(["install"], { platformName: "darwin", which: fakeWhich({}) });
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("install");
  });

  test("no subcommand gives 2 and the usage text", async () => {
    const result = await run([], { platformName: "darwin", which: fakeWhich({}) });
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("prep chef");
  });

  test("--help is 0", async () => {
    const result = await run(["--help"], { platformName: "darwin", which: fakeWhich({}) });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("prep chef");
  });
});

describe("per-platform guidance", () => {
  test("macOS shows brew commands", async () => {
    const result = await run(["chef"], {
      platformName: "darwin",
      which: fakeWhich({ brew: "/opt/homebrew/bin/brew", git: "/usr/bin/git" }),
    });
    expect(result.stdout).toContain("brew install ripgrep");
    expect(result.stdout).not.toContain("apt install");
  });

  test("Linux shows apt commands", async () => {
    const result = await run(["chef"], {
      platformName: "linux",
      which: fakeWhich({ apt: "/usr/bin/apt", git: "/usr/bin/git" }),
    });
    expect(result.stdout).toContain("sudo apt install -y ripgrep");
    expect(result.stdout).not.toContain("brew install");
  });

  test("on Linux, fdfind alone does not count fd as installed", async () => {
    const result = await run(["chef"], {
      platformName: "linux",
      which: fakeWhich({ apt: "/usr/bin/apt", fdfind: "/usr/bin/fdfind" }),
    });
    expect(result.stdout).not.toContain("✓ fd");
    expect(result.stdout).toContain("sudo apt install -y fd-find");
  });

  test("on Linux, fd on PATH is the whole of what fd needs", async () => {
    const result = await run(["chef"], {
      platformName: "linux",
      which: fakeWhich({ apt: "/usr/bin/apt", fd: "/home/me/.local/bin/fd" }),
    });
    expect(result.stdout).toContain("✓ fd");
    expect(result.stdout).not.toContain("fd-find");
  });

  test("on macOS, fdfind does not fill fd", async () => {
    const result = await run(["chef"], {
      platformName: "darwin",
      which: fakeWhich({ brew: "/opt/homebrew/bin/brew", fdfind: "/usr/bin/fdfind" }),
    });
    expect(result.stdout).toContain("brew install fd");
  });
});

describe("idempotence", () => {
  test("same input gives same output and same exit code", async () => {
    const deps = { platformName: "linux", which: fakeWhich(ALL_PRESENT_LINUX) };
    const first = await run(["chef"], deps);
    const second = await run(["chef"], deps);
    expect(second).toEqual(first);
  });
});

describe("chef changes nothing", () => {
  const HALF_DARWIN = { brew: "/opt/homebrew/bin/brew", ...STANDARD_DARWIN };

  test("the report never claims to have closed a gap", async () => {
    const result = await run(["chef"], {
      platformName: "darwin",
      which: fakeWhich(HALF_DARWIN),
    });
    expect(result.stdout).not.toContain("Installed claude-code");
    expect(result.stdout).not.toContain("(declined)");
    expect(result.stdout).toContain("Run the commands above yourself");
  });

  test("a missing harness stays a gap, so the run ends at 1", async () => {
    const result = await run(["chef"], {
      platformName: "darwin",
      which: fakeWhich(HALF_DARWIN),
    });
    expect(result.stdout).toContain("claude-code");
    expect(result.exitCode).toBe(1);
  });

  test("Linux reports the same way", async () => {
    const result = await run(["chef"], {
      platformName: "linux",
      which: fakeWhich({ apt: "/usr/bin/apt", ...STANDARD_LINUX }),
    });
    expect(result.exitCode).toBe(1);
  });
});

describe("the pass items", () => {
  /** Everything installed, so the pass section is the only variable. */
  const EQUIPPED = { platformName: "darwin", which: fakeWhich(ALL_PRESENT_DARWIN) };

  test("all four are reported when both harnesses are here", async () => {
    const result = await run(["chef"], EQUIPPED);
    for (const name of ["GitHub login", "git identity", "Claude Code login", "Codex login"]) {
      expect(result.stdout).toContain(name);
    }
  });

  test("a harness that is not installed is not asked about", async () => {
    const { codex, ...withoutCodex } = ALL_PRESENT_DARWIN;
    const asked: string[] = [];
    const result = await run(["chef"], {
      platformName: "darwin",
      which: fakeWhich(withoutCodex),
      check: (argv) => {
        asked.push(argv.join(" "));
        return true;
      },
    });
    expect(result.stdout).not.toContain("Codex login");
    expect(asked.some((command) => command.startsWith("codex"))).toBe(false);
  });

  test("a missing pass item shows the command that closes it", async () => {
    const result = await run(["chef"], { ...EQUIPPED, check: () => false });
    expect(result.stdout).toContain("gh auth login");
    expect(result.stdout).toContain("git config --global user.name");
  });

  test("a check that gives no answer reads unknown and names its own command", async () => {
    const result = await run(["chef"], { ...EQUIPPED, check: () => null });
    expect(result.stdout).toContain("unknown");
    expect(result.stdout).toContain("gh auth status");
    expect(result.stdout).toContain("git config --get user.name");
  });

  test("under --json, a slow check shows no progress even with a terminal watching", async () => {
    const writes: string[] = [];
    const result = await run(["chef", "--json"], {
      ...EQUIPPED,
      check: () => new Promise((resolve) => setTimeout(() => resolve(true), 450)),
      progress: (text) => writes.push(text),
    });
    expect(writes).toEqual([]);
    expect(result.exitCode).toBe(0);
  });

  test("with a terminal watching, a slow check names itself and clears the line", async () => {
    const writes: string[] = [];
    await run(["chef"], {
      ...EQUIPPED,
      check: () => new Promise((resolve) => setTimeout(() => resolve(true), 450)),
      progress: (text) => writes.push(text),
    });
    expect(writes.some((text) => text.includes("gh auth status"))).toBe(true);
  });

  test("the project row is absent until a project is named", async () => {
    const result = await run(["chef"], EQUIPPED);
    expect(result.stdout).not.toContain("git repository");
    expect(result.stdout).toContain("Pass (4)");
  });

  test("pass items never change the exit code", async () => {
    // Every account missing on a fully equipped machine is still 0: an account
    // nobody has opened is a legitimate state, not a broken machine.
    expect((await run(["chef"], { ...EQUIPPED, check: () => false })).exitCode).toBe(0);
    expect((await run(["chef"], { ...EQUIPPED, check: () => null })).exitCode).toBe(0);
    // And a ready pass buys nothing back: gaps still make it 1.
    const gappy = { platformName: "darwin", which: fakeWhich({ brew: "/opt/homebrew/bin/brew" }) };
    expect((await run(["chef"], { ...gappy, check: () => true })).exitCode).toBe(1);
  });
});

describe("chef takes a path", () => {
  /** Everything installed and every account settled, so the project half is the only variable. */
  const EQUIPPED = { platformName: "darwin", which: fakeWhich(ALL_PRESENT_DARWIN) };

  /** A project already carrying everything the harness side owes. */
  const HANDED_OVER = {
    [GUIDANCE]: "# Project\n\n## Language\n\nEnglish in the repository.\n",
    "/project/docs/agents/issue-tracker.md": "# Issue tracker: GitHub\n\nIssues live in GitHub.\n",
    "/project/docs/agents/domain.md": "# Domain\n\nThe glossary is CONTEXT.md.\n",
  };

  test("with no path, the report says nothing about any project", async () => {
    const result = await run(["chef"], EQUIPPED);
    expect(result.stdout).not.toContain("Handoff");
    expect(result.stdout.split("\n")[0]).toBe("prep chef · darwin");
  });

  test("with a path, the report names the project and what it owes", async () => {
    const { fs } = fakeFs([PROJECT]);
    const result = await run(["chef", PROJECT], { ...EQUIPPED, fs });
    expect(result.stdout.split("\n")[0]).toBe(`prep chef · darwin · ${PROJECT}`);
    expect(result.stdout).toContain("Handoff (3)");
    expect(result.stdout).toContain("no docs/agents/domain.md");
  });

  test("a directory that is no repository is a pass row, with git init beside it", async () => {
    const { fs } = fakeFs([PROJECT]);
    const result = await run(["chef", PROJECT], { ...EQUIPPED, fs });
    expect(result.stdout).toMatch(/✗ git repository\s+git init/);
  });

  test("a repository closes that row without closing the others", async () => {
    const { fs } = fakeFs([PROJECT, "/project/.git"]);
    const result = await run(["chef", PROJECT], { ...EQUIPPED, fs });
    expect(result.stdout).toContain("✓ git repository");
    expect(result.stdout).toContain("Handoff (3)");
  });

  test("a project owing nothing still reports its rows, so the section answers the question", async () => {
    const { fs } = fakeFs([PROJECT, "/project/.git"], HANDED_OVER);
    const result = await run(["chef", PROJECT], { ...EQUIPPED, fs });
    expect(result.stdout).toContain("✓ language");
    expect(result.stdout).toContain("✓ issue tracker");
    expect(result.stdout).toContain("✓ domain docs");
  });

  test("nothing about the project moves the exit code", async () => {
    // An empty directory that is no repository and owes all three items: still 0
    // on a machine with no gaps. Being owed something is not a failed run.
    const { fs } = fakeFs([PROJECT]);
    expect((await run(["chef", PROJECT], { ...EQUIPPED, fs })).exitCode).toBe(0);
    // And a project that owes nothing buys no gap back.
    const gappy = { platformName: "darwin", which: fakeWhich({ brew: "/opt/homebrew/bin/brew" }) };
    const settled = fakeFs([PROJECT, "/project/.git"], HANDED_OVER);
    expect((await run(["chef", PROJECT], { ...gappy, fs: settled.fs })).exitCode).toBe(1);
  });

  test("chef writes nothing, whatever the project is missing", async () => {
    const { fs, written } = fakeFs([PROJECT]);
    await run(["chef", PROJECT], { ...EQUIPPED, fs });
    expect([...written.keys()]).toEqual([]);
  });

  test("a path that is not a directory is a tool error, not an empty project", async () => {
    const { fs } = fakeFs([PROJECT]);
    const result = await run(["chef", "/nowhere"], { ...EQUIPPED, fs });
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("Not a project directory: /nowhere");
  });

  test("a guidance file that cannot be read stops the run rather than reading as absent", async () => {
    const { fs } = fakeFs([PROJECT, GUIDANCE]);
    const result = await run(["chef", PROJECT], { ...EQUIPPED, fs });
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("Could not read AGENTS.md");
  });

  test("two paths are refused — chef takes one project at most", async () => {
    const { fs } = fakeFs([PROJECT]);
    const result = await run(["chef", PROJECT, "/other"], { ...EQUIPPED, fs });
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("chef takes one path at most");
  });

  test("with no path chef never guesses one, even where setup would fall back to it", async () => {
    const { fs } = fakeFs([PROJECT]);
    const result = await run(["chef"], { ...EQUIPPED, fs, cwd: PROJECT });
    expect(result.stdout).not.toContain("Handoff");
    expect(result.stdout).not.toContain("git repository");
  });

  test("run from a home directory that looks like a project, it still reports no project", async () => {
    // The trap the argument exists to avoid: `~/.claude/settings.json` stands on
    // nearly every machine running Claude Code, and `~` under git for dotfiles
    // makes it a repository with a settings file and a CLAUDE.md. Any detection
    // rule strong enough to recognise an empty project recognises this.
    const home = "/home/me";
    const looksLikeAProject = fakeFs(
      [home, `${home}/.git`, `${home}/.claude/settings.json`],
      { [`${home}/CLAUDE.md`]: "@AGENTS.md\n" },
    );
    const result = await run(["chef"], {
      ...EQUIPPED,
      fs: looksLikeAProject.fs,
      cwd: home,
      home,
    });
    expect(result.stdout.split("\n")[0]).toBe("prep chef · darwin");
    expect(result.stdout).not.toContain("Handoff");
    expect(result.stdout).not.toContain(home);
  });

  test("the same project reported twice reads the same both times", async () => {
    const deps = { ...EQUIPPED, fs: fakeFs([PROJECT]).fs };
    expect(await run(["chef", PROJECT], deps)).toEqual(await run(["chef", PROJECT], deps));
  });
});

describe("setup exit codes", () => {
  test("writing the guidance is 0", async () => {
    const { fs, written } = fakeFs([PROJECT, "/project/package.json"]);
    const result = await run(["setup", PROJECT], { fs });
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(written.has(GUIDANCE)).toBe(true);
  });

  test("no known marker writes the same two files, so 0", async () => {
    const { fs, written } = fakeFs([PROJECT]);
    const result = await run(["setup", PROJECT], { fs });
    expect(result.exitCode).toBe(0);
    expect([...written.keys()]).toEqual([GUIDANCE, POINTER]);
  });

  test("a run with nothing left to write is 1", async () => {
    const { fs, written } = fakeFs([PROJECT, "/project/package.json"], SEEDED);
    const result = await run(["setup", PROJECT], { fs });
    expect(result.exitCode).toBe(1);
    expect(written.size).toBe(0);
  });

  test("a path that does not exist is 2", async () => {
    const { fs } = fakeFs([]);
    const result = await run(["setup", "/nope"], { fs });
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("/nope");
  });

  test("a dry run that has something to write is 0", async () => {
    const { fs, written } = fakeFs([PROJECT, "/project/pyproject.toml"]);
    const result = await run(["setup", PROJECT, "--dry-run"], { fs });
    expect(result.exitCode).toBe(0);
    expect(written.size).toBe(0);
  });

  test("a dry run with nothing to write is 1", async () => {
    const { fs } = fakeFs([PROJECT, "/project/package.json"], SEEDED);
    expect((await run(["setup", PROJECT, "--dry-run"], { fs })).exitCode).toBe(1);
  });
});

describe("setup argument parsing", () => {
  test("with no path it falls back to the working directory", async () => {
    const { fs, written } = fakeFs([PROJECT, "/project/package.json"]);
    const result = await run(["setup"], { fs, cwd: PROJECT });
    expect(result.exitCode).toBe(0);
    expect([...written.keys()]).toEqual([GUIDANCE, POINTER]);
  });

  test("the flag may come before the path", async () => {
    const { fs } = fakeFs([PROJECT, "/project/package.json"]);
    const before = await run(["setup", "--dry-run", PROJECT], { fs });
    const after = await run(["setup", PROJECT, "--dry-run"], { fs });
    expect(before).toEqual(after);
  });

  test("a second path is refused instead of being ignored", async () => {
    const { fs } = fakeFs([PROJECT]);
    const result = await run(["setup", PROJECT, "/other"], { fs });
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("/other");
  });

  test("an unknown flag is refused", async () => {
    const { fs } = fakeFs([PROJECT, "/project/package.json"]);
    const result = await run(["setup", PROJECT, "--force"], { fs });
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("--force");
  });

  test("--dry-run on chef is refused, since it would do nothing there", async () => {
    const result = await run(["chef", "--dry-run"], {
      platformName: "darwin",
      which: fakeWhich(ALL_PRESENT_DARWIN),
    });
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("--dry-run");
  });

  test("--help mentions setup", async () => {
    expect((await run(["--help"], {})).stdout).toContain("prep setup");
  });

  test("--help promises no permission file", async () => {
    const usage = (await run(["--help"], {})).stdout;
    expect(usage).toContain("prep writes no permission or settings file");
    expect(usage).not.toContain("config.toml");
    expect(usage).not.toContain("allowlist");
  });
});

describe("setup output", () => {
  test("names the detected type and the files it wrote", async () => {
    const { fs } = fakeFs([PROJECT, "/project/package.json"]);
    const stdout = (await run(["setup", PROJECT], { fs })).stdout;
    expect(stdout).toContain("node");
    expect(stdout).toContain("package.json");
    expect(stdout).toContain(`Wrote ${GUIDANCE}`);
    expect(stdout).toContain(`Wrote ${POINTER}`);
  });

  test("a polyglot project shows both types and both plugins", async () => {
    const { fs } = fakeFs([PROJECT, "/project/package.json", "/project/pyproject.toml"]);
    const stdout = (await run(["setup", PROJECT], { fs })).stdout;
    expect(stdout).toContain("node");
    expect(stdout).toContain("python");
    expect(stdout).toContain("typescript-lsp");
    expect(stdout).toContain("pyright-lsp");
  });

  test("no permission rule is shown, because none is written", async () => {
    const { fs } = fakeFs([PROJECT, "/project/package.json"]);
    const stdout = (await run(["setup", PROJECT], { fs })).stdout;
    for (const gone of ["Bash(", "Read(./.env)", "Allowing", "Denying", "acceptEdits"]) {
      expect(stdout).not.toContain(gone);
    }
  });

  test("with no marker it names the markers it looked for", async () => {
    const stdout = (await run(["setup", PROJECT], { fs: fakeFs([PROJECT]).fs })).stdout;
    expect(stdout).toContain("package.json");
    expect(stdout).toContain("pyproject.toml");
    expect(stdout).not.toContain("Plugins (");
  });

  test("a dry run says nothing was written", async () => {
    const { fs } = fakeFs([PROJECT, "/project/package.json"]);
    const stdout = (await run(["setup", PROJECT, "--dry-run"], { fs })).stdout;
    expect(stdout).toContain("Dry run");
    expect(stdout).not.toContain("Wrote ");
  });
});

describe("setup idempotence", () => {
  test("the second run over the first run's own files does nothing", async () => {
    const { fs, written } = fakeFs([PROJECT, "/project/package.json"]);
    expect((await run(["setup", PROJECT], { fs })).exitCode).toBe(0);
    const first = new Map(written);

    const second = await run(["setup", PROJECT], { fs });
    expect(second.exitCode).toBe(1);
    expect(written).toEqual(first);
  });

  test("the second run reports the same thing every time after", async () => {
    const { fs } = fakeFs([PROJECT, "/project/package.json"]);
    await run(["setup", PROJECT], { fs });
    expect(await run(["setup", PROJECT], { fs })).toEqual(await run(["setup", PROJECT], { fs }));
  });
});

describe("setup leaves the permission files alone", () => {
  const PRESENT = [PROJECT, "/project/package.json"];
  const TYPESCRIPT = "typescript-lsp@claude-plugins-official";
  /** The install record of a machine holding it across every project. */
  const HELD = {
    [RECORD]: JSON.stringify({ version: 2, plugins: { [TYPESCRIPT]: [{ scope: "user" }] } }),
  };
  const MINE = withSettings({
    permissions: { defaultMode: "plan", allow: ["Bash(terraform:*)"] },
    model: "opus",
  });

  test("a project with neither file gets neither", async () => {
    const { fs, written } = fakeFs(PRESENT);
    await run(["setup", PROJECT], { fs, which: fakeWhich(HARNESSES) });
    expect(written.has(SETTINGS)).toBe(false);
    expect(written.has(CODEX_CONFIG)).toBe(false);
  });

  test("an existing settings file is not written to, and is not reported as a file", async () => {
    const { fs, written } = fakeFs(PRESENT, MINE);
    const result = await run(["setup", PROJECT], { fs });
    expect(result.exitCode).toBe(0);
    expect(written.has(SETTINGS)).toBe(false);
    expect(fs.read(SETTINGS)).toBe(MINE[SETTINGS]!);
    expect(result.stdout).not.toContain(SETTINGS);
  });

  test("an existing Codex config is not written to either", async () => {
    const mine = 'model = "o3"\n';
    const { fs, written } = fakeFs(PRESENT, { [CODEX_CONFIG]: mine });
    const result = await run(["setup", PROJECT], { fs, which: fakeWhich(HARNESSES) });
    expect(written.has(CODEX_CONFIG)).toBe(false);
    expect(fs.read(CODEX_CONFIG)).toBe(mine);
    expect(result.stdout).not.toContain("config.toml");
  });

  test("an installed plugin is named with the command that turns it on, and no entry is written", async () => {
    const { fs, written } = fakeFs(PRESENT, { ...MINE, ...HELD });
    const result = await run(["setup", PROJECT], { fs });
    expect(result.stdout).toContain(`claude plugin enable ${TYPESCRIPT} --scope project`);
    expect(written.has(SETTINGS)).toBe(false);
  });

  test("a plugin the machine does not hold is named with the command that installs it", async () => {
    const { fs, written } = fakeFs(PRESENT, MINE);
    const result = await run(["setup", PROJECT], { fs });
    expect(result.stdout).toContain(`claude plugin install ${TYPESCRIPT}`);
    expect(written.has(SETTINGS)).toBe(false);
  });

  test("an entry somebody switched off is an answer, so nothing is recommended", async () => {
    const { fs } = fakeFs(PRESENT, {
      ...HELD,
      ...withSettings({ permissions: { allow: [] }, enabledPlugins: { [TYPESCRIPT]: false } }),
    });
    const result = await run(["setup", PROJECT], { fs });
    expect(result.stdout).not.toContain("Plugins (");
  });

  test("the plugin block is shown on a machine with no Claude Code", async () => {
    const { fs } = fakeFs(PRESENT, HELD);
    const result = await run(["setup", PROJECT], { fs, which: fakeWhich({ codex: HARNESSES.codex }) });
    expect(result.stdout).toContain("Plugins (1)");
  });

  test("a settings file prep cannot read is 2, with the path on stderr and nothing written", async () => {
    const { fs, written } = fakeFs(PRESENT, { [SETTINGS]: "{ not json" });
    const result = await run(["setup", PROJECT], { fs });
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain(SETTINGS);
    expect(written.size).toBe(0);
  });

  test("--json and --dry-run leave both files alone too", async () => {
    for (const flag of ["--json", "--dry-run"]) {
      const { fs, written } = fakeFs(PRESENT, { ...MINE, ...HELD });
      await run(["setup", PROJECT, flag], { fs, which: fakeWhich(HARNESSES) });
      expect(written.has(SETTINGS)).toBe(false);
      expect(written.has(CODEX_CONFIG)).toBe(false);
    }
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

  test("a project that still owes the harness's two is told what to run", async () => {
    const { fs } = fakeFs(NODE);
    const result = await run(["setup", PROJECT], { fs, which: WITH_HARNESSES });
    expect(result.stdout).toContain("2 still owed");
    expect(result.stdout).toContain("claude '/setup-matt-pocock-skills'");
  });

  test("a project with the guidance in place is told there is nothing left", async () => {
    const { fs } = fakeFs(NODE, SETTLED);
    const result = await run(["setup", PROJECT], { fs, which: WITH_HARNESSES });
    expect(result.stdout).toContain("Nothing owed");
    expect(result.stdout).not.toContain("setup-matt-pocock-skills");
  });

  test("the command names a harness this machine actually holds", async () => {
    const { fs } = fakeFs(NODE);
    const result = await run(["setup", PROJECT], { fs, which: fakeWhich({ codex: HARNESSES.codex }) });
    expect(result.stdout).toContain("codex '$setup-matt-pocock-skills'");
    expect(result.stdout).not.toContain("claude '");
  });

  test("with no harness here the person is sent to install one, not handed a dead command", async () => {
    const { fs } = fakeFs(NODE);
    const result = await run(["setup", PROJECT], { fs, which: WITHOUT_HARNESSES });
    expect(result.stdout).toContain("no agent CLI here");
    expect(result.stdout).not.toContain("setup-matt-pocock-skills");
  });

  test("what is still owed does not change the exit code", async () => {
    // Both projects already hold every file prep writes, so neither run writes
    // anything and the only difference between them is what the harness owes.
    const owing = await run(["setup", PROJECT], {
      fs: fakeFs(NODE, SEEDED).fs,
      which: WITH_HARNESSES,
    });
    const settled = await run(["setup", PROJECT], {
      fs: fakeFs(NODE, SETTLED).fs,
      which: WITH_HARNESSES,
    });
    expect(owing.stdout).toContain("2 still owed");
    expect(settled.stdout).toContain("Nothing owed");
    expect(owing.exitCode).toBe(1);
    expect(settled.exitCode).toBe(owing.exitCode);
  });

  test("which harness is here does not change it either", async () => {
    const held = await run(["setup", PROJECT], { fs: fakeFs(NODE).fs, which: WITH_HARNESSES });
    const none = await run(["setup", PROJECT], { fs: fakeFs(NODE).fs, which: WITHOUT_HARNESSES });
    expect(none.exitCode).toBe(held.exitCode);
  });

  test("the pass checks are the only processes any source file starts", async () => {
    // The footer names commands to run next. Reading them back as something
    // prep runs is the mistake this guards: no path through setup, and no path
    // anywhere else, reaches a process (docs/adr/0010). The one narrowing is
    // pass.ts, whose fixed read-only questions are argued in docs/adr/0026 —
    // a second file spawning is a boundary broken, not a feature added.
    const started: string[] = [];
    for (const relative of new Bun.Glob("**/*.ts").scanSync("src")) {
      const source = readFileSync(`src/${relative}`, "utf8");
      if (/Bun\.spawn|child_process|execSync/.test(source)) started.push(relative);
    }
    expect(started).toEqual(["pass.ts"]);
  });

  test("a dry run reports it without writing", async () => {
    const { fs, written } = fakeFs(NODE);
    const result = await run(["setup", PROJECT, "--dry-run"], { fs, which: WITH_HARNESSES });
    expect(result.stdout).toContain("3 still owed");
    expect(result.stdout).toContain("claude '/setup-matt-pocock-skills'");
    expect(written.size).toBe(0);
  });
});

describe("a run with several files", () => {
  function outcomeOf(statuses: Artifact["status"][]): SetupOutcome {
    const base: SetupOutcome = {
      root: PROJECT,
      detected: ["node"],
      artifacts: statuses.map((status, index): Artifact => ({
        kind: index === 0 ? "agents-md" : "claude-md",
        path: index === 0 ? GUIDANCE : POINTER,
        status,
        contents: null,
      })),
      harnesses: [],
      plugins: [],
      handoff: [],
      next: [],
    };
    return { ...base, next: nextSteps(base) };
  }

  test("one written file is enough for 0, whatever the other ended on", () => {
    const cases: [Artifact["status"][], boolean, number][] = [
      [["applied", "applied"], false, 0],
      // One written, one already standing: the run did what there was to do.
      [["applied", "skipped"], false, 0],
      [["skipped", "applied"], false, 0],
      // Nothing written at all is the ordinary observation, not a failure.
      [["skipped", "skipped"], false, 1],
      [["skipped"], false, 1],
      // A dry run was asked for a plan and produced one.
      [["planned", "planned"], true, 0],
      [["planned", "skipped"], true, 0],
      [["skipped", "skipped"], true, 1],
    ];

    for (const [statuses, dryRun, code] of cases) {
      expect(setupExitCode(outcomeOf(statuses), dryRun)).toBe(code);
    }
  });
});
