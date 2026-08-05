# ADR-0004: doctor asks about each missing harness and installs on approval

**Date:** 2026-08-01
**Status:** Superseded — replaced by ADR-0010 (prep starts no process, and the
bootstrap script is the only thing that changes the machine)
**Sources:** ticket #34, follow-ups #35 and #36

## Context

`prep doctor` only reads today. `probe.ts` searches PATH and decides the status,
and the report prints one line of guidance per gap. The footer ends with `prep
does not install anything yet.` A person reads that line and installs by hand.

For the standard tools that shape works. The gap line *is* `brew install fd`,
and copying it is the whole job. The two harnesses are different. claude-code
and codex sit outside the package managers, so their guidance is `manual` and
what the report hands over is a documentation URL rather than a command. The
person opens a browser, finds the section for their platform, and copies what it
says. prep exists to stand an agent's working environment up, and installing
that very agent is where prep helps least.

## Decision

**When doctor meets a missing harness it asks, one at a time, and installs only
what was approved.**

1. **Only the two harnesses get asked about.** claude-code and codex, and
   nothing else. The standard tools that brew and apt install keep showing their
   command, and prep does not run it.
2. **Only `command` guidance runs.** `manual` guidance has no command to run, so
   it is not offered. That slot keeps printing a documentation URL as it does
   now. Guidance varies by platform, so asking about one and not the other is
   the normal state, not a defect.
3. **A new boundary holds the monopoly on execution.** `probe.ts` keeps calling
   only `which` and starts no process. Running a command moves out to a separate
   injectable interface, and the tests put a fake in that slot so no process is
   started at all.
4. **Nothing runs without approval.** The question goes per harness, and the
   default is no. Declining one leaves the next question intact.
5. **With no person there, it neither asks nor runs.** With `--json`, in a pipe,
   or without a TTY, there is no question and no execution. The report goes out
   in exactly its present shape.
6. **No prerequisite, no question.** If the report is already hiding the
   command, no question appears either. Asking whether to run a command that is
   not on screen is a question a person cannot answer.
7. **Both the check result and the exit code come from re-reading the machine
   after execution.** Whatever the command reported, prep looks at PATH again —
   there are package managers that exit 0 having installed nothing, and cases
   where a non-zero exit is returned but the binary is already in place. If the
   gap closed, doctor exits 0; if it remains, 1. A machine where the install did
   not take is an observation, not a prep failure. If the command cannot be
   started at all, it stops with a tool error (exit 2), and whatever really got
   installed up to that point still appears in the report.

8. **Commands do not go through a shell.** The registry's string is split into
   words and run as it is. There are no quotes to handle, and a command that
   cannot be started never disguises itself as the shell's exit 127 and reads
   like an ordinary install failure.

## Rationale

- **sudo decides who is in scope.** The Linux guidance for the standard tools is
  all `sudo apt install ...`. Running that on somebody's behalf means asking for
  privilege escalation, which would leave a tool that closes secret reads with
  `deny` asking for root in the same run. Installing a harness finishes inside
  the user's own privileges. brew on macOS is user-level too, but a rule that
  splits the two platforms makes the doctor a person sees on macOS a different
  thing from the doctor they see on Linux.
- **A harness is a different kind of gap.** Without `fd`, search gets slower.
  Without claude-code there is nobody at all to read the `.claude/settings.json`
  prep just wrote. If there is a place for prep to reach further, it is here.
- **It does not reverse ADR-0002.** What gets installed is still decided by the
  static table in `registry.ts`. There is no runtime LLM call, and the command
  string is not generated at execution time. An install command does use the
  network, but that is what one human-approved command does — not prep using the
  network to decide a value.
- **It stands where ADR-0003 stands.** The rules the merge established — show
  it, ask one at a time, touch nothing without approval, and in a pipe neither
  block nor answer — carry over unchanged. What the merge upholds for a file,
  the install upholds for the machine. Terminal input stays a `prompt.ts`
  monopoly, so no new input path appears either.
- **Why a failure is not raised as a tool error.** `brew install` failing over
  the network is machine state doctor observed. exit 2 has to stay reserved for
  prep failing at its own job, so that a script seeing a 2 can find a real
  breakage.

## Consequences

- An interactive `prep doctor` is no longer read-only. The machine changes only
  where approval was given, but the premise that doctor does nothing ends here.
- A second run is quiet. A harness that finished installing is not a gap, so
  there is no question.
- Anybody who does not want the questions at all can use `--json` or pipe the
  output. No dedicated flag is added — if one becomes necessary, it will be
  handled then.
- There is one more execution boundary. `probe.ts` holds reading, the new
  boundary holds execution, `setup.ts` holds files, and `prompt.ts` holds
  terminal input.
- The report footer has to state the state. `prep does not install anything
  yet.` becomes false on a run that installed something.
