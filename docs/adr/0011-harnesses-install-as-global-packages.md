# ADR-0011: Harnesses install as global packages

**Date:** 2026-08-01
**Status:** Accepted, and not implemented. `src/registry.ts` still offers
`brew install --cask` on macOS and no command at all on Linux, under a note
saying no package manager carries these — the sentence this record was written
to retire. #52 held that work and closed unbuilt, so the decision stands and the
code has not caught up. Read the entries below as what was decided, not as what
`harness()` returns. ADR-0013 narrowed one route besides: the bootstrap script
installs Claude Code with the vendor's native installer, so the rejection of that
installer below holds for the registry only.
**Sources:** ADR-0009, ADR-0010

## Context

This is how `registry.ts` knows the harness install routes — `brew install
--cask <id>` on macOS, `kind: "manual"` with a documentation URL on Linux. Its
comment records the reason: the routes published for Linux were either an apt
repository demanding a signing key and `sudo`, or a download piped into a shell,
and neither was acceptable.

Reading the vendor documentation again, the facts have changed.

Claude Code publishes a native install as the recommended route. macOS, Linux,
and WSL use the same single command, it demands neither `sudo` nor a package
manager, and it lands in `~/.local/bin` and
`~/.local/share/claude/versions/`. It also auto-updates in the background. The
same documentation writes this about the brew route: `Homebrew installations do
not auto-update.`

Both harnesses also ship as global packages — `@anthropic-ai/claude-code` and
`@openai/codex`. According to the documentation the global package installs the
**same binary** as the native install.

So the premise that Linux has no route was wrong. The registry simply did not
know the route.

## Decision

**Harness guidance is `kind: "command"` on both platforms, and the command is a
global package install.**

1. **The command is `bun install -g <package>`.** `@anthropic-ai/claude-code`
   for claude-code, `@openai/codex` for codex.
2. **The platform branch disappears.** A harness entry yields the same command
   on macOS and Linux. The `darwin`/`linux` split `harness()` carried is no
   longer needed.
3. **`manual` on Linux disappears.** A Linux user gets a command to paste like
   everybody else.

## Rationale

- **bun is already in the chain.** The bootstrap script installs bun and links
  prep with it (ADR-0009). Installing a harness with the same tool adds no
  dependency. Choosing the npm route would add node to the chain.
- **One command covers both platforms.** With no per-platform split in the
  harness entries the registry gets simpler by that much, and the report takes
  the same shape everywhere.
- **Why the native script was not chosen.** `curl -fsSL
  https://claude.ai/install.sh | bash` exists for Claude Code and has no
  counterpart for codex. If the two harnesses hold commands of different shapes,
  the registry's symmetry breaks. The pipe is not the problem — the actor
  running it is a shell script, which is allowed to take a pipe (ADR-0010).
- **Why brew cask was not chosen.** No auto-update, macOS only, and it presumes
  brew.
- **ADR-0002 stands.** The command is still a static string in the registry and
  is not assembled at run time.

## Unverified

**Whether `bun install -g` runs the postinstall of these two packages has not
been checked.** The vendor documentation says a platform-specific optional
dependency is pulled in and a postinstall puts the binary in place. bun does not
run lifecycle scripts of untrusted packages by default. If it does not run, the
install finishes and the binary is not on PATH.

This gets checked for real during implementation. If it fails there are two
fallbacks, and both change nothing but the command string:

- `npm install -g <package>` — node 22 or newer joins the chain. The
  documentation explicitly forbids `sudo npm install -g`, so it is used as
  written.
- Run only Claude Code through the native script and leave codex as a global
  package — the symmetry is lost.

ADR-0013 took the second fallback for the bootstrap script alone, so a new
user's first install no longer rides on this unverified command. What is left
here binds only the string doctor prints, which a person pastes and watches
fail — #48 is off the critical path because of that, not resolved.

## Consequences

- `harness()` in `registry.ts` gets simpler. The platform argument and the
  branch come out.
- On a Linux doctor report a harness yields a command instead of a
  documentation link.
- "Harnesses sit outside the package managers", from ADR-0004's context, stops
  being true — one of the grounds on which ADR-0010 supersedes that decision.
- Somebody who already installed through brew cask is left alone. prep uses
  `which` to report present or absent and never asks how it got there.
