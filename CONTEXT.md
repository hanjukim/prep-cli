# prep-cli

A personal, security-first (deny-by-default) CLI that sets up a project and the
machine it is worked on.

The terms below are prep's own, and the code they describe is in `src/`. The
bootstrap script that installs prep keeps its vocabulary in `scripts/CONTEXT.md`
beside it, and `CONTEXT-MAP.md` says which of the two a piece of work needs.

## Language

**preset**:
A project type's static security baseline. Per type it holds one thing — the
Bash allowlist that type's toolchain needs — and the type-independent half is
put around it: `deny` on reading secrets, `deny` on irreversible commands, the
Bash commands no language cares about, `Edit`/`Write` inside the working tree,
`WebFetch` behind a question, and `acceptEdits` as the starting mode. The common
Bash half is directory listing, search, version control and GitHub — work that
does not depend on the language, so no type's own list repeats it. The shape is
Claude Code's and Codex's own `permissions` schema, reused as it stands: prep
invents no grading of its own. Nothing in a preset is produced at run time. The
values are decided in this repository, as static data, and read back as they
are.
_Avoid_: profile, template

Every allow entry is a prefix rule (`npm:*`). An exact rule asks on the calls
people actually make — `npm install left-pad` — and a baseline that interrupts
routine work gets widened by hand or ignored, which is worse than a wide one
written down. What stays closed is everything that leaves the project: `sudo`,
paths outside the working tree, global installs. Secrets — `.env`, key files,
`~/.ssh`, `~/.aws` — are closed on reading itself, because they are the one
class of file where the read is the leak, which is the same judgement that opens
the rest.

The deny list carries commands as well as paths (docs/adr/0006). Version control
is opened by prefix, so the ends nobody can walk back — `git push --force`,
`git reset --hard` — are closed here rather than by narrowing the allow rule
until routine work starts asking again. A command that prints the whole
environment hands over the values the read rules keep on disk, so it is closed
on the read list's own ground. A recursive delete is closed although no rule
allows it: the one path left to it is a person approving a prompt, and that is
one keystroke from unrecoverable. A command that merely looks dangerous does not
qualify.

Network domains and MCP servers are not in a preset. The one thing prep works in
is permission; installing or starting a server is the next scope out. prep
writes its files, then reads what is left on the harness side and says so
(→ handoff).

**type marker**:
The file that decides a project's type. `package.json` for node,
`pyproject.toml` for python, and nothing else — `requirements.txt` and
`setup.py` turn up in repositories that are not python projects, so they are too
weak a signal to key off. A project carrying both markers is polyglot, and both
presets are merged into one baseline. A project carrying neither loses only the
type's own command list and keeps the whole common half, since denying secrets
and allowing edits hold whatever the language is. prep never invents commands
for a language it has no table for.

**setup** (subcommand):
`prep setup [path] [--dry-run]`. The subcommand that writes the presets the type
markers select. Where no `.claude/settings.json` stands it writes one; where one
stands it reads it and **merges** into it (docs/adr/0003).
_Avoid_: promote, apply

**artifact**:
One file a setup run produces. A single run produces several —
`.claude/settings.json`, `.codex/config.toml`, the seeded guidance file
(`AGENTS.md`), and the `CLAUDE.md` pointer that sends Claude Code to it. Each
artifact carries its own path and its own status: applied, planned, merged,
declined, or skipped. Approval runs per artifact too, so a person declining one
decides nothing about the next. The human report gives each artifact a section
of its own, and `--json` returns an array of them. Consumers read the `kind`
rather than the position, because each kind carries different fields — a new
kind of file arrives as another member of the union, not as another optional
field on one shape.

The exit code is read off the artifact list. One file written is 0, nothing
written is 1, a tool error is 2. A dry run that produced a plan is 0: it was
asked for a plan and it produced one. A run that wrote one file and was refused
another did part of what it came for, and the refusal is already in the report,
so it is not turned into a failure.
_Avoid_: output, target

