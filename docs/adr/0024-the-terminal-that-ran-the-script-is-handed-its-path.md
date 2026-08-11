# ADR-0024: The terminal that ran the script is handed its PATH

**Date:** 2026-08-06
**Status:** Accepted — extends ADR-0013's PATH decision and ADR-0017, which put
`~/.local/bin` into every shell rc and left the shell running the script to a
sentence at the very end. ADR-0029 narrows decision 6: every rc that exists is
still written to, but what decides whether a file has to be *created* is now
whether the login shell reads one, rather than whether the machine has one at
all — a zsh account with a `.profile` and no `.zshrc` had a rc file and could
not read it. Found by a real run on WSL with Ubuntu, and confirmed
by another on the same machine. ADR-0028 keeps decision 8 and widens the block it
draws: on the closing message the env line now leads the commands it makes
findable, rather than standing in a block of its own above them.
**Sources:** ADR-0009, ADR-0013, ADR-0017, ADR-0021, ADR-0022; a real
`curl … | bash` run on WSL that stopped at step 9; `https://bun.sh/install`

## Context

A run on WSL with Ubuntu stopped at step 9, where the script hands the GitHub
login over. From that point nothing worked until the person ran
`source ~/.bashrc` themselves.

**A rc file is read when a shell starts.** The shell reading this script started
before any of these tools existed, so every rc line `persist_on_path` writes
reaches every terminal except the one somebody is looking at. That much was
known: it is why ADR-0022 has the script name `gh` by its full path at step 9,
and why the closing message says to open a new terminal.

Two things were missing from that.

**The stop at step 9 is the one place a person is asked to work in this
terminal, and it never says how to fix it.** The full-path `gh` runs, and then
they are told to "run this script again" — with no line to copy for that either.
Everything they might reach for next — `prep`, `claude`, `node`, a plain `gh` —
is a name this shell does not carry. The "open a new terminal" sentence is at
the end of a run that ends before it, so the person who most needs it is the one
person who never sees it.

**`~/.bun/bin` was never persisted by this script at all.** `persist_on_path`
was called once, for `~/.local/bin`. The directory holding bun — and prep, which
step 7 links there — was exported for the run and otherwise left to bun's own
installer, which edits a rc only when it can identify the shell. That is another
vendor's judgement about this machine, and ADR-0022 is the record of what taking
one costs. When it goes the other way, a new terminal carries `claude` and not
`prep`.

**And the rc half was written for bash and asked of everybody.** It appended to
`~/.bashrc`, `~/.zshrc` and `~/.profile`, created `~/.profile` where none of the
three stood, and emitted one POSIX block. Three shells fall through that:

- **zsh with no `~/.zshrc`.** zsh reads `.zshenv`, `.zprofile` and `.zshrc`, and
  never `.profile` — so the file created for such a machine is one its own shell
  does not open. A fresh macOS account is in that state, and so is anybody who
  ran `chsh` before writing a rc.
- **bash with a `~/.bash_profile`.** A bash login shell reads the first of
  `.bash_profile`, `.bash_login` and `.profile` that exists and stops there. On a
  machine carrying one, every line written to `.profile` is a line nothing reads.
- **fish.** It reads none of those files, and `export PATH=…` is a syntax error
  in it. Both halves were wrong for fish: the file and the language.

## Decision

**The script hands over a PATH along with every command it hands over.**

1. **The run leaves a file, and hands back the one line that reads it.**
   `write_env_files` writes `~/.local/share/prep/env.sh` and `env.fish`, each
   carrying the same guarded block the rc files get, for both directories.
   `env_line` prints `. <path>/env.sh` — or `source <path>/env.fish` where the
   login shell is fish — at the step 9 stop and at the top of the closing
   message, ahead of every line that names a tool, because each of those is a
   name the shell does not carry yet.

   **A file rather than the export line itself.** The line is long, differs by
   machine, and has to be read before it is trusted. A path is short, is the
   same words everywhere, and can be opened first. It is also the shape rustup,
   nvm and bun's own installers all landed on, for this same reason.

   **`~/.local/share/prep`, not `$PREP_DIR`.** `~/.local/share` is where this
   script already parks what it installs, the Node and gh trees; `$PREP_DIR` is
   a git clone, and a generated file there is an untracked file in a working
   tree. The file is written at step 4, where both directories are settled and
   before any step that can stop and hand it back.
2. **`~/.bun/bin` is persisted by this script.** `persist_on_path` is called for
   it the same way it is for `~/.local/bin`. bun's installer may write a rc line
   as well; the two do not find each other, because bun writes the directory
   through a variable and this writes what it expands to. The guard each block
   carries is what makes a shell reading both put the directory on PATH once.
3. **The step 9 stop names the way back.** The login line is followed by the
   `curl … | bash` that resumes the run, in full. It is the one stop that asks
   for two commands, and quoting only the first of them is half a handover.
4. **Opening a new terminal stays the first thing offered.** It is the shorter
   sentence and it needs no paste. The line is the answer for somebody who is
   already standing in this terminal with work to do in it, which is exactly
   where step 9 leaves them.
5. **The login shell is read once, and both halves are driven off it.**
   `login_shell` takes the name out of `$SHELL`, falling back to the password
   database where a container or a `su` left it unset. It decides which rc a
   machine with none gets — `.zshrc` for zsh, `config.fish` for fish, `.profile`
   and `.bashrc` together for bash, `.profile` for anything else — and it
   decides which env file `env_line` names.
6. **Every rc that is already there is still written to, and the list grows by
   two.** `~/.bash_profile`, so a bash login shell that stops there is not passed
   over, and `~/.config/fish/config.fish`. One person may run bash in one
   terminal and zsh in another, and this run installed the tools for both, so
   the rule stays "every file that exists" rather than "the one file `$SHELL`
   names". `$SHELL` decides only what to create where nothing exists at all.
