import type { HarnessId, HarnessSpec, PlatformSpec, ToolSpec } from "./types.ts";

/**
 * The catalog of what gets checked. Data, with nothing that decides anything.
 *
 * The 10 standard tools come first, then the two supported harnesses. The design
 * document opened with 11: lazygit was dropped, because a git TUI is one way of
 * working with git rather than something a project needs on the machine, and
 * this table is the answer to what a machine should hold. What differs per
 * platform is the install command, and on one platform the name the package
 * ships the executable under — so instead of splitting into lanes, each entry
 * carries platform overrides. The array order is the report order.
 *
 * Every apt command carries -y. apt asks "Do you want to continue?" as soon as
 * it pulls a dependency along, and these commands are read by two audiences: a
 * person pasting one, and the bootstrap script running them with no terminal to
 * answer on (docs/adr/0009). A command that stops on a question installs
 * nothing for the second one, so the answer is written into the command rather
 * than left to whoever runs it. brew asks nothing, so its commands stay plain.
 */
const STANDARD: readonly ToolSpec[] = [
  {
    id: "homebrew",
    binary: "brew",
    summary: "macOS package manager",
    tier: "prerequisite",
    platforms: {
      darwin: {
        guidance: {
          kind: "manual",
          note: "Install it yourself with the official install script",
          url: "https://brew.sh",
        },
      },
    },
  },
  {
    id: "apt",
    binary: "apt",
    summary: "Debian-family package manager",
    tier: "prerequisite",
    platforms: {
      linux: {
        guidance: {
          kind: "manual",
          note: "No apt means this is not Debian family. Check your distro's package manager yourself",
        },
      },
    },
  },
  {
    id: "git",
    binary: "git",
    summary: "version control",
    tier: "standard",
    platforms: {
      darwin: { guidance: { kind: "command", command: "brew install git" } },
      linux: { guidance: { kind: "command", command: "sudo apt install -y git" } },
    },
  },
  {
    id: "ripgrep",
    binary: "rg",
    summary: "fast text search",
    tier: "standard",
    platforms: {
      darwin: { guidance: { kind: "command", command: "brew install ripgrep" } },
      linux: { guidance: { kind: "command", command: "sudo apt install -y ripgrep" } },
    },
  },
  {
    id: "fd",
    binary: "fd",
    summary: "fast file search",
    tier: "standard",
    platforms: {
      darwin: { guidance: { kind: "command", command: "brew install fd" } },
      // The package is fd-find here, and the executable it lays down is fdfind.
      linux: renamedOnDebian("fd-find", "fdfind", "fd"),
    },
  },
  {
    id: "zoxide",
    binary: "zoxide",
    summary: "directory jump",
    tier: "standard",
    platforms: {
      darwin: { guidance: { kind: "command", command: "brew install zoxide" } },
      linux: { guidance: { kind: "command", command: "sudo apt install -y zoxide" } },
    },
  },
  {
    id: "gh",
    binary: "gh",
    summary: "GitHub CLI",
    tier: "standard",
    platforms: {
      darwin: { guidance: { kind: "command", command: "brew install gh" } },
      // apt carries gh only from Debian 13 and Ubuntu 23.04 onwards. Older releases
      // need GitHub's own apt repository set up first, and sending anybody through that
      // would make this the second entry after make to break the one-command shape, so
      // the command stays plain and the older releases are left to fail visibly.
      linux: { guidance: { kind: "command", command: "sudo apt install -y gh" } },
    },
  },
  {
    id: "bat",
    binary: "bat",
    summary: "syntax-highlighting cat",
    tier: "standard",
    platforms: {
      darwin: { guidance: { kind: "command", command: "brew install bat" } },
      // The package stays bat, but the executable is batcat (it clashes with the existing bat command).
      linux: renamedOnDebian("bat", "batcat", "bat"),
    },
  },
  {
    id: "eza",
    binary: "eza",
    summary: "ls replacement",
    tier: "standard",
    platforms: {
      darwin: { guidance: { kind: "command", command: "brew install eza" } },
      linux: { guidance: { kind: "command", command: "sudo apt install -y eza" } },
    },
  },
  {
    id: "fzf",
    binary: "fzf",
    summary: "fuzzy finder",
    tier: "standard",
    platforms: {
      darwin: { guidance: { kind: "command", command: "brew install fzf" } },
      linux: { guidance: { kind: "command", command: "sudo apt install -y fzf" } },
    },
  },
  {
    id: "jq",
    binary: "jq",
    summary: "JSON processor",
    tier: "standard",
    platforms: {
      darwin: { guidance: { kind: "command", command: "brew install jq" } },
      linux: { guidance: { kind: "command", command: "sudo apt install -y jq" } },
    },
  },
  {
    id: "make",
    binary: "make",
    summary: "build runner",
    tier: "standard",
    platforms: {
      // brew's make installs as gmake, so it never fills the name make. What fills
      // make on macOS is the Xcode command line tools.
      darwin: { guidance: { kind: "command", command: "xcode-select --install" } },
      linux: { guidance: { kind: "command", command: "sudo apt install -y make" } },
    },
  },
];

