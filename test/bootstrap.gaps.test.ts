import { describe, expect, test } from "bun:test";

import { installCommands } from "../scripts/gaps.ts";
import { renderJson } from "../src/report/json.ts";
import { checkAll } from "../src/probe.ts";
import { harnesses, all } from "../src/registry.ts";
import type { Platform, WhichFn } from "../src/types.ts";

function fakeWhich(found: Record<string, string>): WhichFn {
  return (binary) => found[binary] ?? null;
}

/** The report exactly as the script reads it: rendered by prep, parsed back from text. */
function doctor(platform: Platform, found: Record<string, string>): unknown {
  const specs = all();
  const results = checkAll(specs, platform, fakeWhich(found));
  return JSON.parse(renderJson({ platform, results }));
}

const entry = (id: string, status: string, command?: string) => ({
  id,
  status,
  binary: null,
  path: null,
  guidance: command === undefined ? null : { kind: "command", command },
});

describe("installCommands", () => {
  test("names a command for every gap the report carries", () => {
    // Nothing but brew is here, so every standard tool is a gap with a command.
    const commands = installCommands(doctor("darwin", { brew: "/opt/homebrew/bin/brew" }));
    expect(commands).toContain("brew install ripgrep");
    expect(commands).toContain("xcode-select --install");
  });

  test("keeps the report order, so the script installs in it", () => {
    const report = { results: [entry("a", "missing", "one"), entry("b", "missing", "two")] };
    expect(installCommands(report)).toEqual(["one", "two"]);
  });

  // A machine holding batcat alone still has the gap, and what closes it here is
  // the package. The name it is called by is the link step's, after these
  // commands have run (docs/adr/0025).
  test("carries the package command for a binary the distribution renamed", () => {
    const commands = installCommands(
      doctor("linux", { apt: "/usr/bin/apt", batcat: "/usr/bin/batcat", fdfind: "/usr/bin/fdfind" }),
    );
    expect(commands).toContain("sudo apt install -y bat");
    expect(commands).toContain("sudo apt install -y fd-find");
    expect(commands.some((command) => command.includes("ln -sf"))).toBe(false);
  });

  test("says nothing about a machine that already answers to bat and fd", () => {
    const commands = installCommands(
      doctor("linux", { apt: "/usr/bin/apt", bat: "/home/me/.local/bin/bat", fd: "/home/me/.local/bin/fd" }),
    );
    expect(commands).not.toContain("sudo apt install -y bat");
    expect(commands).not.toContain("sudo apt install -y fd-find");
  });

  test("says nothing about a tool that is already here", () => {
    const commands = installCommands(doctor("darwin", { brew: "b", rg: "/usr/bin/rg" }));
    expect(commands).not.toContain("brew install ripgrep");
  });

  test("leaves the harnesses out — one is a link in the chain, the other is a person's job", () => {
    // Nothing at all is installed, so both harnesses are missing, and on macOS
    // both carry a command the script would otherwise run.
    const commands = installCommands(doctor("darwin", {}));
    for (const harness of harnesses()) {
      const guidance = harness.platforms.darwin?.guidance;
      if (guidance?.kind === "command") expect(commands).not.toContain(guidance.command);
    }
  });

  test("skips guidance with nothing to run", () => {
    // A prerequisite carries a note and a URL, never a command.
    const commands = installCommands(doctor("darwin", {}));
    expect(commands.some((command) => command.includes("brew.sh"))).toBe(false);
  });

  test("an unsupported entry is not a gap", () => {
    // apt has no darwin entry, so it reports unsupported with no guidance.
    const report = { results: [entry("apt", "unsupported")] };
    expect(installCommands(report)).toEqual([]);
  });

  test("refuses a report that is not the contract", () => {
    expect(() => installCommands({})).toThrow(/results array/);
    expect(() => installCommands([])).toThrow(/results array/);
    expect(() => installCommands({ results: [{ id: 1 }] })).toThrow(/cannot read/);
  });

  // The pass key divides on who closes a thing: the script closes gaps, a
  // person closes pass items (docs/adr/0026). The reader never opens the key,
  // so `gh auth login` cannot leak into the commands the script runs.
  test("reads a report carrying the pass key exactly as one without it", () => {
    const specs = all();
    const results = checkAll(specs, "darwin", fakeWhich({ brew: "/opt/homebrew/bin/brew" }));
    const bare = installCommands(JSON.parse(renderJson({ platform: "darwin", results })));
    const withPass = installCommands(
      JSON.parse(
        renderJson({
          platform: "darwin",
          results,
          pass: [
            {
              id: "github-login",
              status: "missing",
              checks: ["gh auth status"],
              guidance: { kind: "command", command: "gh auth login" },
            },
          ],
        }),
      ),
    );
    expect(withPass).toEqual(bare);
    expect(withPass).not.toContain("gh auth login");
  });
});
