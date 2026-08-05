import { join } from "node:path";

import type { HandoffItemId, HandoffResult, HandoffStatus, SetupFs } from "./types.ts";

/**
 * What is still owed on the harness side once prep has written its settings.
 *
 * prep writes permissions; the agent's own guidance — what language to write
 * in, where issues live, where the domain docs are — is written by
 * `/setup-matt-pocock-skills` in the harness. This module reads the project to
 * say which of those have landed, so the setup report can name what is left
 * instead of falling silent after the file is written.
 *
 * It reads and never writes, and it decides from the text alone: no LLM call,
 * no process (docs/adr/0002). Fixed input, fixed answer.
 */

/** A file that could not be read. Turned into a setup error where the run is driven from. */
export class HandoffError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HandoffError";
  }
}

type HandoffItem = {
  id: HandoffItemId;
  /**
   * The files that could hold it, in the order they win. Every one present is
   * read: the first that carries the thing answers for the item, so a project
   * whose CLAUDE.md says nothing about language is still answered by its
   * AGENTS.md. Only when none carries it does the first present file take the
   * blame, since that is the one somebody would go and fill in.
   */
  candidates: readonly string[];
  /** Whether the text actually carries the thing, rather than just existing. */
  carries: (text: string) => boolean;
};

/**
 * The files that can hold the agent's guidance, in the order they win.
 *
 * Exported because seeding one of them has to look for exactly the files this
 * check looks for: a seed written where the check does not read would report as
 * missing the moment it was written.
 *
 * AGENTS.md leads because that is the file the guidance gets written into — by
 * the seed, and by whoever fills the seed in. The order decides nothing about
 * whether an item is ready, since every present file is read and the first one
 * carrying the thing answers for it. It decides who gets named when none of them
 * carries it, and naming a CLAUDE.md that holds one import line would send a
 * person to edit a signpost.
 */
export const GUIDANCE_FILES = ["AGENTS.md", "CLAUDE.md"] as const;

const ITEMS: readonly HandoffItem[] = [
  {
    id: "language",
    candidates: GUIDANCE_FILES,
    carries: (text) => hasProse(section(text, "Language")),
  },
  {
    id: "issue-tracker",
    candidates: [join("docs", "agents", "issue-tracker.md")],
    // A tracker named in the title is what separates a real doc from the seed
    // template's shape, and prose is what separates it from a stub.
    carries: (text) => namesATracker(text) && hasProse(text),
  },
  {
    id: "domain-docs",
    // This doc is boilerplate the setup skill copies whole, so the only way it
    // goes wrong is arriving as headings and nothing else. That is all we check.
    candidates: [join("docs", "agents", "domain.md")],
    carries: hasProse,
  },
];

/** Any heading, at any depth. */
const HEADING = /^#{1,6}\s/;

/** A heading that closes a `##` section. A deeper one stays inside it. */
const SECTION_END = /^#{1,2}\s/;

/**
 * Whether the text says anything of its own.
 *
 * Headings do not count. A heading is a promise that something follows, so a
 * file — or a section — made only of them is exactly the half-filled shape
 * this check exists to catch.
 */
function hasProse(text: string | null): boolean {
  if (text === null) return false;
  return text.split("\n").some((line) => !HEADING.test(line) && line.trim().length > 0);
}

/**
 * The lines under a `## Heading`, down to the next heading of the same level or
 * higher. A deeper heading stays inside, so a section split into sub-headings
 * still reads as one body.
 */
function section(text: string, heading: string): string | null {
  const lines = text.split("\n");
  const opens = new RegExp(`^##\\s+${heading}\\s*$`, "i");
  const start = lines.findIndex((line) => opens.test(line));
  if (start === -1) return null;

  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => SECTION_END.test(line));
  return (end === -1 ? rest : rest.slice(0, end)).join("\n");
}

/** The title's `# Issue tracker: <name>` tail. A title without one names nothing. */
function namesATracker(text: string): boolean {
  const title = text.split("\n").find((line) => line.startsWith("# "));
  if (title === undefined) return false;

  const [, ...named] = title.split(":");
  return named.join(":").trim().length > 0;
}

/** Reads one candidate. Anything unreadable stops the check rather than reading as absent. */
function read(fs: SetupFs, path: string, relative: string): string {
  try {
    return fs.read(path);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new HandoffError(`Could not read ${relative}: ${reason}`);
  }
}

function checkOne(item: HandoffItem, root: string, fs: SetupFs): HandoffResult {
  const present = item.candidates
    .filter((relative) => fs.exists(join(root, relative)))
    .map((relative) => ({ relative, text: read(fs, join(root, relative), relative) }));

  // Nothing is there to read. Not a failure — this is the ordinary state of a
  // project the harness has not been pointed at yet.
  const first = present[0];
  if (first === undefined) return { id: item.id, status: "missing", path: null };

  const carrying = present.find((candidate) => item.carries(candidate.text));
  const status: HandoffStatus = carrying === undefined ? "empty" : "ready";

  return { id: item.id, status, path: (carrying ?? first).relative };
}

/** Reads all three, in table order. The order is the report order. */
export function checkHandoff(root: string, fs: SetupFs): HandoffResult[] {
  return ITEMS.map((item) => checkOne(item, root, fs));
}
