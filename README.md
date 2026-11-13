# prep

A CLI that sets up a project and the machine it is worked on, for coding agents.
It reads, decides and reports — and writes two files of prose where a project
has none.

prep does two things and nothing else.

- **`prep chef`** reads this machine and reports what is missing — the package
  manager, the standard tools, the agent CLIs — with the command or the document
  that closes each gap, and the accounts only you can settle. Hand it a path and
  it reports on that project as well. It never guesses which project you are in.
- **`prep setup`** reads a project. Where it carries no guidance file it seeds
  `AGENTS.md` and points Claude Code at it, and it names the language server
  plugin the project's type calls for. It writes no permission file and changes
  no settings file.

**prep changes nothing that already stands.** Every path through it is a read,
a decision, and a report. It prints a command; a person runs it. The only processes it starts are a
handful of fixed read-only questions — `gh auth status`, `git config --get` — and
it never opens what they print.

## Getting started

The first thing to run is not prep. Somebody who has never opened a terminal has
a chain to cross before prep exists on their machine — a package manager, git,
bun, Node, gh, Claude Code, and prep itself — so a shell script takes that
place:

```sh
curl -fsSL https://raw.githubusercontent.com/hanjukim/prep-cli/main/scripts/bootstrap.sh | bash
```

Nothing goes after that line. The script opens the chain, closes what
`prep chef --json` reports, and then asks for the repository you came to work
in — the one thing it cannot work out for itself. It clones what you name and
runs `prep setup` in it. Press Enter instead and the run stops at a machine that
is ready, and names the two commands that get the project when you have one.

Naming a repository on GitHub is what brings the last two links in: a GitHub
login, and the git name and email that login can answer for. The script stops in
front of the login, because a browser login cannot be performed on somebody's
behalf, and running it again picks up where it stopped. A run that names no
project meets neither.

On a machine that already has bun, prep runs straight from a clone:

```sh
bun install
bun link          # puts `prep` on PATH
prep chef
```

## Usage

```
prep chef [path] [--json]
prep setup [path] [--dry-run] [--json]
```

`--json` prints the report as data instead of prose. `--dry-run` shows what
`setup` would write without writing it.

The path is optional on both, and the two treat its absence differently. `setup`
falls back to the working directory, because writing into where you are standing
is the run people mean. `chef` reads the machine alone, because a directory
that looks like a project is a guess and a wrong guess reports on somebody's home
directory.

`chef` was called `doctor`, and the old spelling is not accepted — there is one
name per thing here. The register is a kitchen's, which is what makes the report's
own vocabulary read: prep is the work before service, and the **pass** is the
shelf a finished plate waits on (`CONTEXT.md`, `docs/adr/0029`).

Exit codes are read off what the run did, and an observation is kept apart from
a failure:

| Code | Meaning |
| --- | --- |
| 0 | done — gaps none, or at least one file written, or a dry run that produced a plan |
| 1 | `chef` found gaps, or `setup` wrote nothing |
| 2 | tool error |

## What a setup run writes

Each file is one artifact, carrying its own path and its own status — applied,
planned, or skipped. A run asks no question.

- **`AGENTS.md`, where no guidance file stands**, with the language rule filled
  in. A guidance file that already stands, even an empty one, is left alone.
- **`CLAUDE.md`, one line importing it**, because Claude Code reads that name
  and not `AGENTS.md`. A `CLAUDE.md` that already stands is left alone.

And one thing it reports without writing:

- **The language server plugin the project's type calls for**, with the command
  that installs it or turns it on for this project. A person runs it.

**No permission file.** prep used to write `.claude/settings.json` and
`.codex/config.toml`, and merge into a settings file that already stood. It
stopped: following two vendors' permission schemas cost more than a file a
person edits by hand from the second day on was worth (`docs/adr/0031`). A
project starts at each harness's own defaults, and files an earlier prep wrote
are left where they are.

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
