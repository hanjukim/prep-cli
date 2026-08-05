# ADR-0013: The bootstrap script installs Claude Code

**Date:** 2026-08-01
**Status:** Accepted — retires decision 3 of ADR-0009 for one harness. Narrowed
by ADR-0017: decision 1's chain was incomplete. The harness this record installs
does not run without Node, and the clone that follows it does not resolve
without a GitHub login, so both are links ahead of it now.
**Sources:** ADR-0009, ADR-0011

## Context

ADR-0009 set the chain at brew · bun · git · prep, and decision 3 kept the tool
list outside the script: `prep doctor --json` names a command for each gap and
the script runs it. The harness arrived that way, as one gap among many.

On Linux that link does not exist. The harness entry in `registry.ts` is
`kind: "manual"`, so the contract hands the script a documentation URL and
nothing to run. The chain stops one step short of where it was going. ADR-0011
decided to replace that entry with a command, but the command's postinstall
behaviour is unverified, and until it is confirmed there is no route from the
script to a harness.

The break lands on the destination itself. Somebody crosses this chain in order
to work in a harness. A bootstrap that ends without one has not partly
succeeded — it has failed.

## Decision

**The script installs Claude Code as a link in the chain, using the vendor's
native installer, and does not go through the registry for it.**

1. **The chain is brew → bun → Claude Code → prep.** git stays where ADR-0009
   decision 2 put it: brew brings it on macOS, apt installs it on Linux.
2. **The command is `curl -fsSL https://claude.ai/install.sh | bash`.** The
   script holds that string itself rather than reading it out of `--json`.
3. **Codex is not in the chain.** doctor reports it as a gap and a person
   installs it.
4. **ADR-0009 decision 3 stands for everything else.** The prerequisite and the
   standard tools are still the registry's answer, still read through `--json`.
   One harness is the only exception.
5. **Login is handed back.** The first `claude` run authenticates through a
   browser, which the script cannot do for anybody. It installs, then names
   login as the step that is left.

## Rationale

- **A harness is not a gap, it is a link.** A gap is something the project
  stands without — a missing `fd` is an inconvenience. Without a harness there
  is nobody to read the permission files `prep setup` just wrote. That puts it
  with the links ahead of it, not with the gaps behind.
- **The native route is what the vendor recommends.** One command covers macOS,
  Linux, and WSL, it wants neither `sudo` nor a package manager, and it
  auto-updates. The documentation ADR-0011 cites says so.
- **The symmetry objection does not reach here.** ADR-0011 turned the native
  installer down because it exists for Claude Code and has no Codex counterpart,
  which would leave the registry's two entries in different shapes. The script
  is not the registry and installs one harness. With a single entry there is no
  symmetry to break.
- **No new user should ride on an unverified command.** Choose `bun install -g`
  and the chain breaks silently the moment the postinstall does not run: the
  install reports success and `claude` is not on PATH. The route the vendor
  publishes for this purpose carries that risk instead of us.
- **Why Codex is left out.** Taking both puts the symmetry requirement back,
  which drops the native route and leaves two unverified commands carrying every
  new user. It also doubles the browser logins for somebody who has never opened
  a terminal. One harness now, the other named by doctor, keeps the manual steps
  at one.
- **`curl | bash` was already allowed.** ADR-0009 decision 6 put the script
  outside prep's own execution rules. brew and bun ship the same way, and this
  is the place where a person reads a URL and decides to run it.

## Consequences

- **ADR-0011 still stands.** doctor needs a string to print for anybody not
  running the script, and for the harness the chain leaves out. Turning the
  Linux harness entry into a command (#52) is still owed.
- **The harness install command lives in two places.** The script holds the
  native installer; the registry holds the global package. Same tool, different
  commands, and the duplication is deliberate — one opens the chain, the other
  is advice the report prints. If the vendor moves either route, both need
  editing.
- **#48 comes off the critical path.** Verifying `bun install -g`'s postinstall
  now binds only the registry string. prep prints that string and never runs it,
  so a wrong one fails in front of the person who pasted it rather than
  silently. The script never touches it.
- **One manual step is left for a beginner: login.** That is where the script
  stops and explains.
- **setup's output does not change.** A new user's machine has no Codex, so no
  `.codex/config.toml` is written — the existing behaviour of reading the
  machine to decide.

## PATH — settled by #49

**The script amends its own PATH as it installs, and then checks by name.** It
writes no shell rc file of its own.

Measured on macOS 15.5. The native installer puts `claude` in `~/.local/bin`, as
a symlink into `~/.local/share/claude/versions/`; bun's installer puts `bun` in
`~/.bun/bin`; Homebrew puts `brew` in `/opt/homebrew/bin` on Apple Silicon and
`/usr/local/bin` on Intel. None of those directories is on PATH in a shell that
has not read a shell rc since. Every installer here does edit a shell rc, so the
shells that come after the run find the tools; the run itself cannot, because it
started before the file was written.

So the script exports each directory the moment its installer finishes, and
confirms with `command -v` before moving on. An install that reports success
while the binary stays unfindable stops the run and names the directory that was
looked in. The failure this ADR was written to avoid is the silent one, and this
is what makes it loud.

Checking by absolute path was the other candidate, and it does not reach far
enough: the gaps step runs `prep doctor`, which finds tools by walking PATH. A
chain that kept its own links off PATH would have doctor report the harness it
had just installed as a gap.

The person is told to open a new terminal at the end, which is where the rc
files the installers wrote take over.
