import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

/**
 * Where the GitHub login falls in the bootstrap script.
 *
 * The login belongs to the clone that needs it, so it lives inside the project
 * step and a run that names no project never meets it (docs/adr/0021). That is
 * a property of the script's shape rather than of any one function, so it is
 * read off the text: nothing between the first step and the project step may
 * ask GitHub for an account.
 *
 * The acceptance test for the decision itself is a real run on a fresh machine,
 * which this cannot stand in for. What it can do is stop the login drifting back
 * up the chain unnoticed.
 */
const SCRIPT = readFileSync(new URL("../scripts/bootstrap.sh", import.meta.url), "utf8");

/** The script's top-level statements from one step marker up to another. */
function between(first: string, second: string): string {
  const start = SCRIPT.indexOf(`step "${first}"`);
  const end = SCRIPT.indexOf(`step "${second}"`);
  if (start === -1) throw new Error(`step "${first}" is not in scripts/bootstrap.sh`);
  if (end === -1) throw new Error(`step "${second}" is not in scripts/bootstrap.sh`);
  return SCRIPT.slice(start, end);
}

describe("the machine is built without an account", () => {
  const machine = between("1/10 package manager", "9/10 project");

  // Every function the script defines sits above the first step marker, so this
  // slice is the calls it actually makes on the way to the project question.
  test.each(["gh auth status", "gh auth login", "gh auth setup-git", "gh api", "gh repo view"])(
    "no %s before the project is named",
    (call) => {
      expect(machine).not.toInclude(call);
    },
  );

  test("prep's own clone is probed with git rather than gh", () => {
    expect(machine).toInclude('require_repo_exists "$PREP_REPO" "prep"');
    expect(SCRIPT).toInclude("GIT_TERMINAL_PROMPT=0 git ls-remote");
  });

  // What that run is told at the end — the login it never made, the identity
  // behind it, and their order — belongs to the closing message, and
  // test/bootstrap.ending.test.ts runs that message rather than reading it.
  test("nothing between the steps asks for the login the ending hands over", () => {
    expect(machine).not.toInclude("auth login --git-protocol https --web");
    expect(SCRIPT).toInclude("closing_message");
  });
});

describe("the project step is where the account is asked for", () => {
  const project = between("9/10 project", "10/10 prep setup");

  test("the login runs there, and only when the project is on github.com", () => {
    expect(project).toInclude('PROJECT_SLUG="$(github_slug "$PREPARED_REPO" || true)"');
    expect(project).toMatch(/if \[ -n "\$PROJECT_SLUG" \]; then\n\s*require_github_login\n\s*fi/);
  });

  test("the identity follows the login, so its answers can be offered", () => {
    expect(project.indexOf("require_github_login")).toBeLessThan(
      project.indexOf("ensure_git_identity"),
    );
  });

  test("the authenticated probe stays ahead of the project clone", () => {
    expect(project).toInclude('require_repo_access "$PROJECT_SLUG" "$PREPARED_REPO" "The project"');
    expect(project.indexOf("require_repo_access")).toBeLessThan(
      project.indexOf('git clone "$PREPARED_REPO"'),
    );
  });

  test("the login is still handed over rather than run", () => {
    expect(SCRIPT).toInclude("$GH_BIN auth login --git-protocol https --web");
    expect(SCRIPT).not.toInclude("gh auth login --git-protocol https --web\"\n");
  });
});
