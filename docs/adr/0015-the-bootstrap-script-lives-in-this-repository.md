# ADR-0015: The bootstrap script lives in this repository

**Date:** 2026-08-01
**Status:** Accepted — settles what ADR-0009 left open. Decision 2's "public"
has not held, and how the mirror is filled is settled by ADR-0018. ADR-0019 then
makes that repository the home rather than a mirror, so "here" in this record's
title is the repository the script now ships from. The URL, the branch, and
everything else here stand.
**Sources:** ADR-0009, ADR-0013

## Context

ADR-0009 made a shell script the entry point and closed with one sentence
leaving its home open: where the script lives and how it is hosted is not
decided there. Two things now force the question. The script is a `curl`
one-liner, so it needs a URL a person can be given. And it clones prep itself,
so it needs a second URL that resolves from wherever that person is sitting.

This repository's `origin` is a self-hosted Gitea on a private address. Nobody
outside the network can reach either URL through it.

## Decision

**The script is `scripts/bootstrap.sh` in this repository, and it is served from
a public GitHub mirror.**

1. **One repository.** The script sits beside the code whose contract it reads.
2. **The mirror is `github.com/Inkflockteam/prep-cli`.** The one-liner is
   `curl -fsSL https://raw.githubusercontent.com/Inkflockteam/prep-cli/main/scripts/bootstrap.sh | bash`,
   and the clone in step 5 comes from the same place. Gitea stays the remote
   this work is pushed to; the mirror is what the outside world reads.
3. **The gap reader is `scripts/gaps.ts`.** Turning `prep doctor --json` into a
   list of commands is the script's own logic, not prep's, so it lives with the
   script and not in `src/`. It runs under the bun the script has just
   installed, which is what keeps `jq` out of the chain.
4. **prep is cloned to `~/.prep-cli` and linked with `bun link`.** The clone is
   what the person keeps; a second run updates it with `git pull --ff-only`
   rather than cloning again.

## Rationale

- **The script and the contract move together.** ADR-0009 decision 3 made
  `prep doctor --json` the interface between them: change the guidance shape and
  the script stops installing things. In one repository that is a single commit
  and a single review, and CI runs the script's own tests against the very
  registry it reads. Split across two, the contract could land and the consumer
  follow a week later, with nothing failing in between.
- **A separate repository buys a shorter URL and nothing else.** The one-liner
  is pasted, not typed, so its length is not a cost anybody pays.
- **The script's tests are prep's tests.** `scripts/gaps.ts` selects over the
  registry — which entries are harnesses, which guidance carries a command. The
  test that holds it needs `src/registry.ts` in the same checkout.
- **The mirror is a mirror, not a move.** Issues, review and history stay on
  Gitea, which is where the work happens. GitHub carries what a stranger has to
  be able to fetch: one raw file, and a clone.

## Consequences

- **The mirror has to be pushed for the one-liner to work.** A commit that only
  reaches Gitea changes nothing for anybody running the script, so a release of
  the script is a push to the mirror.
- **The script depends on being cloned to run.** Steps 6 and 8 call
  `scripts/gaps.ts` and `prep` out of `$PREP_DIR`, so the file curled at step 0
  and the file executed at step 6 come from the same commit only if the mirror
  is up to date with itself. Both come from `main`.
- **`PREP_REPO`, `PREP_DIR`, `PREPARED_REPO` and `PROJECT_DIR` are overridable
  by environment variable.** A fork, a test VM, or a second project needs no
  edit to the script.
- **CI gains a shellcheck job.** The script is the one file in the repository
  that nobody type checks by running it, since running it installs a machine.
