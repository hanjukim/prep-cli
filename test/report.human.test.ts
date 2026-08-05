import { describe, expect, test } from "bun:test";

import { checkAll } from "../src/probe.ts";
import { all } from "../src/registry.ts";
import { renderHuman } from "../src/report/human.ts";
import { displayWidth } from "../src/report/layout.ts";
import type { ToolSpec, WhichFn } from "../src/types.ts";

function fakeWhich(found: Record<string, string>): WhichFn {
  return (binary) => found[binary] ?? null;
}

function render(platform: "darwin" | "linux", found: Record<string, string>): string {
  const specs = all();
  return renderHuman({
    platform,
    specs,
    results: checkAll(specs, platform, fakeWhich(found)),
  });
}

const BREW = { brew: "/opt/homebrew/bin/brew" };
const APT = { apt: "/usr/bin/apt" };

/**
 * A half-equipped Mac. The design document's output example minus lazygit, which
 * the registry no longer carries, plus one harness of the two — the ordinary
 * state of a machine that has been used with one agent CLI and not the other.
 */
const HALF_DARWIN = {
  claude: "/opt/homebrew/bin/claude",
  git: "/usr/bin/git",
  rg: "/opt/homebrew/bin/rg",
  bat: "/opt/homebrew/bin/bat",
  fzf: "/opt/homebrew/bin/fzf",
  jq: "/opt/homebrew/bin/jq",
  make: "/usr/bin/make",
};

/**
 * The same mix on Linux. bat and fd are looked up under their own names here as
 * well: Debian ships them as batcat and fdfind, and the name is half of what a
 * finished machine holds, so this one carries the link a closed gap left behind.
 */
const HALF_LINUX = {
  claude: "/usr/local/bin/claude",
  git: "/usr/bin/git",
  rg: "/usr/bin/rg",
  bat: "/home/me/.local/bin/bat",
  batcat: "/usr/bin/batcat",
  fzf: "/usr/bin/fzf",
  jq: "/usr/bin/jq",
  make: "/usr/bin/make",
};

const FULL_DARWIN = {
  ...HALF_DARWIN,
  codex: "/opt/homebrew/bin/codex",
  fd: "/opt/homebrew/bin/fd",
  zoxide: "/opt/homebrew/bin/zoxide",
  gh: "/opt/homebrew/bin/gh",
  eza: "/opt/homebrew/bin/eza",
};

const FULL_LINUX = {
  ...HALF_LINUX,
  codex: "/usr/local/bin/codex",
  fd: "/home/me/.local/bin/fd",
  fdfind: "/usr/bin/fdfind",
  zoxide: "/usr/bin/zoxide",
  gh: "/usr/bin/gh",
  eza: "/usr/bin/eza",
};

describe("human report snapshots", () => {
  test("macOS · with gaps", () => {
    expect(render("darwin", { ...BREW, ...HALF_DARWIN })).toMatchSnapshot();
  });

  test("macOS · no gaps", () => {
    expect(render("darwin", { ...BREW, ...FULL_DARWIN })).toMatchSnapshot();
  });

  test("macOS · prerequisite missing", () => {
    expect(render("darwin", HALF_DARWIN)).toMatchSnapshot();
  });

  test("Linux · with gaps", () => {
    expect(render("linux", { ...APT, ...HALF_LINUX })).toMatchSnapshot();
  });

  test("Linux · no gaps", () => {
    expect(render("linux", { ...APT, ...FULL_LINUX })).toMatchSnapshot();
  });

  test("Linux · prerequisite missing", () => {
    expect(render("linux", HALF_LINUX)).toMatchSnapshot();
  });

  test("with a not-applicable entry present", () => {
    const specs: ToolSpec[] = [
      {
        id: "homebrew",
        binary: "brew",
        summary: "macOS package manager",
        tier: "prerequisite",
        platforms: { darwin: { guidance: { kind: "manual", note: "Follow the install script" } } },
      },
      {
        id: "apt-only",
        binary: "apt-only",
        summary: "Linux-only entry",
        tier: "standard",
        platforms: {
          linux: { guidance: { kind: "command", command: "sudo apt install apt-only" } },
        },
      },
    ];
    const results = checkAll(specs, "darwin", fakeWhich({ brew: "/opt/homebrew/bin/brew" }));
    expect(renderHuman({ platform: "darwin", specs, results })).toMatchSnapshot();
  });
});

