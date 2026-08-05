import { describe, expect, test } from "bun:test";

import { runPass, spawnChecker, withProgress } from "../src/pass.ts";
import { passItems } from "../src/registry.ts";
import type { CheckFn, PassSpec } from "../src/types.ts";

/** Answers by the first word of the command, so a fixture reads like the machine it fakes. */
function answering(byBinary: Record<string, boolean | null>): CheckFn {
  return (argv) => byBinary[argv[0]!] ?? null;
}

const BOTH_HARNESSES = new Set(["claude-code", "codex"]);
const NO_HARNESS = new Set<string>();

describe("runPass", () => {
  test("a machine with every answer yes reads ready on all four items", async () => {
    const results = await runPass(
      passItems(),
      BOTH_HARNESSES,
      answering({ gh: true, git: true, claude: true, codex: true }),
    );
    expect(results.map((result) => result.id)).toEqual([
      "github-login",
      "git-identity",
      "claude-login",
      "codex-login",
    ]);
    expect(results.every((result) => result.status === "ready")).toBe(true);
  });

  test("a no reads missing, and the item keeps its guidance", async () => {
    const results = await runPass(
      passItems(),
      BOTH_HARNESSES,
      answering({ gh: false, git: true, claude: true, codex: true }),
    );
    const github = results.find((result) => result.id === "github-login")!;
    expect(github.status).toBe("missing");
    expect(github.guidance).toEqual({ kind: "command", command: "gh auth login" });
  });

  test("no answer at all reads unknown, and the item names its own check", async () => {
    const results = await runPass(
      passItems(),
      BOTH_HARNESSES,
      answering({ gh: null, git: true, claude: true, codex: true }),
    );
    const github = results.find((result) => result.id === "github-login")!;
    expect(github.status).toBe("unknown");
    expect(github.checks).toEqual(["gh auth status"]);
  });

  test("a harness that is not installed is not asked about", async () => {
    const asked: string[] = [];
    const check: CheckFn = (argv) => {
      asked.push(argv.join(" "));
      return true;
    };

    const results = await runPass(passItems(), new Set(["claude-code"]), check);
    expect(results.map((result) => result.id)).toEqual([
      "github-login",
      "git-identity",
      "claude-login",
    ]);
    expect(asked.some((command) => command.startsWith("codex"))).toBe(false);
  });

  test("with no harness at all, only the two machine rows are asked", async () => {
    const results = await runPass(passItems(), NO_HARNESS, () => true);
    expect(results.map((result) => result.id)).toEqual(["github-login", "git-identity"]);
  });

  test("the git identity needs both halves — one unset half is missing", async () => {
    const check: CheckFn = (argv) => (argv.includes("user.email") ? false : true);
    const results = await runPass(passItems(), NO_HARNESS, check);
    expect(results.find((result) => result.id === "git-identity")?.status).toBe("missing");
  });

  test("a no outweighs an unanswered check — half an identity is still missing", async () => {
    // user.name times out, user.email answers no. One unset half already
    // refuses every commit, so the evidence is enough for missing.
    const check: CheckFn = (argv) => (argv.includes("user.email") ? false : null);
    const results = await runPass(passItems(), NO_HARNESS, check);
    expect(results.find((result) => result.id === "git-identity")?.status).toBe("missing");
  });

  test("every result carries its checks as typed commands", async () => {
    const results = await runPass(passItems(), BOTH_HARNESSES, () => true);
    const identity = results.find((result) => result.id === "git-identity")!;
    expect(identity.checks).toEqual([
      "git config --get user.name",
      "git config --get user.email",
    ]);
  });
});

