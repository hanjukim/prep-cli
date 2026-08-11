import { missingPrerequisites, rows as pair } from "../gaps.ts";
import type {
  CheckResult,
  ChefProject,
  Guidance,
  PassResult,
  PassSpec,
  Platform,
  Row,
  ToolSpec,
} from "../types.ts";
import { handoffRows } from "./handoff.ts";
import { INDENT, join, pad, widest } from "./layout.ts";

export type HumanReportInput = {
  platform: Platform;
  /** The wanted state. Human-facing wording like purpose and tier lives here. */
  specs: readonly ToolSpec[];
  /** The current state. Arrives in the same order as specs. */
  results: readonly CheckResult[];
  /** The pass table, for its human wording. Absent when nothing was asked. */
  passSpecs?: readonly PassSpec[];
  /**
   * What the pass checks answered, in table order. Gated rows never arrive, and
   * neither do the project rows of a run that was given no project.
   */
  pass?: readonly PassResult[];
  /**
   * The project this run was given, and what its harness side still owes.
   * Absent when chef was given no path, which is when it read the machine
   * alone (docs/adr/0027).
   */
  project?: ChefProject;
};

/** Flattens guidance into one line. For command guidance the command is the text. */
function guidanceText(guidance: Guidance): string {
  if (guidance.kind === "command") return guidance.command;
  return guidance.url ? `${guidance.note}  ${guidance.url}` : guidance.note;
}

export function renderHuman(input: HumanReportInput): string {
  const { platform, specs, results, passSpecs = [], pass = [], project } = input;

  const rows = pair(specs, results);

  // Another OS's prerequisite manager is not this machine's concern. Drop the line entirely.
  const prerequisites = rows.filter(
    (row) => row.spec.tier === "prerequisite" && row.result.status !== "unsupported",
  );
  // Everything that is not a prerequisite reports the same way, whatever its
  // tier: found or not, and what to do about it. Only the prerequisites are
  // set apart, because a missing one invalidates every command below it.
  const rest = rows.filter((row) => row.spec.tier !== "prerequisite");

  const missing = missingPrerequisites(rows);
  const installed = rest.filter((row) => row.result.status === "installed");
  const gaps = rest.filter((row) => row.result.status === "missing");
  const unsupported = rest.filter((row) => row.result.status === "unsupported");

  // Without the prerequisite, every other install command is a lie. Keep the gap list, take back the commands.
  const suppressCommands = missing.length > 0;

  /** What a gap line says to do, or nothing where the advice has been taken back. */
  const advice = ({ result }: Row): string => {
    const guidance = result.guidance;
    if (guidance === null) return "";
    return suppressCommands && guidance.kind === "command" ? "" : guidanceText(guidance);
  };

  const idWidth = widest([...prerequisites, ...rest].map((row) => row.spec.id));
  const summaryWidth = widest(gaps.map((row) => row.spec.summary));

  // The project is named in the heading, because nothing in the rows below says
  // which directory they are about. As it was given and not resolved, which is
  // where `prep setup · <root>` already stands — a run told `.` is told `.` back
  // by both. A run with no project says nothing extra.
  const heading = project ? `prep chef · ${platform} · ${project.root}` : `prep chef · ${platform}`;
  const lines: string[] = [heading];

  if (suppressCommands) {
    lines.push("");
    for (const row of missing) {
      lines.push(`⚠ ${row.spec.id} is missing. Install commands below are hidden — install this first.`);
    }
  }

  if (prerequisites.length > 0) {
    lines.push("", "Prerequisites");
    for (const { spec, result } of prerequisites) {
      const id = pad(spec.id, idWidth);
      if (result.status === "installed") {
        lines.push(INDENT + join(`✓ ${id}`, result.path ?? ""));
      } else if (result.status === "missing") {
        lines.push(INDENT + join(`✗ ${id}`, result.guidance ? guidanceText(result.guidance) : ""));
      }
    }
  }

  if (installed.length > 0) {
    lines.push("", `Installed (${installed.length})`);
    lines.push(INDENT + `✓ ${installed.map((row) => row.spec.id).join("  ")}`);
  }

  if (gaps.length > 0) {
    lines.push("", `Gaps (${gaps.length})`);
    for (const row of gaps) {
      const id = pad(row.spec.id, idWidth);
      const summary = pad(row.spec.summary, summaryWidth);
      lines.push(INDENT + join(`✗ ${id}`, summary, advice(row)));
    }
  }

  if (unsupported.length > 0) {
    lines.push("", `Not applicable (${unsupported.length})`);
    for (const { spec } of unsupported) {
      lines.push(INDENT + join(`– ${pad(spec.id, idWidth)}`, `not checked on ${platform}`));
    }
  }

  // The pass items: what only a person can close. Every asked row is shown,
  // ready ones included, so the section always answers "was this looked at" —
  // but none of it moves the exit code, and the wording keeps the closing to
  // the person. An unknown names its own check command instead of an answer.
  if (pass.length > 0) {
    const summaryOf = new Map(passSpecs.map((spec) => [spec.id, spec.summary]));
    const nameOf = (item: PassResult): string => summaryOf.get(item.id) ?? item.id;
    const nameWidth = widest(pass.map(nameOf));

    lines.push("", `Pass (${pass.length}) — closed by you, or not at all`);
    for (const item of pass) {
      const name = pad(nameOf(item), nameWidth);
      if (item.status === "ready") {
        lines.push(INDENT + join(`✓ ${name}`));
      } else if (item.status === "missing") {
        lines.push(INDENT + join(`✗ ${name}`, guidanceText(item.guidance)));
      } else {
        lines.push(INDENT + join(`? ${name}`, `unknown — ask it yourself: ${item.checks.join(" · ")}`));
      }
    }
  }

  // What the project owes its harness, read by the same function setup's report
  // reads. Framed as the project's debt rather than as what a run just left
  // behind: chef wrote nothing here, so it has no run of its own to set the
  // rows against (docs/adr/0027).
  if (project && project.handoff.length > 0) {
    lines.push("", `Handoff (${project.handoff.length}) — owed to this project`);
    lines.push(...handoffRows(project.handoff));
  }

  // Only send somebody to "the commands above" when a command is actually up
  // there. A gap list of nothing but manual guidance — harnesses, say — has
  // none, and pointing at commands that are not on the screen reads as a bug.
  const showsCommands =
    !suppressCommands && gaps.some((row) => row.result.guidance?.kind === "command");

  lines.push(
    "",
    footer({
      gapCount: gaps.length,
      missingPrerequisiteIds: missing.map((row) => row.spec.id),
      showsCommands,
    }),
  );

  return lines.join("\n") + "\n";
}

/**
 * The last line: what is left, and who does it.
 *
 * Always the person. prep closes no gap on any path (docs/adr/0010), so the
 * sentence counts what is outstanding and hands all of it back — there is no
 * case where part of the work was already spent by the time this is read.
 */
function footer(input: {
  gapCount: number;
  missingPrerequisiteIds: readonly string[];
  showsCommands: boolean;
}): string {
  const { gapCount, missingPrerequisiteIds, showsCommands } = input;

  const count = `${gapCount} gap${gapCount === 1 ? "" : "s"}`;

  if (missingPrerequisiteIds.length > 0) {
    const names = missingPrerequisiteIds.join(", ");
    if (gapCount === 0) return `No gaps, but ${names} is missing.`;
    return `${count}. Install ${names} first.`;
  }

  if (gapCount === 0) return "No gaps.";
  if (showsCommands) return `${count}. Run the commands above yourself.`;
  return `${count}. Follow each line above yourself.`;
}
