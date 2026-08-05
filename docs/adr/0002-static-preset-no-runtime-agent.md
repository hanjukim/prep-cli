# ADR-0002: The preset is static data, and prep-cli calls no agent at runtime

**Date:** 2026-08-01
**Status:** Accepted
**Sources:** wayfinder map "project security bootstrap design" (#14), grilling
on tickets #8/#16/#17/#18

## Context

Deciding how to build the security preset for each type marker — node and
python, each with a Bash allowlist, network domains, and MCP servers — brought
out a proposal: hand an agent the question of which values a type gets. prep-cli
is itself a CLI that works inside the agentic tool ecosystem (Claude Code,
Codex) in places such as doctor, so calling an LLM at runtime and generating the
preset on the spot can look like the natural direction.

## Decision

**prep-cli owns the preset itself, as static data. It calls no agent pipe at
runtime.**

> The #22 implementation session narrowed what a preset holds down to the Bash
> allowlist alone — network domains and MCP servers came out (CONTEXT.md). Where
> this record says "the three items" below, it means the scope of that moment.
> What this ADR decided is not the list of items but how they are produced: prep
> owns them as static data.

- The preset values for node and python — Bash allowlist, network domains, MCP
  servers — are pinned up front in a static table of the `registry.ts` kind.
- `prep setup` writes that static table into the file as it stands. No LLM call
  takes part in deciding a value.
- Where a project needs agent involvement to customise something, such as a
  Claude Desktop voice grilling, that has already finished before promote,
  outside prep-cli. prep-cli takes the result — an empty repository plus a
  bootstrap bundle — and lays the preset on top of it.

## Rationale

- **Determinism and testability.** probe.ts is tested purely because `which` is
  injected into it; a static preset buys the same thing — fixed input, fixed
  output, verifiable by snapshot. Put an LLM call in the path and a run can
  differ from the last one, which collides with the idempotence doctor's design
  requires.
- **A minimal shell and network surface.** probe.ts holds the monopoly on shell
  access on the same principle. An agent API call site inside prep-cli would add
  one more trust boundary and one more network dependency to a security-first
  tool.
- **The #8 grilling already weighed this.** A draft that delegated to an LLM was
  raised there and replaced by the static preset. This session reconfirmed that
  decision rather than reversing it.

## Consequences

- `prep setup` works offline. It depends on no network and no API key.
- Where a project needs fine-tuning, a person edits `.claude/settings.json` by
  hand once the preset has landed (#8: "everything outside the preset stays
  denied; a person edits by hand where they need to").
- If a per-type preset value is itself wrong, the static table gets corrected.
  That is a bug fix, not a violation of this design.
