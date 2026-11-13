# prep-cli

A personal CLI that sets up a project and the machine it is worked on. It reads,
decides and reports; the two files of prose a project starts with are all it
writes.

The terms below are prep's own, and the code they describe is in `src/`. The
bootstrap script that installs prep keeps its vocabulary in `scripts/CONTEXT.md`
beside it, and `CONTEXT-MAP.md` says which of the two a piece of work needs.

## Language

**type marker**:
The file that decides a project's type. `package.json` for node,
`pyproject.toml` for python, and nothing else — `requirements.txt` and
`setup.py` turn up in repositories that are not python projects, so they are too
weak a signal to key off. A project carrying both markers is polyglot, and is
both types at once. The type decides one thing: which **plugin recommendation**
the report makes. It changes nothing about which files are written, so a project
carrying neither marker gets the same files and no recommendation. prep never
invents tooling for a language it has no table for.

**setup** (subcommand):
`prep setup [path] [--dry-run]`. The subcommand that writes. What it writes is
prose — the **seed** and the **pointer** — and only where no file stands. It
writes no permission file for any harness and changes no settings file
(docs/adr/0031), so it asks no question: a run at a terminal and a run reading
from a pipe do the same work. The question it answers is **what does this
project need written**, and with no path it falls back to the working directory
— a run that writes into where you are standing is the run people mean.
_Avoid_: promote, apply

**chef** (subcommand):
`prep chef [path]`. The subcommand that reads and reports and changes nothing.
The question it answers is **what is missing**, and the two subcommands divide on
that — on purpose, not on scope: chef reads, setup writes (docs/adr/0027). It
reports the machine's **gaps** and its **pass** items on every run. Given a path
it reports that project too: the project-scope pass items, and the **handoff**
the project is still owed.

**The name is the kitchen's, and so is the register around it.** `prep` is prep
work, the mise somebody does before service, and **pass** is the shelf a finished
plate goes on for someone else to pick up — which is what makes that entry
readable at all. A chef is the person who knows the whole kitchen and can say
what is missing before service, which is this subcommand's job (docs/adr/0029).

It was called `doctor` until then. That name said somebody visits a sick machine
and says what is wrong, and it stopped describing the job once the subcommand
read a project it was handed, held the **handoff**, and counted what was still on
the pass. **Records written before the rename keep saying `doctor`** — a record is
not edited into agreement with a later one (`CONTRIBUTING.md`), and three carry
the old name in their file name. Read them as this entry, and expect no `doctor`
in anything that runs: the old spelling was removed rather than kept working, so
`prep doctor` is refused like any other unknown word.

**It never guesses which project it is in.** With no argument it reads the
machine and nothing else. A path is a person naming the project, and detection
would be a guess prep has no way to make safely — `~/.claude/settings.json`
stands on nearly every machine running Claude Code, and people keep `~` under
git for dotfiles, so any rule strong enough to recognise an empty directory
recognises the home directory as well. It also keeps the bootstrap script's own
call whole: that call names no path, so the answer it gets is the machine, byte
for byte what it was (docs/adr/0009).
_Avoid_: doctor, check, audit, lint

**artifact**:
One file a setup run produces. There are two kinds: the seeded guidance file
(`AGENTS.md`), and the `CLAUDE.md` pointer that sends Claude Code to it. Each
artifact carries its own path and its own status: **applied** where prep wrote
it, **planned** on a dry run, **skipped** where a file already stood and was left
alone. The human report gives each artifact a sentence of its own, and `--json`
returns an array of them. Consumers read the `kind` rather than the position — a
new kind of file arrives as another member of the union, not as another optional
field on one shape.

The exit code is read off the artifact list. One file written is 0, nothing
written is 1, a tool error is 2. A dry run that produced a plan is 0: it was
asked for a plan and it produced one. A run that wrote one file and found the
other already standing did what there was to do, so it is 0 as well.
_Avoid_: output, target

**harness**:
An agent CLI prep hands the project over to. There are two, and the union naming
them is closed: `claude-code` and `codex`. A harness sits in the same registry
as every other tool, set apart by its tier, because the report footer reads that
tier to decide which command can hand the project over. Nothing hands a project
to ripgrep. Which harness a machine holds decides nothing about what setup
writes (docs/adr/0031).
_Avoid_: adapter, backend

**pointer**:
The one-line `CLAUDE.md` that imports the guidance file: `@AGENTS.md`, in the
form the vendor's own documentation gives. Claude Code reads `CLAUDE.md` and
does not read `AGENTS.md`, so a project whose guidance sits in `AGENTS.md` is a
project Claude starts blind in. The guidance lives in one file and the pointer
only says where. A `CLAUDE.md` that already stands is left as it is, unread
(docs/adr/0007). It is written whichever harness the machine holds: a project is
handed to more machines than the one it was set up on, and the line costs
nothing where Claude Code never reads it. Because this file comes into existence,
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

