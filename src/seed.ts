import { join } from "node:path";

import { GUIDANCE_FILES } from "./handoff.ts";
import type { GuidanceArtifact, SetupFs } from "./types.ts";

/**
 * The instruction file the harness reads, seeded with the one answer prep owns.
 *
 * The handoff check reports that a project has nowhere to put its guidance; this
 * writes the somewhere. The two stay in step through `GUIDANCE_FILES`: the seed
 * lands in a file the check reads, so a seeded project's language item reads
 * ready. The tracker and the domain docs stay the harness's job
 * (docs/adr/0008).
 */

/** The file prep writes when no guidance file exists. The later candidate: an existing CLAUDE.md always wins. */
const SEED_RELATIVE_PATH = "AGENTS.md";

/**
 * What gets written.
 *
 * The Language section carries prose, and that is what the handoff check reads
 * as an answer — the seeded project stops owing that item (docs/adr/0008). The
 * seed opens the one heading it can answer under and no other: an empty heading
 * for the tracker or the domain docs would name a question prep leaves to the
 * harness, in the one place the check reads for the answer.
 *
 * The rule is word for word this repository's own (docs/adr/0016). One sentence
 * of history is left out, because a project being seeded has none.
 */
export const AGENTS_SEED = `# AGENTS.md

Written by prep, which answers the language question below and leaves the rest
to the harness. Run /setup-matt-pocock-skills to write what is not here.

## Language

**English in everything this repository publishes.** Code and its comments,
identifiers, program output, commit messages, branch names, pull request
descriptions, design documents, and issues.

**The reader's language in prompts.** A prompt has one reader, and that reader
is known.

The split follows the audience: anything published cannot name its readers, and
a prompt can.
`;

/**
 * Seeds the guidance file, or plans it.
 *
 * The same split the settings file draws, for the same reason: with no file
 * there, prep writes, because there is nothing of anybody's to lose. With one
 * there — under either name — prep does not touch it and does not propose a
 * second. One project has one instruction file, and picking which of two wins is
 * not prep's decision to make.
 */
export function seedArtifact(root: string, dryRun: boolean, fs: SetupFs): GuidanceArtifact {
  const standing = GUIDANCE_FILES.find((relative) => fs.exists(join(root, relative)));
  if (standing !== undefined) {
    return { kind: "agents-md", path: join(root, standing), status: "skipped", contents: null };
  }

  const path = join(root, SEED_RELATIVE_PATH);

  if (dryRun) return { kind: "agents-md", path, status: "planned", contents: AGENTS_SEED };

  write(path, AGENTS_SEED, fs);

  return { kind: "agents-md", path, status: "applied", contents: AGENTS_SEED };
}

/** Where Claude Code looks. It reads this name and no other, whatever else the project holds. */
const POINTER_RELATIVE_PATH = "CLAUDE.md";

/**
 * The whole file: one import, pointing at where the guidance actually lives.
 *
 * The bare `@AGENTS.md` form is the one Claude Code's own documentation gives.
 * Nothing else goes in — a second copy of the guidance would be a second thing to
 * keep true, and the file exists to remove exactly that.
 */
export const CLAUDE_MD_POINTER = "@AGENTS.md\n";

/**
 * Points Claude Code at the guidance file.
 *
 * Claude Code reads CLAUDE.md and does not read AGENTS.md, so a project whose
 * guidance sits in AGENTS.md — the file prep seeds, and the file every other
 * agent reads — is a project Claude starts blind in. One import line closes
 * that, and it is the vendor's own answer to the same question.
 *
 * It takes the guidance file the run settled on, because there is only a pointer
 * where there is something to point at. A project whose guidance lives in
 * CLAUDE.md already has it where Claude Code reads: nothing is written, and
 * nothing is reported — the same file cannot be two of this run's artifacts.
 *
 * A CLAUDE.md that exists beside an AGENTS.md is left as it is, unread — what
 * somebody else's instruction file says is theirs to decide, and appending to
 * prose is not a merge (docs/adr/0007).
 */
export function pointerArtifact(
  root: string,
  guidance: GuidanceArtifact,
  dryRun: boolean,
  fs: SetupFs,
): GuidanceArtifact | null {
  if (guidance.path !== join(root, SEED_RELATIVE_PATH)) return null;

  const path = join(root, POINTER_RELATIVE_PATH);

  if (fs.exists(path)) return { kind: "claude-md", path, status: "skipped", contents: null };

  if (dryRun) return { kind: "claude-md", path, status: "planned", contents: CLAUDE_MD_POINTER };

  write(path, CLAUDE_MD_POINTER, fs);

  return { kind: "claude-md", path, status: "applied", contents: CLAUDE_MD_POINTER };
}

/** A failed write. Turned into a setup error where the run is driven from. */
export class SeedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SeedError";
  }
}

function write(path: string, contents: string, fs: SetupFs): void {
  try {
    fs.write(path, contents);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new SeedError(`Could not write ${path}: ${reason}`);
  }
}
