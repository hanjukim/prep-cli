import { describe, expect, test } from "bun:test";

import { nextSteps } from "../src/next.ts";
import { renderSetupHuman } from "../src/report/setup-human.ts";
import { renderSetupJson } from "../src/report/setup-json.ts";
import { AGENTS_SEED, CLAUDE_MD_POINTER } from "../src/seed.ts";
import type {
  Artifact,
  ArtifactStatus,
  HandoffResult,
  HarnessPresence,
  LanguageServer,
  PluginRecommendation,
  PluginStatus,
  ProjectType,
  SetupOutcome,
} from "../src/types.ts";

const ROOT = "/project";
const AGENTS_MD = "/project/AGENTS.md";
const CLAUDE_MD = "/project/CLAUDE.md";

const CLAUDE_COMMAND = "claude '/setup-matt-pocock-skills'";
const CODEX_COMMAND = "codex '$setup-matt-pocock-skills'";

/**
 * The harness rows a run would have carried on a machine holding these.
 *
 * Every fixture goes through this rather than the real PATH: what the footer
 * suggests depends on which harnesses are installed, and a fixture that read the
 * machine running the suite would render differently on each one.
 */
function holding(...ids: readonly string[]): HarnessPresence[] {
  return (["claude-code", "codex"] as const).map((id) => ({ id, installed: ids.includes(id) }));
}

const BOTH_HARNESSES = holding("claude-code", "codex");
const NO_HARNESS = holding();

/** A project the harness has not been pointed at yet. The ordinary starting state. */
const UNTOUCHED: HandoffResult[] = [
  { id: "language", status: "missing", path: null },
  { id: "issue-tracker", status: "missing", path: null },
  { id: "domain-docs", status: "missing", path: null },
];

/** What a project reads as right after prep seeded it: the language is answered, the rest is not. */
const JUST_SEEDED: HandoffResult[] = [
  { id: "language", status: "ready", path: "AGENTS.md" },
  { id: "issue-tracker", status: "missing", path: null },
  { id: "domain-docs", status: "missing", path: null },
];

/** Every item settled. */
const SETTLED: HandoffResult[] = [
  { id: "language", status: "ready", path: "CLAUDE.md" },
  { id: "issue-tracker", status: "ready", path: "docs/agents/issue-tracker.md" },
  { id: "domain-docs", status: "ready", path: "docs/agents/domain.md" },
];

/** Started and stopped halfway — one of each status. */
const HALFWAY: HandoffResult[] = [
  { id: "language", status: "ready", path: "AGENTS.md" },
  { id: "issue-tracker", status: "empty", path: "docs/agents/issue-tracker.md" },
  { id: "domain-docs", status: "missing", path: null },
];

/** The guidance file, as the renderers see it. */
function seed(status: ArtifactStatus, path: string = AGENTS_MD): Artifact {
  return { kind: "agents-md", path, status, contents: status === "skipped" ? null : AGENTS_SEED };
}

/** The line that points Claude Code at it. */
function pointer(status: ArtifactStatus): Artifact {
  return {
    kind: "claude-md",
    path: CLAUDE_MD,
    status,
    contents: status === "skipped" ? null : CLAUDE_MD_POINTER,
  };
}

type Fixture = {
  detected?: ProjectType[];
  artifacts?: Artifact[];
  handoff?: HandoffResult[];
  plugins?: PluginRecommendation[];
  harnesses?: HarnessPresence[];
};

/** A fixed outcome, so the renderers are checked without going through detection. */
function outcome(fixture: Fixture = {}): SetupOutcome {
  // The suggestions come from the real rule rather than a literal, so a
  // rendered fixture always shows a combination a run could actually produce.
  const base: SetupOutcome = {
    root: ROOT,
    detected: fixture.detected ?? ["node"],
    artifacts: fixture.artifacts ?? [seed("applied"), pointer("applied")],
    harnesses: fixture.harnesses ?? BOTH_HARNESSES,
    plugins: fixture.plugins ?? [],
    handoff: fixture.handoff ?? JUST_SEEDED,
    next: [],
  };
  return { ...base, next: nextSteps(base) };
}

const APPLIED = outcome();
const PLANNED = outcome({
  detected: ["node", "python"],
  artifacts: [seed("planned"), pointer("planned")],
  handoff: UNTOUCHED,
});
const SKIPPED = outcome({
  detected: ["python"],
  artifacts: [seed("skipped"), pointer("skipped")],
  handoff: SETTLED,
});
/** A project whose guidance already lives in CLAUDE.md: one file, and nothing to point at it. */
const IN_CLAUDE_MD = outcome({ artifacts: [seed("skipped", CLAUDE_MD)], handoff: SETTLED });
const NO_MARKER = outcome({ detected: [] });

