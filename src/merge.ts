import type {
  ClaudeSettings,
  ConflictSide,
  MergePlan,
  ParsedSettings,
  RuleSection,
  SettingsConflict,
  SettingsDocument,
} from "./types.ts";

/**
 * Meeting the baseline with a settings file that is already there.
 *
 * Pure: it is handed the parsed file and the composed baseline and hands back
 * what a merge would do. Nothing here reads, writes, prints, or asks — the
 * decision path stays verifiable on plain values, and the file only changes
 * once a person has seen this plan (docs/adr/0003).
 */

/** The file cannot be taken as settings. Callers turn it into a tool error naming the path. */
export class MergeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MergeError";
  }
}

const RULE_SECTIONS: readonly RuleSection[] = ["deny", "allow", "ask"];

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Reads the file as JSON and checks the parts prep is about to touch.
 *
 * Every shape prep cannot merge without guessing stops the run here: invalid
 * JSON, a permissions block that is not an object, a rule list that is not a
 * list of strings. Guessing would mean rewriting or dropping something a person
 * put there by hand, and that is the one result a merge must never produce.
 */
export function parseSettings(text: string): ParsedSettings {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new MergeError(`it is not valid JSON: ${reason}`);
  }

  if (!isPlainObject(value)) throw new MergeError("its top level is not a JSON object");

  checkEnabledPlugins(value);

  const permissions = value.permissions;
  if (permissions === undefined) return value;
  if (!isPlainObject(permissions)) throw new MergeError("its permissions is not a JSON object");

  for (const section of RULE_SECTIONS) {
    const rules = permissions[section];
    if (rules === undefined) continue;
    if (!Array.isArray(rules) || rules.some((rule) => typeof rule !== "string")) {
      throw new MergeError(`its permissions.${section} is not a list of rules`);
    }
  }

  if (permissions.defaultMode !== undefined && typeof permissions.defaultMode !== "string") {
    throw new MergeError("its permissions.defaultMode is not a string");
  }

  return value;
}

/**
 * Checks the plugin block too, since prep adds keys to it.
 *
 * It sits beside the permissions block rather than inside it, and a file may
 * carry either without the other, so it is read on its own.
 */
function checkEnabledPlugins(value: Record<string, unknown>): void {
  const enabled = value.enabledPlugins;
  if (enabled === undefined) return;
  if (!isPlainObject(enabled)) throw new MergeError("its enabledPlugins is not a JSON object");
}

/**
 * Works out what merging the baseline in would change.
 *
 * Rules are a union and existing ones are never dropped, so an allowlist
 * somebody widened by hand survives a second run. What the baseline adds is
 * kept apart in `added` for the diff, since "what is new" is the only part a
 * person actually has to read.
 */
export function planMerge(existing: ParsedSettings, baseline: ClaudeSettings): MergePlan {
  const current = isPlainObject(existing.permissions) ? existing.permissions : {};
  const permissions: Record<string, unknown> = { ...current };
  const added: Record<RuleSection, string[]> = { deny: [], allow: [], ask: [] };

  for (const section of RULE_SECTIONS) {
    const held = (current[section] as string[] | undefined) ?? [];
    const missing = baseline.permissions[section].filter((rule) => !held.includes(rule));
    added[section] = missing;
    // Existing rules first, in the order the file had them: a merge that
    // reorders somebody's file reads as a rewrite in every diff from here on.
    permissions[section] = [...held, ...missing];
  }

  const conflicts: SettingsConflict[] = [];
  const mode = current.defaultMode as string | undefined;
  if (mode === undefined) {
    permissions.defaultMode = baseline.permissions.defaultMode;
  } else if (mode !== baseline.permissions.defaultMode) {
    conflicts.push({
      key: "defaultMode",
      existing: mode,
      preset: baseline.permissions.defaultMode,
    });
    // The existing value stands in the plan. A conflict is shown, not settled —
    // prep proposing its own answer here is how a preference gets overwritten
    // by somebody skimming a prompt.
    permissions.defaultMode = mode;
  }

  // Keys prep knows nothing about — hooks, env, model, MCP servers — ride along
  // untouched, in their original order.
  const merged = { ...existing, permissions } as SettingsDocument;

  const addedPlugins = mergePlugins(existing, baseline, merged);

  return { existing, merged, added, addedPlugins, conflicts };
}

/**
 * Adds the plugin entries the file does not carry yet, and touches no entry it
 * does.
 *
 * An entry that is already there is an answer somebody gave — including `false`,
 * which is somebody having switched the plugin off. Overwriting it would turn a
 * decision into a default, so an id already present is skipped whatever its
 * value, and only genuinely new ids are added.
 */
function mergePlugins(
  existing: ParsedSettings,
  baseline: ClaudeSettings,
  merged: SettingsDocument,
): string[] {
  const held = isPlainObject(existing.enabledPlugins) ? existing.enabledPlugins : {};
  const wanted = Object.keys(baseline.enabledPlugins ?? {});
  const missing = wanted.filter((id) => !(id in held));

  // Nothing to add means the file's own block, if it has one, is already riding
  // along in `merged` untouched — and a file without one does not grow an empty
  // block just because prep looked.
  if (missing.length === 0) return [];

  merged.enabledPlugins = { ...held, ...Object.fromEntries(missing.map((id) => [id, true])) };

  return missing;
}

/** Whether the merge would leave the file exactly as it is, with nothing to ask. */
export function changesNothing(plan: MergePlan): boolean {
  return plan.conflicts.length === 0 && JSON.stringify(plan.merged) === JSON.stringify(plan.existing);
}

/** How many rules the merge would add, across every section. */
export function addedCount(plan: MergePlan): number {
  return RULE_SECTIONS.reduce((total, section) => total + plan.added[section].length, 0);
}

/**
 * Settles the conflicts and hands back the document to write.
 *
 * A side that is missing leaves the existing value in place, so a half-answered
 * run cannot silently take the preset's.
 */
export function resolveConflicts(
  plan: MergePlan,
  sides: Readonly<Record<string, ConflictSide>>,
): SettingsDocument {
  const permissions = { ...plan.merged.permissions };

  for (const conflict of plan.conflicts) {
    if (sides[conflict.key] === "preset") permissions[conflict.key] = conflict.preset;
  }

  return { ...plan.merged, permissions };
}
