# ADR-0021: The GitHub login moves to the clone it serves

**Date:** 2026-08-05
**Status:** Accepted — amends ADR-0017 decisions 1, 4, 5 and 6, and answers the
question ADR-0020 left open. The chain rule that record states is untouched:
the chain still carries what the destination needs at run time. What changes is
where one link falls, now that one of the two clones behind it has gone away.
ADR-0025 keeps decision 4 and moves what it hands over: the identity and the
GitHub login are still named on the machine-only ending, now under its reference
heading rather than as the thing to do next.
**Sources:** ADR-0009, ADR-0013, ADR-0015, ADR-0017, ADR-0020, issue #2, an
observed refusal from `gh repo view` on a public repository with no login, and a
real `curl … | bash` run on WSL on 2026-08-05

## Context

ADR-0017 put the GitHub login at step 6, ahead of everything that clones,
because both clones the script makes were of private repositories. ADR-0020
published prep's own repository, so the clone at step 9 is of a public
repository and asks nothing of an account. The other reason stands: the project
somebody names at step 11 is theirs to choose and may be private, and an
unauthenticated request for a private repository comes back 404 rather than
forbidden, so a clone without a login fails while describing the wrong problem.

What that leaves is a run that clones no project. Somebody who presses Enter at
step 11 wanted a ready machine, and step 6 is then the only thing on that path
that asks for an account. It is also the one place the script gives up and ends
the run: with no login it calls `fail`, so the machine-only path dies two thirds
of the way through and has to be started again for a step it no longer needs.

Two facts settled the shape.

**The step 9 probe needs a login although its repository is public.** `gh` makes
no unauthenticated API call at all. Against `cli/cli`, a public repository, with
an empty configuration directory:

```
$ gh repo view cli/cli
To get started with GitHub CLI, please run:  gh auth login
Alternatively, populate the GH_TOKEN environment variable with a GitHub API
authentication token.
```

So moving the login alone would not have freed the machine-only path. The probe
ahead of prep's own clone was a second consumer of it, and an unnoticed one.

**Step 6 cannot know whether a project is coming.** The project question is
asked at step 11 on purpose, where the answer is used and where going unanswered
still ends well (ADR-0015). On an interactive run with nothing in the
environment, step 6 has no way to tell an Enter at step 11 from a repository
url. Making step 6 conditional on there being a project would mean asking for
the project at step 6, which is the arrangement the entry point exists to avoid.

## Decision

**The login belongs to the clone that needs it, so it moves inside the step that
asks for that clone.** Not before the question — a login placed there would stop
the machine-only run exactly as step 6 does — but after it, on the branch where
a repository was actually named.

1. **The GitHub login moves into the project step, after the question and before
   the clone.** It stops the run the same way it did at step 6, naming
   `<path to gh> auth login --git-protocol https --web` and the device-flow page,
   and everything installed stays installed for the second run. It is reached
   only when the url names a repository on github.com: a project hosted anywhere
   else has no use for a GitHub account, and asking for one would be asking for
   nothing. `gh auth setup-git` and the `gh api user` call that names the account
   travel with it.
2. **The step 9 probe stops being authenticated.** prep's own repository is
   public, so `git ls-remote` answers for it without an account, under
   `GIT_TERMINAL_PROMPT=0` so a repository that has become invisible fails
   rather than stopping to ask for a password. What the probe guards against is
   a repository that moved or was renamed, which git answers as well as gh did.
   The authenticated probe stays where it is still authenticated: ahead of the
   project clone, where the account that is logged in is exactly what the message
   has to name.
3. **The git identity moves with the login and keeps its offered answers.** It
   sits after the login on the project branch, so `gh api user` still supplies
   the name and the `<id>+<login>@users.noreply.github.com` address, and Enter
   still takes both. ADR-0017 decision 4 put it after the login for this reason,
   and the reason is preserved by moving the pair rather than the login alone. On
   a project whose url is not on github.com there is no login, and the step asks
   outright the way it asked before.
