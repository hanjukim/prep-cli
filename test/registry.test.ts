import { describe, expect, test } from "bun:test";

import { all, harnesses } from "../src/registry.ts";
import type { Platform, ToolSpec } from "../src/types.ts";

const PLATFORMS: Platform[] = ["darwin", "linux"];

describe("registry", () => {
  test("has at least one entry", () => {
    expect(all().length).toBeGreaterThan(0);
  });

  test("ids do not repeat", () => {
    const ids = all().map((spec) => spec.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("every entry has at least one platform", () => {
    for (const spec of all()) {
      expect(Object.keys(spec.platforms).length).toBeGreaterThan(0);
    }
  });

  test("every platform spec has guidance", () => {
    for (const spec of all()) {
      for (const platform of PLATFORMS) {
        const platformSpec = spec.platforms[platform];
        if (!platformSpec) continue;
        expect(platformSpec.guidance.kind).toMatch(/^(manual|command)$/);
        if (platformSpec.guidance.kind === "command") {
          expect(platformSpec.guidance.command.length).toBeGreaterThan(0);
        }
      }
    }
  });

  test("every entry has a one-line purpose", () => {
    for (const spec of all()) {
      expect(spec.summary.length).toBeGreaterThan(0);
    }
  });

  test("the prerequisites are only homebrew on macOS and apt on Linux", () => {
    const prerequisites = all().filter((spec) => spec.tier === "prerequisite");
    expect(prerequisites.map((spec) => spec.id)).toEqual(["homebrew", "apt"]);

    const homebrew = prerequisites[0]!;
    expect(Object.keys(homebrew.platforms)).toEqual(["darwin"]);

    const apt = prerequisites[1]!;
    expect(Object.keys(apt.platforms)).toEqual(["linux"]);
  });

  test("the standard tools are the 10 this table names, lazygit no longer among them", () => {
    const standard = all().filter((spec) => spec.tier === "standard");
    expect(standard.map((spec) => spec.id).sort()).toEqual([
      "bat",
      "eza",
      "fd",
      "fzf",
      "gh",
      "git",
      "jq",
      "make",
      "ripgrep",
      "zoxide",
    ]);
  });

  test("the supported harnesses are Claude Code and Codex", () => {
    const harnesses = all().filter((spec) => spec.tier === "harness");
    expect(harnesses.map((spec) => spec.id)).toEqual(["claude-code", "codex"]);
  });

  test("a harness is looked up under one name on both platforms", () => {
    for (const spec of all().filter((s) => s.tier === "harness")) {
      expect(Object.keys(spec.platforms).sort()).toEqual(["darwin", "linux"]);
      for (const platform of PLATFORMS) {
        expect(spec.platforms[platform]?.renamed).toBeUndefined();
      }
    }
  });

  test("a harness is installed on macOS through a brew cask", () => {
    const byId = new Map(all().map((spec) => [spec.id, spec]));
    const command = (id: string): string => {
      const guidance = byId.get(id)!.platforms.darwin!.guidance;
      return guidance.kind === "command" ? guidance.command : "";
    };
    expect(command("claude-code")).toBe("brew install --cask claude-code");
    expect(command("codex")).toBe("brew install --cask codex");
  });

  test("a harness is left to its documentation on Linux", () => {
    for (const spec of all().filter((s) => s.tier === "harness")) {
      const guidance = spec.platforms.linux!.guidance;
      expect(guidance.kind).toBe("manual");
      if (guidance.kind === "manual") expect(guidance.url).toMatch(/^https:\/\//);
    }
  });

  test("no harness command asks for sudo", () => {
    for (const spec of all().filter((s) => s.tier === "harness")) {
      for (const platform of PLATFORMS) {
        const guidance = spec.platforms[platform]!.guidance;
        if (guidance.kind === "command") expect(guidance.command).not.toMatch(/\bsudo\b/);
      }
    }
  });

  test("a harness command is plain words, because it is run without a shell", () => {
    for (const spec of all().filter((s) => s.tier === "harness")) {
      for (const platform of PLATFORMS) {
        const guidance = spec.platforms[platform]!.guidance;
        if (guidance.kind === "command") expect(guidance.command).toMatch(/^[\w.@/-]+( [\w.@/-]+)*$/);
      }
    }
  });

  test("the harnesses come out of the table itself, in table order", () => {
    // Two callers ask what a harness is — chef, to install one, and setup, to
    // hand a project over. Both read this, so neither can grow a list of its own.
    const fromTable: ToolSpec[] = all().filter((spec) => spec.tier === "harness");
    expect(fromTable).toEqual(harnesses());
  });

  test("every harness carries the command that hands a project to it", () => {
    for (const spec of harnesses()) {
      expect(spec.handoffCommand).toBeDefined();
      // It starts the harness itself. A command naming any other binary would
      // send somebody to a tool prep never checked for.
      expect(spec.handoffCommand!.startsWith(`${spec.binary} `)).toBe(true);
      expect(spec.handoffCommand).toContain("setup-matt-pocock-skills");
    }
  });

  test("nothing but a harness carries one — nothing hands a project to ripgrep", () => {
    for (const spec of all().filter((s) => s.tier !== "harness")) {
      expect(spec.handoffCommand).toBeUndefined();
    }
  });

  test("a handoff command quotes the skill, so no shell reads part of it as a variable", () => {
    for (const spec of harnesses()) {
      expect(spec.handoffCommand).toMatch(/^\S+ '[^']+'$/);
    }
  });

  test("every entry has a default binary name", () => {
    for (const spec of all()) {
      expect(spec.binary.length).toBeGreaterThan(0);
    }
  });

  test("Debian ships fd as fdfind, and fd stays the name that counts", () => {
    const fd = all().find((spec) => spec.id === "fd")!;
    expect(fd.binary).toBe("fd");
    expect(fd.platforms.linux?.renamed).toBe("fdfind");
    expect(fd.platforms.darwin?.renamed).toBeUndefined();
  });

  test("Debian ships bat as batcat, and bat stays the name that counts", () => {
    const bat = all().find((spec) => spec.id === "bat")!;
    expect(bat.binary).toBe("bat");
    expect(bat.platforms.linux?.renamed).toBe("batcat");
    expect(bat.platforms.darwin?.renamed).toBeUndefined();
  });

  test("a renamed binary is recorded in the table, never as a branch", () => {
    const renamed = all().flatMap((spec) =>
      PLATFORMS.flatMap((platform) => {
        const name = spec.platforms[platform]?.renamed;
        return name === undefined ? [] : [`${spec.id}:${platform}:${name}`];
      }),
    );
    expect(renamed.sort()).toEqual(["bat:linux:batcat", "fd:linux:fdfind"]);
  });

  test("brew renames nothing, so macOS carries no renamed binary at all", () => {
    for (const spec of all()) {
      expect(spec.platforms.darwin?.renamed).toBeUndefined();
    }
  });

  // A renamed tool's guidance is the install command for its package and
  // nothing else. What the package calls the executable is recorded beside it,
  // and one step of the bootstrap script turns that into a name that answers —
  // for every renamed tool at once, in the directory the script owns
  // (docs/adr/0025). A command carrying a link would also be a command a person
  // cannot paste without leaving a variable set in their shell.
  test("a renamed binary's guidance installs the package and says nothing about a link", () => {
    const renamed = all().flatMap((spec) => {
      const linux = spec.platforms.linux;
      return linux?.renamed === undefined ? [] : [{ id: spec.id, binary: spec.binary, linux }];
    });
    expect(renamed.map((entry) => entry.id)).toEqual(["fd", "bat"]);

    for (const { linux } of renamed) {
      const command = linux.guidance.kind === "command" ? linux.guidance.command : "";
      expect(command).toMatch(/^sudo apt install -y [a-z-]+$/);
      expect(command).not.toContain("ln -s");
      expect(command).not.toContain("~/.local/bin");
      expect(command).not.toContain("command -v");
    }
  });

  // The registry is static data, and where a name lands is the bootstrap
  // script's ground. A table naming ~/.local/bin would move whenever the script
  // moved its links (docs/adr/0002, docs/adr/0025).
  test("no install command names a directory the bootstrap script owns", () => {
    for (const spec of all()) {
      for (const platform of PLATFORMS) {
        const guidance = spec.platforms[platform]?.guidance;
        const command = guidance?.kind === "command" ? guidance.command : "";
        expect(command).not.toContain("~/.local/bin");
      }
    }
  });

  test("macOS install commands use brew — only make diverges to the Xcode command line tools", () => {
    for (const spec of all().filter((s) => s.tier === "standard")) {
      const guidance = spec.platforms.darwin?.guidance;
      expect(guidance?.kind).toBe("command");
      const command = guidance?.kind === "command" ? guidance.command : "";
      if (spec.id === "make") {
        expect(command).toBe("xcode-select --install");
      } else {
        expect(command).toMatch(/^brew install [a-z-]+$/);
      }
    }
  });

  // -y is part of the command, not a caller's decision. apt asks "Do you want to
  // continue?" whenever it pulls a dependency along, and the bootstrap script
  // runs these commands with no terminal to answer on, so a command that asks is
  // a command that installs nothing.
  test("every Linux install command uses apt, and answers apt's own question", () => {
    for (const spec of all().filter((s) => s.tier === "standard")) {
      const guidance = spec.platforms.linux?.guidance;
      expect(guidance?.kind).toBe("command");
      const command = guidance?.kind === "command" ? guidance.command : "";
      expect(command).toMatch(/^sudo apt install -y [a-z-]+$/);
    }
  });

  test("install commands name the verified package, differ from the tool name or not", () => {
    const byId = new Map(all().map((spec) => [spec.id, spec]));
    const command = (id: string, platform: Platform): string => {
      const guidance = byId.get(id)!.platforms[platform]!.guidance;
      return guidance.kind === "command" ? guidance.command : "";
    };
    expect(command("fd", "linux")).toBe("sudo apt install -y fd-find");
    expect(command("ripgrep", "darwin")).toBe("brew install ripgrep");
    expect(command("ripgrep", "linux")).toBe("sudo apt install -y ripgrep");
    expect(command("bat", "linux")).toBe("sudo apt install -y bat");
    expect(command("gh", "darwin")).toBe("brew install gh");
    expect(command("gh", "linux")).toBe("sudo apt install -y gh");
  });

  test("every standard tool has an install command on both platforms", () => {
    for (const spec of all().filter((s) => s.tier === "standard")) {
      for (const platform of PLATFORMS) {
        const platformSpec = spec.platforms[platform];
        expect(platformSpec).toBeDefined();
        expect(platformSpec!.guidance.kind).toBe("command");
      }
    }
  });

  test("prerequisites intervene with guidance only, never with a command", () => {
    for (const spec of all().filter((s) => s.tier === "prerequisite")) {
      for (const platform of PLATFORMS) {
        const platformSpec = spec.platforms[platform];
        if (!platformSpec) continue;
        expect(platformSpec.guidance.kind).toBe("manual");
      }
    }
  });

  test("all() returns a copy so callers cannot disturb the registry", () => {
    const first = all();
    first.pop();
    expect(all().length).toBe(first.length + 1);
  });
});