**plugin recommendation**:
The Claude Code language-server plugin a project's type calls for. **prep names
it, and a person does the rest**: installing one is a command a person runs, and
so is turning an installed one on for this project. prep shows the command for
whichever is next and writes nothing (docs/adr/0031).

The LSP engine is Claude Code's own. What a plugin carries is one block of
configuration — the marketplace's `lspServers` block, saying which command
answers for which file extension — and no code. So being equipped has two
layers: the plugin is switched on, and the **executable that block names is on
PATH**. Neither the plugin nor prep puts that executable there. With only one
layer nothing happens at all, and the plugin-only case is the quiet one: the
configuration reads as complete while nothing loads, which is why the report
gives it the most room.

The table of which type wants which plugin is static, the same as the registry
(docs/adr/0002): `typescript-lsp` for node, `pyright-lsp` for python, both from
`claude-plugins-official`. It is also where the **type marker** lives, since a
recommendation is the only thing the type decides. A polyglot project gets both;
a project with no recognised type gets none. Codex is out of scope — it has no
matching concept of a plugin. The recommendation is made whether or not Claude
Code is on the machine: the project is set up once, and the machine can be
equipped later.

A recommendation stands in one of three states. Where the project's settings
already carry an entry for the plugin it is **answered**, whatever its value: an
entry at `false` is somebody having switched the plugin off, an answer as binding
as switching it on. Where the settings say nothing and the machine holds it, it
is **installed**, and prep shows `claude plugin enable <id> --scope project`.
Where neither is true it is **missing**, and prep shows the install command. The
states are decided in that order because an entry in the settings file is a
person's answer and outranks anything the machine holds.

The settings file is read for that one key, `enabledPlugins`, and never written.
Nothing else in it is opened, so no other part of the harness's schema can break
the read. A file that is not a JSON object stops the run as a tool error; a
plugin block of any other shape names no plugin and answers for none.

Whether the machine holds it is read from the harness's install record. Each
install carries its scope: a machine-wide one counts in every project, a
project-scoped one only in the directory it names. That read goes through
setup's own file-system boundary — there is no separate path into the home
directory. An unreadable record stops the run as a tool error, because falling
back to "not installed" would tell somebody to install what they already have. A
run with no recognised type opens neither the record nor the settings file: a
run that would make no recommendation should not fail over somebody else's file.

The executable is looked up through the same `which` boundary chef probes with,
and where it is absent its install command is shown on a line of its own —
shown, and run by a person. The recommendation section disappears only when both
layers have been answered.
_Avoid_: auto-install, extension

**handoff**:
What the harness side still owes once prep has written its files. Three items,
the ones `/setup-matt-pocock-skills` leaves behind: the `## Language` section of
the guidance file (`AGENTS.md` or `CLAUDE.md`), `docs/agents/issue-tracker.md`,
and `docs/agents/domain.md`. prep produces none of their contents. It reads them,
judges each one, and names it.

**Read once, framed twice.** The judgement is a pure read — a root and a file
system in, three statuses out — so both subcommands call the same function and
neither report can be wrong about a status while the other is right. What differs
is the sentence around the rows: setup says what it has just written and what is
still owed, chef says what this project owes (docs/adr/0027). chef reports
them only for a project it was given a path to.

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
A command worth running once the report is over, read off what the run did.
Three of them: **harness**, where the handoff is still owed and a harness is here
to be asked; **install-harness**, where the same is owed and nothing on this
machine can be asked; **chef**, the machine as the next scope out. Each is the
level of intervention chef holds to — a verified command, shown, run by a
person. prep runs none of them. None of them is `prep setup` again: a run asks
nothing and leaves nothing waiting on an answer.

The order is fixed: what the project is missing comes first, and the wider scope
comes last. `chef` closes every run that reaches the end, a dry run included: what
the machine still owes a person does not depend on whether this run wrote a
file, and a dry run is exactly the run somebody uses to look before touching
anything.

The harness command is chosen by reading the machine. Every harness in the
registry carries one handoff command, and prep offers only the ones this machine
holds — a line that starts a binary nobody has does not run when pasted. With
both installed it names the first and keeps the second as an alternative on the
same line: which harness somebody works in is not prep's to decide, and two
commands printed as two lines read as an instruction to run both. With none
installed the step becomes `prep chef`, which is where a missing harness is
named (→ entry point), and the chef step is then not appended a second time —
the same command carrying two different reasons is the shape this section exists
to avoid.