4. **The machine-only run is told about the identity rather than asked for it.**
   Pressing Enter at the project question now ends the run before the identity
   step, so the closing message names the two `git config --global` commands when
   the identity is unset — the same voice the run with no terminal already used,
   and the same voice the closing message uses for the Claude Code login. The
   machine-only ending is a place where things are handed over, and this is one
   more of them.
5. **The chain is eleven steps rather than twelve, and nothing else is
   reordered.** Steps 6 and 7 are gone from the numbering, so what was step 8
   onwards moves up. The order of the links themselves — package manager, git,
   bun, Node, gh, Claude Code, prep — is exactly the order ADR-0017's real runs
   established.

**Decision 4 is the one that gives something up.** ADR-0017 made the identity a
link because git installed and git usable are not the same thing: with no
`user.name` and `user.email` every commit is refused, and the person finds that
out at the end of their first piece of work rather than at the start. A
machine-only run now ends without one. What it gets instead is two commands in
the closing message, which is where that run already reads what is left for it to
do — the Claude Code login is named there and nowhere else. The alternative was
to ask outright on that branch, which spends a question on somebody who asked for
a machine and pressed Enter to get one.

## Rationale

- **The question and the login are one thing, so they belong together.** The
  entry point's rule is that the project is asked for where the answer is used.
  The login exists to make that answer usable. Splitting them across five steps
  is what let one outlive the other's reason.
- **A login is still not a link (ADR-0017).** Nothing here automates it. The
  script installs gh, hands the login to the person, and stops in front of it.
  Only the place it stops has changed.
- **No evidence is overturned, because no order is changed.** ADR-0017 settled
  the order of the installs on real runs, on Linux and on WSL. Every install
  keeps its position relative to every other. What moves is a stop and a
  question, both of which sit after the last install.
- **The unauthenticated probe is not a weaker probe for a public repository.**
  `gh repo view` answered two questions at once — does this exist, and can this
  account see it. For a public repository the second has one answer for
  everybody, so only the first is left, and `git ls-remote` is the tool that
  answers it without an account. Against the project clone, where both questions
  are still live, gh stays.
- **A second run costs a person almost nothing.** Every install is guarded, so
  somebody stopped by the login walks back through finished work in seconds. That
  was true at step 6 and it is true at the project step; what changes is that the
  path with no project never meets the stop at all.

## Consequences

- The machine-only path — a fresh machine, Enter at the project question — asks
  for no account of any kind and runs to the end without stopping.
- Somebody with a private project meets the login later in the run than before,
  after the machine is already built. Their first run sets no git identity, since
  the identity now sits behind the login; their second run, made after logging
  in, sets it with both answers offered.
- A project hosted outside github.com never meets the GitHub login, and its
  identity step asks outright.
- `require_repo_access` splits in two: one function that asks git whether a
  repository is there, and one that asks gh whether this account can see it.
- ADR-0017's decision 1 no longer describes the script's order, and its decisions
  4, 5 and 6 are narrowed by decisions 1 to 3 above. Its rule — the chain carries
  what the destination needs at run time — is unchanged.

## Verified

**A real run on WSL, on 2026-08-05, took the machine-only path end to end.** It
reached the project question having never mentioned a GitHub account, pressed
Enter there, and finished:

```
This machine is ready. No project was named, so nothing was cloned
and nothing was set up.

git has no name and email to commit under yet, and every commit
needs both. Set them yourself:
  git config --global user.name "Your Name"
  git config --global user.email "you@example.com"
```

That is the acceptance test issue #2 asked for, and decision 4 in the second
paragraph of it. The run also had to clear ADR-0022 first: the same machine held
a Windows npm install of Claude Code, which the script took for its own until
`have` learned to refuse one.

**The native-Linux run was not repeated.** ADR-0017 gathered evidence on both
because what it changed was how tools are installed, and installers differ by
platform: apt against brew, a tarball against a formula. Nothing here touches an
install. What moved is a question, a stop and a probe, all of them plain bash
that WSL runs exactly as Linux does. One run is taken as enough for this change,
and the omission is written down rather than passed over.
