import type { CheckResult, Guidance, PassResult, Platform } from "../types.ts";

/**
 * The machine-readable report.
 *
 * Taking no `specs` as input is this module's core boundary. Human-facing
 * wording like the purpose line and the tier lives only on `ToolSpec`, so never
 * holding that value structurally blocks any path for human wording to leak
 * into the contract.
 */
export type JsonReportInput = {
  platform: Platform;
  /** The current state. Emitted in the input order. */
  results: readonly CheckResult[];
  /** What the pass checks answered. Gated rows never arrive, so none is emitted. */
  pass?: readonly PassResult[];
};

/** The entry shape the contract promises outward. Owned by this module, apart from `CheckResult`. */
type JsonResult = {
  id: string;
  status: CheckResult["status"];
  binary: string | null;
  path: string | null;
  /**
   * The name this platform's package ships the executable under, when that is
   * not `binary`. null everywhere else.
   *
   * Emitted because the one reader that acts on it is outside prep: the
   * bootstrap script links the canonical name to what the package actually
   * installed, and this is what spares it a table of the two names of its own
   * (docs/adr/0025).
   */
  renamed: string | null;
  guidance: JsonGuidance | null;
};

type JsonGuidance =
  | { kind: "manual"; note: string; url?: string }
  | { kind: "command"; command: string };

/**
 * One pass item as the contract promises it.
 *
 * The status and the commands, and nothing a check printed: the identity a
 * login check knows — an account name, an email — is discarded before it is
 * data, so it cannot appear here (docs/adr/0026). `scripts/gaps.ts` does not
 * read this key, which is what keeps the bootstrap script untouched by it.
 */
type JsonPassItem = {
  id: string;
  status: PassResult["status"];
  /** The check commands, so a consumer of an `unknown` can ask them itself. */
  checks: string[];
  guidance: JsonGuidance;
};

type JsonReport = {
  platform: Platform;
  results: JsonResult[];
  pass: JsonPassItem[];
};

/**
 * Rebuilds guidance into the contract shape.
 *
 * Copying field by field instead of passing `CheckResult` through has two
 * reasons. It pins the key order so it does not follow an upstream module's
 * object literal order, and it stops the contract from widening on its own when
 * a field is added to an internal data structure.
 */
function toJsonGuidance(guidance: Guidance): JsonGuidance {
  switch (guidance.kind) {
    case "manual":
      // With no url, drop the key itself. JSON.stringify erases undefined.
      return { kind: "manual", note: guidance.note, url: guidance.url };
    case "command":
      return { kind: "command", command: guidance.command };
  }
}

function toJsonResult(result: CheckResult): JsonResult {
  return {
    id: result.id,
    status: result.status,
    binary: result.binary,
    path: result.path,
    renamed: result.renamed,
    guidance: result.guidance === null ? null : toJsonGuidance(result.guidance),
  };
}

function toJsonPassItem(item: PassResult): JsonPassItem {
  return {
    id: item.id,
    status: item.status,
    checks: [...item.checks],
    guidance: toJsonGuidance(item.guidance),
  };
}

/**
 * No color, no symbols, no summary wording. Suppressing guidance over a missing
 * prerequisite is the human renderer's call too, so this emits what it read.
 */
export function renderJson(input: JsonReportInput): string {
  const report: JsonReport = {
    platform: input.platform,
    results: input.results.map(toJsonResult),
    pass: (input.pass ?? []).map(toJsonPassItem),
  };

  return JSON.stringify(report, null, 2) + "\n";
}
