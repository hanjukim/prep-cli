import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * The bootstrap script's PATH handling, run for real.
 *
 * The script installs Node, gh and Claude Code into ~/.local/bin, which a shell
 * that starts later does not carry. Everything here is about the shells this
 * script does not control: the one the person types `gh auth login` into after
 * being stopped at step 9, and every terminal they open afterwards.
 *
 * The function under test is lifted out of the script by name rather than the
 * script being sourced, because the script installs a machine the moment it is
 * read.
 */
const SCRIPT = readFileSync(new URL("../scripts/bootstrap.sh", import.meta.url), "utf8");

/** One shell function, from its header to the closing brace at column zero. */
function shellFunction(name: string): string {
  const match = SCRIPT.match(new RegExp(`^${name}\\(\\) \\{\\n[\\s\\S]*?\\n\\}$`, "m"));
  if (match === null) throw new Error(`${name} is not in scripts/bootstrap.sh`);
  return match[0];
}

/** Runs a snippet under a HOME of its own, and hands back that HOME. */
function runInFreshHome(snippet: string, files: Record<string, string> = {}): string {
  const home = mkdtempSync(join(tmpdir(), "prep-bootstrap-"));
  for (const [name, content] of Object.entries(files)) writeFileSync(join(home, name), content);

  const result = Bun.spawnSync({
    cmd: ["bash", "-c", `set -Eeuo pipefail\n${shellFunction("persist_on_path")}\n${snippet}`],
    env: { ...process.env, HOME: home },
  });

  if (result.exitCode !== 0) {
    throw new Error(`the snippet failed: ${result.stderr.toString()}`);
  }
  return home;
}

const read = (home: string, name: string): string => {
  try {
    return readFileSync(join(home, name), "utf8");
  } catch {
    return "";
  }
};

/** Runs a snippet with `have` in scope, and hands back what it printed. */
function runWithHave(snippet: string): string {
  const result = Bun.spawnSync({
    cmd: ["bash", "-c", `set -Eeuo pipefail\n${shellFunction("have")}\n${snippet}`],
  });

  if (result.exitCode !== 0) {
    throw new Error(`the snippet failed: ${result.stderr.toString()}`);
  }
  return result.stdout.toString().trim();
}

describe("have", () => {
  test("finds a tool this machine actually holds", () => {
    expect(runWithHave("have bash && echo yes || echo no")).toBe("yes");
  });

  test("does not find one this machine does not hold", () => {
    expect(runWithHave("have no-such-tool-xyz && echo yes || echo no")).toBe("no");
  });

  // WSL puts the Windows PATH on the Linux PATH, so a tool installed for Windows
  // answers here. Taking it skips the install that belongs on this machine
  // (docs/adr/0022). `command` is overridden rather than /mnt being created,
  // because the test has to run on a machine that has no /mnt at all.
  test("refuses a Windows executable reached through a WSL mount", () => {
    const windowsClaude = "command() { echo /mnt/c/Users/x/AppData/Roaming/npm/claude; }";
    expect(runWithHave(`${windowsClaude}\nhave claude && echo yes || echo no`)).toBe("no");
  });

  test("takes a tool of the same name that is not under a mount", () => {
    const linuxClaude = 'command() { echo "$HOME/.local/bin/claude"; }';
    expect(runWithHave(`${linuxClaude}\nhave claude && echo yes || echo no`)).toBe("yes");
  });
});

describe("persist_on_path", () => {
  test("writes the directory into every shell rc that is already there", () => {
    const home = runInFreshHome('persist_on_path "$HOME/.local/bin"', {
      ".bashrc": "# mine\n",
      ".zshrc": "# mine\n",
    });

    for (const rc of [".bashrc", ".zshrc"]) {
      expect(read(home, rc)).toContain(".local/bin");
      // What stood there before is still there.
      expect(read(home, rc)).toContain("# mine");
    }
  });

  test("a second run adds nothing, so running the script again does not stack lines", () => {
    const home = runInFreshHome(
      'persist_on_path "$HOME/.local/bin"\npersist_on_path "$HOME/.local/bin"',
      { ".bashrc": "" },
    );

    const occurrences = read(home, ".bashrc").split(".local/bin").length - 1;
    expect(occurrences).toBeGreaterThan(0);
    expect(read(home, ".bashrc").match(/export PATH=/g)?.length).toBe(1);
  });

  test("with no rc file at all it writes one, because a machine like that still needs PATH", () => {
    const home = runInFreshHome('persist_on_path "$HOME/.local/bin"');
    expect(read(home, ".profile")).toContain(".local/bin");
  });

  test("the line it writes puts the directory on PATH when the rc is read", () => {
    const home = runInFreshHome('persist_on_path "$HOME/.local/bin"', { ".bashrc": "" });
    const result = Bun.spawnSync({
      cmd: ["bash", "-c", 'PATH=/usr/bin:/bin; . "$HOME/.bashrc"; printf "%s" "$PATH"'],
      env: { ...process.env, HOME: home },
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString()).toContain(`${home}/.local/bin`);
  });

  test("a rc that writes the directory through $HOME already carries it", () => {
    // Ubuntu ships exactly this line in ~/.profile, and it means the same PATH.
    const existing = 'if [ -d "$HOME/.local/bin" ] ; then PATH="$HOME/.local/bin:$PATH"; fi\n';
    const home = runInFreshHome('persist_on_path "$HOME/.local/bin"', { ".profile": existing });
    expect(read(home, ".profile")).toBe(existing);
  });

  test("a rc that already carries the directory is left alone", () => {
    const home = runInFreshHome('persist_on_path "$HOME/.local/bin"', { ".bashrc": "" });
    const first = read(home, ".bashrc");

    Bun.spawnSync({
      cmd: [
        "bash",
        "-c",
        `set -Eeuo pipefail\n${shellFunction("persist_on_path")}\npersist_on_path "$HOME/.local/bin"`,
      ],
      env: { ...process.env, HOME: home },
    });

    expect(read(home, ".bashrc")).toBe(first);
  });
});

describe("the commands the script hands to a person", () => {
  test("the GitHub login is named by gh's own path, not by a name their shell may not carry", () => {
    // The person runs this in the terminal that ran the one-liner, and that
    // shell has not read the rc file persist_on_path just wrote.
    expect(SCRIPT.includes('GH_BIN="$(command -v gh)"')).toBe(true);
    expect(SCRIPT.includes("$GH_BIN auth login --git-protocol https --web")).toBe(true);
  });
});