describe("entries with only one platform", () => {
  /** A fake entry that exists on Linux only. Not in the current list, but rendering must support it. */
  const linuxOnly: ToolSpec = {
    id: "linux-only",
    binary: "linux-only",
    summary: "Linux-only entry",
    tier: "standard",
    platforms: {
      linux: { guidance: { kind: "command", command: "sudo apt install linux-only" } },
    },
  };

  /** A fake entry that exists on macOS only. */
  const darwinOnly: ToolSpec = {
    id: "darwin-only",
    binary: "darwin-only",
    summary: "macOS-only entry",
    tier: "standard",
    platforms: {
      darwin: { guidance: { kind: "command", command: "brew install darwin-only" } },
    },
  };

  function renderOne(spec: ToolSpec, platform: "darwin" | "linux"): string {
    const specs = [spec];
    return renderHuman({ platform, specs, results: checkAll(specs, platform, fakeWhich({})) });
  }

  test("a Linux-only entry shows as not applicable on macOS", () => {
    const output = renderOne(linuxOnly, "darwin");
    expect(output).toContain("Not applicable (1)");
    expect(output).toContain("linux-only");
    expect(output).toContain("not checked on darwin");
  });

  test("a macOS-only entry shows as not applicable on Linux", () => {
    const output = renderOne(darwinOnly, "linux");
    expect(output).toContain("Not applicable (1)");
    expect(output).toContain("not checked on linux");
  });

  test("a not-applicable entry never invents the other platform's command", () => {
    expect(renderOne(linuxOnly, "darwin")).not.toContain("apt install");
    expect(renderOne(darwinOnly, "linux")).not.toContain("brew install");
  });

  test("not applicable is not a gap — it stays out of the gap count", () => {
    const output = renderOne(linuxOnly, "darwin");
    expect(output).not.toContain("Gaps (");
    expect(output).toContain("No gaps");
  });
});

