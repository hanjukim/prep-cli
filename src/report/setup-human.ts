import { addedCount } from "../merge.ts";
import { installCommand, serverInstallCommand } from "../plugins.ts";
import type {
  Artifact,
  CodexArtifact,
  GuidanceArtifact,
  HandoffItemId,
  HandoffResult,
  HarnessPresence,
  MergePlan,
  NextStep,
  NextStepId,
  PluginRecommendation,
  PluginRef,
  PluginStatus,
  Preset,
  RuleSection,
  SettingsArtifact,
  SetupOutcome,
  SettingsDocument,
} from "../types.ts";
import { INDENT, join, pad, widest } from "./layout.ts";

export type SetupHumanReportInput = {
  outcome: SetupOutcome;
  /** The table detection ran against. Marker names for the report live here, not on the outcome. */
  presets: readonly Preset[];
};

const SECTIONS: readonly (readonly [string, RuleSection])[] = [
  // Denied first: it is the section that holds whatever the rest allows.
  ["Denying", "deny"],
  ["Allowing", "allow"],
  ["Asking", "ask"],
];

/** Marks a rule the merge adds. Kept rules sit under a blank column, so the new ones stand out on their own. */
const ADDED = "+ ";
const KEPT = "  ";

function count(rules: readonly string[]): string {
  return `${rules.length} rule${rules.length === 1 ? "" : "s"}`;
}

/** The one sentence that says what happened to one file and why. Every artifact, every status, ends on one. */
function reason(artifact: Artifact, detected: readonly string[]): string {
  switch (artifact.kind) {
    case "claude-settings":
      return settingsReason(artifact, detected);
    case "codex-config":
      return codexReason(artifact);
    default:
      return guidanceReason(artifact);
  }
}

/**
 * What each file of prose is for, in the one sentence its section opens on.
 *
 * The two differ in what a person does next, which is the whole reason both
 * exist: the seed is where the harness's guidance still goes, and the pointer
 * is waiting for nothing at all.
 */
const GUIDANCE: Record<GuidanceArtifact["kind"], { wrote: string; already: string }> = {
  "agents-md": {
    // What the harness still owes the file is the handoff footer's line to say.
    // Saying it here too would put the same instruction on the screen twice.
    wrote: "the language rule, in the file the harness writes the rest into",
    already: "prep leaves a guidance file that exists alone",
  },
  "claude-md": {
    wrote: "one import line, so Claude Code reads the guidance in AGENTS.md",
    already: "prep leaves an instruction file that exists alone, whatever it says",
  },
};

/** What happened to a file of prose. Either it is written whole, or it is left alone. */
function guidanceReason(artifact: GuidanceArtifact): string {
  const wording = GUIDANCE[artifact.kind];

  switch (artifact.status) {
    case "applied":
      return `Wrote ${artifact.path} — ${wording.wrote}.`;
    case "planned":
      return `Dry run. Nothing was written to ${artifact.path}. It would be ${wording.wrote}.`;
    default:
      return `${artifact.path} is already there — ${wording.already}.`;
  }
}

/** What happened to the Codex permission file. Written where none stood, never merged into (ADR-0007). */
function codexReason(artifact: CodexArtifact): string {
  switch (artifact.status) {
    case "applied":
      return `Wrote ${artifact.path} — the same baseline, in the form Codex reads.`;
    case "planned":
      return `Dry run. Nothing was written to ${artifact.path}. It would hold the same baseline, in the form Codex reads.`;
    default:
      return `${artifact.path} is already there — prep does not merge TOML, so it was left exactly as it was.`;
  }
}

/**
 * The profile, and every path it closes.
 *
 * Shown for the same reason the permission rules are shown: this is the file's
 * whole content, and a security baseline nobody reads back is a baseline nobody
 * checked. The two lists are printed as one, since a person reading them is
 * asking what is closed, not which table it sits in.
 */
function codexRules(lines: string[], artifact: CodexArtifact): void {
  const config = artifact.config;
  if (config === null) return;

  lines.push("", "Starting mode", INDENT + `${config.extends}, approval ${config.approvalPolicy}`);

  const denied = [...config.workspace, ...config.outside];
  if (denied.length === 0) return;

  lines.push("", `Denying (${denied.length})`);
  for (const path of denied) lines.push(INDENT + path);
}

