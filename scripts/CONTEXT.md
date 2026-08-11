# prep-cli — the bootstrap script

The vocabulary of `scripts/bootstrap.sh`, the one-liner a person runs before
prep exists on their machine. The script sits outside prep on purpose
(docs/adr/0009): it shares no code with anything prep exports, and it is the
only part of this repository somebody meets before installing anything.

prep's own vocabulary — `preset`, `gap`, `setup`, `chef`, `harness` and the
rest — is in `CONTEXT.md` at the root, and this file uses those terms as they
are defined there. The reverse is not true: the root glossary names this script
once. `CONTEXT-MAP.md` says which of the two to read.

## Language

**Entry point**:
The first thing a person runs. Not prep, but a bootstrap shell script that sits
outside it (docs/adr/0009). Somebody who has never used a CLI has a chain to
cross before reaching prep at all — a package manager, git, bun, Node, gh,
Claude Code, and prep itself, and then, on the way to the project alone, a
GitHub login and a git identity. prep cannot build the world that precedes it,
so the script takes that place.

The script opens the chain, reads `prep chef --json` to close the gaps that
are left, and then, if it has one to clone, clones the prepared repository and
runs `prep setup` in it. Which repository that is is the one thing it cannot
work out for itself, and **the script asks last, where the answer is used**, so
the entry point stays the single line a person can be handed, `curl … | bash`,
with nothing to paste onto the end of it and no environment variable pinned to
the front. Asking last is what makes the question affordable: by then the
machine is built, so somebody who has no repository yet already holds
everything a repository would have needed. Answering is optional, and this is
the one question in the script whose refusal is an ending rather than a stop —
Enter closes the run the way a run with nothing to clone already closed. Two
runs are never asked at all: one that set `PREPARED_REPO` in the environment
has answered ahead of the question (docs/adr/0015), and one with no terminal
has nobody to ask, so it takes the same ending Enter takes — the machine-only
one, whose next action is a `git clone` neither run needs a terminal for
(docs/adr/0028). A run that clones ends by printing the two commands that finish
the job, `cd` into the project and `claude`, because a script cannot move the
shell that called it. On macOS the brew installer pulls in the Command Line
Tools, so git arrives with it — and until they arrive `/usr/bin/git` is there
without git being there, a stub whose job is to ask for the tools when somebody
runs it. So the step runs git rather than looking it up: looking it up passes on
a machine where the very next command fails, and the sentence naming what to do
about it sits in the branch that could not be reached. On Linux apt is already
the system, so it starts with `sudo apt install git`. The
script carries no tool list of its own — **prep decides and the script
executes.** The registry stays the single answer to what a machine should hold,
and the guidance in `--json` is the contract between the two.

The exception is the chain itself. **A link is what the destination needs at run
time, and the script installs every link with a command of its own**
(docs/adr/0013, docs/adr/0017). Claude Code is a link because without a harness
there is nobody to read the permission files `prep setup` just wrote; it comes
from the vendor's native installer and not from the registry. Node is a link
because that installer lays down a `claude` that will not start without one and
never mentions it — the tarball nodejs.org publishes, pinned and checksummed,
unpacked into `~/.local` rather than a version manager or a distribution
package. gh is a link because the project the chain clones last is somebody
else's to choose and may be private, and an unauthenticated request for a
private repository comes back 404 rather than forbidden, so a clone without a
login fails while describing the wrong problem. **The login is a link on one
branch only.** prep's own repository stopped needing it when it was published
(docs/adr/0020), which left it standing ahead of a clone that no longer needed
it, so it now sits inside the project step, after the repository has been named
and only when that repository is on github.com (docs/adr/0021). A run that names
no project meets no login at all, and neither does a project hosted elsewhere.
Codex is not in the chain — chef names it as a gap and a person
installs it. So the harness install command lives in two places: the script
holds the one that opens the chain, the registry holds the advice the report
prints.

**A login is not a link, and the script stops in front of one.** Carrying a
dependency and performing an authentication are different things: software can
be installed on somebody's behalf, and a browser login cannot (docs/adr/0017).
So the script installs gh early, carries on without an account, and stops only
where one is needed — inside the project step, naming
`<path to gh> auth login --git-protocol https --web` and the device-flow page at
`github.com/login/device` for the machines where no browser opens — WSL, a
headless VM, SSH without display forwarding. Driving that login from the script
was tried and it failed on a real run, because the login is a full-screen prompt
and a script reading a pipe cannot put the terminal in the state it needs.
Stopping costs little: every install is guarded, so the second run walks through
what is done and carries on. `gh auth setup-git` still runs from the script once
a login exists, since it is not interactive and it is what makes plain HTTPS
`git clone` work.