function human(input: SetupOutcome): string {
  return renderSetupHuman({ outcome: input });
}

describe("the human report", () => {
  test("applied", () => {
    expect(human(APPLIED)).toMatchSnapshot();
  });

  test("planned", () => {
    expect(human(PLANNED)).toMatchSnapshot();
  });

  test("skipped", () => {
    expect(human(SKIPPED)).toMatchSnapshot();
  });

  test("guidance already in CLAUDE.md", () => {
    expect(human(IN_CLAUDE_MD)).toMatchSnapshot();
  });

  test("no marker", () => {
    expect(human(NO_MARKER)).toMatchSnapshot();
  });

  test("each detected type is shown with the marker that found it", () => {
    expect(human(PLANNED)).toContain("✓ node    package.json");
    expect(human(PLANNED)).toContain("✓ python  pyproject.toml");
  });

  test("with no marker it names what it looked for", () => {
    expect(human(NO_MARKER)).toContain("package.json, pyproject.toml");
  });

  test("each file gets its own sentence, in the order it was produced", () => {
    const lines = human(APPLIED).split("\n");
    const first = lines.findIndex((line) => line.startsWith(`Wrote ${AGENTS_MD}`));
    const second = lines.findIndex((line) => line.startsWith(`Wrote ${CLAUDE_MD}`));
    expect(first).toBeGreaterThan(-1);
    expect(second).toBeGreaterThan(first);
    // The handoff still closes the report, however many files came before it.
    expect(lines.findIndex((line) => line.startsWith("Handoff ("))).toBeGreaterThan(second);
  });

  test("a file's section is a sentence, with no list under it", () => {
    for (const line of human(APPLIED).split("\n")) {
      expect(line).not.toMatch(/^(Allowing|Denying|Asking|Enabling|Starting mode)/);
    }
  });

  test("it says what the pointer is for, so one import line is not a mystery", () => {
    expect(human(APPLIED)).toContain("so Claude Code reads the guidance in AGENTS.md");
  });

  test("a dry run says nothing was written, for each file", () => {
    const text = human(PLANNED);
    expect(text).toContain(`Dry run. Nothing was written to ${AGENTS_MD}.`);
    expect(text).toContain(`Dry run. Nothing was written to ${CLAUDE_MD}.`);
  });

  test("a file that already stands is named and reported as left alone", () => {
    const text = human(SKIPPED);
    expect(text).toContain(`${AGENTS_MD} is already there`);
    expect(text).toContain(`${CLAUDE_MD} is already there`);
  });

  test("no permission file is named anywhere, whatever the run did", () => {
    for (const source of [APPLIED, PLANNED, SKIPPED, IN_CLAUDE_MD, NO_MARKER]) {
      const text = human(source);
      expect(text).not.toContain("settings.json");
      expect(text).not.toContain("config.toml");
    }
  });

  test("no harness block is shown, whichever harness the machine holds", () => {
    for (const harnesses of [BOTH_HARNESSES, holding("codex"), holding("claude-code"), NO_HARNESS]) {
      expect(human(outcome({ harnesses }))).not.toContain("Harnesses (");
    }
  });
});

describe("what the harness still owes", () => {
  const settled = outcome({ handoff: SETTLED });
  const halfway = outcome({ handoff: HALFWAY });
  const untouched = outcome({ handoff: UNTOUCHED });

  test("everything settled", () => {
    expect(human(settled)).toMatchSnapshot();
  });

  test("started and stopped halfway", () => {
    expect(human(halfway)).toMatchSnapshot();
  });

  test("an untouched project is told what to run", () => {
    const text = human(untouched);
    expect(text).toContain("3 still owed");
    expect(text).toContain("/setup-matt-pocock-skills");
  });

  test("with nothing owed it sends nobody to the harness", () => {
    const text = human(settled);
    expect(text).toContain("Nothing owed");
    expect(text).not.toContain("/setup-matt-pocock-skills");
  });

  test("a file that is there but unfilled reads differently from one that is absent", () => {
    const text = human(halfway);
    expect(text).toContain("docs/agents/issue-tracker.md names no tracker");
    expect(text).toContain("no docs/agents/domain.md");
  });

  test("a settled item shows the file that answers it", () => {
    expect(human(halfway)).toContain("✓ language       AGENTS.md");
  });

  test("it is shown even on a run that wrote nothing", () => {
    expect(human(SKIPPED)).toContain("Handoff (3)");
  });

  test("it comes after the files", () => {
    const lines = human(APPLIED).split("\n");
    const wrote = lines.findIndex((line) => line.startsWith(`Wrote ${CLAUDE_MD}`));
    const owed = lines.findIndex((line) => line.startsWith("Handoff ("));
    expect(wrote).toBeGreaterThan(-1);
    expect(owed).toBeGreaterThan(wrote);
  });
});

