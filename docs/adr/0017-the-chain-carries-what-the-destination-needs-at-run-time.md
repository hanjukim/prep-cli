# ADR-0017: The chain carries what the destination needs at run time

**Date:** 2026-08-01
**Status:** Accepted — narrows ADR-0013. That record put Claude Code in the
chain and verified it with `claude --version`; it did not notice that the
harness it installed has a runtime dependency of its own, or that everything the
chain goes on to clone is private. Node and gh are links ahead of it now, and a
GitHub login is a stop ahead of it — the script delivers the person to that
login and waits to be run again. The one question this record left to the
migration ticket — whether the mirror becomes public — was taken over by
ADR-0018 when that ticket closed without settling it, and ADR-0020 answers it:
the repository is public and lives at `hanjukim/prep-cli`. One of the two clones
this record calls private therefore is not, and gh remains a link for the other
— the project somebody names in step 11. Whether the login still belongs at
step 6 is the question ADR-0020 leaves open, and ADR-0021 answers it: the login
and the git identity move into the project step, the probe ahead of prep's own
clone stops being authenticated, and the script is ten steps rather than twelve.
Decisions 1, 4, 5 and 6 below are narrowed there; every step number in this
record is the numbering it was written under. Everything else stands.
**Sources:** ADR-0009, ADR-0011, ADR-0013, ADR-0015,
`https://claude.ai/install.sh`, `https://nodejs.org/dist/index.json`,
`https://github.com/cli/cli/releases`, a bare-Linux simulation run on 2026-08-01,
a real `curl … | bash` run on Linux and on WSL on 2026-08-01

## Context

ADR-0013 made Claude Code a link in the chain rather than a gap, and step 4 of
the script verified it the way every other link is verified, by running the
binary. Running the whole chain on a machine with nothing on it showed that this
verification is exactly where a new person stops.

The vendor installer at `https://claude.ai/install.sh` downloads a
platform-matched static binary, checks it against a checksum, and never mentions
Node, npm or nvm. It succeeds on a machine that has no Node at all. The `claude`
it leaves behind then refuses to start, and `claude --version` — the script's
own proof that the link holds — is enough to fail. A link was missing, and the
record that added the link did not see it.

The same simulation found two more places where the chain stops after real work
has already been done.

**git installs without an identity.** `user.name` and `user.email` unset is not
a problem until the first commit, which is well past the point where a script
could have asked.

**Everything the chain clones is private.** `PREP_REPO` defaults to the GitHub
mirror ADR-0015 chose, and an unauthenticated request for it returns 404. The
first reading of that was that the repository does not exist yet. It does exist:
GitHub answers an unauthenticated request for a private repository with 404
rather than 403, so that the name does not leak. Anonymous `git clone` therefore
fails for every correctly configured person, and the message it fails with —
repository not found — describes the wrong problem.

**The login cannot be run from inside the script.** The first version of this
record had the script call `gh auth login` itself, with all three streams
redirected back to `/dev/tty`, on the reasoning that the person is at a terminal
even though the script's own stdin is the pipe. A real `curl … | bash` run on
Linux stopped there:

```
could not prompt: unexpected escape sequence from terminal
```

`gh auth login` is a full-screen prompt that drives the terminal itself, and
pointing its three streams at `/dev/tty` does not put the terminal in a state it
can drive from inside a shell reading a pipe. More redirection is not the fix.
The mistake was running an interactive login from a script at all.

A second run, on WSL, found the other half of the same problem: the login wants
to open a browser and there is none to open. The same holds on a headless VM and
over SSH without display forwarding. What still works everywhere is the device
flow gh already uses — it prints a one-time code, and the code is entered at
`https://github.com/login/device` from whatever browser the person can reach,
on the Windows side or on another machine entirely.

## Decision

**The chain carries what the destination needs at run time, not only what the
destination's own installer asks for.** Node and gh are two instances of one
rule, and the GitHub login is part of it.

1. **Node is a link, installed before Claude Code and verified like every other
   link.** The order is package manager → git → bun → Node → gh → GitHub login →
   git identity → Claude Code → prep → gaps → project → `prep setup`.
