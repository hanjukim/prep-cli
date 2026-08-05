# ADR-0007: prep does not merge the Codex config file

**Date:** 2026-08-01
**Status:** Accepted
**Sources:** `feat/codex-permission-file`, #29, the matching decision in ADR-0003

## Context

One baseline goes out in two harness formats. Claude Code reads
`.claude/settings.json`, Codex reads `.codex/config.toml`. The values are decided
in one place — `presets.ts` — and only the format differs.

The Claude side already has an answer. If the file is there, prep reads it,
**merges**, shows the diff, and asks for approval (ADR-0003). What made that
answer work is the format: the runtime parses JSON for us, and what is being
merged is a list of rules, so a union is defined. Only scalar conflicts have to
reach a person.

The Codex side has none of the three. The runtime does not parse TOML, and
bringing in a parser means taking a dependency. prep stands on zero runtime
dependencies.

A merge can be faked without a parser — cut the file into lines, find the table
headers, splice keys in. That is not a merge, it is a guess. It is a guess made
against somebody else's config file, and when it is wrong their file is the one
that breaks.

## Decision

**If `.codex/config.toml` already exists, prep does not touch a byte of it. It
reports that and stops.**

1. **Write only where nothing stands.** Writing a file that did not exist takes
   nothing away from anybody, so it does not ask for approval either — the same
   place the seed sits (ADR-0005).
2. **An existing file ends as `skipped`.** The report names the file and says it
   is not merged. The exit code is settled by the other artifacts.
3. **Serialization is done by hand.** The values written are strings and tables
   of strings, so quoted keys, quoted values, and table headers are the whole
   job. This pairs with the decision not to take a parser.
4. **Reading does exactly one thing.** In a file that already exists, prep looks
   line by line for a `sandbox_mode` setting. That is a single-line check, not
   parsing.
5. **The same rule covers prose files.** If `CLAUDE.md` already exists, prep
   leaves it as it stands without reading it. Prose has no defined union — a
   guidance file spliced together by a machine is a result nobody can read.

## Rationale

- Between not writing and writing wrongly, take the first. A file that was not
  written can be opened and fixed by a person, and the report carries that
  state. A wrongly merged file is broken silently.
- `sandbox_mode` is read for the opposite failure. If that key appears even
  once, Codex falls back to its old sandbox and never reads the permission
  profile. Write the file quietly and a project with nothing closed off gets
  reported as protected. So the fact rides on the artifact (`sandboxMode`) and
  the report warns about it.
- Claude's command `deny` rules (`rm -rf`, `git push --force`, and the rest) do
  not carry over to Codex. Codex separates filesystem access from command
  approval, and there is no one-to-one key. Pick a key that merely looks similar
  and one baseline starts meaning different things in the two harnesses. That it
  does not carry is written down in docs/codex-permissions.md.

## Consequences

- `codex-config` joined the `Artifact` union. The approval flow is unchanged —
  `claude-settings` is still the only artifact that waits for approval.
- Somebody who edited `.codex/config.toml` by hand does not follow along when
  the preset widens. Deleting the file and running prep again is their route,
  and the report says every time that this file is not prep's.
