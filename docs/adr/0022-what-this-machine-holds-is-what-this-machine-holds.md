# ADR-0022: What this machine holds is what this machine holds

**Date:** 2026-08-05
**Status:** Accepted — narrows ADR-0013 and ADR-0017, which both take
`command -v` as the answer to whether a link is already here, and ADR-0017's
seventh decision, which put the harness's plugins in the chain. Found by the
first real run of the script as ADR-0021 left it, on WSL.
**Sources:** ADR-0009, ADR-0013, ADR-0017, ADR-0021; two real
`curl … | bash` runs on WSL on 2026-08-05, the first of which stopped at the
Claude Code step and the second of which ran to the end;
`https://claude.ai/install.sh`; `anthropics/claude-plugins-official` at
`.claude-plugin/marketplace.json`

## Context

The run stopped at the Claude Code step, and it stopped in a way no step in the
script accounts for. The plugin commands at the end of that step printed 271
schema errors of the same shape:

```
failed to add marketplace: Invalid schema: plugins.0.source: Invalid input,
plugins.1.source: Invalid input, …
```

The marketplace holds 278 plugins, and their `source` fields come in five
shapes — `git-subdir` with a `path` and a `ref`, `url` with a `sha`, a
`repo`/`commit` pair, and a plain string. 271 of the 278 were refused, so what
was reading the file did not know most of the shapes in it.

What was reading it was not the Claude Code this script installs. On the
machine:

```
$ command -v claude
/mnt/c/Users/…/AppData/Roaming/npm/claude
$ claude --version
2.0.69 (Claude Code)
```

**WSL puts the Windows PATH on the Linux PATH.** An npm install of Claude Code
made on the Windows side answers `claude` inside WSL, through a shim under
`/mnt/c`. The script's own `have` is `command -v`, so the step saw a `claude`,
printed "Claude Code is already here", and installed nothing. Then
`claude --version` passed — the shim runs `exec node`, and step 4 had just put
the Linux Node v24 on PATH, so a Windows install of Claude Code ran under a
Linux Node and answered. The chain's own verification confirmed a tool that
belongs to another operating system.

Two things were wrong at once, and each is worth recording on its own.

**The first is `have`.** It is not specific to Claude Code. Every link in the
chain — git, bun, Node, gh, prep — is looked up the same way, and any of them
can be answered by a Windows executable on a WSL machine. Claude Code was
first only because it is the first link somebody is likely to have installed on
the Windows side already.

**The second is what a failing plugin costs.** The plugin commands were plain
lines under `set -e`, so the first one that failed took the ERR trap and ended
the run at step 6 of 10. prep was never cloned, no project was named, nothing
was set up. A marketplace is somebody else's file, its schema moves, and a run
that loses the whole machine to one is the wrong trade.

## Decision

**A tool this machine holds is one installed for this machine.**

1. **`have` refuses an executable under `/mnt`.** It resolves the name and reads
   the path back: anything under a mounted Windows drive is not an answer, and
   the step goes on to install the tool that belongs here. The rule sits in
   `have` rather than at the Claude Code step, because every link is exposed to
   it. Since the script exports `~/.local/bin` at the front of PATH, whatever it
   installs then outranks the Windows copy for the rest of the run, and
   `persist_on_path` does the same for the shells that come after.
2. **A Claude Code already installed on this machine is kept, however old.**
   Decision 1 is about which operating system a tool belongs to, not about which
   version it is. The script does not upgrade what somebody has chosen to
   install, and it does not read a version number to decide. Decision 3 is what
   makes an old one survivable.
3. **A plugin is a gap, not a link.** The harness starts without one. A
   marketplace that will not add, or a plugin that will not install, is
   collected into the same list the gaps at step 8 use and printed at the end,
   and the run carries on. Their stdin is `/dev/null`, for the reason step 8
   closes it: this script is read from a pipe, so a command that reads a line
   eats the script behind it.

**Decision 3 narrows ADR-0017's seventh decision.** That record put the plugins
in the chain because the repository's conventions assume them, and reasoned that
they belong to the machine the same way the harness does. The reasoning holds
for where they are installed and not for what their failure should cost. The
harness is a link because without it nobody reads the permission files
`prep setup` writes. A plugin has no such claim: it is convenience the project
stands without, which is the definition of a gap this repository already had
(`CONTEXT.md`, "A link stops the run, a gap does not").

## Rationale

- **The verification was right and its subject was wrong.** ADR-0013 put
  `claude --version` in because an install can report success and leave nothing
  usable, and ADR-0017 found that the check can pass while its dependency is
  missing. This is the third turn of the same screw: the check ran, it passed,
  and the thing it passed on was not the thing being installed.
- **A version check would have been the wrong fix.** It would have caught this
  run — 2.0.69 against a marketplace that needs newer — and it would have caught
  it for the wrong reason, leaving the Windows binary in place and only arguing
  about its number. It would also make the script the judge of a version
  somebody else chose to install.
- **`/mnt` is the honest test.** It is where WSL mounts Windows drives, and it
  is not where a Linux install of any of these tools lands: the tarballs go to
  `~/.local`, bun to `~/.bun`, brew to its own prefix. A machine whose home is
  under `/mnt` would be misjudged, and that is a trade taken deliberately —
  a Windows executable answering for a Linux one is the case that actually
  happens.
- **The plugin step now reports in a voice the script already has.** The failed
  gaps list at the end says "These would not install. Run them yourself when you
  have a moment", which is exactly right for a marketplace that was refused.

## Consequences

- On WSL, a machine with Windows installs of git, Node, bun, gh or Claude Code
  gets its own Linux copies, and the script's own PATH order is what makes them
  win.
- A run whose plugins all fail still installs prep, clones the project and runs
  `prep setup`. The four commands come back at the end.
- Somebody with an old Claude Code on the Linux side keeps it, sees the plugin
  failures at the end, and can upgrade when they choose to.
- `have` is no longer a one-line wrapper around `command -v`, so it is tested:
  it takes a tool that is here, refuses one that is not, and refuses one reached
  through a mount.

## Unverified

**The installer's stdin is still the pipe it was handed.** Step 6 runs
`curl … | bash`, so the inner shell reads the installer from its stdin, and the
`claude install` that installer runs at its own line 183 inherits that same
stdin rather than a terminal. Nothing has failed on it yet, and the fix is not
free — it means downloading the installer to a file and running it with stdin
closed, the way the tarball links are already handled. It is left open here
rather than changed on the same run that changed `have`.
