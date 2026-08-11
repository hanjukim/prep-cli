# ADR-0026: doctor asks fixed read-only questions

**Date:** 2026-08-06
**Status:** Accepted — narrows ADR-0010. **The subcommand this record calls
`doctor` is named `chef`, and `prep doctor` no longer runs** (ADR-0029). What is
decided below is untouched; read every `doctor` here as `chef`. The **pass** this
record introduced is what made the rename worth making.
**Sources:** ADR-0010, ADR-0021, ADR-0022

## Context

Nothing in prep knows whether this machine has a GitHub login, a git identity,
or a harness login. The bootstrap script asks `gh auth status` itself and names
the login on its own endings, so the one actor that was supposed to decide —
prep — does not hold the decision. "prep decides and the script executes"
(ADR-0009) holds everywhere but here.

These are things prep can read as absent but must not close: a browser login, a
name and email somebody has to choose. The glossary names them **pass** items,
against **gap** — the two divide on who may close them, the script for a gap
and the person for a pass item, or nobody.

ADR-0010 says "prep starts no process on any path". Answering these questions
without a process means reading files, and no file answers them honestly:

- `~/.config/gh/hosts.yml` holds a plaintext token on a machine without a
  keyring. prep's own presets deny a harness that path; prep reading it itself
  would be the tool selling deny-by-default doing what it denies.
- `~/.gitconfig` alone is wrong. XDG paths, `include` directives, system config
  and repo-local settings all move the answer, and reimplementing git's
  resolution is a second implementation that drifts.
- A harness keeps its credentials wherever its vendor decided, and the location
  is not a contract.

`gh auth status` and `git config --get` read no secret, change nothing, and
answer correctly, because each is the owning tool answering for itself.

## Decision

**doctor may start the fixed read-only checks the registry lists, and nothing
else.**

1. **A whitelist in the registry, beside the items.** Each check is a fixed
   argv — no shell, no argument built at run time. The table is the whole
   surface: no entry, no process.
2. **One module spawns.** `pass.ts` owns the boundary, the way `probe.ts` owns
   PATH reads. The guard test that held "no source file starts a process" now
   holds "no source file but `pass.ts` does".
3. **The output is discarded at the spawn.** The checks answer with their exit
   codes; stdout and stderr are never opened. `gh auth status` prints an
   account name and `claude auth status` an email — neither exists in prep as
   data, so no account identifier can reach the report or `--json`.
4. **A ceiling of 5 seconds per check**, because `gh auth status` validates the
   token over the network and offline it waits. A check cut off, or one whose
   binary is not here, reads `unknown` and names its own command.
5. **Nothing that changes the machine.** ADR-0010's `sudo` argument and its
   "one actor executes" argument stand untouched: the script is still the only
   thing that changes anything, and a pass item is closed by a person or not at
   all.

## Rationale

- **The alternative is worse on ADR-0010's own grounds.** That decision exists
  to keep prep's story short and verifiable. Reading token files would trade
  "starts these four fixed questions" for "reads credentials", which is the
  longer story and the wrong one.
- **The owning tool is the only honest oracle.** Every file-based answer is a
  reimplementation of some tool's resolution rules, wrong the day those rules
  move. Exit codes are the interface those tools maintain.
- **The boundary stays testable.** The checks arrive through `RunDeps` the way
  `which` does, so the pass logic tests through fakes; only the spawn
  boundary's own tests start a process, none of it a real `gh`, `claude` or
  `codex`, and the one file allowed to spawn is named by a test.

## What is given up

"prep starts no process at all" was a one-sentence guarantee. It becomes
"prep starts these fixed read-only questions", which needs the table to be
read to be believed. The table is short, in one file, and covered by tests
that hold every entry to fixed plain-word argv that never ends in `login`.

## Consequences

- ADR-0010 is narrowed, not superseded: every path through doctor is still a
  read, and setup still starts nothing. Its supersession of ADR-0004 is
  unaffected — ADR-0004 had doctor *install* things, and nothing here revives
  that.
- `--json` gains a top-level `pass` key. `scripts/gaps.ts` does not read it, so
  the bootstrap script runs unchanged, and a pass item's guidance can never
  leak into the commands the script runs.
- A pass item does not move the exit code. An account nobody has opened is a
  legitimate state that can last for years; gaps still exit 1.
- The bootstrap's own `prep doctor --json` call at step 8 stays safe on a fresh
  machine: it runs before the GitHub login of step 9, and with no token `gh`
  fails without touching the network.