describe("the JSON report", () => {
  test("applied", () => {
    expect(renderSetupJson(APPLIED)).toMatchSnapshot();
  });

  test("skipped", () => {
    expect(renderSetupJson(SKIPPED)).toMatchSnapshot();
  });

  test("parses whole, and ends with a newline", () => {
    const text = renderSetupJson(PLANNED);
    expect(text.endsWith("\n")).toBe(true);
    expect(JSON.parse(text)).toEqual({
      root: ROOT,
      detected: ["node", "python"],
      artifacts: [
        { kind: "agents-md", path: AGENTS_MD, status: "planned", contents: AGENTS_SEED },
        { kind: "claude-md", path: CLAUDE_MD, status: "planned", contents: CLAUDE_MD_POINTER },
      ],
      harnesses: [
        { id: "claude-code", installed: true },
        { id: "codex", installed: true },
      ],
      plugins: [],
      handoff: UNTOUCHED,
      next: [
        { id: "harness", command: CLAUDE_COMMAND, alternative: CODEX_COMMAND },
        { id: "chef", command: "prep chef", alternative: null },
      ],
    });
  });

  test("every file is an element, told apart by kind and not by position", () => {
    const payload = JSON.parse(renderSetupJson(APPLIED));
    expect(payload.artifacts.map((one: { kind: string }) => one.kind)).toEqual([
      "agents-md",
      "claude-md",
    ]);
    expect(payload.artifacts.map((one: { path: string }) => one.path)).toEqual([AGENTS_MD, CLAUDE_MD]);
  });

  test("an artifact carries its kind, path, status and contents, and nothing else", () => {
    const payload = JSON.parse(renderSetupJson(APPLIED));
    for (const one of payload.artifacts) {
      expect(Object.keys(one)).toEqual(["kind", "path", "status", "contents"]);
    }
  });

  test("a file prep left alone carries no contents", () => {
    const payload = JSON.parse(renderSetupJson(SKIPPED));
    expect(payload.artifacts.map((one: { contents: unknown }) => one.contents)).toEqual([null, null]);
  });

  test("a harness row says whether the machine holds it, and nothing about files", () => {
    const payload = JSON.parse(renderSetupJson(outcome({ harnesses: holding("codex") })));
    expect(payload.harnesses).toEqual([
      { id: "claude-code", installed: false },
      { id: "codex", installed: true },
    ]);
  });

  test("no human symbols or wording leak in", () => {
    const text = renderSetupJson(outcome({ handoff: UNTOUCHED }));
    for (const noise of ["✓", "–", "prep setup ·", "Detected", "Wrote", "still owed"]) {
      expect(text).not.toContain(noise);
    }
  });

  test("the handoff results are copies too", () => {
    const source = outcome({ handoff: SETTLED });
    const parsed = JSON.parse(renderSetupJson(source));
    parsed.handoff[0].status = "missing";
    expect(source.handoff[0]!.status).toBe("ready");
  });

  test("the harness rows are copies, so a consumer cannot reach back into the outcome", () => {
    const source = outcome({ harnesses: holding("claude-code") });
    const payload = JSON.parse(renderSetupJson(source));
    payload.harnesses[0].installed = false;
    expect(source.harnesses[0]!.installed).toBe(true);
  });
});

