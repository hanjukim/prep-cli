#!/usr/bin/env bash
#
# The first thing a person runs (docs/adr/0009).
#
# The terms below are defined in CONTEXT.md beside this file. prep's own
# vocabulary is the one at the repository root, and CONTEXT-MAP.md says which is
# which.
#
#   curl -fsSL https://raw.githubusercontent.com/hanjukim/prep-cli/main/scripts/bootstrap.sh | bash
#
# The line takes nothing after it. The repository the person came here to work
# in is the one thing this script cannot know, so step 9 asks for it rather
# than the line carrying it, which is what keeps the entry point to something a
# person can be handed whole. Step 9 argues the timing; an answer is optional
# there, and going without one ends the run at a machine that is ready.
#
# Somebody who has never opened a terminal has a chain to cross before prep can
# run at all: a package manager, git, bun, Node, gh, Claude Code, and prep
# itself — and then, on the way to the project alone, a GitHub login and a git
# identity. prep cannot build the world that precedes it, so this script takes
# that place. It opens the chain, then hands
# the rest back to prep — `prep doctor --json` names a command for every gap that
# is left and this script runs it. The tool list lives in the registry and never
# here (docs/adr/0009 decision 3).
#
# The chain carries what the destination needs at run time, which is more than
# the destination's own installer knows about (docs/adr/0017):
#
#   - Claude Code is a link rather than a gap, because without a harness there
#     is nobody to read the permission files `prep setup` writes
#     (docs/adr/0013). Codex is not in the chain — doctor names it and a person
#     installs it.
#   - Node is a link, because the vendor's installer lays down a `claude` that
#     will not start without one and never mentions it.
#   - gh is a link, because the repository step 9 clones is somebody's own and
#     may be one an unauthenticated request cannot see at all, which GitHub
#     answers with 404 rather than a refusal. Its login is a link too, but only
#     on the branch that has such a repository to clone: prep's own clone stopped
#     needing one when this repository was published (docs/adr/0020), so the
#     login sits inside step 9, after the project has been named, rather than
#     ahead of everything (docs/adr/0021). A run that names no project meets no
#     login at all. The login itself is a person's step, not this script's:
#     carrying a dependency and performing an authentication are different
#     things, and a browser login cannot be carried. The script stops in front of
#     it and hands it over.
#
# Running it twice is safe, and stopping is cheap for the same reason. Every
# install is guarded by whether the binary is already here, every clone by
# whether the directory is already there, and the login by whether there is one
# already.

set -Eeuo pipefail

# Where prep itself is cloned from and kept. This is the repository the project
# is developed in (docs/adr/0019); the instance it was built on first is
# reachable inside one network only, and never by whoever runs this script. It
# is public (docs/adr/0020), so this clone asks nothing of an account at all —
# the project clone in step 9 is what still may (docs/adr/0021).
PREP_REPO="${PREP_REPO:-https://github.com/hanjukim/prep-cli.git}"
PREP_DIR="${PREP_DIR:-$HOME/.prep-cli}"

# Where this script is served from. It is quoted back to the person whenever
# they have to run it again, so the line they are given is the line that works.
SCRIPT_URL="${SCRIPT_URL:-https://raw.githubusercontent.com/hanjukim/prep-cli/main/scripts/bootstrap.sh}"

# The repository a new person starts working in. Cloned in step 9 and handed to
# `prep setup` in step 10. Step 9 is where it is asked for, so the entry point
# stays one line a person can be handed (docs/adr/0009).
#
# PREPARED_REPO is how a run answers ahead of the question — a fork, a test VM
# or a run with no terminal sets it and step 9 does not ask. PROJECT_DIR names
# where the clone lands, and a run that sets it alone is still asked which
# repository to put there (docs/adr/0015).
PREPARED_REPO="${PREPARED_REPO:-}"
PROJECT_DIR="${PROJECT_DIR:-}"

# The vendor's native installer. One command covers macOS, Linux and WSL, it
# wants neither sudo nor a package manager, and it auto-updates (docs/adr/0013).
CLAUDE_INSTALL_URL="https://claude.ai/install.sh"

# The Node the harness runs on, and the gh every clone goes through. Both are
# pinned rather than tracking the latest release, so every machine this script
# builds carries the same pair and a bad release cannot reach anybody before we
# have looked at it (docs/adr/0017).
#
# Node v24 is the active LTS line, codename Krypton; this release ships npm
# 11.16.0. gh 2.97.0 is the current release of the GitHub CLI.
NODE_VERSION="v24.18.1"
NODE_DIST="https://nodejs.org/dist/${NODE_VERSION}"
GH_VERSION="2.97.0"
GH_DIST="https://github.com/cli/cli/releases/download/v${GH_VERSION}"

# Where bun installs, which is also where bun's `link` puts prep in step 7. It
# is settled here rather than at step 3 because the messages this script hands
# back name the directory, and one of them is printed by a run that stops before
# step 3 ever runs.
BUN_INSTALL="${BUN_INSTALL:-$HOME/.bun}"

# Where the run leaves a file the terminal that started it can read, since that
# is the one terminal no rc reaches (docs/adr/0024). ~/.local/share is where
# this script already parks what it installs — the Node and gh trees — and it is
# not $PREP_DIR, which is a git clone this would leave an untracked file in.
PREP_SHARE="${PREP_SHARE:-$HOME/.local/share/prep}"

# Emphasis, where there is a terminal to take it.
#
# This script ends by asking a person to do one thing, and the first line of it
# is the file that gives their terminal the tools. That block is printed among a
# screen of install output they have just watched scroll by, and everything here
# exists to keep it from being scrolled past (docs/adr/0024, docs/adr/0028).
#
# A run whose output is a file or a pipe gets none of it, because escape codes
# in a log are noise rather than emphasis, and NO_COLOR is honoured because
# somebody who set it has already said so. stderr counts as well as stdout: the
# stop at step 9 goes there, and it is the message that matters most.
BOLD=""
REVERSE=""
RESET=""
if { [ -t 1 ] || [ -t 2 ]; } && [ -z "${NO_COLOR:-}" ]; then
  BOLD="$(printf '\033[1m')"
  REVERSE="$(printf '\033[7m')"
  RESET="$(printf '\033[0m')"
fi

