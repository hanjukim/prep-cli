import { describe, expect, test } from "bun:test";

import {
  MergeError,
  addedCount,
  changesNothing,
  parseSettings,
  planMerge,
  resolveConflicts,
} from "../src/merge.ts";
import type { ClaudeSettings } from "../src/types.ts";

const BASELINE: ClaudeSettings = {
  permissions: {
    defaultMode: "acceptEdits",
    deny: ["Read(./.env)"],
    allow: ["Edit(./**)", "Bash(npm:*)"],
    ask: ["WebFetch"],
  },
};

describe("reading a file that is already there", () => {
  test("a settings file comes back as it was written", () => {
    const parsed = parseSettings('{ "permissions": { "allow": ["Bash(git:*)"] }, "model": "opus" }');
    expect(parsed).toEqual({ permissions: { allow: ["Bash(git:*)"] }, model: "opus" });
  });

  test("an empty object is a settings file too", () => {
    expect(parseSettings("{}")).toEqual({});
  });

  test("invalid JSON is refused", () => {
    expect(() => parseSettings("{ nope")).toThrow(MergeError);
  });

  test("a top level that is not an object is refused", () => {
    for (const text of ["[]", '"hi"', "42", "null"]) {
      expect(() => parseSettings(text)).toThrow(MergeError);
    }
  });

  test("a shape prep would have to guess at is refused rather than rewritten", () => {
    for (const text of [
      '{ "permissions": [] }',
      '{ "permissions": { "allow": "Bash(npm:*)" } }',
      '{ "permissions": { "deny": [1, 2] } }',
      '{ "permissions": { "defaultMode": true } }',
    ]) {
      expect(() => parseSettings(text)).toThrow(MergeError);
    }
  });
});

describe("planning the merge", () => {
  test("rules are a union, with the existing ones first", () => {
    const plan = planMerge({ permissions: { allow: ["Bash(terraform:*)"] } }, BASELINE);
    expect(plan.merged.permissions.allow).toEqual([
      "Bash(terraform:*)",
      "Edit(./**)",
      "Bash(npm:*)",
    ]);
    expect(plan.added.allow).toEqual(["Edit(./**)", "Bash(npm:*)"]);
  });

  test("nothing existing is ever dropped, whatever the baseline says", () => {
    const mine = { deny: ["Read(./private/**)"], allow: ["Bash(rg:*)"], ask: ["WebSearch"] };
    const plan = planMerge({ permissions: mine }, BASELINE);
    for (const section of ["deny", "allow", "ask"] as const) {
      for (const rule of mine[section]) expect(plan.merged.permissions[section]).toContain(rule);
    }
  });

  test("a rule both sides hold appears once and counts as nothing added", () => {
    const plan = planMerge({ permissions: { ask: ["WebFetch"] } }, BASELINE);
    expect(plan.merged.permissions.ask).toEqual(["WebFetch"]);
    expect(plan.added.ask).toEqual([]);
  });

  test("keys prep does not know are carried over untouched", () => {
    const plan = planMerge({ model: "opus", hooks: { Stop: [] } }, BASELINE);
    expect(plan.merged.model).toBe("opus");
    expect(plan.merged.hooks).toEqual({ Stop: [] });
  });

  test("unknown keys inside permissions are carried over too", () => {
    const plan = planMerge({ permissions: { additionalDirectories: ["../shared"] } }, BASELINE);
    expect(plan.merged.permissions.additionalDirectories).toEqual(["../shared"]);
  });

  test("a differing mode becomes a conflict, and the existing value stands in the plan", () => {
    const plan = planMerge({ permissions: { defaultMode: "plan" } }, BASELINE);
    expect(plan.conflicts).toEqual([{ key: "defaultMode", existing: "plan", preset: "acceptEdits" }]);
    expect(plan.merged.permissions.defaultMode).toBe("plan");
  });

  test("the same mode on both sides is no conflict", () => {
    const plan = planMerge({ permissions: { defaultMode: "acceptEdits" } }, BASELINE);
    expect(plan.conflicts).toEqual([]);
  });

  test("a missing mode is filled in, since there is nothing to disagree with", () => {
    const plan = planMerge({}, BASELINE);
    expect(plan.conflicts).toEqual([]);
    expect(plan.merged.permissions.defaultMode).toBe("acceptEdits");
  });

  test("the existing file is not touched by planning", () => {
    const existing = { permissions: { allow: ["Bash(git:*)"] } };
    planMerge(existing, BASELINE);
    expect(existing).toEqual({ permissions: { allow: ["Bash(git:*)"] } });
  });

  test("planning twice over the same input gives the same plan", () => {
    const existing = { permissions: { allow: ["Bash(git:*)"] } };
    expect(planMerge(existing, BASELINE)).toEqual(planMerge(existing, BASELINE));
  });
});

