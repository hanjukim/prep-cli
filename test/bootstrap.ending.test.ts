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
 * The rule they are held to is one next action (docs/adr/0028). Whatever else a
 * run prints, exactly one thing is the thing to do next, and it stands apart
 * from the reference under it.
 */
const SCRIPT = readFileSync(new URL("../scripts/bootstrap.sh", import.meta.url), "utf8");

/** One shell function, from its header to the closing brace at column zero. */
function shellFunction(name: string): string {
  const match = SCRIPT.match(new RegExp(`^${name}\\(\\) \\{\\n[\\s\\S]*?\\n\\}$`, "m"));
  if (match === null) throw new Error(`${name} is not in scripts/bootstrap.sh`);
  return match[0];
}

/** The rule the block is drawn between, taken from the script rather than restated. */
const RULE = SCRIPT.match(/^RULE="(.*)"$/m)?.[1] ?? "";

/**
 * Runs a snippet with the named functions in scope, and hands back everything it
 * printed on both streams — a person reads one terminal, not two.
 *
 * Neither stream is a terminal under a test runner, so the script's own emphasis
 * guard leaves `$BOLD` and the rest empty and the text arrives plain, which is
 * what the assertions below read.
 *
 * The global git configuration is pointed at /dev/null. Nothing these functions
 * run reads it any more — the ending stopped asking `git config --get` when that
 * answer became prep's (docs/adr/0027) — and the pin stays so that a read added
 * back gets a fixed answer here rather than whatever this machine commits under.
 */
function run(functions: string[], snippet: string): string {
  const result = Bun.spawnSync({
    cmd: [
      "bash",
      "-c",
      [
        "set -Eeuo pipefail",
        'BOLD="" REVERSE="" RESET=""',
        `RULE="${RULE}"`,
        'PREP_SHARE="$HOME/.local/share/prep"',
        ...functions.map(shellFunction),
        snippet,
      ].join("\n"),
    ],
    env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null" },
  });
  return result.stdout.toString() + result.stderr.toString();
}

/** The closing message, for a run that reached the end. */
function closing(options: {
  projectReady: boolean;
  gaps?: string;
  links?: string;
  loggedIn?: boolean;
}): string {
  return run(
    ["login_shell", "env_line", "announce_next_action", "claude_login_note", "closing_message"],
    [
      `PROJECT_READY=${options.projectReady ? 1 : 0}`,
      "PROJECT_DIR=/home/somebody/a-project",
      "GH_BIN=/home/somebody/.local/bin/gh",
      `gh() { return ${options.loggedIn ? 0 : 1}; }`,
      `FAILED_GAPS=${JSON.stringify(options.gaps ?? "")}`,
      `FAILED_LINKS=${JSON.stringify(options.links ?? "")}`,
      "closing_message",
    ].join("\n"),
  );
}

/** What claude_login_note prints, taken from the script rather than repeated here. */
const note = (): string => run(["claude_login_note"], "claude_login_note");

/** Everything the ending prints before it turns to reference. */
const beforeReference = (ending: string): string => ending.split("==> For reference")[0] ?? "";

/** Everything from the reference heading on. */
const reference = (ending: string): string => ending.split("==> For reference")[1] ?? "";

