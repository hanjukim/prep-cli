# ADR-0009: The entry point is a bootstrap script, and it is the only thing that changes the machine

**Date:** 2026-08-01
**Status:** Accepted — decision 3 narrowed by ADR-0013 for one harness. The
script installs Claude Code from a command it holds itself instead of reading it
out of `--json`; every other tool still comes from the registry through the
contract.

## Context

prep was designed against programmers. Both commands assume a person typing in a
terminal, and on a gap they print a command and leave running it to that person.
That person reads the command, pastes it, and fixes it when it fails.

The audience widened. Somebody who has never used a CLI starts vibe coding with
this tool. They set out from one prepared project.

To reach `prep setup` they first have to cross a chain — open a terminal, get a
package manager, install bun, pull two repositories with git, put prep on PATH.
prep installs none of it. brew is `kind: "manual"` in the registry, so it yields
an install script URL and nothing else. And `commandsHidden()` withdraws every
install suggestion when brew is absent.

Which is to say: prep's install feature is by definition invisible to the person
who needs it most.

That chain cannot be closed from inside prep. Nothing can build the world that
exists before it runs.

## Decision

**The entry point is a bootstrap shell script outside prep. A person runs that
one line, and the script is the only thing that changes the machine.**

1. **The script opens the chain.** On macOS it installs brew — whose install
   script pulls in the Command Line Tools, so git arrives with it — installs
   bun, fetches prep-cli, and links it with `bun link`. On Linux apt is already
   part of the system, so it starts at `sudo apt install git` and the rest is
   the same.
2. **git is not installed separately.** On macOS brew already brought it; on
   Linux decision 1 installs it. Before moving on, the script only checks that
   `git` actually runs, and stops there naming the reason if it does not.
3. **The script does not hold the tool list.** `prep doctor --json` yields a gap
   and a command per item, and the script reads that with bun and runs it.
   **prep decides, the script executes.** `registry.ts` stays the single answer
   to "what should the machine be holding".
4. **The script owns the order.** Bootstrap → read `prep doctor --json` and
   close the gaps → clone the prepared repository → `prep setup` in that path.
5. **The scope of prep's commands is unchanged.** doctor looks at the machine,
   setup looks at the project. The script calls the two in order; it does not
   move the boundary between them.
6. **The script is not prep.** prep's execution rules govern what prep runs in a
   person's place, and they do not reach an install script the person runs
   themselves. The script running `sudo` does not trip over them either.

## Rationale

- **prep cannot install its own prerequisites.** The early links of the chain
  have to stand before prep runs. Every attempt to close this gap from inside
  prep hits the same wall.
- **`curl | bash` is a person running something, not prep running it.** brew and
  bun ship in that shape themselves. A person reading a URL and deciding to run
  it is a different act from a tool doing it on their behalf.
- **`--json` already yields commands.** The contract carries
  `{"kind": "command", "command": "..."}` per item. Decision 3 builds no new
  surface; it uses what is there.
- **Having setup take care of the machine was considered and dropped.** That
  plan makes a project command change the machine. Artifact decisions depend on
  which harness exists, so installing would have to come before writing files,
  and then the first screen of a project command is an approval prompt for a
  package manager install. For somebody whose machine is already set up, a
  machine check gets bolted onto the front of every run.
- **The script knowing two commands is not a cost.** It already knows brew, bun,
  and git. Two more lines do not change what it is. prep's scope boundary, by
  contrast, is hard to restore once it goes.

## Consequences

- A beginner types one command. After that they type nothing.
- **prep loses any reason to start a process.** Changing the machine collapses
  onto the script alone, which makes doctor's install feature a duplicate —
  ADR-0010 clears it out.
- Harness login stays. The first `claude` run authenticates through a browser,
  which the script cannot do for anybody. At least one manual step is left for a
  beginner, and the guidance has to name it. ADR-0013 later takes the install
  itself into the script and hands back exactly this step.
- The `--json` contract becomes something the script depends on. Change the
  shape of guidance and the script breaks.
- Where the script lives and how it is hosted is not settled by this ADR.
