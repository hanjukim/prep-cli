# ADR-0018: The mirror is seeded from a git archive, not from a push

**Date:** 2026-08-05
**Status:** Accepted — settles how the tree reaches the mirror ADR-0015 chose,
and takes over the question ADR-0017 left to the migration ticket. The seed ran
on 2026-08-05, and ADR-0019 takes it from there: the archive is what put the
tree on GitHub once, not how a change travels afterwards. Everything below holds
for that one act. The fifth decision — who may read the repository — is settled
by ADR-0020: anybody, at `hanjukim/prep-cli`, on a scan of the tree recorded
there with its limits, as this record asked.
**Sources:** #65, #66, #67 on the self-hosted instance; the pre-publication scan
of 2026-08-02, whose record this change deletes from the tree and leaves in this
repository's history; ADR-0015, ADR-0017

## Context

Three tickets described the handoff, and none of them ran. #65 was to publish
this repository on GitHub with its history intact and rename `main` to `alpha`.
#66 was to move the open issues to a GitHub tracker. #67 was to create a `beta`
branch from an orphan commit, make it the default, and hand that to the team.

A scan run before any of it took a different turn. It read every blob reachable
from every ref and every commit's metadata, and found nothing in any file, at any
commit. What it did return sat in the history rather than in the tree, and could
have been removed only by rewriting every commit — so the answer recorded on
2026-08-05 was that no history is published at all.

That scan is worth no more than what it was. It matched patterns and entropy
with `git` and `grep`; no dedicated scanner was on the machine; and a pattern
scan finds what it has a pattern for. It was never a sign-off, and nothing below
treats it as one.
Once the history stops travelling, the branch names invented to hold it stop
meaning anything: `alpha` was the name for a published history, and `beta` was
the name for the snapshot standing beside it.

A mirror already exists. ADR-0015 put the bootstrap script's `curl` URL and the
`PREP_REPO` clone on `github.com/Inkflockteam/prep-cli`, on `main`, and ADR-0017
recorded that the mirror is private today while ADR-0015 calls it public. That
record left the public question to the migration ticket. The migration ticket is
closed without settling it, so it comes here.

## Decision

**What goes to the mirror is a `git archive` of the tree, extracted and
committed there. No branch here is renamed, and no orphan branch is created.**

1. **The archive is the artifact.** It is made from this clone's `main`:

   ```sh
   git archive --format=tar.gz --prefix=prep-cli/ main -o prep-cli.tar.gz
   ```

   A tarball of one tree. It carries no commit, no author, no ref, and no
   object database.

2. **It is extracted into the mirror and committed there.** The branch is
   `main`, because the raw URL in the one-liner and the `PREP_REPO` clone both
   name `main` already (ADR-0015). A later update is another archive extracted
   over the same working tree and committed on top, so the mirror keeps a
   history of its own — its own, not this one's.

3. **The commit message says where the reasoning lives**: the commits that got
   the tool here, and the issues that drove them, stay on the self-hosted
   instance.

4. **`main` here is left as it is.** No `alpha`, no `beta`. The `beta` this
   project ships under is `0.1.0-beta.0` in `package.json`, which is where a
   version belongs.

5. **Whether the mirror becomes public is still not decided.** It is private,
   the chain's clones are private with it, and ADR-0017's account of why the
   GitHub login comes before the clone holds unchanged. What this record settles
   is what the mirror is filled with, not who may read it — and opening it to
   strangers rests on a scan whose limits are stated above, so that decision
   starts by reading the tree again, not by citing this one.

## Rationale

- **An archive cannot carry what a push carries.** A squashed push is still made
  from an object database holding every commit the scan flagged, and that
  metadata is one `--mirror`, one stray ref, or one mistaken flag away from
  travelling. A squash only drops what is never pushed. `git archive` reads a
  tree and writes a tarball — there is nothing in the format for a commit to hide
  in, so it drops the history by construction rather than by care.
- **The finding list is not closed, and was never closed.** Two commits carry a
  private address of the network this work is done on, in the `Reviewed-on:`
  trailer the forge writes on a merge. One of them landed on 2026-08-02, inside
  the window the scan claimed; the other on 2026-08-05, after it. So one of them
  is a commit the scan did not reach because nothing had written it yet, and the
  other is a commit it should have caught and did not — the class its own
  private-address pass was looking for. Either way the count is two, and a
  metadata pass is not a fence. They reach the mirror under a push and cannot
  reach it under an archive.
- **One ref does not travel, and does not have to be remembered.** A
  `git filter-branch` left `refs/original/refs/heads/feat/merge-existing-settings`
  in this clone. It is not an ancestor of `main`, and `git push` leaves it alone
  while `git push --mirror` carries it. Under an archive it is not a ref at all:
  `git archive` is given one tree-ish and reads nothing else. The remedy the scan
  named — delete the ref, or never publish with `--mirror` — stops being a step
  somebody has to remember on the day they publish.
- **The branch names were scaffolding for a plan that changed.** `alpha` only
  distinguished a published history from a published snapshot. With one of the
  two gone, renaming `main` costs every existing clone, every open branch, and
  the default-branch setting, and buys a word.
- **The mirror's `main` is load-bearing.** Two published strings name it — the
  `curl` line people are handed, and `PREP_REPO`. Seeding any other branch means
  editing both, for nothing.
- **A tarball is what a handoff actually is.** The team is given a starting
  point, not a shared history to rebase onto. Nothing on their side needs a
  common ancestor with this clone.

## Consequences

- **The mirror and this clone share no commit.** Neither can fast-forward from
  the other, and no branch here can be pushed there. Every update to the mirror
  goes through the same extract-and-commit, which is a deliberate step rather
  than a habit — a change that only lands here changes nothing for anybody
  running the script (ADR-0015).
- **The initial commit still has an author.** Whatever `user.name` and
  `user.email` are configured where the commit is written is what every reader
  sees, on the only commit there is, so that pair is chosen rather than
  inherited.
- **The scan's own record does not ship, and is deleted from the tree.** It was
  a page about a history the mirror never receives — what was searched for in
  those commits, and what came back. Shipping it would hand a reader a detailed
  account of the one thing being withheld, which is the opposite of what the
  decision above is for. It stays in this repository's history, where the commits
  it describes are.
- **Everything else tracked ships.** No `.gitattributes` marks anything
  `export-ignore`, so `.claude/settings.json`, `AGENTS.md`, `CLAUDE.md` and
  `docs/agents/` go out with the source. That is the point: the team clones a
  project whose harness is already configured.
- **The issues stay here.** #66 closed with nothing to move — every issue that
  was not part of the migration itself was already closed, and a closed issue's
  value is as a record. A reader of the mirror who follows a `#N` in these
  records finds nothing; the numbers are the self-hosted instance's, as
  `docs/agents/issue-tracker.md` already says.
- **`docs/agents/issue-tracker.md` describes a tracker nobody has.** It was
  rewritten for the GitHub move that #66 was going to make, so it now opens with
  a note saying which of its commands apply today, and `AGENTS.md` names `tea`
  and the self-hosted `origin` instead of `gh`. Where the team files new work
  once it has the mirror is the next open question, and it is not this one.
  Rewriting that document is what answering it costs.
