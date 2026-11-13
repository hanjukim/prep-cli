import { describe, expect, test } from "bun:test";

import { SetupError, setup as runSetup, type SetupInput } from "../src/setup.ts";
import type {
  InstalledPlugin,
  PluginRecommendation,
  SetupFs,
  SetupOutcome,
  WhichFn,
} from "../src/types.ts";

const ROOT = "/project";
const SETTINGS = "/project/.claude/settings.json";
const CODEX_CONFIG = "/project/.codex/config.toml";
const AGENTS_MD = "/project/AGENTS.md";
const CLAUDE_MD = "/project/CLAUDE.md";
const PACKAGE_JSON = "/project/package.json";
const PYPROJECT = "/project/pyproject.toml";

const HOME = "/home";
const RECORD = "/home/.claude/plugins/installed_plugins.json";

/**
 * A machine with every language server on PATH.
 *
 * The server is the other half of a working plugin and fails on its own, so the
 * tests about the plugin half hold it fixed and the ones about the server half
 * hand in their own lookup.
 */
const SERVERS_FOUND: WhichFn = (binary) => `/usr/bin/${binary}`;
const TYPESCRIPT = "typescript-lsp@claude-plugins-official";
const PYRIGHT = "pyright-lsp@claude-plugins-official";

/**
 * A run against a fake home directory.
 *
 * Every test goes through this rather than calling setup directly, so no test
 * can fall through to the install record in a real home directory.
 */
function setup(input: SetupInput): SetupOutcome {
  return runSetup({ home: HOME, which: SERVERS_FOUND, ...input });
}

/** The install record as the harness writes it, for a machine holding these. */
function record(...installs: InstalledPlugin[]): Record<string, string> {
  const plugins: Record<string, unknown[]> = {};
  for (const install of installs) {
    const entry =
      install.projectPath === null
        ? { scope: install.scope }
        : { scope: install.scope, projectPath: install.projectPath };
    (plugins[install.id] ??= []).push(entry);
  }
  return { [RECORD]: JSON.stringify({ version: 2, plugins }) };
}

/** The plugins the run recommends, by name and status. */
function recommended(outcome: SetupOutcome): [string, string][] {
  return outcome.plugins.map((plugin: PluginRecommendation) => [plugin.name, plugin.status]);
}

type FakeFsOptions = {
  /** Files that already hold something. Their paths count as present. */
  contents?: Record<string, string>;
  onWrite?: (path: string) => void;
};

/** A fake file system holding only the given paths. It never touches a real disk. */
function fakeFs(present: readonly string[], options: FakeFsOptions = {}) {
  const written = new Map<string, string>();
  const held = new Map(Object.entries(options.contents ?? {}));
  const paths = new Set([ROOT, ...present, ...held.keys()]);
  const fs: SetupFs = {
    exists: (path) => paths.has(path),
    // Only the project root is a directory here. Everything else stands for a file.
    isDirectory: (path) => path === ROOT && paths.has(ROOT),
    read: (path) => {
      const contents = written.get(path) ?? held.get(path);
      if (contents === undefined) throw new Error(`ENOENT: no such file, open '${path}'`);
      return contents;
    },
    write: (path, contents) => {
      options.onWrite?.(path);
      written.set(path, contents);
      paths.add(path);
    },
  };
  return { fs, written };
}

/** A settings file that is already there, given as its JSON text. */
function existing(value: unknown): FakeFsOptions {
  return { contents: { [SETTINGS]: JSON.stringify(value) } };
}

/** A machine holding these binaries and nothing else. */
function machine(...binaries: string[]): WhichFn {
  return (binary) => (binaries.includes(binary) ? `/usr/bin/${binary}` : null);
}

/** The files a run produced, by kind, in the order they are reported. */
function kinds(outcome: SetupOutcome): string[] {
  return outcome.artifacts.map((artifact) => artifact.kind);
}

/** What the run did to each file, by kind. */
function statuses(outcome: SetupOutcome): [string, string][] {
  return outcome.artifacts.map((artifact) => [artifact.kind, artifact.status]);
}

