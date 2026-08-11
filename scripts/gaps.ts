/**
 * The gap reader the bootstrap script runs.
 *
 * `prep chef --json` says what this machine is still missing and what closes
 * each gap; this turns that report into one command per line, which the script
 * runs in order. prep decides and the script executes (docs/adr/0009), so no
 * tool name and no install command is written here.
 *
 * Two kinds of entry are dropped. A gap whose guidance is `manual` carries no
 * command — there is nothing to run, and printing the note is chef's job. A
 * harness is dropped because it is not a gap at all: the script installs Claude
 * Code itself as a link in the chain, and Codex is left for a person to install
 * (docs/adr/0013). The ids come from the registry rather than from a list here,
 * so adding a third harness does not need this file edited.
 *
 * Reading stdin rather than running `prep chef` itself keeps the process tree
 * flat and lets the shell decide what to do with chef's exit code — finding
 * gaps is exit 1, which is the ordinary case during a bootstrap.
 */

import { harnesses } from "../src/registry.ts";

/**
 * The part of the `--json` contract this reads.
 *
 * Narrower than what the contract emits on purpose: this file has one question,
 * and a field it never names cannot break it when the contract widens.
 */
type Entry = {
  id: string;
  status: string;
  guidance: { kind: string; command?: string } | null;
};

/** The ids that are links in the chain rather than gaps. */
function chainIds(): Set<string> {
  return new Set(harnesses().map((harness) => harness.id));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Reads one result, or nothing at all.
 *
 * An entry that does not look like the contract is a contract that has moved,
 * and the script reading it would then install less than it meant to in silence.
 * Refusing the whole report is what makes that visible, so this returns null and
 * the caller throws.
 */
function toEntry(value: unknown): Entry | null {
  if (!isRecord(value)) return null;
  if (typeof value.id !== "string" || typeof value.status !== "string") return null;

  const guidance = value.guidance;
  if (guidance === null || guidance === undefined) {
    return { id: value.id, status: value.status, guidance: null };
  }
  if (!isRecord(guidance) || typeof guidance.kind !== "string") return null;

  const command = typeof guidance.command === "string" ? guidance.command : undefined;

  return { id: value.id, status: value.status, guidance: { kind: guidance.kind, command } };
}

/** The commands that close this machine's gaps, in report order. */
export function installCommands(report: unknown): string[] {
  if (!isRecord(report) || !Array.isArray(report.results)) {
    throw new Error(
      "prep chef --json carried no results array. The contract this script reads has moved.",
    );
  }

  const skip = chainIds();
  const commands: string[] = [];

  for (const value of report.results) {
    const entry = toEntry(value);
    if (entry === null) {
      throw new Error(
        `prep chef --json carried an entry this script cannot read: ${JSON.stringify(value)}`,
      );
    }

    if (entry.status !== "missing") continue;
    if (skip.has(entry.id)) continue;
    if (entry.guidance?.kind !== "command") continue;
    if (entry.guidance.command === undefined) continue;

    commands.push(entry.guidance.command);
  }

  return commands;
}

if (import.meta.main) {
  const commands = installCommands(JSON.parse(await Bun.stdin.text()));
  // Nothing to run prints nothing, so the shell reads an empty string rather
  // than a blank line it would then try to execute.
  if (commands.length > 0) process.stdout.write(commands.join("\n") + "\n");
}
