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
  shorter, and it is wrong on two counts: it names one rc out of the several the
  script may have written to, and on a machine where bun's installer wrote
  nothing it sources a file that never carried `~/.bun/bin` either. The export
  line says what it does and does not depend on which shell is reading it.

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

## Unverified

**The fix has not been through a real WSL run.** The messages were rendered and
read, the functions are tested against a HOME of their own, and the rc that bun
writes was reproduced from its published installer rather than observed on the
machine that failed. A run on WSL with Ubuntu, stopping at step 9 and carrying
on from that terminal, is the acceptance test.
