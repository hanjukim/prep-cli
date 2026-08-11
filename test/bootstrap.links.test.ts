import { describe, expect, test } from "bun:test";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { renamedLinks, renderLinks } from "../scripts/links.ts";
import { renderJson } from "../src/report/json.ts";
import { checkAll } from "../src/probe.ts";
import { all } from "../src/registry.ts";
import type { Platform, WhichFn } from "../src/types.ts";

/**
 * The name a package shipped, given back as the name everything calls.
 *
 * Two halves, tested where each of them lives. `scripts/links.ts` reads the
 * report and pairs the two names off the registry; `link_renamed` in the script
 * decides whether the machine wants a link and writes it. Neither half knows a
 * tool name of its own (docs/adr/0025).
 *
 * The shell function is lifted out of the script by name rather than the script
 * being sourced, because the script installs a machine the moment it is read.
 */
const SCRIPT = readFileSync(new URL("../scripts/bootstrap.sh", import.meta.url), "utf8");

/** One shell function, from its header to the closing brace at column zero. */
function shellFunction(name: string): string {
  const match = SCRIPT.match(new RegExp(`^${name}\\(\\) \\{\\n[\\s\\S]*?\\n\\}$`, "m"));
  if (match === null) throw new Error(`${name} is not in scripts/bootstrap.sh`);
  return match[0];
}

/** `have` and the function under test, which is everything link_renamed stands on. */
const LINK_FUNCTIONS = ["have", "link_renamed"].map(shellFunction).join("\n");

function fakeWhich(found: Record<string, string>): WhichFn {
  return (binary) => found[binary] ?? null;
}

/** The report exactly as the script reads it: rendered by prep, parsed back from text. */
function chef(platform: Platform, found: Record<string, string>): unknown {
  const results = checkAll(all(), platform, fakeWhich(found));
  return JSON.parse(renderJson({ platform, results }));
}

const entry = (id: string, binary: string | null, renamed: string | null) => ({
  id,
  status: "missing",
  binary,
  path: null,
  renamed,
  guidance: null,
});

describe("renamedLinks", () => {
  test("pairs the canonical name with the name Debian shipped, off the real registry", () => {
    expect(renamedLinks(chef("linux", { apt: "/usr/bin/apt" }))).toEqual([
      { name: "fd", shipped: "fdfind" },
      { name: "bat", shipped: "batcat" },
    ]);
  });

  // brew renames neither, so a macOS run reads a report that asks for nothing
  // and the link step does not run at all.
  test("says nothing at all about macOS", () => {
    expect(renamedLinks(chef("darwin", { brew: "/opt/homebrew/bin/brew" }))).toEqual([]);
  });

  // The report says a name was found, not which file answered it. A machine
  // holding bat from source and one holding a link an earlier run made read the
  // same here, so the question is left to the shell, right before it would write.
  test("asks for the pair whether the canonical name answers or not", () => {
    const installed = chef("linux", {
      apt: "/usr/bin/apt",
      bat: "/home/me/.local/bin/bat",
      fd: "/home/me/.local/bin/fd",
    });
    expect(renamedLinks(installed)).toEqual([
      { name: "fd", shipped: "fdfind" },
      { name: "bat", shipped: "batcat" },
    ]);
  });

  test("keeps the report order, so the links are made in it", () => {
    const report = { results: [entry("a", "one", "one-shipped"), entry("b", "two", "two-shipped")] };
    expect(renamedLinks(report)).toEqual([
      { name: "one", shipped: "one-shipped" },
      { name: "two", shipped: "two-shipped" },
    ]);
  });

  test("passes over an entry the platform ships under its own name", () => {
    const report = { results: [entry("a", "one", null), entry("b", "two", "two-shipped")] };
    expect(renamedLinks(report)).toEqual([{ name: "two", shipped: "two-shipped" }]);
  });

  // A contract that moved would otherwise leave a machine without its names in
  // silence, which is the failure this whole step exists to close.
  test("refuses a report that is not the contract", () => {
    expect(() => renamedLinks({})).toThrow("no results array");
    expect(() => renamedLinks({ results: [{ id: "a" }] })).toThrow("cannot read");
    expect(() => renamedLinks({ results: [{ ...entry("a", "one", null), renamed: 7 }] })).toThrow(
      "cannot read",
    );
  });
});

describe("renderLinks", () => {
  test("one pair per line, the two names split by a tab", () => {
    expect(renderLinks([{ name: "fd", shipped: "fdfind" }])).toBe("fd\tfdfind");
  });

  test("nothing to link renders nothing, so the shell reads no blank line", () => {
    expect(renderLinks([])).toBe("");
  });
});

