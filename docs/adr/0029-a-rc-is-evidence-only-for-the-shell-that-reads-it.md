# ADR-0029: A rc file is evidence only for the shell that reads it

**Date:** 2026-08-11
**Status:** Accepted — narrows ADR-0024 decision 6. What that record decided
stands: every rc file that already exists is written to, because one person runs
bash in one terminal and zsh in another. What changes is the question that
decides whether a file has to be created — "does this machine have a rc" becomes
"does the shell this person logs into have one".
**Sources:** ADR-0013, ADR-0024; a run on a bare `macos-tahoe-vanilla:26.6.1`
VM with `touch ~/.profile` before it, on 2026-08-11

## Context

ADR-0024 decision 6 settled two rules at once, and only the first of them
survives contact with a Mac.

The first: every rc file that exists is written to. That is right and it is not
in question here.

The second: `$SHELL` decides what to create where nothing exists at all. Its
argument was that "a rc that already exists is evidence somebody reads it", and
the evidence is weaker than it reads. A rc file is evidence that *some* shell
reads *that file*. It says nothing about the shell this person logs into.

The gap is not exotic. An account whose login shell is zsh, carrying a
`.profile` and no `.zshrc`, has a rc file — so `create_default_rc` never fired —
and zsh reads neither `.profile` nor `.bashrc`. The run installed bun, Claude
Code and prep, wrote their directories into `.profile`, and every terminal that
person opened afterwards carried none of them. The one function written for
exactly this case sat behind a guard that could not reach it.

Neither VM image showed it, each for its own reason. The vanilla image has no rc
at all, so the old guard fired correctly. The CI image's `.profile` is a symlink
to `.zprofile`, which a zsh login shell does read, so the lines landed somewhere
workable by accident.

`chsh` produces the same state on any platform, and so does a dotfiles
repository that carries `.profile` and leaves `.zshrc` to the machine.

## Decision

1. **The creation guard asks about the login shell, not about the machine.**
   `shell_rc_candidates` names the files that shell reads, of the ones this
   script writes into — `.zshrc` for zsh, `config.fish` for fish, `.bashrc`,
   `.bash_profile` and `.profile` for bash, `.profile` for anything else. Where
   none of those exists, `create_default_rc` runs as before.

2. **The appending rule is untouched.** `rc_candidates` stays the wider list and
   every file on it that exists is still written to. ADR-0024's argument for
   that holds in full: the person who runs bash in one terminal and zsh in
   another installed these tools for both.

3. **`.zprofile` joins neither list.** zsh reads it, and this script does not
   write to it, so its being there says nothing about where this run's lines
   went. Adding it to the write list would put the same block in two files zsh
   reads, on every Mac, to fix nothing.

4. **The password database is read where the platform has one.** `login_shell`
   falls back to `getent` on Linux and to `dscl` on macOS, which keeps the
   record in Directory Services and carries no `getent` at all. A machine
   answering neither is still treated as POSIX.

## Rationale

- **The narrower question is the one the code always meant to ask.**
  `create_default_rc` was written to pick a file by shell; the guard in front of
  it asked a different question, and the mismatch is the bug. Nothing is added
  here that ADR-0024 did not already intend.

- **The wider list stays wider on purpose.** Writing only to the file `$SHELL`
  names would collapse both questions into one and lose the two-shell person,
  which is what ADR-0024 decided against and still decides against.

- **A created file is cheap and a missing one is not.** Creating `.zshrc` on a
  machine that has `.profile` costs a file with two guarded blocks in it.
  Failing to create it costs a person every tool the run installed, silently,
  with the run reporting success.

## Consequences

A macOS account with a `.profile` and no `.zshrc` now gets a `.zshrc`. On the
same account, `.profile` is still written to as well, so a bash terminal there
is unaffected.

`login_shell` now calls `have`, so any harness that lifts it out of the script
has to lift `have` with it — a missing name is `command not found` on stderr and
an empty answer to the caller, which passes quietly. The test harness had that
fault and it is fixed in the same commit.

## Verified

**A bare `macos-tahoe-vanilla:26.6.1` VM, seeded with `touch ~/.profile`.** The
run created `.zshrc` and wrote both files:

    Put /Users/admin/.bun/bin on PATH in /Users/admin/.zshrc, /Users/admin/.profile.

A `zsh -lic` afterwards — the shell Terminal.app starts — carried all seven
tools: brew, git, node, gh, bun, claude, prep. Before this change the same
machine put them in `.profile` alone, where zsh never looks.

`getent` is absent on that machine and `dscl` answers `zsh` for an account whose
`$SHELL` is unset, which is the fallback in decision 4 running for the first
time on the platform that needs it.