describe("detection", () => {
  test("package.json alone detects node", () => {
    const { fs } = fakeFs([PACKAGE_JSON]);
    expect(setup({ root: ROOT, fs }).detected).toEqual(["node"]);
  });

  test("pyproject.toml alone detects python", () => {
    const { fs } = fakeFs([PYPROJECT]);
    expect(setup({ root: ROOT, fs }).detected).toEqual(["python"]);
  });

  test("both markers detect both types", () => {
    const { fs } = fakeFs([PACKAGE_JSON, PYPROJECT]);
    expect(setup({ root: ROOT, fs }).detected).toEqual(["node", "python"]);
  });

  test("requirements.txt is not a python signal", () => {
    const { fs } = fakeFs(["/project/requirements.txt", "/project/setup.py"]);
    const outcome = setup({ root: ROOT, fs });
    expect(outcome.detected).toEqual([]);
    expect(outcome.plugins).toEqual([]);
  });

  test("the type changes nothing about which files are written", () => {
    for (const markers of [[], [PACKAGE_JSON], [PYPROJECT], [PACKAGE_JSON, PYPROJECT]]) {
      const { fs, written } = fakeFs(markers);
      expect(statuses(setup({ root: ROOT, fs }))).toEqual([
        ["agents-md", "applied"],
        ["claude-md", "applied"],
      ]);
      expect([...written.keys()]).toEqual([AGENTS_MD, CLAUDE_MD]);
    }
  });
});

describe("what gets written", () => {
  test("the guidance file and the line that points Claude Code at it, and nothing else", () => {
    const { fs, written } = fakeFs([PACKAGE_JSON]);
    const outcome = setup({ root: ROOT, fs });
    expect(kinds(outcome)).toEqual(["agents-md", "claude-md"]);
    expect([...written.keys()]).toEqual([AGENTS_MD, CLAUDE_MD]);
    expect(written.get(CLAUDE_MD)).toBe("@AGENTS.md\n");
  });

  test("no permission file is written, whatever harness the machine holds", () => {
    for (const which of [machine(), machine("claude"), machine("codex"), machine("claude", "codex")]) {
      const { fs, written } = fakeFs([PACKAGE_JSON, PYPROJECT]);
      setup({ root: ROOT, fs, which });
      expect(written.has(SETTINGS)).toBe(false);
      expect(written.has(CODEX_CONFIG)).toBe(false);
    }
  });

  test("the pointer is written on a machine that holds only Codex", () => {
    // The project is handed to more machines than the one it was set up on, and
    // the line costs nothing where Claude Code never reads it.
    const { fs, written } = fakeFs([PACKAGE_JSON]);
    const outcome = setup({ root: ROOT, fs, which: machine("codex") });
    expect(kinds(outcome)).toEqual(["agents-md", "claude-md"]);
    expect(written.has(CLAUDE_MD)).toBe(true);
  });

  test("the outcome says which harness is here, and nothing about files", () => {
    const outcome = setup({ root: ROOT, fs: fakeFs([]).fs, which: machine("codex") });
    expect(outcome.harnesses).toEqual([
      { id: "claude-code", installed: false },
      { id: "codex", installed: true },
    ]);
  });

  test("a second run finds both files standing and writes neither", () => {
    const { fs, written } = fakeFs([PACKAGE_JSON]);
    setup({ root: ROOT, fs });
    const before = new Map(written);

    const second = setup({ root: ROOT, fs });
    expect(statuses(second)).toEqual([
      ["agents-md", "skipped"],
      ["claude-md", "skipped"],
    ]);
    expect(written).toEqual(before);
  });
});

describe("files that already stand", () => {
  test("a settings file is left byte for byte as it was", () => {
    const mine = '{ "permissions": { "allow": ["Bash(terraform:*)"] }, "hooks": {} }';
    const { fs, written } = fakeFs([PACKAGE_JSON], { contents: { [SETTINGS]: mine } });
    setup({ root: ROOT, fs });
    expect(written.has(SETTINGS)).toBe(false);
    expect(fs.read(SETTINGS)).toBe(mine);
  });

  test("a Codex config is never opened, let alone written", () => {
    // Present as a path and holding nothing readable: a read would throw.
    const { fs, written } = fakeFs([PACKAGE_JSON, CODEX_CONFIG]);
    expect(() => setup({ root: ROOT, fs })).not.toThrow();
    expect(written.has(CODEX_CONFIG)).toBe(false);
  });

  test("a settings file is not opened where no type was recognised", () => {
    const { fs } = fakeFs([], { contents: { [SETTINGS]: "{ not json" } });
    expect(() => setup({ root: ROOT, fs })).not.toThrow();
  });

  test("malformed JSON in the settings file is a tool error, not a silent no-op", () => {
    const { fs } = fakeFs([PACKAGE_JSON], { contents: { [SETTINGS]: "{ not json" } });
    expect(() => setup({ root: ROOT, fs })).toThrow(SetupError);
    expect(() => setup({ root: ROOT, fs })).toThrow(SETTINGS);
  });

  test("a settings file that is not an object is a tool error too", () => {
    const { fs } = fakeFs([PACKAGE_JSON], existing(["not", "an", "object"]));
    expect(() => setup({ root: ROOT, fs })).toThrow(SetupError);
  });

  test("a settings file that cannot be read is a tool error naming the path", () => {
    const { fs } = fakeFs([PACKAGE_JSON, SETTINGS]);
    try {
      setup({ root: ROOT, fs });
      throw new Error("expected a SetupError");
    } catch (error) {
      expect(error).toBeInstanceOf(SetupError);
      expect((error as Error).message).toContain(SETTINGS);
    }
  });

  test("nothing is written before a settings file turns out to be unreadable", () => {
    const { fs, written } = fakeFs([PACKAGE_JSON], { contents: { [SETTINGS]: "{ not json" } });
    expect(() => setup({ root: ROOT, fs })).toThrow(SetupError);
    expect(written.size).toBe(0);
  });
});

