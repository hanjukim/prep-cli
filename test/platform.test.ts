import { describe, expect, test } from "bun:test";

import { UnsupportedPlatformError, detectPlatform } from "../src/platform.ts";

describe("detectPlatform", () => {
  test("narrows darwin as is", () => {
    expect(detectPlatform("darwin")).toBe("darwin");
  });

  test("narrows linux as is", () => {
    expect(detectPlatform("linux")).toBe("linux");
  });

  test("Windows is an error, not an empty report", () => {
    expect(() => detectPlatform("win32")).toThrow(UnsupportedPlatformError);
  });

  test("the error message points at WSL", () => {
    let message = "";
    try {
      detectPlatform("win32");
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain("WSL");
  });

  test("any OS other than darwin or linux is rejected too", () => {
    expect(() => detectPlatform("freebsd")).toThrow(UnsupportedPlatformError);
    expect(() => detectPlatform("aix")).toThrow(UnsupportedPlatformError);
  });

  test("with no argument it reads the current process platform", () => {
    expect(detectPlatform()).toBe(detectPlatform(process.platform));
  });
});
