# ADR-0030: The map is not in the milestone it owns

**Date:** 2026-08-06
**Status:** Accepted. It narrows no record before it. **Numbered 0030 rather
than 0025**, which is the number it was written under: 0025 had been taken by
"the link that gives a name back belongs to the script" while this record sat on
its branch, and a citation of `docs/adr/0025` has to resolve to one file. The
date above is the day the decision was made, which is what the sequence orders
by — so this record sits after four it predates. The wayfinding
conventions in `docs/agents/issue-tracker.md` arrived without a record of their
own, and the milestone's job among them — collecting a map's children so one
`gh issue list` answers the frontier — is unchanged here. This record only
says who is in the collection.
**Sources:** `docs/agents/issue-tracker.md` under **Wayfinding operations**;
ADR-0019, for the tracker this is written against; the live tracker's first
map, which was opened inside its own milestone and read wrong from both
directions

## Context

A wayfinder map is an issue. Its children are its sub-issues, and they also
share a milestone titled after the map, because the sub-issue relation carries
order and the milestone carries the query — one `gh issue list --milestone`
returns every child with every field the frontier needs.

Nothing in that arrangement says where the map itself stands, and the first map
opened on this tracker put itself in its own milestone. That is not a stray
keystroke. `gh issue create --milestone` is the obvious call to make while the
milestone is the thing in front of you, and the document taught the flag on the
child without ever saying it was only for the child.

**Two readers were reading the milestone as the children, and it was not.**

- The frontier query took open, unassigned, unblocked membership as the
  definition of a ticket to pick up. A map is open, has no assignee, and is
  blocked by nothing, so it came back as a frontier entry — the one issue in
  the milestone that is never work to pick up.
- The progress bullet offered the milestone's open and closed totals as the
  same count `subIssuesSummary` gives. On the live map they read seven and
  five. The map was one of the two.

The frontier read was the worse of the two, and the ranked form of the query
made it worse still. That form ranks by position in the map's sub-issue list,
and a map is not its own sub-issue, so `index` answered `null` for it and jq
sorts `null` ahead of every number. The map did not merely appear in the
frontier; it took first place, and "first entry wins" then points the driving
dev at the map.

**A filter on the map would have answered the symptom.** Dropping issues
labelled `wayfinder:map` from both queries removes the map from the frontier
and leaves everything else as it was. It was written and rejected, for the
reason in the rationale below: it makes every reader of the milestone carry an
exception that only one of them can see, and it is not the class of bug.

## Decision

**The milestone holds the work. The map is what the work is read from, and it
stands outside.**

1. **`--milestone` is set on the child and never on the map.** Opening a map
   creates the milestone (`gh api .../milestones -f title=`) and joins nothing.
   The `gh issue create --parent <map> --milestone "<map title>"` call that
   opens a child is where membership is conferred, and adoption
   (`gh issue edit <n> --parent <map> --milestone "<map title>"`) sets both in
   the same call for the same reason.
2. **No frontier query filters the map out.** With the map out of the
   milestone there is nothing to exclude, so neither form carries a
   `wayfinder:map` filter and neither `--json` list carries `labels` for one.
   The first attempt at this bug added exactly that filter; the rationale
   below says why it was not kept.
3. **The ranked form ranks tail-safe.**

   ```
   sort_by([(.number as $n | $order | index($n) // infinite), .number])
   ```

   A milestone can still hold an issue the map does not list — an adoption
   that set `--milestone` and forgot `--parent`, or a ticket un-parented
   afterwards. `// infinite` sends any such ticket to the tail instead of the
   head, and the trailing `.number` orders the tail among itself. This is the
   ranked form only. The plain form reads no sub-issue list, so it cannot tell
   a stray member from a child and sorts it by number like any other; the
   bullet says so, and the guarantee is what the ranked form is for.
4. **The progress bullet states its condition.** The milestone's open and
   closed totals are the children's totals only while every milestone member
   is a child. Keeping the map out removes the inflator this record is about
   and not the class it belongs to, so the bullet now carries the condition
   instead of asserting the equality flat.
5. **The document says it where the milestone is defined**, not beside the
   query that suffered from it. The frontier query is one reader of a rule
   about membership; the rule belongs with membership.

## Rationale

- **The exception was invisible from where it had to be obeyed.** A label
  filter lives in the frontier query. The progress bullet, two entries down,
  reads the same milestone and would have gone on being off by one — and so
  would the next reader written, and the web UI's own milestone page, which
  takes no jq at all. A membership rule holds for every reader of the
  membership. A filter holds for the one that carries it.
- **The filter was not the class of bug.** `null` sorting first is not a fact
  about maps; it is a fact about any milestone member missing from `$order`.
  The live tracker already had a second one — an issue given the milestone
  without `--parent`, hidden only by an assignee. Filtering the map would have
  closed one instance and left the class open, with the failure mode intact and
  one fewer instance left to notice it by.
- **Owning is not standing in.** A milestone titled after the map already says
  the map owns it. Membership says something else — that this is a ticket
  collected under that title — and the map is not that. Keeping the two apart
  is what lets a reader take the milestone at face value.
- **A map in its own milestone is a progress bar that never fills.** The map
  closes last by construction, so a milestone counting it reports 5 of 6 at the
  moment the work is done. Nothing downstream would have been wrong about the
  children; it would have been wrong about being finished.

## Consequences

- The one map already opened on this tracker left its milestone
  (`gh issue edit 26 --remove-milestone`) in the change that carries this
  record.
- In the ranked form, a milestone member that is not a sub-issue no longer
  takes first place; it lands at the tail. It still appears, which is
  deliberate — it is open, unassigned and unblocked, so it is pickable work,
  and the tail is where a reader notices the parent link is missing. The plain
  form has no sub-issue list to compare against and still sorts such a ticket
  by number, so it can hand it the head. That is the price of a form that
  reads the milestone alone.
- Membership is now a thing that can be wrong, and the live tracker already
  holds one that is: an issue given the milestone with no parent, left as it
  stands. It is why the milestone's totals and `subIssuesSummary` disagree by
  one there, and why the progress bullet carries a condition rather than an
  equality. Nothing enforces membership — GitHub will put any issue in any
  milestone — so `/wayfinder` opening a map is the one place the rule is kept,
  and `docs/agents/issue-tracker.md` is where it is written down for whoever
  writes the next such caller.
- `CONTEXT.md` and `scripts/CONTEXT.md` are untouched. Map, milestone and
  frontier are tracker conventions, not terms prep or the bootstrap script is
  built out of; `CONTEXT-MAP.md` puts them in neither glossary.
