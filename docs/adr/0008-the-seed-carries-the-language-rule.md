# ADR-0008: The seed carries the language rule

**Date:** 2026-08-01
**Status:** Accepted — supersedes decisions 1 and 2 of ADR-0005. ADR-0012
narrowed only this repository's own rule, and the split it drew is gone:
ADR-0016 rewrote the sentences the seed plants to match this repository's, word
for word. What this record decided — that the seed fills the section in — stands.
**Sources:** `feat/seed-carries-language-rule`, #46

## Context

ADR-0005 decided the seed writes a shape and nothing else. Leaving the section
body empty keeps the language check result at `empty`, and the tail of the
report keeps pointing at `/setup-matt-pocock-skills`. The reason was a
boundary — prep does not answer in a person's place.

The boundary was right and did not fit this item. Of the three things handoff
looks at, two — the tracker and the domain docs — have a different answer in
every project. Which tracker a project uses, and what vocabulary it has, is
knowable only by opening it. The language rule is not like that. prep is a
personal CLI, and the person running prep gives every project the same answer:
English for what lands in the repository and on stdout, the reader's language
for what is said to a person.

So an empty seed sends that person around a harness command to copy in one
answer that was settled before they started. That round trip is what it costs
for prep to pretend it does not know what it knows.

## Decision

**The seed writes the `## Language` section filled in.**

1. **It carries content.** The section holds the rule and the reason the rule
   splits — English for code, git, and console output; the person's language for
   prompts. What lands in the repository and on stdout rides through diffs,
   greps, and pipes, so it stays in one language; a conversation has one reader,
   so it meets them.
2. **The check result rises with it.** language is `ready` in a project the seed
   wrote. The handoff tail counts two of the three as still owed, and the
   harness command stays on the table for the tracker and the domain docs.
3. **The only heading it opens is one it can answer.** The seed opens no section
   other than `## Language`. A heading with no answer does not announce what is
   missing; it puts a blank in the place the check result reads.
4. **If anything is there, it does not touch it.** ADR-0005 decision 3 stands.
   The seed is used only when no guidance file exists at all, so there is no
   route by which it overwrites somebody's answer.
5. **It does not ask.** ADR-0005 decision 4 stands. Writing a file that did not
   exist takes nothing away.

## Rationale

- What the boundary protects is "prep does not invent what it does not know",
  not "prep stays silent about what it does know". prep does not know the
  tracker's name or a project's vocabulary. It does know this rule.
- Not one line of the check code changes. `hasProse` asks only whether there is
  prose under the section, never who wrote it. Telling seed-written prose apart
  from person-written prose would make the check carry a fingerprint of its own
  artifact, and then a person who read the seed's sentences and kept them would
  be counted as not having answered.
- This is the side that is easy to undo. If the rule does not suit a project,
  the person rewrites the section, and what they wrote wins as it stands.
- The rest of ADR-0005 is alive. Why the seed exists at all (do not send a
  person into a dead end), why the file is named `AGENTS.md`, why there is no
  second file, and why the handoff check is read after the artifacts — all
  unchanged.

## Consequences

- The handoff report on a freshly seeded project ends at "2 still owed" rather
  than "3 still owed".
- The report line introducing the seed file changes from "an empty shape" to
  "the language rule, plus room for the harness to write".
- The reason the seed's prose had to sit above the first heading is gone. Prose
  inside a section is now a decision, not a bug.
- The handoff section and the seed entry in CONTEXT.md follow this decision.
