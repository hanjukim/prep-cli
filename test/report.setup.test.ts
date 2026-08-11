import { describe, expect, test } from "bun:test";

import { planMerge } from "../src/merge.ts";
import { all } from "../src/presets.ts";
import { renderMergeSummary, renderSetupHuman } from "../src/report/setup-human.ts";
import { nextSteps } from "../src/next.ts";
import { renderSetupJson } from "../src/report/setup-json.ts";
import { AGENTS_SEED } from "../src/seed.ts";
import type {
  ArtifactStatus,
  ClaudeSettings,
  CodexConfig,
  HandoffResult,
  HarnessPresence,
  LanguageServer,
  MergePlan,
  PluginRecommendation,
  PluginStatus,
  ProjectType,
  SettingsArtifact,
  SetupOutcome,
  WhichFn,
} from "../src/types.ts";

const ROOT = "/project";
const SETTINGS = "/project/.claude/settings.json";
const AGENTS_MD = "/project/AGENTS.md";

const CLAUDE_COMMAND = "claude '/setup-matt-pocock-skills'";
const CODEX_COMMAND = "codex '$setup-matt-pocock-skills'";

/**
 * A machine holding exactly the named binaries.
 *
 * Every fixture goes through one of these rather than the real PATH: what the
 * footer suggests depends on which harnesses are installed, and a fixture that
 * read the machine running the suite would render differently on each one.
 */
function holding(...binaries: readonly string[]): WhichFn {
  return (binary) => (binaries.includes(binary) ? `/usr/local/bin/${binary}` : null);
}

const BOTH_HARNESSES = holding("claude", "codex");
const NO_HARNESS = holding();

/**
 * Both harnesses on the machine.
 *
 * The fixture default, because it is the case the report says nothing about: a
 * run that wrote for everything installed has no hole in its file list to
 * explain. The fixtures that cover the other cases hand in their own rows.
 */
const BOTH_PRESENT: HarnessPresence[] = [
  { id: "claude-code", installed: true, covered: true },
  { id: "codex", installed: true, covered: true },
];

/** The harness rows a run against that machine would have carried. */
function presenceFor(which: WhichFn): HarnessPresence[] {
  const installed = (binary: string) => which(binary) !== null;
  const none = !installed("claude") && !installed("codex");
  return [
    { id: "claude-code", installed: installed("claude"), covered: installed("claude") || none },
    { id: "codex", installed: installed("codex"), covered: installed("codex") },
  ];
}

function settingsWith(allow: string[]): ClaudeSettings {
  return {
    permissions: { defaultMode: "acceptEdits", deny: ["Read(./.env)"], allow, ask: ["WebFetch"] },
  };
}

