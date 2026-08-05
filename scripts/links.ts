/**
 * The renamed-executable reader the bootstrap script runs.
 *
 * Two of the standard tools arrive on Debian family under a name that is not
 * their own. `fd-find` installs `fdfind`, and `bat` installs `batcat` to keep
 * clear of an unrelated `bat` already in Debian. The registry records both
 * names, so `prep doctor` finds those tools and reports them installed — but
 * everything that calls them calls them `fd` and `bat`, and on such a machine
 * neither name answers (docs/adr/0023).
 *
 * This reads `prep doctor --json` and names every tool in that state, as the
 * name it should answer to and the path it actually lives at. The shell makes
 * the link: where the file goes and how it is made is the script's ground, the
 * same as it is for the tarballs it unpacks. Nothing here writes a command, and
 * no tool name is written here either — the pairing comes from the registry.
 *
 * Reading stdin rather than running `prep doctor` itself matches the gap reader
 * beside it: the process tree stays flat and the shell keeps doctor's exit code,
 * which is 1 whenever anything is still missing.
 */

import { all } from "../src/registry.ts";
import type { Platform, ToolSpec } from "../src/types.ts";

/**
 * The part of the `--json` contract this reads.
 *
 * Narrower than what the contract emits, for the reason the gap reader is
 * narrow: a field this file never names cannot break it when the contract
 * widens.
 */
type Entry = {
  id: string;
  status: string;
  binary: string | null;
  path: string | null;
};

/** A name that does not answer on this machine, and the executable behind it. */
export type Link = {
  /** The name callers use, and the name the link takes. */
  name: string;
  /** The path the installed executable is at, which the link points to. */
  target: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

/**
 * Reads one result, or nothing at all.
 *
 * An entry that does not look like the contract is a contract that has moved,
 * and a reader that shrugged at it would leave a machine without links in
 * silence. Returning null is what makes that visible; the caller throws.
 */
function toEntry(value: unknown): Entry | null {
  if (!isRecord(value)) return null;
  if (typeof value.id !== "string" || typeof value.status !== "string") return null;
  if (value.binary !== null && typeof value.binary !== "string") return null;
  if (value.path !== null && typeof value.path !== "string") return null;

  return {
    id: value.id,
    status: value.status,
    binary: optionalString(value.binary),
    path: optionalString(value.path),
  };
}

/** The registry entry an id belongs to, or nothing when the report names one we do not hold. */
function specById(id: string): ToolSpec | undefined {
  return all().find((spec) => spec.id === id);
}

/**
 * The links this machine is missing, in report order.
 *
 * A tool qualifies on one test: the platform looked its executable up under a
 * name other than the entry's own, and it is installed. The rename is already
 * in the registry as the two names side by side, so nothing new has to be
 * declared for a third tool that arrives renamed one day.
 *
 * Whether the canonical name already answers is not asked here. This reads a
 * report, and the report says nothing about a name it never looked up; the
 * shell holds a `have` of its own that knows what to make of a WSL answer, and
 * asking there keeps one definition of what counts as installed.
 */
export function renamedLinks(report: unknown): Link[] {
  if (!isRecord(report) || !Array.isArray(report.results)) {
    throw new Error(
      "prep doctor --json carried no results array. The contract this script reads has moved.",
    );
  }

  const links: Link[] = [];

  for (const value of report.results) {
    const entry = toEntry(value);
    if (entry === null) {
      throw new Error(
        `prep doctor --json carried an entry this script cannot read: ${JSON.stringify(value)}`,
      );
    }

    if (entry.status !== "installed") continue;
    if (entry.binary === null || entry.path === null) continue;

    const spec = specById(entry.id);
    // An id we do not hold is a report from another prep, not something to
    // guess a name for.
    if (spec === undefined) continue;
    if (entry.binary === spec.binary) continue;

    links.push({ name: spec.binary, target: entry.path });
  }

  return links;
}

/**
 * One link per line, the name and the path separated by a tab.
 *
 * A tab rather than a space because a path may hold spaces and a name may not,
 * so the split stays unambiguous without quoting the shell would then have to
 * undo.
 */
export function renderLinks(links: readonly Link[]): string {
  return links.map((link) => `${link.name}\t${link.target}`).join("\n");
}

/** Whether a platform renames anything at all, which is what the tests assert against. */
export function renamesOn(platform: Platform): string[] {
  return all()
    .filter((spec) => {
      const binary = spec.platforms[platform]?.binary;
      return binary !== undefined && binary !== spec.binary;
    })
    .map((spec) => spec.id);
}

if (import.meta.main) {
  const links = renamedLinks(JSON.parse(await Bun.stdin.text()));
  // Nothing to link prints nothing, so the shell reads an empty string rather
  // than a blank line it would then read as an empty pair.
  if (links.length > 0) process.stdout.write(renderLinks(links) + "\n");
}
