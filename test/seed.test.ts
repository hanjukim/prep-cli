import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { checkHandoff } from "../src/handoff.ts";
import { AGENTS_SEED, CLAUDE_MD_POINTER } from "../src/seed.ts";
import { SetupError, setup as runSetup } from "../src/setup.ts";
import type { GuidanceArtifact, SetupFs, SetupOutcome, WhichFn } from "../src/types.ts";

const ROOT = "/project";
const AGENTS_MD = "/project/AGENTS.md";
const CLAUDE_MD = "/project/CLAUDE.md";
const PACKAGE_JSON = "/project/package.json";

/** A machine holding every executable, harnesses included. */
const EVERYTHING: WhichFn = (binary) => `/usr/bin/${binary}`;

/**
 * A run against a fake machine and a fake home directory.
 *
 * Which files a run produces is read off the machine now, so no test here may
 * fall through to the real PATH — a guidance file has nothing to do with which
 * harness happens to be installed, and a test that says so must not start
 * failing on somebody else's laptop.
 */
function setup(input: { root: string; dryRun?: boolean; fs: SetupFs }): SetupOutcome {
  return runSetup({ home: "/home", which: EVERYTHING, ...input });
}

type FakeFsOptions = { contents?: Record<string, string>; onWrite?: (path: string) => void };

/** A fake file system holding only the given paths. It never touches a real disk. */
function fakeFs(present: readonly string[], options: FakeFsOptions = {}) {
  const written = new Map<string, string>();
  const held = new Map(Object.entries(options.contents ?? {}));
  const paths = new Set([ROOT, ...present, ...held.keys()]);
  const fs: SetupFs = {
    exists: (path) => paths.has(path),
    isDirectory: (path) => path === ROOT && paths.has(ROOT),
    read: (path) => {
      const text = written.get(path) ?? held.get(path);
      if (text === undefined) throw new Error(`ENOENT: no such file, open '${path}'`);
      return text;
    },
    write: (path, contents) => {
      options.onWrite?.(path);
      written.set(path, contents);
      paths.add(path);
    },
  };
  return { fs, written };
}

/** The guidance file the run produced. */
function seedFile(outcome: SetupOutcome): GuidanceArtifact {
  const artifact = outcome.artifacts.find(
    (one): one is GuidanceArtifact => one.kind === "agents-md",
  );
  if (artifact === undefined) throw new Error("the run produced no guidance file");
  return artifact;
}

/** The CLAUDE.md the run produced, if it produced one. */
function pointerFile(outcome: SetupOutcome): GuidanceArtifact | null {
  return outcome.artifacts.find((one): one is GuidanceArtifact => one.kind === "claude-md") ?? null;
}

describe("seeding the guidance file", () => {
  test("a project with no guidance file gets one", () => {
    const { fs, written } = fakeFs([PACKAGE_JSON]);
    const artifact = seedFile(setup({ root: ROOT, fs }));
    expect(artifact.status).toBe("applied");
    expect(artifact.path).toBe(AGENTS_MD);
    expect(written.get(AGENTS_MD)).toBe(AGENTS_SEED);
  });

  test("an existing AGENTS.md is left exactly as it was", () => {
    const mine = "# AGENTS.md\n\n## Language\n\nKorean.\n";
    const { fs, written } = fakeFs([], { contents: { [AGENTS_MD]: mine } });
    const artifact = seedFile(setup({ root: ROOT, fs }));
    expect(artifact.status).toBe("skipped");
    expect(artifact.contents).toBeNull();
    expect(written.has(AGENTS_MD)).toBe(false);
  });

  test("a CLAUDE.md counts as the guidance file, so no second one is written", () => {
    const { fs, written } = fakeFs([], {
      contents: { [CLAUDE_MD]: "# p\n\n## Language\n\nKorean.\n" },
    });
    const artifact = seedFile(setup({ root: ROOT, fs }));
    expect(artifact.status).toBe("skipped");
    expect(artifact.path).toBe(CLAUDE_MD);
    expect(written.has(AGENTS_MD)).toBe(false);
  });

  test("an unfilled guidance file is still left alone — prep does not top it up", () => {
    const stub = "# AGENTS.md\n";
    const { fs, written } = fakeFs([], { contents: { [AGENTS_MD]: stub } });
    expect(seedFile(setup({ root: ROOT, fs })).status).toBe("skipped");
    expect(written.has(AGENTS_MD)).toBe(false);
  });

  test("a dry run plans the file and writes nothing", () => {
    const { fs, written } = fakeFs([PACKAGE_JSON]);
    const artifact = seedFile(setup({ root: ROOT, dryRun: true, fs }));
    expect(artifact.status).toBe("planned");
    expect(artifact.contents).toBe(AGENTS_SEED);
    expect(written.size).toBe(0);
  });

  test("a failed write surfaces as a tool error naming the path", () => {
    const { fs } = fakeFs([PACKAGE_JSON], {
      onWrite: (path) => {
        if (path === AGENTS_MD) throw new Error("EACCES: permission denied");
      },
    });
    expect(() => setup({ root: ROOT, fs })).toThrow(SetupError);
    expect(() => setup({ root: ROOT, fs })).toThrow(/AGENTS\.md/);
  });
});

