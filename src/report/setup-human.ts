import {
  enableCommand,
  installCommand,
  serverInstallCommand,
  typeMarkers,
} from "../plugins.ts";
import type {
  Artifact,
  GuidanceArtifact,
  HandoffResult,
  NextStep,
  NextStepId,
  PluginRecommendation,
  PluginRef,
  PluginStatus,
  SetupOutcome,
} from "../types.ts";
import { handoffRows } from "./handoff.ts";
import { INDENT, join, pad, widest } from "./layout.ts";

export type SetupHumanReportInput = {
  outcome: SetupOutcome;
};

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

/**
 * The one sentence that says what happened to one file and why. Every artifact,
 * every status, ends on one: either the file is written whole, or it is left alone.
 */
function reason(artifact: Artifact): string {
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

/**
 * What the harness still owes.
 *
 * Shown on every run, whatever prep wrote: a run that wrote nothing is exactly
 * when a person most needs to be told what is left.
 *
 * The rows are shared with chef, which reads the same check. What is setup's
 * own is the sentence under them — this run has just written files, so it can
 * say what is left beside what it did (docs/adr/0027).
 */
function handoff(lines: string[], results: readonly HandoffResult[]): void {
  if (results.length === 0) return;

  lines.push("", `Handoff (${results.length})`, ...handoffRows(results));

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
  harness: "writes the guidance prep does not",
  "install-harness": "no agent CLI here — install one first, then come back",
  chef: "reports what this machine still owes you",
};

/**
 * What to run next.
 *
 * Commands, shown and never run — the same level of intervention chef holds
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
 * How each recommendation is worded, and who acts on it.
 *
 * A plugin the machine does not hold is a person's to install, one it holds is
 * a person's to turn on, and one the settings file already names is nobody's —
 * it has been answered. prep runs neither command and writes no entry
 * (docs/adr/0031).
 *
 * None of them says anything about the language server the plugin points at.
 * That is a second, independent half, and it gets its own line where it is
 * missing rather than being folded into a sentence about the plugin.
 */
const PLUGIN: Record<PluginStatus, { mark: string; note: (plugin: PluginRef) => string }> = {
  missing: { mark: "✗", note: (plugin) => `not installed — ${installCommand(plugin)}` },
  installed: { mark: "+", note: (plugin) => `installed, not turned on here — ${enableCommand(plugin)}` },
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
  const { outcome } = input;
  const markers = typeMarkers();
  const markerOf = new Map(markers.map((entry) => [entry.type, entry.marker]));

  const lines: string[] = [`prep setup · ${outcome.root}`];

  if (outcome.detected.length > 0) {
    const width = widest(outcome.detected);
    lines.push("", `Detected (${outcome.detected.length})`);
    for (const type of outcome.detected) {
      lines.push(INDENT + join(`✓ ${pad(type, width)}`, markerOf.get(type) ?? ""));
    }
  } else {
    // Naming the markers it looked for turns "nothing happened" into something actionable.
    const looked = markers.map((entry) => entry.marker).join(", ");
    lines.push("", "Detected (0)", INDENT + `– no ${looked}`);
  }

  // One sentence per file. A file of prose has nothing to list under it: it is a
  // shape with no decisions in it, and printing headings back would say nothing
  // the sentence has not.
  for (const artifact of outcome.artifacts) lines.push("", reason(artifact));

  // Between the files and the handoff, because that is where it sits: the files
  // are what prep wrote, and these are what somebody still has to run.
  plugins(lines, outcome.plugins);
  handoff(lines, outcome.handoff);
  next(lines, outcome.next);

  return lines.join("\n") + "\n";
}
