# ADR-0023: One next action, and the logins handed over together

**Date:** 2026-08-05
**Status:** Accepted — narrows ADR-0021 decision 4, which said the Claude Code
login is named in the closing message and nowhere else, and takes the
machine-only ending's `curl … | bash` line with it. ADR-0013 decision 5 is
unchanged: it says the login is handed back, not where. ADR-0020 decision 3
loses one of its two strings, since `SCRIPT_URL` is gone. Nothing about where
the GitHub login falls is changed.
**Sources:** ADR-0009, ADR-0013, ADR-0015, ADR-0017, ADR-0020, ADR-0021,
issue #5, and three real `bash scripts/bootstrap.sh` runs on fresh Debian
machines on 2026-08-05

## Context

Two faults in the same thing: what the script says when it hands work back to a
person.

**The stop says nothing about what comes after it.** ADR-0021 moved the GitHub
login inside the project step. Naming a repository on github.com reaches
`require_github_login`, and with no login that calls `fail`, which prints its
message and exits. The closing block never runs — and the closing block was the
only place the Claude Code login was named. So somebody who names a private
repository on a fresh machine ends up with everything installed, a
`gh auth login` to go and run, and no word that a second browser login is
waiting behind it. They hear about it only on a later run.

The two are the same kind of step. Both are browser authentications no script
can perform (ADR-0017), and both are handed to the same person in the same
sitting if they are handed over together.

There is nothing to restore here: `git log -S "One thing is left for you"`
reaches only the seed commit. The text has always lived in the closing block
alone, and `fail` has never reached it.

**The ending says too much.** A finished run printed, in order: where the
project is, two lines to start working, any gaps that would not install, the
Claude Code login, which account tiers carry it, Codex's separate login, and
`prep doctor`. Four topics under one heading, with no mark of which one is the
thing to do. A person reads the first and stops.

The machine-only ending had a fault of its own. It closed with the entry point's
own one-liner, `curl … | bash`, as the way to come back for the project — a
whole second run of a ten-step script to answer one question. By the time that
line is read, prep is installed and the two commands that finish the job are
ordinary ones.

## Decision

**Whatever else a run prints, one thing is the next action, and it is the one
that stands out.**

1. **The ending prints one action, alone and indented, above a
   `==> For reference` heading.** Everything after that heading reads as
   reference rather than as instruction: the gaps that would not install, the
   Claude Code login and the account it needs, Codex's own login, and
   `prep doctor`. The action is `cd` into the project and `claude` on a run that
   cloned one, and `git clone` plus `prep setup` on a run that did not. Both are
   two lines, because a script cannot move the shell that called it, and both
   are one action.
2. **The Claude Code login is written once and printed from both places that
   send somebody to a browser.** `claude_login_note` holds the wording; the
   closing message prints it under the reference heading, and the stop in front
   of the GitHub login prints it as the second of two browser logins, saying
   outright that doing both now saves a second trip. Somebody stopped at the
   GitHub login now knows both person-steps at once.

   **The other stops do not print it, and that is the line.** The script also
   ends in front of a missing git identity and in front of a repository the
   account cannot see. Neither sends anybody to a browser, so neither can be
   folded into one trip — and each of them reaches the closing message on the
   run that follows it, which is what the GitHub login stop could not do for
   somebody who then went straight to a browser.
3. **The machine-only ending names `git clone` and `prep setup` rather than the
   one-liner.** Neither re-downloads the script, and both exist on the machine
   the run has just finished building. A private repository needs a GitHub login
   before that clone — this is the branch that never logged in (ADR-0021) — so
   the login is named beside the command it serves, under reference.
4. **The machine-only ending stops branching on whether there was a terminal.**
   The two branches existed only to choose between two spellings of the
   one-liner, `curl … | bash` and `curl … | PREPARED_REPO=<git url> bash`. The
   commands that replace them need no terminal to have been there, so one
   ending serves both. `SCRIPT_URL` has no reader left and is gone.
5. **The ending becomes `closing_message`, called at the bottom.** It was
   top-level statements, which nothing could run without running the whole
   script. As a function it is lifted out by name and executed against both
   branches, which is what makes decisions 1, 3 and 4 testable at all.

## Rationale

- **A message that ends the run cannot delegate to a message that follows it.**
  This is the whole of the first fault. `fail` exits, so anything downstream of
  it is not a fallback — it is unreachable. Naming the login in both places is
  not duplication when one wording is written once and printed twice.
- **Four topics under one heading is one topic too heavy to find.** The reader
  of a bootstrap script has just watched ten steps go by and wants to know what
  to type. Ranking is what the ending owes them, and a heading is the cheapest
  mark of rank that plain terminal output has.