# The width of the rules the announcement is drawn between. Narrower than the
# 80 columns the prose is wrapped to, so the block reads as a block rather than
# as more of the same.
RULE="────────────────────────────────────────────────────────────────────"

# The step being run, so a failure can say where it stopped.
STEP="start"

# Gaps that would not close. Kept rather than fatal: a gap is something the
# project stands without, and a machine missing `fd` is no reason to leave
# somebody without a set-up project.
FAILED_GAPS=""

# Names that would not be linked, kept for the same reason and reported apart
# from the gaps above. A gap is closed by running the command printed with it,
# and a name nothing on this machine answers to has no such line — what it needs
# is the package looked at, not a command pasted.
FAILED_LINKS=""

step() {
  STEP="$1"
  printf '\n==> %s\n' "$1"
}

# Anything that fails stops the run and says where. A beginner reading this has
# one line to act on rather than a wall of shell output.
on_error() {
  local code=$?
  printf '\nStopped during: %s\n' "$STEP" >&2
  printf 'The last command exited with %s. Nothing after this step ran.\n' "$code" >&2
  printf 'Fix that and run this script again. It skips whatever is already installed.\n' >&2
  exit "$code"
}
trap on_error ERR

# A stop this script decided on itself, with a reason of its own.
fail() {
  printf '\nStopped during: %s\n%s\n' "$STEP" "$1" >&2
  exit 1
}

# Whether this machine holds a tool, on this machine's own terms.
#
# WSL puts the Windows PATH on the Linux PATH, so `command -v` answers with
# executables under /mnt/c that belong to the other operating system. A Windows
# npm install of Claude Code answers `claude` this way, and taking it skips the
# install that belongs here and then drives somebody else's copy: a real run did
# exactly that, ran the Windows shim under the Linux node this script had just
# put on PATH, and reached the plugin step with a Claude Code too old to read the
# marketplace it was handed (docs/adr/0022). Every tool in the chain is exposed
# to this, not only that one, so the rule lives here rather than at one step.
have() {
  local path
  path="$(command -v "$1" 2>/dev/null)" || return 1

  case "$path" in
    # A Windows drive mounted into WSL. What lives there was installed for
    # another operating system, whatever it answers to.
    /mnt/*) return 1 ;;
  esac

  [ -n "$path" ]
}

# The one-liner pipes this script into bash, so stdin carries the script's own
# text and not a person. A question has to go to the terminal itself, which is
# what /dev/tty is. Opening it is the test: the file exists in a container and
# in CI too, and only there does opening it fail.
have_tty() {
  { : >/dev/tty; } 2>/dev/null
}

# The answer to the last ask(). A global rather than a return value, because a
# command substitution would run ask() in a subshell, where fail() could no
# longer stop the run.
ANSWER=""

ask() {
  ANSWER=""
  while [ -z "$ANSWER" ]; do
    printf '%s' "$1" >/dev/tty
    IFS= read -r ANSWER </dev/tty ||
      fail "The terminal closed before that question was answered."
  done
}

# The same question with an answer already in it. Enter takes what is shown,
# anything typed replaces it. With no answer to show it is an ordinary ask().
#
#   $1 the question, without its colon
#   $2 the answer to offer, which may be empty
ask_default() {
  local question="$1" default="$2"

  if [ -z "$default" ]; then
    ask "$question: "
    return
  fi

  ANSWER=""
  printf '%s [%s]: ' "$question" "$default" >/dev/tty
  IFS= read -r ANSWER </dev/tty ||
    fail "The terminal closed before that question was answered."
  [ -n "$ANSWER" ] || ANSWER="$default"
}

# A question the run can carry on without an answer to. ask() loops until it has
# one, which is right for everything else it is asked and wrong for the project
# at step 9, where no answer is an ending the script already has. Enter leaves
# ANSWER empty and the caller reads that.
#
#   $1 the question, with its colon
ask_optional() {
  ANSWER=""
  printf '%s' "$1" >/dev/tty
  IFS= read -r ANSWER </dev/tty ||
    fail "The terminal closed before that question was answered."
}

# Node and gh arrive on Linux the same way: a vendor tarball, a checksum file
# published beside it, and an unpack into a versioned directory under
# ~/.local/share with symlinks into ~/.local/bin. No sudo, no distribution
# repository, no version manager (docs/adr/0017).
#
#   $1 what to call it in a message
#   $2 the tarball's file name, which is also its line in the checksum file
#   $3 the URL the tarball comes from
#   $4 the URL of the checksum file
#   $5 the directory to unpack into
#   rest: the binaries to link into ~/.local/bin
install_tarball() {
  local label="$1" file="$2" tarball_url="$3" sums_url="$4" home="$5"
  shift 5

  local tmp binary
  tmp="$(mktemp -d)"

  printf 'Downloading %s.\n' "$label"
  curl -fsSL -o "$tmp/$file" "$tarball_url"
  curl -fsSL -o "$tmp/checksums.txt" "$sums_url"

  # The vendor publishes a checksum for every file in the release. One that does
  # not match is not unpacked, and stops the run where it is.
  if ! (cd "$tmp" && grep " ${file}\$" checksums.txt | sha256sum -c -); then
    rm -rf "$tmp"
    fail "$label does not match the checksum its own release publishes for it. Nothing was unpacked. Try again, on a network you trust."
  fi

  # A versioned directory with symlinks into ~/.local/bin, which is the shape
  # Claude Code's own installer uses. Running again replaces that one directory
  # rather than layering a second copy over it.
  rm -rf "$home"
  mkdir -p "$home" "$HOME/.local/bin"
  # GNU tar reads the compression off the file, so .tar.xz and .tar.gz are the
  # same call here.
  tar -xf "$tmp/$file" -C "$home" --strip-components=1
  rm -rf "$tmp"

  for binary in "$@"; do
    ln -sf "$home/bin/$binary" "$HOME/.local/bin/$binary"
  done
}

# Gives a tool the name it is called by, where the package shipped another one.
#
# Debian family installs fd-find as fdfind and bat as batcat, because both names
# were taken by packages that were there first. The package is half of what a
# finished machine holds and the name is the other half: `fd` and `bat` are what
# a person types, what an alias expands to and what a prepared repository's own
# scripts call (docs/adr/0023).
#
# This is the one place that closes that half, for every renamed tool at once and
# whatever apt did with it (docs/adr/0025). The link lands in ~/.local/bin — the
# directory install_tarball above already links Node, gh and Claude Code into,
# exported for this run and written into a shell rc for the ones after it. The
# script decides where a file goes and prep decides what is missing, which is the
# split every step here holds to (docs/adr/0009).
#
# stdin carries one pair per line, the canonical name and the shipped name
# separated by a tab, which is what scripts/links.ts reads out of a doctor
# report. Nothing to link is an empty stdin and this loop does not run, which is
# every macOS run.
link_renamed() {
  local name shipped target
  mkdir -p "$HOME/.local/bin"

  while IFS=$'\t' read -r name shipped; do
    # A blank line is nothing to link, not a pair of empty names to ask about.
    if [ -z "$name" ] || [ -z "$shipped" ]; then
      continue
    fi

    # A machine where the name already answers is left alone. It holds the tool
    # under its own name — built from source, installed from cargo, taken from a
    # backport — and a link of ours over it would swap what somebody chose for
    # what a package renamed. A link an earlier run made answers here too, so a
    # second run writes nothing.
    if have "$name"; then
      continue
    fi

    # The shipped name is resolved into a path before anything is written. An
    # unresolved one is a package that did not install, or one that installed
    # and laid down nothing under the name this table expects; `ln -sf ""` was
    # verified to exit 0 and leave a symlink pointing at nothing, which is the
    # machine that reports itself finished and runs neither name.
    if ! have "$shipped"; then
      printf 'Nothing here answers to %s, so %s could not be linked. Carrying on.\n' \
        "$shipped" "$name" >&2
      FAILED_LINKS="${FAILED_LINKS}  ${name} (this machine has no ${shipped})"$'\n'
      continue
    fi

    target="$(command -v "$shipped")"
    ln -sf "$target" "$HOME/.local/bin/$name"
    printf 'Linked %s to %s.\n' "$name" "$target"
  done
}

# PATH for the shells this script does not run in.
#
# Every export here lasts as long as this run. bun's installer and Claude Code's
# both edit a shell rc on their own account; the tarballs above edit nothing, so
# ~/.local/bin is the one directory no installer persists. That is the directory
# Node and gh land in, and gh is the binary a person is sent away to run
# themselves at step 9 — in a shell that has read no rc of this script's making.
#
# The line goes into every rc that is already there, since which one a shell
# reads depends on the shell and on whether it is a login shell. With none there
# at all it writes ~/.profile. A rc that already carries the directory is left
# alone, so a second run of this script adds nothing.
#
#   $1 the directory to put on PATH
# The shell a person's own terminals start.
#
# Not the shell running this script. The one-liner pipes into bash whatever they
# use, so `$0` and `$BASH_VERSION` answer for the pipe. `$SHELL` is what a login
# set out of the password database, and it survives the pipe because it is
# exported. Where it is unset — a container, a cron, a `su` that kept nothing —
# the database is read instead, and a machine answering neither is treated as
# POSIX, which is what every shell here but fish is.
login_shell() {
  local shell="${SHELL:-}"

  if [ -z "$shell" ]; then
    shell="$(getent passwd "$(id -un)" 2>/dev/null | cut -d: -f7 || true)"
  fi

  printf '%s' "${shell##*/}"
}