describe("the plugins a project type calls for", () => {
  const MARKETPLACE = "claude-plugins-official";
  const TYPESCRIPT = "typescript-lsp@claude-plugins-official";

  function recommended(
    status: PluginStatus,
    name = "typescript-lsp",
    server: LanguageServer = { binary: `${name}-server`, status: "installed" },
  ): PluginRecommendation {
    return { name, marketplace: MARKETPLACE, status, server };
  }

  /** The same plugin, on a machine that does not hold the server it points at. */
  function withoutServer(status: PluginStatus): PluginRecommendation {
    return recommended(status, "typescript-lsp", {
      binary: "typescript-language-server",
      status: "missing",
    });
  }

  function withPlugins(...plugins: PluginRecommendation[]): SetupOutcome {
    return outcome({ plugins });
  }

  const MISSING = withPlugins(recommended("missing"));
  const INSTALLED = withPlugins(recommended("installed"));
  const BOTH = withPlugins(recommended("installed"), recommended("missing", "pyright-lsp"));

  test("one to install", () => {
    expect(human(MISSING)).toMatchSnapshot();
  });

  test("one to turn on", () => {
    expect(human(INSTALLED)).toMatchSnapshot();
  });

  test("a plugin the machine does not hold is reported with the command that installs it", () => {
    const text = human(MISSING);
    expect(text).toContain("Plugins (1)");
    expect(text).toContain("not installed");
    expect(text).toContain(`claude plugin install ${TYPESCRIPT}`);
  });

  test("a plugin already on the machine is reported with the command that turns it on here", () => {
    const text = human(INSTALLED);
    expect(text).toContain(`claude plugin enable ${TYPESCRIPT} --scope project`);
    expect(text).not.toContain("claude plugin install");
  });

  test("nothing claims prep turned a plugin on — the command is the person's to run", () => {
    for (const source of [MISSING, INSTALLED, BOTH]) {
      expect(human(source)).not.toContain("prep turns it on");
    }
  });

  test("each status reads differently, so two of them never blur together", () => {
    const text = human(BOTH);
    expect(text).toContain("+ typescript-lsp  installed, not turned on here");
    expect(text).toContain("✗ pyright-lsp     not installed");
  });

  test("with every plugin already answered for, the block is gone", () => {
    const text = human(withPlugins(recommended("answered")));
    expect(text).not.toContain("Plugins (");
  });

  test("a project with no recognised type is recommended nothing, and shown nothing", () => {
    expect(human(NO_MARKER)).not.toContain("Plugins (");
  });

  test("the block is shown whether or not Claude Code is on the machine", () => {
    for (const harnesses of [NO_HARNESS, holding("codex")]) {
      expect(human(outcome({ plugins: [recommended("missing")], harnesses }))).toContain("Plugins (1)");
    }
  });

  test("it sits between the files and what the harness owes", () => {
    const lines = human(MISSING).split("\n");
    const wrote = lines.findIndex((line) => line.startsWith(`Wrote ${CLAUDE_MD}`));
    const block = lines.findIndex((line) => line.startsWith("Plugins ("));
    const owed = lines.findIndex((line) => line.startsWith("Handoff ("));
    expect(wrote).toBeGreaterThan(-1);
    expect(block).toBeGreaterThan(wrote);
    expect(owed).toBeGreaterThan(block);
  });

  test("JSON carries the name, the marketplace and the status, and no wording", () => {
    const payload = JSON.parse(renderSetupJson(BOTH));
    expect(payload.plugins).toEqual([
      {
        name: "typescript-lsp",
        marketplace: MARKETPLACE,
        status: "installed",
        server: { binary: "typescript-lsp-server", status: "installed" },
      },
      {
        name: "pyright-lsp",
        marketplace: MARKETPLACE,
        status: "missing",
        server: { binary: "pyright-lsp-server", status: "installed" },
      },
    ]);
    for (const noise of ["claude plugin install", "claude plugin enable", "not installed", "✗"]) {
      expect(renderSetupJson(BOTH)).not.toContain(noise);
    }
  });

  test("JSON keeps the list even when every plugin is already answered for", () => {
    const payload = JSON.parse(renderSetupJson(withPlugins(recommended("answered"))));
    expect(payload.plugins).toEqual([
      {
        name: "typescript-lsp",
        marketplace: MARKETPLACE,
        status: "answered",
        server: { binary: "typescript-lsp-server", status: "installed" },
      },
    ]);
  });

  test("a missing language server", () => {
    expect(human(withPlugins(withoutServer("answered")))).toMatchSnapshot();
  });

  test("the server that is not there gets its own line, with the command that installs it", () => {
    const text = human(withPlugins(withoutServer("installed")));
    expect(text).toContain("no typescript-language-server on PATH");
    expect(text).toContain("npm install -g typescript-language-server typescript");
  });

  test("a plugin the file has answered for still speaks up when its server is missing", () => {
    // The quiet failure this block exists for: the settings look complete and
    // the language server never starts.
    const text = human(withPlugins(withoutServer("answered")));
    expect(text).toContain("Plugins (1)");
    expect(text).toContain("! typescript-lsp");
  });

  test("a server that is there says nothing — only the plugin's own line shows", () => {
    const lines = human(withPlugins(recommended("installed"))).split("\n");
    expect(lines.some((line) => line.includes("on PATH"))).toBe(false);
  });

  test("both halves settled is the one case that stays quiet", () => {
    expect(human(withPlugins(recommended("answered")))).not.toContain("Plugins (");
  });

  test("JSON carries the server as a status and a binary, and no install command", () => {
    const payload = JSON.parse(renderSetupJson(withPlugins(withoutServer("installed"))));
    expect(payload.plugins[0].server).toEqual({
      binary: "typescript-language-server",
      status: "missing",
    });
    expect(renderSetupJson(withPlugins(withoutServer("installed")))).not.toContain("npm install");
  });

  test("the server is a copy too, so a consumer cannot reach back into the outcome", () => {
    const source = withPlugins(withoutServer("installed"));
    const parsed = JSON.parse(renderSetupJson(source));
    parsed.plugins[0].server.status = "installed";
    expect(source.plugins[0]!.server.status).toBe("missing");
  });

  test("the recommendations are copies, so a consumer cannot reach back into the outcome", () => {
    const source = MISSING;
    const parsed = JSON.parse(renderSetupJson(source));
    parsed.plugins[0].status = "answered";
    expect(source.plugins[0]!.status).toBe("missing");
  });
});