describe("spawnChecker", () => {
  // These spawn real processes, deliberately: this is the one boundary that
  // reads the machine, and the fakes above stand on its contract. None of them
  // touches gh, claude or codex — shell built-ins carried as binaries suffice.
  test("an exit of 0 answers yes", async () => {
    expect(await spawnChecker()(["true"])).toBe(true);
  });

  test("a nonzero exit answers no", async () => {
    expect(await spawnChecker()(["false"])).toBe(false);
  });

  test("a binary that is not here gives no answer", async () => {
    expect(await spawnChecker()(["definitely-not-a-binary-prep-tests-for"])).toBeNull();
  });

  test("a check past the ceiling is cut off and gives no answer", async () => {
    expect(await spawnChecker(50)(["sleep", "5"])).toBeNull();
  });
});

describe("withProgress", () => {
  const slow =
    (answer: boolean, ms: number): CheckFn =>
    () =>
      new Promise((resolve) => setTimeout(() => resolve(answer), ms));

  test("a fast check writes nothing at all", async () => {
    const writes: string[] = [];
    const check = withProgress(() => true, (text) => writes.push(text), 50);
    expect(await check(["gh", "auth", "status"])).toBe(true);
    expect(writes).toEqual([]);
  });

  test("a slow check names its own command, then clears the line", async () => {
    const writes: string[] = [];
    const check = withProgress(slow(true, 40), (text) => writes.push(text), 10);
    expect(await check(["gh", "auth", "status"])).toBe(true);
    expect(writes).toHaveLength(2);
    expect(writes[0]).toContain("gh auth status");
    expect(writes[1]).toBe("\r\u001b[2K");
  });

  test("the answer rides through unchanged", async () => {
    const writes: string[] = [];
    expect(await withProgress(() => null, (text) => writes.push(text), 50)(["gh"])).toBeNull();
    expect(await withProgress(() => false, (text) => writes.push(text), 50)(["gh"])).toBe(false);
  });
});

describe("the pass table", () => {
  test("holds the four items, machine rows first", () => {
    expect(passItems().map((spec) => spec.id)).toEqual([
      "github-login",
      "git-identity",
      "claude-login",
      "codex-login",
    ]);
  });

  test("only the harness rows are gated, each on its own harness", () => {
    const gates = new Map(passItems().map((spec) => [spec.id, spec.harness]));
    expect(gates.get("github-login")).toBeUndefined();
    expect(gates.get("git-identity")).toBeUndefined();
    expect(gates.get("claude-login")).toBe("claude-code");
    expect(gates.get("codex-login")).toBe("codex");
  });

  test("every check is a fixed argv of plain words — nothing for a shell to read", () => {
    for (const spec of passItems()) {
      for (const argv of spec.checks) {
        expect(argv.length).toBeGreaterThan(0);
        for (const word of argv) {
          expect(word).toMatch(/^[\w.-]+$/);
        }
      }
    }
  });

  test("every check asks a status and never performs a login", () => {
    for (const spec of passItems()) {
      for (const argv of spec.checks) {
        // `codex login status` carries the word; what none may do is end on it,
        // which is where `gh auth login` and `codex login` differ from a read.
        expect(argv.at(-1)).not.toBe("login");
      }
    }
  });

  test("every item carries guidance a person can act on", () => {
    for (const spec of passItems()) {
      if (spec.guidance.kind === "command") {
        expect(spec.guidance.command.length).toBeGreaterThan(0);
      } else {
        expect(spec.guidance.note.length).toBeGreaterThan(0);
      }
    }
  });

  test("passItems returns a copy so callers cannot disturb the table", () => {
    const first = passItems();
    first.pop();
    expect(passItems().length).toBe(first.length + 1);
  });
});

describe("gating follows the registry, not a list of names", () => {
  test("a hypothetical third harness row rides the same rule", async () => {
    const spec: PassSpec = {
      id: "codex-login",
      summary: "third harness login",
      checks: [["third", "auth", "status"]],
      guidance: { kind: "command", command: "third login" },
      harness: "codex",
    };
    expect(await runPass([spec], new Set(["codex"]), () => true)).toHaveLength(1);
    expect(await runPass([spec], NO_HARNESS, () => true)).toHaveLength(0);
  });
});
