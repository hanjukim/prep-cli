import { describe, expect, test } from "bun:test";

import { type RunDeps, type RunResult, run as runCli } from "../src/cli.ts";
import type { SetupFs, WhichFn } from "../src/types.ts";

/** A fake home directory, so no test reads the install record of a real one. */
const HOME = "/home";
const RECORD = "/home/.claude/plugins/installed_plugins.json";

/** A machine with every language server on PATH, so setup's plugin half is the only variable. */
const SERVERS_FOUND: WhichFn = (binary) => `/usr/bin/${binary}`;

function run(argv: readonly string[], deps: RunDeps = {}): Promise<RunResult> {
  // The check fake answers yes to everything, so chef's pass half is a
  // constant here and no test starts a real process.
  return runCli(argv, { home: HOME, which: SERVERS_FOUND, check: () => true, ...deps });
}

/** The install record as the harness writes it, for a machine holding this plugin. */
function heldMachineWide(id: string): Record<string, string> {
  return { [RECORD]: JSON.stringify({ version: 2, plugins: { [id]: [{ scope: "user" }] } }) };
}

/** Only the two extremes, all found and none found, so a growing registry cannot shake these. */
const FOUND_ALL: WhichFn = (binary) => `/usr/bin/${binary}`;
const FOUND_NONE: WhichFn = () => null;

type Payload = {
  platform: string;
  root?: string;
  results: { id: string; status: string; binary: string | null; path: string | null }[];
  pass: { id: string; status: string; checks: string[]; guidance: unknown }[];
  handoff?: { id: string; status: string; path: string | null }[];
};

async function json(argv: readonly string[], platformName: string, which: WhichFn) {
  const result = await run(argv, { platformName, which });
  return { result, payload: result.stdout ? (JSON.parse(result.stdout) as Payload) : null };
}

describe("--json exit codes", () => {
  test("no gaps is 0", async () => {
    const { result } = await json(["chef", "--json"], "darwin", FOUND_ALL);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
  });

  test("gaps found is 1", async () => {
    const { result } = await json(["chef", "--json"], "darwin", FOUND_NONE);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe("");
  });

  test("an unsupported OS is 2 with empty stdout", async () => {
    const result = await run(["chef", "--json"], { platformName: "win32", which: FOUND_NONE });
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("WSL");
  });

  test("exit codes match the human output", async () => {
    for (const [platformName, which] of [
      ["darwin", FOUND_ALL],
      ["darwin", FOUND_NONE],
      ["linux", FOUND_ALL],
      ["linux", FOUND_NONE],
      ["win32", FOUND_NONE],
    ] as const) {
      const human = await run(["chef"], { platformName, which });
      const machine = await run(["chef", "--json"], { platformName, which });
      expect(machine.exitCode).toBe(human.exitCode);
    }
  });
});

describe("--json output", () => {
  test("stdout parses whole as JSON", async () => {
    const { payload } = await json(["chef", "--json"], "linux", FOUND_ALL);
    expect(payload?.platform).toBe("linux");
    expect(payload?.results.length).toBeGreaterThan(0);
  });

  test("the harnesses are reported alongside the standard tools", async () => {
    const { payload } = await json(["chef", "--json"], "linux", FOUND_ALL);
    const ids = payload?.results.map((result) => result.id);
    expect(ids).toContain("claude-code");
    expect(ids).toContain("codex");
  });

  test("the detected platform is carried through", async () => {
    expect((await json(["chef", "--json"], "darwin", FOUND_NONE)).payload?.platform).toBe("darwin");
    expect((await json(["chef", "--json"], "linux", FOUND_NONE)).payload?.platform).toBe("linux");
  });

  test("no human symbols or summary wording leak in", async () => {
    const { result } = await json(["chef", "--json"], "darwin", FOUND_NONE);
    for (const noise of ["✓", "✗", "⚠", "prep chef ·", "Installed", "prep does not install"]) {
      expect(result.stdout).not.toContain(noise);
    }
  });

  test("flag order does not matter", async () => {
    const after = await run(["chef", "--json"], { platformName: "darwin", which: FOUND_ALL });
    const before = await run(["--json", "chef"], { platformName: "darwin", which: FOUND_ALL });
    expect(before).toEqual(after);
  });

  test("same input gives same output and same exit code", async () => {
    const deps = { platformName: "linux", which: FOUND_ALL };
    expect(await run(["chef", "--json"], deps)).toEqual(await run(["chef", "--json"], deps));
  });
});