/** A project the harness has not been pointed at yet. The ordinary starting state. */
const UNTOUCHED: HandoffResult[] = [
  { id: "language", status: "missing", path: null },
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

/** One settings file, as the renderers see it. */
function artifact(
  status: ArtifactStatus,
  allow: string[] | null,
  plan: MergePlan | null = null,
  path: string = SETTINGS,
): SettingsArtifact {
  return {
    kind: "claude-settings",
    path,
    status,
    settings: allow === null ? null : settingsWith(allow),
    plan,
  };
}

/** The settings file in a rendered outcome. */
function settingsFile(source: SetupOutcome): SettingsArtifact {
  return source.artifacts[0] as SettingsArtifact;
}

/** A fixed outcome, so the renderers are checked without going through detection. */
function outcome(
  status: ArtifactStatus,
  detected: ProjectType[],
  allow: string[] | null,
  plan: MergePlan | null = null,
  handoff: HandoffResult[] = UNTOUCHED,
  plugins: PluginRecommendation[] = [],
  which: WhichFn = BOTH_HARNESSES,
): SetupOutcome {
  // The suggestions come from the real rule rather than a literal, so a
  // rendered fixture always shows a combination a run could actually produce.
  const base = {
    root: ROOT,
    detected,
    artifacts: [artifact(status, allow, plan)],
    harnesses: BOTH_PRESENT,
    plugins,
    handoff,
    next: [],
  };
  return { ...base, next: nextSteps({ ...base, harnesses: presenceFor(which) }) };
}

const APPLIED = outcome("applied", ["node"], ["Bash(npm:*)", "Bash(node:*)"]);
const PLANNED = outcome("planned", ["node", "python"], ["Bash(npm:*)", "Bash(uv:*)"]);
const SKIPPED = outcome("skipped", ["python"], null);
const NO_MARKER = outcome("applied", [], []);

const BASELINE = settingsWith(["Edit(./**)", "Bash(npm:*)"]);

/** A merge into a file holding one rule of its own and a mode of its own. */
const CONFLICTING = planMerge(
  { permissions: { defaultMode: "plan", allow: ["Bash(terraform:*)"] }, model: "opus" },
  BASELINE,
);

/** A merge that only adds rules. */
const PURE_ADDITION = planMerge({ permissions: { allow: ["Bash(terraform:*)"] } }, BASELINE);

function merging(plan: MergePlan, status: ArtifactStatus = "planned"): SetupOutcome {
  const base: SetupOutcome = {
    root: ROOT,
    detected: ["node"],
    artifacts: [
      { kind: "claude-settings", path: SETTINGS, status, settings: plan.merged, plan },
    ],
    harnesses: BOTH_PRESENT,
    plugins: [],
    handoff: UNTOUCHED,
    next: [],
  };
  return { ...base, next: nextSteps(base) };
}

function human(input: SetupOutcome): string {
  return renderSetupHuman({ outcome: input, presets: all() });
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

  test("no marker", () => {
    expect(human(NO_MARKER)).toMatchSnapshot();
  });

  test("the reason comes before the rules, so the eye lands on why first", () => {
    const lines = human(APPLIED).split("\n");
    const reason = lines.findIndex((line) => line.startsWith("Wrote "));
    const rules = lines.findIndex((line) => line.startsWith("Allowing"));
    expect(reason).toBeGreaterThan(-1);
    expect(reason).toBeLessThan(rules);
  });

  test("each detected type is shown with the marker that found it", () => {
    expect(human(PLANNED)).toContain("✓ node    package.json");
    expect(human(PLANNED)).toContain("✓ python  pyproject.toml");
  });

  test("with no marker it names what it looked for", () => {
    expect(human(NO_MARKER)).toContain("package.json, pyproject.toml");
  });

  test("each file gets its own section, in the order it was produced", () => {
    const two: SetupOutcome = {
      root: ROOT,
      detected: ["node"],
      artifacts: [
        artifact("applied", ["Bash(npm:*)"]),
        artifact("declined", ["Bash(npm:*)"], null, "/project/.other/settings.json"),
      ],
      harnesses: BOTH_PRESENT,
      plugins: [],
      handoff: UNTOUCHED,
      next: [],
    };
    const lines = human(two).split("\n");
    const first = lines.findIndex((line) => line.startsWith(`Wrote ${SETTINGS}`));
    const second = lines.findIndex((line) => line.startsWith("Left /project/.other"));
    expect(first).toBeGreaterThan(-1);
    expect(second).toBeGreaterThan(first);
    // The handoff still closes the report, however many files came before it.
    expect(lines.findIndex((line) => line.startsWith("Handoff ("))).toBeGreaterThan(second);
  });
});

describe("the merge diff", () => {
  test("a merge that only adds rules", () => {
    expect(human(merging(PURE_ADDITION))).toMatchSnapshot();
  });

  test("a merge with a value to decide", () => {
    expect(human(merging(CONFLICTING))).toMatchSnapshot();
  });

  test("merged", () => {
    expect(human(merging(PURE_ADDITION, "merged"))).toMatchSnapshot();
  });

  test("declined", () => {
    expect(human(merging(PURE_ADDITION, "declined"))).toMatchSnapshot();
  });

  test("rules the merge adds are marked, and the ones already there are not", () => {
    const lines = human(merging(PURE_ADDITION)).split("\n");
    expect(lines).toContain("  + Bash(npm:*)");
    expect(lines).toContain("    Bash(terraform:*)");
  });

  test("it says nothing has been written yet", () => {
    expect(human(merging(PURE_ADDITION))).toContain("Nothing has been written yet");
  });

  test("a conflict shows both sides, and neither is chosen for the person", () => {
    const text = human(merging(CONFLICTING));
    expect(text).toContain("To decide (1)");
    expect(text).toContain("yours: plan");
    expect(text).toContain("preset: acceptEdits");
  });

  test("a declined run shows no rules, so nothing reads as though it changed", () => {
    const text = human(merging(PURE_ADDITION, "declined"));
    expect(text).toContain("exactly as it was");
    expect(text).not.toContain("Bash(npm:*)");
  });

  test("the summary before writing names the file and counts what lands", () => {
    const text = renderMergeSummary(SETTINGS, PURE_ADDITION.merged);
    expect(text).toContain(SETTINGS);
    expect(text).toContain("acceptEdits");
    expect(text).toContain("3 rules");
    expect(text).toMatchSnapshot();
  });
});

