import { describe, expect, test } from "bun:test";

import { checkAll } from "../src/probe.ts";
import { all } from "../src/registry.ts";
import { renderJson } from "../src/report/json.ts";
import type { Platform, ToolSpec, WhichFn } from "../src/types.ts";

function fakeWhich(found: Record<string, string>): WhichFn {
  return (binary) => found[binary] ?? null;
}

/**
 * The contract snapshots use this fixed list, not the registry.
 * A growing tool list must not shake the shape of the JSON contract.
 *
 * Four entries cover the contract's four branches:
 * manual + url, manual alone, command, and a binary one platform renames.
 */
const FIXTURE: readonly ToolSpec[] = [
  {
    id: "homebrew",
    binary: "brew",
    summary: "macOS package manager",
    tier: "prerequisite",
    platforms: {
      darwin: {
        guidance: { kind: "manual", note: "Follow the official install script", url: "https://brew.sh" },
      },
    },
  },
  {
    id: "apt",
    binary: "apt",
    summary: "Debian-family package manager",
    tier: "prerequisite",
    platforms: {
      linux: { guidance: { kind: "manual", note: "Check your distro's package manager yourself" } },
    },
  },
  {
    id: "git",
    binary: "git",
    summary: "version control",
    tier: "standard",
    platforms: {
      darwin: { guidance: { kind: "command", command: "brew install git" } },
      linux: { guidance: { kind: "command", command: "sudo apt install git" } },
    },
  },
  {
    id: "fd",
    binary: "fd",
    summary: "fast file search",
    tier: "standard",
    platforms: {
      darwin: { guidance: { kind: "command", command: "brew install fd" } },
      linux: {
        renamed: "fdfind",
        guidance: {
          kind: "command",
          command:
            'sudo apt install fd-find && mkdir -p ~/.local/bin && ln -sf "$(command -v fdfind)" ~/.local/bin/fd',
        },
      },
    },
  },
];

function render(platform: Platform, found: Record<string, string>): string {
  return renderJson({ platform, results: checkAll(FIXTURE, platform, fakeWhich(found)) });
}

function parse(platform: Platform, found: Record<string, string>): unknown {
  return JSON.parse(render(platform, found));
}

describe("JSON report snapshots", () => {
  test("macOS · installed, gaps, and not applicable mixed", () => {
    expect(
      render("darwin", { brew: "/opt/homebrew/bin/brew", git: "/usr/bin/git" }),
    ).toMatchSnapshot();
  });

  test("Linux · including a binary the distribution renames", () => {
    expect(render("linux", { apt: "/usr/bin/apt", fdfind: "/usr/bin/fdfind" })).toMatchSnapshot();
  });
});