- **Reference still has to be there.** The account tiers, Codex's login and
  `prep doctor` are all things somebody needs eventually, and this terminal is
  where they are looking. Moving them below a heading demotes them; deleting
  them would lose them.
- **Spending a download to save two commands is the wrong trade.** The
  one-liner is the entry point because a fresh machine has nothing else to
  offer. A machine this script has finished with is not that machine.
- **The private repository's login belongs where the clone is named.** On the
  machine-only branch it is the one command in the ending that can fail for a
  reason the machine does not explain — 404 rather than a refusal (ADR-0017).

## Consequences

- The Claude Code login is named in two places rather than one, in one wording.
  `CONTEXT.md` no longer claims otherwise.
- A run stopped at the GitHub login is longer by a paragraph, and is the whole
  of what that person has to do.
- A run with no terminal and no project reads exactly what an interactive one
  reads. `PREPARED_REPO` is no longer named in any ending; it is still the way
  such a run answers ahead of the question (ADR-0015), and still documented.
- `test/bootstrap.ending.test.ts` runs both endings and the stop for real, with
  `gh` stubbed to a machine with no login.

## Verified

**Three real runs on fresh `debian:trixie` machines, on 2026-08-05.** Each one
crossed the whole chain — apt, git, bun, Node 24.18.1, gh 2.97.0, Claude Code
2.1.222, the plugins, prep, and every gap `prep doctor --json` named. Only sudo
was put on the machine ahead of the script. What differed between them is the
project the run was given.

**A run stopped at the GitHub login**, given
`PREPARED_REPO=https://github.com/hanjukim/prep-cli.git` and no account, ends at
step 9 with both person-steps named:

```
Run this yourself, then run this script again:
  /root/.local/bin/gh auth login --git-protocol https --web
...
One more browser login is waiting behind this one, and doing both now saves a
second trip:

Logging in to Claude Code is a browser step, and the first `claude` run is what
opens it. Claude Code needs a paid account: Pro, Max, Team, Enterprise or
Console. The free Claude.ai plan does not carry it, and the login turns you away
on one.
```

That is the first acceptance criterion in issue #5, and the fault that started
it: before this, that message ended at the line about the second run.

**A run that named no project** finishes at the machine, with one action above
the reference and no `curl` anywhere in it:

```
==> Done

This machine is ready. No project was named, so nothing was cloned
and nothing was set up.

  Next: clone the repository you are working in and set it up. Open
  a new terminal, so it carries the tools this script installed.

      git clone "<git url>" ~/my-project
      prep setup ~/my-project

==> For reference

A private repository needs a GitHub login before that clone. Without
one it answers with 404 rather than a refusal, so the clone fails while
describing the wrong problem:
  gh auth login --git-protocol https --web
```

It had no terminal, and read exactly what an interactive one reads — decision 4.
The placeholder is quoted so the line survives being pasted whole: `<git url>`
unquoted is a redirection, and the old ending's `PREPARED_REPO=<git url>` had
the same edge.

**A run that cloned and set up a project**, given a local bare repository so no
GitHub account was in the way, ends on the one action that starts work:

```
==> Done

Your project is at /root/fixture

  Next: open a new terminal, so it carries the tools this script
  installed, and run these two lines.

      cd /root/fixture
      claude

==> For reference

Logging in to Claude Code is a browser step, ...
```

**No run had a gap that would not install**, so the `These would not install`
block was not exercised on a real machine. It is covered by
`test/bootstrap.ending.test.ts`, which runs `closing_message` with `FAILED_GAPS`
set, and the omission is written down rather than passed over.

**One thing this uncovered is not this record's to settle.** `prep setup` prints
its own `Next (2)` section, and on a run that clones, the script's `Next:` lands
three lines under it:

```
Next (2)
  claude '/setup-matt-pocock-skills'  writes the guidance prep does not
  prep doctor                         checks this machine for the standard tools

==> Done

Your project is at /root/fixture

  Next: open a new terminal, so it carries the tools this script
  installed, and run these two lines.
```

Two sections named Next, with different commands, in one screen. **This record
makes the script's ending name one action, and it does.** What it does not do is
rank the ending against another program's report — prep's **next step** section
is its own concept in `CONTEXT.md`, computed off the artifact list, and it is
right on every run that is not a bootstrap. Whether it should give way when the
script is the caller is a question about that concept, and answering it here
would be deciding prep's output inside a record about a shell script. Left open,
and written down so the next reader meets it as a known thing.