describe("pointing Claude Code at the guidance", () => {
  test("a project seeded with AGENTS.md gets a CLAUDE.md that imports it", () => {
    const { fs, written } = fakeFs([PACKAGE_JSON]);
    const artifact = pointerFile(setup({ root: ROOT, fs }));
    expect(artifact?.status).toBe("applied");
    expect(artifact?.path).toBe(CLAUDE_MD);
    expect(written.get(CLAUDE_MD)).toBe(CLAUDE_MD_POINTER);
  });

  test("a project that already had AGENTS.md gets one too — the guidance was unreachable", () => {
    const mine = "# AGENTS.md\n\n## Language\n\nKorean.\n";
    const { fs, written } = fakeFs([], { contents: { [AGENTS_MD]: mine } });
    expect(pointerFile(setup({ root: ROOT, fs }))?.status).toBe("applied");
    expect(written.get(CLAUDE_MD)).toBe(CLAUDE_MD_POINTER);
    expect(written.has(AGENTS_MD)).toBe(false);
  });

  test("it says where the guidance is and nothing else", () => {
    expect(CLAUDE_MD_POINTER).toBe("@AGENTS.md\n");
  });

  test("an existing CLAUDE.md beside an AGENTS.md is left exactly as it was, whatever it says", () => {
    const mine = "# p\n\nno import here\n";
    const { fs, written } = fakeFs([], {
      contents: { [AGENTS_MD]: "# AGENTS.md\n\n## Language\n\nKorean.\n", [CLAUDE_MD]: mine },
    });
    const artifact = pointerFile(setup({ root: ROOT, fs }));
    expect(artifact?.status).toBe("skipped");
    expect(artifact?.contents).toBeNull();
    expect(written.has(CLAUDE_MD)).toBe(false);
  });

  test("a project whose guidance is CLAUDE.md gets no pointer — one file is not two artifacts", () => {
    const { fs } = fakeFs([], { contents: { [CLAUDE_MD]: "# p\n\n## Language\n\nKorean.\n" } });
    const outcome = setup({ root: ROOT, fs });
    expect(pointerFile(outcome)).toBeNull();
    expect(seedFile(outcome).path).toBe(CLAUDE_MD);
    // The one file it does report is reported once.
    expect(outcome.artifacts.filter((one) => one.path === CLAUDE_MD)).toHaveLength(1);
  });

  test("a dry run plans it and writes nothing", () => {
    const { fs, written } = fakeFs([PACKAGE_JSON]);
    const artifact = pointerFile(setup({ root: ROOT, dryRun: true, fs }));
    expect(artifact?.status).toBe("planned");
    expect(artifact?.contents).toBe(CLAUDE_MD_POINTER);
    expect(written.size).toBe(0);
  });

  test("running twice changes nothing the second time", () => {
    const { fs, written } = fakeFs([PACKAGE_JSON]);
    expect(pointerFile(setup({ root: ROOT, fs }))?.status).toBe("applied");
    expect(pointerFile(setup({ root: ROOT, fs }))?.status).toBe("skipped");
    expect(written.get(CLAUDE_MD)).toBe(CLAUDE_MD_POINTER);
  });

  test("a failed write surfaces as a tool error naming the path", () => {
    const { fs } = fakeFs([PACKAGE_JSON], {
      onWrite: (path) => {
        if (path === CLAUDE_MD) throw new Error("EACCES: permission denied");
      },
    });
    expect(() => setup({ root: ROOT, fs })).toThrow(SetupError);
    expect(() => setup({ root: ROOT, fs })).toThrow(/CLAUDE\.md/);
  });
});

/** The paragraphs under `## Language`, down to the next heading of the same level or higher. */
function languageSection(text: string): string[] {
  const lines = text.split("\n");
  const start = lines.findIndex((line) => /^##\s+Language\s*$/.test(line));
  if (start === -1) throw new Error("no `## Language` heading to read paragraphs under");
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^#{1,2}\s/.test(line));

  return (end === -1 ? rest : rest.slice(0, end))
    .join("\n")
    .split("\n\n")
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0);
}

describe("what the seed says", () => {
  test("the handoff check reads it as ready — the language question is answered", () => {
    const { fs } = fakeFs([], { contents: { [AGENTS_MD]: AGENTS_SEED } });
    const language = checkHandoff(ROOT, fs).find((result) => result.id === "language");
    expect(language).toEqual({ id: "language", status: "ready", path: "AGENTS.md" });
  });

  test("it holds a Language section, and opens no heading it cannot answer under", () => {
    expect(AGENTS_SEED).toContain("\n## Language\n");
    const headings = AGENTS_SEED.split("\n").filter((line) => /^#{1,6}\s/.test(line));
    expect(headings).toEqual(["# AGENTS.md", "## Language"]);
  });

  test("it plants the rule this repository follows, word for word", () => {
    // The one rule prep owns is the one it is under (docs/adr/0016). Read from
    // the file rather than restated here: a copy in the test would be a third
    // place to keep true, and the drift it is meant to catch could hide in it.
    const ours = languageSection(readFileSync(join(import.meta.dir, "..", "AGENTS.md"), "utf8"));
    const seeded = languageSection(AGENTS_SEED);

    // Every paragraph the seed plants is one this repository keeps. The one it
    // leaves out is the sentence about Korean written before the rule — a
    // project being seeded has no history to except.
    for (const paragraph of seeded) expect(ours).toContain(paragraph);
    expect(ours.length - seeded.length).toBe(1);
  });

  test("seeding twice changes nothing the second time", () => {
    const { fs, written } = fakeFs([PACKAGE_JSON]);
    expect(seedFile(setup({ root: ROOT, fs })).status).toBe("applied");

    const first = written.get(AGENTS_MD);
    expect(seedFile(setup({ root: ROOT, fs })).status).toBe("skipped");
    expect(written.get(AGENTS_MD)).toBe(first);
  });
});