describe("human report content", () => {
  test("a gap shows that OS's install command", () => {
    expect(render("darwin", { brew: "/x", git: "/x" })).toContain("brew install ripgrep");
    expect(render("linux", { apt: "/x", git: "/x" })).toContain("sudo apt install -y ripgrep");
  });

  test("a missing prerequisite suppresses the other install commands but keeps the gap list", () => {
    const output = render("darwin", { git: "/usr/bin/git" });
    expect(output).not.toContain("brew install ripgrep");
    expect(output).toContain("ripgrep");
    expect(output).toContain("Gaps (11)");
  });

  test("the missing prerequisite is stated at the very top", () => {
    const output = render("darwin", { git: "/usr/bin/git" });
    const lines = output.split("\n");
    const noticeIndex = lines.findIndex((line) => line.includes("homebrew is missing"));
    const gapIndex = lines.findIndex((line) => line.startsWith("Gaps ("));
    expect(noticeIndex).toBeGreaterThan(-1);
    expect(noticeIndex).toBeLessThan(gapIndex);
  });

  test("installed entries are folded into names only", () => {
    const output = render("darwin", { brew: "/x", git: "/x", rg: "/x" });
    expect(output).toContain("Installed (2)");
    expect(output).toContain("✓ git  ripgrep");
    // The folded line carries no purpose text.
    expect(output).not.toContain("fast text search");
  });

  test("the last line always hands the remaining work back", () => {
    for (const output of [
      render("darwin", { brew: "/x", git: "/x" }),
      render("darwin", { brew: "/x", git: "/x", rg: "/x" }),
      render("darwin", {}),
      render("linux", { apt: "/x", git: "/x" }),
    ]) {
      const lines = output.trimEnd().split("\n");
      expect(lines.at(-1)).toMatch(/yourself\.$|first\.$/);
    }
  });

  test("the report never claims prep closed anything", () => {
    for (const output of [
      render("darwin", { ...BREW, ...FULL_DARWIN }),
      render("darwin", { ...BREW, ...HALF_DARWIN }),
      render("linux", { ...APT, ...HALF_LINUX }),
    ]) {
      expect(output).not.toContain("Installed claude-code");
      expect(output).not.toContain("(declined)");
      expect(output).not.toContain("(install failed)");
    }
  });

  test("a harness gap reads like any other gap line", () => {
    const output = render("darwin", { ...BREW, ...HALF_DARWIN });
    expect(output).toMatch(/✗ codex .*brew install --cask codex/);
    expect(output).toMatch(/✗ fd .*brew install fd/);
  });

  test("every entry below the prerequisites appears in the report on both platforms", () => {
    const reported = all().filter((spec) => spec.tier !== "prerequisite");
    expect(reported.filter((spec) => spec.tier === "standard").length).toBe(10);
    expect(reported.filter((spec) => spec.tier === "harness").length).toBe(2);

    for (const platform of ["darwin", "linux"] as const) {
      const output = render(platform, {});
      for (const spec of reported) {
        expect(output).toContain(spec.id);
      }
      expect(output).toContain(`Gaps (${reported.length})`);
    }
  });

  test("a gap list holding no command does not send anybody to one", () => {
    // Everything installed but codex. On Linux its line carries a link, not a
    // command — macOS has a cask for it, so only this platform makes the point.
    const { codex, ...withoutCodex } = FULL_LINUX;
    const output = render("linux", { ...APT, ...withoutCodex });
    expect(output).toContain("Gaps (1)");
    expect(output).toContain("Follow each line above yourself");
    expect(output).not.toContain("Run the commands above yourself");
  });

  test("a gap list that does hold a command still points at it", () => {
    expect(render("darwin", { ...BREW, ...HALF_DARWIN })).toContain("Run the commands above yourself");
  });

  test("the fd gap on Linux points at the fd-find package", () => {
    const output = render("linux", { apt: "/usr/bin/apt" });
    expect(output).toContain("sudo apt install -y fd-find");
  });

  // The package is here and the name is not. Debian's own install of bat and
  // fd-find leaves exactly this machine behind, and it is a gap: batcat and
  // fdfind answer to nothing anybody types.
  test("a machine holding only the Debian names reports both entries as gaps", () => {
    const { bat, fd, ...debianNamesOnly } = FULL_LINUX;
    const output = render("linux", { ...APT, ...debianNamesOnly });
    expect(output).toContain("Gaps (2)");
    expect(output).toMatch(/✗ bat\s/);
    expect(output).toMatch(/✗ fd\s/);
  });

  test("the command for a renamed binary puts the canonical name on PATH", () => {
    const output = render("linux", { ...APT, batcat: "/usr/bin/batcat" });
    expect(output).toContain(
      'sudo apt install -y bat && batcat="$(command -v batcat)" && ' +
        'mkdir -p ~/.local/bin && ln -sf "$batcat" ~/.local/bin/bat',
    );
  });

  test("a machine that answers to bat and fd is given no command for either", () => {
    const output = render("linux", { ...APT, ...FULL_LINUX });
    expect(output).toContain("No gaps.");
    expect(output).not.toContain("ln -sf");
  });

  test("macOS is untouched by any of this — brew installs both under their own names", () => {
    const output = render("darwin", { ...BREW, ...FULL_DARWIN });
    expect(output).not.toContain("batcat");
    expect(output).not.toContain("fdfind");
    expect(output).not.toContain("ln -sf");
  });

  test("the header carries the detected platform", () => {
    expect(render("darwin", {}).split("\n")[0]).toBe("prep doctor · darwin");
    expect(render("linux", {}).split("\n")[0]).toBe("prep doctor · linux");
  });
});

describe("displayWidth", () => {
  test("counts wide characters as two cells", () => {
    expect(displayWidth("git")).toBe(3);
    expect(displayWidth("ＡＢ")).toBe(4);
    expect(displayWidth("ＡＢ ＣＤ")).toBe(9);
  });
});
