import { describe, expect, test } from "bun:test";

import { type RunDeps, type RunResult, run as runCli } from "../src/cli.ts";
import type { SetupFs, WhichFn } from "../src/types.ts";

/** A fake home directory, so no test reads the install record of a real one. */
const HOME = "/home";
const RECORD = "/home/.claude/plugins/installed_plugins.json";

/** A machine with every language server on PATH, so setup's plugin half is the only variable. */
const SERVERS_FOUND: WhichFn = (binary) => `/usr/bin/${binary}`;

function run(argv: readonly string[], deps: RunDeps = {}): RunResult {
  return runCli(argv, { home: HOME, which: SERVERS_FOUND, ...deps });
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
  results: { id: string; status: string; binary: string | null; path: string | null }[];
};

function json(argv: readonly string[], platformName: string, which: WhichFn) {
  const result = run(argv, { platformName, which });
  return { result, payload: result.stdout ? (JSON.parse(result.stdout) as Payload) : null };
}

describe("--json exit codes", () => {
  test("no gaps is 0", () => {
    const { result } = json(["doctor", "--json"], "darwin", FOUND_ALL);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
  });

  test("gaps found is 1", () => {
    const { result } = json(["doctor", "--json"], "darwin", FOUND_NONE);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe("");
  });

  test("an unsupported OS is 2 with empty stdout", () => {
    const result = run(["doctor", "--json"], { platformName: "win32", which: FOUND_NONE });
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("WSL");
  });

  test("exit codes match the human output", () => {
    for (const [platformName, which] of [
      ["darwin", FOUND_ALL],
      ["darwin", FOUND_NONE],
      ["linux", FOUND_ALL],
      ["linux", FOUND_NONE],
      ["win32", FOUND_NONE],
    ] as const) {
      const human = run(["doctor"], { platformName, which });
      const machine = run(["doctor", "--json"], { platformName, which });
      expect(machine.exitCode).toBe(human.exitCode);
    }
  });
});