/**
 * The two supported harnesses.
 *
 * Both publish a brew cask, so macOS gets a command to paste. Linux keeps a
 * documentation pointer: the routes published there were an apt repository
 * wanting a signing key, or a download piped into a shell, and neither was
 * worth printing as advice.
 *
 * ADR-0011 replaces both entries with one global package command, which is what
 * closes the asymmetry. Until that lands the two platforms read differently,
 * and the report is what makes that visible — it prints whatever guidance an
 * entry carries and runs none of it (docs/adr/0010).
 *
 * Both install commands were read off the vendors' own install pages, which are
 * the pages to check again if either route moves:
 *   https://code.claude.com/docs/en/setup#install-claude-code
 *   https://github.com/openai/codex#installing-and-running-codex
 *
 * The handoff commands start the harness on the skill that writes the guidance
 * prep leaves alone. Each vendor mentions a skill its own way — a leading `/`
 * in Claude Code, a leading `$` in Codex — so the two lines differ in more than
 * the binary name. Both are single-quoted so the shell hands the string over
 * whole; `$` would otherwise be read as a variable and arrive empty.
 *
 * The order here is the order the footer suggests them in.
 */
const HARNESSES: readonly HarnessSpec[] = [
  harness("claude-code", "claude", "Claude Code agent CLI", "https://code.claude.com/docs", "/"),
  harness("codex", "codex", "Codex agent CLI", "https://github.com/openai/codex", "$"),
];

/** Every entry, in report order: the tools first, then the harnesses. */
const TOOLS: readonly ToolSpec[] = [...STANDARD, ...HARNESSES];

/** The skill that writes the guidance prep hands the project over for. */
const HANDOFF_SKILL = "setup-matt-pocock-skills";

/**
 * The Linux side of a tool Debian ships under another name.
 *
 * bat and fd-find both land as something else — batcat and fdfind — because the
 * names they wanted were taken by packages that were there first. Installing the
 * package leaves a machine that holds the tool and does not answer to it, and
 * the name is what everything else on that machine types: a person, an alias, a
 * script, this project's own guidance. So the command closes both halves. It
 * installs the package, and it puts the canonical name on PATH.
 *
 * `~/.local/bin` is where the name lands because the bootstrap script already
 * carries that directory: it exports it before the gap step runs, and writes it
 * into a shell rc, so the terminal opened after the run finds the name too
 * (docs/adr/0023).
 *
 * Every part of it says the same thing twice, which is what the gap step needs —
 * it runs on every bootstrap, over a machine the last run may already have
 * finished. `apt install -y` reports an installed package and stops, `mkdir -p`
 * accepts a directory that is there, and `ln -sf` replaces the link rather than
 * refusing to overwrite it.
 *
 * The name is resolved with `command -v` rather than written as a fixed path,
 * because where apt puts an executable is apt's business and not this table's.
 * It is resolved into a name of its own first, so that a lookup finding nothing
 * ends the command there. Inside the `ln` arguments it would be a substitution
 * rather than a link in the chain: an empty answer would sail past `&&`, `ln`
 * would make a symlink pointing at nothing, and the whole command would report
 * success on a machine where the name still does not run.
 *
 * prep runs none of this (docs/adr/0010). It names the command, and the gap step
 * of the bootstrap script executes it like every other one.
 *
 *   $1 the apt package
 *   $2 the name that package ships the executable under
 *   $3 the name the tool is called by, which is what has to end up on PATH
 */
function renamedOnDebian(pkg: string, shipped: string, canonical: string): PlatformSpec {
  return {
    renamed: shipped,
    guidance: {
      kind: "command",
      command:
        `sudo apt install -y ${pkg} && ${shipped}="$(command -v ${shipped})" && ` +
        `mkdir -p ~/.local/bin && ln -sf "$${shipped}" ~/.local/bin/${canonical}`,
    },
  };
}

/**
 * One harness entry. Both vendors name the cask after the tool, so the id
 * doubles as the package name and neither entry needs one of its own.
 *
 * `mention` is the character the harness prefixes a skill name with.
 */
function harness(
  id: HarnessId,
  binary: string,
  summary: string,
  url: string,
  mention: string,
): HarnessSpec {
  const darwin: PlatformSpec = { guidance: { kind: "command", command: `brew install --cask ${id}` } };
  const linux: PlatformSpec = {
    guidance: { kind: "manual", note: "Install it yourself — no package manager carries it", url },
  };

  return {
    id,
    binary,
    summary,
    tier: "harness",
    platforms: { darwin, linux },
    handoffCommand: `${binary} '${mention}${HANDOFF_SKILL}'`,
  };
}

/**
 * The harness entries, in table order.
 *
 * Which tools are harnesses is settled by this table, so setup does not carry a
 * list of agent CLIs of its own — one place to add the third one.
 *
 * Neither entry overrides `binary` per platform, and the registry tests hold
 * that. It is what lets the setup footer decide a harness is here with a single
 * `which` on `binary`, and still agree with the fuller lookup doctor runs
 * through `probe.check`.
 */
export function harnesses(): HarnessSpec[] {
  return [...HARNESSES];
}

/** Every entry to check. Returns a shallow copy so callers cannot disturb the registry. */
export function all(): ToolSpec[] {
  return [...TOOLS];
}
