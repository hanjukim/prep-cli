import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import { type RunDeps, type RunResult, run as runCli } from "../src/cli.ts";
import type { SetupFs, SetupPrompt, WhichFn } from "../src/types.ts";

/**
 * The reading subcommand is `chef`, and `doctor` is not a spelling of it.
 *
 * The name was renamed outright rather than aliased (docs/adr/0029), so this
 * holds both halves: the new name works everywhere the old one did, and the old
 * one is refused like any other word. An alias would have made these two tests
 * contradict each other, which is the point of writing them together.
 *
 * The glossary's `_Avoid_` line is what an alias would have broken, and it can
 * only be kept by the old name failing. So `prep doctor` exiting 2 is a decision
 * under test, not an accident of the sweep that renamed everything else.
 */
const HOME = "/home";

const FOUND: WhichFn = (binary) => `/usr/bin/${binary}`;

function run(argv: readonly string[], deps: RunDeps = {}): Promise<RunResult> {
  return runCli(argv, { home: HOME, which: FOUND, check: () => true, ...deps });
}

/** A machine with nothing on it, so a run is decided by its arguments rather than its tools. */
const BARE: RunDeps = { platformName: "darwin", which: () => null };

const PROJECT = "/project";

/**
 * A project directory holding nothing, which never touches a real disk.
 *
 * Enough for the questions here: both subcommands are asked which project they
 * were given, and neither answer depends on a file being there.
 */
function emptyProject(): SetupFs {
  const written = new Map<string, string>([[PROJECT, ""]]);
  return {
    exists: (path) => written.has(path),
    isDirectory: (path) => path === PROJECT,
    read: (path) => {
      const text = written.get(path);
      if (text === undefined) throw new Error(`ENOENT: no such file, open '${path}'`);
      return text;
    },
    write: (path, contents) => {
      written.set(path, contents);
    },
  };
}

/** Somebody who approves whatever is put in front of them, so setup reaches its report. */
function approvingPrompt(): SetupPrompt {
  return { show: () => {}, confirm: () => true, choose: () => "existing" };
}

describe("the subcommand that reads is chef", () => {
  test("chef runs, and reports the machine", async () => {
    const result = await run(["chef"], BARE);
    expect(result.stdout).toContain("prep chef");
    expect(result.exitCode).not.toBe(2);
  });

  test("chef takes a path, the way doctor did", async () => {
    const result = await run(["chef", PROJECT], { ...BARE, fs: emptyProject() });
    expect(result.stdout).toContain(PROJECT);
    expect(result.exitCode).not.toBe(2);
  });

  test("chef --json prints the report", async () => {
    const result = await run(["chef", "--json"], BARE);
    expect(() => JSON.parse(result.stdout)).not.toThrow();
  });
});

describe("doctor is a word this CLI does not know", () => {
  test("it is refused, and named in the refusal", async () => {
    const result = await run(["doctor"], BARE);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("doctor");
  });

  test("it is refused the same way any other unknown subcommand is", async () => {
    const refused = await run(["doctor"], BARE);
    const other = await run(["install"], BARE);
    expect(refused.stderr.replace("doctor", "install")).toBe(other.stderr);
  });

  test("the usage text offers no such subcommand", async () => {
    const result = await run(["--help"], BARE);
    expect(result.stdout).toContain("prep chef");
    expect(result.stdout).not.toContain("doctor");
  });
});

describe("the name a machine reads", () => {
  test("the next step that sends somebody to the machine is the chef step", async () => {
    const result = await run(["setup", "--json", PROJECT], {
      ...BARE,
      which: FOUND,
      fs: emptyProject(),
      prompt: approvingPrompt(),
    });
    expect(result.stderr).toBe("");
    const report = JSON.parse(result.stdout) as { next: { id: string; command: string }[] };
    const ids = report.next.map((step) => step.id);
    expect(ids).toContain("chef");
    expect(ids).not.toContain("doctor");
    expect(report.next.map((step) => step.command)).toContain("prep chef");
  });
});

/**
 * The rename is only finished if the old word is gone from what runs.
 *
 * `docs/adr/` is deliberately excluded: a record is not edited into agreement
 * with a later one (`CONTRIBUTING.md`), so every record that argued about doctor
 * keeps saying doctor, and three of them carry it in their file name. The
 * glossary is what tells a reader the two words are one thing.
 */
describe("nothing that runs still says doctor", () => {
  const sources = ["src", "scripts"].flatMap((directory) =>
    [...new Bun.Glob("**/*.{ts,sh}").scanSync(directory)].map((entry) => `${directory}/${entry}`),
  );

  test("there is something to sweep, so an empty list cannot pass this", () => {
    expect(sources.length).toBeGreaterThan(15);
  });

  // Case-insensitive, because the identifiers are the half most easily missed:
  // a surviving `ChefProject` reads as renamed and a surviving `DoctorProject`
  // does not, and a case-sensitive sweep would pass on the second.
  test.each(sources)("%s", (path) => {
    expect(readFileSync(path, "utf8")).not.toMatch(/doctor/i);
  });
});

/**
 * The prose the old word is still allowed in, and nowhere else.
 *
 * Two documents name `doctor` on purpose: the glossary entry that says the two
 * words are one thing, and the line in `README.md` that tells somebody whose
 * notes hold the old command why it stopped working. Every other published
 * document either never had the word or has finished with it — the script's own
 * glossary included, which is the one most likely to drift, since it borrows
 * prep's vocabulary rather than defining it (`CONTEXT-MAP.md`).
 *
 * `docs/adr/` is excluded, as above.
 */
describe("the old word survives in prose only where it is explained", () => {
  const prose = [...new Bun.Glob("*.md").scanSync(".")].concat("scripts/CONTEXT.md");

  const holding = prose.filter((path) => /doctor/i.test(readFileSync(path, "utf8")));

  test("only the glossary entry and the README line keep it", () => {
    expect(holding.toSorted()).toEqual(["CONTEXT.md", "README.md"]);
  });

  test("and each keeps it while naming the word that replaced it", () => {
    for (const path of holding) {
      expect(readFileSync(path, "utf8")).toInclude("chef");
    }
  });
});
