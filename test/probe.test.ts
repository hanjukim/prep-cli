import { describe, expect, spyOn, test } from "bun:test";

import { check, checkAll } from "../src/probe.ts";
import { all } from "../src/registry.ts";
import type { ToolSpec, WhichFn } from "../src/types.ts";

/** A fake lookup that finds only the given names. It never looks at the real machine. */
function fakeWhich(found: Record<string, string>): WhichFn {
  return (binary) => found[binary] ?? null;
}

const ripgrep: ToolSpec = {
  id: "ripgrep",
  binary: "rg",
  summary: "fast text search",
  tier: "standard",
  platforms: {
    darwin: { guidance: { kind: "command", command: "brew install ripgrep" } },
    linux: { guidance: { kind: "command", command: "sudo apt install ripgrep" } },
  },
};

/** An entry one platform's distribution ships under another name. The fd and bat shape. */
const renamed: ToolSpec = {
  id: "renamed",
  binary: "orig",
  summary: "tool with a diverging name",
  tier: "standard",
  platforms: {
    darwin: { guidance: { kind: "command", command: "brew install renamed" } },
    linux: {
      renamed: "renamed-on-linux",
      guidance: { kind: "command", command: "sudo apt install renamed" },
    },
  },
};

/** An entry that exists on one platform only. */
const linuxOnly: ToolSpec = {
  id: "linux-only",
  binary: "apt",
  summary: "Linux only",
  tier: "prerequisite",
  platforms: {
    linux: { guidance: { kind: "manual", note: "See your distro's documentation" } },
  },
};

describe("check", () => {
  test("when found, reports installed and the path", () => {
    const result = check(ripgrep, "darwin", fakeWhich({ rg: "/opt/homebrew/bin/rg" }));
    expect(result).toEqual({
      id: "ripgrep",
      status: "installed",
      binary: "rg",
      path: "/opt/homebrew/bin/rg",
      renamed: null,
      guidance: { kind: "command", command: "brew install ripgrep" },
    });
  });

  test("when not found, reports missing with a null path", () => {
    const result = check(ripgrep, "linux", fakeWhich({}));
    expect(result.status).toBe("missing");
    expect(result.path).toBeNull();
    expect(result.binary).toBe("rg");
    expect(result.guidance).toEqual({ kind: "command", command: "sudo apt install ripgrep" });
  });

  test("with no platform key, exits early as unsupported", () => {
    const result = check(linuxOnly, "darwin", fakeWhich({ apt: "/usr/bin/apt" }));
    expect(result).toEqual({
      id: "linux-only",
      status: "unsupported",
      binary: null,
      path: null,
      renamed: null,
      guidance: null,
    });
  });

  test("when unsupported, the lookup is never called at all", () => {
    const asked: string[] = [];
    check(linuxOnly, "darwin", (binary) => {
      asked.push(binary);
      return null;
    });
    expect(asked).toEqual([]);
  });

  test("the canonical name is what is asked for, whatever the distribution ships", () => {
    const asked: string[] = [];
    const result = check(renamed, "linux", (binary) => {
      asked.push(binary);
      return binary === "renamed-on-linux" ? "/usr/bin/renamed-on-linux" : null;
    });
    expect(asked).toEqual(["orig"]);
    expect(result.status).toBe("missing");
    expect(result.binary).toBe("orig");
  });

  test("the name the distribution ships is not an answer to the name people type", () => {
    const result = check(renamed, "linux", fakeWhich({ "renamed-on-linux": "/usr/bin/renamed-on-linux" }));
    expect(result.status).toBe("missing");
    expect(result.path).toBeNull();
    expect(result.guidance).toEqual({ kind: "command", command: "sudo apt install renamed" });
  });

  test("the canonical name found is installed, and carries the path it was found at", () => {
    const result = check(renamed, "linux", fakeWhich({ orig: "/home/me/.local/bin/orig" }));
    expect(result.status).toBe("installed");
    expect(result.binary).toBe("orig");
    expect(result.path).toBe("/home/me/.local/bin/orig");
  });

  test("a platform that renames nothing is asked the same question", () => {
    const asked: string[] = [];
    check(renamed, "darwin", (binary) => {
      asked.push(binary);
      return null;
    });
    expect(asked).toEqual(["orig"]);
  });
});

describe("checkAll", () => {
  test("keeps the input order", () => {
    const results = checkAll([ripgrep, renamed, linuxOnly], "linux", fakeWhich({}));
    expect(results.map((r) => r.id)).toEqual(["ripgrep", "renamed", "linux-only"]);
  });
});

describe("lookup names in the real registry", () => {
  /** The names one entry actually asked about on the given platform. */
  function asked(id: string, platform: "darwin" | "linux"): string[] {
    const spec = all().find((s) => s.id === id)!;
    const names: string[] = [];
    check(spec, platform, (binary) => {
      names.push(binary);
      return null;
    });
    return names;
  }

  test("fd is looked up as fd on both platforms, batcat and fdfind notwithstanding", () => {
    expect(asked("fd", "linux")).toEqual(["fd"]);
    expect(asked("fd", "darwin")).toEqual(["fd"]);
  });

  test("bat is looked up as bat on both platforms", () => {
    expect(asked("bat", "linux")).toEqual(["bat"]);
    expect(asked("bat", "darwin")).toEqual(["bat"]);
  });

  // The package is on this machine and the name is not, which is the state a
  // Debian install of bat leaves behind. It is a gap: nothing on this machine
  // answers to bat, and bat is what anybody types.
  test("the package under its Debian name alone leaves the entry missing", () => {
    const bat = all().find((s) => s.id === "bat")!;
    const result = check(bat, "linux", fakeWhich({ batcat: "/usr/bin/batcat" }));
    expect(result.status).toBe("missing");
    expect(result.binary).toBe("bat");
    expect(result.path).toBeNull();
  });

  test("the canonical name, the found path and the shipped name land in the result", () => {
    const fd = all().find((s) => s.id === "fd")!;
    const result = check(fd, "linux", fakeWhich({ fd: "/home/me/.local/bin/fd" }));
    expect(result).toEqual({
      id: "fd",
      status: "installed",
      binary: "fd",
      path: "/home/me/.local/bin/fd",
      renamed: "fdfind",
      guidance: {
        kind: "command",
        command: "sudo apt install -y fd-find",
      },
    });
  });

  test("no standard tool falls to unsupported on either platform", () => {
    const standardIds = all()
      .filter((spec) => spec.tier === "standard")
      .map((spec) => spec.id);
    expect(standardIds.length).toBe(10);

    for (const platform of ["darwin", "linux"] as const) {
      const byId = new Map(checkAll(all(), platform, fakeWhich({})).map((r) => [r.id, r]));
      for (const id of standardIds) {
        const result = byId.get(id)!;
        expect(result.status).toBe("missing");
        expect(result.binary).not.toBeNull();
      }
    }
  });
});

describe("no side effects", () => {
  test("sweeping the real registry with the real lookup spawns no subprocess", () => {
    const spawn = spyOn(Bun, "spawn");
    const spawnSync = spyOn(Bun, "spawnSync");
    try {
      checkAll(all(), process.platform === "linux" ? "linux" : "darwin");
      expect(spawn).not.toHaveBeenCalled();
      expect(spawnSync).not.toHaveBeenCalled();
    } finally {
      spawn.mockRestore();
      spawnSync.mockRestore();
    }
  });
});
