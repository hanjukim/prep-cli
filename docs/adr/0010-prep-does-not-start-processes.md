# ADR-0010: prep does not start processes

**Date:** 2026-08-01
**Status:** Accepted — supersedes ADR-0004. Narrowed by ADR-0026: doctor may
start the fixed read-only checks the registry lists.
**Sources:** ADR-0009

## Context

ADR-0004 had doctor ask about a missing harness and install it. The reason was
that a harness gap was a different kind of gap:

> The two harnesses are different. claude-code and codex sit outside the package
> managers, so their guidance is `manual` and what the report gives is not a
> command but a documentation URL. A person opens a browser, finds the section
> for their platform, and copies out what it says.

For a standard tool the gap line is already `brew install fd` — paste it and you
are done. Only the harnesses sent a person to a browser. That looked like the
place for prep to reach further.

**That premise collapsed twice.**

First, the harnesses do not sit outside the package managers. Checking the
vendor documentation shows both ship as global packages and install with one
command (ADR-0011). Update the registry and a harness gap line takes the same
shape as a standard tool's — one command, paste it and you are done.

Second, ADR-0009 made a bootstrap script the entry point. That script reads
`prep doctor --json` and closes the gaps. There is already one actor that
changes the machine, and doctor's install feature became the place where the
same job is done a second time.

## Decision

**ADR-0004 is superseded. doctor goes back to read-only, and prep starts no
process on any path.**

1. **doctor reads, decides, and reports.** For each gap it yields a command or a
   documentation link, and runs nothing.
2. **The execution boundary is removed.** `install.ts` and its test are gone.
   `installable()` and `commandsHidden()` are gone from `gaps.ts` — both existed
   to pick which install suggestions to show.
3. **The report does not sort by tier.** A gap that has a command yields the
   command; `manual` guidance yields documentation. Harnesses and standard tools
   ride the same rule.
4. **The `--json` contract is unchanged.** It yields gaps and guidance as
   before. The bootstrap script reads it.
5. **Three boundaries remain.** `probe.ts` owns reading the machine, `setup.ts`
   owns files, `prompt.ts` owns terminal input. `prompt.ts` is used only for
   merge approval (ADR-0003).

## Rationale

- **The problem ADR-0004 solved is gone.** That decision came out of an
  asymmetry in which only harnesses could not have a command. Remove the
  asymmetry and the decision loses its grounds. One registry update stands in
  for 126 lines of code and a boundary.
- **One actor executes.** The script changes the machine, prep decides. When two
  actors do the same job, a day comes when they disagree, and on that day nobody
  can tell which one left the machine in that state.
- **The whole `sudo` argument disappears.** ADR-0004 left standard tools out
  because the Linux guidance is all `sudo apt install ...`, and a tool that
  closes secrets with `deny` cannot ask for root in the same run. If prep runs
  nothing, the question does not arise. A shell script running `sudo` is
  ordinary.
- **One boundary fewer is one surface fewer to defend.** A tool selling
  deny-by-default that starts no process at all is a short story and an easy one
  to verify. There is less to explain than in "it starts only approved static
  commands, without a shell".
- **The platform asymmetry disappears.** ADR-0004 offered installs on macOS and
  not on Linux. That ADR itself worried about one command becoming a different
  thing per platform. Read-only is the same everywhere.

## Consequences

- **`prep doctor` changes nothing again.** "doctor only reads", which ADR-0004
  declared finished, comes back.
- Exit codes get simpler. 1 if gaps remain, 0 if none. The rule about re-reading
  the machine after execution (ADR-0004 decision 7) goes, because there is no
  execution.
- The report footer can say again that prep does not install. Only now pointing
  at the bootstrap script is the more useful thing to say.
- Somebody setting up a machine by hand pastes the commands. Harnesses are
  commands now too, so there is no trip to a browser.
- ADR-0002 stands. What to install and with which command is still the static
  table in `registry.ts`. All that changes is who runs those strings.
- ADR-0003 stands. Merge approval is about a file and has nothing to do with
  processes.
