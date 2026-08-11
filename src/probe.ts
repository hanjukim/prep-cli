import type { CheckResult, Platform, ToolSpec, WhichFn } from "./types.ts";

/**
 * The only place that asks the machine what it holds.
 *
 * Bun.which walks PATH and returns a path string or null. It spawns no
 * subprocess, so there is no side effect like a `--version` call, and no added
 * dependency. **Whether a tool is there is the whole of what is asked here.**
 * Whether it is usable — an account behind it, an identity set — is a **pass**
 * item, and `pass.ts` asks those, because they cannot be answered off PATH
 * (docs/adr/0026 narrows docs/adr/0010). So this file is no longer the only
 * reader of the machine, and it is still the only one that reads it for free.
 *
 * Nothing in either place changes the machine, so every path through chef is a
 * read.
 */
export const bunWhich: WhichFn = (binary) => Bun.which(binary);

/** Reads the current state of one entry. Injecting which verifies it without a real machine. */
export function check(spec: ToolSpec, platform: Platform, which: WhichFn = bunWhich): CheckResult {
  const platformSpec = spec.platforms[platform];

  // We do not know what to look up on this platform. Do not invent a substitute.
  if (!platformSpec) {
    return {
      id: spec.id,
      status: "unsupported",
      binary: null,
      path: null,
      renamed: null,
      guidance: null,
    };
  }

  // The canonical name, on every platform. A distribution that ships the tool
  // under another one says so in `renamed`, and that changes what closes the gap
  // rather than what is asked for: a machine answering only to batcat answers to
  // nothing anybody types.
  const binary = spec.binary;
  const path = which(binary);

  // Read out of the table rather than looked up. What the shipped name resolves
  // to is asked where the link is made, on a machine the installs have already
  // run over (docs/adr/0025), and a second lookup here would answer for the
  // machine as it stood before them.
  return {
    id: spec.id,
    status: path === null ? "missing" : "installed",
    binary,
    path,
    renamed: platformSpec.renamed ?? null,
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
