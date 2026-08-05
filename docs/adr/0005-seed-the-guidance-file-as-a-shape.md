# ADR-0005: prep seeds the guidance file as a shape only

**Date:** 2026-08-01
**Status:** Accepted — decisions 1 and 2 are superseded by ADR-0008 (the seed
fills the Language section, and the check result goes to `ready`). 3, 4 and 5
stand.
**Sources:** `feat/seed-agents-md`, and "prep does not create these three" in
the handoff section of CONTEXT.md

## Context

The handoff check reads the three things left on the harness's side and decides
a status for each — the Language section of the guidance file,
`docs/agents/issue-tracker.md`, and `docs/agents/domain.md`. CONTEXT.md drew a
boundary here: prep does not create these three, it reads them and points at
them.

For the guidance file that boundary walks a person into a dead end. In an empty
project the report says "no CLAUDE.md and no AGENTS.md", and the person is told
to run `/setup-matt-pocock-skills`. That command writes a Language section into
the guidance file — and there is no file to write into. Creating the file first
is left to the person, named neither by the guidance nor by the report.

The other two are different. For `issue-tracker.md`, which tracker the project
uses *is* the content; `domain.md` is boilerplate the harness copies in whole.
Neither gains anything from an empty shell placed in advance.

## Decision

**prep writes `AGENTS.md` only when there is no guidance file at all. The
contents are a title and a heading; the section itself is left empty.**

1. **It writes a shape only.** The seed is a title, one paragraph on why the
   file exists, and a `## Language` heading. There is nothing inside the
   section.
2. **The check result stays as it was.** In a seeded project the language item
   moves from `missing` to `empty` and no further — not to `ready`. It still
   counts as owed, and the tail of the report still points at
   `/setup-matt-pocock-skills`.
3. **If either file exists, prep does not touch it.** Whether it is `CLAUDE.md`
   or `AGENTS.md`, an existing file gets named as a pointer and the run ends as
   `skipped`. Even an empty one does not get filled in.
4. **It does not ask.** Writing a file that did not exist takes nothing away
   from anybody. This is not a place where merge approval (ADR-0003) applies.
5. **The handoff check reads after every artifact has been produced.**
   Reporting a file just written as `missing` would leave a gap prep had already
   closed on the screen.

## Rationale

- What the boundary was protecting is "prep does not answer on a person's
  behalf", not "prep does not create files". Which language this project is
  written in is the harness's to answer, and the seed only makes the place to
  write that answer down. Leaving the `carries` check result at `empty` is what
  forces that distinction in the code.
- The seed's prose sits outside the section for the same reason. One line
  inside the section makes `hasProse` true, and a question nobody answered gets
  reported as answered.
- Why `AGENTS.md` was chosen: of the two candidates it is the harness-neutral
  one. `CLAUDE.md` carries the name of a single harness, and there are two
  supported harnesses, Claude Code and Codex.
- Why a second file is not created when one exists: a project has one guidance
  file. Which of the two wins is not prep's to settle, and the handoff check
  already reads them in a fixed order.

## Consequences

- The handoff section of CONTEXT.md gains one exception. prep creates the
  **place** for one of the three, and creates the **content** of none of them.
- With two artifacts, `Artifact` became a real union. The two kinds of report
  and the approval paths split on kind. The JSON contract became a union by kind
  too, and consumers find things by `kind` rather than by position.
- The exit code rule (CONTEXT.md) applies unchanged. Even with nobody there to
  approve a settings merge, a run that wrote the seed exits 0. It did part of
  what it came to do, and what it could not do is in the report.
