# prep-cli

## Work in a worktree, and never check out at the repository root

Several agents work in this repository at once, and a checkout has one HEAD.
Two of them in the same directory overwrite each other's branch between one
command and the next, and neither can hold a lock across that gap. A session
that ran `git checkout -b` and then `git commit` has had its commits land on
another session's branch while believing otherwise — twice in one afternoon,
the second time to a session that knew about the first.

So the checkout at the repository root is nobody's workspace. It stays on
`main`, and a session takes a worktree of its own before it writes anything:

```sh
git worktree add .claude/worktrees/<name> -b <branch> main
cd .claude/worktrees/<name> && bun install --frozen-lockfile
```

**`git worktree add` does not move the root's HEAD. `git checkout` does.** That
is the whole of the rule, and it is why the directory a session was started in
does not matter: one that starts at the root and moves out immediately has
moved nothing for anybody else. git refuses the same branch in two worktrees, so
a collision stops the run rather than passing unnoticed.

`.claude/worktrees/` is ignored, so none of this reaches a commit. A worktree
carries no `node_modules`, which is what the install above is for. Once the
branch has landed, `git worktree remove` takes the directory back.

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