**A person is asked for one thing, sent away for a second, and told about a
third.** git's name and email are asked for when they are unset — and because
that step sits after the GitHub login, on the same branch, the answers are
offered rather than demanded: `gh api user` gives the account's name, and the
email defaults to the `<id>+<login>@users.noreply.github.com` address GitHub
hands out for commits, which is safe to publish and always right for that
account. Enter takes both, so the run that follows a login needs no typing at
all. Asking still needs a terminal, so a run without one stops and names the two
commands instead. A run that names no project never reaches the step at all
(docs/adr/0021). The second thing is the GitHub login above — sent away for
mid-run on the project branch, where a clone needs it.

**The ending says what this run did, and leaves the machine's standing state to
prep.** Both of those answers were once the ending's: it asked
`gh auth status` and `git config --get` in its own shell and named whichever came
back empty. prep reads both now, as **pass** items, and the harness logins with
them (docs/adr/0026), so the ending names neither and points at `prep chef`
instead (docs/adr/0027). The rule that moved them is the one the tool list already
follows — **prep decides and the script executes.** Two actors answering the same
question are two answers free to drift, and on the day they differ nobody can say
which read the machine. What the ending still reports is this run's own leftovers:
gaps that would not install, and tools it could not give their own name. The third
thing a person is told about is the Claude Code login: the
first `claude` run authenticates through a browser, which the script cannot do
for anybody. **The two browser logins are handed over together wherever a run
ends in front of one**, so somebody opens a browser once: the closing message
says the Claude Code login, and so does the stop at the GitHub login, which is a
run that ends before reaching the closing message at all (docs/adr/0028). One
wording says it in both places — `claude_login_note` — and it names the account
the login needs, since Claude Code carries a paid plan only. Codex's own login is
named on the ending because the script never installs Codex, so a run ends with
the machine holding none — and a login question about a harness that is not there
is the one question chef does not ask, since its rows are gated on the harness
being installed (docs/adr/0026). Once somebody installs it, chef names the
login from then on. Nothing about it is waiting on a browser this trip.

**The ending names one next action, and prints everything else as reference.**
A finished run has several things to report — where the project is, gaps that
would not close, tools it could not name, two logins no report can perform, and
the command that reports the rest — and exactly one of them is the thing to do
next. That one is the **next
action**: drawn between two rules under a `Next:` headline, with the commands that
perform it and nothing else, above a `For reference` heading that turns the rest
into reference (docs/adr/0028). Somebody who reads the first block and stops has
read the thing to do. A run that cloned points at the project it just prepared —
`cd` and `claude`. A run that stopped at the machine points at getting one —
`git clone` and `prep setup`, ordinary commands by then, since prep is installed:
**the ending never sends anybody back through the entry point.** Re-running the
one-liner belongs to the stops, which resume where they stopped; a finished run
has nothing to resume, and asking for a second download to answer one question
was the one thing that ending got wrong.

**An account that cannot see a repository is not a broken machine.** Before the
project clone the script asks `gh repo view`, an authenticated question, and a
failure is reported as a missing invitation naming the account that was logged
in. An anonymous probe would have been worse than nothing: against a private
repository it fails for everybody, including the people it was about to work
for.

**The probe ahead of prep's own clone asks git instead.** That repository is
public, so visibility has one answer for everybody and only existence is left to
ask about — and the probe runs before any login, where gh has nothing to ask
with: gh makes no unauthenticated call at all, and answers even a public
`gh repo view` by telling the caller to log in. So `git ls-remote` asks it, under
`GIT_TERMINAL_PROMPT=0` so a repository that has stopped answering fails there
rather than stopping the run at a password prompt (docs/adr/0021). What it guards
against is a repository that moved or was renamed, which git settles as well as
gh did.

