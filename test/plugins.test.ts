import { describe, expect, test } from "bun:test";

import {
  PluginsError,
  type RecommendInput,
  parseInstalledPlugins,
  pluginId,
  readInstalledPlugins,
  recommend as recommendPlugins,
  serverInstallCommand,
  toEnable,
} from "../src/plugins.ts";
import type { InstalledPlugin, ProjectType, SetupFs, WhichFn } from "../src/types.ts";

/** A machine with every language server on PATH, and one with none. */
const FOUND: WhichFn = (binary) => `/usr/bin/${binary}`;
const NOT_FOUND: WhichFn = () => null;

/**
 * Recommendations against a machine whose language servers are all there.
 *
 * The server is a second, independent half, so every test about the plugin half
 * holds it fixed and the tests about the server half hand in their own lookup.
 */
function recommend(input: Omit<RecommendInput, "which"> & { which?: WhichFn }) {
  return recommendPlugins({ which: FOUND, ...input });
}

const ROOT = "/project";
const MARKETPLACE = "claude-plugins-official";
const TYPESCRIPT = "typescript-lsp@claude-plugins-official";
const PYRIGHT = "pyright-lsp@claude-plugins-official";

/** One record entry, as the harness would have left it. */
function machineWide(id: string): InstalledPlugin {
  return { id, scope: "user", projectPath: null };
}

function forProject(id: string, projectPath: string): InstalledPlugin {
  return { id, scope: "project", projectPath };
}

function ids(detected: ProjectType[], installed: InstalledPlugin[] = [], enabled?: unknown) {
  return recommend({ detected, root: ROOT, enabled, installed }).map(pluginId);
}

describe("which plugin goes with which type", () => {
  test("a node project is recommended the typescript language server", () => {
    expect(ids(["node"])).toEqual([TYPESCRIPT]);
  });

  test("a python project is recommended pyright", () => {
    expect(ids(["python"])).toEqual([PYRIGHT]);
  });

  test("a polyglot project is recommended both, in table order", () => {
    expect(ids(["node", "python"])).toEqual([TYPESCRIPT, PYRIGHT]);
  });

  test("an unrecognised project is recommended nothing — no tool is invented", () => {
    expect(ids([])).toEqual([]);
  });

  test("every recommendation names its marketplace", () => {
    for (const plugin of recommend({ detected: ["node", "python"], root: ROOT, installed: [] })) {
      expect(plugin.marketplace).toBe("claude-plugins-official");
    }
  });
});

describe("what the machine already holds", () => {
  test("a plugin nowhere in the record is missing", () => {
    expect(recommend({ detected: ["node"], root: ROOT, installed: [] })[0]!.status).toBe("missing");
  });

  test("a machine-wide install counts in any project", () => {
    const installed = [machineWide(TYPESCRIPT)];
    expect(recommend({ detected: ["node"], root: ROOT, installed })[0]!.status).toBe("installed");
  });

  test("a project-scoped install counts in that project", () => {
    const installed = [forProject(TYPESCRIPT, ROOT)];
    expect(recommend({ detected: ["node"], root: ROOT, installed })[0]!.status).toBe("installed");
  });

  test("a project-scoped install elsewhere does not count here", () => {
    const installed = [forProject(TYPESCRIPT, "/somewhere/else")];
    expect(recommend({ detected: ["node"], root: ROOT, installed })[0]!.status).toBe("missing");
  });

  test("the same path written differently is still the same project", () => {
    const installed = [forProject(TYPESCRIPT, "/project/")];
    expect(recommend({ detected: ["node"], root: "/project", installed })[0]!.status).toBe(
      "installed",
    );
  });

  test("a project scope with no path counts nowhere", () => {
    const installed: InstalledPlugin[] = [{ id: TYPESCRIPT, scope: "project", projectPath: null }];
    expect(recommend({ detected: ["node"], root: ROOT, installed })[0]!.status).toBe("missing");
  });

  test("a project scope with a relative path counts nowhere — it names no one project", () => {
    const installed = [forProject(TYPESCRIPT, "project")];
    expect(recommend({ detected: ["node"], root: ROOT, installed })[0]!.status).toBe("missing");
  });

  test("another plugin being installed says nothing about this one", () => {
    const installed = [machineWide(PYRIGHT)];
    expect(recommend({ detected: ["node"], root: ROOT, installed })[0]!.status).toBe("missing");
  });
});