describe("--json pass", () => {
  test("carries the pass items for the harnesses this machine holds", async () => {
    const { payload } = await json(["chef", "--json"], "darwin", FOUND_ALL);
    expect(payload?.pass.map((item) => item.id)).toEqual([
      "github-login",
      "git-identity",
      "claude-login",
      "codex-login",
    ]);
    expect(payload?.pass.every((item) => item.status === "ready")).toBe(true);
  });

  test("with no harness, only the two machine rows arrive", async () => {
    const { payload } = await json(["chef", "--json"], "darwin", FOUND_NONE);
    expect(payload?.pass.map((item) => item.id)).toEqual(["github-login", "git-identity"]);
  });

  test("an unanswered check comes through as unknown, with its command", async () => {
    const result = await run(["chef", "--json"], {
      platformName: "darwin",
      which: FOUND_ALL,
      check: () => null,
    });
    const payload = JSON.parse(result.stdout) as Payload;
    expect(payload.pass.every((item) => item.status === "unknown")).toBe(true);
    expect(payload.pass[0]?.checks).toEqual(["gh auth status"]);
  });

  test("pass items never move the exit code, in either direction", async () => {
    const missing = await run(["chef", "--json"], {
      platformName: "darwin",
      which: FOUND_ALL,
      check: () => false,
    });
    expect(missing.exitCode).toBe(0);
  });

  test("no account identifier can appear — the entry is status and commands only", async () => {
    const { payload } = await json(["chef", "--json"], "darwin", FOUND_ALL);
    for (const item of payload!.pass) {
      expect(Object.keys(item)).toEqual(["id", "status", "checks", "guidance"]);
    }
  });
});

const PROJECT = "/project";
const SETTINGS = "/project/.claude/settings.json";
/** The guidance file prep seeds. Present in a fixture, it means the seed is skipped. */
const GUIDANCE = "/project/AGENTS.md";

/** A fake file system holding only the given paths. It never touches a real disk. */
function fakeFs(present: readonly string[], contents: Record<string, string> = {}): SetupFs {
  const held = new Map(Object.entries(contents));
  const paths = new Set([...present, ...held.keys()]);
  return {
    exists: (path) => paths.has(path),
    // Only the project root is a directory here. Everything else stands for a file.
    isDirectory: (path) => path === PROJECT && paths.has(PROJECT),
    read: (path) => {
      const text = held.get(path);
      if (text === undefined) throw new Error(`ENOENT: no such file, open '${path}'`);
      return text;
    },
    // A written file is readable from then on, the same as on a real disk: what
    // a run writes, the checks that follow it read back.
    write: (path, text) => {
      held.set(path, text);
      paths.add(path);
    },
  };
}

/** The file pointing Claude Code at the guidance. */
const POINTER = "/project/CLAUDE.md";

/** Every file prep writes, already on disk. A run against this has nothing left to do. */
const SEEDED = {
  [GUIDANCE]: "# AGENTS.md\n\n## Language\n\nEnglish in the repository.\n",
  [POINTER]: "@AGENTS.md\n",
};

describe("--json with a project", () => {
  async function chefJson(argv: readonly string[], fs: SetupFs) {
    const result = await run(argv, { platformName: "darwin", which: FOUND_ALL, fs });
    return { result, payload: result.stdout ? (JSON.parse(result.stdout) as Payload) : null };
  }

  test("with no path, neither project key is emitted at all", async () => {
    // The absence is the answer. An empty `handoff` would read as a project that
    // owes nothing, and the bootstrap script's own step-8 call names no path.
    const { payload } = await json(["chef", "--json"], "darwin", FOUND_ALL);
    expect(Object.keys(payload!)).toEqual(["platform", "results", "pass"]);
  });

  test("with a path, the root and the handoff come through", async () => {
    const { payload } = await chefJson(["chef", "--json", PROJECT], fakeFs([PROJECT]));
    expect(payload?.root).toBe(PROJECT);
    expect(payload?.handoff?.map((entry) => entry.id)).toEqual([
      "language",
      "issue-tracker",
      "domain-docs",
    ]);
    expect(payload?.handoff?.every((entry) => entry.status === "missing")).toBe(true);
  });

  test("a handoff entry is the same three fields the setup contract carries", async () => {
    const { payload } = await chefJson(["chef", "--json", PROJECT], fakeFs([PROJECT], SEEDED));
    for (const entry of payload!.handoff!) {
      expect(Object.keys(entry)).toEqual(["id", "status", "path"]);
    }
  });

  test("the project row joins the pass array, ahead of the machine rows", async () => {
    const { payload } = await chefJson(["chef", "--json", PROJECT], fakeFs([PROJECT]));
    expect(payload?.pass.map((item) => item.id)).toEqual([
      "git-repository",
      "github-login",
      "git-identity",
      "claude-login",
      "codex-login",
    ]);
    expect(payload?.pass[0]?.status).toBe("missing");
    // Nothing was asked as a command, so the entry names none to ask.
    expect(payload?.pass[0]?.checks).toEqual([]);
  });

  test("a repository reads ready on that row", async () => {
    const fs = fakeFs([PROJECT, "/project/.git"]);
    const { payload } = await chefJson(["chef", "--json", PROJECT], fs);
    expect(payload?.pass[0]).toMatchObject({ id: "git-repository", status: "ready" });
  });

  test("an unusable path is plain text on stderr, with empty stdout", async () => {
    const { result } = await chefJson(["chef", "--json", "/nowhere"], fakeFs([PROJECT]));
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("Not a project directory: /nowhere");
  });

  test("the project half moves no exit code", async () => {
    const { result } = await chefJson(["chef", "--json", PROJECT], fakeFs([PROJECT]));
    expect(result.exitCode).toBe(0);
  });

  test("the human report and the machine report agree on the exit code", async () => {
    for (const present of [[PROJECT], [PROJECT, "/project/.git"]]) {
      const human = await run(["chef", PROJECT], {
        platformName: "darwin",
        which: FOUND_ALL,
        fs: fakeFs(present),
      });
      const machine = await run(["chef", "--json", PROJECT], {
        platformName: "darwin",
        which: FOUND_ALL,
        fs: fakeFs(present),
      });
      expect(machine.exitCode).toBe(human.exitCode);
    }
  });
});