describe("the JSON contract", () => {
  test("the top level is platform and results, nothing else", () => {
    const payload = parse("darwin", { brew: "/x" }) as Record<string, unknown>;
    expect(Object.keys(payload)).toEqual(["platform", "results"]);
    expect(payload.platform).toBe("darwin");
    expect(Array.isArray(payload.results)).toBe(true);
  });

  test("results keep the input order", () => {
    const payload = parse("linux", {}) as { results: { id: string }[] };
    expect(payload.results.map((result) => result.id)).toEqual(["homebrew", "apt", "git", "fd"]);
  });

  test("an entry has the five keys id, status, binary, path, guidance, in a fixed order", () => {
    const payload = parse("darwin", { git: "/usr/bin/git" }) as { results: object[] };
    for (const result of payload.results) {
      expect(Object.keys(result)).toEqual(["id", "status", "binary", "path", "guidance"]);
    }
  });

  test("installed emits path as a string, a gap emits null", () => {
    const payload = parse("darwin", { git: "/usr/bin/git" }) as {
      results: { id: string; status: string; binary: string | null; path: string | null }[];
    };
    const git = payload.results.find((result) => result.id === "git");
    const fd = payload.results.find((result) => result.id === "fd");

    expect(git).toMatchObject({ status: "installed", binary: "git", path: "/usr/bin/git" });
    expect(fd).toMatchObject({ status: "missing", binary: "fd", path: null });
  });

  test("a not-applicable entry has binary, path, and guidance all null", () => {
    const payload = parse("darwin", {}) as {
      results: { id: string; status: string; binary: null; path: null; guidance: null }[];
    };
    const apt = payload.results.find((result) => result.id === "apt");
    expect(apt).toEqual({
      id: "apt",
      status: "unsupported",
      binary: null,
      path: null,
      guidance: null,
    });
  });

  // The contract carries the name that was asked for, and the name that was
  // asked for is the canonical one. A machine answering only to fdfind is a gap,
  // and the script reading this runs the command that closes it.
  test("a renamed binary is emitted under the canonical name, and as a gap", () => {
    const payload = parse("linux", { fdfind: "/usr/bin/fdfind" }) as {
      results: { id: string; status: string; binary: string | null; path: string | null }[];
    };
    const fd = payload.results.find((result) => result.id === "fd");
    expect(fd?.binary).toBe("fd");
    expect(fd?.status).toBe("missing");
    expect(fd?.path).toBeNull();
  });

  test("the canonical name found is where the path comes from", () => {
    const payload = parse("linux", { fd: "/home/me/.local/bin/fd" }) as {
      results: { id: string; status: string; binary: string | null; path: string | null }[];
    };
    const fd = payload.results.find((result) => result.id === "fd");
    expect(fd?.binary).toBe("fd");
    expect(fd?.status).toBe("installed");
    expect(fd?.path).toBe("/home/me/.local/bin/fd");
  });

  test("guidance branches on kind, and url appears only when present", () => {
    const darwin = parse("darwin", {}) as { results: { id: string; guidance: unknown }[] };
    expect(darwin.results.find((result) => result.id === "homebrew")?.guidance).toEqual({
      kind: "manual",
      note: "Follow the official install script",
      url: "https://brew.sh",
    });
    expect(darwin.results.find((result) => result.id === "git")?.guidance).toEqual({
      kind: "command",
      command: "brew install git",
    });

    const linux = parse("linux", {}) as { results: { id: string; guidance: unknown }[] };
    expect(linux.results.find((result) => result.id === "apt")?.guidance).toEqual({
      kind: "manual",
      note: "Check your distro's package manager yourself",
    });
  });

  test("ends with exactly one newline", () => {
    const output = render("darwin", {});
    expect(output.endsWith("}\n")).toBe(true);
    expect(output.endsWith("}\n\n")).toBe(false);
  });
});

describe("no human wording leaks in", () => {
  const outputs = [
    render("darwin", { brew: "/x", git: "/x" }),
    render("darwin", {}),
    render("linux", { apt: "/x", git: "/x", fdfind: "/x" }),
    render("linux", {}),
  ];

  test("no symbols and no color escapes", () => {
    for (const output of outputs) {
      for (const symbol of ["✓", "✗", "–", "⚠"]) expect(output).not.toContain(symbol);
      expect(output).not.toContain("\u001b[");
    }
  });

  test("no summary wording and no human header or footer", () => {
    for (const output of outputs) {
      expect(output).not.toContain("prep doctor ·");
      expect(output).not.toContain("Installed");
      expect(output).not.toContain("Gaps");
      expect(output).not.toContain("Prerequisites");
      expect(output).not.toContain("Not applicable");
      expect(output).not.toContain("prep does not install anything yet");
      // spec.summary belongs to the human renderer only; it is not in the contract.
      expect(output).not.toContain("fast file search");
      expect(output).not.toContain("version control");
    }
  });

  test("a missing prerequisite does not hide a gap's guidance", () => {
    // The human report suppresses the command; JSON hands the call to the consumer.
    const payload = parse("darwin", {}) as { results: { id: string; guidance: unknown }[] };
    expect(payload.results.find((result) => result.id === "fd")?.guidance).toEqual({
      kind: "command",
      command: "brew install fd",
    });
  });
});

describe("the real registry", () => {
  test("the contract shape holds as the list grows", () => {
    const specs = all();
    const payload = JSON.parse(
      renderJson({ platform: "darwin", results: checkAll(specs, "darwin", fakeWhich({})) }),
    ) as { platform: string; results: { id: string; status: string }[] };

    expect(payload.platform).toBe("darwin");
    expect(payload.results).toHaveLength(specs.length);
    expect(payload.results.map((result) => result.id)).toEqual(specs.map((spec) => spec.id));
    for (const result of payload.results) {
      expect(["installed", "missing", "unsupported"]).toContain(result.status);
    }
  });
});