2. **On Linux, Node comes from the official prebuilt tarball, unpacked into
   `~/.local`.** No sudo, no apt repository, no NodeSource key, no nvm. The
   version is pinned at **v24.18.1**, the current release of the v24 Krypton LTS
   line, which ships npm 11.16.0. The architecture is matched from `uname -m`:
   `x86_64|amd64` → `x64`, `arm64|aarch64` → `arm64`, anything else stops the
   run. The download is checked against the `SHASUMS256.txt` the release
   publishes, and a tarball that does not match is not unpacked.
3. **On macOS, Node comes from Homebrew**, which step 1 has already installed.
   On either platform, a machine that already has `node` gets nothing.
4. **A git identity is a link, and it sits after the login.** The script asks
   for a name and an email when `git config user.name` or `user.email` is unset,
   and sets them globally. It offers answers rather than demanding them: one
   `gh api user` call gives the account's `name`, its numeric `id` and its
   `login`, and the email is offered as
   `<id>+<login>@users.noreply.github.com` — the address GitHub itself hands out
   for commits, which is safe to publish and always correct for that account.
   Enter takes what is offered, anything typed replaces it, and a `gh api user`
   that cannot answer leaves the step asking outright, the way it asked before.
   A run with no terminal cannot ask, so it stops there and names the two
   commands to run, in the same voice as a link that failed.
5. **gh is a link; its login is the person's.** gh is pinned at **2.97.0** and
   arrives the same way Node does: the vendor's release tarball on Linux,
   Homebrew on macOS, verified against the release's own
   `gh_2.97.0_checksums.txt`. The login is not run from the script. `gh auth
   status` decides: a login already there is skipped, and no login stops the run
   with the command to go and run — `gh auth login --git-protocol https --web` —
   and the device-flow URL to fall back to when no browser opens.
   `gh auth setup-git` still runs from the script once a login exists, because
   it is non-interactive and it is what makes plain HTTPS `git clone` work
   afterwards.
6. **Access is asked about before each clone, with an authenticated call.**
   `gh repo view <owner>/<repo>` runs ahead of the clone. A failure is reported
   as what it is — an account that has not been added to the organization — and
   names the account, not a broken machine. A URL that is not on github.com is
   left to git.

7. **The harness's plugins are installed with the harness.** `mattpocock-skills`
   and `caveman` are added from their marketplaces and installed in the same
   step that installs Claude Code, through `claude plugin`, which is an ordinary
   command with an exit code rather than something typed at a session prompt.
   Every line is idempotent, so a second run passes through. Seeding the first
   `claude` session with a `/plugin install` prompt was considered and rejected:
   that first run is the login, the prompt would arrive before the person is
   authenticated, and a session command is not a prompt in the first place.
   Installing a plugin stays outside prep — `plugins.ts` turns installed plugins
   on for a project and never installs one — and the script is the one thing
   that changes the machine (docs/adr/0009), so it is the script that installs
   them.

**Decision 6 reverses the position taken earlier in this work**, which was that
clone credentials are a person's step outside the script and the script should
only detect the failure and stand aside. The simulation is what changed it. A
person who is stopped by an anonymous 404 cannot tell a repository that does not
exist from one they have not been invited to, and standing aside hands them the
one message that is wrong in both cases. gh is already the tool this
repository's own agent conventions use, so the login is not a new dependency —
it is the one that was being assumed.

**Carrying a dependency and performing an authentication are different things,
and the boundary of this record falls between them.** The rule at the top —
the chain carries what the destination needs at run time — is about software.
gh is software, so the chain carries it. A login is not software: it is a
person proving who they are, through a browser, to a party that is not this
machine. Nothing can be carried on their behalf. So the script's job ends at
delivering the person to the login and stopping in front of it.

This is the pattern the repository already had, and the login was made the
exception. ADR-0009's consequences and ADR-0013's fifth decision both say the
same thing about the Claude Code login: a step the script cannot take is one it
stops at and hands over. The GitHub login is the same kind of step, and treating
it as a link that could be automated is what broke. Both logins are now handled
alike, and the only difference left is where they fall — the GitHub one in the
middle, because two clones depend on it, and the Claude Code one at the end.

