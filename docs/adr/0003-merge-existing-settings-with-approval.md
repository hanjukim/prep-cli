# ADR-0003: prep reads existing settings and merges them with human approval

**Date:** 2026-08-01
**Status:** Accepted
**Sources:** tickets #23 and #24, and #17 "decide the preset apply/merge
algorithm", which was left unanswered

## Context

`prep setup` used to check only whether `.claude/settings.json` existed and back
away if it did. Not reading the file was deliberate (#22 implementation
session), and the reasoning was that whatever the contents are, prep should
never get a pretext for overwriting somebody else's file. The setup entry in
CONTEXT.md pinned it too: no merge logic, write only when the file is absent.

That design only holds for an empty repository. A good share of the projects
that would want prep already have a settings file somebody wrote by hand, and in
those projects prep can do nothing but exit 1. The person then has to open the
file and copy the preset across by eye — which undoes the very reason prep
exists, getting every secret-reading `deny` rule in place, in the way most
likely to go wrong.

The questions #17 raised — field-by-field merge against wholesale overwrite,
precedence on conflict, whether to write a backup — dropped off the map without
answers. They are answered here.

## Decision

**prep reads the existing settings file. The merge is purely additive, and
before anything is written the diff is shown and approval is asked for.**

1. **It reads.** The injected file-system interface gained `read`. If the file
   cannot be read, does not parse as JSON, or the places prep touches
   (`permissions`, the rule arrays, `defaultMode`) are not shaped as expected,
   it stops with a tool error (exit 2) — it does not hide behind a silent no-op.
2. **Rules are a union, and an existing rule is never removed.** Within each of
   `deny`, `allow` and `ask`, the existing rules come first and the rules the
   preset adds are appended. Duplicates appear once. Even where an existing
   `allow` overlaps a preset `deny`, prep does not propose a deletion.
3. **Anything prep does not know about is left exactly as it was.** Keys outside
   `permissions` (hooks, env, model, MCP server settings) and unfamiliar keys
   inside `permissions` (`additionalDirectories` and the like) are preserved in
   their original order.
4. **prep does not settle scalar conflicts.** If `defaultMode` differs, it is
   reported as a conflict and the plan keeps the existing value. The actual
   choice is made by a person, one question per item. If the existing file has
   no value at all there is nothing to ask about, so the preset value goes in.
5. **Nothing is written without approval.** Making the plan and writing it are
   separate. The diff comes first, then the conflicts one at a time, then a
   final summary right before the write and a confirmation. Decline and the file
   is unchanged, byte for byte.
6. **Non-interactively it never blocks and never writes.** Without a TTY, or
   with `--json`, or with `--dry-run`, it asks nothing, prints the plan only,
   and exits 1 (0 for a dry run).
7. **It writes no backup file.**

## Rationale

- What the original do-not-read decision was guarding against was overwriting
  based on the contents. A purely additive merge is not an overwrite — no
  existing rule disappears, so there is nothing that reading the file can cost.
  The whole risk sits in what gets deleted or changed, and that is exactly where
  a person's approval goes.
- It does not collide with deny-by-default. The merge only widens the deny list.
  prep never even proposes narrowing it, so there is no path where approving a
  merge widens the security surface.
- Why prep does not settle scalars: somebody who set `defaultMode` to `plan` had
  a reason to. Let the preset win and the setting of a person who clicked
  through the prompt quietly reverts.
- Why no backup: the approval diff is already the safeguard, and a `.bak` file
  lingers as commit noise and goes stale. The target project being a git
  repository is a premise that already holds.
- Determinism survives (ADR-0002). The preset is still a static table, and the
  merge is a pure function from (existing file, preset) to a plan. There is
  still no runtime LLM call. The only non-deterministic part is one human
  answer, and that sits behind the injected prompt boundary, so the tests cover
  all of it.

## Consequences

- `prep setup` is useful in a project that already has settings. An interactive
  run shows the diff, takes approval, and merges.
- Piped into CI or a script, `prep setup` produces a plan and touches no file.
  There is no way to apply automatically today — if that becomes necessary, a
  separate flag will handle it.
- A second run is still quiet. A file that already covers the baseline has
  nothing to propose, so the run ends as `skipped`.
- The injected file-system interface got wider (`read` added). Just as probe.ts
  holds the monopoly on the shell, setup.ts holds it on the file system and
  prompt.ts on terminal input.