/**
 * The one thing that can make this file a lie.
 *
 * A `sandbox_mode` in the config sends Codex back to its older sandbox and the
 * permission profile is never read. Somebody who saw prep report a Codex file
 * and nothing else would believe the paths are closed when none of them is.
 */
function sandbox(lines: string[], artifact: CodexArtifact): void {
  if (!artifact.sandboxMode) return;

  lines.push(
    INDENT +
      "! it sets sandbox_mode — Codex reads that instead of any permission profile, so nothing here is closed by prep.",
  );
}

function settingsReason(artifact: SettingsArtifact, detected: readonly string[]): string {
  // With no type recognised, only the shared half went in — say which half, so
  // an empty Detected section does not read as a failure.
  const scope = detected.length === 0 ? " Only the type-independent rules went in." : "";

  switch (artifact.status) {
    case "applied":
      return `Wrote ${artifact.path} — edit it yourself for anything the preset does not cover.${scope}`;
    case "planned":
      if (artifact.plan === null) {
        return `Dry run. Nothing was written to ${artifact.path}. It would hold:${scope}`;
      }
      return plannedMergeReason(artifact.path, artifact.plan);
    case "merged":
      return `Merged into ${artifact.path}. Everything that was already there was kept.`;
    case "declined":
      return `Left ${artifact.path} exactly as it was. Nothing was written.`;
    case "skipped":
      return `${artifact.path} already covers this baseline — nothing to add.`;
  }
}

/** What a merge would do, before anybody has approved it. */
function plannedMergeReason(settingsPath: string, plan: MergePlan): string {
  const added = addedCount(plan);
  const parts = [added > 0 ? `adds ${added} rule${added === 1 ? "" : "s"}` : ""];

  // Named in the same sentence as the rules, because it is the same write. A
  // plugin entry that only showed up further down would land on a file whose
  // one-line summary said nothing about it.
  if (plan.addedPlugins.length > 0) {
    const count = plan.addedPlugins.length;
    parts.push(`turns on ${count} plugin${count === 1 ? "" : "s"}`);
  }

  if (plan.conflicts.length > 0) {
    parts.push(`leaves ${plan.conflicts.length} value${plan.conflicts.length === 1 ? "" : "s"} to decide`);
  }

  const what = parts.filter(Boolean).join(" and ");

  return `${settingsPath} already exists. Merging ${what}. Nothing has been written yet.`;
}

/**
 * The permission block, with every rule the merge would add marked.
 *
 * The marker column only appears for a merge. A fresh write has nothing to
 * compare against, so every rule there is new and a column of markers would say
 * nothing.
 */
function rules(lines: string[], settings: SettingsDocument, plan: MergePlan | null): void {
  const permissions = settings.permissions;
  const mark = (section: RuleSection, rule: string) => {
    if (plan === null) return "";
    return plan.added[section].includes(rule) ? ADDED : KEPT;
  };

  lines.push("", "Starting mode", INDENT + (plan === null ? "" : KEPT) + permissions.defaultMode);

  for (const [title, section] of SECTIONS) {
    const held = permissions[section];
    if (held.length === 0) continue;

    const added = plan?.added[section] ?? [];
    const heading =
      added.length > 0 ? `${title} (${held.length} · +${added.length})` : `${title} (${held.length})`;

    lines.push("", heading);
    for (const rule of held) lines.push(INDENT + mark(section, rule) + rule);
  }
}

/** The file's plugin block, as prep reads it back off a document it does not own every key of. */
function enabledPlugins(settings: SettingsDocument): Record<string, unknown> {
  const enabled = settings.enabledPlugins;
  return typeof enabled === "object" && enabled !== null && !Array.isArray(enabled)
    ? (enabled as Record<string, unknown>)
    : {};
}

