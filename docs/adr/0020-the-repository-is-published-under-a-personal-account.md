# ADR-0020: The repository is published, and its home moves to a personal account

**Date:** 2026-08-05
**Status:** Accepted — closes the question ADR-0018 and ADR-0019 both left open,
and changes the repository ADR-0015 named. Everything ADR-0017 says about a
clone the reader cannot see still holds for the project clone in step 11.
**Sources:** ADR-0015, ADR-0017, ADR-0018, ADR-0019; the tree scan of 2026-08-05

## Context

The entry point did not work for anybody.

ADR-0015 made the first thing a person runs a `curl` of a file served from the
GitHub repository, and ADR-0017 recorded that the repository was private. Those
two facts cannot both stand. `raw.githubusercontent.com` carries no browser
session and no `gh` token, so the one-liner came back 404 for every reader —
including the invited ones it was written for. The README said so in a
paragraph, which is a note about a broken line rather than a working line.

The chain cannot open that door from the inside. The script is what installs
`gh` and stops in front of the GitHub login; the fetch that delivers the script
happens before either. Link zero has to sit outside authentication or there is
no chain.

Every way of keeping the repository private buys that one file an anonymous
host somewhere else — a gist, a second public repository, a domain. Each of them
splits the script from the contract it reads, which is the arrangement ADR-0015
rejected, and each needs a copy kept honest by something, which is the failure
ADR-0019 has just finished removing. They also all expire: whatever holds the
script has to be anonymously readable, so "private" was never going to mean
unreadable — only unindexed.

What kept this repository unpublished was about the history, not the tree. The
scan behind ADR-0018 found nothing in any file at any commit; what it returned
sat in commit metadata, and `git archive` dropped all of it by construction. The
tree that would become public is the tree that was already clean.

## Decision

**The repository is public, and its home is `github.com/hanjukim/prep-cli`.**

1. **It is published.** The one-liner is a line anybody can be handed, with
   nothing in front of it and nothing after it, which is what ADR-0009 asked of
   an entry point in the first place.

2. **The home moves to a personal account.** `LICENSE` names one copyright
   holder, `package.json` names one author, and every commit has one. The
   organisation was where ADR-0015 pointed a mirror, not a statement about who
   owns the work. `Inkflockteam/prep-cli` is deleted rather than kept as a fork
   or an archive: a second copy under a dead address is something for a later
   reader to mistake for the home. If an organisation becomes the right owner,
   the move is a transfer, which leaves a redirect behind — a fork would not.

3. **Two published strings change with it**, and they are the only ones:
   `SCRIPT_URL` and `PREP_REPO` in `scripts/bootstrap.sh`, quoted in `README.md`
   and in the script's own header.

4. **The gate is closed on a scan of this tree, recorded with its limits.** All
   78 tracked files were read for URLs outside the hosts the chain already
   names, private and link-local addresses, `.local`/`.internal` hostnames, mail
   addresses, `sk-`/`ghp_`/`gho_`/`github_pat_`/`AKIA` prefixes, PEM private-key
   headers, assignments to password/secret/api-key names, and absolute
   `/Users/`, `/home/` and `C:\Users` paths. All three commits were read for
   trailers, and every ref was listed. Nothing came back but two placeholders in
   the script — `you@example.com` in the advice it prints, and the `git@github`
   prefixes it strips when parsing a remote.

   **This is a pattern scan and it finds what it has a pattern for.** No
   dedicated scanner was run; none is installed on the machine this was decided
   on. It is a judgement that was made and written down, not a sign-off, and it
   is recorded here so a later reader knows exactly which one was made.

5. **Authorship is rewritten to the account's noreply address before
   publication.** The three commits carried a personal mail address inherited
   from the machine's global git configuration. The address on them now is the
   `<id>+<login>@users.noreply.github.com` form — the same one this project's
   own script offers every new person, for the same reason it gives them: it is
   safe to publish and always right for that account. The machine's global
   configuration was changed with it, so the advice and the machine agree.

6. **The commits are signed.** They were signed before; `git filter-branch`
   strips signatures, so they were signed again after the rewrite. The backup
   ref that command leaves behind — `refs/original/...`, the exact object
   ADR-0018 named as something nobody should have to remember — was deleted and
   the ref list checked empty before anything was pushed.

7. **Where the login belongs in the chain is left open.** Publication removes
   one of the two reasons `gh` and its login stand at step 6: prep's own clone
   no longer needs an account. The project clone in step 11 still may, so the
   link stays. But a run that clones no project now stops in front of a login it
   does not need, on the one path that was otherwise unattended. Moving it is a
   change to an order that was settled by real runs on Linux and WSL
   (ADR-0017), and it is filed as an issue rather than folded in here, so that a
   run that breaks has one cause to look at and not two:
   `https://github.com/hanjukim/prep-cli/issues/2`. It is written out because a
   bare `#N` in these records means the self-hosted instance and nothing here
   (`docs/agents/issue-tracker.md`).

## Rationale

- **The alternative was to buy the one file an anonymous home somewhere else,
  and every version of that costs more than publishing.** A gist or a second
  repository separates the script from the `--json` contract it consumes, so the
  change to the contract and the change to its consumer stop being one commit
  (ADR-0015). Keeping the copy honest then needs a step, and a step performed by
  a person is the failure ADR-0019 removed — a fix that landed and never
  travelled, discovered later as a machine built from a file nobody would
  recognise as stale.
- **"Private" here never meant unreadable.** The URL is meant to be pasted into
  a terminal by somebody who was handed it. Any host that serves it to that
  person serves it to anybody who has the line. What was actually being kept was
  non-discoverability, and that is not what a 404 for invited accounts buys.
- **Nothing that kept this repository unpublished describes the thing being
  published.** ADR-0018's findings were commit metadata; this repository's
  history begins at an archive and has no such metadata in it. Citing that
  record as a reason to stay private cites a fence around commits that do not
  exist here.
- **A fork under the organisation would have been the wrong shape twice.** The
  name is taken there, so it could not carry it; and a fork announces itself as
  a copy of somewhere else, which is either false or an argument for the
  organisation being the home instead.

## Consequences

- **This cannot be undone.** A public repository can be cloned, forked and
  indexed, and making it private again takes none of that back. It was published
  with no forks and no stars, so the window in which that mattered was closed by
  acting early rather than by anything that can be relied on later.
- **`#N` in these records resolves for nobody.** Every one of them is an issue
  on the self-hosted instance, as `docs/agents/issue-tracker.md` already says.
  Publication widens the audience for records that carry unresolvable numbers;
  the numbers are still worth more than deleting the citations.
- **The old address stops working entirely.** `Inkflockteam/prep-cli` is
  deleted, so no redirect stands behind it. Anybody holding the previous
  one-liner has a line that fails, which is the same failure they had before
  publication and is fixed by taking the new one.
- **Every future commit is signed and attributed to the noreply address**, on
  this machine and for every repository on it.
- **npm is out of scope.** The chain installs prep from a clone, so publishing
  the repository publishes the tool. Whether the package is ever pushed to a
  registry is a separate question and this record does not open it.