describe("the stop in front of the GitHub login", () => {
  // gh answers every call with a failure, which is what a machine with no login
  // does to `gh auth status`. fail() exits 1, so the snippet's own status is
  // taken rather than propagated.
  const stopped = run(
    ["fail", "login_shell", "env_line", "claude_login_note", "require_github_login"],
    [
      'STEP="9/10 project"',
      "SCRIPT_URL=https://example.invalid/bootstrap.sh",
      "GH_BIN=/home/somebody/.local/bin/gh",
      "gh() { return 1; }",
      "require_github_login || true",
    ].join("\n"),
  );

  test("names the GitHub login it stopped for", () => {
    expect(stopped).toInclude("/home/somebody/.local/bin/gh auth login --git-protocol https --web");
    expect(stopped).toInclude("https://github.com/login/device");
  });

  test("names the Claude Code login in the same message, word for word", () => {
    expect(stopped).toInclude(note());
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

  test("leads the block with the line that makes those commands findable", () => {
    const block = beforeReference(ending);
    expect(block.indexOf("/.local/share/prep/env.sh")).toBeLessThan(block.indexOf("cd /home"));
  });

  test("keeps the logins and the chef command as reference", () => {
    expect(reference(ending)).toInclude(note());
    expect(reference(ending)).toInclude("Codex");
    expect(reference(ending)).toInclude("prep chef");
  });

  test("says nothing about the machine-only path", () => {
    expect(ending).not.toInclude("git clone");
    expect(ending).not.toInclude("prep setup");
    expect(ending).not.toInclude("git config --global");
  });
});

describe("a run that stopped at the machine", () => {
  const ending = closing({ projectReady: false });

  test("highlights getting the project, and nothing else", () => {
    expect(beforeReference(ending)).toInclude('git clone "<git url>" ~/my-project');
    expect(beforeReference(ending)).toInclude("prep setup ~/my-project");
    expect(ending.match(/Next:/g)).toHaveLength(1);
  });

  test("does not send anybody back through the one-liner", () => {
    expect(ending).not.toInclude("curl");
    expect(ending).not.toInclude("bootstrap.sh");
    expect(ending).not.toInclude("PREPARED_REPO");
  });

  // The ending used to name the GitHub login and the git identity itself, each
  // behind a check it ran in its own shell. Both are prep's to report now
  // (docs/adr/0027), and these hold that the script stopped rather than that it
  // was quietly moved: the commands are gone, and so are the reads behind them.
  test("names neither the GitHub login nor the git identity", () => {
    expect(ending).not.toInclude("auth login");
    expect(ending).not.toInclude("github.com/login/device");
    expect(ending).not.toInclude("git config --global");
  });

  test("says the same thing whatever gh answers, because it no longer asks", () => {
    expect(closing({ projectReady: false, loggedIn: true })).toBe(
      closing({ projectReady: false, loggedIn: false }),
    );
  });

  test("points at prep chef instead, once, and says what it will report", () => {
    // The pointer itself, not every mention of the command: the failed-links
    // list names `prep chef` too, for a different reason and only when it has
    // something in it.
    const pointer = /prep chef reports what this machine still owes you/g;
    expect(reference(ending).match(pointer)).toHaveLength(1);
    expect(reference(ending)).toInclude("GitHub login");
    expect(reference(ending)).toInclude("git name and email");
    expect(reference(ending)).toInclude("login for each agent CLI");
  });

  test("still says why the clone above may need a login, without asking whether it does", () => {
    // The one fact the deleted block carried that is about this run's next action
    // rather than about the machine. It names no command and reads nothing, so it
    // survives the move without deciding anything (docs/adr/0027).
    expect(reference(ending)).toInclude("404");
    expect(reference(ending)).toInclude("If that repository is private");
  });

  test("the cloning ending says nothing about it, having already cloned", () => {
    expect(closing({ projectReady: true })).not.toInclude("404");
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

// The other list a run leaves behind: a tool this machine installed under
// somebody else's name, which the script could not link back to its own
// (docs/adr/0025). Both lists are about this run rather than about what always
// holds, so they sit together at the top of the reference block.
describe("tools this run could not give their own name", () => {
  const ending = closing({ projectReady: true, links: "  bat (this machine has no batcat)\n" });

  test("are reported under reference rather than as the next action", () => {
    expect(reference(ending)).toInclude("bat (this machine has no batcat)");
    expect(beforeReference(ending)).not.toInclude("bat (this machine has no batcat)");
  });

  test("are left out entirely when every link landed", () => {
    expect(closing({ projectReady: true })).not.toInclude("installed under another name");
  });
});

describe("the Claude Code login", () => {
  // The two runs above each assert the note reaches them. This asserts the other
  // half: that it is one wording rather than two that happen to agree today.
  test("is written once, and both places call for it rather than repeating it", () => {
    expect(shellFunction("claude_login_note")).toInclude("paid account");
    expect(shellFunction("require_github_login")).toInclude("$(claude_login_note)");
    expect(shellFunction("closing_message")).toInclude("\n  claude_login_note\n");
    expect(SCRIPT.match(/paid account/g)).toHaveLength(1);
  });
});