**harness**:
An agent CLI prep writes permission files for and hands the project over to.
There are two, and the union naming them is closed: `claude-code` and `codex`. A
harness sits in the same registry as every other tool, set apart by its tier,
because two things read that tier — setup, to decide which permission files a
project gets, and the report footer, to decide which command can hand the
project over. Nothing hands a project to ripgrep.

**per-harness artifact**:
An artifact written only because the machine holds the harness that reads it.
Which files a run produces is read off the machine, one `which` per registry
harness entry: Claude Code here means `.claude/settings.json` and `CLAUDE.md`,
Codex here means `.codex/config.toml`. A permission file for a harness nobody
has installed is a file nobody opens, so it is not written. The seeded guidance
file stands outside this gate — both harnesses read it.

On a machine holding no harness at all, the Claude files are written anyway. The
project has to carry its baseline somewhere, and the machine can be equipped
later while the project is set up once, by whoever ran this. The report keeps
that visible: each harness carries both whether it is installed and whether this
run produced its files, and the human report opens a section only when one is
missing — on a fully equipped machine the artifact list is already the answer.

A preset is the single source for both formats. The denied paths in
`.codex/config.toml` are derived mechanically from the `Read(...)` rules of the
common deny list: the `./` prefix comes off for a workspace key, a leading `~`
marks a machine path, a trailing `/**` is dropped. No value is decided twice, so
closing one more secret closes it on both harnesses. Only the command denials do
not cross: Codex separates filesystem access from command approval and has no
one-to-one key for them (docs/codex-permissions.md). The TOML is serialised by
hand rather than through a new dependency. A Codex file that already stands is
left exactly as it is rather than merged (docs/adr/0007) — but if it sets
`sandbox_mode`, the report says so, because that key makes Codex ignore the
permission profile entirely, and passing over it quietly would report an open
project as a closed one.
_Avoid_: adapter, backend

**pointer**:
The one-line `CLAUDE.md` that imports the guidance file: `@AGENTS.md`, in the
form the vendor's own documentation gives. Claude Code reads `CLAUDE.md` and
does not read `AGENTS.md`, so a project whose guidance sits in `AGENTS.md` is a
project Claude starts blind in. The guidance lives in one file and the pointer
only says where. A `CLAUDE.md` that already stands is left as it is, unread
(docs/adr/0007). It is a per-harness artifact: a run that writes nothing for
Claude Code writes no pointer either. Because this file comes into existence,
`AGENTS.md` leads the handoff check's candidate order — naming a one-line
signpost as the place to fill a Language section in would send a person to the
wrong file.
_Avoid_: symlink, mirror

**seed**:
The first text prep puts where a project has no guidance file: a title, one
paragraph, and a filled-in `## Language` section. The language rule is the one
answer prep owns, so the seed writes it out (docs/adr/0008) — word for word
the rule this repository is itself under, minus the one sentence about what
was written before it, which a new project has no use for (docs/adr/0016). The
issue tracker and the domain docs differ per project, so the seed does not even
open a heading for them — an empty heading leaves a blank in the very place
the handoff check reads for an answer. A guidance file that already stands,
even an empty one, is left untouched and named instead. Writing where nothing
stood takes nothing away from anybody, so no approval is asked. The artifact
type still carries an older comment calling the seed a shape prep stays out of
(docs/adr/0005); what prep writes today carries the language rule, and ADR-0008
is the one in force.
_Avoid_: template, scaffold

**merge**:
How the baseline meets a settings file that already stands. Rules are a union
and none is ever dropped: what the file held keeps its order and comes first,
what the preset adds follows, a duplicate lands once. Keys prep knows nothing
about — hooks, env, model, MCP servers — ride through untouched, inside
`permissions` and outside it. A scalar has room for only one answer, so a
`defaultMode` that differs is reported as a conflict instead of being settled by
prep. Plugin entries the file does not carry yet are added, and any it does
carry are left exactly as they are; they are counted apart from the rules, since
a plugin is not a permission rule.

