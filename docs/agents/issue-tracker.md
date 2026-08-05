# Issue tracker: GitHub

Issues and PRDs for this repo live as issues on GitHub, on `origin`.
Use the [`gh`](https://cli.github.com/manual) CLI for all operations. `gh`
infers the repository from the git remote when run inside a clone; pass
`--repo OWNER/REPO` only when that inference fails. Authentication is a
one-time `gh auth login`; every command below then carries its own credentials.
Never read, echo, or pass a token by hand — if a command reports a missing
scope, run the `gh auth refresh -s <scope>` it names.

The project was built on a self-hosted instance first, and that is where every
issue written before the move stayed. The backlog there was closed rather than
migrated, so this tracker starts empty and new work is filed on it from scratch
(docs/adr/0019). See "Every `#N` in a record is a number on the old instance"
below.

**Language: English.** Issue titles, bodies, and comments are written in
English, like everything else this repository publishes. Nobody writing in the
tracker can name its readers (docs/adr/0014).

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`. For a
  multi-line body, pipe a heredoc into `--body-file -`:

  ```sh
  gh issue create --title "..." --body-file - <<'EOF'
  ## What to build
  ...
  EOF
  ```

- **Read an issue**: `gh issue view <number> --comments`.
- **List issues**: `gh issue list --json <fields>`, with `--label`, `--state`,
  `--assignee`, `--milestone`, `--search` filters as needed. Default state
  filter is `open`; pass `--state all` to include closed issues. **The default
  `--limit` is 30** — pass a larger `--limit` whenever the answer has to be
  complete rather than a first page.
- **Comment on an issue**: `gh issue comment <number> --body "..."`
  (or `--body-file -` for a heredoc).
- **Apply / remove labels**: `gh issue edit <number> --add-label "..."` /
  `--remove-label "..."`. Labels must already exist on the repo — create them
  with `gh label create "..." --color "..."`.
- **Close**: `gh issue close <number> --comment "..."` takes the closing
  comment inline, so the explanation and the close are one call.
- **Milestones**: `gh` has no `milestone` command. Read and write them through
  `gh api`, which authenticates the same way and expands `{owner}`/`{repo}`
  from the current clone:

  ```sh
  gh api repos/{owner}/{repo}/milestones --jq '.[].title'
  gh api repos/{owner}/{repo}/milestones -f title="..."          # create
  gh api repos/{owner}/{repo}/milestones/<n> -X PATCH -f state=closed
  ```

  Attaching an issue to one stays on `gh`: `--milestone "<title>"` on
  `gh issue create` and `gh issue edit`, and `--milestone` on `gh issue list`.
  This repo puts milestones to exactly one use — collecting a wayfinder map's
  child tickets, see "Wayfinding operations" below. Don't open release- or
  sprint-shaped milestones alongside them.
- **Pull requests**: `gh pr create`, `gh pr list`, `gh pr view <number>`,
  `gh pr checkout <number>`. GitHub shares one number sequence between issues
  and PRs, so `#42` is unique across both surfaces.

## Every `#N` in a record is a number on the old instance

The design documents cite issue numbers, in Sources lines and in the arguments
themselves. **None of those numbers resolve on GitHub, and none ever will.**

The backlog was closed rather than migrated, and a closed issue stays where it
is — its value is as a record, and the record survives there. So GitHub starts
empty, and nothing carries an old number across. GitHub could not have reissued
them anyway: it shares one sequence between issues and pull requests, so an
import takes the next free number.

That makes the old instance's fate load-bearing for every record that cites a
ticket, which is why it is not deleted: it stops taking commits and is kept as
the record the numbers resolve in (docs/adr/0019).

Read a `#N` in `docs/adr/` as a number on the old instance. Nothing on GitHub
answers to it.

## Pull requests as a triage surface

**PRs as a request surface: no.** _(Set to `yes` if this repo treats external
pull requests as feature requests; `/triage` reads this flag.)_

When set to `yes`, PRs run through the same labels and states as issues, using
the `gh pr` equivalents: `gh pr view <number> --comments` to read,
`gh pr list --json number,title,author,authorAssociation` to enumerate (keep
only PRs whose `authorAssociation` is not `OWNER`, `MEMBER`, or `COLLABORATOR`),
and `gh pr comment` / `gh pr edit --add-label` for comments and labels.

## When a skill says "publish to the issue tracker"

Create a GitHub issue.

## When a skill says "fetch the relevant ticket"

Run `gh issue view <number> --comments`.

## Wayfinding operations

Used by `/wayfinder`. The **map** is an issue; its **child tickets** are that
issue's sub-issues, and they also share a milestone that carries the map's
title.

- **Map**: an issue labelled `wayfinder:map`, holding the Destination / Notes /
  Decisions-so-far / Fog body. The map stays an issue rather than becoming a
  milestone: milestones carry no comment thread and no labels, so a milestone
  description could not be appended to as decisions land.

- **Milestone**: each map owns one milestone whose title is the map's title —
  `gh api repos/{owner}/{repo}/milestones -f title="<map title>"`. This is what
  makes the map's children filterable server-side in a single
  `gh issue list --milestone` call, with every field the frontier needs. The
  sub-issue relation below carries the map's **order**; the milestone carries
  the **query**. Both are set by the one `gh issue create` call that opens the
  child, so they cannot drift apart.

- **Child ticket**: an issue created under the map and inside its milestone in
  one call —

  ```sh
  gh issue create --title "..." --body-file - \
    --parent <map> --milestone "<map title>" --label "wayfinder:<type>"
  ```

  `--parent` makes it a sub-issue of the map, which is GitHub's native
  parent-child relation: up to 100 sub-issues per parent, nestable eight deep,
  and the map's issue page renders them as an ordered, reorderable checklist
  with a progress bar. The `wayfinder:<type>` label is one of
  `research`/`prototype`/`grilling`/`task`. `--parent` already puts a
  "Part of" link on the ticket, so the body needs no `Part of #<map>` line.
  To adopt an existing issue: `gh issue edit <n> --parent <map>
  --milestone "<map title>"`. Once claimed, assign it to the driving dev.

- **Blocking**: native, and reachable straight from `gh` — no API call and no
  token. GitHub calls the relation an *issue dependency*, and a ticket may
  carry up to 50 links per direction.

  ```sh
  # open #<blocked> already blocked by #<blocker>
  gh issue create --title "..." --body-file - --blocked-by <blocker>

  # add or drop the relation afterwards
  gh issue edit <blocked> --add-blocked-by <blocker>
  gh issue edit <blocked> --remove-blocked-by <blocker>

  # read it, in either direction
  gh issue view <n> --json blockedBy,blocking
  ```

  `--blocked-by` and `--blocking` are inverses of one relation, so state it
  once, from whichever end you are already holding. The JSON is
  `{"nodes":[{"id","number","title","url","state"}],"totalCount":N}`, with
  `state` reading `OPEN` or `CLOSED`. A ticket is unblocked when every entry in
  `blockedBy.nodes` is `CLOSED`. The web UI, project boards, and `/wayfinder`
  read the same relation, so the frontier renders without opening the map.

  GitHub also offers an `is:blocked` search filter, but its docs do not say
  whether a ticket stops matching once its blockers close. Don't build the
  frontier on it — read `blockedBy[].state` and decide locally, as below.

- **Frontier query**: open tickets in the map's milestone, dropping the map
  itself, any that has an assignee, and any that still has an open blocker.

  ```sh
  gh issue list --milestone "<map title>" --state open --limit 100 \
    --json number,title,assignees,blockedBy,labels \
    --jq '[ .[]
            | select([.labels[].name] | index("wayfinder:map") == null)
            | select(.assignees == [])
            | select([.blockedBy.nodes[] | select(.state == "OPEN")] == []) ]
          | sort_by(.number)'
  ```

  The map carries its own milestone, so it comes back from that `gh issue list`
  like everything else — open, unassigned, and blocked by nothing. Without the
  label filter it is a frontier entry, and it is the one issue in the milestone
  that is never work to pick up.

  That orders by issue number, which is map order as long as the children were
  opened in the order the map lists them. When the map's sub-issue list has
  been reordered since, take the order from the map itself and rank by it:

  ```sh
  gh issue list --milestone "<map title>" --state open --limit 100 \
    --json number,title,assignees,blockedBy,labels \
    | jq --argjson order \
        "$(gh issue view <map> --json subIssues \
             --jq '[.subIssues.nodes[].number]')" '
        [ .[]
          | select([.labels[].name] | index("wayfinder:map") == null)
          | select(.assignees == [])
          | select([.blockedBy.nodes[] | select(.state == "OPEN")] == []) ]
        | sort_by(.number as $n | $order | index($n))'
  ```

  The filter matters more in this second form than in the first. A map is not
  its own sub-issue, so `$order` does not carry its number, `index` answers
  `null` for it, and jq sorts `null` ahead of every number — an unfiltered map
  does not merely appear in the frontier, it takes first place.

  First entry wins.

- **Progress**: `gh issue view <map> --json subIssuesSummary` returns
  `{"total","completed","percentCompleted"}` for the map in one call.
  `gh api repos/{owner}/{repo}/milestones --jq '.[] | {title, open_issues,
  closed_issues}'` gives the same count from the milestone side.
- **Claim**: `gh issue edit <n> --add-assignee @me` — the session's first
  write.
- **Resolve**: `gh issue close <n> --comment "<answer>"`, then append a context
  pointer to the map's Decisions-so-far.