/**
 * The plugins the file turns on, with the ones this merge adds marked.
 *
 * Shown inside the settings section rather than beside the recommendations,
 * because this is a change to a file: it belongs in the diff a person approves,
 * next to the rules that land in the same write.
 *
 * An entry standing at `false` is shown as it stands. It is somebody having
 * switched a plugin off, and a diff that quietly left it out would be a diff of
 * something other than the file.
 */
function enabling(lines: string[], settings: SettingsDocument, plan: MergePlan | null): void {
  const entries = Object.entries(enabledPlugins(settings));
  if (entries.length === 0) return;

  const added = plan?.addedPlugins ?? [];
  const heading =
    added.length > 0 ? `Enabling (${entries.length} · +${added.length})` : `Enabling (${entries.length})`;

  lines.push("", heading);
  for (const [id, value] of entries) {
    const mark = plan === null ? "" : added.includes(id) ? ADDED : KEPT;
    lines.push(INDENT + mark + id + (value === true ? "" : " (off)"));
  }
}

/** The values a merge cannot settle on its own. Shown apart, because each one is a question. */
function conflicts(lines: string[], plan: MergePlan): void {
  if (plan.conflicts.length === 0) return;

  const width = widest(plan.conflicts.map((conflict) => conflict.key));

  lines.push("", `To decide (${plan.conflicts.length})`);
  for (const conflict of plan.conflicts) {
    lines.push(
      INDENT + join(`! ${pad(conflict.key, width)}`, `yours: ${conflict.existing}`, `preset: ${conflict.preset}`),
    );
  }
}

/**
 * How each owed item is worded. The check reports a status and a path; the
 * sentence that goes with them lives here, so no wording reaches the outcome
 * and none of it can leak into the JSON contract.
 */
const HANDOFF: Record<
  HandoffItemId,
  { title: string; missing: string; empty: (path: string) => string }
> = {
  language: {
    title: "language",
    missing: "no AGENTS.md and no CLAUDE.md",
    empty: (path) => `${path} has no Language section`,
  },
  "issue-tracker": {
    title: "issue tracker",
    missing: "no docs/agents/issue-tracker.md",
    empty: (path) => `${path} names no tracker`,
  },
  "domain-docs": {
    title: "domain docs",
    missing: "no docs/agents/domain.md",
    empty: (path) => `${path} is empty`,
  },
};

/** What one item's line says on the right. A path when it is settled, what is wrong when it is not. */
function owedNote(result: HandoffResult): string {
  const wording = HANDOFF[result.id];
  if (result.path === null) return wording.missing;
  return result.status === "ready" ? result.path : wording.empty(result.path);
}

/**
 * What the harness still owes.
 *
 * Shown on every run, whatever prep did with the settings file: the two are
 * unrelated, and a run that wrote nothing is exactly when a person most needs
 * to be told what is left.
 */
function handoff(lines: string[], results: readonly HandoffResult[]): void {
  if (results.length === 0) return;

  const width = widest(results.map((result) => HANDOFF[result.id].title));

  lines.push("", `Handoff (${results.length})`);
  for (const result of results) {
    const mark = result.status === "ready" ? "✓" : "✗";
    lines.push(INDENT + join(`${mark} ${pad(HANDOFF[result.id].title, width)}`, owedNote(result)));
  }

  const owed = results.filter((result) => result.status !== "ready").length;
  // What to run about it, and who writes it, are the Next block's lines to say.
  // Here it is only how much is left.
  lines.push(
    "",
    owed === 0 ? "Nothing owed. The harness side is already set up." : `${owed} still owed.`,
  );
}

/**
 * How each suggested step is worded, and nothing about which ones appear.
 *
 * The same split the handoff wording keeps: the outcome carries ids and
 * commands, this carries the sentences, and no wording can reach the JSON.
 */
const NEXT: Record<NextStepId, string> = {
  approve: "in a terminal — see the merge and answer it",
  harness: "writes the guidance prep does not",
  "install-harness": "no agent CLI here — install one first, then come back",
  doctor: "checks this machine for the standard tools",
};

