import { describe, expect, test } from "bun:test";

import { HandoffError, checkHandoff } from "../src/handoff.ts";
import type { HandoffItemId, HandoffStatus, SetupFs } from "../src/types.ts";

const ROOT = "/project";

/** A file system holding the given texts and nothing else. */
function fakeFs(files: Record<string, string>): SetupFs {
  return {
    exists: (path) => path in files,
    isDirectory: (path) => path === ROOT,
    read: (path) => {
      const text = files[path];
      if (text === undefined) throw new Error(`ENOENT: no such file, open '${path}'`);
      return text;
    },
    write: () => {
      throw new Error("the handoff check must never write");
    },
  };
}

function check(files: Record<string, string>): Record<HandoffItemId, HandoffStatus> {
  const results = checkHandoff(ROOT, fakeFs(files));
  return Object.fromEntries(results.map((result) => [result.id, result.status])) as Record<
    HandoffItemId,
    HandoffStatus
  >;
}

const LANGUAGE = `# my-project

## Language

English in the repository, the writer's own language in conversation.

## Agent skills

Something else.
`;

const TRACKER = `# Issue tracker: GitHub

Issues live as GitHub issues. Use the \`gh\` CLI.

## When a skill says "publish to the issue tracker"

Create a GitHub issue.
`;

const DOMAIN = `# Domain Docs

How the engineering skills should consume this repo's domain documentation.

## Before exploring, read these

- \`CONTEXT.md\` at the repo root.
`;

/** Everything the harness-side setup leaves behind, in place. */
const COMPLETE = {
  "/project/CLAUDE.md": LANGUAGE,
  "/project/docs/agents/issue-tracker.md": TRACKER,
  "/project/docs/agents/domain.md": DOMAIN,
};

describe("what the check reports", () => {
  test("a project with all three in place is ready", () => {
    expect(check(COMPLETE)).toEqual({
      language: "ready",
      "issue-tracker": "ready",
      "domain-docs": "ready",
    });
  });

  test("an untouched project has all three missing", () => {
    expect(check({})).toEqual({
      language: "missing",
      "issue-tracker": "missing",
      "domain-docs": "missing",
    });
  });

  test("the three items come back in a fixed order", () => {
    expect(checkHandoff(ROOT, fakeFs({})).map((result) => result.id)).toEqual([
      "language",
      "issue-tracker",
      "domain-docs",
    ]);
  });

  test("each result names the file it read", () => {
    const results = checkHandoff(ROOT, fakeFs(COMPLETE));
    expect(results.map((result) => result.path)).toEqual([
      "CLAUDE.md",
      "docs/agents/issue-tracker.md",
      "docs/agents/domain.md",
    ]);
  });

  test("a missing item names no file", () => {
    for (const result of checkHandoff(ROOT, fakeFs({}))) expect(result.path).toBeNull();
  });
});