Reading the machine settles which command to print and nothing else. Whichever
harness is installed, the exit code is unchanged: it comes from the artifact
list alone. The project-side steps appear only when the outcome asked for them,
so their presence means something — the chef step alone is unconditional, and
it is never printed twice: a run sent to `prep chef` for a missing harness is
not sent there again under a second reason.
_Avoid_: guidance, hint, suggestion

**check result**:
What chef read about one registry entry: its id, its status, the binary
actually looked up, where that binary was found, the name this platform's
package ships that binary under where it is not the same one, and the
guidance that goes with it. The status is one of three — **installed**, **missing**, or **unsupported** —
and the last one means this platform has no entry for the tool, so the question
does not apply here rather than the answer being no. It is a read and nothing
else: PATH is walked with `which` and no subprocess is started (docs/adr/0010).
The only processes anywhere in chef are the fixed read-only questions the
**pass** items ask (docs/adr/0026).

**Installed is the whole of what a check result says about a tool.** Not usable:
whether an account stands behind it, whether it holds an identity, whether it
would succeed at the first thing somebody asks of it. Those are **pass** items
where they are asked at all, and the split is the boundary of what PATH can
answer — `gh` on PATH with no login is installed, and it is reported the same
way whichever it is. A tool prep can find and
cannot vouch for is reported as found, and what it cannot vouch for is a row of
its own.

**gap**:
An entry this machine does not hold — a check result whose status is missing. An
unsupported entry is not a gap: another OS's package manager is not this
machine's concern. A missing prerequisite is the gap that invalidates the
others' advice, since every install command below it runs through the package
manager that is not there; the report keeps those gap lines and takes their
commands back. Any gap at all makes chef exit 1, which is an observation and
not a failure — a tool error is 2. What separates a gap from a **pass** item is
who may close it: the bootstrap script closes a gap by running its command, and
a pass item is closed by the person or not at all.

**pass**:
What chef reads as absent but must not close: a GitHub login, a git identity,
a login per installed harness, and a directory that is not a git repository.
prep's own name comes from a kitchen, and this is the first term to lean on that
register — the pass is the shelf a finished plate waits on for someone else to
pick up. prep reads, decides, plates the command, and a person takes it; no
script ever does (docs/adr/0026).

**Closed by a person's hands, or a person's decision.** A browser login is the
first kind: nobody can perform it on somebody's behalf. `git init` is the second:
anything could run it, and turning somebody's directory into a repository is
theirs to choose (docs/adr/0027). Both are what separates a pass item from a
**gap**, which the bootstrap script closes by running its command. Not the
remote — a repository pushing nowhere is a normal way to work, so its absence
says nothing worth printing.

**Machine rows** are answered by a fixed read-only question — `gh auth status`,
`git config --get` — written in the registry beside the item and run without a
shell, the one narrowing of "prep starts no process" (docs/adr/0010). The
answer is the exit code and nothing else: the output is never opened, so the
account name a login check knows cannot reach the report or `--json`. An item
is **ready**, **missing**, or **unknown** — unknown meaning the check could not
be asked, past its 5-second ceiling or with no binary to ask, and then the
report names the check command so a person can ask it themselves. The harness
rows are asked only of harnesses this machine holds, read off the registry's
own table.

**Project rows** are answered by whether one path inside the project is there,
read through the same file system setup writes through. They start nothing, so
the whitelist of what chef may run is unchanged, and they are never unknown —
a path does not time out. There is one: `.git`, which a worktree and a submodule
carry as a file rather than a directory, so presence is the question and not what
kind of entry it is. A project row is asked only where there is a project, which
means only where chef was handed a path.

**One table, in the order somebody walks it.** Both scopes sit in one registry
table and one report section, because an empty project alternates between them
and two sections would leave a reader interleaving them to find out what comes
first. `git init` leads: nothing below it has anywhere to land. Like the handoff,
a pass item never moves the exit code — an account nobody has opened is a
legitimate state, and so is a directory nobody made a repository. `--json`
carries the items under a top-level `pass` key that `scripts/gaps.ts` never
reads.
_Avoid_: account check, login gap

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
prep closes nothing on any path (docs/adr/0010) — it prints a command or it
prints a note, and something else acts on it. A command runs unattended: every
apt one carries `-y`, since apt asks before it pulls a dependency along and the
bootstrap script runs these with no terminal to answer on. The person pasting
the same line loses nothing by it. The word carries a second,
unrelated sense in the code: a *guidance file* is the prose a harness reads
before it does anything else, `AGENTS.md` or `CLAUDE.md`. The two never meet —
one is a line about a machine, the other is a file in a project.
