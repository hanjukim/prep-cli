import type {
  Artifact,
  ArtifactStatus,
  GuidanceArtifact,
  HandoffResult,
  HarnessPresence,
  NextStep,
  PluginRecommendation,
  ProjectType,
  SetupOutcome,
} from "../types.ts";

/**
 * One file, as a consumer reads it.
 *
 * Every member carries `kind`, `path` and `status`, and a consumer that only
 * wants those three walks the array without branching. Consumers read the
 * `kind` rather than the position, so a new kind of file arrives as another
 * member rather than as another optional field.
 */
export type SetupJsonArtifact = {
  /** agents-md is the guidance itself; claude-md is the one line pointing Claude Code at it. */
  kind: GuidanceArtifact["kind"];
  path: string;
  status: ArtifactStatus;
  /** The text written, or that would be. null when there was nothing to write. */
  contents: string | null;
};

/**
 * The machine-readable setup report.
 *
 * Taking only the outcome is this module's boundary — marker names and every
 * human sentence live outside it, so no wording can leak into the contract.
 *
 * The files sit in an array rather than at the top level, so a consumer walks
 * the list and a run that grows a second file does not change the shape it
 * walks.
 */
export type SetupJsonReport = {
  root: string;
  detected: ProjectType[];
  artifacts: SetupJsonArtifact[];
  /**
   * The harnesses prep knows about, each with whether the machine holds it.
   * Facts only — it is what the `next` commands were chosen from.
   */
  harnesses: HarnessPresence[];
  /**
   * The plugins this project's types call for, each with the language server it
   * points at. Names and statuses only — the install commands and every sentence
   * that goes with a status are the human report's, so none of them can reach a
   * consumer.
   */
  plugins: PluginRecommendation[];
  /** What the harness side still owes. Statuses and paths only — the wording stays outside. */
  handoff: HandoffResult[];
  /**
   * What to run next, in order. Ids and commands only: a consumer that wants to
   * act reads the command, and one that wants to branch reads the id. Both the
   * command and its alternative are plain strings, so a consumer can paste
   * either without knowing which harness prep looked at.
   */
  next: NextStep[];
};

/**
 * Copies field by field rather than passing the artifact through, so the
 * contract does not widen on its own when an internal structure grows a field.
 */
function artifact(source: Artifact): SetupJsonArtifact {
  return {
    kind: source.kind,
    path: source.path,
    status: source.status,
    contents: source.contents,
  };
}

export function renderSetupJson(outcome: SetupOutcome): string {
  const report: SetupJsonReport = {
    root: outcome.root,
    detected: [...outcome.detected],
    artifacts: outcome.artifacts.map(artifact),
    harnesses: outcome.harnesses.map((row) => ({ id: row.id, installed: row.installed })),
    plugins: outcome.plugins.map((recommendation) => ({
      ...recommendation,
      server: { ...recommendation.server },
    })),
    // Field by field, and in the same three fields chef's contract emits
    // (`src/report/json.ts`). Both reports read one `checkHandoff`, so a field
    // added to its result for prep's own use would otherwise reach whichever
    // contract spreads and not the one that picks — the two would part company
    // over an internal change neither of them made (docs/adr/0027).
    handoff: outcome.handoff.map((result) => ({
      id: result.id,
      status: result.status,
      path: result.path,
    })),
    // Field by field, for the reason the artifacts are: a step is read off the
    // machine as well as off the outcome, and a field added there for prep's own
    // use must not reach a consumer just because it was added.
    next: outcome.next.map((step) => ({
      id: step.id,
      command: step.command,
      alternative: step.alternative,
    })),
  };

  return JSON.stringify(report, null, 2) + "\n";
}