/**
 * Runs `link_renamed` over one HOME of its own, and hands back that HOME.
 *
 * The fake executables live in a directory of their own on PATH, so `have`
 * answers about them the way it would on a real machine — and ~/.local/bin goes
 * on PATH too, because a link this function wrote is what the next run has to
 * find.
 */
function linkInFreshHome(
  pairs: string,
  shipped: string[] = [],
  existing: string[] = [],
): { home: string; failed: string } {
  const home = mkdtempSync(join(tmpdir(), "prep-links-"));
  const packages = join(home, "usr-bin");
  mkdirSync(packages, { recursive: true });
  mkdirSync(join(home, ".local/bin"), { recursive: true });

  for (const name of [...shipped, ...existing]) {
    const where = existing.includes(name) ? join(home, ".local/bin") : packages;
    const path = join(where, name);
    writeFileSync(path, "#!/bin/sh\n");
    chmodSync(path, 0o755);
  }

  const result = Bun.spawnSync({
    cmd: [
      "bash",
      "-c",
      // What it linked goes to its own stdout and is read off the file system
      // below; what stdout carries here is the list of names it could not give,
      // which is what the script prints at the end of a run.
      `set -Eeuo pipefail\nFAILED_LINKS=""\n${LINK_FUNCTIONS}\nlink_renamed <<<"$1" >/dev/null\nprintf '%s' "$FAILED_LINKS"`,
      "bash",
      pairs,
    ],
    env: { HOME: home, PATH: `${home}/.local/bin:${packages}:/usr/bin:/bin` },
  });

  if (result.exitCode !== 0) {
    throw new Error(`link_renamed failed: ${result.stderr.toString()}`);
  }
  return { home, failed: result.stdout.toString() };
}

const linkTarget = (home: string, name: string): string | null => {
  const path = join(home, ".local/bin", name);
  if (!lstatSafe(path)) return null;
  return lstatSync(path).isSymbolicLink() ? readlinkSync(path) : path;
};

/** Whether a path is there at all, symlink pointing at nothing included. */
function lstatSafe(path: string): boolean {
  try {
    lstatSync(path);
    return true;
  } catch {
    return false;
  }
}

describe("link_renamed", () => {
  test("gives the canonical name to what the package installed", () => {
    const { home, failed } = linkInFreshHome("bat\tbatcat", ["batcat"]);
    expect(linkTarget(home, "bat")).toBe(join(home, "usr-bin", "batcat"));
    expect(failed).toBe("");
  });

  // Somebody who built fd from source, or took it from a backport, keeps what
  // they chose. A link an earlier run made answers here too, which is what makes
  // a second run of the whole script write nothing.
  test("leaves a name that already answers exactly as it is", () => {
    const { home } = linkInFreshHome("fd\tfdfind", ["fdfind"], ["fd"]);
    expect(lstatSync(join(home, ".local/bin/fd")).isSymbolicLink()).toBe(false);
  });

  test("running it twice changes nothing the second time", () => {
    const { home } = linkInFreshHome("bat\tbatcat", ["batcat"]);
    const first = linkTarget(home, "bat");

    // The same pair again, over the HOME the first run left behind.
    const again = Bun.spawnSync({
      cmd: [
        "bash",
        "-c",
        `set -Eeuo pipefail\nFAILED_LINKS=""\n${LINK_FUNCTIONS}\nlink_renamed <<<"$1"`,
        "bash",
        "bat\tbatcat",
      ],
      env: { HOME: home, PATH: `${home}/.local/bin:${home}/usr-bin:/usr/bin:/bin` },
    });

    expect(again.exitCode).toBe(0);
    expect(again.stdout.toString()).toBe("");
    expect(linkTarget(home, "bat")).toBe(first);
  });

  // `ln -sf ""` exits 0 and leaves a symlink pointing at nothing, which is the
  // machine that reports itself finished and runs neither name. Nothing is
  // written, and the name is reported like any other gap that would not close.
  test("writes no link at all when the shipped name answers nothing", () => {
    const { home, failed } = linkInFreshHome("fd\tfdfind");
    expect(lstatSafe(join(home, ".local/bin/fd"))).toBe(false);
    expect(failed).toContain("fd");
    expect(failed).toContain("fdfind");
  });

  test("takes the tools one by one, so one missing package costs only its own name", () => {
    const { home, failed } = linkInFreshHome("fd\tfdfind\nbat\tbatcat", ["batcat"]);
    expect(lstatSafe(join(home, ".local/bin/fd"))).toBe(false);
    expect(linkTarget(home, "bat")).toBe(join(home, "usr-bin", "batcat"));
    expect(failed).toContain("fd");
    expect(failed).not.toContain("bat (");
  });

  test("nothing to link is a run that writes nothing and says nothing", () => {
    const { home, failed } = linkInFreshHome("");
    expect(failed).toBe("");
    expect(existsSync(join(home, ".local/bin"))).toBe(true);
  });
});