The script is `scripts/bootstrap.sh` here, served from the GitHub repository the
one-liner names (docs/adr/0015). It sits beside the contract it reads, so a
change to `--json` and the change to its consumer are one commit.
`scripts/gaps.ts` is what reads that report — the script's own logic rather than
prep's, run under the bun the chain has just installed, which is what keeps `jq`
out of the chain. That repository is `github.com/hanjukim/prep-cli`, and it is
public, which is what makes the one-liner a line anybody can be handed: a `curl`
against a private repository comes back 404 for every reader, invited or not, so
the entry point did not work at all until this was settled (docs/adr/0020). Its
first commit is a `git archive` of the tree as it stood on the self-hosted
instance the project was built on, so it carries no history from there
(docs/adr/0018) — and it is the home rather than a mirror, so a change travels
by being pushed to it (docs/adr/0019).

**PATH is amended as the chain is built, and written down for the shells that
come after.** Every installer leaves its binary in a directory a fresh shell does
not carry — `~/.local/bin`, `~/.bun/bin`, `/opt/homebrew/bin`. The script exports
each directory as it goes and confirms the binary by name before moving on, so a
link that installed and cannot be found stops the run there (docs/adr/0013).

Each step reads the disk before it asks PATH, because a terminal that started
before the last run carries none of the directories that run wrote down. Asked
the other way round, a machine that already holds the tool answers no and the
step installs it over itself — Homebrew over Homebrew, and bun over bun with
bun's own installer appending to a rc file again every time.

Exporting covers this run only. The two tarballs edit no rc at all, and the
installers that do — bun's and Claude Code's — edit one when they can identify
the shell, which is another vendor's judgement about this machine. So the script
writes both directories it exports itself, `~/.local/bin` and `~/.bun/bin`, into
every shell rc that is already there, each line guarded so a directory already on
PATH is not put on twice. bun's own line writes the directory through a variable
and this one writes what it expands to, so neither finds the other and a shell
reading both still carries it once. That is what makes the new terminal at the
end carry what this run installed — `claude` and `prep` alike (docs/adr/0024).

**Which files those are is a question about shells, not about bash.** The list is
`~/.bashrc`, `~/.bash_profile`, `~/.zshrc`, `~/.profile` and
`~/.config/fish/config.fish`. `.bash_profile` is on it because a bash login shell
reads the first of `.bash_profile`, `.bash_login` and `.profile` that exists and
stops, so a machine carrying one never reads what was written to `.profile`.
`config.fish` is on it because fish reads none of the others and answers
`export PATH=…` with a syntax error, so the block written there is fish —
`if not contains` and `set -gx PATH` — chosen off the file being written into.
Every file that exists is written to rather than the one `$SHELL` names, because
one person runs bash in one terminal and zsh in another and this run installed
the tools for both.

`$SHELL` decides one thing: which file to create where the shell it names reads
none of them. The question is about that shell rather than about the machine: an
account with a `.profile` and no `.zshrc` has a rc file, zsh opens none of the
ones this script writes into, and it gets a `.zshrc` made for it exactly as an
account with nothing at all would. Where `$SHELL` is unset — a `su`, a cron —
the password database answers instead, which is `getent` on Linux and `dscl` on
macOS, a machine that keeps the record in Directory Services and carries no
`getent` to read it with. What gets created used to be `~/.profile` always, and
zsh never reads `~/.profile` — a fresh macOS account and anybody who ran `chsh`
before writing a rc got a file their own shell does not open. So it is
`~/.zshrc` for zsh, `config.fish` for fish, `.profile` and `.bashrc` together
for bash, and `.profile` for anything else. csh and tcsh
get the POSIX line and no branch of their own: they would need a third syntax and
a fourth set of files, neither platform starts anybody on one, and a guess
written into a rc is worse than a line somebody adapts (docs/adr/0024).

