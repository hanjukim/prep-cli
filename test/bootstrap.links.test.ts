import { describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { renamedLinks, renamesOn, renderLinks } from "../scripts/links.ts";
import { renderJson } from "../src/report/json.ts";
import { checkAll } from "../src/probe.ts";
import { all } from "../src/registry.ts";
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

const entry = (id: string, status: string, binary: string | null, path: string | null) => ({
  id,
  status,
  binary,
  path,
  guidance: null,
});

describe("renamedLinks", () => {
  test("names the link a renamed executable is missing", () => {
    const links = renamedLinks(
      doctor("linux", { fdfind: "/usr/bin/fdfind", batcat: "/usr/bin/batcat" }),
    );
    expect(links).toEqual([
      { name: "fd", target: "/usr/bin/fdfind" },
      { name: "bat", target: "/usr/bin/batcat" },
    ]);
  });

  test("says nothing about a tool that answers to its own name", () => {
    // ripgrep's executable is rg on every platform, so nothing was renamed and
    // the id being the odd one out is not the test.
    const links = renamedLinks(doctor("linux", { rg: "/usr/bin/rg" }));
    expect(links).toEqual([]);
  });

  test("says nothing on a platform that renames nothing", () => {
    expect(renamesOn("darwin")).toEqual([]);
    const found = { fd: "/opt/homebrew/bin/fd", bat: "/opt/homebrew/bin/bat" };
    expect(renamedLinks(doctor("darwin", found))).toEqual([]);
  });

  test("a renamed tool that is not installed gets no link", () => {
    // fd-find would not install. There is nothing on disk to point at.
    const links = renamedLinks(doctor("linux", { batcat: "/usr/bin/batcat" }));
    expect(links).toEqual([{ name: "bat", target: "/usr/bin/batcat" }]);
  });

  test("keeps the report order, so the script links in it", () => {
    expect(renamesOn("linux")).toEqual(["fd", "bat"]);
  });

  test("an id this prep does not hold is left alone", () => {
    const other = entry("something-else", "installed", "renamed", "/usr/bin/renamed");
    expect(renamedLinks({ results: [other] })).toEqual([]);
  });

  test("refuses a report that is not the contract", () => {
    expect(() => renamedLinks({})).toThrow(/results array/);
    expect(() => renamedLinks([])).toThrow(/results array/);
    expect(() => renamedLinks({ results: [{ id: 1 }] })).toThrow(/cannot read/);
    const wrongType = { id: "fd", status: "installed", binary: 2, path: null };
    expect(() => renamedLinks({ results: [wrongType] })).toThrow(/cannot read/);
  });
});

describe("renderLinks", () => {
  test("separates the name from the path with a tab, so a path with spaces survives", () => {
    const rendered = renderLinks([{ name: "fd", target: "/opt/my tools/fdfind" }]);
    expect(rendered).toBe("fd\t/opt/my tools/fdfind");
  });
});

/**
 * The linking half of the bootstrap script, run for real.
 *
 * Lifted out by name rather than the script being sourced, because the script
 * installs a machine the moment it is read — the same reason the PATH test
 * lifts its function out.
 */
const SCRIPT = readFileSync(new URL("../scripts/bootstrap.sh", import.meta.url), "utf8");

/** One shell function, from its header to the closing brace at column zero. */
function shellFunction(name: string): string {
  const match = SCRIPT.match(new RegExp(`^${name}\\(\\) \\{\\n[\\s\\S]*?\\n\\}$`, "m"));
  if (match === null) throw new Error(`${name} is not in scripts/bootstrap.sh`);
  return match[0];
}

/**
 * The name the shell half is exercised under.
 *
 * link_renamed reads whatever names it is handed, so the run below stays clear
 * of `fd` and `bat` on purpose: a machine that already holds one of those would
 * otherwise answer `have` and decide the test. Which names the pairs carry is
 * the reader's question, and it is asked above.
 */
const NAME = "prep-renamed-tool";

/**
 * Two executables that are really there.
 *
 * A link has to answer `have` on the next run, and a link onto a path that is
 * not on disk answers nothing — so a made-up target would have the second run
 * skipping for the wrong reason.
 */
const REAL = "/bin/ls";
const OTHER = "/bin/cat";

/**
 * Runs link_renamed over the given lines, under a HOME of its own, and hands
 * back that HOME.
 *
 * PATH carries the fresh ~/.local/bin and the directories ln and mkdir live in,
 * and nothing else, so the only name that can answer `have` is one this test
 * put there.
 */
function linkInFreshHome(lines: string, alreadyOnPath: string[] = []): string {
  const home = mkdtempSync(join(tmpdir(), "prep-links-"));
  const bin = join(home, "answers");
  mkdirSync(bin);
  for (const name of alreadyOnPath) {
    writeFileSync(join(bin, name), "#!/bin/sh\n", { mode: 0o755 });
  }

  const result = runLinkRenamed(home, bin, lines);
  if (result.exitCode !== 0) {
    throw new Error(`link_renamed failed: ${result.stderr.toString()}`);
  }
  return home;
}

function runLinkRenamed(home: string, bin: string, lines: string) {
  return Bun.spawnSync({
    cmd: [
      "/bin/bash",
      "-c",
      `set -Eeuo pipefail\n${shellFunction("have")}\n${shellFunction("link_renamed")}\nlink_renamed`,
    ],
    env: { HOME: home, PATH: `${bin}:${home}/.local/bin:/usr/bin:/bin` },
    stdin: Buffer.from(lines),
  });
}

describe("link_renamed", () => {
  test("makes the link, pointing at the executable the report named", () => {
    const home = linkInFreshHome(`${NAME}\t${REAL}\n${NAME}-two\t${OTHER}\n`);
    expect(readlinkSync(join(home, ".local/bin", NAME))).toBe(REAL);
    expect(readlinkSync(join(home, ".local/bin", `${NAME}-two`))).toBe(OTHER);
  });

  test("leaves a name that already answers alone", () => {
    // This machine holds the real tool under that name. Ours would take its
    // place on PATH.
    const home = linkInFreshHome(`${NAME}\t${REAL}\n`, [NAME]);
    expect(existsSync(join(home, ".local/bin", NAME))).toBe(false);
  });

  test("running again over its own link writes nothing new", () => {
    const home = linkInFreshHome(`${NAME}\t${REAL}\n`);
    // The second run finds the link on PATH through ~/.local/bin and skips it.
    // Pointing the line somewhere else is what proves it was not rewritten.
    const result = runLinkRenamed(home, join(home, "answers"), `${NAME}\t${OTHER}\n`);
    expect(result.exitCode).toBe(0);
    expect(readlinkSync(join(home, ".local/bin", NAME))).toBe(REAL);
  });

  test("nothing to link is not a failure", () => {
    const home = linkInFreshHome("");
    expect(existsSync(join(home, ".local/bin"))).toBe(true);
  });

  test("a path with spaces in it survives the read", () => {
    const spaced = join(mkdtempSync(join(tmpdir(), "prep links ")), "renamed tool");
    writeFileSync(spaced, "#!/bin/sh\n", { mode: 0o755 });

    const home = linkInFreshHome(`${NAME}\t${spaced}\n`);
    expect(readlinkSync(join(home, ".local/bin", NAME))).toBe(spaced);
  });
});
