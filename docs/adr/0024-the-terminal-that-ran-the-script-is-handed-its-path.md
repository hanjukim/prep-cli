# ADR-0024: The terminal that ran the script is handed its PATH

**Date:** 2026-08-06
**Status:** Accepted — extends ADR-0013's PATH decision and ADR-0017, which put
`~/.local/bin` into every shell rc and left the shell running the script to a
sentence at the very end. Found by a real run on WSL with Ubuntu.
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

1. **One line names both directories, and it is printed wherever the run ends.**
   `path_line` writes `export PATH="<~/.local/bin>:<~/.bun/bin>:$PATH"`, with
   the paths spelled out rather than left as `$HOME`, since it is pasted into a
   shell that may be neither bash nor the one that ran the script. It is printed
   at the step 9 stop and at the top of the closing message — ahead of every
   line that names a tool, because each of those is a name the shell does not
   carry yet.
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
   decides the syntax `path_line` prints.
6. **Every rc that is already there is still written to, and the list grows by
   two.** `~/.bash_profile`, so a bash login shell that stops there is not passed
   over, and `~/.config/fish/config.fish`. One person may run bash in one
   terminal and zsh in another, and this run installed the tools for both, so
   the rule stays "every file that exists" rather than "the one file `$SHELL`
   names". `$SHELL` decides only what to create where nothing exists at all.
7. **fish gets fish, everywhere it appears.** `rc_block` picks its syntax off
   the file it is writing into — `if not contains … / set -gx PATH … / end` for
   `config.fish`, the `case` form for everything else — and `path_line` prints
   `set -gx PATH …` when the login shell is fish.
8. **csh and tcsh get the POSIX line and no special case.** They would need a
   third syntax (`setenv`) and a fourth set of rc files, and neither macOS nor
   Debian starts anybody on one. A guess written into a rc file is worse than a
   line somebody has to adapt, so this is written down rather than attempted.

## Rationale

- **A script cannot move the shell that called it.** That is not a defect to
  route around; it is the reason the closing lines are printed rather than run
  (ADR-0013 decision 5 makes the same argument about the Claude Code login).
  What can be fixed is whether the person is told, and where.
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
  shorter, and it is wrong on three counts: it names one rc out of the several
  the script may have written to, on a machine where bun's installer wrote
  nothing it sources a file that never carried `~/.bun/bin` either, and it is
  the wrong file for anybody not running bash. The `export` line says what it
  does, and where it would be wrong — fish — the shell gets its own.
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
  and the PATH that makes both plain names work in that terminal.
- A finished run says the same thing once, before it names `cd`, `claude`, or a
  second `curl`.
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

## Unverified

**The fix has not been through a real WSL run.** The messages were rendered and
read, the functions are tested against a HOME of their own, and the rc that bun
writes was reproduced from its published installer rather than observed on the
machine that failed. A run on WSL with Ubuntu, stopping at step 9 and carrying
on from that terminal, is the acceptance test.

**fish was written from its documentation, not run.** No fish is installed on
the machine this was written on, so the test that reads `config.fish` back with
fish stands aside there; zsh and dash do run. The block and the pasted line are
both plain fish — `if not contains`, `set -gx PATH` — but nothing has executed
them. Installing fish on a machine with one is the check.
