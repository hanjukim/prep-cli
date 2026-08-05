import { join } from "node:path";

import { ALWAYS_DENY } from "./presets.ts";
import type { CodexArtifact, CodexConfig, SetupFs } from "./types.ts";

/**
 * The Codex half of the baseline.
 *
 * The values are not decided here. They are the same preset the Claude settings
 * file is composed from, carried into the other harness's schema — one baseline,
 * two formats. That is why this module reads `ALWAYS_DENY` instead of holding a
 * list of its own: a secret path added there closes on both harnesses or the
 * baseline is only half true.
 *
 * The correspondence between the two schemas is written down in
 * docs/codex-permissions.md, down to the one rule that has no counterpart.
 */

/** Where the file goes. Project-scoped config, which Codex loads for a project you have trusted. */
export const CODEX_RELATIVE_PATH = join(".codex", "config.toml");

/** The profile every rule hangs off. Named for what it permits, not for who wrote it. */
export const CODEX_PROFILE = "project-edit";

/**
 * What the profile starts from.
 *
 * `:workspace` is Codex's built-in stance for edits inside the working tree, and
 * `on-request` leaves everything past it — reaching outside the tree, escalating
 * privileges — to a question. Together they are what Claude's `acceptEdits`
 * says: routine work is not worth a prompt, leaving the project is.
 */
const EXTENDS = ":workspace";
const APPROVAL_POLICY = "on-request";

/** The sub-table project-relative denials go under. Anything outside it is an absolute path. */
const WORKSPACE_ROOTS = ":workspace_roots";

/** A read rule, as the Claude baseline writes it. `Read(./.env)` */
const READ_RULE = /^Read\((.+)\)$/;

/** A tool error: the run could not be carried out. Turned into a setup error by the caller. */
export class CodexError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CodexError";
  }
}

/**
 * Turns the preset's deny list into the two tables Codex reads.
 *
 * Only the read rules cross over. The commands the baseline denies — a recursive
 * delete, a force push — have no key here at all: Codex splits filesystem access
 * from command approval, and inventing a mapping for them would put a rule in
 * the file that does not mean what the Claude one means. They stay closed on the
 * Claude side and are named as the gap in docs/codex-permissions.md.
 *
 * Two mechanical edits carry a Claude path over: the project marker `./` is
 * dropped, since a workspace key is already project-relative, and a trailing
 * `/**` is dropped, since the key names the directory itself. Everything else,
 * inner wildcards included, is the same string on both sides.
 *
 * Which of the two tables a path lands in is decided by the path saying so. A
 * rule that names no root is measured from the project, which is the direction
 * that stays right when the Claude baseline grows a pattern written without its
 * `./`.
 */
export function codexConfig(deny: readonly string[] = ALWAYS_DENY): CodexConfig {
  const workspace: string[] = [];
  const outside: string[] = [];

  for (const rule of deny) {
    const path = READ_RULE.exec(rule)?.[1];
    if (path === undefined) continue;

    const trimmed = path.endsWith("/**") ? path.slice(0, -"/**".length) : path;

    // A path is the machine's only when it says so — `~` for a home directory,
    // `/` for an absolute one. Everything else is measured from the project,
    // whether or not the Claude rule spelled the `./` out.
    if (trimmed.startsWith("~") || trimmed.startsWith("/")) outside.push(trimmed);
    else workspace.push(trimmed.startsWith("./") ? trimmed.slice("./".length) : trimmed);
  }

  return { profile: CODEX_PROFILE, extends: EXTENDS, approvalPolicy: APPROVAL_POLICY, workspace, outside };
}

/**
 * Serialises the config as TOML, by hand.
 *
 * Every value written here is a string or a table of strings, so the whole
 * format this needs is a quoted key, a quoted value, and a table header. A
 * parser is a dependency; this is twenty lines.
 *
 * Keys are always quoted. The ones that carry a dot — `.env.*` — would otherwise
 * be read as a path into a nested table, and quoting the rest costs nothing but
 * removes the question of which ones need it.
 *
 * The parent `filesystem` table is written before its `:workspace_roots` child,
 * so no table is ever declared after something nested inside it.
 */
export function renderCodexToml(config: CodexConfig): string {
  const lines = [
    `default_permissions = ${quoted(config.profile)}`,
    `approval_policy = ${quoted(config.approvalPolicy)}`,
    "",
    `[permissions.${config.profile}]`,
    `extends = ${quoted(config.extends)}`,
    "",
    `[permissions.${config.profile}.filesystem]`,
    ...config.outside.map(denial),
  ];

  if (config.workspace.length > 0) {
    lines.push(
      "",
      `[permissions.${config.profile}.filesystem.${quoted(WORKSPACE_ROOTS)}]`,
      ...config.workspace.map(denial),
    );
  }

  return lines.join("\n") + "\n";
}

/** One denied path. Every entry in both tables is a denial — there is nothing else to say about a path. */
function denial(path: string): string {
  return `${quoted(path)} = "deny"`;
}

/** A TOML basic string. Both the keys and the values go through it, since a key is a string too. */
function quoted(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/**
 * Whether a file already sets a sandbox mode.
 *
 * It matters because the two do not stack: a `sandbox_mode` anywhere in the
 * config makes Codex fall back to the older sandbox and ignore the permission
 * profile prep would write. A file written next to one is a file that protects
 * nothing while looking like it does, which is worse than no file at all — so
 * this is read, and said out loud.
 *
 * Line by line, and no parser. A commented-out mode is not a setting, and a key
 * that merely starts with the same word is a different key.
 */
export function holdsSandboxMode(text: string): boolean {
  return text.split("\n").some((line) => /^\s*sandbox_mode\s*=/.test(line));
}

/**
 * Produces the Codex permission file, or plans it.
 *
 * A file that is already there is left byte for byte as it is. The Claude side
 * merges instead (docs/adr/0003), and it can: JSON parses into rule lists a
 * union is defined on. TOML does not parse without a parser, a parser is a
 * dependency, and a merge written without one would be a guess at somebody
 * else's file. Not writing is recoverable; writing the wrong thing is not
 * (docs/adr/0007).
 */
export function codexArtifact(root: string, dryRun: boolean, fs: SetupFs): CodexArtifact {
  const path = join(root, CODEX_RELATIVE_PATH);
  const config = codexConfig();

  if (fs.exists(path)) {
    return { kind: "codex-config", path, status: "skipped", config: null, sandboxMode: holdsSandboxMode(read(path, fs)) };
  }

  if (dryRun) return { kind: "codex-config", path, status: "planned", config, sandboxMode: false };

  write(path, renderCodexToml(config), fs);

  return { kind: "codex-config", path, status: "applied", config, sandboxMode: false };
}

/** Reads the file that is already there. Unreadable is a tool error, not an absent sandbox mode. */
function read(path: string, fs: SetupFs): string {
  try {
    return fs.read(path);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new CodexError(`Could not read ${path}: ${reason}`);
  }
}

function write(path: string, contents: string, fs: SetupFs): void {
  try {
    fs.write(path, contents);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new CodexError(`Could not write ${path}: ${reason}`);
  }
}
