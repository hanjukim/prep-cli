# prep-cli

## Worktrees

Several agents work here at once and a checkout has one HEAD, so commits land on
whichever branch another session left there. Take a worktree before writing
anything. `git worktree add` leaves the root's HEAD alone and `git checkout`
does not, so never check out at the repository root.

```sh
git worktree add .claude/worktrees/<name> -b <branch> main
cd .claude/worktrees/<name> && bun install --frozen-lockfile
```

Run the first line from the repository root. The path is relative, so the same
line typed inside a worktree puts one worktree inside another, and the inner one
goes when the outer is removed.

## Records

`docs/adr/` is for a decision that would otherwise be re-argued from scratch by
whoever meets it next. Ordinary work — the wording of a message, a line added to
an ending, a rename — is answered by the commit message and by the `CONTEXT.md`
entry it changes. A record costs every later reader of `docs/adr/`, so it is
written for them and not for the run that produced it. See `CONTRIBUTING.md`.

## Language

**English in everything this repository publishes.** Code and its comments,
identifiers, program output, commit messages, branch names, pull request
descriptions, design documents, and issues.

**The reader's language in prompts.** A prompt has one reader, and that reader
is known.

The split follows the audience: anything published cannot name its readers, and
a prompt can.

Korean documents and issues written before this rule are records, not backlog.

## Agent skills

### Issue tracker

Issues live in this repo's GitHub repository, managed with the `gh` CLI (docs/adr/0019). A `#N` in a design record is a number on the self-hosted instance this project was built on, and resolves nowhere here. See `docs/agents/issue-tracker.md`.

### Domain docs

Single-context: `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