describe("dry run", () => {
  test("plans both files without writing either", () => {
    const { fs, written } = fakeFs([PACKAGE_JSON]);
    const outcome = setup({ root: ROOT, dryRun: true, fs });
    expect(statuses(outcome)).toEqual([
      ["agents-md", "planned"],
      ["claude-md", "planned"],
    ]);
    expect(written.size).toBe(0);
  });

  test("shows the very text a real run would write", () => {
    const planned = setup({ root: ROOT, dryRun: true, fs: fakeFs([PACKAGE_JSON]).fs });
    const applied = setup({ root: ROOT, fs: fakeFs([PACKAGE_JSON]).fs });
    expect(planned.artifacts.map((artifact) => artifact.contents)).toEqual(
      applied.artifacts.map((artifact) => artifact.contents),
    );
  });

  test("still points at the machine — what is owed is true before anything is written", () => {
    const { fs } = fakeFs([PACKAGE_JSON]);
    const outcome = setup({ root: ROOT, dryRun: true, fs });
    expect(outcome.next.map((step) => step.id)).toContain("chef");
  });
});

describe("the machine pointer", () => {
  test("a second run over an unchanged project still names it", () => {
    const { fs } = fakeFs([PACKAGE_JSON]);
    setup({ root: ROOT, fs });
    const second = setup({ root: ROOT, fs });
    expect(second.next.map((step) => step.id)).toContain("chef");
  });
});

describe("errors", () => {
  test("a missing root is a tool error, not a no-op", () => {
    const fs: SetupFs = {
      exists: () => false,
      isDirectory: () => false,
      read: () => "",
      write: () => {},
    };
    expect(() => setup({ root: "/nope", fs })).toThrow(SetupError);
  });

  test("a file handed in as the root is a tool error too", () => {
    const { fs } = fakeFs([PACKAGE_JSON]);
    expect(() => setup({ root: PACKAGE_JSON, fs })).toThrow(SetupError);
  });

  test("a failed write surfaces as a tool error naming the path", () => {
    const { fs } = fakeFs([PACKAGE_JSON], {
      onWrite: () => {
        throw new Error("EACCES: permission denied");
      },
    });
    expect(() => setup({ root: ROOT, fs })).toThrow(SetupError);
    try {
      setup({ root: ROOT, fs });
    } catch (error) {
      expect((error as Error).message).toContain(AGENTS_MD);
      expect((error as Error).message).toContain("EACCES");
    }
  });
});

