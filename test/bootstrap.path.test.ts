import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

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

/**
 * Everything `persist_on_path` stands on: which shell the person runs, which
 * files that shell reads, what to create when it reads none, and the syntax each
 * file takes.
 */
const PATH_FUNCTIONS = ["login_shell", "rc_candidates", "create_default_rc", "rc_block"]
  .concat("persist_on_path")
  .map(shellFunction)
  .join("\n");

/**
 * Runs a snippet under a HOME of its own, and hands back that HOME.
 *
 * `SHELL` is passed in rather than inherited, because which rc a machine with
 * none gets is read off it, and the machine running the tests has one of its
 * own. Files given as `a/b` are created with their directory.
 */
function runInFreshHome(
  snippet: string,
  files: Record<string, string> = {},
  shell = "/bin/bash",
): string {
  const home = mkdtempSync(join(tmpdir(), "prep-bootstrap-"));
  for (const [name, content] of Object.entries(files)) {
    mkdirSync(dirname(join(home, name)), { recursive: true });
    writeFileSync(join(home, name), content);
  }

  const result = Bun.spawnSync({
    cmd: ["bash", "-c", `set -Eeuo pipefail\n${PATH_FUNCTIONS}\n${snippet}`],
    env: { ...process.env, HOME: home, SHELL: shell },
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
    // A login shell reads .profile and an interactive one reads .bashrc.
    expect(read(home, ".bashrc")).toContain(".local/bin");
  });

  test("a zsh machine with no rc gets .zshrc, which is a file zsh reads", () => {
    // zsh reads .zshenv, .zprofile and .zshrc, and never .profile. A fresh
    // macOS account and anybody who ran chsh before writing a rc land here.
    const home = runInFreshHome('persist_on_path "$HOME/.local/bin"', {}, "/bin/zsh");
    expect(read(home, ".zshrc")).toContain(".local/bin");
    expect(read(home, ".profile")).toBe("");
  });

  test("a fish machine with no rc gets config.fish, directory and all", () => {
    const home = runInFreshHome('persist_on_path "$HOME/.local/bin"', {}, "/usr/bin/fish");
    expect(read(home, ".config/fish/config.fish")).toContain(".local/bin");
    expect(read(home, ".profile")).toBe("");
  });

  test("a shell nobody named gets .profile", () => {
    const home = runInFreshHome('persist_on_path "$HOME/.local/bin"', {}, "");
    expect(read(home, ".profile")).toContain(".local/bin");
  });

  test("a bash login shell reading .bash_profile is written to, not passed over", () => {
    // bash reads the first of .bash_profile, .bash_login and .profile that
    // exists and stops. On a machine carrying one, a line in .profile is dead.
    const home = runInFreshHome('persist_on_path "$HOME/.local/bin"', {
      ".bash_profile": "# mine\n",
    });
    expect(read(home, ".bash_profile")).toContain(".local/bin");
  });

  test("a fish config that is already there is written in fish, not in sh", () => {
    const home = runInFreshHome('persist_on_path "$HOME/.local/bin"', {
      ".config/fish/config.fish": "# mine\n",
    });

    const written = read(home, ".config/fish/config.fish");
    expect(written).toContain("set -gx PATH");
    expect(written).toContain("if not contains");
    expect(written).not.toContain("export PATH");
    expect(written).toContain("# mine");
  });

  test("a machine running two shells gets the line in both of their files", () => {
    // One person, bash in one terminal and zsh in another. Neither reads the
    // other's rc, and the run installed the tools for both.
    const home = runInFreshHome('persist_on_path "$HOME/.local/bin"', {
      ".bashrc": "",
      ".zshrc": "",
    });
    expect(read(home, ".bashrc")).toContain(".local/bin");
    expect(read(home, ".zshrc")).toContain(".local/bin");
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

  test("a rc bun's own installer wrote ends up carrying the directory once", () => {
    // bun writes the directory through a variable of its own, so the grep here
    // does not find it and a second block is appended. What matters is the
    // shell that reads both: the guard in each keeps the directory on PATH once.
    const bun = 'export BUN_INSTALL="$HOME/.bun"\nexport PATH="$BUN_INSTALL/bin:$PATH"\n';
    const home = runInFreshHome('persist_on_path "$HOME/.bun/bin"', { ".bashrc": bun });

    const result = Bun.spawnSync({
      cmd: ["bash", "-c", 'PATH=/usr/bin:/bin; . "$HOME/.bashrc"; printf "%s" "$PATH"'],
      env: { ...process.env, HOME: home },
    });

    expect(result.exitCode).toBe(0);
    const path = result.stdout.toString().split(":");
    expect(path.filter((dir) => dir === `${home}/.bun/bin`).length).toBe(1);
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

/** Whether this machine holds a shell, so a test needing it can stand aside. */
function holds(shell: string): boolean {
  return Bun.spawnSync({ cmd: ["sh", "-c", `command -v ${shell}`] }).exitCode === 0;
}

/**
 * What the rc lines are worth: the interpreter that reads them, reading them.
 *
 * Asserting on the text says the block was written. Only the shell itself says
 * the block parses and puts the directory where it belongs — and fish, the one
 * that needed a syntax of its own, is exactly the one a text assertion would
 * pass while the machine failed.
 */
describe("the rc lines, read by the shell they were written for", () => {
  function pathAfterReading(shell: string, rc: string, command: string): string {
    const home = runInFreshHome('persist_on_path "$HOME/.local/bin"', { [rc]: "" }, `/bin/${shell}`);
    const result = Bun.spawnSync({
      cmd: [shell, "-c", command],
      env: { ...process.env, HOME: home, PATH: "/usr/bin:/bin" },
    });

    if (result.exitCode !== 0) {
      throw new Error(`${shell} could not read what was written: ${result.stderr.toString()}`);
    }
    return `${result.stdout.toString()}||${home}`;
  }

  test.skipIf(!holds("zsh"))("zsh", () => {
    const [path, home] = pathAfterReading("zsh", ".zshrc", '. "$HOME/.zshrc"; printf "%s" "$PATH"')
      .split("||");
    expect(path).toContain(`${home}/.local/bin`);
  });

  test.skipIf(!holds("dash"))("dash", () => {
    const [path, home] = pathAfterReading(
      "dash",
      ".profile",
      '. "$HOME/.profile"; printf "%s" "$PATH"',
    ).split("||");
    expect(path).toContain(`${home}/.local/bin`);
  });

  test.skipIf(!holds("fish"))("fish", () => {
    const home = runInFreshHome(
      'persist_on_path "$HOME/.local/bin"',
      { ".config/fish/config.fish": "" },
      "/usr/bin/fish",
    );
    const result = Bun.spawnSync({
      cmd: ["fish", "-c", 'source "$HOME/.config/fish/config.fish"; printf "%s" "$PATH"'],
      env: { ...process.env, HOME: home, PATH: "/usr/bin:/bin" },
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString()).toContain(`${home}/.local/bin`);
  });
});

describe("path_line", () => {
  /** Runs path_line under a HOME and a login shell of its own. */
  function runPathLine(shell = "/bin/bash"): string {
    const home = mkdtempSync(join(tmpdir(), "prep-bootstrap-"));
    const result = Bun.spawnSync({
      cmd: [
        "bash",
        "-c",
        `set -Eeuo pipefail
BUN_INSTALL="$HOME/.bun"
${shellFunction("login_shell")}
${shellFunction("path_line")}
path_line`,
      ],
      env: { ...process.env, HOME: home, SHELL: shell },
    });

    if (result.exitCode !== 0) throw new Error(`path_line failed: ${result.stderr.toString()}`);
    return result.stdout.toString();
  }

  test("names both directories this script puts on PATH", () => {
    const line = runPathLine();
    // Node, gh and Claude Code land in the first; bun and prep in the second.
    expect(line).toContain("/.local/bin");
    expect(line).toContain("/.bun/bin");
  });

  test("writes the paths out, since it is pasted into a shell that read no rc", () => {
    // A `$HOME` would still expand, but the line is also read by a person
    // deciding whether to trust it, and a path says where it points.
    expect(runPathLine()).not.toContain("$HOME");
  });

  test("keeps what the terminal already carries", () => {
    expect(runPathLine()).toContain(":$PATH");
  });

  test("zsh and dash take the same line bash does", () => {
    for (const shell of ["/bin/zsh", "/bin/dash", "/usr/bin/ksh"]) {
      expect(runPathLine(shell)).toStartWith('export PATH="');
    }
  });

  test("fish gets fish, since the POSIX line is a syntax error there", () => {
    const line = runPathLine("/usr/bin/fish");
    // fish has no `export`, and its PATH is a list rather than a joined string.
    expect(line).toStartWith("set -gx PATH ");
    expect(line).toEndWith(" $PATH");
    expect(line).not.toContain("export");
    expect(line).not.toContain(":");
  });

  test("a shell nobody named falls back to the POSIX line", () => {
    expect(runPathLine("")).toStartWith('export PATH="');
  });

  test("what it prints is a line a shell runs, and it puts both on PATH", () => {
    const home = mkdtempSync(join(tmpdir(), "prep-bootstrap-"));
    const result = Bun.spawnSync({
      cmd: [
        "bash",
        "-c",
        `set -Eeuo pipefail
BUN_INSTALL="$HOME/.bun"
${shellFunction("path_line")}
PATH=/usr/bin:/bin
eval "$(path_line)"
printf '%s' "$PATH"`,
      ],
      env: { ...process.env, HOME: home },
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString()).toContain(`${home}/.local/bin`);
    expect(result.stdout.toString()).toContain(`${home}/.bun/bin`);
    // The directories it started with are still behind them.
    expect(result.stdout.toString()).toContain("/usr/bin");
  });
});

describe("the commands the script hands to a person", () => {
  test("the GitHub login is named by gh's own path, not by a name their shell may not carry", () => {
    // The person runs this in the terminal that ran the one-liner, and that
    // shell has not read the rc file persist_on_path just wrote.
    expect(SCRIPT.includes('GH_BIN="$(command -v gh)"')).toBe(true);
    expect(SCRIPT.includes("$GH_BIN auth login --git-protocol https --web")).toBe(true);
  });

  test("the stop at step 9 names the line that runs this script again", () => {
    // The run ends there. Naming the login without naming the way back leaves
    // somebody holding half a handover.
    const stop = SCRIPT.slice(SCRIPT.indexOf("The project is on GitHub"));
    expect(stop.slice(0, stop.indexOf("second run skips it"))).toContain(
      "curl -fsSL $SCRIPT_URL | bash",
    );
  });

  test("the stop at step 9 hands this terminal its PATH", () => {
    const stop = SCRIPT.slice(SCRIPT.indexOf("The project is on GitHub"));
    expect(stop.slice(0, stop.indexOf("second run skips it"))).toContain("$(path_line)");
  });

  test("the closing message hands this terminal its PATH before naming a tool", () => {
    const done = SCRIPT.slice(SCRIPT.indexOf("==> Done"));
    expect(done).toContain('"$(path_line)"');
    // Ahead of `cd`/`claude` and ahead of the second-run line, because every one
    // of them is a name this shell does not carry yet.
    expect(done.indexOf('"$(path_line)"')).toBeLessThan(done.indexOf("claude\\n"));
  });

  test("both directories the script exports are written into a shell rc", () => {
    // ~/.local/bin was always persisted. ~/.bun/bin holds prep, and used to be
    // left to bun's own installer having identified this machine's shell.
    expect(SCRIPT).toContain('persist_on_path "$HOME/.local/bin"');
    expect(SCRIPT).toContain('persist_on_path "$BUN_INSTALL/bin"');
  });
});