describe("the language guidance", () => {
  test("CLAUDE.md holds it", () => {
    expect(check({ "/project/CLAUDE.md": LANGUAGE }).language).toBe("ready");
  });

  test("AGENTS.md holds it just as well", () => {
    expect(check({ "/project/AGENTS.md": LANGUAGE }).language).toBe("ready");
  });

  test("a section of nothing but sub-headings is empty — a heading promises prose", () => {
    expect(check({ "/project/CLAUDE.md": "## Language\n\n### In code\n\n### In chat\n" }).language).toBe(
      "empty",
    );
  });

  test("AGENTS.md answers for a CLAUDE.md that says nothing about language", () => {
    const [language] = checkHandoff(
      ROOT,
      fakeFs({ "/project/CLAUDE.md": "# p\n\n## Agent skills\n\nStuff.\n", "/project/AGENTS.md": LANGUAGE }),
    );
    expect(language).toEqual({ id: "language", status: "ready", path: "AGENTS.md" });
  });

  test("when neither carries it AGENTS.md takes the blame — that is where it gets written", () => {
    const [language] = checkHandoff(
      ROOT,
      fakeFs({ "/project/CLAUDE.md": "# p\n", "/project/AGENTS.md": "# p\n" }),
    );
    expect(language).toEqual({ id: "language", status: "empty", path: "AGENTS.md" });
  });

  test("a CLAUDE.md that only imports AGENTS.md is not the file to go and fill in", () => {
    const [language] = checkHandoff(
      ROOT,
      fakeFs({ "/project/CLAUDE.md": "@AGENTS.md\n", "/project/AGENTS.md": "# p\n\n## Language\n" }),
    );
    expect(language).toEqual({ id: "language", status: "empty", path: "AGENTS.md" });
  });

  test("AGENTS.md wins when both are there", () => {
    const [language] = checkHandoff(
      ROOT,
      fakeFs({ "/project/CLAUDE.md": LANGUAGE, "/project/AGENTS.md": LANGUAGE }),
    );
    expect(language!.path).toBe("AGENTS.md");
  });

  test("a file without the section is empty, not missing — there is something to fill", () => {
    expect(check({ "/project/CLAUDE.md": "# my-project\n\n## Agent skills\n\nStuff.\n" }).language).toBe(
      "empty",
    );
  });

  test("a heading with nothing under it is empty", () => {
    expect(check({ "/project/CLAUDE.md": "# my-project\n\n## Language\n\n## Agent skills\n" }).language).toBe(
      "empty",
    );
  });

  test("the heading is matched whatever its casing", () => {
    expect(check({ "/project/CLAUDE.md": "## LANGUAGE\n\nEnglish only.\n" }).language).toBe("ready");
  });

  test("a deeper heading does not end the section", () => {
    const text = "## Language\n\n### In code\n\nEnglish only.\n";
    expect(check({ "/project/CLAUDE.md": text }).language).toBe("ready");
  });
});

describe("the issue tracker doc", () => {
  test("a doc whose title names a tracker is ready", () => {
    expect(check({ "/project/docs/agents/issue-tracker.md": TRACKER })["issue-tracker"]).toBe("ready");
  });

  test("a title with no tracker after it is empty", () => {
    const text = "# Issue tracker\n\nSomething goes here.\n";
    expect(check({ "/project/docs/agents/issue-tracker.md": text })["issue-tracker"]).toBe("empty");
  });

  test("a named tracker with no body is still empty", () => {
    const text = "# Issue tracker: GitHub\n";
    expect(check({ "/project/docs/agents/issue-tracker.md": text })["issue-tracker"]).toBe("empty");
  });

  test("a doc with no title at all is empty", () => {
    const text = "Issues live on GitHub.\n";
    expect(check({ "/project/docs/agents/issue-tracker.md": text })["issue-tracker"]).toBe("empty");
  });
});

describe("the domain doc", () => {
  test("a doc with a body is ready", () => {
    expect(check({ "/project/docs/agents/domain.md": DOMAIN })["domain-docs"]).toBe("ready");
  });

  test("a title with nothing under it is empty", () => {
    expect(check({ "/project/docs/agents/domain.md": "# Domain Docs\n" })["domain-docs"]).toBe("empty");
  });

  test("headings alone are not a body", () => {
    const text = "# Domain Docs\n\n## Before exploring, read these\n\n## File structure\n";
    expect(check({ "/project/docs/agents/domain.md": text })["domain-docs"]).toBe("empty");
  });

  test("whitespace is not a body", () => {
    expect(check({ "/project/docs/agents/domain.md": "# Domain Docs\n\n   \n\n" })["domain-docs"]).toBe(
      "empty",
    );
  });
});

describe("a file that cannot be read", () => {
  test("stops the check instead of passing as missing", () => {
    const fs: SetupFs = {
      exists: () => true,
      isDirectory: (path) => path === ROOT,
      read: (path) => {
        throw new Error(`EACCES: permission denied, open '${path}'`);
      },
      write: () => {},
    };
    expect(() => checkHandoff(ROOT, fs)).toThrow(HandoffError);
  });

  test("the failure names the file", () => {
    const fs: SetupFs = {
      exists: (path) => path.endsWith("domain.md"),
      isDirectory: (path) => path === ROOT,
      read: () => {
        throw new Error("EACCES: permission denied");
      },
      write: () => {},
    };
    expect(() => checkHandoff(ROOT, fs)).toThrow(/domain\.md/);
  });
});