describe("whether there is anything to do", () => {
  test("a file that already covers the baseline changes nothing", () => {
    const plan = planMerge(structuredClone(BASELINE), BASELINE);
    expect(changesNothing(plan)).toBe(true);
    expect(addedCount(plan)).toBe(0);
  });

  test("a missing rule is a change", () => {
    const short = structuredClone(BASELINE);
    short.permissions.allow = ["Edit(./**)"];
    expect(changesNothing(planMerge(short, BASELINE))).toBe(false);
  });

  test("a conflict alone is a change, even when no rule moves", () => {
    const differing = structuredClone(BASELINE);
    differing.permissions.defaultMode = "plan";
    const plan = planMerge(differing, BASELINE);
    expect(addedCount(plan)).toBe(0);
    expect(changesNothing(plan)).toBe(false);
  });
});

describe("settling the conflicts", () => {
  const plan = planMerge({ permissions: { defaultMode: "plan" } }, BASELINE);

  test("choosing the preset takes its value", () => {
    expect(resolveConflicts(plan, { defaultMode: "preset" }).permissions.defaultMode).toBe(
      "acceptEdits",
    );
  });

  test("choosing yours keeps what the file had", () => {
    expect(resolveConflicts(plan, { defaultMode: "existing" }).permissions.defaultMode).toBe("plan");
  });

  test("an unanswered conflict keeps what the file had", () => {
    expect(resolveConflicts(plan, {}).permissions.defaultMode).toBe("plan");
  });

  test("resolving does not disturb the plan it came from", () => {
    resolveConflicts(plan, { defaultMode: "preset" });
    expect(plan.merged.permissions.defaultMode).toBe("plan");
  });
});

describe("the plugins the file turns on", () => {
  const TYPESCRIPT = "typescript-lsp@claude-plugins-official";
  const PYRIGHT = "pyright-lsp@claude-plugins-official";

  /** The baseline with one plugin folded in — what a run does for an installed one. */
  const ENABLING: ClaudeSettings = { ...BASELINE, enabledPlugins: { [TYPESCRIPT]: true } };

  test("a block the file does not have is added whole", () => {
    const plan = planMerge({}, ENABLING);
    expect(plan.addedPlugins).toEqual([TYPESCRIPT]);
    expect(plan.merged.enabledPlugins).toEqual({ [TYPESCRIPT]: true });
  });

  test("entries the file already holds are kept, and the new one joins them", () => {
    const plan = planMerge({ enabledPlugins: { [PYRIGHT]: true } }, ENABLING);
    expect(plan.addedPlugins).toEqual([TYPESCRIPT]);
    expect(plan.merged.enabledPlugins).toEqual({ [PYRIGHT]: true, [TYPESCRIPT]: true });
  });

  test("an entry already there is not touched, whatever its value", () => {
    for (const value of [true, false]) {
      const plan = planMerge({ enabledPlugins: { [TYPESCRIPT]: value } }, ENABLING);
      expect(plan.addedPlugins).toEqual([]);
      expect(plan.merged.enabledPlugins).toEqual({ [TYPESCRIPT]: value });
    }
  });

  test("a baseline turning nothing on leaves the file's own block exactly as it was", () => {
    const plan = planMerge({ enabledPlugins: { [PYRIGHT]: false } }, BASELINE);
    expect(plan.addedPlugins).toEqual([]);
    expect(plan.merged.enabledPlugins).toEqual({ [PYRIGHT]: false });
  });

  test("a file with no block does not grow an empty one", () => {
    expect(planMerge({}, BASELINE).merged.enabledPlugins).toBeUndefined();
  });

  test("a plugin entry is not counted as a rule", () => {
    expect(addedCount(planMerge({ permissions: BASELINE.permissions }, ENABLING))).toBe(0);
  });

  test("a merge that only adds a plugin still changes the file", () => {
    expect(changesNothing(planMerge({ permissions: BASELINE.permissions }, ENABLING))).toBe(false);
  });

  test("a file already listing what the baseline would add has nothing to do", () => {
    const settled = { permissions: BASELINE.permissions, enabledPlugins: { [TYPESCRIPT]: true } };
    expect(changesNothing(planMerge(settled, ENABLING))).toBe(true);
  });

  test("a plugin block that is not an object is refused rather than rewritten", () => {
    for (const text of ['{"enabledPlugins": []}', '{"enabledPlugins": "typescript-lsp"}']) {
      expect(() => parseSettings(text)).toThrow(MergeError);
    }
  });

  test("settling a conflict carries the plugin block through", () => {
    const plan = planMerge({ permissions: { defaultMode: "plan" } }, ENABLING);
    expect(resolveConflicts(plan, { defaultMode: "preset" }).enabledPlugins).toEqual({
      [TYPESCRIPT]: true,
    });
  });
});
