# ADR-0031: prep writes no permission file

**Date:** 2026-11-13
**Status:** Accepted — supersedes ADR-0003 and ADR-0006, and decisions 1 to 4
of ADR-0007. Narrows ADR-0002: there is no preset left for it to describe, and
what it decided about how prep's tables are produced — static data, no agent at
run time — stands for the one table that remains.
**Sources:** ADR-0002, ADR-0003, ADR-0006, ADR-0007; `docs/codex-permissions.md`;
`claude plugin enable --help`, for the command decision 4 names

## Context

`prep setup` wrote two permission files. `.claude/settings.json` was composed
from a preset — a deny list, an allow list, an ask list and a starting mode,
with the Bash commands a project type's toolchain needs — and merged into a
file that already stood, after a diff and an approval (ADR-0003).
`.codex/config.toml` carried the same deny list in Codex's schema, written by
hand because prep takes no TOML dependency, and never merged (ADR-0007).

Each of those is a claim about somebody else's schema, made by a tool that has
no say in it.

- The settings file is Claude Code's. The rule syntax, the meaning of
  `defaultMode`, the shape of `enabledPlugins` — every one is a thing the vendor
  changes on its own schedule, and prep found out by being wrong.
- The Codex side is two schemas, not one. `docs/codex-permissions.md` exists
  because filesystem access and command approval are separate there, so half the
  preset had no key to land in, and one line in a file prep did not write —
  `sandbox_mode` — turned the whole profile off. The report grew a warning for
  it.
- The preset itself is a judgement that ages. Which commands are routine for a
  node project is true for a year or two. ADR-0006 exists because opening `git`
  by prefix meant arguing, entry by entry, which ends of it to close again.

**What that bought was a file a person could have written in a few minutes, and
then had to keep.** Both harnesses ship their own way to set permissions, both
ask on first use of a command, and a baseline written once by prep is edited by
hand from the second day on. The merge, the conflict prompt, the per-harness
gate and the TOML serialiser — most of `prep setup` — were there to deliver that
file safely.

## Decision

**prep writes no permission file for any harness, and changes no settings file.
What `prep setup` writes is prose: the guidance file, and the line that points
Claude Code at it.**

1. **The preset is gone, with everything built to deliver it.** No deny, allow
   or ask list; no merge, no diff, no approval; no Codex profile. `prep setup`
   produces `AGENTS.md` where no guidance file stands and `CLAUDE.md` where the
   guidance landed in `AGENTS.md`, and nothing else.
2. **`prep setup` asks no question.** The only thing it ever asked about was a
   merge. A run at a terminal and a run reading from a pipe now do the same
   work, the way `prep chef` already did.
3. **The pointer is written whichever harness the machine holds.** The gate that
   decided which files a machine got existed for the permission files. What it
   would still decide is one line of `CLAUDE.md`, and a project is handed to
   more machines than the one it was set up on. Harness presence is still read,
   for one thing: which command the report offers for handing the project over.
4. **A plugin is recommended, never enabled.** Turning an installed plugin on
   was a line prep wrote into the settings file. It is now a command prep shows:
   `claude plugin enable <id> --scope project`, next to the install command it
   already showed for a plugin the machine does not hold. A person runs either
   one (ADR-0010).
5. **The settings file is read, for one key.** `enabledPlugins` is what tells an
   answered plugin from one still to turn on, and without it prep would tell
   somebody to enable a plugin they switched off on purpose. Everything else in
   the file is left unread. A file that is there and is not a JSON object is a
   tool error, as it was. It is opened only where a type was recognised, the
   same condition the install record is opened under.
6. **The type marker stays, and decides one thing.** `package.json` and
   `pyproject.toml` now select which plugin is named. The table lives with the
   plugins, because nothing else reads it.
7. **Recommendations are made whether or not Claude Code is installed.** They
   used to be skipped on a machine with no Claude Code, because there was no
   file to write an entry into. With no file either way, what a project's type
   calls for is worth saying once, to whoever sets the project up.

## Rationale

- **The cost was continuous and the benefit was one-off.** A permission file is
  written once per project and then belongs to whoever edits it. Tracking two
  vendors' schemas is paid on every release of either, and paid in the place
  where being wrong is worst — a file that reads as closed and is not.
- **Both harnesses already answer the question.** Neither runs an unlisted
  command without asking. A baseline moved the first few prompts out of the
  first session; it did not close anything a default left open, except through
  the deny list.
- **The deny list was the part worth keeping, and it could not be kept alone.**
  Closing secrets on read is the one thing here a default does not do. But a
  deny list still needs a file to live in, and a file that already stands needs
  the merge — the whole apparatus comes back for one section.
- **Printing the preset instead of writing it was considered and dropped.**
  Whether the whole preset or the deny list alone, a block prep shows for a
  person to paste is still a statement in the vendor's syntax. It saves the
  merge and keeps the cost this record is about: the schema still has to be
  followed, and a pasted block that no longer parses fails in somebody's
  settings file with prep nowhere near it.
- **A report that only names commands cannot be wrong about a file.** Every
  remaining output is either prose prep owns outright or a command the vendor
  documents. Nothing prep prints depends on the shape of a file it did not
  write, beyond one key it reads and treats as absent when it is not an object.

## Consequences

- `--json` loses the `claude-settings` and `codex-config` artifact kinds, the
  `covered` field on each harness row, and the `approve` next step. Nothing was
  kept for compatibility: the one reader outside the test suite is the bootstrap
  script, and it reads `prep chef --json`, not this.
- Artifact statuses are three: `applied`, `planned`, `skipped`. `merged` and
  `declined` described answers to a question nobody is asked any more.
- A project set up by an earlier prep keeps the files it was given. prep neither
  removes nor updates them; they are that project's settings now.
- A project set up from here on starts at each harness's own defaults. Somebody
  who wants secrets closed on read writes that rule themselves, in the harness's
  own settings.
- `docs/codex-permissions.md` stays as the research it was. Nothing reads it.
- ADR-0013 and ADR-0022 argue that Claude Code is a link in the bootstrap chain
  because nobody else reads the permission files `prep setup` wrote. The
  decision stands and that one sentence has aged: read it as nobody else being
  there to hand the seeded project to. `scripts/CONTEXT.md` says it that way.
- `CONTEXT.md` drops **preset**, **merge** and **per-harness artifact**, and
  rewrites **setup**, **artifact**, **type marker**, **harness**, **pointer**,
  **plugin recommendation** and **next step** around what is left.
- The project's one-line description stops saying "deny by default". That was a
  description of the files prep wrote.
