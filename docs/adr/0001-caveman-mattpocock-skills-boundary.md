# ADR-0001: The boundary between caveman and mattpocock/skills

**Date:** 2026-08-01
**Status:** Accepted
**Sources:** wayfinder map "prep CLI — four unsettled design decisions", ticket
"settle the relationship between caveman and mattpocock/skills"

## Context

This repository runs two skill systems at the same time.

- **caveman**: a response-style layer — terse compression — switched on for
  every session by the user's global `CLAUDE.md` through a SessionStart hook. It
  brings along subagents and skills that emit compressed output:
  `caveman:cavecrew-investigator`, `cavecrew-builder`, `cavecrew-reviewer`,
  `caveman-review`, `caveman-commit`.
- **mattpocock/skills**: a process skill system that owns the whole in-repo
  development loop — prototype → grilling → spec → ticket → implementation →
  triage, `/wayfinder` included. This repository handed that loop to
  mattpocock/skills whole at kickoff, and prep wraps only its outer edge: it
  plants guardrails through the front door and promotes cleanly through the
  back.

Names and purposes collide across the two — `caveman-review` against
`mattpocock-skills:code-review`, `cavecrew-investigator` against the `Explore`
and `research` subagents. Until one side is named the single source of truth for
a given job, every session decides the pairing again, and differently.

## Decision

**Split by layer. Narrow delegation with no judgement in it is caveman's;
everything that carries judgement is mattpocock/skills'.**

1. **caveman is the output-style layer.** It holds no authority over the
   workflow. It is always on, and it still decides only how to speak, never what
   to do.
2. **mattpocock/skills is the process authority.** Grilling, prototyping,
   writing specs, breaking work into tickets, domain modelling, pulling a code
   review together, wayfinder — anything that judges or synthesises goes here.
3. **The overlapping subagents stay.** `cavecrew-*`, `caveman-review` and
   `caveman-commit` are not retired. They keep earning their place on narrow
   mechanical work that needs no judgement: locating code, a surface edit across
   one or two files, a one-line diff comment, a draft commit message. The moment
   judgement enters — pulling a review together, planning, writing a spec — the
   work moves to mattpocock/skills. A caveman subagent does not make that call
   on its behalf.

## Rationale

- **Kickoff already assigned the ownership.** This repository gave the in-repo
  development loop to mattpocock/skills on day one. The supported harnesses were
  narrowed to Claude Code and Codex for the same reason: those two are the ones
  mattpocock/skills actually bites. In that same set of kickoff decisions caveman
  appears once, as one of the agentic tools to install alongside the two
  harnesses. It was never named as the owner of a workflow.
- **The caveman skills describe themselves that way.** Their own summaries say
  "token saving" and "terse compression". None of them claims a methodology.
- **Both directions cost something.** Route every narrow mechanical task through
  a full mattpocock/skills skill and the reason for running caveman at all —
  saving tokens — disappears. Hand work that carries judgement to a caveman
  subagent instead and the single-source-of-truth rule breaks: the same fact is
  not made in two places, one home is chosen and everything else points at it,
  which is a principle this project set as guidance at kickoff. Two skill
  systems each holding part of the judgement line is that fact in two places.

## Consequences

- Locating code with `cavecrew-investigator`, and fixing a typo or a
  one-to-two-file edit with `cavecrew-builder`, remain valid and unchanged.
- No caveman subagent is the deciding party in a PR review, a spec, a ticket
  breakdown, or a wayfinder grilling. Its compressed output may feed the next
  step, but the decision itself is made in a mattpocock/skills session.