describe("what the project settings already say", () => {
  test("an entry already there is left alone, whatever the machine holds", () => {
    const enabled = { [TYPESCRIPT]: true };
    const installed = [machineWide(TYPESCRIPT)];
    expect(recommend({ detected: ["node"], root: ROOT, enabled, installed })[0]!.status).toBe(
      "answered",
    );
  });

  test("an entry switched off is left off — prep does not turn it back on", () => {
    const enabled = { [TYPESCRIPT]: false };
    const installed = [machineWide(TYPESCRIPT)];
    expect(recommend({ detected: ["node"], root: ROOT, enabled, installed })[0]!.status).toBe(
      "answered",
    );
  });

  test("an entry for a plugin the machine does not hold is still left alone", () => {
    const enabled = { [TYPESCRIPT]: true };
    expect(recommend({ detected: ["node"], root: ROOT, enabled, installed: [] })[0]!.status).toBe(
      "answered",
    );
  });

  test("an entry for some other plugin decides nothing", () => {
    const enabled = { "context7@claude-plugins-official": true };
    const installed = [machineWide(TYPESCRIPT)];
    expect(recommend({ detected: ["node"], root: ROOT, enabled, installed })[0]!.status).toBe(
      "installed",
    );
  });

  test("a settings file with no plugin block at all reads as nothing decided", () => {
    const installed = [machineWide(TYPESCRIPT)];
    expect(
      recommend({ detected: ["node"], root: ROOT, enabled: undefined, installed })[0]!.status,
    ).toBe("installed");
  });
});

describe("the language server the plugin points at", () => {
  test("each recommendation names the executable the plugin would run", () => {
    const both = recommend({ detected: ["node", "python"], root: ROOT, installed: [] });
    expect(both.map((plugin) => plugin.server.binary)).toEqual([
      "typescript-language-server",
      "pyright-langserver",
    ]);
  });

  test("a server on PATH reads as installed, one that is not reads as missing", () => {
    const input = { detected: ["node"] as ProjectType[], root: ROOT, installed: [] };
    expect(recommend({ ...input, which: FOUND })[0]!.server.status).toBe("installed");
    expect(recommend({ ...input, which: NOT_FOUND })[0]!.server.status).toBe("missing");
  });

  test("the lookup asks for the plugin's own binary and nothing else", () => {
    const asked: string[] = [];
    recommend({
      detected: ["node", "python"],
      root: ROOT,
      installed: [],
      which: (binary) => {
        asked.push(binary);
        return null;
      },
    });
    expect(asked).toEqual(["typescript-language-server", "pyright-langserver"]);
  });

  test("the two halves are read apart — a missing server does not change the plugin's status", () => {
    const installed = [machineWide(TYPESCRIPT)];
    const plugin = recommend({ detected: ["node"], root: ROOT, installed, which: NOT_FOUND })[0]!;
    expect(plugin.status).toBe("installed");
    expect(plugin.server.status).toBe("missing");
  });

  test("each plugin carries the command that installs its server", () => {
    expect(serverInstallCommand({ name: "typescript-lsp", marketplace: MARKETPLACE })).toBe(
      "npm install -g typescript-language-server typescript",
    );
    expect(serverInstallCommand({ name: "pyright-lsp", marketplace: MARKETPLACE })).toBe(
      "pip install pyright",
    );
  });
});

