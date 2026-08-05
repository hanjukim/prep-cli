import type { CheckResult, Platform, ToolSpec, WhichFn } from "./types.ts";

/**
 * The only place that reads the system.
 *
 * Bun.which walks PATH and returns a path string or null. It spawns no
 * subprocess, so there is no side effect like a `--version` call, and no added
 * dependency. Nothing else in prep changes the machine either (docs/adr/0010),
 * so every path through doctor is a read.
 */
export const bunWhich: WhichFn = (binary) => Bun.which(binary);

/** Reads the current state of one entry. Injecting which verifies it without a real machine. */
export function check(spec: ToolSpec, platform: Platform, which: WhichFn = bunWhich): CheckResult {
  const platformSpec = spec.platforms[platform];

  // We do not know what to look up on this platform. Do not invent a substitute.
  if (!platformSpec) {
    return { id: spec.id, status: "unsupported", binary: null, path: null, guidance: null };
  }

  // The canonical name, on every platform. A distribution that ships the tool
  // under another one says so in `renamed`, and that changes what closes the gap
  // rather than what is asked for: a machine answering only to batcat answers to
  // nothing anybody types.
  const binary = spec.binary;
  const path = which(binary);

  return {
    id: spec.id,
    status: path === null ? "missing" : "installed",
    binary,
    path,
    guidance: platformSpec.guidance,
  };
}

/** Reads them all, keeping the input order. */
export function checkAll(
  specs: readonly ToolSpec[],
  platform: Platform,
  which: WhichFn = bunWhich,
): CheckResult[] {
  return specs.map((spec) => check(spec, platform, which));
}
