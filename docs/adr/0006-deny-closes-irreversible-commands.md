# ADR-0006: The deny list also closes irreversible commands

**Date:** 2026-08-01
**Status:** Accepted
**Sources:** ticket #37. The data goes in with follow-up ticket #38.

## Context

Every `deny` entry in the baseline today is a `Read(` rule. A test pins that
shape ("only reads are denied — the deny list is not a second allowlist"), and
the reasoning is written in a presets.ts comment. Secrets are the one class
where reading is itself the leak, so they are closed narrowly by the same
judgement that opens everything else generously. Open the allowlist wide, block
reads alone.

That reasoning held while the allowlist stayed inside per-language tooling.
Open `npm` or `uv` by prefix and no subcommand underneath either of them can put
a repository beyond recovery.

The type-independent Bash allowlist breaks the premise. Opening commands that
hold without knowing the type means opening version control, and version control
carries everyday queries and the commands that erase somebody else's commits in
the same package. Narrow the allow rules down to individual subcommands and the
baseline prompts for confirmation constantly, and a baseline like that gets
widened by hand or ignored — the decision to use prefix rules already stands on
that reason. That leaves only `deny`, and `deny` cannot hold commands today.

A second hole shows up at the same moment. Close `.env` for reading while
leaving a command that dumps the whole environment open, and the value that was
closed walks straight out the other door.

## Decision

**The `deny` list does not hold read rules alone. It holds command rules too,
but only where one of the following three holds.**

1. **Close an irreversible subcommand back off inside a broadly opened prefix
   allow.** A prefix allow only holds on the condition that the dangerous end of
   the command is closed instead of the command being opened whole. Closing that
   end is the price of opening wide.
2. **Close a command that hands out, by another route, a secret already closed.**
   This extends the existing reasoning; it is not a new judgement. If a value
   blocked as a file comes out on standard output, the `deny` list stays
   punctured.
3. **Close a command that is outside the allowlist but reaches unrecoverable
   state from one mis-pressed confirmation.** A command not on the allowlist
   already raises a confirmation. What `deny` adds is removing that confirmation
   entirely, so it is used only where the outcome is heavy enough to warrant
   erasing even the path through one wrong keypress.

The third is the most slippery. Widen it and `deny` becomes a list of commands
that look dangerous, and once a list grows that way it accumulates entries
nobody can justify. So the criteria are written from the other side as well.

**What does not get in:**

- A command outside the allowlist whose result can be undone. One confirmation
  is already enough of a safeguard.
- Edits git gives back. Deleting a file and deleting a commit are different
  things. There is no reason for `deny` to guard again what the repository is
  already holding.
- The habits of a particular team or a particular repository. The baseline is
  either type-independent or per-type, and a rule that fits neither belongs in
  somebody's local settings.
- A broad prefix that closes a command whole. A rule has to name precisely the
  subcommand it means to block. The moment it catches everyday calls, people
  start editing the baseline.

## Rationale

- `deny` beats allow, so layering a broad prefix allow over a narrow command
  `deny` buys both at once: everyday work never stops, and the irreversible ends
  never open. With the allowlist alone one of the two has to be given up.
- The criteria are written out in prose in order to fix how the list grows. If
  an entry cannot answer "why is this here" with one of the three, it does not
  go in. A list that grew without criteria loses its reasoning, and a list that
  has lost its reasoning gets deleted wholesale by the next person.
- It runs with deny-by-default, not against it. This decision only widens `deny`
  and widens no allow. The merge is a union too, so no rule in an existing file
  disappears (ADR-0003).
- Determinism is unchanged (ADR-0002). What gets added are entries in a static
  table, and what goes in is settled by this document. There is no runtime
  judgement.

## Consequences

- The `deny` comment in presets.ts has to restate its reasoning. "Reading is the
  leak" is still true, but it is no longer the reason for the whole list.
- The test that pinned `deny` to read rules only becomes a test of the criteria
  in this document. Justifying each entry stays a human job; the test goes as far
  as checking that the list may hold command rules and that a rule is written
  narrowly.
- A command on this list cannot be worked around by an agent inside the project.
  A person can do it directly in a terminal, and that is the intended boundary —
  putting a human hand in the way one more time for something that cannot be
  undone.
- The preset entry in CONTEXT.md updates the contents of the type-independent
  common set.
- This document changes no code. Putting the rules in is #38's job.