## Rationale

- **The failure was silent in exactly the way ADR-0013 set out to avoid.** That
  record put the verification in because an install can report success and leave
  nothing usable. It got the shape right and the depth wrong: the check ran, and
  the thing it was checking needed something nobody had installed.
- **nvm is the wrong tool at this point in the chain.** It is a shell function
  sourced from an rc file, so a non-interactive script cannot see it — the
  script would install it and `command -v node` would still find nothing. It is
  also a version manager, which is a thing to learn, and the person this chain
  exists for has not asked to manage Node versions.
- **A distro package needs sudo and gives a version nobody chose.** apt's `node`
  is old on a stable release and absent on some, and the apt line in step 1 is
  already as much root as this script asks for.
- **NodeSource means adding a third-party apt repository and a GPG key** to
  somebody's machine, permanently, to fetch a build that nodejs.org serves
  directly. The cost outlives the install.
- **The tarball matches how everything else in this chain arrives.** brew, bun
  and Claude Code are all a vendor build unpacked into a user directory, and
  `~/.local/bin` was already on the PATH the script exports for Claude Code. The
  same routine now serves Node and gh, which is why they read alike.
- **A pin rather than latest, for both.** Every machine this script builds
  carries the same pair, a release that breaks something cannot reach anybody
  before it has been looked at, and a checksum can be stated about a version but
  not about "whatever is newest".
- **The checksum is the vendor's, and it is checked.** Both releases publish one
  per file. Downloading over TLS and unpacking without looking would leave the
  one step where a wrong file becomes an executable in `~/.local/bin`.
- **Asking for a git identity costs two lines now and a lost commit later.**
  There is no cheaper moment: the script has a terminal and the person's
  attention, and neither is true when their first commit is refused.
- **After the login there is nothing left to ask.** The step used to sit at 3,
  ahead of gh, so it had to ask a person to type a name and an email that GitHub
  already holds. Moved behind the login it reads them instead, and on the second
  run — the run that happens after somebody logs in, which is now the ordinary
  run — the step passes with nothing typed at all. The stop at the login is what
  paid for this: it split the chain into two runs, and the second one knows
  things the first did not.
- **The no-reply address is the right default, not a placeholder.** GitHub mints
  `<id>+<login>@users.noreply.github.com` for exactly this, attributes commits
  carrying it to the account, and reveals nothing the account has not published.
  Offering a person's real address instead would put it in every public commit
  they make, which is a decision this script has no business taking for them.
- **`gh auth setup-git` cannot replace the identity step.** It writes a
  credential helper and nothing else — `user.name` and `user.email` are
  untouched by it. The script says so in a comment, because the two steps now
  sit next to each other and the next reader will wonder.
- **Stopping is cheap because every step is guarded.** The script already skips
  what is installed, what is cloned and a login that is there. That property is
  what makes a stop a pause rather than a restart, and the message says so, so
  that nobody reads the stop as lost work.
- **A `GH_TOKEN` path was left out on purpose.** `gh auth login --with-token`
  would let a run finish without a person, and it is the wrong thing to reach
  for here: this script's reader is somebody who has never opened a terminal,
  and a token is a thing they would have to go and mint first. A headless run is
  a separate question with a ticket of its own.
- **`gh auth login` writes a credential helper, which is what makes plain
  `git clone` over HTTPS work.** That is the whole reason the login sits ahead
  of both clones rather than beside them. `gh auth setup-git` is run rather than
  assumed, because a login made some other way — an environment token, an older
  gh — may never have written it.
- **An SSH key was the alternative and it is more steps, not fewer.** Generate,
  add to the agent, paste into a browser page the person has to find. gh does
  the browser step itself and leaves HTTPS working.
- **An anonymous reachability probe would have been worse than nothing.** Asked
  before the login, `git ls-remote` on the default `PREP_REPO` returns non-zero
  for every correctly configured person, and the script would stop a run that
  was about to succeed. The check has to be authenticated, and it has to sit
  after the login. That is why `gh repo view` replaced it.
