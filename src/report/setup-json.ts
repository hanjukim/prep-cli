import type {
  Artifact,
  ArtifactStatus,
  CodexConfig,
  GuidanceArtifact,
  HandoffResult,
  HarnessPresence,
  NextStep,
  ParsedSettings,
  PluginRecommendation,
  ProjectType,
  RuleSection,
  SettingsConflict,
  SettingsDocument,
  SetupOutcome,
} from "../types.ts";

/**
 * One file, as a consumer reads it.
 *
 * Every member carries `kind`, `path` and `status`, and a consumer that only
 * wants those three walks the array without branching. Everything past them is
 * the kind's own, so a settings file's merge plan never has to be modelled as an
 * always-null field on a file of prose.
 */
export type SetupJsonArtifact =
  | {
      kind: "claude-settings";
      path: string;
      status: ArtifactStatus;
      /** What was written, or would be. null when prep composed nothing. */
      settings: SettingsDocument | null;
      /** How the baseline meets a file that was already there. null when there was none. */
      merge: {
        existing: ParsedSettings;
        added: Record<RuleSection, string[]>;
        /** The plugin entries the merge adds, by id. */
        addedPlugins: string[];
        conflicts: SettingsConflict[];
      } | null;
    }
  | {
      /** agents-md is the guidance itself; claude-md is the one line pointing Claude Code at it. */
      kind: GuidanceArtifact["kind"];
      path: string;
      status: ArtifactStatus;
      /** The text written, or that would be. null when there was nothing to write. */
      contents: string | null;
    }
  | {
      kind: "codex-config";
      path: string;
      status: ArtifactStatus;
      /** The profile written, or that would be. null when a file was already there. */
      config: CodexConfig | null;
      /**
       * Whether the file already there sets a sandbox mode, which makes Codex
       * ignore permission profiles altogether. A fact, so a consumer can branch
       * on it; the sentence that goes with it stays in the human report.
       */
      sandboxMode: boolean;
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
   * The harnesses prep knows about, each with whether the machine holds it and
   * whether this run wrote for it. Facts only — it is what a consumer reads to
   * know why a file it expected is not in the array.
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
 * The settings and the existing file are deep copies: they carry keys prep does
 * not know, and a consumer must not be able to reach back into either.
 */
function artifact(source: Artifact): SetupJsonArtifact {
  // A case per kind rather than a remainder, so a fourth kind is a type error
  // here instead of being reported as whichever kind happened to be last.
  switch (source.kind) {
    case "codex-config":
      return {
        kind: source.kind,
        path: source.path,
        status: source.status,
        config:
          source.config === null
            ? null
            : {
                ...source.config,
                workspace: [...source.config.workspace],
                outside: [...source.config.outside],
              },
        sandboxMode: source.sandboxMode,
      };

    case "agents-md":
    case "claude-md":
      return {
        kind: source.kind,
        path: source.path,
        status: source.status,
        contents: source.contents,
      };

    case "claude-settings": {
      const plan = source.plan;

      return {
        kind: source.kind,
        path: source.path,
        status: source.status,
        settings: source.settings === null ? null : structuredClone(source.settings),
        merge:
          plan === null
            ? null
            : {
                existing: structuredClone(plan.existing),
                added: {
                  deny: [...plan.added.deny],
                  allow: [...plan.added.allow],
                  ask: [...plan.added.ask],
                },
                addedPlugins: [...plan.addedPlugins],
                conflicts: plan.conflicts.map((conflict) => ({ ...conflict })),
              },
      };
    }
  }
}

export function renderSetupJson(outcome: SetupOutcome): string {
  const report: SetupJsonReport = {
    root: outcome.root,
    detected: [...outcome.detected],
    artifacts: outcome.artifacts.map(artifact),
    harnesses: outcome.harnesses.map((row) => ({ ...row })),
    plugins: outcome.plugins.map((recommendation) => ({
      ...recommendation,
      server: { ...recommendation.server },
    })),
    // Field by field, and in the same three fields doctor's contract emits
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