describe("--json output", () => {
  test("stdout parses whole as JSON", () => {
    const { payload } = json(["doctor", "--json"], "linux", FOUND_ALL);
    expect(payload?.platform).toBe("linux");
    expect(payload?.results.length).toBeGreaterThan(0);
  });

  test("the harnesses are reported alongside the standard tools", () => {
    const { payload } = json(["doctor", "--json"], "linux", FOUND_ALL);
    const ids = payload?.results.map((result) => result.id);
    expect(ids).toContain("claude-code");
    expect(ids).toContain("codex");
  });

  test("the detected platform is carried through", () => {
    expect(json(["doctor", "--json"], "darwin", FOUND_NONE).payload?.platform).toBe("darwin");
    expect(json(["doctor", "--json"], "linux", FOUND_NONE).payload?.platform).toBe("linux");
  });

  test("no human symbols or summary wording leak in", () => {
    const { result } = json(["doctor", "--json"], "darwin", FOUND_NONE);
    for (const noise of ["✓", "✗", "⚠", "prep doctor ·", "Installed", "prep does not install"]) {
      expect(result.stdout).not.toContain(noise);
    }
  });

  test("flag order does not matter", () => {
    const after = run(["doctor", "--json"], { platformName: "darwin", which: FOUND_ALL });
    const before = run(["--json", "doctor"], { platformName: "darwin", which: FOUND_ALL });
    expect(before).toEqual(after);
  });

  test("same input gives same output and same exit code", () => {
    const deps = { platformName: "linux", which: FOUND_ALL };
    expect(run(["doctor", "--json"], deps)).toEqual(run(["doctor", "--json"], deps));
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

type SettingsPayload = {
  kind: "claude-settings";
  path: string;
  status: string;
  settings: {
    permissions: { defaultMode: string; deny: string[]; allow: string[]; ask: string[] };
    enabledPlugins?: Record<string, boolean>;
  } | null;
  merge: {
    existing: Record<string, unknown>;
    added: { deny: string[]; allow: string[]; ask: string[] };
    addedPlugins: string[];
    conflicts: { key: string; existing: string; preset: string }[];
  } | null;
};

type SeedPayload = { kind: "agents-md"; path: string; status: string; contents: string | null };

type ArtifactPayload = SettingsPayload | SeedPayload;

type SetupPayload = {
  root: string;
  detected: string[];
  artifacts: ArtifactPayload[];
  plugins: {
    name: string;
    marketplace: string;
    status: string;
    server: { binary: string; status: string };
  }[];
  handoff: { id: string; status: string; path: string | null }[];
};

function setupJson(
  argv: readonly string[],
  present: readonly string[],
  contents: Record<string, string> = {},
) {
  const result = run(argv, { fs: fakeFs(present, contents) });
  const payload = result.stdout ? (JSON.parse(result.stdout) as SetupPayload) : null;
  // Found by kind, never by position: a consumer that indexes the array breaks
  // the moment a run produces its files in another order.
  const found = <K extends ArtifactPayload["kind"]>(kind: K) =>
    (payload?.artifacts.find((one) => one.kind === kind) ?? null) as
      | Extract<ArtifactPayload, { kind: K }>
      | null;

  return { result, payload, settingsFile: found("claude-settings"), seedFile: found("agents-md") };
}

describe("setup --json", () => {
  test("stdout parses whole as JSON and carries the outcome", () => {
    const { payload, settingsFile } = setupJson(["setup", PROJECT, "--json"], [
      PROJECT,
      "/project/package.json",
    ]);
    expect(payload?.root).toBe(PROJECT);
    expect(payload?.detected).toEqual(["node"]);
    expect(settingsFile?.path).toBe(SETTINGS);
    expect(settingsFile?.status).toBe("applied");
    expect(settingsFile?.settings?.permissions.allow).toContain("Bash(npm:*)");
  });

  test("a file that already covers the baseline carries the status without the settings", () => {
    // What a dry run says it would write is exactly what a covered file holds.
    const planned = setupJson(["setup", PROJECT, "--dry-run", "--json"], [
      PROJECT,
      "/project/package.json",
    ]);
    const { result, settingsFile } = setupJson(
      ["setup", PROJECT, "--json"],
      [PROJECT, "/project/package.json"],
      { ...SEEDED, [SETTINGS]: JSON.stringify(planned.settingsFile?.settings) },
    );
    expect(result.exitCode).toBe(1);
    expect(settingsFile?.status).toBe("skipped");
    expect(settingsFile?.settings).toBeNull();
  });

  test("an existing file carries the merge: what is there, what is added, what is left to decide", () => {
    const { result, settingsFile } = setupJson(
      ["setup", PROJECT, "--json"],
      [PROJECT, "/project/package.json"],
      { ...SEEDED, [SETTINGS]: JSON.stringify({ permissions: { defaultMode: "plan" } }) },
    );
    expect(result.exitCode).toBe(1);
    expect(settingsFile?.status).toBe("planned");
    expect(settingsFile?.merge?.existing).toEqual({ permissions: { defaultMode: "plan" } });
    expect(settingsFile?.merge?.added.allow).toContain("Bash(npm:*)");
    expect(settingsFile?.merge?.conflicts).toEqual([
      { key: "defaultMode", existing: "plan", preset: "acceptEdits" },
    ]);
  });

  test("no marker gives an empty detected list and the shared rules only", () => {
    const { payload, settingsFile } = setupJson(["setup", PROJECT, "--json"], [PROJECT]);
    expect(settingsFile?.status).toBe("applied");
    expect(payload?.detected).toEqual([]);
    const allow = settingsFile?.settings?.permissions.allow ?? [];
    expect(allow).toContain("Edit(./**)");
    expect(allow).toContain("Bash(git:*)");
    expect(allow.some((rule) => rule.includes("npm") || rule.includes("uv"))).toBe(false);
  });

  test("a dry run says planned and still shows what it would write", () => {
    const { settingsFile } = setupJson(
      ["setup", PROJECT, "--dry-run", "--json"],
      [PROJECT, "/project/pyproject.toml"],
    );
    expect(settingsFile?.status).toBe("planned");
    expect(settingsFile?.settings?.permissions.allow).toContain("Bash(uv:*)");
  });

  test("the plugin recommendations carry a name, a marketplace and a status, and no wording", () => {
    const { result, payload } = setupJson(["setup", PROJECT, "--json"], [
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
    for (const noise of ["claude plugin install", "not installed", "prep turns it on"]) {
      expect(result.stdout).not.toContain(noise);
    }
  });

  test("a plugin the machine holds comes through as an entry the run writes", () => {
    const { payload, settingsFile } = setupJson(
      ["setup", PROJECT, "--json"],
      [PROJECT, "/project/package.json"],
      heldMachineWide("typescript-lsp@claude-plugins-official"),
    );
    expect(payload?.plugins[0]?.status).toBe("installed");
    expect(settingsFile?.settings?.enabledPlugins).toEqual({
      "typescript-lsp@claude-plugins-official": true,
    });
  });

  test("an existing file carries the plugin entries the merge would add", () => {
    const { settingsFile } = setupJson(
      ["setup", PROJECT, "--json"],
      [PROJECT, "/project/package.json"],
      {
        ...SEEDED,
        ...heldMachineWide("typescript-lsp@claude-plugins-official"),
        [SETTINGS]: JSON.stringify({ permissions: { allow: [] } }),
      },
    );
    expect(settingsFile?.status).toBe("planned");
    expect(settingsFile?.merge?.addedPlugins).toEqual(["typescript-lsp@claude-plugins-official"]);
  });

  test("the handoff comes through as statuses and paths", () => {
    const { payload } = setupJson(["setup", PROJECT, "--json"], [PROJECT, "/project/package.json"], {
      "/project/AGENTS.md": "# p\n\n## Language\n\nEnglish in the repository.\n",
    });
    expect(payload?.handoff).toEqual([
      { id: "language", status: "ready", path: "AGENTS.md" },
      { id: "issue-tracker", status: "missing", path: null },
      { id: "domain-docs", status: "missing", path: null },
    ]);
  });

  test("a dry run carries the handoff as well", () => {
    const { payload } = setupJson(["setup", PROJECT, "--dry-run", "--json"], [
      PROJECT,
      "/project/package.json",
    ]);
    expect(payload?.handoff.map((item) => item.status)).toEqual(["missing", "missing", "missing"]);
  });

  test("no human symbols or summary wording leak in", () => {
    const { result } = setupJson(["setup", PROJECT, "--json"], [PROJECT, "/project/package.json"]);
    for (const noise of ["✓", "–", "prep setup ·", "Detected", "Allowing", "Wrote"]) {
      expect(result.stdout).not.toContain(noise);
    }
  });

  test("a tool error keeps stdout empty", () => {
    const result = run(["setup", "/nope", "--json"], { fs: fakeFs([]) });
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("/nope");
  });

  test("exit codes match the human output", () => {
    for (const present of [
      [PROJECT, "/project/package.json"],
      [PROJECT],
      [PROJECT, "/project/package.json", SETTINGS],
      [],
    ]) {
      const human = run(["setup", PROJECT], { fs: fakeFs(present) });
      const machine = run(["setup", PROJECT, "--json"], { fs: fakeFs(present) });
      expect(machine.exitCode).toBe(human.exitCode);
    }
  });
});

describe("the human path is untouched", () => {
  test("without --json the human output appears", () => {
    const result = run(["doctor"], { platformName: "darwin", which: FOUND_NONE });
    expect(result.stdout).toContain("prep doctor · darwin");
    expect(() => JSON.parse(result.stdout)).toThrow();
  });
});

describe("unknown flags", () => {
  test("gives exit code 2 and the usage text", () => {
    const result = run(["doctor", "--verbose"], { platformName: "darwin", which: FOUND_ALL });
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("--verbose");
    expect(result.stderr).toContain("prep doctor");
  });

  test("short flags are blocked too", () => {
    const result = run(["doctor", "-j"], { platformName: "darwin", which: FOUND_ALL });
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("-j");
  });

  test("--help wins over --json", () => {
    const result = run(["doctor", "--json", "--help"], { platformName: "darwin", which: FOUND_ALL });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("prep doctor");
  });
});