- **The 404 is not a missing repository, and no login makes a missing one
  appear.** `gh auth login` fixes the case where the repository is private and
  the account is a member. It does nothing for a URL that is wrong, and the
  message says so by naming the account rather than the URL.

## Consequences

- **The script is twelve steps.** Everything from Claude Code onward is
  renumbered, and comments in the script that referred to steps by number moved
  with them.
- **Two versions are pinned in the script and have to be bumped by hand.**
  `NODE_VERSION` and `GH_VERSION`, each beside the URL it builds. Neither has an
  automatic route to a newer release, which is the point.
- **`xz-utils` joins the apt line.** The Node tarball is `.tar.xz`, and a
  minimal image is not guaranteed to carry the decompressor.
- **ADR-0015 calls the mirror a "public GitHub mirror" and it is private
  today.** That matters beyond the clones: the entry point is a `curl` one-liner
  against `raw.githubusercontent.com`, and an anonymous reader cannot fetch it
  either. This record does not change ADR-0015's decision — whether the mirror
  becomes public belongs to the migration ticket. It records that the decision
  and the world do not currently agree.
- **So `gh auth login` is not a convenience for people with private
  repositories. It is what makes the chain work at all, today.** Remove it and
  the script cannot clone prep on any machine.
- **A run with no terminal stops, and it now has two places to stop.** The
  identity step and the login step both need a person. CI cannot take this
  script end to end, and that is the honest shape of a chain whose last link is
  a browser login anyway.
- **A first run on a machine with no GitHub login ends at step 6.** That is the
  ordinary path now, not a failure: the person logs in, runs the one-liner
  again, and the second run walks through everything already installed and stops
  at nothing. The message at step 6 says this in as many words, because a stop
  that reads as a crash costs more than the stop itself.
- **The identity step moved from 3 to 7 and steps 4, 5 and 6 each moved down
  one.** bun, Node and gh are now 3, 4 and 5; the login is 6. Claude Code onward
  keeps its numbers. The comments in the script that name steps moved with them.
- **`gh auth login` no longer appears as something the script runs**, so the
  only place a person meets it is the message that hands it to them. The command
  named there carries `--git-protocol https --web`, which skips two menu
  questions and picks the protocol `gh auth setup-git` configures a helper for.
  Naming SSH there would leave the clones without credentials.
- **Node arrives with npm and npx**, symlinked beside it. Nothing in this
  project uses them — bun is the runtime — but they are what a Node install is,
  and a harness that shells out to npm finds one.
- **Nothing writes a shell rc.** Both installs go to
  `~/.local/share/<tool>/<version>` with symlinks into `~/.local/bin`, which is
  the shape Claude Code's own installer uses, and the script exports that
  directory for its own run as ADR-0013 settled. The person is still told to
  open a new terminal at the end.

## Unverified

- **The Linux arms have not been run on Linux from this branch.** The download,
  the checksum comparison and the unpack were exercised on macOS against the
  real `node-v24.18.1-linux-x64.tar.xz` and `gh_2.97.0_linux_amd64.tar.gz`,
  including a deliberately corrupted copy to confirm that a mismatch stops
  rather than unpacks. What macOS cannot exercise is `sha256sum`, which is what
  the script calls; the local check used `shasum -a 256 -c -`, which reads the
  same input format.
- **The Homebrew arms were not re-run.** `brew install node` and `brew install
  gh` are taken on the same footing as the `brew` calls already in step 1.
- **gh 2.97.0 was released on 2026-07-31, one day before this record.** It is
  the current release and the version the author's own machine runs, and it has
  had no time in the field.
- **The identity defaults were exercised against a stub, not against a fresh
  account.** The `gh api user` query, both answers taken with Enter, both
  overridden by typing, and the fallback when the call fails were all run
  through a pseudo-terminal with a fake `gh`. The shape of the real reply was
  confirmed against `gh api user` on the author's own account. What has not been
  seen is a brand-new GitHub account with `name` unset, which is the case the
  field order in the query exists to survive.
- **Whether `claude` needs Node past `--version` is not established.** The
  failure was observed at `--version`, which is enough to justify the link. What
  else breaks without Node was not explored, because nothing needed it to be.