# Every rc file this script writes to, in the order a shell would meet them.
#
# `.bash_profile` is here because a bash login shell reads the first of
# `.bash_profile`, `.bash_login` and `.profile` that exists and stops — so on a
# machine carrying one, a line written to `.profile` is a line nothing opens.
# `config.fish` is here because fish reads none of the others and takes a syntax
# of its own (docs/adr/0024).
rc_candidates() {
  printf '%s\n' \
    "$HOME/.bashrc" \
    "$HOME/.bash_profile" \
    "$HOME/.zshrc" \
    "$HOME/.profile" \
    "$HOME/.config/fish/config.fish"
}

# The rc a machine with none at all gets, named by the shell that will read it.
#
# zsh is why this is not always `.profile`: zsh reads `.zshenv`, `.zprofile` and
# `.zshrc`, and never `.profile`. A fresh macOS account and anybody who ran
# `chsh` before writing a rc are both in that state, and the file created for
# them used to be one their shell does not open.
create_default_rc() {
  case "$(login_shell)" in
    fish)
      mkdir -p "$HOME/.config/fish"
      touch "$HOME/.config/fish/config.fish"
      ;;
    zsh) touch "$HOME/.zshrc" ;;
    # Two files, because bash splits the job between them: a login shell reads
    # .profile, an interactive one reads .bashrc, and neither reads the other
    # unless a line already there says so.
    bash) touch "$HOME/.profile" "$HOME/.bashrc" ;;
    *) touch "$HOME/.profile" ;;
  esac
}

# The lines that put one directory on PATH, in the syntax that file's own reader
# takes.
#
# fish is neither POSIX nor near it: `export PATH=…` is a syntax error there,
# and its PATH is a list rather than a colon-joined string. Everything else here
# — bash, zsh, dash, ksh — reads the `case` form.
#
# Each form carries the same guard, so a shell that already has the directory
# does not put it on a second time, whoever put it there first.
#
#   $1 the rc file the lines are going into
#   $2 the directory
rc_block() {
  local rc="$1" dir="$2"

  printf '\n# Added by the prep bootstrap script.\n'

  case "$rc" in
    *.fish)
      printf 'if not contains "%s" $PATH\n' "$dir"
      printf '    set -gx PATH "%s" $PATH\n' "$dir"
      printf 'end\n'
      ;;
    *)
      printf 'case ":$PATH:" in\n'
      printf '  *":%s:"*) ;;\n' "$dir"
      printf '  *) export PATH="%s:$PATH" ;;\n' "$dir"
      printf 'esac\n'
      ;;
  esac
}

