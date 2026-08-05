# ADR-0016: One language rule, for this repository and for every project it seeds

**Date:** 2026-08-01
**Status:** Accepted — supersedes the split ADR-0012 drew between this
repository's rule and the sentence the seed plants. The rule the seed writes is
now word for word the rule this repository keeps.
**Sources:** ADR-0008, ADR-0012, ADR-0014

## Context

The language rule was written twice, with different scope on each side.

This repository's own `AGENTS.md` put four things in English — code and git,
design documents, the issue tracker, prompts excepted — across four bolded
paragraphs and a closing paragraph of reasoning, ending in two decision-record
citations. Around two hundred words to say which language to write in.

The seed planted a shorter, narrower rule: code, git and program output in
English, and everything else — prompts, issues, design documents — in the
reader's language. ADR-0012 made that split deliberately. This repository is
public, so its design documents cannot name their readers; a project being
seeded might be private, and its documents might have a readership everybody
can count.

Two texts, two scopes, one subject. The seed is the rule prep hands to every
project it touches, so the difference is not a detail of this repository — it is
what prep teaches everywhere it runs.

## Decision

**One rule, compressed, in both places.**

1. **The scope is the same on both sides.** Everything a repository publishes is
   English: code and its comments, identifiers, program output, commit messages,
   branch names, pull request descriptions, design documents, and issues.
   Prompts are written in the reader's language.
2. **The words are the same on both sides.** `AGENTS.md` and `AGENTS_SEED` carry
   the same two paragraphs and the same one-sentence reason, character for
   character.
3. **It is roughly a third as long.** The four paragraphs collapse to two, the
   paragraph of reasoning to one sentence, and the decision-record citations come
   out. A rule read at the start of every session pays for its length every time.
4. **One sentence does not cross.** This repository adds that Korean documents
   and issues written before the rule are records, not backlog. A project being
   seeded has no such history, so the seed leaves it out.

## Rationale

- Two scopes for one subject is a thing to keep true in two places, and the
  smaller of the two was the one prep hands out. Whichever is right, prep should
  not teach one rule and follow another.
- The citations came out because a rule is read to be followed, not to be
  traced. The records still hold the reasoning for anybody who wants it, and
  this one names its own supersession — nothing is lost, it just stops riding
  along in the file that gets read most.
- The cost is real and worth naming: a private project seeded by prep now gets a
  rule written for a public one. Its design documents go to English although its
  readership may well be countable. We take that over the alternative, which is
  prep deciding a project's audience from the outside and getting it wrong the
  other way — a project that goes public later would carry Korean documents it
  now has to rewrite, which is exactly the migration this repository is in the
  middle of (#57, #58).
- Nothing about the handoff check changes. The Language section still carries
  prose, so a seeded project still reports language as ready (ADR-0008).

## Consequences

- `AGENTS.md` and `src/seed.ts` hold the same text. A change to one is a change
  to the other, and a test pins them together.
- ADR-0012's decision 1 stands for this repository and now reaches the seed as
  well. Its reasoning about countable readership no longer draws a line between
  the two.
- Anybody who wants prep to seed a narrower rule needs a new record. This one
  does not leave the scope configurable, because a rule with a switch on it is
  two rules again.
