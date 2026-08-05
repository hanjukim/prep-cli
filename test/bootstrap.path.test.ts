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
  /** What PATH holds after `shell` has read the rc written for it. */
  function pathAfterReadingRc(
    shell: string,
    rc: string,
    command: string,
  ): { path: string; home: string } {
    const home = runInFreshHome('persist_on_path "$HOME/.local/bin"', { [rc]: "" }, `/bin/${shell}`);
    const result = Bun.spawnSync({
      cmd: [shell, "-c", command],
      env: { ...process.env, HOME: home, PATH: "/usr/bin:/bin" },
    });

    if (result.exitCode !== 0) {
      throw new Error(`${shell} could not read what was written: ${result.stderr.toString()}`);
    }
    return { path: result.stdout.toString(), home };
  }

  test.skipIf(!holds("zsh"))("zsh", () => {
    const read = '. "$HOME/.zshrc"; printf "%s" "$PATH"';
    const { path, home } = pathAfterReadingRc("zsh", ".zshrc", read);
    expect(path).toContain(`${home}/.local/bin`);
  });

  test.skipIf(!holds("dash"))("dash", () => {
    const read = '. "$HOME/.profile"; printf "%s" "$PATH"';
    const { path, home } = pathAfterReadingRc("dash", ".profile", read);
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

/**
 * The file the terminal that ran the script reads to catch up.
 *
 * A script cannot put anything on its parent's PATH — the environment is copied
 * when the shell forks, and what the run exports dies with it. The only way in
 * is the parent shell running something itself, and what it runs is this file.
 */
describe("write_env_files", () => {
  /** Writes the env files under a HOME of its own, and hands back that HOME. */
  function writeEnvFiles(): string {
    const home = mkdtempSync(join(tmpdir(), "prep-bootstrap-"));
    const result = Bun.spawnSync({
      cmd: [
        "bash",
        "-c",
        `set -Eeuo pipefail
BUN_INSTALL="$HOME/.bun"
PREP_SHARE="$HOME/.local/share/prep"
${shellFunction("rc_block")}
${shellFunction("write_env_files")}
write_env_files`,
      ],
      env: { ...process.env, HOME: home },
    });

    if (result.exitCode !== 0) {
      throw new Error(`write_env_files failed: ${result.stderr.toString()}`);
    }
    return home;
  }

  test("writes one file for POSIX shells and one for fish", () => {
    const home = writeEnvFiles();
    for (const name of [".local/share/prep/env.sh", ".local/share/prep/env.fish"]) {
      expect(read(home, name)).toContain("/.local/bin");
      expect(read(home, name)).toContain("/.bun/bin");
    }
  });

  test("the fish one is fish, not sh", () => {
    const written = read(writeEnvFiles(), ".local/share/prep/env.fish");
    expect(written).toContain("set -gx PATH");
    expect(written).not.toContain("export PATH");
  });

  test("it is not written inside the prep clone, which is a working tree", () => {
    expect(SCRIPT).not.toContain('PREP_SHARE="${PREP_SHARE:-$PREP_DIR');
    expect(SCRIPT).toContain('PREP_SHARE="${PREP_SHARE:-$HOME/.local/share/prep}"');
  });

  test("a run that writes it twice leaves one file, not a growing one", () => {
    // The rc files are appended to; this one is replaced, since it is this
    // script's own file and every run knows the whole of what belongs in it.
    const home = mkdtempSync(join(tmpdir(), "prep-bootstrap-"));
    const twice = `set -Eeuo pipefail
BUN_INSTALL="$HOME/.bun"
PREP_SHARE="$HOME/.local/share/prep"
${shellFunction("rc_block")}
${shellFunction("write_env_files")}
write_env_files
write_env_files`;

    const result = Bun.spawnSync({ cmd: ["bash", "-c", twice], env: { ...process.env, HOME: home } });
    expect(result.exitCode).toBe(0);

    const written = read(home, ".local/share/prep/env.sh");
    expect(written.match(/Added by the prep bootstrap script/g)?.length).toBe(2);
  });

  describe("read by the shell it was written for", () => {
    /** What PATH holds after `shell` has read the env file, and under which HOME. */
    function pathAfterReading(shell: string, command: string): { path: string; home: string } {
      const home = writeEnvFiles();
      const result = Bun.spawnSync({
        cmd: [shell, "-c", command],
        env: { ...process.env, HOME: home, PATH: "/usr/bin:/bin" },
      });

      if (result.exitCode !== 0) {
        throw new Error(`${shell} could not read it: ${result.stderr.toString()}`);
      }
      return { path: result.stdout.toString(), home };
    }

    const source = '. "$HOME/.local/share/prep/env.sh"';
    const readEnvSh = `${source}; printf "%s" "$PATH"`;

    for (const shell of ["sh", "bash", "zsh", "dash", "ksh"]) {
      test.skipIf(!holds(shell))(shell, () => {
        const { path, home } = pathAfterReading(shell, readEnvSh);

        expect(path).toContain(`${home}/.local/bin`);
        expect(path).toContain(`${home}/.bun/bin`);
        // What the terminal already carried is still behind them.
        expect(path).toContain("/usr/bin");
      });
    }

    test.skipIf(!holds("fish"))("fish", () => {
      const { path, home } = pathAfterReading(
        "fish",
        'source "$HOME/.local/share/prep/env.fish"; printf "%s" "$PATH"',
      );

      expect(path).toContain(`${home}/.local/bin`);
      expect(path).toContain(`${home}/.bun/bin`);
    });

    test.skipIf(!holds("dash"))("reading it twice puts the directory on once", () => {
      const { path, home } = pathAfterReading("dash", `${source}; ${readEnvSh}`);

      expect(path.split(":").filter((dir) => dir === `${home}/.local/bin`).length).toBe(1);
    });
  });
});

describe("env_line", () => {
  /** Runs env_line under a HOME and a login shell of its own. */
  function runEnvLine(shell = "/bin/bash"): string {
    const home = mkdtempSync(join(tmpdir(), "prep-bootstrap-"));
    const result = Bun.spawnSync({
      cmd: [
        "bash",
        "-c",
        `set -Eeuo pipefail
PREP_SHARE="$HOME/.local/share/prep"
${shellFunction("login_shell")}
${shellFunction("env_line")}
env_line`,
      ],
      env: { ...process.env, HOME: home, SHELL: shell },
    });

    if (result.exitCode !== 0) throw new Error(`env_line failed: ${result.stderr.toString()}`);
    return result.stdout.toString();
  }

  test("names the file by its full path, since this shell read no rc", () => {
    const line = runEnvLine();
    expect(line).toStartWith(". /");
    expect(line).toEndWith("/.local/share/prep/env.sh");
    expect(line).not.toContain("$HOME");
    expect(line).not.toContain("~");
  });

  test("zsh, dash and ksh read the same file bash does", () => {
    for (const shell of ["/bin/zsh", "/bin/dash", "/usr/bin/ksh"]) {
      expect(runEnvLine(shell)).toEndWith("/env.sh");
    }
  });

  test("fish gets its own file, and the word fish uses to read one", () => {
    // fish has no `.` builtin, and env.sh would be a syntax error in it.
    const line = runEnvLine("/usr/bin/fish");
    expect(line).toStartWith("source /");
    expect(line).toEndWith("/env.fish");
  });

  test("a shell nobody named falls back to the POSIX file", () => {
    expect(runEnvLine("")).toEndWith("/env.sh");
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
    expect(stop.slice(0, stop.indexOf("second run skips it"))).toContain("$(env_line)");
  });

  test("the closing message hands this terminal its PATH before naming a tool", () => {
    const done = SCRIPT.slice(SCRIPT.indexOf("==> Done"));
    expect(done).toContain('"$(env_line)"');
    // Ahead of `cd`/`claude` and ahead of the second-run line, because every one
    // of them is a name this shell does not carry yet.
    expect(done.indexOf('"$(env_line)"')).toBeLessThan(done.indexOf("claude\\n"));
  });

  test("the file they are sent to read is written before any step can stop", () => {
    // Step 9 hands it back, and step 9 is where a run most often ends.
    expect(SCRIPT.indexOf("\nwrite_env_files\n")).toBeLessThan(SCRIPT.indexOf('step "9/10'));
  });

  test("both directories the script exports are written into a shell rc", () => {
    // ~/.local/bin was always persisted. ~/.bun/bin holds prep, and used to be
    // left to bun's own installer having identified this machine's shell.
    expect(SCRIPT).toContain('persist_on_path "$HOME/.local/bin"');
    expect(SCRIPT).toContain('persist_on_path "$BUN_INSTALL/bin"');
  });
});