7. **fish gets fish, everywhere it appears.** `rc_block` picks its syntax off
   the file it is writing into — `if not contains … / set -gx PATH … / end` for
   anything named `.fish`, the `case` form for everything else — so the rc and
   the env file are both written by it, and `env_line` sends a fish shell to
   `env.fish` with the word fish uses to read one.
8. **The instruction is drawn, not printed.** It arrives at the end of a screen
   of install output somebody has just watched scroll by, and it is the one line
   in the run that decides whether the next command they type is found. So it
   sits between two rules, with the command alone in reverse video —
   `announce_env_line`, which ADR-0028 renames `announce_next_action` and gives
   the commands it makes findable. Emphasis is dropped where neither stream is a terminal,
   because escape codes in a log are noise rather than emphasis, and where
   `NO_COLOR` is set, because somebody who set it has already said so. stderr
   counts as well as stdout: the stop at step 9 goes there.
9. **csh and tcsh get the POSIX line and no special case.** They would need a
   third syntax (`setenv`) and a fourth set of rc files, and neither macOS nor
   Debian starts anybody on one. A guess written into a rc file is worse than a
   line somebody has to adapt, so this is written down rather than attempted.

## Rationale

- **A script cannot move the shell that called it.** The environment is copied
  when the shell forks, and no call lets a process write another's. So the only
  way into that terminal is the parent shell running something itself, and the
  whole question is what it should have to run. That is not a defect to route
  around; it is the reason the closing lines are printed rather than run
  (ADR-0013 decision 5 makes the same argument about the Claude Code login).
- **Sourcing the entry point was considered and refused.** `. <(curl … )` runs
  the script in the person's own shell, which would put PATH there directly. It
  also puts `set -Eeuo pipefail`, `trap ERR` and every `exit` in this script
  there: a bootstrap that fails on a network, an apt or a login would close the
  terminal it was run from. Isolating the work in a subshell and eval-ing back
  only the PATH would recover that, and buys one line less to type in exchange
  for an entry point whose failure mode is somebody's shell. The file costs one
  short command and leaves the entry point exactly as it is.
- **The full path was the right fix for one command and does not generalise.**
  ADR-0022 spelled `gh` out because the login is one line. By the time somebody
  wants `prep doctor` or `claude`, writing every command out in full is worse
  than handing over the PATH once.
- **Trusting another installer's rc edit is the mistake this repository has
  already made once.** ADR-0022 found the script taking `command -v` at its word
  about which machine a tool belonged to. This is the same shape: taking bun's
  installer at its word that a rc got written. The script now writes what it
  depends on.
- **`source ~/.bashrc` was not chosen, though it is what the person ran.** It is
  wrong on three counts: it names one rc out of the several the script may have
  written to, on a machine where bun's installer wrote nothing it sources a file
  that never carried `~/.bun/bin` either, and it is the wrong file for anybody
  not running bash. The env file is this script's own, holds exactly what this
  run installed, and has a fish twin where sourcing a POSIX file would fail.
- **The rc list stayed a list, and only the creation rule reads `$SHELL`.**
  Writing to the one file `$SHELL` names would be the tidier rule and it loses
  the person who runs bash in one terminal and zsh in another. A rc that already
  exists is evidence somebody reads it; `$SHELL` is only needed where there is
  no evidence at all.
- **fish earned a branch and csh did not.** fish is a default nowhere but a
  chosen shell in many places, and it fails loudly and immediately on the POSIX
  line — a syntax error at every new terminal. csh is chosen by very few, and
  supporting it half way, with a syntax nobody here runs, would add a file this
  script writes and cannot check.

## Consequences

- A run that stops at step 9 hands back three lines: the login, the way back,
  and the file to read so both work by name in that terminal.
- A finished run says the same thing once, before it names `cd`, `claude`, or a
  second `curl`.
- `~/.local/share/prep/env.sh` and `env.fish` are files this script owns. Every
  run rewrites them whole rather than appending, since each run knows all of
  what belongs in them.
- This script prints escape codes now, where it printed none before. They are
  confined to one function, and the tests hold that a run whose output is not a
  terminal carries none of them.
- `prep` is on PATH in a new terminal whether or not bun's installer identified
  the shell.
- A rc file may carry two blocks for `~/.bun/bin`, one bun's and one this
  script's. A shell reading both puts the directory on PATH once, and the test
  suite holds that.
- A zsh machine with no rc gets a `~/.zshrc` this script created. That file is
  read by every interactive zsh from then on, which is what was wanted and is
  also a file somebody did not ask for. It carries one guarded block and says
  who wrote it.
- A machine running two shells gets the block in both of their files. The guard
  in each keeps that from meaning the directory twice.
- The tests read the written rc back with the shell it was written for, so zsh
  and dash are checked by their own interpreters rather than by a string match.

## Verified

**A real run on the WSL machine that found this.** It is the acceptance test
this record was written against: the same machine, the same Ubuntu, the terminal
that ran the one-liner. The file was there, the line hands that terminal what
the run installed, and the announcement was found rather than scrolled past.
That closes what the earlier version of this record left open.

## Unverified

**fish was run, in a container rather than on a machine that has it.** No fish
is installed where this was written, so the two tests that read a fish file back
with fish stand aside there, and sh, bash, zsh, dash and ksh carry the suite.
Both fish files were executed against fish 3.7.1 by hand: sourcing each put both
directories on PATH, and sourcing each twice left them on once. What that does
not cover is a fish started as a login shell on a real machine, which reads
`config.fish` through its own startup rather than through `source`.
