# ADR-0012: A public repository writes its design documents in English

**Date:** 2026-08-01
**Status:** Accepted — ADR-0008 stands unchanged. Decision 2 was later narrowed
by ADR-0014: the tracker moves to public GitHub, the countable-readership
premise breaks, and issues go to English. Decision 5 and the `src/seed.ts` line
in Consequences were superseded by ADR-0016: the seed now carries this
repository's rule word for word. Decision 3's rewrite (#57, #58) has landed.
Prompts stay in the reader's language.
**Sources:** #53. Moving the existing documents across is #57 and #58.

## Context

One commit earlier, the language rule was redrawn by audience. English for code,
git metadata, and program output; the reader's language for prompts, the issue
tracker, and the design documents this repository keeps — the records and
`CONTEXT.md`. Drawing the line by who reads a thing rather than by what kind of
file it is was the whole point of that revision.

The reason that rule put design documents on the human side was one sentence:
prose written to explain something is read by the people working on the project
now. That sentence only holds while the set of readers is closed. You have to be
able to count who reads a thing before you can pick their language.

**This repository is becoming a public repository on GitHub.** A public
repository has no closed set called "the people working on the project now". The
person who opens a record might be a colleague today, or a stranger weighing
whether to install the tool, or someone who solved the same problem differently.
We do not know what language that person reads.

The rule was not wrong. One fact the rule read changed. Apply the same
draw-the-line-by-audience principle to the new fact and the answer comes out the
other side: when the readers cannot be counted, pick the language that is read
most widely.

## Decision

**The design documents this repository keeps are written in English. Prompts and
the issue tracker stay in the reader's language.**

1. **The English side widens.** The records, `CONTEXT.md`, and everything under
   `docs/` stand on the same side as the code, the history, and the console
   output. Open the repository and everything visible is in one language.
2. **Only writing with a known readership stays on the human side.** A prompt
   has exactly one reader. Issues live on a self-hosted Gitea instance, and the
   only people who open that instance are the people working here. Both
   readerships can be counted, so the principle keeps pointing at the reader's
   language.
3. **This decision authorizes moving the existing Korean documents; it does not
   move them.** #57 and #58 do the rewriting. Until that lands, a Korean record
   is backlog, not an exception to the rule.
4. **Design documents written from now on start in English.** They do not wait
   for a rewrite ticket.
5. **The seed is not touched.** The language clause `src/seed.ts` plants into
   other projects ships with exactly the words it has today.

## Rationale

- **This revision does not discard the principle.** The rule — draw the line by
  audience — is unchanged; one value fed into it changed. Recording it this way
  means the next reader does not memorize "design documents are English" but
  reads why it went that way, and recomputes with the same principle when a fact
  changes again.
- **Keeping a translation alongside is rejected.** Two copies drift. Once they
  have drifted nobody can tell which one was the decision, and at that moment
  the record stops being worth keeping.
- **Leaving the design documents in the reader's language is rejected.** In a
  public repository that choice closes what this project decided, and why, to
  most of the people who read it. What prep sells is not code but the shape of
  its decisions, and a decision nobody reads sells nothing.
- **Why the seed stays as it is.** prep cannot tell whether a target project is
  public. It reads the machine and the filesystem (ADR-0010) and carries static
  tables (ADR-0002). Probing a remote to find out would be a new reach, and the
  verdict goes stale the day a private repository is made public. ADR-0008's
  reason for putting the language rule in the seed was that the person running
  prep gives the same answer for every project — and whether a project is public
  is not the same answer for every project. So the seed keeps the default that
  fits the majority, and a project that goes public amends its own guidance
  file, which is exactly what this repository just did.
- **Writing a conditional into the seeded sentence is rejected too.** A clause
  like "English if public" states a condition prep cannot evaluate. The reader
  of a guidance file would receive homework instead of a rule. A sentence in a
  guidance file has to be followable the moment it is read.
- **This does not conflict with ADR-0008.** What ADR-0008 decided is that the
  seed writes the language clause filled in, and that the check result therefore
  reaches `ready`. This record touches neither. The only thing that narrows is
  this repository's own `AGENTS.md`.

## Consequences

- The Language section of `AGENTS.md` carries this decision. The sentence
  putting design documents on the reader's side is gone.
- #57 and #58 move the existing records, `CONTEXT.md`, and the documents under
  `docs/` into English. This record is what those tickets point at. This record
  was written in Korean and moved across with them.
- `src/seed.ts` and `test/seed.test.ts` do not change by a single line, and
  neither does the check result in a project that used the seed.
- ADR-0008 gains a line pointing forward, so the split between the sentence the
  seed plants and the sentence this repository follows is legible from there
  too.
- Prompts are unchanged. What is said to a person is said in that person's
  language.
