# ADR-0029: The reading subcommand is chef

**Date:** 2026-08-11
**Status:** Accepted — renames the subcommand fourteen earlier records call
`doctor`, and rewords ADR-0027's headline. That record's axis stands exactly as
it drew it, purpose and not scope; what changes is the verb on one side of it,
because a chef does not diagnose (decision 6). No argument in any record is
edited, because a record is not edited into agreement with a later one
(`CONTRIBUTING.md`). The three whose title carries the old command name —
ADR-0004, ADR-0026, ADR-0027 — gained one Status sentence pointing here, and the
**chef** entry in `CONTEXT.md` is where the two words are said to be one thing.
**Sources:** `https://github.com/hanjukim/prep-cli/issues/25`; ADR-0009,
ADR-0010, ADR-0026, ADR-0027, and the term counts taken on `main` at `543c525`

## Context

`prep` is borrowed from a kitchen — prep work, the mise somebody does before
service. For most of this tool's life that was incidental: a short name for a
tool that prepares a machine, and nothing else in the vocabulary leaned on it.

**ADR-0026 made it load-bearing.** The **pass** is the shelf a finished plate
goes on for someone else to pick up, and that image is the whole reason the
concept is legible — a pass item is not a gap prep may close, it is something
put where a person will collect it. Nothing in the word "pass" says that on its
own. The kitchen does.

Against a register the glossary now depends on, `doctor` is from somewhere else.
It also stopped describing the job. It meant "look at this machine and say
whether it is sick", and after ADR-0026 and ADR-0027 the subcommand reads the
machine, reads a project it is handed, holds the **handoff**, and counts what is
still on the pass. That is not a diagnostician visiting a patient. It is the
person who knows the whole kitchen and can say what is missing before service.

The counts, taken on `main` at `543c525`: 99 occurrences across `src/` and
`scripts/`, 151 across `test/`, and 116 in prose across 17 files — of which 14
are records in `docs/adr/`, and three of those carry the name in their file name.

## Decision

**The reading subcommand is `chef`, renamed outright.**

1. **`prep doctor` is not a spelling of it.** No alias, no deprecation window,
   no undocumented second name. Every glossary entry carries an `_Avoid_` line
   whose whole purpose is one name per concept, and an alias installs two in the
   surface people type — permanently under option 1, and for as long as nobody
   gets round to the follow-up under option 2. The old word is refused the way
   any other unknown subcommand is, and `test/cli.name.test.ts` holds both
   halves together so neither can drift into the other.
2. **The rename reaches the identifiers as well as the surface.** `ChefProject`,
   `NextStepId`'s `"chef"`, the `CHEF` constant. Renaming only what is typed
   would leave the code reading in a register the documents had abandoned, which
   is the mismatch this record exists to close, one layer down.
3. **`prep setup --json`'s `next[].id` changes from `doctor` to `chef`.** It is a
   published contract and this breaks it. Nothing in this repository reads that
   field — the two readers the script has, `scripts/gaps.ts` and
   `scripts/links.ts`, read `prep chef --json`'s `results` array and never
   `setup`'s next steps — and a field naming a subcommand that no longer exists
   is worse than a field that changed.
4. **`setup` keeps its name.** In the same register the first-service
   preparation is the mise, which makes `prep setup` close to `prep prep`, and
   `mise` is opaque to anybody who has not worked a line. `setup` says what it
   does and collides with nothing. The register is worth following where it makes
   a concept legible, not everywhere it can reach.
5. **`docs/adr/` keeps saying `doctor`, including in three file names.** A record
   is not edited into agreement with a later one (`CONTRIBUTING.md`), and
   renaming the files would break every citation of them. What the three
   title-carrying records get is the one edit that rule sanctions: a Status
   sentence pointing here, so a reader who lands on a page promising a
   `prep doctor` command is not left to run it. The other eleven carry the old
   name in their arguments only, and the **chef** entry in `CONTEXT.md` is the
   bridge for those — in the entry rather than a footnote, because somebody who
   lands on ADR-0011 has the glossary to check and nothing else.
6. **The diagnostic wording goes with the name, ADR-0027's headline included.**
   The question the subcommand answers reads **what is missing** rather than
   "what is wrong", and the axis reads **chef reads, setup writes** where
   ADR-0027 wrote "doctor diagnoses, setup writes". That record's decision is
   untouched — the axis is purpose and not scope, which is the whole of what it
   settled — but its verb was chosen to fit a name that has gone, and a renamed
   command still describing a diagnosis would leave the mismatch sitting in the
   one sentence that defines the split.

## Rationale

- **The register is a load-bearing part of the vocabulary now, so a term outside
  it costs something.** Before ADR-0026 this would have been decoration. `pass`
  is what changed the price: a reader who does not have the kitchen in mind has
  no way to see why that concept is not simply another kind of gap.
- **An alias is the expensive option, not the cheap one.** Its code is trivial —
  one more `||` in a dispatch — and its cost falls entirely on the glossary,
  which is the document this project spends the most care on. Two accepted names
  for one thing is the exact failure every `_Avoid_` line is written to prevent.
- **The breakage is small and it is at the surface.** What breaks is a word
  somebody types, and it breaks loudly, on the next keystroke, with the usage
  text naming the subcommand that exists. The bootstrap script — the one caller
  that runs the command unattended — is served from this repository and is
  updated in the same commit.
- **A rename that stops at the surface is half a rename.** The identifiers are
  read by whoever changes this code next, and leaving `DoctorProject` behind
  would make the old name the one they learn.

## Consequences

- Anybody whose notes say `prep doctor` gets an unknown-subcommand error and the
  usage text. There is no alias to fall back on and no follow-up ticket to
  finish, which is what makes this option cheaper than option 2 in the end.
- `prep setup --json` consumers that branch on `next[].id === "doctor"` — none
  in this repository — break. See decision 3.
- Three ADR file names now carry a command name that does not exist, and every
  record before this one argues about `doctor` by name. That is the intended
  outcome of the record rule, not an oversight; the glossary entry is the bridge.
- The report's aligned columns moved. `chef` is two characters shorter than
  `doctor`, so every snapshot holding a padded command column changed, and one
  test that hard-coded the padding now matches the pair rather than the spaces.
- `test/cli.name.test.ts` sweeps `src/` and `scripts/` for the old word, so a
  half-finished rename fails rather than lingering. `docs/adr/` is excluded by
  name, for the reason in decision 5.