persist_on_path() {
  local dir="$1" rc written written_as any=0

  # A rc file may carry the directory spelled out or written through $HOME, and
  # both mean the same PATH. Either spelling counts as already done.
  written_as="$dir"
  case "$dir" in
    "$HOME"/*) written_as="\$HOME${dir#"$HOME"}" ;;
  esac

  # Nothing to append to means nobody reads anything, so one is created — the
  # one this person's shell will actually read.
  while IFS= read -r rc; do
    if [ -f "$rc" ]; then any=1; fi
  done < <(rc_candidates)

  [ "$any" -eq 1 ] || create_default_rc

  while IFS= read -r rc; do
    [ -f "$rc" ] || continue
    grep -qF -e "$dir" -e "$written_as" "$rc" && continue

    rc_block "$rc" "$dir" >>"$rc"
    written="${written:+$written, }$rc"
  done < <(rc_candidates)

  [ -z "${written:-}" ] || printf 'Put %s on PATH in %s.\n' "$dir" "$written"
}

# The file the terminal that started this run can read to catch up.
#
# A rc file is read when a shell starts, and the shell reading this script
# started before any of these tools existed. So the rc lines `persist_on_path`
# writes reach every terminal except the one a person is looking at — and that
# is the terminal they are standing in when the script stops at the GitHub login
# and when it finishes. Telling them to open a new one is right and it is not
# enough: the stop at step 9 asks for work in that terminal.
#
# A script cannot put anything on its parent's PATH. The environment is copied
# when the shell forks, and what this run exports dies with it, so the only way
# in is the parent shell running something itself. What it runs is this file —
# the shape rustup, nvm and bun's own installers all landed on, for this same
# reason. Handing over a file to read beats handing over a line to paste: it is
# shorter to type, it is the same words on every machine, and what it does can
# be read before it is run (docs/adr/0024).
#
# Two files, because fish is not POSIX and would answer `export PATH=…` with a
# syntax error. Each carries the guarded block `rc_block` writes into a rc, so
# reading one twice puts the directory on once.
write_env_files() {
  local env_file

  mkdir -p "$PREP_SHARE"

  for env_file in "$PREP_SHARE/env.sh" "$PREP_SHARE/env.fish"; do
    {
      printf '# Written by the prep bootstrap script.\n'
      printf '#\n'
      printf '# Reading this puts what that run installed on PATH, for the shell that\n'
      printf '# reads it. A terminal opened afterwards carries them already.\n'
      rc_block "$env_file" "$HOME/.local/bin"
      rc_block "$env_file" "$BUN_INSTALL/bin"
    } >"$env_file"
  done
}

# The one line that hands this terminal what the run installed.
#
# Named by its full path, because the shell it is pasted into has read no rc of
# this script's making and `~` is the only part of it that would still expand.
# fish reads `source` and not `.`, and reads the file written for it.
env_line() {
  case "$(login_shell)" in
    fish) printf 'source %s' "$PREP_SHARE/env.fish" ;;
    *) printf '. %s' "$PREP_SHARE/env.sh" ;;
  esac
}

# The one thing a finished run asks somebody to do, drawn so nobody scrolls past
# it (docs/adr/0028).
#
# A run reports several things and exactly one of them is the next action, so
# that one is printed alone, above the heading that turns the rest into
# reference. Rules above and below mark where the install output stops and the
# instruction starts.
#
# The env line leads the commands and carries the reverse video, because it is
# the one line here that decides whether the lines under it are found at all
# (docs/adr/0024): this terminal started before any of these tools existed, and
# a shell reads its rc once. The rest of the block is the caller's — a headline
# naming the action, and the commands that perform it.
announce_next_action() {
  local headline="$1" line
  shift

  printf '\n%s\n' "$RULE"
  printf '%sNext: %s%s\n\n' "$BOLD" "$headline" "$RESET"
  printf '    %s %s %s\n' "$REVERSE$BOLD" "$(env_line)" "$RESET"
  for line in "$@"; do
    printf '      %s\n' "$line"
  done
  printf '\nThe first line hands this terminal the tools this run installed. A\n'
  printf 'terminal opened now carries them already, and needs only the rest.\n'
  printf '%s\n' "$RULE"
}

# owner/repo out of a GitHub clone URL. A URL pointing anywhere else returns
# non-zero, and the caller leaves that repository to git.
github_slug() {
  local url="$1"
  case "$url" in
    https://github.com/*) url="${url#https://github.com/}" ;;
    ssh://git@github.com/*) url="${url#ssh://git@github.com/}" ;;
    git@github.com:*) url="${url#git@github.com:}" ;;
    *) return 1 ;;
  esac
  printf '%s' "${url%.git}"
}

# Whether a public repository is still where it says it is. prep's own is public
# (docs/adr/0020) and this runs before any login, so the question goes to git
# rather than to gh: gh makes no unauthenticated call at all, and answers even a
# public `gh repo view` with "please run: gh auth login" (docs/adr/0021). What is
# left to guard against once visibility is settled for everybody is a repository
# that moved or was renamed, and git answers that without an account.
#
# GIT_TERMINAL_PROMPT=0 is what keeps a repository that has stopped being visible
# from stopping the run at a username prompt instead of failing here.
require_repo_exists() {
  local url="$1" label="$2"

  if ! GIT_TERMINAL_PROMPT=0 git ls-remote --exit-code "$url" HEAD >/dev/null 2>&1; then
    fail "$label is at $url, and nothing answers there. That repository has been
moved, renamed or taken down. Nothing on this machine is broken. Check the url
and run this script again — everything installed so far stays installed."
  fi
}

# Whether the account that is logged in can see the project. It may be private
# and shared with an organization, so one authenticated look separates two things
# a failed `git clone` runs together: nobody is signed in, and the account that
# is signed in was never added to the organization. The second is the ordinary
# case for somebody new, and it is a missing invitation rather than a broken
# machine (docs/adr/0017).
require_repo_access() {
  local slug="$1" url="$2" label="$3"

  if ! gh repo view "$slug" >/dev/null 2>&1; then
    fail "$label is at $url, and the account you are logged in as cannot see it.
GitHub account: ${GH_ACCOUNT:-the one gh is logged in as}. Nothing is broken here — that
repository is private, and this account has not been added to the organization
that owns it. Ask there for access, and run this script again when it arrives.
Everything installed so far stays installed, and the script skips it."
  fi
}

# The Claude Code login, in one wording, printed from both places that send
# somebody to a browser (docs/adr/0028).
#
# The first `claude` run authenticates through a browser, and no script can do
# that for anybody. Neither can the GitHub login, and somebody already at a
# browser for one should be there for both — so the stop below says this as well
# as the closing message. It used to be said in the closing message alone, which
# that stop exits before reaching. The script's other stops send nobody to a
# browser, and each of them reaches the closing message on the run that follows
# it.
claude_login_note() {
  cat <<'MESSAGE'
Logging in to Claude Code is a browser step, and the first `claude` run is what
opens it. Claude Code needs a paid account: Pro, Max, Team, Enterprise or
Console. The free Claude.ai plan does not carry it, and the login turns you away
on one.
MESSAGE
}

# The one stop this script makes for a person mid-run. A private repository
# answers an unauthenticated request with 404 rather than a refusal, so a clone
# without a login fails while describing the wrong problem, and no login is what
# the message has to name (docs/adr/0017).
#
# It is called from the project step and nowhere else. The project is the only
# clone left that may need an account, so a run that names none never reaches
# this, and neither does a project hosted anywhere but github.com
# (docs/adr/0021).
#
# `gh auth login` is a full-screen prompt that reads the terminal directly, and
# this script is running from a pipe, so handing it /dev/tty is not enough — a
# real run answered with "could not prompt: unexpected escape sequence from
# terminal". Carrying a dependency and performing an authentication are different
# things: the script installs gh and then hands the login to the person
# (docs/adr/0009, docs/adr/0013 decision 5). It hands the Claude Code login over
# in the same message, because this run ends here and one browser trip answers
# both (docs/adr/0028).
require_github_login() {
  if gh auth status >/dev/null 2>&1; then
    echo "gh is already logged in."
  else
    fail "The project is on GitHub, and gh has no login yet. A private repository
answers an unauthenticated request with 404 rather than a refusal, so cloning
without one fails while describing the wrong problem. The login asks its
questions on the terminal itself, which this script — running from a pipe —
cannot hand to you.

Run this yourself, then run this script again:
  $GH_BIN auth login --git-protocol https --web
  curl -fsSL $SCRIPT_URL | bash

gh is written out in full because this terminal has not read a shell rc since it
was installed, so a plain \`gh\` here would not be found. That holds for
everything this script installed — prep, claude, node. Read this file and the
plain names work here too:

    ${REVERSE}${BOLD} $(env_line) ${RESET}

A terminal opened after this run needs none of that.

The login prints a one-time code. If no browser opens, open
https://github.com/login/device in any browser you can reach and enter the code
there.

Everything installed so far stays installed, and the second run skips it.

One more browser login is waiting behind this one, and doing both now saves a
second trip:

$(claude_login_note)"
  fi

  # The login stores a token; this is what teaches git to send it, so a plain
  # `git clone` over HTTPS works below. Run rather than assumed, because a login
  # made some other way may never have done it.
  gh auth setup-git

  GH_ACCOUNT="$(gh api user -q .login 2>/dev/null || true)"
  [ -z "$GH_ACCOUNT" ] || printf 'Logged in to GitHub as %s.\n' "$GH_ACCOUNT"
}

# The name and email git commits under. git installed and git usable are not the
# same thing: with no user.name and user.email every commit is refused, and the
# person finds that out at the end of their first piece of work rather than here
# (docs/adr/0017). `gh auth setup-git` writes a credential helper and nothing
# else, so it does not stand in for this.
#
# It runs on the project branch, after the login, because the login already
# knows both answers — so this offers them and the person presses Enter twice. A
# project hosted outside github.com reaches it with no login, and it asks
# outright. A run that names no project never reaches it at all, and reads about
# the identity from `prep doctor` rather than from this script's ending, which
# stopped deciding it (docs/adr/0021, docs/adr/0027).
ensure_git_identity() {
  local git_name git_email suggested_name suggested_email gh_id gh_login gh_user

  git_name="$(git config --get user.name 2>/dev/null || true)"
  git_email="$(git config --get user.email 2>/dev/null || true)"

  if [ -n "$git_name" ] && [ -n "$git_email" ]; then
    printf 'git already commits as %s <%s>.\n' "$git_name" "$git_email"
    return
  fi

  have_tty || fail "git has no name and email to commit under, and there is no
terminal here to ask for them. Set them yourself and run this script again:
  git config --global user.name \"Your Name\"
  git config --global user.email \"you@example.com\""

  echo "Every commit you make carries a name and an email. git has neither yet."

  # The account's own name, and the address GitHub hands out for commits. That
  # address is <id>+<login>@users.noreply.github.com, built from the numeric id
  # and the login: GitHub accepts it, it attributes the commit to the account,
  # and it publishes nothing the account has not already published. One call
  # answers both, and a failure leaves the defaults empty and asks outright.
  #
  # The name comes last because an account can leave it unset, and read() treats
  # a tab as whitespace — an empty field anywhere but the end would shift every
  # field after it into the wrong variable.
  suggested_name=""
  suggested_email=""
  gh_id=""
  gh_login=""

  gh_user="$(
    gh api user -q '[(.id | tostring), .login, (.name // "")] | @tsv' 2>/dev/null ||
      true
  )"
  if [ -n "$gh_user" ]; then
    IFS=$'\t' read -r gh_id gh_login suggested_name <<<"$gh_user"
  fi

  if [ -n "$gh_id" ] && [ -n "$gh_login" ]; then
    suggested_email="${gh_id}+${gh_login}@users.noreply.github.com"
    echo "GitHub knows both. Press Enter to take what it says, or type your own."
  fi

  if [ -z "$git_name" ]; then
    ask_default "The name your commits should carry" "$suggested_name"
    git_name="$ANSWER"
    git config --global user.name "$git_name"
  fi

  if [ -z "$git_email" ]; then
    ask_default "The email address your commits should carry" "$suggested_email"
    git_email="$ANSWER"
    git config --global user.email "$git_email"
  fi

  printf 'git now commits as %s <%s>.\n' "$git_name" "$git_email"
}

# ---------------------------------------------------------------------------
# 1. The package manager, and git with it
# ---------------------------------------------------------------------------

step "1/10 package manager"

case "$(uname -s)" in
  Darwin) PLATFORM="macos" ;;
  Linux) PLATFORM="linux" ;;
  *) fail "This script runs on macOS and Debian-family Linux. uname says: $(uname -s)" ;;
esac

# Node and gh each publish one build per architecture and each spells the names
# its own way. uname is read once here and both spellings come off it.
case "$(uname -m)" in
  x86_64 | amd64)
    NODE_ARCH="x64"
    GH_ARCH="amd64"
    ;;
  arm64 | aarch64)
    NODE_ARCH="arm64"
    GH_ARCH="arm64"
    ;;
  *) fail "This chain needs a 64-bit x86 or ARM machine. uname says: $(uname -m)" ;;
esac

printf 'Platform: %s (%s)\n' "$PLATFORM" "$(uname -m)"

if [ "$PLATFORM" = "macos" ]; then
  if have brew; then
    echo "Homebrew is already here."
  else
    # The Homebrew installer pulls in the Command Line Tools, and git arrives
    # with them — which is why step 2 only checks git rather than installing it.
    echo "Installing Homebrew. It brings the Command Line Tools, and git with them."
    NONINTERACTIVE=1 /bin/bash -c \
      "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  fi

  # Homebrew installs to /opt/homebrew on Apple Silicon and /usr/local on Intel,
  # and a fresh shell has neither on PATH until a shell rc is read again.
  for candidate in /opt/homebrew/bin/brew /usr/local/bin/brew; do
    if [ -x "$candidate" ]; then
      eval "$("$candidate" shellenv)"
      break
    fi
  done

  have brew || fail "Homebrew is installed but brew is not on PATH. Open a new terminal and try again."
else
  # apt is already the system here, so there is nothing to install before it.
  have apt-get ||
    fail "No apt-get, so this is not a Debian-family system. Install git, bun, Node, gh and Claude Code with your own package manager, then run: prep doctor"

  # unzip and curl are what the bun and Claude Code installers download through;
  # a minimal image carries neither. xz-utils is what tar needs to open the Node
  # tarball in step 4. git is what step 2 goes on to check.
  echo "Installing git through apt. You may be asked for your password."
  sudo apt-get update
  sudo apt-get install -y git curl unzip xz-utils ca-certificates
fi

# ---------------------------------------------------------------------------
# 2. git actually runs
# ---------------------------------------------------------------------------

step "2/10 git"

have git ||
  fail "git is still not here after step 1. On macOS run: xcode-select --install"
git --version

# ---------------------------------------------------------------------------
# 3. bun
# ---------------------------------------------------------------------------

step "3/10 bun"

if have bun; then
  echo "bun is already here."
else
  curl -fsSL https://bun.sh/install | bash
fi

# The installer writes a shell rc, which only the next shell reads. This run
# needs bun now, so PATH is amended here as well.
export BUN_INSTALL
export PATH="$BUN_INSTALL/bin:$PATH"

# bun's installer writes a rc of its own, and this writes one as well. It is not
# a duplicate of it in any way that costs: bun writes `$BUN_INSTALL/bin`, this
# writes the directory that expands to, so neither line finds the other and the
# guard in each keeps a shell reading both from carrying the directory twice.
# What it buys is that the directory holding prep no longer depends on another
# vendor's installer having identified this machine's shell (docs/adr/0024).
persist_on_path "$BUN_INSTALL/bin"

have bun || fail "bun is installed but not on PATH. Expected it in $BUN_INSTALL/bin"
bun --version

# ---------------------------------------------------------------------------
# 4. Node, which Claude Code runs on
# ---------------------------------------------------------------------------

step "4/10 node"

# The vendor installer in step 6 downloads a static binary and never mentions
# Node, so it succeeds on a machine that has none — and the `claude` it leaves
# behind then refuses to start. Node comes first, or the chain ends one step
# short of its destination (docs/adr/0017).

# Node, gh and Claude Code all land in ~/.local/bin, which a fresh shell does
# not carry. Exporting it once here serves steps 5 and 6 as well
# (docs/adr/0013, PATH). The export covers this run; the rc files cover the
# shells that come after it, including the one a person runs the GitHub login in
# at step 9.
export PATH="$HOME/.local/bin:$PATH"
persist_on_path "$HOME/.local/bin"

# Both directories are settled now, so the file for the terminal running this is
# written here — at the same moment the rc files get them, and before any step
# that can stop and hand it back (docs/adr/0024).
write_env_files

if have node; then
  echo "Node is already here."
elif [ "$PLATFORM" = "macos" ]; then
  # brew arrived in step 1 and is the package manager this platform already has.
  brew install node
else
  install_tarball \
    "Node ${NODE_VERSION} for linux-${NODE_ARCH}" \
    "node-${NODE_VERSION}-linux-${NODE_ARCH}.tar.xz" \
    "${NODE_DIST}/node-${NODE_VERSION}-linux-${NODE_ARCH}.tar.xz" \
    "${NODE_DIST}/SHASUMS256.txt" \
    "$HOME/.local/share/node/${NODE_VERSION}" \
    node npm npx
fi

have node ||
  fail "Node is installed but node is not on PATH. Expected it in $HOME/.local/bin"
node --version

# ---------------------------------------------------------------------------
# 5. gh, which the project clone goes through
# ---------------------------------------------------------------------------

step "5/10 gh"

if have gh; then
  echo "gh is already here."
elif [ "$PLATFORM" = "macos" ]; then
  brew install gh
else
  install_tarball \
    "gh ${GH_VERSION} for linux-${GH_ARCH}" \
    "gh_${GH_VERSION}_linux_${GH_ARCH}.tar.gz" \
    "${GH_DIST}/gh_${GH_VERSION}_linux_${GH_ARCH}.tar.gz" \
    "${GH_DIST}/gh_${GH_VERSION}_checksums.txt" \
    "$HOME/.local/share/gh/${GH_VERSION}" \
    gh
fi

have gh ||
  fail "gh is installed but gh is not on PATH. Expected it in $HOME/.local/bin"
gh --version

# Where gh actually is, which differs by platform — ~/.local/bin from the
# tarball, the brew prefix on macOS. Step 9 sends a person away to run gh
# themselves, and the terminal they type it into is the one that ran the
# one-liner: it read no rc file after this script wrote one, so a bare `gh`
# there is a command not found. The full path always runs.
GH_BIN="$(command -v gh)"

# ---------------------------------------------------------------------------
# 6. Claude Code
# ---------------------------------------------------------------------------

step "6/10 Claude Code"

if have claude; then
  echo "Claude Code is already here."
else
  curl -fsSL "$CLAUDE_INSTALL_URL" | bash
fi

# The native installer puts the binary in ~/.local/bin, which plenty of shells
# do not carry on PATH. Step 4 already exported it, which is what makes step 10
# able to find claude in this same run; the rc file the installer edits covers
# the shells that come after (docs/adr/0013).
have claude ||
  fail "Claude Code is installed but claude is not on PATH. Expected it in $HOME/.local/bin"

# This is the line that stopped on a machine without Node, which is why step 4
# exists (docs/adr/0017).
claude --version

# The plugins this project's own loop runs on. A harness with none of them
# starts, but it starts without the skills the repository's conventions assume,
# so they belong to the machine the same way the harness does.
#
# `claude plugin` is a plain command with an exit code, not a session command
# typed at a prompt: nothing here needs a terminal, and a first `claude` run
# would be busy asking for a login anyway.
#
# Every line is idempotent. A marketplace already declared and a plugin already
# installed both report so and exit 0, which is what makes a second run of this
# script pass straight through.
#
# **A plugin is a gap, not a link.** The harness starts without one, so a
# marketplace that will not add is collected and printed at the end rather than
# ending a run that has not installed prep yet (docs/adr/0022). A marketplace is
# somebody else's file and its schema moves; a run that lost the whole machine to
# one is the failure this guards against, and a real run lost one that way.
#
# stdin is closed for the reason step 8 closes it: this script is read from a
# pipe, so a command that reads a line eats the script behind it.
echo "Installing the plugins this project's loop uses."

install_plugin() {
  if ! "$@" </dev/null; then
    printf 'That one did not install. Carrying on.\n' >&2
    FAILED_GAPS="${FAILED_GAPS}  $*"$'\n'
  fi
}

install_plugin claude plugin marketplace add anthropics/claude-plugins-official
install_plugin claude plugin marketplace add JuliusBrussee/caveman
install_plugin claude plugin install mattpocock-skills@claude-plugins-official
install_plugin claude plugin install caveman@caveman

# ---------------------------------------------------------------------------
# 7. prep
# ---------------------------------------------------------------------------

step "7/10 prep"

# Asked before the clone, so a repository that has moved reads a sentence about
# the url rather than git's own "repository not found". This one is public, and
# no login has happened at this point in the run, so the question goes to git
# (docs/adr/0021).
require_repo_exists "$PREP_REPO" "prep"

if [ -d "$PREP_DIR/.git" ]; then
  echo "prep is already cloned at $PREP_DIR. Updating."
  git -C "$PREP_DIR" pull --ff-only
else
  git clone "$PREP_REPO" "$PREP_DIR"
fi

# bun link puts a prep symlink in bun's global bin directory, which step 3 has
# already put on PATH.
(cd "$PREP_DIR" && bun install --frozen-lockfile && bun link)

have prep || fail "prep is linked but not on PATH. Expected it in $BUN_INSTALL/bin"

# ---------------------------------------------------------------------------
# 8. The gaps prep names
# ---------------------------------------------------------------------------

step "8/10 remaining gaps"

# doctor exits 1 when it finds gaps, which is the ordinary case in a bootstrap.
# The exit code is dropped and the report is what gets read.
report="$(prep doctor --json || true)"
[ -n "$report" ] ||
  fail "prep doctor printed nothing. Run it yourself to see why: prep doctor"

commands="$(printf '%s' "$report" | bun run "$PREP_DIR/scripts/gaps.ts")"

if [ -z "$commands" ]; then
  echo "Nothing left to install."
else
  while IFS= read -r command; do
    printf '\n$ %s\n' "$command"
    # stdin is the list of commands itself, so a command that reads a line takes
    # the next install command as its answer and that tool is never installed.
    # /dev/null closes that off: whatever asks here gets end of input and fails
    # on its own, rather than quietly eating the tool behind it. The commands
    # themselves answer what apt would ask (src/registry.ts).
    #
    # Every one of them installs a package and does nothing else. What a package
    # calls the executable it lays down is settled below, in one place for all of
    # them (docs/adr/0025). Running any of these again changes nothing, which is
    # what a step that runs on every bootstrap needs.
    if ! bash -c "$command" </dev/null; then
      # A tool that would not install is reported at the end rather than
      # stopping the run. The links of the chain are behind us; what is left
      # here is convenience, and the project still gets set up without it.
      printf 'That one did not install. Carrying on.\n' >&2
      FAILED_GAPS="${FAILED_GAPS}  ${command}"$'\n'
    fi
  done <<<"$commands"
fi

# The names the packages above did not leave behind.
#
# It runs after the installs and off the report taken before them, because the
# two names are a fact about the platform and not about this machine — what the
# installs change is whether the shipped name resolves, and that is asked inside
# the loop. So there is no second doctor run here.
#
# The reader runs in its own command and the loop in this shell, rather than the
# two joined by a pipe: a pipe puts the loop in a subshell, and every failed link
# it collected would go with it when the subshell ended.
#
# Nothing catches a reader that refuses, for the reason the gap reader above is
# uncaught: it refuses only over a report that is not the contract, and a machine
# that took that quietly would report itself finished and run neither name. That
# is the silence this step exists to close, so it ends the run and names the step.
links="$(printf '%s' "$report" | bun run "$PREP_DIR/scripts/links.ts")"

if [ -n "$links" ]; then
  link_renamed <<<"$links"
fi

# ---------------------------------------------------------------------------
# 9. The prepared repository
# ---------------------------------------------------------------------------

step "9/10 project"

# No repository named is not a failure. Everything before this step is the
# machine, and the machine is ready — only the last stretch, the project
# itself, has nothing to point at. Stopping here with an error would mark eight
# steps of finished work as a failed run, so the script says what it did, says
# how to come back for the project, and ends well.
PROJECT_READY=1

# The question is asked here rather than at the top of the run, because here is
# where the answer is used and here is where going unanswered still ends well.
# Two runs are never asked: one that was given the repository in the environment
# has already answered, and one with no terminal has nobody to answer. Both take
# the machine-only ending below, the same one Enter takes.
if [ -z "$PREPARED_REPO" ] && have_tty; then
  echo "The machine is built. One thing is left to name: the repository you came"
  echo "here to work in. Press Enter to skip it and stop at the machine."
  ask_optional "The git url of the repository you are working in: "
  PREPARED_REPO="$ANSWER"
fi

if [ -z "$PREPARED_REPO" ]; then
  PROJECT_READY=0
  echo "No project repository was named, so this run stops at the machine."
fi

if [ "$PROJECT_READY" -eq 1 ] && [ -z "$PROJECT_DIR" ]; then
  PROJECT_DIR="$HOME/$(basename "$PREPARED_REPO" .git)"
fi

# The GitHub login and the git identity both live here, on this branch, and a
# run that stopped above meets neither (docs/adr/0021). The login is what makes a
# private repository visible at all, so it comes before the clone and before the
# question that names the account; the identity comes after it, because the
# login is what lets that question be offered rather than demanded.
#
# A project hosted anywhere but github.com has no use for a GitHub account, so
# the login is skipped and the identity asks outright.
if [ "$PROJECT_READY" -eq 1 ]; then
  PROJECT_SLUG="$(github_slug "$PREPARED_REPO" || true)"

  if [ -n "$PROJECT_SLUG" ]; then
    require_github_login
  fi

  ensure_git_identity

  if [ -d "$PROJECT_DIR/.git" ]; then
    echo "The project is already cloned at $PROJECT_DIR."
  else
    # Asked before the clone, so an account without access reads a sentence
    # about an invitation rather than git's own "repository not found".
    if [ -n "$PROJECT_SLUG" ]; then
      require_repo_access "$PROJECT_SLUG" "$PREPARED_REPO" "The project"
    fi
    git clone "$PREPARED_REPO" "$PROJECT_DIR"
  fi
fi

# ---------------------------------------------------------------------------
# 10. prep setup
# ---------------------------------------------------------------------------

step "10/10 prep setup"

if [ "$PROJECT_READY" -eq 1 ]; then
  # Exit 1 means it wrote nothing, which its own report explains — a merge
  # waiting for approval, or a project already covered. Only a tool error stops
  # the run.
  setup_status=0
  prep setup "$PROJECT_DIR" || setup_status=$?
  [ "$setup_status" -ne 2 ] || fail "prep setup could not finish. The message above says why."
else
  echo "Nothing to set up without a project. Skipped."
fi

# ---------------------------------------------------------------------------
# What is left
# ---------------------------------------------------------------------------

# What a finished run says, and in what order (docs/adr/0028).
#
# A run has several things to report — where the project is, gaps that would not
# install, tools it could not name, two logins no report can perform, and the
# command that reports the rest — and exactly one of them is the next action. So
# that one is drawn on its own above a heading that turns everything after it
# into reference, and somebody who reads the first block and stops has read the
# thing to do.
#
# What is not here is the machine's standing state. The GitHub login and the git
# identity were named from this function once, each behind a check run in this
# shell; they are prep's to report now, and the ending points at the command that
# does it (docs/adr/0027).
#
# A script cannot move the shell that called it, nor log in for anybody, so every
# command here is printed rather than run, in full and ready to paste.
closing_message() {
  printf '\n==> Done\n'

  if [ "$PROJECT_READY" -eq 1 ]; then
    announce_next_action "start working in your project." \
      "cd $PROJECT_DIR" \
      "claude"
  else
    # The machine is finished and the project is the only thing outstanding. By
    # now prep is installed, so the two commands that finish the job are ordinary
    # ones — nobody is sent back through the one-liner to answer one question,
    # and neither command needs a terminal to be asked on, which is what the
    # no-terminal branch here used to be for.
    announce_next_action "clone the project you came here to work in, and set it up." \
      'git clone "<git url>" ~/my-project' \
      "prep setup ~/my-project"
  fi

  printf '\n==> For reference\n'

  # This run's own leftovers come first: they are the only lines here about what
  # just happened rather than about what always holds.
  if [ -n "$FAILED_GAPS" ]; then
    printf '\nThese would not install. Run them yourself when you have a moment:\n'
    printf '%s' "$FAILED_GAPS"
  fi

  if [ -n "$FAILED_LINKS" ]; then
    printf '\nThese tools are installed under another name, and this run could not\n'
    printf 'give them their own. `prep doctor` reports them as missing until it can:\n'
    printf '%s' "$FAILED_LINKS"
  fi

  # The GitHub login and the git identity used to be asked about here, each
  # behind its own check — `gh auth status` and `git config --get`. Both are gone
  # (docs/adr/0027). They are the machine's standing state rather than anything
  # this run did, and prep reads them now: they are two of its **pass** items,
  # which the doctor line below points at. The script decided them in its own
  # shell while prep knew nothing about accounts, and once prep knows, the same
  # knowledge in two places is two places free to drift. **prep decides and the
  # script executes.**
  #
  # What is left here says only what this run did — the two lists above, and the
  # one thing the next action above needs — and what no report can perform for
  # anybody.
  if [ "$PROJECT_READY" -eq 0 ]; then
    # About the `git clone` this ending just printed, not about the machine. A
    # private repository answers an unauthenticated request with 404 rather than a
    # refusal, so a clone without a login fails while describing the wrong
    # problem, and this is the one place somebody reads that before hitting it.
    #
    # It asks nothing and names no command: whether this machine holds a login is
    # doctor's to read, and the line below sends them there for it. That is the
    # whole difference from the block that used to stand here.
    printf '\nIf that repository is private, log in to GitHub before cloning it. An\n'
    printf 'unauthenticated request for a private repository comes back 404 rather\n'
    printf 'than a refusal, so the clone fails while naming the wrong problem.\n'
  fi

  # The one step a script cannot take for anybody (docs/adr/0013 decision 5).
  # Somebody who ran the one-liner is looking at this terminal, not at a page
  # they would have had to find first. The stop in front of the GitHub login says
  # the same words, because that run ends before reaching here (docs/adr/0028).
  printf '\n'
  claude_login_note

  cat <<'MESSAGE'

Codex is not part of this script. Install it and it asks for a login of its
own: a ChatGPT Plus, Pro, Business, Edu or Enterprise account, or an OpenAI
API key.

prep doctor reports what this machine still owes you, at any time: the tools
that are missing, and the things only you can close — the GitHub login, the
git name and email every commit needs, and a login for each agent CLI
installed here. Hand it a project path and it reports what that project owes
as well.
MESSAGE
}

closing_message