/**
 * What to run next.
 *
 * Commands, shown and never run — the same level of intervention doctor holds
 * to. The block is left out entirely when the run left nothing to do, so its
 * presence means something rather than being furniture.
 *
 * An alternative goes on its own line under the command it stands beside. It is
 * a second way to do the one step, not a second step, so it is left out of the
 * count and out of the column the reasons line up in.
 */
function next(lines: string[], steps: readonly NextStep[]): void {
  if (steps.length === 0) return;

  const width = widest(steps.map((step) => step.command));

  lines.push("", `Next (${steps.length})`);
  for (const step of steps) {
    lines.push(INDENT + join(pad(step.command, width), NEXT[step.id]));
    if (step.alternative !== null) lines.push(INDENT + INDENT + `or ${step.alternative}`);
  }
}

/**
 * One file's own section: why prep acted or did not, then what it wrote.
 *
 * Every artifact gets the same shape, so a run producing one reads exactly as a
 * run producing four, only shorter.
 */
function artifactSection(lines: string[], artifact: Artifact, detected: readonly string[]): void {
  lines.push("", reason(artifact, detected));

  if (artifact.kind === "codex-config") {
    sandbox(lines, artifact);
    codexRules(lines, artifact);
    return;
  }

  // A file of prose has nothing to list under its sentence. It is a shape with
  // no decisions in it, and printing headings back would say nothing the
  // sentence has not.
  if (artifact.kind !== "claude-settings") return;

  // A declined artifact shows no rules on purpose: nothing changed, so a list of
  // them would only read as though something had.
  if (artifact.settings && artifact.status !== "declined") {
    rules(lines, artifact.settings, artifact.plan);
    enabling(lines, artifact.settings, artifact.plan);
    if (artifact.plan) conflicts(lines, artifact.plan);
  }
}

/**
 * How each recommendation is worded, and who acts on it.
 *
 * The whole boundary is in these three lines: a plugin the machine does not hold
 * is a person's to install, one it holds is prep's to turn on, and one the
 * settings file already names is nobody's — it has been answered.
 *
 * None of them says anything about the language server the plugin points at.
 * That is a second, independent half, and it gets its own line where it is
 * missing rather than being folded into a sentence about the plugin.
 */
const PLUGIN: Record<PluginStatus, { mark: string; note: (plugin: PluginRef) => string }> = {
  missing: { mark: "✗", note: (plugin) => `not installed — ${installCommand(plugin)}` },
  installed: { mark: "+", note: () => "installed on this machine — prep turns it on here" },
  answered: { mark: "✓", note: () => "already in this project's settings" },
};

/**
 * The language servers this project's types call for.
 *
 * Left out entirely when every one is already answered for, so the block
 * appearing means there is something to do. A project whose plugins are all in
 * place reads the same on the second run as a project that never needed any.
 */
function plugins(lines: string[], recommendations: readonly PluginRecommendation[]): void {
  // Quiet only when there is nothing to do on either half. A plugin the file has
  // answered for is settled; a plugin whose server is missing is not, however
  // settled the file looks — that is the case this block exists to shout about.
  if (recommendations.every(settled)) return;

  const width = widest(recommendations.map((recommendation) => recommendation.name));

  lines.push("", `Plugins (${recommendations.length})`);
  for (const recommendation of recommendations) {
    const wording = PLUGIN[recommendation.status];
    lines.push(
      INDENT + join(`${mark(recommendation, wording.mark)} ${pad(recommendation.name, width)}`, wording.note(recommendation)),
    );

    // The second half, and only where it is missing. A server that is there says
    // nothing worth a line, and the plugin's own line already covers the rest.
    if (recommendation.server.status === "missing") {
      const server = recommendation.server.binary;
      lines.push(
        INDENT +
          join(pad("", width + 2), `no ${server} on PATH — ${serverInstallCommand(recommendation)}`),
      );
    }
  }
}

/**
 * Which harness this run wrote for, and which it did not.
 *
 * Left out entirely when every harness is installed, because then the file list
 * is the whole answer and a row per harness would be furniture. It appears
 * exactly when something is absent — which is when the artifact list has a hole
 * in it that nothing else on the screen explains.
 */
