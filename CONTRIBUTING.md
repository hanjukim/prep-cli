# Contributing

## Running the checks

The toolchain is [bun](https://bun.sh) 1.3.14, plus `shellcheck` for the one
file that is not TypeScript. There is no build step: `prep` runs from
TypeScript source, and `package.json` points its `bin` straight at
`src/cli.ts`.

```sh
bun install                 # --frozen-lockfile in CI
bun test                    # the whole suite
bun test test/setup.test.ts # one file, while working
bunx tsc --noEmit           # types
shellcheck scripts/bootstrap.sh
```

CI runs the suite, the type checker and `shellcheck` on every push and every
pull request, on every branch — three jobs, in `.github/workflows/ci.yml`. Run
them locally first; a red branch tells you nothing you could not have known a
minute earlier.

## What the tests reach

**Nothing outside the process.** The file system, `which`, the platform name,
the home directory, and the person at the terminal all arrive as dependencies
(`RunDeps` in `src/cli.ts`), and the tests hand in fakes. That is why the suite
covers macOS and Linux without either machine, and why no test writes into a
real home directory. A change that reaches for `node:fs` or `process.platform`
inside a module has crossed a seam that exists on purpose — take the boundary as
an argument instead.

The report snapshots in `test/__snapshots__/` hold the exact prose a person
sees. Wording is part of the output, so a deliberate change to it updates the
snapshot in the same commit as the change that caused it.

## Where a decision goes

Two documents carry the design, and neither is a changelog.

- **`CONTEXT.md`** is the domain language: one entry per term the code is built
  out of, each with the argument for why it is that way. When a term's meaning
  changes, the entry changes with it, in the same commit.
- **`docs/adr/`** holds one record per decision, numbered in the order the
  decisions were made. A record is not edited into agreement with a later one.
  When a decision is narrowed or replaced, the new record makes the argument and
  the old record's **Status** line says what happened to it, so a reader who
  lands on the old page is never told the opposite of what holds today.

Add a record when a choice would otherwise have to be re-argued from scratch by
whoever meets it next. Ordinary work does not need one.

## Language

`AGENTS.md` carries the rule, and `prep setup` seeds the same rule into a
project that has none — minus its one sentence about what was written before it,
which a new project has no use for (`src/seed.ts`, docs/adr/0016). The split it
draws: English in everything this repository publishes, the reader's language in
prompts.

## Commits

One commit per change that stands on its own, with a subject in the
`type: what changed, so that why` form the log already uses:

```
fix: answer apt's own question, so a gap command installs unattended
```

Where a change has two halves and neither is the other's reason, the subject
names both instead — `docs: renumber the chain record to ADR-0017, so ADR-0016
names one record`.

The body carries the reasoning — what was wrong, what the change settles, and
what it deliberately leaves alone. The types in use are `feat`, `fix`,
`refactor`, `test`, `docs`, `ci`, and `chore`.

## Issues

`docs/agents/issue-tracker.md` names the tracker — this repository's GitHub
issues, worked with `gh` — and gives the commands for it. Every `#N` in this
repository's records is a number on the instance the project was built on
first, and resolves nowhere here (`docs/adr/0019`).
