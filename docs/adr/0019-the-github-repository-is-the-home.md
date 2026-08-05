# ADR-0019: The GitHub repository is the home, and this one becomes the record

**Date:** 2026-08-05
**Status:** Accepted — takes over from ADR-0018 what happens after the seed. The
archive is what put the tree there once; it is not how a change travels from now
on. ADR-0015's branch stands. Which GitHub repository is the home, and the sixth
decision's "still not decided", are both answered by ADR-0020: it is public and
it is `hanjukim/prep-cli`.
**Sources:** ADR-0015, ADR-0017, ADR-0018; the seed of 2026-08-05

## Context

ADR-0018 filled `github.com/Inkflockteam/prep-cli` from a `git archive` of this
tree, and the seed ran on 2026-08-05. That repository now exists, private, with
one commit that has no ancestor here. The record settled what the mirror is
filled with and left the rest standing: work continued on the self-hosted
instance, and every later change would have reached the mirror the same way, by
extracting another archive over the tree and committing it there.

Two things make that arrangement cost more than it returns.

The `curl` one-liner and `PREP_REPO` both name the GitHub repository's `main`
(ADR-0015). So **a change that lands here reaches nobody running the script**
until somebody performs the extract-and-commit. A step that has to be remembered
fails quietly, and it fails in the worst place: this repository's history says
the fix landed, while the machine being set up still receives the old file.

And the people this tool is being handed to are not on the network the
self-hosted instance sits on. Whatever is decided here, the repository they can
reach is the GitHub one.

What kept the history off GitHub was about the past — two commits carrying a
private address in the trailer the forge writes on a merge, and a
`filter-branch` ref left behind in this clone (ADR-0018). None of that is in the
seeded tree, and a commit written on GitHub from now on has no such trailer to
carry.

## Decision

**The GitHub repository is where the work happens. This repository stops taking
commits and stays as the record.**

1. **It is not a mirror any more.** Branches, pull requests and issues are
   opened on GitHub, with `gh`.

2. **This repository keeps what the archive deliberately did not carry** — the
   history, and the issues every `#N` in these records points at. It is read,
   not written. Nothing here is deleted and nothing is renamed.

3. **New work is filed as GitHub issues.** `docs/agents/issue-tracker.md` loses
   the note saying its commands do not apply yet, and `AGENTS.md` names `gh`
   rather than `tea`.

4. **The archive stays what it was**: how the tree got there once (ADR-0018). A
   change now travels as an ordinary push, on GitHub.

5. **This working copy cannot be the one that pushes.** The two repositories
   share no commit, so the work moves to a clone of the GitHub repository and
   this clone stays with the record.

6. **Whether that repository becomes public is still not decided.** ADR-0018's
   fifth point stands word for word, and so does everything the chain assumes
   about a private clone (ADR-0017): the login comes before the clone, and
   `gh repo view` reports a missing invitation rather than a broken machine.

7. **This record and the documents it changes are the last commit here**, and
   they cross over in one more extract-and-commit — the step ADR-0018
   describes, run once more and then not again.

## Rationale

- **A publication step that a person performs is a step that gets skipped.**
  Everything else in this project is arranged so the answer is read off one
  place: the registry decides what a machine holds, the preset decides what a
  harness allows, `--json` is the contract the bootstrap script reads. Keeping
  the tool's source in one repository and its published copy in another puts a
  human act between the decision and the effect, on the one file whose whole
  purpose is that other people run it.
- **The reach argument runs one way only.** Work done here reaches GitHub by
  hand; work done on GitHub reaches everybody who runs the one-liner by being
  pushed. Only one of the two homes is where the audience already is.
- **Nothing that kept the history off GitHub applies to what comes next.** The
  archive was a fence around commits that already existed. New commits are
  written on the other side of it.
- **Deleting this repository was the alternative, and it costs the numbers.**
  Every `#N` in `docs/adr/` and in `CONTEXT.md` is an issue on the self-hosted
  instance. Dropping it makes those citations unresolvable for everybody,
  including us. Keeping it read-only costs nothing and keeps every record whole.
- **Writing the archive step down was the other alternative.** A documented step
  is still a step; the failure it invites — a fix that landed here and never
  travelled — leaves no trace at the moment it happens, and turns up later as a
  machine that was set up from a file nobody would recognise as stale.

## Consequences

- **Work moves to a new clone.** A clone of the GitHub repository is where
  branches are cut from now on. This one is kept for reading, and for the issues
  it holds.
- **CI runs where it was written for.** The workflow travels with the tree, so
  GitHub Actions is the first runner to execute it against a real push. A job
  that was green under a local runner is not yet evidence of anything.
- **An open issue here does not move.** ADR-0018 already recorded that the
  backlog closed rather than migrated. Anything still wanted is opened again on
  GitHub as new work, and it takes a new number.
- **`#N` keeps resolving here and nowhere else.** The section in
  `docs/agents/issue-tracker.md` that says so stays; its reason changes from a
  move that was called off to a history that stayed behind.
- **The three records this one follows keep their decisions.** ADR-0015 chose
  the URL and the branch; ADR-0017 explained why the login precedes the clone;
  ADR-0018 chose the archive. Each gets a status line pointing here, and none of
  their arguments is withdrawn.
