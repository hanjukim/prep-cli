# prep

A security-first CLI that sets up a project and the machine it is worked on.
Deny by default: the permission files it writes close reading secrets and close
the commands nobody can walk back, and open the toolchain the project's own
language needs.

prep does two things and nothing else.

- **`prep doctor`** reads this machine and reports what is wrong — the package
  manager, the standard tools, the agent CLIs — with the command or the document
  that closes each gap, and the accounts only you can settle. Hand it a path and
  it reports on that project as well. It never guesses which project you are in.
- **`prep setup`** reads a project and writes the permission files the agent CLIs
  installed here will read: `.claude/settings.json` for Claude Code,
  `.codex/config.toml` for Codex. Where a project carries no guidance file it
  seeds `AGENTS.md` and points Claude Code at it.

**prep starts no process.** Every path through it is a read, a decision, and a
report. It prints a command; a person runs it.

## Getting started

The first thing to run is not prep. Somebody who has never opened a terminal has
a chain to cross before prep exists on their machine — a package manager, git,
bun, Node, gh, Claude Code, and prep itself — so a shell script takes that
place:

```sh
curl -fsSL https://raw.githubusercontent.com/hanjukim/prep-cli/main/scripts/bootstrap.sh | bash
```

Nothing goes after that line. The script opens the chain, closes what
`prep doctor --json` reports, and then asks for the repository you came to work
in — the one thing it cannot work out for itself. It clones what you name and
runs `prep setup` in it. Press Enter instead and the run stops at a machine that
is ready, and tells you how to come back for the project.

Naming a repository on GitHub is what brings the last two links in: a GitHub
login, and the git name and email that login can answer for. The script stops in
front of the login, because a browser login cannot be performed on somebody's
behalf, and running it again picks up where it stopped. A run that names no
project meets neither.

On a machine that already has bun, prep runs straight from a clone:

```sh
bun install
bun link          # puts `prep` on PATH
prep doctor
```

## Usage

```
prep doctor [path] [--json]
prep setup [path] [--dry-run] [--json]
```

`--json` prints the report as data instead of prose. `--dry-run` shows what
`setup` would write without writing it.

The path is optional on both, and the two treat its absence differently. `setup`
falls back to the working directory, because writing into where you are standing
is the run people mean. `doctor` reads the machine alone, because a directory
that looks like a project is a guess and a wrong guess reports on somebody's home
directory.

Exit codes are read off what the run did, and an observation is kept apart from
a failure:

| Code | Meaning |
| --- | --- |
| 0 | done — gaps none, or at least one file written, or a dry run that produced a plan |
| 1 | `doctor` found gaps, or `setup` wrote nothing |
| 2 | tool error |

## What a setup run writes

Each file is one artifact, carrying its own path and its own status — applied,
planned, merged, declined, or skipped.

- **Permission files, one per agent CLI on this machine.** A file for a harness
  nobody has installed is a file nobody opens. On a machine holding no harness at
  all the Claude files are written anyway, because the project has to carry its
  baseline somewhere.
- **A settings file that already stands is merged into, never overwritten.** The
  rules are a union, keys prep knows nothing about ride through untouched, and a
  scalar that differs is reported as a conflict rather than settled by prep. The
  diff goes up first, each conflict is put one at a time, and declining leaves
  the file byte for byte as it was. A run reading from a pipe asks nothing and
  writes nothing that needed an answer.
- **`AGENTS.md`, where no guidance file stands**, with the language rule filled
  in. A guidance file that already stands, even an empty one, is left alone.
- **The language server plugin the project's type calls for** is named; one
  already installed and reachable on PATH is switched on. A person installs it,
  prep enables it.

## Where the reasoning lives

- **`CONTEXT-MAP.md`** — which glossary to read. There are two programs here.
- **`CONTEXT.md`** — the domain language. One entry per term prep is built out
  of, with the argument attached. The bootstrap script's own terms are in
  `scripts/CONTEXT.md`.
- **`docs/adr/`** — one record per decision, in the order they were made.
- **`AGENTS.md`** — what an agent working in this repository reads first.
- **`CONTRIBUTING.md`** — how to run the checks, how the two documents above are
  kept, and where a new decision goes.

This repository starts from a single commit. The commits that got the tool here,
and the issues that drove them, stay on the self-hosted instance it was built on
— which is why a `#N` in a record resolves nowhere here (`docs/adr/0018`,
`docs/adr/0019`).

## License

MIT. See `LICENSE`.
