import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

/**
 * What the bootstrap script says when it hands work back to a person.
 *
 * There are two such places — the stop in front of the GitHub login, and the
 * closing message — and each is the last thing somebody reads on its path. So
 * each is run here rather than read: the functions are lifted out of the script
 * by name and executed, because sourcing the script installs a machine the
 * moment it is read.
 *
 * The rule they are held to is one next action (docs/adr/0023). Whatever else a
 * run prints, exactly one thing is the thing to do next, and it stands apart
 * from the reference below it.
 */
const SCRIPT = readFileSync(new URL("../scripts/bootstrap.sh", import.meta.url), "utf8");

/** One shell function, from its header to the closing brace at column zero. */
function shellFunction(name: string): string {
  const match = SCRIPT.match(new RegExp(`^${name}\\(\\) \\{\\n[\\s\\S]*?\\n\\}$`, "m"));
  if (match === null) throw new Error(`${name} is not in scripts/bootstrap.sh`);
  return match[0];
}

/**
 * Runs a snippet with the named functions in scope, and hands back everything it
 * printed on both streams — a person reads one terminal, not two.
 *
 * git is asked for the identity, so the global configuration is pointed at
 * /dev/null: what this machine commits under is not this test's business.
 */
function run(functions: string[], snippet: string): string {
  const result = Bun.spawnSync({
    cmd: ["bash", "-c", `set -Eeuo pipefail\n${functions.map(shellFunction).join("\n")}\n${snippet}`],
    env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null" },
  });
  return result.stdout.toString() + result.stderr.toString();
}

/** The closing message, for a run that reached the end. */
function closing(options: { projectReady: boolean; gaps?: string }): string {
  return run(
    ["claude_login_note", "closing_message"],
    [
      `PROJECT_READY=${options.projectReady ? 1 : 0}`,
      `PROJECT_DIR=/home/somebody/a-project`,
      `FAILED_GAPS=${JSON.stringify(options.gaps ?? "")}`,
      "closing_message",
    ].join("\n"),
  );
}

/** Everything the ending prints before it turns to reference. */
const beforeReference = (ending: string): string => ending.split("==> For reference")[0] ?? "";

/** Everything from the reference heading on. */
const reference = (ending: string): string => ending.split("==> For reference")[1] ?? "";

describe("the stop in front of the GitHub login", () => {
  // gh answers every call with a failure, which is what a machine with no login
  // does to `gh auth status`. fail() exits 1, so the snippet's own status is
  // taken rather than propagated.
  const stopped = run(
    ["fail", "claude_login_note", "require_github_login"],
    [
      'STEP="9/10 project"',
      'GH_BIN=/home/somebody/.local/bin/gh',
      "gh() { return 1; }",
      "require_github_login || true",
    ].join("\n"),
  );

  test("names the GitHub login it stopped for", () => {
    expect(stopped).toInclude("/home/somebody/.local/bin/gh auth login --git-protocol https --web");
    expect(stopped).toInclude("https://github.com/login/device");
  });

  test("names the Claude Code login in the same message", () => {
    expect(stopped).toInclude("claude");
    expect(stopped).toInclude("paid account");
  });

  test("says the machine keeps what it has, so the second run is cheap", () => {
    expect(stopped).toInclude("Everything installed so far stays installed");
  });
});

describe("a run that set the project up", () => {
  const ending = closing({ projectReady: true });

  test("highlights starting work, and nothing else", () => {
    expect(beforeReference(ending)).toInclude("cd /home/somebody/a-project");
    expect(beforeReference(ending)).toInclude("claude");
    expect(ending.match(/Next:/g)).toHaveLength(1);
  });

  test("keeps the logins and the doctor command as reference", () => {
    expect(reference(ending)).toInclude("paid account");
    expect(reference(ending)).toInclude("Codex");
    expect(reference(ending)).toInclude("prep doctor");
  });

  test("says nothing about the machine-only path", () => {
    expect(ending).not.toInclude("git clone");
    expect(ending).not.toInclude("prep setup");
  });
});

describe("a run that stopped at the machine", () => {
  const ending = closing({ projectReady: false });

  test("highlights getting the project, and nothing else", () => {
    expect(beforeReference(ending)).toInclude("git clone");
    expect(beforeReference(ending)).toInclude("prep setup");
    expect(ending.match(/Next:/g)).toHaveLength(1);
  });

  test("does not send anybody back through the one-liner", () => {
    expect(ending).not.toInclude("curl");
    expect(ending).not.toInclude("bootstrap.sh");
    expect(ending).not.toInclude("PREPARED_REPO");
  });

  test("names the GitHub login a private repository needs, as reference", () => {
    expect(reference(ending)).toInclude("auth login --git-protocol https --web");
  });

  test("names the git identity, since this path never asked for one", () => {
    expect(reference(ending)).toInclude('git config --global user.name "Your Name"');
    expect(reference(ending)).toInclude("git config --global user.email");
  });
});

describe("gaps that would not install", () => {
  const ending = closing({ projectReady: true, gaps: "  brew install ripgrep\n" });

  test("are reported under reference rather than as the next action", () => {
    expect(reference(ending)).toInclude("brew install ripgrep");
    expect(beforeReference(ending)).not.toInclude("brew install ripgrep");
  });

  test("are left out entirely when everything installed", () => {
    expect(closing({ projectReady: true })).not.toInclude("would not install");
  });
});

describe("the Claude Code login", () => {
  test("is written once and printed from both places that hand it over", () => {
    expect(SCRIPT.match(/claude_login_note/g)).toHaveLength(3);
  });
});