A person sees it before anything lands: the diff goes up, each conflict is put
one at a time, a final summary names the file, and only then is anything
written. Declining leaves the file byte for byte as it was. A non-interactive
run — a pipe, `--json`, `--dry-run` — plans and asks nothing, because a run
reading from a pipe must never stop on a question nor answer one on a person's
behalf. No backup file is written. A file that cannot be read, or whose shape
prep cannot merge without guessing at it, stops the run as a tool error.
_Avoid_: overwrite, sync

**plugin recommendation**:
The Claude Code language-server plugin a project's type calls for. One line
splits the work: **a person installs it, prep enables it.** What a machine holds
is that person's decision; switching on something already held, for this one
project, is a line in a settings file and so is prep's.

The LSP engine is Claude Code's own. What a plugin carries is one block of
configuration — the marketplace's `lspServers` block, saying which command
answers for which file extension — and no code. So being equipped has two
layers: the plugin is switched on, and the **executable that block names is on
PATH**. Neither the plugin nor prep puts that executable there. With only one
layer nothing happens at all, and the plugin-only case is the quiet one: the
configuration reads as complete while nothing loads, which is why the report
gives it the most room.

The table of which type wants which plugin is static, the same as the registry
and the presets (docs/adr/0002): `typescript-lsp` for node, `pyright-lsp` for
python, both from `claude-plugins-official`. A polyglot project gets both; a
project with no recognised type gets none, on the presets' own principle that
prep invents no tooling for a language it has no table for. Codex is out of
scope — it has no matching concept of a plugin.

A recommendation stands in one of three states. Where the project's settings
already carry an entry for the plugin it is **answered**, and prep leaves that
entry alone whatever its value: an entry at `false` is somebody having switched
the plugin off, an answer as binding as switching it on. Where the settings say
nothing and the machine holds it, it is **installed**, and that is the one prep
acts on. Where neither is true it is **missing**, and prep shows the install
command. The states are decided in that order because an entry in the settings
file is a person's answer and outranks anything the machine holds.

Whether the machine holds it is read from the harness's install record. Each
install carries its scope: a machine-wide one counts in every project, a
project-scoped one only in the directory it names. That read goes through
setup's own file-system boundary — there is no separate path into the home
directory. An unreadable record stops the run as a tool error, because falling
back to "not installed" would tell somebody to install what they already have. A
run with no recognised type never opens the record at all: a run that would make
no recommendation should not fail over somebody else's file.

Enabling means adding an entry to the settings file, so it rides the ordinary
write-and-merge path: on an existing file it shows up in the diff and is
approved (docs/adr/0003). An entry is written only where both layers are there.
An entry switching on a plugin whose executable is absent leaves a file that
reads as equipped while nothing loads. The executable is looked up through the
same `which` boundary doctor probes with, and where it is absent the install
command is shown — shown, and run by a person. The recommendation section
disappears only when both layers have been answered.
_Avoid_: auto-install, extension

**handoff**:
What the harness side still owes once prep has written its files, reported at
the end of a setup run. Three items, the ones `/setup-matt-pocock-skills` leaves
behind: the `## Language` section of the guidance file (`AGENTS.md` or
`CLAUDE.md`), `docs/agents/issue-tracker.md`, and `docs/agents/domain.md`. prep
produces none of their contents. It reads them, judges each one, and names it.

There is one exception. With no guidance file at all, prep writes `AGENTS.md` as
a **seed** (docs/adr/0005). The seed fills the Language section in, so that item
reads ready, and the report still points at the harness for the other two
(docs/adr/0008). Neither of those two is seeded: naming the tracker is most of
the tracker document, and the domain document is boilerplate the harness copies
whole.

Judging reads the text, not the file's existence. A heading with no prose under
it is **empty**; no file at all is **missing**; a section that says something is
**ready**. The first two stay apart because a person's next move differs between
them — one thing was started and stopped halfway, the other was never started.
Nothing here moves the exit code: being owed something is not a failed run. It
is a read, so it comes out under `--dry-run` as well. On a run that seeded a
file, the check runs after every artifact is produced, so a file prep has just
written is never reported as absent.
_Avoid_: checklist, validation