describe("what the harness still owes", () => {
  const settled = outcome("applied", ["node"], ["Bash(npm:*)"], null, SETTLED);
  const halfway = outcome("applied", ["node"], ["Bash(npm:*)"], null, HALFWAY);

  test("everything settled", () => {
    expect(human(settled)).toMatchSnapshot();
  });

  test("started and stopped halfway", () => {
    expect(human(halfway)).toMatchSnapshot();
  });

  test("an untouched project is told what to run", () => {
    const text = human(APPLIED);
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
    expect(human(halfway)).toContain("\u2713 language       AGENTS.md");
  });

  test("it is shown even on a run that wrote nothing", () => {
    expect(human(merging(PURE_ADDITION, "declined"))).toContain("Handoff (3)");
  });

  test("it comes last, after the rules", () => {
    const lines = human(APPLIED).split("\n");
    const rules = lines.findIndex((line) => line.startsWith("Allowing"));
    const owed = lines.findIndex((line) => line.startsWith("Handoff ("));
    expect(rules).toBeGreaterThan(-1);
    expect(owed).toBeGreaterThan(rules);
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
        {
          kind: "claude-settings",
          path: SETTINGS,
          status: "planned",
          settings: {
            permissions: {
              defaultMode: "acceptEdits",
              deny: ["Read(./.env)"],
              allow: ["Bash(npm:*)", "Bash(uv:*)"],
              ask: ["WebFetch"],
            },
          },
          merge: null,
        },
      ],
      harnesses: BOTH_PRESENT,
      plugins: [],
      handoff: UNTOUCHED,
      next: [
        { id: "harness", command: CLAUDE_COMMAND, alternative: CODEX_COMMAND },
        { id: "chef", command: "prep chef", alternative: null },
      ],
    });
  });

  test("every file is an element, so a consumer walks one list whatever prep produced", () => {
    const two: SetupOutcome = {
      root: ROOT,
      detected: ["node"],
      artifacts: [
        artifact("applied", ["Bash(npm:*)"]),
        artifact("declined", ["Bash(npm:*)"], null, "/project/.other/settings.json"),
      ],
      harnesses: BOTH_PRESENT,
      plugins: [],
      handoff: UNTOUCHED,
      next: [],
    };
    const payload = JSON.parse(renderSetupJson(two));
    expect(payload.artifacts.map((one: { path: string }) => one.path)).toEqual([
      SETTINGS,
      "/project/.other/settings.json",
    ]);
    expect(payload.artifacts.map((one: { status: string }) => one.status)).toEqual([
      "applied",
      "declined",
    ]);
  });

  test("a merge carries the existing file, what it adds, and what is left to decide", () => {
    const payload = JSON.parse(renderSetupJson(merging(CONFLICTING)));
    expect(payload.artifacts[0].merge.existing).toEqual({
      permissions: { defaultMode: "plan", allow: ["Bash(terraform:*)"] },
      model: "opus",
    });
    expect(payload.artifacts[0].merge.added.allow).toEqual(["Edit(./**)", "Bash(npm:*)"]);
    expect(payload.artifacts[0].merge.conflicts).toEqual([
      { key: "defaultMode", existing: "plan", preset: "acceptEdits" },
    ]);
  });

  test("keys prep does not know survive into the reported settings", () => {
    const payload = JSON.parse(renderSetupJson(merging(CONFLICTING)));
    expect(payload.artifacts[0].settings.model).toBe("opus");
  });

  test("the merge report is a copy, so a consumer cannot reach back into the plan", () => {
    const source = merging(CONFLICTING);
    const payload = JSON.parse(renderSetupJson(source));
    payload.artifacts[0].merge.existing.permissions.allow.push("Bash(rm -rf:*)");
    payload.artifacts[0].merge.conflicts[0].existing = "bypassPermissions";
    expect(settingsFile(source).plan!.existing).toEqual({
      permissions: { defaultMode: "plan", allow: ["Bash(terraform:*)"] },
      model: "opus",
    });
    expect(settingsFile(source).plan!.conflicts[0]!.existing).toBe("plan");
  });

  test("no human symbols or wording leak in", () => {
    for (const noise of ["✓", "–", "prep setup ·", "Detected", "Allowing", "Wrote"]) {
      expect(renderSetupJson(APPLIED)).not.toContain(noise);
    }
  });

  test("the handoff results are copies too", () => {
    const source = outcome("applied", ["node"], ["Bash(npm:*)"], null, SETTLED);
    const parsed = JSON.parse(renderSetupJson(source));
    parsed.handoff[0].status = "missing";
    expect(source.handoff[0]!.status).toBe("ready");
  });

  test("the arrays are copies, so a consumer cannot reach back into the outcome", () => {
    const source = outcome("applied", ["node"], ["Bash(npm:*)"]);
    const parsed = JSON.parse(renderSetupJson(source));
    parsed.artifacts[0].settings.permissions.allow.push("Bash(rm -rf:*)");
    expect(settingsFile(source).settings!.permissions.allow).toEqual(["Bash(npm:*)"]);
  });
});