**The one terminal no rc file reaches is the one running the script.** It read
its rc before any of this existed, so a command named for a person to run
themselves is named by its full path — `$GH_BIN auth login`, not `gh auth login`.
That works for one command and does not carry: by the time somebody wants
`prep chef` or `claude` in that terminal, writing every name out in full is
worse than handing the PATH over once. A script cannot do it for them: the
environment is copied when the shell forks, so what this run exports dies with
it and the only way into that terminal is the parent shell running something
itself. What it runs is a file this run leaves at `~/.local/share/prep` —
`env.sh`, or `env.fish` where the login shell is fish, each carrying the same
guarded blocks the rc files get. A path is shorter to type than the export line,
is the same words on every machine, and can be read before it is trusted, which
is the shape rustup, nvm and bun's own installers all landed on. The script
prints the one line that reads it — `. …/env.sh` or `source …/env.fish` — at the
two places a run ends, drawn between two rules with the command alone in reverse
video, since it arrives at the end of a screen of install output and is the one
line that decides whether the next command somebody types is found. A run whose
output is a log rather than a terminal, and a run under `NO_COLOR`, get the same
words without the escape codes. The two places are the stop at step 9, where a
person is asked to work in that terminal and never sees the closing message, and
the **next action** on the closing message, where it leads the commands it makes
findable. The stop at step 9 also names the `curl … | bash` that
resumes the run, since it is the one handover asking for two commands. Opening a
new terminal is still what is offered first: it is shorter and needs no paste
(docs/adr/0024).

**A tool this machine holds is one installed for this machine.** Every install
is guarded by whether the binary is already there, and on WSL that question has
a wrong answer available: Windows drives are mounted under `/mnt`, their
executables are on the Linux PATH, and a Windows npm install of Claude Code
answers `claude` from there. A real run took one, skipped its own install, and
ran a Windows Claude Code under the Linux Node the chain had just put on PATH —
old enough that the marketplace refused 271 of its 278 plugins (docs/adr/0022).
So the guard resolves the name and reads the path back, and an executable under
`/mnt` is not an answer. The rule sits in that one guard rather than at the step
where it was found, because every link is looked up the same way. What is
already installed on this machine's own side is kept, however old: which
operating system a tool belongs to is the question, and its version number is
not.

**A name a package did not leave behind is given in one place.** Debian family
installs `fd-find` as `fdfind` and `bat` as `batcat`, and everything that
reaches for either reaches for `fd` and `bat`, so the package is half of what a
finished machine holds and the name is the other half (docs/adr/0023). The
script already makes the other half for everything it unpacks itself — the last
line of the tarball install links every binary into `~/.local/bin` — and step 8
does the same for what apt installed, once, for every renamed tool at once
(docs/adr/0025). Which names those are is prep's answer and not the script's:
`--json` carries the shipped name beside the canonical one, and a reader beside
the gap reader turns the report into pairs, so no tool name is written in the
script. The report it reads is the one taken before the installs, because the
two names are a fact about the platform; what the installs change is whether the
shipped name resolves, and that is asked at the moment the link would be made. A
name that already answers is left alone, so a `fd` somebody built from source
and a link an earlier run made are both kept, and a shipped name that resolves
to nothing is printed at the end rather than linked to nothing at all.

**A link stops the run, a gap does not.** The chain is what the destination
depends on, so a step that fails names itself and ends the run — and because
every install is guarded, every clone by whether the directory is already there,
and the login by whether there is one already, running the script again picks up
where it stopped. What comes back from `--json` is a different kind of thing: a
machine missing `fd` is an inconvenience, so a gap that will not close is
collected and printed at the end, and the project still gets set up. **The
harness's plugins are gaps too** (docs/adr/0022). The harness is a link because
without it nobody reads the permission files `prep setup` writes; a plugin has
no such claim, and a marketplace is somebody else's file whose schema moves. A
run that lost a whole machine to one is what that costs, and it happened.

**Only the script changes the machine.** prep starts nothing but the fixed
read-only questions its **pass** items ask — `gh auth status`, `git config
--get` — and changes nothing on any path (docs/adr/0010, narrowed by
docs/adr/0026). chef reads, decides, and reports, naming a command or a
document for each gap. That is why `sudo` is not prep's question — a shell
script running it is ordinary, and a tool that closes secrets with `deny` never
ends up asking for root in the same run.

The script does not decide what prep decides. prep's two subcommands divide on
purpose and not on scope: **chef reads, setup writes** (docs/adr/0027).
chef reads the machine on its own, and the project as well when it is handed
one; setup writes a project's files. The script calls each for what it is for,
executes what it reports, and adds no judgement of its own.

The one call the script makes is `prep chef --json` at step 8, and it names no
path. That is before step 9 asks for a project, so there is no project to name
yet — the answer is the machine, exactly as it was before chef could read a
project at all.
_Avoid_: installer, wizard, provisioning