describe("the plugins a project type calls for", () => {
  /** The record entry the harness leaves for a machine-wide install. */
  function machineWide(id: string): InstalledPlugin {
    return { id, scope: "user", projectPath: null };
  }

  function forProject(id: string, projectPath: string): InstalledPlugin {
    return { id, scope: "project", projectPath };
  }

  /** A project whose machine holds these plugins, and nothing else. */
  function holding(...installs: InstalledPlugin[]): FakeFsOptions {
    return { contents: record(...installs) };
  }

  test("node is recommended typescript-lsp and python pyright, and a polyglot project both", () => {
    expect(recommended(setup({ root: ROOT, fs: fakeFs([PACKAGE_JSON]).fs }))).toEqual([
      ["typescript-lsp", "missing"],
    ]);
    expect(recommended(setup({ root: ROOT, fs: fakeFs([PYPROJECT]).fs }))).toEqual([
      ["pyright-lsp", "missing"],
    ]);
    expect(recommended(setup({ root: ROOT, fs: fakeFs([PACKAGE_JSON, PYPROJECT]).fs }))).toEqual([
      ["typescript-lsp", "missing"],
      ["pyright-lsp", "missing"],
    ]);
  });

  test("a project with no recognised type is recommended nothing", () => {
    expect(setup({ root: ROOT, fs: fakeFs([]).fs }).plugins).toEqual([]);
  });

  test("a plugin the machine does not hold is reported, and nothing is written for it", () => {
    const { fs, written } = fakeFs([PACKAGE_JSON]);
    const outcome = setup({ root: ROOT, fs });
    expect(recommended(outcome)).toEqual([["typescript-lsp", "missing"]]);
    expect(written.has(SETTINGS)).toBe(false);
  });

  test("a machine-wide install is reported as installed, and no entry is written for it", () => {
    const { fs, written } = fakeFs([PACKAGE_JSON], holding(machineWide(TYPESCRIPT)));
    const outcome = setup({ root: ROOT, fs });
    expect(recommended(outcome)).toEqual([["typescript-lsp", "installed"]]);
    expect(written.has(SETTINGS)).toBe(false);
  });

  test("an install scoped to another project does not count here", () => {
    const { fs } = fakeFs([PACKAGE_JSON], holding(forProject(TYPESCRIPT, "/somewhere/else")));
    expect(recommended(setup({ root: ROOT, fs }))).toEqual([["typescript-lsp", "missing"]]);
  });

  test("an install scoped to this project counts", () => {
    const { fs } = fakeFs([PACKAGE_JSON], holding(forProject(TYPESCRIPT, ROOT)));
    expect(recommended(setup({ root: ROOT, fs }))).toEqual([["typescript-lsp", "installed"]]);
  });

  test("each half of a polyglot project's plugins is read on its own", () => {
    const { fs } = fakeFs([PACKAGE_JSON, PYPROJECT], holding(machineWide(PYRIGHT)));
    expect(recommended(setup({ root: ROOT, fs }))).toEqual([
      ["typescript-lsp", "missing"],
      ["pyright-lsp", "installed"],
    ]);
  });

  test("an entry already in the settings file answers for the plugin, on or off", () => {
    for (const value of [true, false]) {
      const settings = existing({
        permissions: { allow: [] },
        enabledPlugins: { [TYPESCRIPT]: value },
      });
      const { fs, written } = fakeFs([PACKAGE_JSON], {
        contents: { ...settings.contents, ...record(machineWide(TYPESCRIPT)) },
      });
      const outcome = setup({ root: ROOT, fs });
      expect(recommended(outcome)).toEqual([["typescript-lsp", "answered"]]);
      expect(written.has(SETTINGS)).toBe(false);
    }
  });

  test("a settings file that says nothing about plugins answers for none", () => {
    for (const shape of [{}, { permissions: {} }, { enabledPlugins: [TYPESCRIPT] }]) {
      const settings = existing(shape);
      const { fs } = fakeFs([PACKAGE_JSON], {
        contents: { ...settings.contents, ...record(machineWide(TYPESCRIPT)) },
      });
      expect(recommended(setup({ root: ROOT, fs }))).toEqual([["typescript-lsp", "installed"]]);
    }
  });

  test("the recommendation is made whether or not Claude Code is on the machine", () => {
    const { fs } = fakeFs([PACKAGE_JSON], holding(machineWide(TYPESCRIPT)));
    for (const which of [machine(), machine("codex"), machine("claude")]) {
      expect(setup({ root: ROOT, fs, which }).plugins.map((plugin) => plugin.name)).toEqual([
        "typescript-lsp",
      ]);
    }
  });

  test("a dry run reports the same recommendation and writes nothing", () => {
    const { fs, written } = fakeFs([PACKAGE_JSON], holding(machineWide(TYPESCRIPT)));
    const outcome = setup({ root: ROOT, dryRun: true, fs });
    expect(recommended(outcome)).toEqual([["typescript-lsp", "installed"]]);
    expect(written.size).toBe(0);
  });

  test("an unreadable install record stops the run rather than reading as an empty machine", () => {
    const { fs } = fakeFs([PACKAGE_JSON], { contents: { [RECORD]: "{ not json" } });
    expect(() => setup({ root: ROOT, fs })).toThrow(SetupError);
    expect(() => setup({ root: ROOT, fs })).toThrow(RECORD);
  });

  test("a project with no type recognised never opens the record, however broken it is", () => {
    const { fs } = fakeFs([], { contents: { [RECORD]: "{ not json" } });
    expect(setup({ root: ROOT, fs }).plugins).toEqual([]);
  });

  test("the language server the plugin points at is read alongside it", () => {
    const { fs } = fakeFs([PACKAGE_JSON, PYPROJECT]);
    const servers = setup({ root: ROOT, fs }).plugins.map((plugin) => plugin.server);
    expect(servers).toEqual([
      { binary: "typescript-language-server", status: "installed" },
      { binary: "pyright-langserver", status: "installed" },
    ]);
  });

  test("a server that is not on PATH is reported apart from the plugin's own status", () => {
    const { fs } = fakeFs([PACKAGE_JSON], holding(machineWide(TYPESCRIPT)));
    const outcome = setup({ root: ROOT, fs, which: () => null });
    expect(recommended(outcome)).toEqual([["typescript-lsp", "installed"]]);
    expect(outcome.plugins[0]!.server.status).toBe("missing");
  });
});