describe("which entries a run writes", () => {
  const NODE = { detected: ["node"] as ProjectType[], root: ROOT };

  test("a plugin installed with its server on PATH is written", () => {
    const installed = [machineWide(TYPESCRIPT)];
    expect(toEnable(recommend({ ...NODE, installed, which: FOUND }))).toEqual([TYPESCRIPT]);
  });

  test("a plugin whose server is not on PATH is not written — the entry would configure nothing", () => {
    const installed = [machineWide(TYPESCRIPT)];
    expect(toEnable(recommend({ ...NODE, installed, which: NOT_FOUND }))).toEqual([]);
  });

  test("a plugin that is not installed is not written, server or no server", () => {
    for (const which of [FOUND, NOT_FOUND]) {
      expect(toEnable(recommend({ ...NODE, installed: [], which }))).toEqual([]);
    }
  });

  test("a plugin the settings file has answered for is not written again", () => {
    const installed = [machineWide(TYPESCRIPT)];
    const enabled = { [TYPESCRIPT]: true };
    expect(toEnable(recommend({ ...NODE, enabled, installed, which: FOUND }))).toEqual([]);
  });
});

describe("reading the install record", () => {
  test("it reads the id, the scope, and the project a scoped install belongs to", () => {
    const text = JSON.stringify({
      version: 2,
      plugins: {
        [TYPESCRIPT]: [{ scope: "user", version: "1.0.0" }],
        [PYRIGHT]: [{ scope: "project", projectPath: "/elsewhere" }],
      },
    });
    expect(parseInstalledPlugins(text)).toEqual([
      { id: TYPESCRIPT, scope: "user", projectPath: null },
      { id: PYRIGHT, scope: "project", projectPath: "/elsewhere" },
    ]);
  });

  test("one plugin installed twice keeps both entries", () => {
    const text = JSON.stringify({
      plugins: { [TYPESCRIPT]: [{ scope: "user" }, { scope: "project", projectPath: "/a" }] },
    });
    expect(parseInstalledPlugins(text)).toHaveLength(2);
  });

  test("a record holding no plugins reads as an empty machine", () => {
    expect(parseInstalledPlugins(JSON.stringify({ version: 2 }))).toEqual([]);
    expect(parseInstalledPlugins(JSON.stringify({ version: 2, plugins: {} }))).toEqual([]);
  });

  test("a scope prep does not know is not counted as installed anywhere", () => {
    const text = JSON.stringify({ plugins: { [TYPESCRIPT]: [{ scope: "session" }] } });
    expect(parseInstalledPlugins(text)).toEqual([]);
  });

  test("a record prep cannot read stops the run rather than reading as empty", () => {
    for (const text of ["{ not json", "[]", '{"plugins":[]}', '{"plugins":{"a":{}}}']) {
      expect(() => parseInstalledPlugins(text)).toThrow(PluginsError);
    }
  });
});

describe("finding the record on a machine", () => {
  const HOME = "/home";
  const RECORD = "/home/.claude/plugins/installed_plugins.json";

  /** The file system prep is handed. Nothing here touches a real disk. */
  function fakeFs(contents: Record<string, string>, unreadable: string[] = []): SetupFs {
    return {
      exists: (path) => path in contents || unreadable.includes(path),
      isDirectory: () => true,
      read: (path) => {
        const text = contents[path];
        if (text === undefined) throw new Error(`EACCES: permission denied, open '${path}'`);
        return text;
      },
      write: () => {},
    };
  }

  test("it reads the record the harness keeps under the home directory", () => {
    const text = JSON.stringify({ plugins: { [TYPESCRIPT]: [{ scope: "user" }] } });
    expect(readInstalledPlugins(HOME, fakeFs({ [RECORD]: text }))).toEqual([
      { id: TYPESCRIPT, scope: "user", projectPath: null },
    ]);
  });

  test("no record at all is a machine nobody has installed one on, not a failure", () => {
    expect(readInstalledPlugins(HOME, fakeFs({}))).toEqual([]);
  });

  test("a record that is there but unreadable stops the run, naming the file", () => {
    const fs = fakeFs({}, [RECORD]);
    expect(() => readInstalledPlugins(HOME, fs)).toThrow(PluginsError);
    expect(() => readInstalledPlugins(HOME, fs)).toThrow(RECORD);
  });

  test("a record prep cannot make sense of names the file too", () => {
    const fs = fakeFs({ [RECORD]: "{ not json" });
    expect(() => readInstalledPlugins(HOME, fs)).toThrow(RECORD);
  });
});
