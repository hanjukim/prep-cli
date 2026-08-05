# ADR-0014: A public tracker is written in English

**Date:** 2026-08-01
**Status:** Accepted — narrows decision 2 of ADR-0012. Prompts stay in the
reader's language; the issue tracker leaves that side. Decision 6 and the
`src/seed.ts` line in Consequences were superseded by ADR-0016: the seed now
carries this repository's rule word for word. The move itself has not landed —
the issues still live on the retired tracker, and `docs/agents/issue-tracker.md`
carries the number mapping when they do.
**Sources:** #62, ADR-0012

## Context

ADR-0012 drew the language line by audience: pick the language of the people
who read the thing. It then made one measurement — this repository is going
public, so the set of people who open a design document is not countable — and
followed the principle to English for code, git metadata, console output, and
the design documents this repository keeps.

Its decision 2 kept two places on the human side, and named the reason for each.
A prompt has exactly one reader. Issues live on this project's own Gitea
instance, and the only people who open that instance are the people working
here. Both readerships could be counted, so the principle pointed at the
reader's language, and both stayed Korean.

**The tracker moves to a public GitHub repository.** The half of decision 2
that rested on a countable readership stops being true the moment it lands.
A public tracker is read by whoever finds the project: someone weighing whether
to install the tool, someone who hit the same bug, someone who solved the same
problem differently. We do not know their language. That is the same
measurement ADR-0012 already made about the design documents, arriving one
ticket later at the surface next door.

The principle is not in question. One of the two facts it read has changed, and
the answer for that fact moves with it.

## Decision

**Issue tracker text is written in English. Prompts stay in the reader's
language.**

1. **Decision 2 of ADR-0012 keeps only prompts.** A prompt still has one
   reader, and that reader is still known, so the principle still points at
   their language there. Nothing about prompts changes.
2. **The tracker joins the English side.** Issue titles, bodies, comments, and
   label names are written in English, alongside the code, the history, the
   console output, and the design documents. Everything a stranger can open
   from the repository page reads in one language.
3. **`AGENTS.md` says so in one sentence.** The Language section stops naming
   the issue tracker as a place that follows the reader, and
   `docs/agents/issue-tracker.md` repeats the rule where an agent writing an
   issue will actually be standing.
4. **ADR-0012 is not rewritten.** It gets a status line pointing here, the way
   ADR-0005 points at ADR-0008. A reader who opens ADR-0012 sees that its
   decision 2 was recomputed, and sees the fact that forced it.
5. **The Korean issues already on the old tracker are not translated.** They
   are a record of what was decided, and the migration ticket moves them as
   they are. English starts with the issues written after the move.
6. **The seed is untouched.** ADR-0012's decision 5 stands, and its reasoning
   applies here unchanged: prep cannot tell whether a target project is public,
   so the sentence `src/seed.ts` plants stays as it is.

## Rationale

- **This is the same calculation, not a second rule.** ADR-0012 wrote down the
  principle precisely so the next person could re-run it instead of memorising
  the answer. A conclusion that survives its own premise is the failure this
  repository writes ADRs to avoid — the next reader would open ADR-0012, find
  a Gitea instance that no longer exists, and keep the tracker Korean.
- **A tracker is where a public project is joined, not just tracked.** The
  issues carry the argument that produced each change: what was built, what was
  rejected, what is still fogged. prep's product is the shape of its decisions,
  and a tracker nobody outside can read hands a would-be contributor a closed
  door on the first click.
- **Bilingual issues are rejected, for ADR-0012's reason.** Two copies drift,
  and after they drift nobody can tell which one was the decision.
- **Keeping the tracker Korean because the writers are Korean is rejected.**
  That argument reads the writer, not the reader, and the whole line was drawn
  by audience. Applied consistently it would have kept the design documents
  Korean too.
- **This does not touch conversation.** Talking to a person in their language
  is not a courtesy this decision withdraws. An issue is not conversation: it
  is left behind for whoever arrives next, which is the same test that put
  commit messages and pull request descriptions in English.

## Consequences

- The Language section of `AGENTS.md` moves the issue tracker from the human
  side to the English side, leaving prompts alone.
- `docs/agents/issue-tracker.md` — rewritten for `gh` in this same change —
  states the rule at the top, so the agent opening an issue reads it there.
- ADR-0012 gains a forward-pointing status line. Its decision 2 is not edited;
  the record of what it decided stays intact, and this record supersedes the
  half of it that expired.
- The migration ticket moves the existing Korean issues unchanged. There is no
  translation backlog.
- `src/seed.ts` and `test/seed.test.ts` do not change, and the verdict for a
  project seeded by prep does not change.
