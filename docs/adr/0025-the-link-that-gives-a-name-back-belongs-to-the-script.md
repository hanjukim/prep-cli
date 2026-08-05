# ADR-0025: The link that gives a name back belongs to the script

**Date:** 2026-08-06
**Status:** Accepted. It narrows ADR-0023, whose decisions 3 and 5 put the link
inside the install command and composed both entries from one function; what
that record settled — the canonical name is what the check asks for, and the
name is half of what a finished machine holds — is unchanged and is what this
record carries out.
**Sources:** `https://github.com/hanjukim/prep-cli/issues/14`; ADR-0002,
ADR-0009, ADR-0010, ADR-0017, ADR-0023; `CONTEXT.md` under **renamed binary**
and **guidance**; `scripts/CONTEXT.md` under **A link stops the run, a gap does
not**

## Context

ADR-0023 closed the name and the package in one string:

```
sudo apt install -y bat && batcat="$(command -v batcat)" && \
  mkdir -p ~/.local/bin && ln -sf "$batcat" ~/.local/bin/bat
```

It is correct and it runs. What was wrong is where it lived. Four things
happened in one value whose contract says it is an install command:

- **`prep doctor` prints that value to a person.** Guidance is a verified
  command somebody is meant to be able to paste (ADR-0010, level 2), and pasting
  this one leaves `batcat` set in their shell.
- **Every renamed tool repeated the whole chain.** `renamedOnDebian` kept the
  repetition to one function, but the function existed to hide a repetition
  rather than to say anything the table had not already said: `renamed` carries
  the shipped name one line above.
- **The link was a side effect of installing.** A machine that holds the package
  and lost the link got it back only by running apt again.
- **The table named a directory that is the script's.** `~/.local/bin` is
  exported and persisted by `scripts/bootstrap.sh`, so static data (ADR-0002)
  had to know what the script does with names, and a change to where the script
  puts them would have been a change to the registry.

The bootstrap script already does this work in one place for everything it
unpacks itself: `install_tarball` lays a tarball down under `~/.local/share` and
links every binary into `~/.local/bin` (ADR-0017). Node, gh and Claude Code get
their names that way. The tools apt installs were the only ones that did not
pass through it.

## Decision

**The registry says which name a platform ships the executable under, and one
step of the script turns that into a name that answers.**

1. **A renamed tool's guidance is the install command for its package.** `sudo
   apt install -y bat`, and nothing about a link. It is the same line every
   other Linux entry carries, and it is a line a person can paste (ADR-0010).
   `renamedOnDebian` goes with it: with the link gone, both entries are ordinary
   table rows.
2. **The `--json` contract carries the shipped name.** `CheckResult.renamed`,
   emitted as `renamed` on every entry and null on almost all of them. It is
   what lets a reader outside prep pair the name a machine owes with the name
   its package used, without a table of the two names of its own. It says
   nothing about `status`: the canonical name is what was asked for, and what
   was asked for is what the status answers (ADR-0023 decision 1).
3. **One place in the script makes every link.** `link_renamed` reads pairs on
   stdin and writes into `~/.local/bin`, which is the directory `install_tarball`
   already links into. `scripts/links.ts` turns a report into those pairs, the
   way `scripts/gaps.ts` turns one into commands — prep decides, the script
   executes (ADR-0009).
4. **The step runs after the installs, off the report taken before them.** The
   two names are a fact about the platform and not about this machine, so there
   is no second `prep doctor` run. What the installs change is whether the
   shipped name resolves, and that is asked at the moment the link is made.
5. **A name that already answers is left alone.** `link_renamed` asks the
   script's own `have` before writing, so a `fd` built from source, taken from
   cargo or from a backport keeps what somebody chose — and a link an earlier run
   made answers there too, which is what makes a second run write nothing.
6. **A shipped name that resolves to nothing produces no link.** `ln -sf ""
   <target>` was verified to exit 0 and leave a symlink pointing at nothing,
   which is the machine that reports itself finished and runs neither name. The
   name is collected and printed at the end instead, beside the gaps that would
   not close — apart from them, because a gap is closed by pasting the command
   printed with it and this one has no such line.

## Rationale

- **Guidance is read by two audiences and one contract.** A person pastes it and
  the gap step runs it. A value that is a command for one of them and a
  four-clause chain for the other is one contract carrying two, and the person is
  the audience that cannot read the source to find out which.
- **The registry is what a machine should hold, not how this script builds
  one.** `~/.local/bin` is a fact about `scripts/bootstrap.sh`. Static data that
  names it is data that has to be edited when the script changes its mind
  (ADR-0002).
- **One link step is what already existed.** ADR-0017 put the tarball's links in
  `install_tarball`; this puts the package manager's in `link_renamed`. A third
  tool renamed one day is a row in the table, and neither file learns its name.
- **Why the pair and not the path.** The report is taken before the installs, so
  a path in it would answer for the machine as it stood beforehand. The shipped
  name is stable, and resolving it in the shell is also what keeps one definition
  of what counts as installed — `have` knows what to make of a WSL answer
  (ADR-0022), and a lookup in prep would not.
- **Reporting a link that would not be made, rather than skipping it.** The
  failure this whole step exists to close is the silent one: a machine that
  reports itself finished and runs neither name.

## Consequences

- `prep doctor` prints `sudo apt install -y bat` where it used to print the
  chain. A person pasting it installs the package and gets no name, and the next
  `prep doctor` says so — the bootstrap script is what closes the second half,
  which is the same shape ADR-0023 already left this in for somebody who never
  ran the script.
- The `--json` contract gains a key. Its readers are `scripts/gaps.ts` and
  `scripts/links.ts`, both in this repository, and both read only the fields they
  name.
- macOS is unchanged. No darwin entry carries `renamed`, so the reader emits
  nothing and the link step does not run.
- A machine that ran an earlier bootstrap has its links already, made by the old
  command; `link_renamed` finds the names answering and writes nothing.
- `CONTEXT.md` amends **renamed binary**, and `scripts/CONTEXT.md` gains the
  paragraph for the step that makes the link.
