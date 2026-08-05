import type { Preset } from "./types.ts";

/**
 * The baseline written per project type. Data only, no logic.
 *
 * Same shape as registry.ts: it imports nothing but types, so the table stays
 * pure and a new project type is added here without touching detection or
 * writing. The array order is the merge order for a polyglot project.
 *
 * Nothing here is produced at run time. The values are decided once, in the
 * repository, and read back as they are (docs/adr/0002).
 */

/**
 * Where the line sits.
 *
 * Every entry is a prefix rule, because a baseline that stops at the bare
 * command asks on the very calls people actually make — `npm install left-pad`,
 * `uv run pytest -k auth` — and a baseline that interrupts routine work gets
 * widened by hand or ignored, which is worse than a wide one written down.
 *
 * So the rule is: everything the project's own toolchain does, whichever
 * package manager the team reaches for. Task runners already reach arbitrary
 * code — `npm run` runs whatever package.json says, `uv run` runs any command —
 * so listing `npx` or `python` alongside them costs nothing that was not
 * already spent, and leaving them out only looks careful.
 *
 * What stays out is anything that leaves the project: no `sudo`, nothing that
 * writes outside the working tree, no global installs, no credential paths.
 * That boundary is what deny-by-default is protecting, and it is the one prep
 * does not widen on anybody's behalf.
 */
/**
 * What every project asks about, whatever its type.
 *
 * WebFetch is the one tool whose target is not known ahead of time — a URL
 * arrives from a page, an error message, a dependency — so it is neither
 * allowed nor denied outright: the person is asked, once per address. That is
 * the same judgement the allowlist makes for commands, applied to reading the
 * network.
 */
export const ALWAYS_ASK: readonly string[] = ["WebFetch"];

/**
 * What every project allows, whatever its type.
 *
 * Editing and creating files is the work itself, so it is not worth a prompt.
 * Both rules are scoped to the project directory: a pattern that fails to match
 * falls back to asking, which is the harmless direction to be wrong in, while
 * an unscoped rule would also cover files outside the working tree.
 */
export const ALWAYS_ALLOW: readonly string[] = ["Edit(./**)", "Write(./**)"];

/**
 * What every project runs, whatever its type.
 *
 * Listing a directory, searching for text or for files, moving through version
 * control, reaching GitHub — none of these depend on what language the project
 * is written in, so a type's own list would only repeat them. They are held
 * here in the same shape a preset holds its commands: bare, prefixed, wrapped
 * where the file is written.
 *
 * Opening version control whole is the reason the deny list below carries
 * commands (docs/adr/0006). The two are one decision and move together.
 */
export const ALWAYS_BASH: readonly string[] = ["ls:*", "rg:*", "fd:*", "git:*", "gh:*"];

/**
 * What no project opens, whatever its type.
 *
 * Two kinds of rule, on two grounds (docs/adr/0006).
 *
 * The reads come first. Secrets are the single class of file where a read is
 * the leak, which is what makes this the list that matters while reading stays
 * otherwise unrestricted. The project-local half covers what a repository grows
 * on its own, the home half covers the credentials a machine already holds.
 *
 * The commands come after, and each one earns its place. Version control is
 * allowed by prefix, so the ends nobody can walk back — rewriting a pushed
 * branch, throwing away a working tree — are closed here instead of by
 * narrowing the allow rule until routine work starts asking. A recursive delete
 * is closed although no rule allows it, because the one path left to it is a
 * person approving a prompt, and that is one wrong keystroke from unrecoverable.
 * Printing the whole environment is closed on the read list's own ground: it
 * hands over the values those rules keep on disk.
 *
 * A deny rule beats an allow rule, and there is no way to carve an exception
 * back out, so `.env.example` is unreadable too. That is the trade this list
 * accepts — the alternative is a pattern narrow enough to miss `.env.local`.
 */
export const ALWAYS_DENY: readonly string[] = [
  "Read(./.env)",
  "Read(./.env.*)",
  "Read(./**/.env)",
  "Read(./**/.env.*)",
  "Read(./**/*.pem)",
  "Read(./**/*.key)",
  "Read(./**/*.p12)",
  "Read(./**/*.pfx)",
  "Read(./**/id_rsa*)",
  "Read(./**/id_ed25519*)",
  "Read(./**/credentials.json)",
  "Read(./secrets/**)",
  "Read(~/.ssh/**)",
  "Read(~/.aws/**)",
  "Read(~/.gnupg/**)",
  "Read(~/.config/gh/**)",
  "Read(~/.netrc)",
  // `env` alone is the exact rule, because the bare call is what dumps
  // everything. Forms that take arguments run a command with the environment
  // set, which is ordinary work.
  "Bash(env)",
  "Bash(printenv:*)",
  "Bash(rm -rf:*)",
  "Bash(git push --force:*)",
  "Bash(git reset --hard:*)",
];

/**
 * The mode a session starts in.
 *
 * acceptEdits takes file edits off the prompt path entirely, so a rule that
 * fails to match cannot turn routine work into a stream of questions. Commands
 * outside the allowlist, and WebFetch, are still asked about — the mode moves
 * where the default sits, it does not remove the boundary.
 */
export const DEFAULT_MODE = "acceptEdits";

const PRESETS: readonly Preset[] = [
  {
    type: "node",
    marker: "package.json",
    // npm first, then the managers a team may have moved to. package.json alone
    // does not say which one is in use, and asking on the wrong one is exactly
    // the friction this list exists to remove.
    bash: [
      "npm:*",
      "npx:*",
      "node:*",
      "pnpm:*",
      "yarn:*",
      "bun:*",
      "bunx:*",
      "corepack:*",
      "tsc:*",
    ],
  },
  {
    type: "python",
    // pyproject.toml only. requirements.txt shows up in repositories that are
    // not python projects, so it is too weak a signal to key off.
    marker: "pyproject.toml",
    // uv is the standard here; pip and a bare interpreter stay for repositories
    // that have not moved, and the usual test and lint entry points are listed
    // because they are called directly as often as through a runner.
    bash: [
      "uv:*",
      "uvx:*",
      "python:*",
      "python3:*",
      "pip:*",
      "pytest:*",
      "ruff:*",
      "mypy:*",
    ],
  },
];

/** Every preset. Returns a shallow copy so callers cannot disturb the table. */
export function all(): Preset[] {
  return [...PRESETS];
}
