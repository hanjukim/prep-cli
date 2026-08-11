# ADR-0027: doctor diagnoses the project it is given

**Date:** 2026-08-11
**Status:** Accepted — amends ADR-0010 decision 5 and the scope sentence in
`scripts/CONTEXT.md`
**Sources:** ADR-0009, ADR-0010, ADR-0026

## Context

The boundary this repository has held between its two subcommands is **scope**:
doctor looks at the machine, setup looks at the project. It is written into
ADR-0010 decision 5, which handed `probe.ts` the machine and `setup.ts` the
files, and into `scripts/CONTEXT.md`, which says the script does not move that
scope.

The scenario that breaks it is not exotic. A project set up months ago, on a
machine that has since gone stale — a logout, a tool gone, a guidance document
deleted. Setup is done. What somebody wants is the tool whose job is to say what
is wrong, and nobody reaches for the one whose job is to write files to find out.
That tool is doctor, and until now doctor could not see a project at all.

Two facts decide the shape of the fix.

- `~/.claude/settings.json` exists on nearly every machine running Claude Code,
  and plenty of people keep `~` under git for their dotfiles. Any auto-detection
  rule strong enough to call an empty directory a project also calls the home
  directory one.
- The bootstrap script reads `prep doctor --json` at step 8, before it asks for a
  project at step 9 (ADR-0009). Whatever doctor learns about projects, that call
  must keep answering exactly what it answered before.

## Decision

**The axis is purpose, not scope: doctor diagnoses, setup writes. doctor reads
the project it is given, and never one it was not.**

1. **The project arrives as an argument.** `prep doctor` reads the machine and
   nothing else. `prep doctor <path>` reads the machine and that project. There
   is no fallback to the working directory and no detection rule — the home
   directory trap above is unavoidable otherwise, and `prep setup [path]`
   already has this shape, so a doctor that found its own project would be the
   exception needing explanation.
2. **The path is reported as it was given, not resolved.** `prep setup · <root>`
   already prints whatever it was handed, so a run told `.` is told `.` back by
   both subcommands and `--json` carries the same string in `root` that
   `SetupOutcome.root` carries. Resolving it in one of the two would be the
   surprise; resolving it in both is a separate decision about a shipped
   contract.
3. **The project rows join the pass table rather than forming a second one.**
   The registry holds one ordered table, each row carrying its scope. An empty
   project alternates between the two scopes as somebody walks it, so a table
   split by scope would leave a reader interleaving two lists to work out what
   comes first. `git init` leads, because nothing below it has anywhere to land.
   The machine rows keep the order they had.
4. **`pass` widens from a person's hands to a person's decision.** A browser
   login is the first kind; `git init` is the second. Turning somebody's
   directory into a repository is theirs to choose, not a script's to take, which
   is what puts it on the pass rather than among the gaps the bootstrap script
   closes. **Not the remote** — a repository pushing nowhere is a normal way to
   work, so its absence says nothing worth printing.
5. **The handoff is read once and framed twice.** `checkHandoff(root, fs)` is
   already a pure read — no process, no LLM, root and filesystem in, judgement
   out — so doctor calls the same function setup calls. The rows and their
   wording are shared. What differs is the sentence around them: setup says what
   it has just written and what is still owed, doctor says what this project
   owes. Both are honest, and neither report can drift from the other about a
   status, because there is one reader.
6. **setup does not grow a pass section.** It keeps writing files and reporting
   what it wrote, and it points at doctor (#21). It has done nothing about
   anybody's accounts, so it has no "beside what I just wrote" context for them,
   and a bootstrap run that printed everything would say the same facts three
   times over — once in setup's report, once in the script's ending, once when
   the person runs doctor.
7. **A project row starts nothing.** It reads one path through the same injected
   file system setup writes through. ADR-0026's whitelist is unchanged: what
   widened is which questions the pass runner answers, not what it may run.
8. **Neither half of the project section moves the exit code.** Gaps alone do. A
   directory nobody made a repository is a legitimate state, the same as an
   account nobody opened, and `handoff` already set that precedent.

## Rationale

- **Purpose is the axis the tools are actually reached by.** Somebody with a
  broken machine and a stale project has one question — what is wrong — and one
  of the two subcommands is named after answering it. Scope split the question
  in half and made the answer depend on knowing prep's internals.
- **An argument is the only rule that cannot be wrong.** Detection has to be
  right about a directory nobody described. An argument is a person saying which
  project they mean, and the case it costs nothing on is the case that matters
  most: an empty directory somebody just made, which no marker file identifies.
- **The step 8 contract survives for free.** That call names no path, so the
  project rows are dropped and the two project keys are never emitted. The output
  is byte for byte what it was, which is a property a test holds rather than a
  claim.
- **One reader is the only way two reports agree.** Duplicating the handoff
  judgement would put the same three questions in two places, and the day they
  disagreed nobody could say which was right.

## What is given up

"doctor is about the machine" was a one-line answer to what each subcommand is
for, and it is now two lines: doctor diagnoses either scope, setup writes one.
The compensation is that `prep doctor <path>` needs no explanation at all — it
reports on what you pointed it at.

`--json` grows two conditional keys, `root` and `handoff`, present only where a
project was read. A conditional key is more to describe than a constant one; an
empty `handoff` on every machine-only run would be worse, because it reads as a
project that owes nothing rather than as a project nobody named.

## Consequences

- ADR-0010 decision 5 is amended: `probe.ts` still owns PATH and `setup.ts` still
  owns the file system, but doctor now reads a project through that same
  `setup.ts` boundary. Nothing about "prep starts no process" moves — ADR-0026
  remains the only narrowing, and this adds no entry to its table.
- The scope sentence in `scripts/CONTEXT.md` — "doctor looks at the machine,
  setup looks at the project" — is replaced. What the script still does not do is
  decide: it calls prep and executes what prep reports (ADR-0009).
- `CONTEXT.md`'s **handoff** entry loses its clause pinning it to the end of a
  setup run, **pass** gains its project half, and **setup** and **doctor** each
  say which question they answer.
- The wording of a handoff row moves into `src/report/handoff.ts`, shared by both
  reports. The framing sentence stays with each.
- #24 follows: the bootstrap script's ending stops naming the GitHub login and
  the git identity itself, because doctor now holds both answers plus the project
  it never had.
