# ADR-0023: A renamed executable is linked back to its name

**Date:** 2026-08-05
**Status:** Accepted — extends ADR-0017, which linked what the script unpacks
into `~/.local/bin` but left what a package manager installs where it landed.
Found on a machine the bootstrap script had already run to the end.
**Sources:** ADR-0009, ADR-0013, ADR-0017, ADR-0022; `src/registry.ts`;
Debian's `fd-find` and `bat` packages

## Context

The script finished. `prep doctor` reported `fd` and `bat` installed. Neither
name answered:

```
$ fd --version
bash: fd: command not found
$ command -v fdfind
/usr/bin/fdfind
```

Debian family renames both executables. `fd-find` installs `fdfind`, and `bat`
installs `batcat` because an unrelated `bat` already sits in the archive. The
registry records the second name per platform (`src/registry.ts`), which is why
doctor finds them and says so — it looked up `fdfind`, and `fdfind` is there.

Doctor is not wrong. The gap is that **the name doctor looked up is not the name
anything calls.** Every agent, every alias, every README line and every skill
that reaches for a fast file search reaches for `fd`. On a machine where only
`fdfind` answers, all of them fail, and the report says the tool is here.

Node and gh do not have this problem, and the reason is instructive: the script
unpacks them itself and links every binary into `~/.local/bin` (ADR-0017). The
link is the last line of `install_tarball`. Nothing does the equivalent for the
tools step 8 hands to `apt`, because until now nothing needed to — a package
manager puts an executable on PATH under its own name, and the two cases where
that name is not the tool's own were carried as data in the registry and never
acted on.

## Decision

**Where a platform renames an executable, the script links the name back.**

1. **The pairing comes from the registry, not from a list of its own.** A tool
   whose platform entry overrides `binary` is a tool that arrives renamed, and
   the two names are already sitting side by side there. `scripts/links.ts`
   reads a `prep doctor --json` report and names every installed tool in that
   state as a pair: the name it should answer to, and the path it is really at.
   A third tool renamed one day needs nothing declared.
2. **The shell makes the link.** `links.ts` writes no command and touches no
   file. Where a link goes — `~/.local/bin`, the one directory this script puts
   on PATH itself — and how it is made is the script's ground, the same as it is
   for the tarballs. This is ADR-0009's split held to: prep decides, the script
   executes.
3. **A name that already answers is left alone.** The script asks its own `have`
   before linking, so a machine holding the real tool under its real name — built
   from source, installed from cargo, taken from a backport — keeps what somebody
   chose. A link an earlier run made answers here too, so running again writes
   nothing.
4. **The report is read a second time.** Step 8's first report was taken before
   it installed anything, and a link needs the path the install has just put on
   disk.
5. **A link that will not be made does not end the run.** It is convenience, the
   same as the gaps it follows, so an empty report is skipped and a reader that
   refused one prints a line and the run goes on to the project. This is the
   rule `CONTEXT.md` already carries — a link in the chain stops the run, a gap
   does not — and the word "link" here is the filesystem's, not the chain's.

## Rationale

- **Doctor is not what changes.** Reporting `fd` as missing on a machine that
  holds `fdfind` would be false, and reporting it installed under another name
  is what the registry already models. The gap is between the report and the
  machine, and closing it is an action — which is the bootstrap script's job,
  not doctor's (ADR-0010: prep does not change the machine).
- **An alias is the wrong shape.** A shell alias would live in one rc, apply to
  interactive shells, and be invisible to anything that spawns a process — which
  is most of what calls these tools. A symlink on PATH answers for all of them.
- **`~/.local/bin` is where the script's links already live.** No sudo, no
  `/usr/local/bin`, nothing outside the home directory; the same directory Node
  and gh land in, and one `persist_on_path` already writes into every rc.
- **Not linking is worse than linking wrongly.** The failure without a link is
  silent: doctor is green and the tool is absent. Decision 3 makes the wrong
  link nearly unreachable, since the only way to overwrite something is for the
  name to answer nothing at all first.

## Consequences

- On Debian family, `fd` and `bat` answer after a bootstrap run, pointing at
  `/usr/bin/fdfind` and `/usr/bin/batcat`.
- On macOS nothing is linked, because brew renames neither. The step prints
  nothing and costs one doctor run.
- A machine that already went through the bootstrap gets its links on the next
  run of the script, which is the ordinary way this repository ships a fix to a
  machine (ADR-0009: the entry point is one line a person can be handed).
- `link_renamed` is a shell function rather than an inline block, so it is
  tested the way `persist_on_path` and `have` are: lifted out of the script by
  name and run against a HOME of its own.

## Unverified

**Only the two tools this repository knows about were checked.** The rename
rule is derived from the registry, so anything added there gets the same
treatment — but no other Debian package in the standard list was read to see
whether it renames something quietly. `eza`, `fzf`, `zoxide` and `ripgrep` were
taken at their word.
