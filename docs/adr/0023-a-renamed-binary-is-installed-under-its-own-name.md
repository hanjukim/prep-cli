# ADR-0023: A tool the distribution renames is installed under its own name

**Date:** 2026-08-05
**Status:** Accepted — narrows ADR-0009's third decision, which put the tool
list in the registry, by widening what one entry is allowed to say about a
tool. The per-platform `binary` override it replaces was in the table from the
first registry.
**Sources:** `https://github.com/hanjukim/prep-cli/issues/3`; ADR-0002,
ADR-0009, ADR-0010, ADR-0013, ADR-0017, ADR-0022; `CONTEXT.md` under **check
result**, **gap** and **guidance**; Debian's `bat` and `fd-find` packages,
which ship `batcat` and `fdfind`

## Context

Debian and Ubuntu install `bat` as `batcat` and `fd-find` as `fdfind`, because
both names were taken by packages that were there first. The registry knew
that and drew the wrong conclusion from it: the Linux entry overrode `binary`,
so the check asked for `batcat`, found it, and reported `bat` installed. Nothing
on that machine answered to `bat`.

The report was not wrong about the package. It was wrong about the machine.
`bat` is what a person types, what an alias expands to, and what a script in a
prepared repository calls — so a machine holding the package under another name
is a machine where all of that fails, and doctor was the one place that would
have said so.

**This is the fourth turn of one screw.** ADR-0013 verified an install that
reported success and left nothing usable. ADR-0017 found a check passing while
the dependency under it was missing. ADR-0022 found a check answered by an
executable belonging to another operating system. Each time the check ran, it
passed, and the thing it passed on was not the thing that was needed. Here it is
the name itself.

**The table could not say it.** `PlatformSpec.binary` said what to probe and
nothing more. It had no way to hold two names at once — the one the tool is
called by, and the one this distribution happens to ship — so there was no
sentence in the data for "the package is here and the name is not", and no way
to tell a finished machine from one that still owes a name.

## Decision

**The canonical name is what counts, and the guidance puts it there.**

1. **The check asks for the canonical name on every platform.** `probe.check`
   reads `spec.binary` and nothing else. A machine answering only to `batcat` is
   reported missing, in the human report and in `--json` alike, and the exit code
   follows from that like any other gap.
2. **`PlatformSpec.binary` is replaced by `PlatformSpec.renamed`.** The old
   field said what to probe; the new one records the name this platform's
   package ships the executable under, while the canonical name stays the
   question being asked. Only `bat` and `fd` carry it, both on Linux, and the
   registry tests hold that.
3. **The guidance closes the name as well as the package.** One command:

   ```
   sudo apt install -y <package> && mkdir -p ~/.local/bin && \
     ln -sf "$(command -v <shipped>)" ~/.local/bin/<canonical>
   ```

   It runs unattended, which is what the bootstrap's gap step needs — `-y`
   answers apt (ADR-0009), and nothing else in it asks anything. It says the
   same thing twice: apt reports an installed package and stops, `mkdir -p`
   accepts a directory that is there, and `ln -sf` replaces the link.
4. **The name lands in `~/.local/bin`.** The bootstrap script exports that
   directory at step 4, before the gap step runs, and `persist_on_path` writes it
   into every shell rc — so the terminal opened after the run carries the name
   too (ADR-0013, ADR-0017).
5. **Both entries come from one function.** `renamedOnDebian(package, shipped,
   canonical)` composes the platform entry, so the second tool is a row in the
   table rather than a second special case. The command is still static data,
   decided in this repository and read back as it stands (ADR-0002).
6. **prep creates nothing.** It names the command; the gap step of the bootstrap
   script runs it, the same as every other gap (ADR-0010). `sudo` inside a
   command doctor prints is unchanged from every other Linux line in the table.

## Rationale

- **A name is not a detail of the package, it is what the machine is for.** The
  registry answers what a machine should hold, and everything downstream of it —
  a person, an alias, a repository's own scripts — reaches the tool by name. A
  status that ignores the name answers a question nobody asked.
- **Two names in the table beats a branch in the code.** The alternative was to
  probe both names and decide between them somewhere in `probe.ts`. That puts a
  distribution's packaging history into the one module that reads the system,
  and it grows a case per tool. `renamed` keeps it where the other per-platform
  facts already are.
- **Why `~/.local/bin` and not `/usr/local/bin`.** The second is on every PATH
  by default and needs root to write to, and the command is already running
  `sudo` one clause earlier, so it was available. It was not taken: `~/.local/bin`
  is where this chain already puts Node, gh and Claude Code, it is the directory
  the script exports and persists, and a symlink for a convenience tool is not
  worth putting outside the home with root. What that costs is in the
  consequences below.
- **`command -v` rather than a fixed path.** Where apt puts an executable is
  apt's business. Reading it back also means the link points at what was just
  installed, on whatever release this is.
- **It reads correctly on a machine that is already finished.** A machine where
  `bat` runs is installed and gets no command at all, so a second bootstrap does
  nothing and says nothing — which is the same standard every other guarded step
  in the script holds to (ADR-0022).

## Consequences

- On Debian and Ubuntu, `prep doctor` now reports `bat` and `fd` as gaps on
  machines it used to report as equipped. That is the point, and it is a change
  in what those machines are told about themselves, not in what they hold.
- A bootstrap run on such a machine closes both gaps: apt reports the package as
  already installed, and the link is what the run actually adds.
- Somebody who pastes the command by hand on a machine that never ran the
  bootstrap gets the link and may not have `~/.local/bin` on PATH, so the name
  still does not resolve and the next `prep doctor` reports the same gap. The
  report is right both times, and the fix is the same line the bootstrap already
  writes into a shell rc. Left as it stands rather than folding a PATH edit into
  an install command.
- macOS is untouched. brew installs both under their own names, so nothing about
  a renamed binary is reported or run there, and the registry tests hold that no
  darwin entry carries `renamed`.
- `CONTEXT.md` gains **renamed binary**, beside **check result** and **gap**.