function harnesses(lines: string[], rows: readonly HarnessPresence[]): void {
  if (rows.every((row) => row.installed)) return;

  const width = widest(rows.map((row) => row.id));

  lines.push("", `Harnesses (${rows.length})`);
  for (const row of rows) {
    lines.push(INDENT + join(`${row.installed ? "✓" : "✗"} ${pad(row.id, width)}`, harnessNote(row)));
  }
}

/**
 * What one harness row says on the right.
 *
 * The row that matters is the third: not installed and written for anyway. That
 * is the fallback, and saying it out loud is the difference between a person
 * knowing the project carries a Claude baseline and a person assuming prep read
 * their machine and agreed with it.
 */
function harnessNote(row: HarnessPresence): string {
  if (row.installed) return "installed — its files are written here";
  if (row.covered) return "not installed — written for anyway, so the project is not left without a baseline";
  return "not installed — its files are left out";
}

/** Whether one recommendation leaves nothing to say: the file has answered, and the server is there. */
function settled(recommendation: PluginRecommendation): boolean {
  return recommendation.status === "answered" && recommendation.server.status === "installed";
}

/**
 * The mark one line carries.
 *
 * A settled-looking plugin with no server behind it gets the warning, because
 * that is the line whose plugin half says everything is in place. A plugin that
 * is not there either keeps its own mark — nothing is pretending to work, and a
 * warning on a row that already reads as absent says nothing.
 */
function mark(recommendation: PluginRecommendation, own: string): string {
  const quietlyDead =
    recommendation.status === "answered" && recommendation.server.status === "missing";
  return quietlyDead ? "!" : own;
}

/** Detected types first, then a section per file, then what is owed, then what to run. */
export function renderSetupHuman(input: SetupHumanReportInput): string {
  const { outcome, presets } = input;
  const markerOf = new Map(presets.map((preset) => [preset.type, preset.marker]));

  const lines: string[] = [`prep setup · ${outcome.root}`];

  if (outcome.detected.length > 0) {
    const width = widest(outcome.detected);
    lines.push("", `Detected (${outcome.detected.length})`);
    for (const type of outcome.detected) {
      lines.push(INDENT + join(`✓ ${pad(type, width)}`, markerOf.get(type) ?? ""));
    }
  } else {
    // Naming the markers it looked for turns "nothing happened" into something actionable.
    const markers = presets.map((preset) => preset.marker).join(", ");
    lines.push("", "Detected (0)", INDENT + `– no ${markers}`);
  }

  for (const artifact of outcome.artifacts) artifactSection(lines, artifact, outcome.detected);

  // After the files, because it answers for the list of them rather than for any
  // one file: what is here decided which of them were written at all.
  harnesses(lines, outcome.harnesses);

  // Between the files and the handoff, because that is where it sits: one of
  // these is prep's to write and the rest are somebody else's to install.
  plugins(lines, outcome.plugins);
  handoff(lines, outcome.handoff);
  next(lines, outcome.next);

  return lines.join("\n") + "\n";
}

/**
 * The last thing shown before a merge is written.
 *
 * Counts, not rules: the diff above already listed them one by one, and what is
 * still worth checking at the moment of writing is the file being touched and
 * the values that came out of the questions.
 */
export function renderMergeSummary(settingsPath: string, settings: SettingsDocument): string {
  const permissions = settings.permissions;
  const turnedOn = Object.values(enabledPlugins(settings)).filter((value) => value === true).length;

  const titles = ["Starting mode", ...SECTIONS.map(([title]) => title), "Enabling"];
  const width = widest(titles);

  const lines = [
    `Will write to ${settingsPath}`,
    INDENT + join(pad("Starting mode", width), permissions.defaultMode),
  ];

  for (const [title, section] of SECTIONS) {
    lines.push(INDENT + join(pad(title, width), count(permissions[section])));
  }

  // Only where there is one. A line reading "0 plugins" on every merge would be
  // furniture, and this is the last thing read before a file changes.
  if (turnedOn > 0) {
    lines.push(INDENT + join(pad("Enabling", width), `${turnedOn} plugin${turnedOn === 1 ? "" : "s"}`));
  }

  return lines.join("\n") + "\n";
}
