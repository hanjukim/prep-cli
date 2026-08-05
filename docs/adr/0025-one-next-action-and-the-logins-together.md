# ADR-0025: One next action, and the two browser logins together

**Date:** 2026-08-06
**Status:** Accepted — extends ADR-0024 decision 8, which drew one line between
two rules and now draws the whole next action there, and reorders what ADR-0021
decision 4 and ADR-0013 decision 5 put on the ending. What those records decided
stands: a login is handed over rather than run, and the machine-only ending is
where the run that made none reads about it. What changes is which of the things
an ending prints is the one it highlights.
**Sources:** ADR-0009, ADR-0013, ADR-0017, ADR-0020, ADR-0021, ADR-0024, issue
#5, and three real `curl … | bash` runs on fresh `debian:trixie` containers on
2026-08-06

## Context

Two faults in the same thing — what the script says when it hands work back to a
person.

**The stop in front of the GitHub login said nothing about the login behind
it.** Naming a repository on github.com reaches `require_github_login`, and with
no login that calls `fail`, which prints its message and exits. The closing
message never runs, and the closing message was the only place the Claude Code
login was named. So somebody who named a private repository on a fresh machine
ended up with everything installed, a `gh auth login` to go and run, and no word
that a second browser login was waiting behind it. They heard about it only if
they came back and ran the script again.

Both logins are the same kind of step. A browser authentication cannot be
performed on somebody's behalf (ADR-0017), which is why the script hands each of
them over — and somebody who is opening a browser for one may as well be opening
it for both.

**The ending said five things at once.** A finished run printed, in order: the
env line drawn between two rules (ADR-0024), where the project is, gaps that
would not install, the GitHub login when gh held none (ADR-0021), the git
identity, the Claude Code login and the account tiers it needs, Codex's own
login, and `prep doctor`. Nothing marked which of them was the thing to do, so
the run's own emphasis went to the env line — which is a prerequisite, not a
destination — and a person who read the first block and stopped had read a `.`
command and nothing about what it was for.

**And one of those lines sent people back through the entry point.** The
machine-only ending told somebody to run `curl … | bash` again to answer the one
question they had skipped. By then prep is installed and the machine is built, so
the two commands that finish the job are ordinary ones. Re-downloading the script
to answer a question is what a stop needs, not what a finished run needs.

## Decision

**A run that hands work back names one action, and says everything else as
reference.**

1. **`announce_next_action` prints the one thing to do.** It takes a headline and
   the commands that perform it, and draws them between the two rules ADR-0024
   decision 8 introduced, under a bold `Next:` line. It is the first thing the
   ending prints after `==> Done`.
2. **The env line leads those commands and keeps the reverse video.** It is
   still the one line that decides whether the lines under it are found at all
   (ADR-0024), so it sits inside the block as its first command rather than in a
   block of its own above it. Nothing else in the ending is emphasised, which is
   what makes the block readable as one action instead of two.
3. **Everything else goes under `==> For reference`.** The heading is what turns
   a list of facts into a list of facts: gaps that would not install, the logins
   the script cannot perform, the git identity, Codex, `prep doctor`. The run's
   own leftovers come first, because they are the only lines about what just
   happened rather than about what always holds.
4. **The machine-only ending's next action is `git clone` and `prep setup`.**
   Not `curl … | bash`. prep is installed by then, so both commands are ordinary
   ones, and neither needs a terminal to be asked on — which is what the
   ending's terminal / no-terminal branch existed for, so it goes. `SCRIPT_URL`
   keeps its one reader: the stop at step 9, which is resuming an unfinished run
   and does need the one-liner (ADR-0024 decision 3).
5. **The GitHub login moves under reference on that ending, and stays there.**
   ADR-0021 decision 4 put it on the machine-only ending because that run needed
   no account and the work after it does. It is still said, still guarded by
   `gh auth status`, still ahead of the two identity commands — but as reference
   beside the clone it serves, not as the action. The action is getting the
   project; the login is what the clone may need when the project is private.
6. **`claude_login_note` is one wording, printed from both places that send
   somebody to a browser.** The closing message, and the stop in front of the
   GitHub login — which is a run that ends before reaching the closing message,
   so it says the Claude Code login itself, as the second of two to do in one
   sitting. The script's other stops send nobody to a browser and print nothing,
   and each of them reaches the closing message on the run that follows it.

## Rationale

- **An ending is read from the top, and only sometimes past the first block.**
  Install output has just scrolled by, and everything on that screen looks alike.
  The cost of ranking wrongly is not confusion but silence: the person acts on
  the first thing they see, so the first thing has to be the action.
- **One browser trip is cheaper than two.** Both logins are person-steps for the
  same reason, and neither can be run for anybody. The stop is where a run most
  often ends, so it is the one message that has to carry both.
- **A finished run has nothing to resume.** Handing back the entry point is what
  a stop does, because the second run walks through what is done and carries on
  (ADR-0017). A finished run has built the machine; asking it to be rebuilt to
  answer one question spends a whole chain on one line of input.
- **The env line is a prerequisite, so it reads as one.** ADR-0024 gave it the
  emphasis because nothing else in the ending was competing for attention. Now
  something is, and the fix is not to take the emphasis away — a person who
  misses that line finds none of the commands under it — but to put the action
  and its prerequisite in one block, in the order they are performed.

## Consequences

- Verified by three real runs on fresh `debian:trixie` containers, each crossing
  the whole chain — apt, git, bun, Node, gh, Claude Code, the plugins, prep, and
  every gap `prep doctor --json` named:
  - **stopped at the GitHub login**, given a github.com url and no account. The
    message names `<path>/gh auth login`, the one-liner that resumes the run, the
    env line, the device-flow page, and then the Claude Code login as the second
    browser step to do in the same sitting.
  - **no project named.** One `Next:`, no `curl` anywhere, and the run had no
    terminal, so it read exactly what an interactive run that presses Enter
    reads. The GitHub login and the git identity landed under reference.
  - **cloned a project and set it up**, from a bare repository on the container's
    own disk — a path rather than a github.com url, so the run met no login it
    had no account for. The ending is `cd` and `claude`.
- **A cloning run still shows two `Next` sections.** `prep setup` prints its own
  `Next (2)` and the script's block lands under it. The script's ending names one
  action, which is what issue #5 asked for; whether prep's report should give way
  when the script is its caller is a question about the **next step** concept in
  `CONTEXT.md`, and is left open here.
- **The `These would not install` block was not exercised on a real machine.**
  Every gap installed in all three runs. `test/bootstrap.ending.test.ts` covers
  it by running `closing_message` with `FAILED_GAPS` set, and the omission is
  written down rather than passed over.
- `test/bootstrap.ending.test.ts` runs both handovers rather than grepping the
  script for them: the functions are lifted out by name and executed, because
  sourcing the script installs a machine the moment it is read.