describe("the handoff check", () => {
  const TRACKER_MD = "/project/docs/agents/issue-tracker.md";
  const DOMAIN_MD = "/project/docs/agents/domain.md";

  /** The three files the harness side leaves behind, all filled in. */
  const SETTLED: FakeFsOptions = {
    contents: {
      [CLAUDE_MD]: "# p\n\n## Language\n\nEnglish in the repository.\n",
      [TRACKER_MD]: "# Issue tracker: GitHub\n\nIssues live as GitHub issues.\n",
      [DOMAIN_MD]: "# Domain Docs\n\nRead CONTEXT.md before exploring.\n",
    },
  };

  test("an untouched project owes all three", () => {
    const { fs } = fakeFs([PACKAGE_JSON]);
    expect(setup({ root: ROOT, dryRun: true, fs }).handoff).toEqual([
      { id: "language", status: "missing", path: null },
      { id: "issue-tracker", status: "missing", path: null },
      { id: "domain-docs", status: "missing", path: null },
    ]);
  });

  test("a seeded run reads the file it just wrote, so language is answered and not missing", () => {
    const { fs } = fakeFs([PACKAGE_JSON]);
    expect(setup({ root: ROOT, fs }).handoff).toEqual([
      { id: "language", status: "ready", path: "AGENTS.md" },
      { id: "issue-tracker", status: "missing", path: null },
      { id: "domain-docs", status: "missing", path: null },
    ]);
  });

  test("a project with the guidance in place owes nothing", () => {
    const { fs } = fakeFs([PACKAGE_JSON], SETTLED);
    const outcome = setup({ root: ROOT, fs });
    expect(outcome.handoff.every((result) => result.status === "ready")).toBe(true);
  });

  test("a file that is there but unfilled is owed, not settled", () => {
    const { fs } = fakeFs([PACKAGE_JSON], {
      contents: { ...SETTLED.contents, [TRACKER_MD]: "# Issue tracker\n\nTBD.\n" },
    });
    const tracker = setup({ root: ROOT, fs }).handoff.find((r) => r.id === "issue-tracker");
    expect(tracker).toEqual({ id: "issue-tracker", status: "empty", path: "docs/agents/issue-tracker.md" });
  });

  test("it is read on a run that writes nothing at all", () => {
    const { fs, written } = fakeFs([PACKAGE_JSON], SETTLED);
    const outcome = setup({ root: ROOT, fs });
    expect(written.size).toBe(0);
    expect(outcome.handoff.every((result) => result.status === "ready")).toBe(true);
  });

  test("it is read on a dry run too — reading owes nothing to writing", () => {
    const { fs } = fakeFs([PACKAGE_JSON], SETTLED);
    const outcome = setup({ root: ROOT, dryRun: true, fs });
    expect(outcome.handoff.every((result) => result.status === "ready")).toBe(true);
  });

  test("checking never writes anything", () => {
    const touched: string[] = [];
    const { fs } = fakeFs([PACKAGE_JSON], {
      ...SETTLED,
      onWrite: (path) => touched.push(path),
    });
    setup({ root: ROOT, dryRun: true, fs });
    expect(touched).toEqual([]);
  });

  test("a guidance file that cannot be read stops the run, naming it", () => {
    const { fs } = fakeFs([PACKAGE_JSON, CLAUDE_MD]);
    expect(() => setup({ root: ROOT, fs })).toThrow(SetupError);
    expect(() => setup({ root: ROOT, fs })).toThrow(/CLAUDE\.md/);
  });
});