type ArtifactPayload = {
  kind: "agents-md" | "claude-md";
  path: string;
  status: string;
  contents: string | null;
};

type SetupPayload = {
  root: string;
  detected: string[];
  artifacts: ArtifactPayload[];
  harnesses: Record<string, unknown>[];
  plugins: {
    name: string;
    marketplace: string;
    status: string;
    server: { binary: string; status: string };
  }[];
  handoff: { id: string; status: string; path: string | null }[];
};

async function setupJson(
  argv: readonly string[],
  present: readonly string[],
  contents: Record<string, string> = {},
) {
  const result = await run(argv, { fs: fakeFs(present, contents) });
  const payload = result.stdout ? (JSON.parse(result.stdout) as SetupPayload) : null;
  // Found by kind, never by position: a consumer that indexes the array breaks
  // the moment a run produces its files in another order.
  const found = (kind: ArtifactPayload["kind"]) =>
    payload?.artifacts.find((one) => one.kind === kind) ?? null;

  return { result, payload, seedFile: found("agents-md"), pointerFile: found("claude-md") };
}

describe("setup --json", () => {
  test("stdout parses whole as JSON and carries the outcome", async () => {
    const { payload, seedFile, pointerFile } = await setupJson(["setup", PROJECT, "--json"], [
      PROJECT,
      "/project/package.json",
    ]);
    expect(payload?.root).toBe(PROJECT);
    expect(payload?.detected).toEqual(["node"]);
    expect(seedFile?.path).toBe(GUIDANCE);
    expect(seedFile?.status).toBe("applied");
    expect(pointerFile?.path).toBe(POINTER);
    expect(pointerFile?.contents).toBe("@AGENTS.md\n");
  });

  test("the two files of prose are the only kinds there are", async () => {
    for (const present of [[PROJECT], [PROJECT, "/project/package.json", "/project/pyproject.toml"]]) {
      const { payload } = await setupJson(["setup", PROJECT, "--json"], present);
      expect(payload?.artifacts.map((one) => one.kind)).toEqual(["agents-md", "claude-md"]);
    }
  });

  test("a settings file that is there is not an artifact, and is not echoed back", async () => {
    const { result, payload } = await setupJson(
      ["setup", PROJECT, "--json"],
      [PROJECT, "/project/package.json"],
      { [SETTINGS]: JSON.stringify({ permissions: { defaultMode: "plan" }, model: "opus" }) },
    );
    expect(result.exitCode).toBe(0);
    expect(payload?.artifacts.map((one) => one.path)).toEqual([GUIDANCE, POINTER]);
    expect(result.stdout).not.toContain("settings.json");
    expect(result.stdout).not.toContain("opus");
  });

  test("files that already stand carry the status without the contents", async () => {
    const { result, seedFile, pointerFile } = await setupJson(
      ["setup", PROJECT, "--json"],
      [PROJECT, "/project/package.json"],
      SEEDED,
    );
    expect(result.exitCode).toBe(1);
    expect(seedFile).toEqual({ kind: "agents-md", path: GUIDANCE, status: "skipped", contents: null });
    expect(pointerFile?.status).toBe("skipped");
  });

  test("no marker gives an empty detected list and the same two files", async () => {
    const { payload, seedFile } = await setupJson(["setup", PROJECT, "--json"], [PROJECT]);
    expect(seedFile?.status).toBe("applied");
    expect(payload?.detected).toEqual([]);
    expect(payload?.plugins).toEqual([]);
  });

  test("a dry run says planned and still shows what it would write", async () => {
    const { seedFile, pointerFile } = await setupJson(
      ["setup", PROJECT, "--dry-run", "--json"],
      [PROJECT, "/project/pyproject.toml"],
    );
    expect(seedFile?.status).toBe("planned");
    expect(seedFile?.contents).toContain("## Language");
    expect(pointerFile?.status).toBe("planned");
  });

  test("a harness row carries an id and whether it is installed, and nothing else", async () => {
    const { payload } = await setupJson(["setup", PROJECT, "--json"], [PROJECT]);
    expect(payload?.harnesses.map((row) => Object.keys(row))).toEqual([
      ["id", "installed"],
      ["id", "installed"],
    ]);
  });

  test("the plugin recommendations carry a name, a marketplace and a status, and no wording", async () => {
    const { result, payload } = await setupJson(["setup", PROJECT, "--json"], [
      PROJECT,
      "/project/package.json",
    ]);
    expect(payload?.plugins).toEqual([
      {
        name: "typescript-lsp",
        marketplace: "claude-plugins-official",
        status: "missing",
        server: { binary: "typescript-language-server", status: "installed" },
      },
    ]);
    for (const noise of ["claude plugin install", "claude plugin enable", "not installed"]) {
      expect(result.stdout).not.toContain(noise);
    }
  });

  test("a plugin the machine holds comes through as a status, and no file is written for it", async () => {
    const fs = fakeFs(
      [PROJECT, "/project/package.json"],
      heldMachineWide("typescript-lsp@claude-plugins-official"),
    );
    const result = await run(["setup", PROJECT, "--json"], { fs });
    const payload = JSON.parse(result.stdout) as SetupPayload;
    expect(payload.plugins[0]?.status).toBe("installed");
    expect(fs.exists(SETTINGS)).toBe(false);
  });

  test("a plugin the settings file already names comes through as answered", async () => {
    const { payload } = await setupJson(
      ["setup", PROJECT, "--json"],
      [PROJECT, "/project/package.json"],
      {
        ...heldMachineWide("typescript-lsp@claude-plugins-official"),
        [SETTINGS]: JSON.stringify({
          enabledPlugins: { "typescript-lsp@claude-plugins-official": false },
        }),
      },
    );
    expect(payload?.plugins[0]?.status).toBe("answered");
  });

  test("the handoff comes through as statuses and paths", async () => {
    const { payload } = await setupJson(["setup", PROJECT, "--json"], [PROJECT, "/project/package.json"], {
      "/project/AGENTS.md": "# p\n\n## Language\n\nEnglish in the repository.\n",
    });
    expect(payload?.handoff).toEqual([
      { id: "language", status: "ready", path: "AGENTS.md" },
      { id: "issue-tracker", status: "missing", path: null },
      { id: "domain-docs", status: "missing", path: null },
    ]);
  });

  test("a dry run carries the handoff as well", async () => {
    const { payload } = await setupJson(["setup", PROJECT, "--dry-run", "--json"], [
      PROJECT,
      "/project/package.json",
    ]);
    expect(payload?.handoff.map((item) => item.status)).toEqual(["missing", "missing", "missing"]);
  });

  test("no human symbols or summary wording leak in", async () => {
    const { result } = await setupJson(["setup", PROJECT, "--json"], [PROJECT, "/project/package.json"]);
    for (const noise of ["✓", "–", "prep setup ·", "Detected", "still owed", "Wrote"]) {
      expect(result.stdout).not.toContain(noise);
    }
  });

  test("a tool error keeps stdout empty", async () => {
    const result = await run(["setup", "/nope", "--json"], { fs: fakeFs([]) });
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("/nope");
  });

  test("exit codes match the human output", async () => {
    for (const present of [
      [PROJECT, "/project/package.json"],
      [PROJECT],
      [PROJECT, "/project/package.json", SETTINGS],
      [],
    ]) {
      const human = await run(["setup", PROJECT], { fs: fakeFs(present) });
      const machine = await run(["setup", PROJECT, "--json"], { fs: fakeFs(present) });
      expect(machine.exitCode).toBe(human.exitCode);
    }
  });
});

describe("the human path is untouched", () => {
  test("without --json the human output appears", async () => {
    const result = await run(["chef"], { platformName: "darwin", which: FOUND_NONE });
    expect(result.stdout).toContain("prep chef · darwin");
    expect(() => JSON.parse(result.stdout)).toThrow();
  });
});

describe("unknown flags", () => {
  test("gives exit code 2 and the usage text", async () => {
    const result = await run(["chef", "--verbose"], { platformName: "darwin", which: FOUND_ALL });
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("--verbose");
    expect(result.stderr).toContain("prep chef");
  });

  test("short flags are blocked too", async () => {
    const result = await run(["chef", "-j"], { platformName: "darwin", which: FOUND_ALL });
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("-j");
  });

  test("--help wins over --json", async () => {
    const result = await run(["chef", "--json", "--help"], { platformName: "darwin", which: FOUND_ALL });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("prep chef");
  });
});
