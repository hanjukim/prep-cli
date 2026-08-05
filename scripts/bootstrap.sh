#!/usr/bin/env bash
#
# The first thing a person runs (docs/adr/0009).
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

# The step being run, so a failure can say where it stopped.
STEP="start"

# Gaps that would not close. Kept rather than fatal: a gap is something the
# project stands without, and a machine missing `fd` is no reason to leave
# somebody without a set-up project.
FAILED_GAPS=""

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
persist_on_path() {
  local dir="$1" rc written written_as

  # A rc file may carry the directory spelled out or written through $HOME, and
  # both mean the same PATH. Either spelling counts as already done.
  written_as="$dir"
  case "$dir" in
    "$HOME"/*) written_as="\$HOME${dir#"$HOME"}" ;;
  esac

  # Nothing to append to means nobody reads anything, so one file is created.
  # .profile is the one every login shell reads, bash and sh alike.
  [ -f "$HOME/.bashrc" ] || [ -f "$HOME/.zshrc" ] || [ -f "$HOME/.profile" ] ||
    touch "$HOME/.profile"

  for rc in "$HOME/.bashrc" "$HOME/.zshrc" "$HOME/.profile"; do
    [ -f "$rc" ] || continue
    grep -qF -e "$dir" -e "$written_as" "$rc" && continue

    # The case is what keeps a shell that already carries the directory from
    # putting it on a second time, whoever put it there first.
    {
      printf '\n# Added by the prep bootstrap script.\n'
      printf 'case ":$PATH:" in\n'
      printf '  *":%s:"*) ;;\n' "$dir"
      printf '  *) export PATH="%s:$PATH" ;;\n' "$dir"
      printf 'esac\n'
    } >>"$rc"
    written="$rc"
  done

  [ -z "${written:-}" ] || printf 'Put %s on PATH in %s.\n' "$dir" "$written"
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
# things: the script installs gh and then hands the login to the person, the same
# way it hands over the Claude Code login at the end (docs/adr/0009,
# docs/adr/0013 decision 5).
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

It is written out in full because this terminal has not read a shell rc since gh
was installed, so a plain \`gh\` here would not be found. A new terminal carries
it by name.

It prints a one-time code. If no browser opens, open https://github.com/login/device
in any browser you can reach and enter the code there.

Everything installed so far stays installed, and the second run skips it."
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
# outright. A run that names no project never reaches it at all, and its closing
# message names these two commands instead (docs/adr/0021).
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
export BUN_INSTALL="${BUN_INSTALL:-$HOME/.bun}"
export PATH="$BUN_INSTALL/bin:$PATH"

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
    # A command may do more than install a package. Debian ships bat as batcat
    # and fd-find as fdfind, so the command that closes either gap also links
    # the canonical name into ~/.local/bin — the directory step 4 exported for
    # this run and persisted for the shells after it (docs/adr/0023). Running
    # them again changes nothing, which is what a step that runs on every
    # bootstrap needs.
    if ! bash -c "$command" </dev/null; then
      # A tool that would not install is reported at the end rather than
      # stopping the run. The links of the chain are behind us; what is left
      # here is convenience, and the project still gets set up without it.
      printf 'That one did not install. Carrying on.\n' >&2
      FAILED_GAPS="${FAILED_GAPS}  ${command}"$'\n'
    fi
  done <<<"$commands"
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

printf '\n==> Done\n'

# A script cannot move the shell that called it, so the lines that finish the
# job are printed rather than run. They are given in full, ready to paste.
if [ "$PROJECT_READY" -eq 1 ]; then
  printf 'Your project is at %s\n' "$PROJECT_DIR"
  printf '\nStart working — open a new terminal, so it carries the tools this\n'
  printf 'script installed, and run these two lines:\n'
  printf '  cd %s\n' "$PROJECT_DIR"
  printf '  claude\n'
else
  # The machine is finished and the project is the only thing outstanding, so
  # the line that comes back for it is the one worth printing. Everything
  # already installed is skipped on that second run.
  printf 'This machine is ready. No project was named, so nothing was cloned\n'
  printf 'and nothing was set up.\n'

  # The identity sits behind the GitHub login, and both belong to the project
  # branch this run did not take (docs/adr/0021). So it is named here rather
  # than asked for — this is where a run that stops at the machine reads what is
  # left for it, the same as the Claude Code login below. A second run that
  # names a project logs in first and offers both answers instead.
  if [ -z "$(git config --get user.name 2>/dev/null || true)" ] ||
    [ -z "$(git config --get user.email 2>/dev/null || true)" ]; then
    printf '\ngit has no name and email to commit under yet, and every commit\n'
    printf 'needs both. Set them yourself:\n'
    printf '  git config --global user.name "Your Name"\n'
    printf '  git config --global user.email "you@example.com"\n'
    printf 'Or leave them — the run that names a project asks GitHub and offers\n'
    printf 'you the answers.\n'
  fi

  if have_tty; then
    printf '\nWhen you have the repository you are working in, run this again and\n'
    printf 'answer the last step — everything above it is skipped:\n'
    printf '  curl -fsSL %s | bash\n' "$SCRIPT_URL"
  else
    # There was no terminal to ask on, and a second run in the same place would
    # have none either. The environment is how a run like that names a project,
    # so it is the line worth printing here — the question is not.
    printf '\nThere was no terminal here, so nobody could be asked which repository\n'
    printf 'this is for. Name it in the environment and run this again:\n'
    printf '  curl -fsSL %s | PREPARED_REPO=<git url> bash\n' "$SCRIPT_URL"
  fi
fi

if [ -n "$FAILED_GAPS" ]; then
  printf '\nThese would not install. Run them yourself when you have a moment:\n'
  printf '%s' "$FAILED_GAPS"
fi

# The one step a script cannot take for anybody (docs/adr/0013 decision 5).
#
# It is said here and nowhere else. Somebody who ran the one-liner is looking at
# this terminal, not at a page they would have had to find first, and the login
# is what stands between them and a working session.
cat <<'MESSAGE'

One thing is left for you: logging in to Claude Code. The first `claude` run
opens a browser and asks for it. After that you are set.

Claude Code needs a paid account: Pro, Max, Team, Enterprise or Console. The
free Claude.ai plan does not carry it, and the login turns you away on one.

Codex is not part of this script. Install it and it asks for a login of its
own: a ChatGPT Plus, Pro, Business, Edu or Enterprise account, or an OpenAI
API key.

To see what your machine is still missing at any time, run: prep doctor
MESSAGE
