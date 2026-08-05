/**
 * The renamed-executable reader the bootstrap script runs.
 *
 * Two of the standard tools arrive on Debian family under a name that is not
 * their own. `fd-find` installs `fdfind`, and `bat` installs `batcat`, because
 * both names were taken by packages that were there first. Installing the
 * package leaves a machine that holds the tool and answers to nothing anybody
 * types, so `prep doctor` reports it as a gap like any other (docs/adr/0023) and
 * something has to put the name there.
 *
 * That something is one step of the bootstrap script, and this is what it reads:
 * a `prep doctor --json` report in, one pair per line out — the name a machine
 * owes, and the name this platform's package ships it under. Both names come off
 * the registry entry, so a third tool renamed one day needs nothing written here
 * (docs/adr/0025).
 *
 * Where the shipped name actually is on disk is not answered here. This reads a
 * report taken before the installs ran, and the path only exists after them; the
 * shell asks for it at the moment it makes the link, which is also what keeps
 * one definition of what counts as installed (`have` in the script knows what to
 * make of a WSL answer).
 *
 * Reading stdin rather than running `prep doctor` itself matches the gap reader
 * beside it: the process tree stays flat, and the shell keeps doctor's exit code
 * — which is 1 whenever anything is still missing.
 */

/**
 * The part of the `--json` contract this reads.
 *
 * Narrower than what the contract emits, for the reason the gap reader is
 * narrow: a field this file never names cannot break it when the contract
 * widens.
 */
type Entry = {
  binary: string | null;
  renamed: string | null;
};

/** A name a machine owes, and the name its package shipped instead. */
export type Link = {
  /** The name everything calls the tool by, and the name the link takes. */
  name: string;
  /** The name the package laid the executable down under, which the link points at. */
  shipped: string;
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
 * and a reader that shrugged at it would leave a machine without its names in
 * silence. Returning null is what makes that visible; the caller throws.
 */
function toEntry(value: unknown): Entry | null {
  if (!isRecord(value)) return null;
  if (typeof value.id !== "string" || typeof value.status !== "string") return null;
  if (value.binary !== null && typeof value.binary !== "string") return null;
  if (value.renamed !== null && typeof value.renamed !== "string") return null;

  return { binary: optionalString(value.binary), renamed: optionalString(value.renamed) };
}

/**
 * The names this platform owes a link, in report order.
 *
 * Every entry carrying a shipped name is emitted, whatever its status. A machine
 * where the canonical name already answers is not this file's question: the
 * report says a name was found, not which file answered it, so a `bat` somebody
 * built from source and a link an earlier run made read the same here. The shell
 * asks that one, right before it would write.
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

    if (entry.renamed === null || entry.binary === null) continue;

    links.push({ name: entry.binary, shipped: entry.renamed });
  }

  return links;
}

/**
 * One pair per line, the two names separated by a tab.
 *
 * A tab rather than a space because it is what the shell's `read` splits on
 * without touching anything else, and neither name can hold one.
 */
export function renderLinks(links: readonly Link[]): string {
  return links.map((link) => `${link.name}\t${link.shipped}`).join("\n");
}

if (import.meta.main) {
  const links = renamedLinks(JSON.parse(await Bun.stdin.text()));
  // Nothing to link prints nothing, so the shell reads an empty string rather
  // than a blank line it would then read as an empty pair.
  if (links.length > 0) process.stdout.write(renderLinks(links) + "\n");
}