**next step**:
A command worth running once the report is over, read off what the run did. Four
of them: **approve**, where a merge was planned and nobody was there to approve
it; **harness**, where the handoff is still owed and a harness is here to be
asked; **install-harness**, where the same is owed and nothing on this machine
can be asked; **doctor**, where the project is now set up and the machine is the
next scope out. Each is the level of intervention doctor holds to — a verified
command, shown, run by a person. prep runs none of them.

The order is fixed: what this run started and left unfinished comes first, and
the wider scope comes last. `approve` is `prep setup <path>`, at a terminal this
time. `doctor` is offered only to somebody who has just settled a project, so it
stays out of a dry run.

The harness command is chosen by reading the machine. Every harness in the
registry carries one handoff command, and prep offers only the ones this machine
holds — a line that starts a binary nobody has does not run when pasted. With
both installed it names the first and keeps the second as an alternative on the
same line: which harness somebody works in is not prep's to decide, and two
commands printed as two lines read as an instruction to run both. With none
installed the step becomes `prep doctor`, which is where a missing harness is
named (→ entry point), and the doctor step is then not appended a second time —
the same command carrying two different reasons is the shape this section exists
to avoid.

Reading the machine settles which command to print and nothing else. Whichever
harness is installed, the exit code is unchanged: it comes from the artifact
list alone. Where there is nothing to offer, the section is not printed — a
footer that says the same three things every time stops being read after the
second run. After an approval the steps are computed again, since a merge that
has just been approved is nothing to go back and approve.
_Avoid_: guidance, hint, suggestion

**check result**:
What doctor read about one registry entry: its id, its status, the binary
actually looked up, where that binary was found, the name this platform's
package ships that binary under where it is not the same one, and the guidance
that goes with it. The status is one of three — **installed**, **missing**, or **unsupported** —
and the last one means this platform has no entry for the tool, so the question
does not apply here rather than the answer being no. It is a read and nothing
else: PATH is walked with `which`, no subprocess is started, and every path
through doctor works the same way (docs/adr/0010).

**gap**:
An entry this machine does not hold — a check result whose status is missing. An
unsupported entry is not a gap: another OS's package manager is not this
machine's concern. A missing prerequisite is the gap that invalidates the
others' advice, since every install command below it runs through the package
manager that is not there; the report keeps those gap lines and takes their
commands back. Any gap at all makes doctor exit 1, which is an observation and
not a failure — a tool error is 2.

**renamed binary**:
The name a distribution ships a tool's executable under, when the tool's own
name was taken by a package that was there first. Debian and Ubuntu ship `bat`
as `batcat` and `fd-find` as `fdfind`; brew ships both under their own names, so
this belongs to one platform's entry in the registry and to no branch in the
code. The table records it beside that platform's guidance, and the check does
not read it.

The canonical name is what counts. It is what a person types, what an alias
expands to and what a repository's own scripts call, so the check asks for `bat`
on every platform, and a machine answering only to `batcat` is a gap like any
other — reported as one in the human report and in `--json` alike
(docs/adr/0023).

The package is half of what a finished machine holds and the name is the other
half, and the two halves are closed by two different things. The guidance is the
install command for the package and says nothing about a name, because guidance
is a command a person can paste. The name is made by one step of the bootstrap
script, over every renamed tool at once, in `~/.local/bin` — a directory that is
the script's and not the table's (docs/adr/0025). What the table owes that step
is the shipped name, which is why `--json` carries it beside the canonical one:
a reader outside prep pairs the two without a table of its own. prep creates
neither half (docs/adr/0010).
_Avoid_: alias, binary override

**guidance**:
What prep says about a gap, at one of exactly two levels: a manual note, with a
URL where there is one, or a verified command. There is no third level, because
prep starts no process on any path (docs/adr/0010) — it prints a command or it
prints a note, and something else acts on it. A command runs unattended: every
apt one carries `-y`, since apt asks before it pulls a dependency along and the
bootstrap script runs these with no terminal to answer on. The person pasting
the same line loses nothing by it. The word carries a second,
unrelated sense in the code: a *guidance file* is the prose a harness reads
before it does anything else, `AGENTS.md` or `CLAUDE.md`. The two never meet —
one is a line about a machine, the other is a file in a project.