describe("the guidance file", () => {
  /** What a seeded project's language item reads as: the file is there, the section is not. */
  const JUST_SEEDED: HandoffResult[] = [
    { id: "language", status: "empty", path: "AGENTS.md" },
    { id: "issue-tracker", status: "missing", path: null },
    { id: "domain-docs", status: "missing", path: null },
  ];

  /** A run that produced both files: the settings block, then the seed. */
  function withSeed(
    status: ArtifactStatus,
    path = AGENTS_MD,
    handoff = status === "applied" ? JUST_SEEDED : UNTOUCHED,
  ): SetupOutcome {
    const base: SetupOutcome = {
      root: ROOT,
      detected: ["node"],
      artifacts: [
        artifact("applied", ["Bash(npm:*)"]),
        { kind: "agents-md", path, status, contents: status === "skipped" ? null : AGENTS_SEED },
      ],
      harnesses: BOTH_PRESENT,
      plugins: [],
      handoff,
      next: [],
    };
    return { ...base, next: nextSteps(base) };
  }

  test("written", () => {
    expect(human(withSeed("applied"))).toMatchSnapshot();
  });

  test("planned", () => {
    expect(human(withSeed("planned"))).toMatchSnapshot();
  });

  test("already there", () => {
    expect(human(withSeed("skipped", "/project/CLAUDE.md"))).toMatchSnapshot();
  });

  test("its section holds a sentence and no rule list", () => {
    const lines = human(withSeed("applied")).split("\n");
    const seeded = lines.findIndex((line) => line.includes(AGENTS_MD));
    expect(seeded).toBeGreaterThan(-1);
    // Everything after it is the handoff block. No permission heading rides along.
    for (const line of lines.slice(seeded)) expect(line).not.toMatch(/^(Allowing|Denying|Asking)/);
  });

  test("a skipped seed names the file that already stands there", () => {
    expect(human(withSeed("skipped", "/project/CLAUDE.md"))).toContain("/project/CLAUDE.md is already there");
  });

  test("JSON carries the contents and no settings fields", () => {
    const payload = JSON.parse(renderSetupJson(withSeed("applied")));
    expect(payload.artifacts[1]).toEqual({
      kind: "agents-md",
      path: AGENTS_MD,
      status: "applied",
      contents: AGENTS_SEED,
    });
  });

  test("a skipped seed carries no contents", () => {
    const payload = JSON.parse(renderSetupJson(withSeed("skipped")));
    expect(payload.artifacts[1].contents).toBeNull();
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
    return outcome("applied", ["node"], ["Bash(npm:*)"], null, UNTOUCHED, plugins);
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

  test("a plugin already on the machine says prep is the one turning it on", () => {
    const text = human(INSTALLED);
    expect(text).toContain("prep turns it on here");
    expect(text).not.toContain("claude plugin install");
  });

  test("each status reads differently, so two of them never blur together", () => {
    const text = human(BOTH);
    expect(text).toContain("+ typescript-lsp  installed on this machine");
    expect(text).toContain("✗ pyright-lsp     not installed");
  });

  test("with every plugin already answered for, the block is gone", () => {
    const text = human(withPlugins(recommended("answered")));
    expect(text).not.toContain("Plugins (");
  });

  test("a project with no recognised type is recommended nothing, and shown nothing", () => {
    expect(human(outcome("applied", [], []))).not.toContain("Plugins (");
  });

  test("it sits between the files and what the harness owes", () => {
    const lines = human(MISSING).split("\n");
    const wrote = lines.findIndex((line) => line.startsWith("Wrote "));
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
    for (const noise of ["claude plugin install", "prep turns it on", "not installed", "✗"]) {
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

describe("turning an installed plugin on", () => {
  const TYPESCRIPT = "typescript-lsp@claude-plugins-official";
  const PYRIGHT = "pyright-lsp@claude-plugins-official";

  /** The baseline as it stands once a plugin has been folded into it. */
  const ENABLING: ClaudeSettings = {
    ...settingsWith(["Bash(npm:*)"]),
    enabledPlugins: { [TYPESCRIPT]: true },
  };

  function enablingOutcome(plan: MergePlan | null, status: ArtifactStatus = "applied"): SetupOutcome {
    const settings = plan === null ? ENABLING : plan.merged;
    const base: SetupOutcome = {
      root: ROOT,
      detected: ["node"],
      artifacts: [{ kind: "claude-settings", path: SETTINGS, status, settings, plan }],
      harnesses: BOTH_PRESENT,
      plugins: [
        {
          name: "typescript-lsp",
          marketplace: "claude-plugins-official",
          status: "installed",
          server: { binary: "typescript-language-server", status: "installed" },
        },
      ],
      handoff: UNTOUCHED,
      next: [],
    };
    return { ...base, next: nextSteps(base) };
  }

  test("written into a fresh file", () => {
    expect(human(enablingOutcome(null))).toMatchSnapshot();
  });

  test("added to a file that already lists another", () => {
    const plan = planMerge({ enabledPlugins: { [PYRIGHT]: true } }, ENABLING);
    expect(human(enablingOutcome(plan, "planned"))).toMatchSnapshot();
  });

  test("the entry is listed under its own heading, beside the rules", () => {
    const text = human(enablingOutcome(null));
    expect(text).toContain("Enabling (1)");
    expect(text).toContain(TYPESCRIPT);
  });

  test("a merge marks the entry it adds and leaves the one already there unmarked", () => {
    const plan = planMerge({ enabledPlugins: { [PYRIGHT]: true } }, ENABLING);
    const lines = human(enablingOutcome(plan, "planned")).split("\n");
    expect(lines).toContain(`  + ${TYPESCRIPT}`);
    expect(lines).toContain(`    ${PYRIGHT}`);
  });

  test("an entry somebody switched off is shown as switched off, not quietly dropped", () => {
    const plan = planMerge({ enabledPlugins: { [PYRIGHT]: false } }, ENABLING);
    expect(human(enablingOutcome(plan, "planned"))).toContain(`${PYRIGHT} (off)`);
  });

  test("a file with nothing to turn on grows no heading", () => {
    expect(human(APPLIED)).not.toContain("Enabling (");
  });

  test("the one-line summary says a plugin is being turned on, not only how many rules land", () => {
    const plan = planMerge({ enabledPlugins: { [PYRIGHT]: true } }, ENABLING);
    expect(human(enablingOutcome(plan, "planned"))).toContain("adds 3 rules and turns on 1 plugin");
  });

  test("the summary before writing counts every plugin the file will hold, not only the new one", () => {
    const plan = planMerge({ enabledPlugins: { [PYRIGHT]: true } }, ENABLING);
    const text = renderMergeSummary(SETTINGS, plan.merged);
    expect(text).toContain("Enabling       2 plugins");
    expect(text).toMatchSnapshot();
  });

  test("a merge that turns nothing on shows no plugin line", () => {
    expect(renderMergeSummary(SETTINGS, PURE_ADDITION.merged)).not.toContain("Enabling");
  });

  test("JSON reports the entries the merge adds", () => {
    const plan = planMerge({ enabledPlugins: { [PYRIGHT]: true } }, ENABLING);
    const payload = JSON.parse(renderSetupJson(enablingOutcome(plan, "planned")));
    expect(payload.artifacts[0].merge.addedPlugins).toEqual([TYPESCRIPT]);
    expect(payload.artifacts[0].settings.enabledPlugins).toEqual({
      [PYRIGHT]: true,
      [TYPESCRIPT]: true,
    });
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
    const settled = outcome("skipped", ["node"], null, null, SETTLED);
    expect(settled.next.map((step) => step.id)).toEqual(["chef"]);
    expect(human(settled)).toContain("Next (1)");
  });

  test("the owed line no longer carries the command — the block does", () => {
    const text = human(APPLIED);
    expect(text).toContain("3 still owed.");
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
    const text = human(outcome("applied", ["node"], ["Bash(npm:*)"], null, UNTOUCHED, [], NO_HARNESS));
    expect(text).toMatch(/prep chef +no agent CLI here — install one first/);
    // Nothing to paste at a harness that is not there.
    expect(text).not.toContain(CLAUDE_COMMAND);
    // And the machine check is not then repeated under its own reason.
    expect(text).toContain("Next (1)");
  });

  test("a merge nobody could answer points back at the same run", () => {
    expect(human(merging(PURE_ADDITION))).toContain(`prep setup ${ROOT}`);
  });

  test("JSON carries ids and commands, and no wording", () => {
    const payload = JSON.parse(renderSetupJson(APPLIED));
    expect(payload.next).toEqual([
      { id: "harness", command: CLAUDE_COMMAND, alternative: CODEX_COMMAND },
      { id: "chef", command: "prep chef", alternative: null },
    ]);
    for (const noise of ["writes the guidance", "checks this machine"]) {
      expect(renderSetupJson(APPLIED)).not.toContain(noise);
    }
  });

  test("JSON says so plainly when there is only one way to do the step", () => {
    const source = outcome("applied", ["node"], ["Bash(npm:*)"], null, UNTOUCHED, [], holding("codex"));
    const payload = JSON.parse(renderSetupJson(source));
    expect(payload.next[0]).toEqual({
      id: "harness",
      command: CODEX_COMMAND,
      alternative: null,
    });
  });

  test("the steps are copies, so a consumer cannot reach back into the outcome", () => {
    const source = outcome("applied", ["node"], ["Bash(npm:*)"]);
    const parsed = JSON.parse(renderSetupJson(source));
    parsed.next[0].command = "rm -rf /";
    expect(source.next[0]!.command).toBe(CLAUDE_COMMAND);
  });
});

describe("the Codex permission file", () => {
  const CODEX_CONFIG = "/project/.codex/config.toml";

  const PROFILE: CodexConfig = {
    profile: "project-edit",
    extends: ":workspace",
    approvalPolicy: "on-request",
    workspace: [".env", "**/*.pem"],
    outside: ["~/.ssh"],
  };

  /** A run that wrote for both harnesses: the Claude file, then the Codex one. */
  function withCodex(status: ArtifactStatus, sandboxMode = false): SetupOutcome {
    const base: SetupOutcome = {
      root: ROOT,
      detected: ["node"],
      artifacts: [
        artifact("applied", ["Bash(npm:*)"]),
        {
          kind: "codex-config",
          path: CODEX_CONFIG,
          status,
          config: status === "skipped" ? null : PROFILE,
          sandboxMode,
        },
      ],
      harnesses: BOTH_PRESENT,
      plugins: [],
      handoff: UNTOUCHED,
      next: [],
    };
    return { ...base, next: nextSteps(base) };
  }

  test("written", () => {
    expect(human(withCodex("applied"))).toMatchSnapshot();
  });

  test("already there, with a sandbox mode in it", () => {
    expect(human(withCodex("skipped", true))).toMatchSnapshot();
  });

  test("every denied path is shown, whichever side of the project it is on", () => {
    const text = human(withCodex("applied"));
    expect(text).toContain("Denying (3)");
    expect(text).toContain("**/*.pem");
    expect(text).toContain("~/.ssh");
  });

  test("the profile it starts from is named, the way the Claude file names its mode", () => {
    expect(human(withCodex("applied"))).toContain(":workspace, approval on-request");
  });

  test("an existing file is reported as left alone, and none of its paths is listed", () => {
    const text = human(withCodex("skipped"));
    expect(text).toContain("does not merge TOML");
    // The paths prep would have written say nothing about a file it did not write.
    expect(text).not.toContain("~/.ssh");
    expect(text).not.toContain(":workspace");
  });

  test("a sandbox mode is called out, because it turns the whole profile off", () => {
    expect(human(withCodex("skipped", true))).toContain("sandbox_mode");
  });

  test("a file prep wrote itself says nothing about sandbox modes", () => {
    expect(human(withCodex("applied"))).not.toContain("sandbox_mode");
  });

  test("JSON carries the profile and the sandbox fact, and no sentence", () => {
    const payload = JSON.parse(renderSetupJson(withCodex("applied")));
    expect(payload.artifacts[1]).toEqual({
      kind: "codex-config",
      path: CODEX_CONFIG,
      status: "applied",
      config: PROFILE,
      sandboxMode: false,
    });
  });

  test("the profile is a copy, so a consumer cannot reach back into the outcome", () => {
    const source = withCodex("applied");
    const payload = JSON.parse(renderSetupJson(source));
    payload.artifacts[1].config.workspace.push("secrets");
    expect(PROFILE.workspace).toEqual([".env", "**/*.pem"]);
  });
});

describe("the file that points Claude Code at the guidance", () => {
  const POINTER = "/project/CLAUDE.md";

  function withPointer(status: ArtifactStatus): SetupOutcome {
    const base: SetupOutcome = {
      root: ROOT,
      detected: ["node"],
      artifacts: [
        artifact("applied", ["Bash(npm:*)"]),
        { kind: "agents-md", path: AGENTS_MD, status: "applied", contents: AGENTS_SEED },
        { kind: "claude-md", path: POINTER, status, contents: status === "skipped" ? null : "@AGENTS.md\n" },
      ],
      harnesses: BOTH_PRESENT,
      plugins: [],
      handoff: UNTOUCHED,
      next: [],
    };
    return { ...base, next: nextSteps(base) };
  }

  test("written", () => {
    expect(human(withPointer("applied"))).toMatchSnapshot();
  });

  test("it says what the file is for, so one import line is not a mystery", () => {
    expect(human(withPointer("applied"))).toContain("so Claude Code reads the guidance in AGENTS.md");
  });

  test("an existing CLAUDE.md is reported as left alone", () => {
    expect(human(withPointer("skipped"))).toContain(`${POINTER} is already there`);
  });

  test("it comes after the file it points at", () => {
    const lines = human(withPointer("applied")).split("\n");
    expect(lines.findIndex((line) => line.includes(POINTER))).toBeGreaterThan(
      lines.findIndex((line) => line.includes(AGENTS_MD)),
    );
  });

  test("JSON tells the two files apart by kind, not by path", () => {
    const payload = JSON.parse(renderSetupJson(withPointer("applied")));
    expect(payload.artifacts.map((one: { kind: string }) => one.kind)).toEqual([
      "claude-settings",
      "agents-md",
      "claude-md",
    ]);
  });
});

describe("which harness the run wrote for", () => {
  function withHarnesses(rows: HarnessPresence[]): SetupOutcome {
    const base: SetupOutcome = {
      root: ROOT,
      detected: ["node"],
      artifacts: [artifact("applied", ["Bash(npm:*)"])],
      harnesses: rows,
      plugins: [],
      handoff: UNTOUCHED,
      next: [],
    };
    return { ...base, next: nextSteps(base) };
  }

  const CLAUDE_ONLY: HarnessPresence[] = [
    { id: "claude-code", installed: true, covered: true },
    { id: "codex", installed: false, covered: false },
  ];

  const NEITHER: HarnessPresence[] = [
    { id: "claude-code", installed: false, covered: true },
    { id: "codex", installed: false, covered: false },
  ];

  test("one harness missing", () => {
    expect(human(withHarnesses(CLAUDE_ONLY))).toMatchSnapshot();
  });

  test("no harness at all", () => {
    expect(human(withHarnesses(NEITHER))).toMatchSnapshot();
  });

  test("with both installed the block is left out — the file list is the whole answer", () => {
    expect(human(APPLIED)).not.toContain("Harnesses (");
  });

  test("a harness that is not here is told apart from one whose files were skipped", () => {
    const text = human(withHarnesses(CLAUDE_ONLY));
    expect(text).toContain("✗ codex");
    expect(text).toContain("its files are left out");
  });

  test("a fallback run says the files were written for a harness that is not here", () => {
    expect(human(withHarnesses(NEITHER))).toContain("written for anyway");
  });

  test("JSON carries the rows as facts, with no wording", () => {
    const payload = JSON.parse(renderSetupJson(withHarnesses(CLAUDE_ONLY)));
    expect(payload.harnesses).toEqual(CLAUDE_ONLY);
  });

  test("the rows are copies, so a consumer cannot reach back into the outcome", () => {
    const source = withHarnesses(CLAUDE_ONLY);
    const payload = JSON.parse(renderSetupJson(source));
    payload.harnesses[0].installed = false;
    expect(source.harnesses[0]!.installed).toBe(true);
  });
});
