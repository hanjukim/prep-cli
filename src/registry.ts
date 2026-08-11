import type { HarnessId, HarnessSpec, PassSpec, PlatformSpec, ToolSpec } from "./types.ts";

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
      linux: {
        renamed: "fdfind",
        guidance: { kind: "command", command: "sudo apt install -y fd-find" },
      },
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
      linux: {
        renamed: "batcat",
        guidance: { kind: "command", command: "sudo apt install -y bat" },
      },
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
 * The pass items: what prep reads as absent but must not close (docs/adr/0026).
 *
 * Machine rows are answered by a fixed argv, never a string a shell reads. Those
 * rows are the whole whitelist of what chef may start: no entry, no process.
 * The checks read no secret and change nothing — `gh auth status` validates the
 * token without printing it usably, and `git config --get` reads configuration.
 * What either prints is discarded whole, so no account identifier can reach a
 * report.
 *
 * The guidance is the plated command a person takes. The git identity carries
 * placeholders because a name and email are somebody's to choose — the
 * bootstrap script never reads pass guidance, so nothing here runs unattended.
 * The Claude Code line is a note rather than a command string to paste blindly:
 * the vendor's login is the first `claude` run itself, which opens a browser.
 *
 * The harness rows are gated on the harness being installed, read off the same
 * registry table chef already checks. A third harness added to `HARNESSES`
 * gets its login row by adding one entry here, gated the same way.
 *
 * One table for both scopes, and the order is the order somebody walks
 * (docs/adr/0027). An empty project alternates between the two, so a table split
 * by scope would leave a reader interleaving two lists to work out what comes
 * first. `git init` leads because nothing below it has anywhere to land: a
 * repository is what an identity signs commits in and what an account receives
 * them from. The machine rows keep the order they already had, so a run with no
 * argument reports what it reported before. The project row is asked only where
 * there is a project — with no argument chef drops it rather than guessing one.
 */
const PASS: readonly PassSpec[] = [
  {
    id: "git-repository",
    scope: "project",
    summary: "git repository",
    marker: ".git",
    // A person's decision, not a script's. Turning somebody's directory into a
    // repository is theirs to choose, which is what puts this on the pass rather
    // than among the gaps the bootstrap script closes. Not the remote: working
    // locally and pushing nowhere is a normal way to work, so its absence says
    // nothing worth printing.
    guidance: { kind: "command", command: "git init" },
  },
  {
    id: "github-login",
    scope: "machine",
    summary: "GitHub login",
    checks: [["gh", "auth", "status"]],
    guidance: { kind: "command", command: "gh auth login" },
  },
  {
    id: "git-identity",
    scope: "machine",
    summary: "git identity",
    checks: [
      ["git", "config", "--get", "user.name"],
      ["git", "config", "--get", "user.email"],
    ],
    guidance: {
      kind: "command",
      command: "git config --global user.name '<name>' && git config --global user.email '<email>'",
    },
  },
  {
    id: "claude-login",
    scope: "machine",
    summary: "Claude Code login",
    checks: [["claude", "auth", "status"]],
    guidance: { kind: "manual", note: "Run claude — its first run opens a browser and asks for the login" },
    harness: "claude-code",
  },
  {
    id: "codex-login",
    scope: "machine",
    summary: "Codex login",
    checks: [["codex", "login", "status"]],
    guidance: { kind: "command", command: "codex login" },
    harness: "codex",
  },
];

/** The pass items, in table order. The order is the report order. */
export function passItems(): PassSpec[] {
  return [...PASS];
}

/**
 * The harness entries, in table order.
 *
 * Which tools are harnesses is settled by this table, so setup does not carry a
 * list of agent CLIs of its own — one place to add the third one.
 *
 * Neither entry overrides `binary` per platform, and the registry tests hold
 * that. It is what lets the setup footer decide a harness is here with a single
 * `which` on `binary`, and still agree with the fuller lookup chef runs
 * through `probe.check`.
 */
export function harnesses(): HarnessSpec[] {
  return [...HARNESSES];
}

/** Every entry to check. Returns a shallow copy so callers cannot disturb the registry. */
export function all(): ToolSpec[] {
  return [...TOOLS];
}