describe("what to run next", () => {
  test("the commands come last, after what is owed", () => {
    const lines = human(APPLIED).split("\n");
    const owed = lines.findIndex((line) => line.startsWith("Handoff ("));
    const next = lines.findIndex((line) => line.startsWith("Next ("));
    expect(owed).toBeGreaterThan(-1);
    expect(next).toBeGreaterThan(owed);
  });

  test("each command is shown with why it is worth running", () => {
    const text = human(APPLIED);
    expect(text).toContain(`${CLAUDE_COMMAND}  writes the guidance prep does not`);
    // The gap between the two columns is whatever the longest command needs, so
    // the assertion reads the pair rather than the padding a rename would shift.
    expect(text).toMatch(/prep chef +reports what this machine/);
  });

  test("a run with nothing project-side to do still shows the machine step", () => {
    expect(SKIPPED.next.map((step) => step.id)).toEqual(["chef"]);
    expect(human(SKIPPED)).toContain("Next (1)");
  });

  test("the owed line does not carry the command — the block does", () => {
    const text = human(APPLIED);
    expect(text).toContain("2 still owed.");
    expect(text.indexOf(CLAUDE_COMMAND)).toBeGreaterThan(text.indexOf("Next ("));
  });

  test("the other harness rides under the one suggested, not as a step of its own", () => {
    const lines = human(APPLIED).split("\n");
    const suggested = lines.findIndex((line) => line.includes(CLAUDE_COMMAND));
    expect(lines[suggested + 1]).toBe(`    or ${CODEX_COMMAND}`);
    // Two steps are owed here — the harness and the machine check. The
    // alternative is a second way through the first, so it is not counted.
    expect(lines).toContain("Next (2)");
  });

  test("with no harness on the machine the block sends the person to install one", () => {
    const text = human(outcome({ harnesses: NO_HARNESS }));
    expect(text).toMatch(/prep chef +no agent CLI here — install one first/);
    // Nothing to paste at a harness that is not there.
    expect(text).not.toContain(CLAUDE_COMMAND);
    // And the machine check is not then repeated under its own reason.
    expect(text).toContain("Next (1)");
  });

  test("no step points back at prep setup — nothing is left waiting on an answer", () => {
    for (const source of [APPLIED, PLANNED, SKIPPED]) {
      const block = human(source).split("Next (")[1]!;
      expect(block).not.toContain("prep setup");
    }
  });

  test("JSON carries ids and commands, and no wording", () => {
    const payload = JSON.parse(renderSetupJson(APPLIED));
    expect(payload.next).toEqual([
      { id: "harness", command: CLAUDE_COMMAND, alternative: CODEX_COMMAND },
      { id: "chef", command: "prep chef", alternative: null },
    ]);
    for (const noise of ["writes the guidance", "reports what this machine"]) {
      expect(renderSetupJson(APPLIED)).not.toContain(noise);
    }
  });

  test("JSON says so plainly when there is only one way to do the step", () => {
    const payload = JSON.parse(renderSetupJson(outcome({ harnesses: holding("codex") })));
    expect(payload.next[0]).toEqual({
      id: "harness",
      command: CODEX_COMMAND,
      alternative: null,
    });
  });

  test("the steps are copies, so a consumer cannot reach back into the outcome", () => {
    const source = outcome();
    const parsed = JSON.parse(renderSetupJson(source));
    parsed.next[0].command = "rm -rf /";
    expect(source.next[0]!.command).toBe(CLAUDE_COMMAND);
  });
});
