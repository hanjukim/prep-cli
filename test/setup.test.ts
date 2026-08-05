import { describe, expect, test } from "bun:test";

import { SetupError, setup as runSetup, type SetupInput } from "../src/setup.ts";
import type {
  CodexArtifact,
  InstalledPlugin,
  PluginRecommendation,
  SettingsArtifact,
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

/** The plugin entries the run would write. Empty when it composed nothing. */
function enabled(outcome: SetupOutcome): Record<string, boolean> {
  const settings = settingsFile(outcome).settings;
  return (settings?.enabledPlugins as Record<string, boolean> | undefined) ?? {};
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

/** The Claude settings file the run produced. The only artifact there is, so far. */
function settingsFile(outcome: SetupOutcome): SettingsArtifact {
  const artifact = outcome.artifacts.find((one) => one.kind === "claude-settings");
  if (artifact === undefined) throw new Error("the run produced no settings file");
  return artifact;
}

/** The permission rules the run would write. Empty when it wrote nothing. */
function allowed(outcome: SetupOutcome): string[] {
  return settingsFile(outcome).settings?.permissions.allow ?? [];
}

describe("detection", () => {
  test("package.json alone detects node", () => {
    const { fs } = fakeFs([PACKAGE_JSON]);
    const outcome = setup({ root: ROOT, fs });
    expect(outcome.detected).toEqual(["node"]);
    expect(settingsFile(outcome).status).toBe("applied");
  });

  test("pyproject.toml alone detects python", () => {
    const { fs } = fakeFs([PYPROJECT]);
    const outcome = setup({ root: ROOT, fs });
    expect(outcome.detected).toEqual(["python"]);
    expect(settingsFile(outcome).status).toBe("applied");
  });

  test("both markers detect both types", () => {
    const { fs } = fakeFs([PACKAGE_JSON, PYPROJECT]);
    expect(setup({ root: ROOT, fs }).detected).toEqual(["node", "python"]);
  });

  test("requirements.txt is not a python signal", () => {
    const { fs } = fakeFs(["/project/requirements.txt", "/project/setup.py"]);
    const outcome = setup({ root: ROOT, fs });
    expect(outcome.detected).toEqual([]);
    expect(allowed(outcome).some((rule) => rule.includes("pip") || rule.includes("pytest"))).toBe(
      false,
    );
  });

  test("with no marker the type-independent half is still written", () => {
    const { fs, written } = fakeFs([]);
    const outcome = setup({ root: ROOT, fs });
    expect(settingsFile(outcome).status).toBe("applied");
    expect(outcome.detected).toEqual([]);
    expect(written.has(SETTINGS)).toBe(true);

    const permissions = settingsFile(outcome).settings!.permissions;
    expect(permissions.deny).toContain("Read(./.env)");
    expect(permissions.allow).toEqual([
      "Edit(./**)",
      "Write(./**)",
      "Bash(ls:*)",
      "Bash(rg:*)",
      "Bash(fd:*)",
      "Bash(git:*)",
      "Bash(gh:*)",
    ]);
    expect(permissions.ask).toEqual(["WebFetch"]);
  });

  test("no marker means no toolchain command is allowed — nothing is guessed", () => {
    // Searching a directory and using version control hold without a type. A
    // package manager does not, so none is named.
    const { fs } = fakeFs([]);
    const allow = allowed(setup({ root: ROOT, fs }));
    expect(allow).toContain("Bash(git:*)");
    for (const guess of ["npm", "uv", "pip", "yarn", "tsc"]) {
      expect(allow.some((rule) => rule.includes(guess))).toBe(false);
    }
  });

  test("the commands every project gets come before the type's own", () => {
    const { fs } = fakeFs([PACKAGE_JSON]);
    const allow = allowed(setup({ root: ROOT, fs }));
    expect(allow.indexOf("Bash(git:*)")).toBeLessThan(allow.indexOf("Bash(npm:*)"));
  });

  test("no rule is written twice, whatever the type", () => {
    for (const markers of [[], [PACKAGE_JSON], [PYPROJECT], [PACKAGE_JSON, PYPROJECT]]) {
      const allow = allowed(setup({ root: ROOT, fs: fakeFs(markers).fs }));
      expect(new Set(allow).size).toBe(allow.length);
    }
  });

  test("the commands nobody can undo are denied, even where the command is allowed", () => {
    // Version control is opened whole, so the deny is what keeps the ends that
    // cannot be walked back out of reach (ADR-0006).
    const { fs } = fakeFs([PACKAGE_JSON]);
    const permissions = settingsFile(setup({ root: ROOT, fs })).settings!.permissions;
    expect(permissions.allow).toContain("Bash(git:*)");
    for (const rule of ["Bash(git push --force:*)", "Bash(git reset --hard:*)", "Bash(env)"]) {
      expect(permissions.deny).toContain(rule);
    }
  });
});

describe("what gets written", () => {
  test("node gets the npm commands, wrapped as Bash rules", () => {
    const { fs } = fakeFs([PACKAGE_JSON]);
    const allow = allowed(setup({ root: ROOT, fs }));
    expect(allow).toContain("Bash(npm:*)");
    expect(allow).toContain("Bash(node:*)");
    expect(allow.some((rule) => rule.includes("uv"))).toBe(false);
  });

  test("python gets the uv commands", () => {
    const { fs } = fakeFs([PYPROJECT]);
    const allow = allowed(setup({ root: ROOT, fs }));
    expect(allow).toContain("Bash(uv:*)");
    expect(allow).toContain("Bash(pytest:*)");
    expect(allow.some((rule) => rule.includes("npm"))).toBe(false);
  });

  test("WebFetch is asked about, whatever the project type", () => {
    for (const marker of [PACKAGE_JSON, PYPROJECT]) {
      const outcome = setup({ root: ROOT, fs: fakeFs([marker]).fs });
      expect(settingsFile(outcome).settings!.permissions.ask).toEqual(["WebFetch"]);
      expect(settingsFile(outcome).settings!.permissions.allow).not.toContain("WebFetch");
    }
  });

  test("only permissions is written — no other key rides along", () => {
    const { fs, written } = fakeFs([PACKAGE_JSON]);
    setup({ root: ROOT, fs });
    const parsed = JSON.parse(written.get(SETTINGS)!);
    expect(Object.keys(parsed)).toEqual(["permissions"]);
    expect(Object.keys(parsed.permissions)).toEqual(["defaultMode", "deny", "allow", "ask"]);
  });

  test("secrets stay closed, whatever else the baseline opens", () => {
    for (const marker of [PACKAGE_JSON, PYPROJECT]) {
      const deny = settingsFile(setup({ root: ROOT, fs: fakeFs([marker]).fs })).settings!.permissions.deny;
      for (const rule of ["Read(./.env)", "Read(./**/*.key)", "Read(~/.ssh/**)"]) {
        expect(deny).toContain(rule);
      }
    }
  });

  test("editing files inside the project needs no prompt", () => {
    const { fs } = fakeFs([PACKAGE_JSON]);
    const settings = settingsFile(setup({ root: ROOT, fs })).settings!;
    expect(settings.permissions.allow).toContain("Edit(./**)");
    expect(settings.permissions.allow).toContain("Write(./**)");
    expect(settings.permissions.defaultMode).toBe("acceptEdits");
  });

  test("both markers merge as a union, not as one side winning", () => {
    const { fs } = fakeFs([PACKAGE_JSON, PYPROJECT]);
    const union = allowed(setup({ root: ROOT, fs }));

    const node = allowed(setup({ root: ROOT, fs: fakeFs([PACKAGE_JSON]).fs }));
    const python = allowed(setup({ root: ROOT, fs: fakeFs([PYPROJECT]).fs }));

    for (const rule of [...node, ...python]) expect(union).toContain(rule);
    expect(new Set(union).size).toBe(union.length);
  });

  test("the file is valid JSON in the Claude Code permissions shape", () => {
    const { fs, written } = fakeFs([PACKAGE_JSON]);
    setup({ root: ROOT, fs });
    const parsed = JSON.parse(written.get(SETTINGS)!);
    expect(Array.isArray(parsed.permissions.allow)).toBe(true);
    expect(parsed.permissions.allow.length).toBeGreaterThan(0);
  });

  test("it writes .claude/settings.json under the given root", () => {
    const { fs, written } = fakeFs([PACKAGE_JSON]);
    const outcome = setup({ root: ROOT, fs });
    expect(settingsFile(outcome).path).toBe(SETTINGS);
    expect(written.has(SETTINGS)).toBe(true);
  });

  test("the outcome carries the same settings that landed on disk", () => {
    const { fs, written } = fakeFs([PYPROJECT]);
    const outcome = setup({ root: ROOT, fs });
    expect(JSON.parse(written.get(SETTINGS)!)).toEqual(settingsFile(outcome).settings);
  });
});

describe("an existing settings file", () => {
  test("is planned as a merge, and nothing is written on its own", () => {
    const { fs, written } = fakeFs([PACKAGE_JSON], existing({ permissions: { allow: [] } }));
    const outcome = setup({ root: ROOT, fs });
    expect(settingsFile(outcome).status).toBe("planned");
    expect(settingsFile(outcome).plan).not.toBeNull();
    expect(written.has(SETTINGS)).toBe(false);
  });

  test("keeps every rule it already held", () => {
    const mine = ["Bash(terraform:*)", "Bash(docker:*)"];
    const { fs } = fakeFs([PACKAGE_JSON], existing({ permissions: { allow: mine } }));
    const allow = settingsFile(setup({ root: ROOT, fs })).settings!.permissions.allow;
    for (const rule of mine) expect(allow).toContain(rule);
    expect(allow).toContain("Bash(npm:*)");
    // The rules that were there stay in front, so the diff does not read as a rewrite.
    expect(allow.slice(0, mine.length)).toEqual(mine);
  });

  test("a file that opened a command whole still gets the ends closed", () => {
    // A merge only ever adds, so a file that allows version control keeps that
    // allow and gains the deny beside it — no conflict, nothing to settle.
    const { fs } = fakeFs(
      [PACKAGE_JSON],
      existing({ permissions: { allow: ["Bash(git:*)"], deny: [] } }),
    );
    const plan = settingsFile(setup({ root: ROOT, fs })).plan!;
    expect(plan.conflicts).toEqual([]);
    expect(plan.added.deny).toContain("Bash(git push --force:*)");
    expect(plan.merged.permissions.allow).toContain("Bash(git:*)");
    expect(plan.added.allow).not.toContain("Bash(git:*)");
  });

  test("a rule the file already has is not added twice", () => {
    const { fs } = fakeFs(
      [PACKAGE_JSON],
      existing({ permissions: { allow: ["Bash(npm:*)", "Edit(./**)"] } }),
    );
    const outcome = setup({ root: ROOT, fs });
    const allow = settingsFile(outcome).settings!.permissions.allow;
    expect(allow.filter((rule) => rule === "Bash(npm:*)")).toHaveLength(1);
    expect(settingsFile(outcome).plan!.added.allow).not.toContain("Bash(npm:*)");
  });

  test("keys prep knows nothing about survive the merge", () => {
    const { fs } = fakeFs(
      [PACKAGE_JSON],
      existing({
        hooks: { SessionStart: [{ command: "echo hi" }] },
        env: { DEBUG: "1" },
        permissions: { allow: [], additionalDirectories: ["../shared"] },
      }),
    );
    const merged = settingsFile(setup({ root: ROOT, fs })).settings!;
    expect(merged.hooks).toEqual({ SessionStart: [{ command: "echo hi" }] });
    expect(merged.env).toEqual({ DEBUG: "1" });
    expect(merged.permissions.additionalDirectories).toEqual(["../shared"]);
  });

  test("a differing mode is reported as a conflict, and the existing value stands until asked", () => {
    const { fs } = fakeFs([PACKAGE_JSON], existing({ permissions: { defaultMode: "plan" } }));
    const outcome = setup({ root: ROOT, fs });
    expect(settingsFile(outcome).plan!.conflicts).toEqual([
      { key: "defaultMode", existing: "plan", preset: "acceptEdits" },
    ]);
    expect(settingsFile(outcome).settings!.permissions.defaultMode).toBe("plan");
  });

  test("a file with no mode of its own takes the preset's without asking", () => {
    const { fs } = fakeFs([PACKAGE_JSON], existing({ permissions: { allow: [] } }));
    const outcome = setup({ root: ROOT, fs });
    expect(settingsFile(outcome).plan!.conflicts).toEqual([]);
    expect(settingsFile(outcome).settings!.permissions.defaultMode).toBe("acceptEdits");
  });

  test("a file that already covers the baseline is left with nothing to propose", () => {
    const { fs, written } = fakeFs([PACKAGE_JSON]);
    const applied = setup({ root: ROOT, fs });
    expect(settingsFile(applied).status).toBe("applied");

    const second = setup({ root: ROOT, fs });
    expect(settingsFile(second).status).toBe("skipped");
    expect(settingsFile(second).settings).toBeNull();
    expect(written.get(SETTINGS)).toBe(JSON.stringify(settingsFile(applied).settings, null, 2) + "\n");
  });

  test("malformed JSON is a tool error, not a silent no-op", () => {
    const { fs } = fakeFs([PACKAGE_JSON], { contents: { [SETTINGS]: "{ not json" } });
    expect(() => setup({ root: ROOT, fs })).toThrow(SetupError);
    expect(() => setup({ root: ROOT, fs })).toThrow(SETTINGS);
  });

  test("a permissions block prep cannot merge stops the run instead of rewriting it", () => {
    for (const shape of [{ permissions: [] }, { permissions: { allow: "Bash(npm:*)" } }]) {
      const { fs } = fakeFs([PACKAGE_JSON], existing(shape));
      expect(() => setup({ root: ROOT, fs })).toThrow(SetupError);
    }
  });

  test("a file that cannot be read is a tool error naming the path", () => {
    const { fs } = fakeFs([PACKAGE_JSON, SETTINGS]);
    try {
      setup({ root: ROOT, fs });
      throw new Error("expected a SetupError");
    } catch (error) {
      expect(error).toBeInstanceOf(SetupError);
      expect((error as Error).message).toContain(SETTINGS);
    }
  });
});

describe("dry run", () => {
  test("plans without writing", () => {
    const { fs, written } = fakeFs([PACKAGE_JSON]);
    const outcome = setup({ root: ROOT, dryRun: true, fs });
    expect(settingsFile(outcome).status).toBe("planned");
    expect(written.size).toBe(0);
  });

  test("shows the very settings a real run would write", () => {
    const planned = setup({ root: ROOT, dryRun: true, fs: fakeFs([PACKAGE_JSON, PYPROJECT]).fs });
    const applied = setup({ root: ROOT, fs: fakeFs([PACKAGE_JSON, PYPROJECT]).fs });
    expect(settingsFile(planned).settings).toEqual(settingsFile(applied).settings);
  });

  test("shows the merge when the file already exists, and still writes nothing", () => {
    const { fs, written } = fakeFs([PACKAGE_JSON], existing({ permissions: { allow: [] } }));
    const outcome = setup({ root: ROOT, dryRun: true, fs });
    expect(settingsFile(outcome).status).toBe("planned");
    expect(settingsFile(outcome).plan!.added.allow).toContain("Bash(npm:*)");
    expect(written.size).toBe(0);
  });

  test("with no marker it plans the type-independent half", () => {
    const { fs, written } = fakeFs([]);
    const outcome = setup({ root: ROOT, dryRun: true, fs });
    expect(settingsFile(outcome).status).toBe("planned");
    const allow = settingsFile(outcome).settings!.permissions.allow;
    expect(allow).toContain("Edit(./**)");
    expect(allow).toContain("Bash(git:*)");
    expect(allow.some((rule) => rule.includes("npm"))).toBe(false);
    expect(written.size).toBe(0);
  });

  test("still points at the machine — what is owed is true before anything is written", () => {
    const { fs } = fakeFs([PACKAGE_JSON]);
    const outcome = setup({ root: ROOT, dryRun: true, fs });
    expect(outcome.next.map((step) => step.id)).toContain("doctor");
  });
});

describe("the machine pointer", () => {
  test("a second run over an unchanged project still names it", () => {
    const { fs } = fakeFs([PACKAGE_JSON]);
    setup({ root: ROOT, fs });
    const second = setup({ root: ROOT, fs });
    expect(second.next.map((step) => step.id)).toContain("doctor");
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
      expect((error as Error).message).toContain(SETTINGS);
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
    expect(enabled(outcome)).toEqual({});
    expect(JSON.parse(written.get(SETTINGS)!).enabledPlugins).toBeUndefined();
  });

  test("a machine-wide install is turned on in this project", () => {
    const { fs, written } = fakeFs([PACKAGE_JSON], holding(machineWide(TYPESCRIPT)));
    const outcome = setup({ root: ROOT, fs });
    expect(recommended(outcome)).toEqual([["typescript-lsp", "installed"]]);
    expect(enabled(outcome)).toEqual({ [TYPESCRIPT]: true });
    expect(JSON.parse(written.get(SETTINGS)!).enabledPlugins).toEqual({ [TYPESCRIPT]: true });
  });

  test("an install scoped to another project does not count here", () => {
    const { fs } = fakeFs([PACKAGE_JSON], holding(forProject(TYPESCRIPT, "/somewhere/else")));
    const outcome = setup({ root: ROOT, fs });
    expect(recommended(outcome)).toEqual([["typescript-lsp", "missing"]]);
    expect(enabled(outcome)).toEqual({});
  });

  test("an install scoped to this project counts", () => {
    const { fs } = fakeFs([PACKAGE_JSON], holding(forProject(TYPESCRIPT, ROOT)));
    expect(enabled(setup({ root: ROOT, fs }))).toEqual({ [TYPESCRIPT]: true });
  });

  test("only the installed half of a polyglot project's plugins is turned on", () => {
    const { fs } = fakeFs([PACKAGE_JSON, PYPROJECT], holding(machineWide(PYRIGHT)));
    const outcome = setup({ root: ROOT, fs });
    expect(recommended(outcome)).toEqual([
      ["typescript-lsp", "missing"],
      ["pyright-lsp", "installed"],
    ]);
    expect(enabled(outcome)).toEqual({ [PYRIGHT]: true });
  });

  test("turning one on goes through the merge, so an existing file is planned and not written", () => {
    const settings = existing({ permissions: { allow: [] } });
    const { fs, written } = fakeFs([PACKAGE_JSON], {
      contents: { ...settings.contents, ...record(machineWide(TYPESCRIPT)) },
    });
    const outcome = setup({ root: ROOT, fs });
    expect(settingsFile(outcome).status).toBe("planned");
    expect(settingsFile(outcome).plan!.addedPlugins).toEqual([TYPESCRIPT]);
    expect(written.has(SETTINGS)).toBe(false);
  });

  test("an entry already in the settings file is left exactly as it is, on or off", () => {
    for (const value of [true, false]) {
      const settings = existing({
        permissions: { allow: [] },
        enabledPlugins: { [TYPESCRIPT]: value },
      });
      const { fs } = fakeFs([PACKAGE_JSON], {
        contents: { ...settings.contents, ...record(machineWide(TYPESCRIPT)) },
      });
      const outcome = setup({ root: ROOT, fs });
      expect(recommended(outcome)).toEqual([["typescript-lsp", "answered"]]);
      expect(settingsFile(outcome).plan!.addedPlugins).toEqual([]);
      expect(settingsFile(outcome).settings!.enabledPlugins).toEqual({ [TYPESCRIPT]: value });
    }
  });

  test("a second run over prep's own output has nothing left to propose", () => {
    const { fs } = fakeFs([PACKAGE_JSON], holding(machineWide(TYPESCRIPT)));
    expect(settingsFile(setup({ root: ROOT, fs })).status).toBe("applied");

    const second = setup({ root: ROOT, fs });
    expect(settingsFile(second).status).toBe("skipped");
    expect(recommended(second)).toEqual([["typescript-lsp", "answered"]]);
  });

  test("a dry run reports the same recommendation and writes nothing", () => {
    const { fs, written } = fakeFs([PACKAGE_JSON], holding(machineWide(TYPESCRIPT)));
    const outcome = setup({ root: ROOT, dryRun: true, fs });
    expect(recommended(outcome)).toEqual([["typescript-lsp", "installed"]]);
    expect(enabled(outcome)).toEqual({ [TYPESCRIPT]: true });
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

  test("a plugin whose server is not on PATH is not turned on — the entry would configure nothing", () => {
    const { fs, written } = fakeFs([PACKAGE_JSON], holding(machineWide(TYPESCRIPT)));
    const outcome = setup({ root: ROOT, fs, which: () => null });
    expect(recommended(outcome)).toEqual([["typescript-lsp", "installed"]]);
    expect(outcome.plugins[0]!.server.status).toBe("missing");
    expect(enabled(outcome)).toEqual({});
    expect(JSON.parse(written.get(SETTINGS)!).enabledPlugins).toBeUndefined();
  });

  test("installing the server is all that stands between the two runs", () => {
    const held = holding(machineWide(TYPESCRIPT));
    const without = setup({ root: ROOT, fs: fakeFs([PACKAGE_JSON], held).fs, which: () => null });
    const with_ = setup({ root: ROOT, fs: fakeFs([PACKAGE_JSON], held).fs });
    expect(enabled(without)).toEqual({});
    expect(enabled(with_)).toEqual({ [TYPESCRIPT]: true });
  });

  test("a plugin block prep cannot read stops the run instead of rewriting it", () => {
    const { fs } = fakeFs([PACKAGE_JSON], existing({ enabledPlugins: [TYPESCRIPT] }));
    expect(() => setup({ root: ROOT, fs })).toThrow(SetupError);
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
    const baseline = settingsFile(setup({ root: ROOT, fs: fakeFs([PACKAGE_JSON]).fs })).settings;
    const { fs } = fakeFs([PACKAGE_JSON], {
      contents: { ...SETTLED.contents, [SETTINGS]: JSON.stringify(baseline) },
    });
    const outcome = setup({ root: ROOT, fs });
    expect(settingsFile(outcome).status).toBe("skipped");
    expect(outcome.handoff.every((result) => result.status === "ready")).toBe(true);
  });

  test("it is read on a dry run too — reading owes nothing to writing", () => {
    const { fs } = fakeFs([PACKAGE_JSON], SETTLED);
    const outcome = setup({ root: ROOT, dryRun: true, fs });
    expect(settingsFile(outcome).status).toBe("planned");
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

describe("which harness the files are written for", () => {
  /** A machine holding these binaries and nothing else. */
  function machine(...binaries: string[]): WhichFn {
    return (binary) => (binaries.includes(binary) ? `/usr/bin/${binary}` : null);
  }

  /** The files a run produced, by kind, in the order they are reported. */
  function kinds(outcome: SetupOutcome): string[] {
    return outcome.artifacts.map((artifact) => artifact.kind);
  }

  test("a machine with both harnesses gets the files both of them read", () => {
    const { fs, written } = fakeFs([PACKAGE_JSON]);
    const outcome = setup({ root: ROOT, fs, which: machine("claude", "codex") });
    expect(kinds(outcome)).toEqual(["claude-settings", "codex-config", "agents-md", "claude-md"]);
    expect(written.has(SETTINGS)).toBe(true);
    expect(written.has(CODEX_CONFIG)).toBe(true);
  });

  test("with only Claude Code here, no Codex file is written", () => {
    const { fs, written } = fakeFs([PACKAGE_JSON]);
    const outcome = setup({ root: ROOT, fs, which: machine("claude") });
    expect(kinds(outcome)).toEqual(["claude-settings", "agents-md", "claude-md"]);
    expect(written.has(CODEX_CONFIG)).toBe(false);
  });

  test("with only Codex here, no Claude file is written", () => {
    const { fs, written } = fakeFs([PACKAGE_JSON]);
    const outcome = setup({ root: ROOT, fs, which: machine("codex") });
    expect(kinds(outcome)).toEqual(["codex-config", "agents-md"]);
    expect(written.has(SETTINGS)).toBe(false);
    expect(written.has(CLAUDE_MD)).toBe(false);
    expect(written.has(CODEX_CONFIG)).toBe(true);
  });

  test("the guidance file is written whatever the machine holds — both harnesses read it", () => {
    for (const which of [machine(), machine("claude"), machine("codex"), machine("claude", "codex")]) {
      const { fs, written } = fakeFs([PACKAGE_JSON]);
      expect(kinds(setup({ root: ROOT, fs, which }))).toContain("agents-md");
      expect(written.has(AGENTS_MD)).toBe(true);
    }
  });

  test("with no harness at all the Claude files are written anyway", () => {
    const { fs, written } = fakeFs([PACKAGE_JSON]);
    const outcome = setup({ root: ROOT, fs, which: machine() });
    expect(kinds(outcome)).toEqual(["claude-settings", "agents-md", "claude-md"]);
    expect(written.has(SETTINGS)).toBe(true);
    expect(written.has(CODEX_CONFIG)).toBe(false);
  });

  test("the outcome says which harness is here and which one this run wrote for", () => {
    const outcome = setup({ root: ROOT, fs: fakeFs([]).fs, which: machine("codex") });
    expect(outcome.harnesses).toEqual([
      { id: "claude-code", installed: false, covered: false },
      { id: "codex", installed: true, covered: true },
    ]);
  });

  test("a fallback run says so: nothing installed, and the Claude files written regardless", () => {
    const outcome = setup({ root: ROOT, fs: fakeFs([]).fs, which: machine() });
    expect(outcome.harnesses).toEqual([
      { id: "claude-code", installed: false, covered: true },
      { id: "codex", installed: false, covered: false },
    ]);
  });

  test("no plugin is recommended where no settings file is written", () => {
    const { fs } = fakeFs([PACKAGE_JSON], {
      contents: record({ id: TYPESCRIPT, scope: "user", projectPath: null }),
    });
    expect(setup({ root: ROOT, fs, which: machine("codex") }).plugins).toEqual([]);
  });

  test("an unreadable install record cannot fail a run that writes no settings file", () => {
    const { fs } = fakeFs([PACKAGE_JSON], { contents: { [RECORD]: "{ not json" } });
    expect(() => setup({ root: ROOT, fs, which: machine("codex") })).not.toThrow();
  });
});

describe("the Codex permission file", () => {
  function codexFile(outcome: SetupOutcome): CodexArtifact {
    const artifact = outcome.artifacts.find((one) => one.kind === "codex-config");
    if (artifact === undefined) throw new Error("the run produced no Codex file");
    return artifact;
  }

  test("it holds the same secret paths the Claude baseline denies", () => {
    const { fs, written } = fakeFs([PACKAGE_JSON]);
    const outcome = setup({ root: ROOT, fs });
    expect(codexFile(outcome).status).toBe("applied");

    const document = Bun.TOML.parse(written.get(CODEX_CONFIG)!) as Record<string, any>;
    const filesystem = document.permissions["project-edit"].filesystem;
    expect(filesystem[":workspace_roots"][".env"]).toBe("deny");
    expect(filesystem["~/.ssh"]).toBe("deny");
    expect(document.default_permissions).toBe("project-edit");
  });

  test("a file that is already there is not touched", () => {
    const mine = 'model = "o3"\n';
    const { fs, written } = fakeFs([], { contents: { [CODEX_CONFIG]: mine } });
    const artifact = codexFile(setup({ root: ROOT, fs }));
    expect(artifact.status).toBe("skipped");
    expect(artifact.config).toBeNull();
    expect(written.has(CODEX_CONFIG)).toBe(false);
  });

  test("an existing sandbox mode is reported, because it turns the profile off", () => {
    const theirs = 'sandbox_mode = "workspace-write"\n';
    const { fs } = fakeFs([], { contents: { [CODEX_CONFIG]: theirs } });
    expect(codexFile(setup({ root: ROOT, fs })).sandboxMode).toBe(true);
  });

  test("a file prep writes itself sets no sandbox mode", () => {
    const { fs } = fakeFs([PACKAGE_JSON]);
    expect(codexFile(setup({ root: ROOT, fs })).sandboxMode).toBe(false);
  });

  test("a dry run plans it and writes nothing", () => {
    const { fs, written } = fakeFs([PACKAGE_JSON]);
    const artifact = codexFile(setup({ root: ROOT, dryRun: true, fs }));
    expect(artifact.status).toBe("planned");
    expect(artifact.config?.workspace[0]).toBe(".env");
    expect(written.size).toBe(0);
  });

  test("a failed write surfaces as a tool error naming the path", () => {
    const { fs } = fakeFs([PACKAGE_JSON], {
      onWrite: (path) => {
        if (path === CODEX_CONFIG) throw new Error("EACCES: permission denied");
      },
    });
    expect(() => setup({ root: ROOT, fs })).toThrow(SetupError);
    expect(() => setup({ root: ROOT, fs })).toThrow(/config\.toml/);
  });
});
