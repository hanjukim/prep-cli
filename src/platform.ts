import type { Platform } from "./types.ts";

const SUPPORTED: readonly string[] = ["darwin", "linux"];

/**
 * An unsupported OS ends in this error, not in zero results.
 * A silent empty report reads as "everything is installed".
 */
export class UnsupportedPlatformError extends Error {
  readonly detected: string;

  constructor(detected: string) {
    super(
      `prep supports macOS and Linux only. Detected platform: ${detected}. ` +
        `On Windows, run it again inside WSL.`,
    );
    this.name = "UnsupportedPlatformError";
    this.detected = detected;
  }
}

/** Narrows a process.platform string to Platform. */
export function detectPlatform(raw: string = process.platform): Platform {
  if (!SUPPORTED.includes(raw)) throw new UnsupportedPlatformError(raw);
  return raw as Platform;
}
