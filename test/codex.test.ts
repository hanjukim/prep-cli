import { describe, expect, test } from "bun:test";

import {
  CODEX_PROFILE,
  codexConfig,
  holdsSandboxMode,
  renderCodexToml,
} from "../src/codex.ts";
import { ALWAYS_DENY } from "../src/presets.ts";

/** The file as prep would write it, parsed back by somebody else's parser. */
function parsed(deny: readonly string[] = ALWAYS_DENY): Record<string, any> {
  return Bun.TOML.parse(renderCodexToml(codexConfig(deny))) as Record<string, any>;
}

/** The profile's two deny tables, as they land in the file. */
function filesystem(deny: readonly string[] = ALWAYS_DENY) {
  return parsed(deny).permissions[CODEX_PROFILE].filesystem;
}

describe("what the preset becomes", () => {
  test("a project-relative read rule becomes a workspace key", () => {
    expect(filesystem(["Read(./.env)"])[":workspace_roots"]).toEqual({ ".env": "deny" });
  });

  test("a glob keeps its inner wildcards and loses the leading ./", () => {
    expect(filesystem(["Read(./**/*.pem)"])[":workspace_roots"]).toEqual({ "**/*.pem": "deny" });
  });

  test("a whole directory loses its trailing /**, because the key is the directory", () => {
    expect(filesystem(["Read(./secrets/**)"])[":workspace_roots"]).toEqual({ secrets: "deny" });
  });

  test("a home path lands outside the workspace table, with its trailing /** gone", () => {
    const table = filesystem(["Read(~/.ssh/**)"]);
    expect(table["~/.ssh"]).toBe("deny");
    expect(table[":workspace_roots"]).toBeUndefined();
  });

  test("a home file with no wildcard is carried over as it stands", () => {
    expect(filesystem(["Read(~/.netrc)"])["~/.netrc"]).toBe("deny");
  });

  test("a rule that names no root is measured from the project, not the machine", () => {
    const config = codexConfig(["Read(**/*.pem)", "Read(/etc/shadow)"]);
    expect(config.workspace).toEqual(["**/*.pem"]);
    expect(config.outside).toEqual(["/etc/shadow"]);
  });

  test("a command rule is left out — Codex denies paths here, not commands", () => {
    const config = codexConfig(["Bash(rm -rf:*)", "Bash(env)", "Read(./.env)"]);
    expect(config.workspace).toEqual([".env"]);
    expect(config.outside).toEqual([]);
  });

  test("the preset's order is the file's order", () => {
    const config = codexConfig(ALWAYS_DENY);
    expect(config.workspace[0]).toBe(".env");
    expect(config.workspace.at(-1)).toBe("secrets");
    expect(config.outside).toEqual([
      "~/.ssh",
      "~/.aws",
      "~/.gnupg",
      "~/.config/gh",
      "~/.netrc",
    ]);
  });

  test("every secret path the Claude baseline denies is denied here too", () => {
    const config = codexConfig(ALWAYS_DENY);
    const reads = ALWAYS_DENY.filter((rule) => rule.startsWith("Read("));
    expect(config.workspace.length + config.outside.length).toBe(reads.length);
  });
});

describe("the file that is written", () => {
  test("it parses back to the values it was composed from", () => {
    const document = parsed();
    expect(document.default_permissions).toBe(CODEX_PROFILE);
    expect(document.approval_policy).toBe("on-request");
    expect(document.permissions[CODEX_PROFILE].extends).toBe(":workspace");
  });

  test("the workspace table holds every project-relative path, all denied", () => {
    const roots = filesystem()[":workspace_roots"];
    expect(roots[".env"]).toBe("deny");
    expect(roots["**/id_ed25519*"]).toBe("deny");
    expect(Object.values(roots).every((value) => value === "deny")).toBe(true);
  });

  test("a key that would break a bare TOML key is quoted", () => {
    const text = renderCodexToml(codexConfig(["Read(./.env.*)"]));
    expect(text).toContain('".env.*" = "deny"');
  });

  test("it ends with a newline, like every file prep writes", () => {
    expect(renderCodexToml(codexConfig(ALWAYS_DENY)).endsWith("\n")).toBe(true);
  });
});

describe("reading a file that is already there", () => {
  test("a sandbox mode is found wherever it sits in the file", () => {
    expect(holdsSandboxMode('sandbox_mode = "workspace-write"\n')).toBe(true);
    expect(holdsSandboxMode('model = "o3"\n\n  sandbox_mode="read-only"\n')).toBe(true);
  });

  test("a file with no sandbox mode reads as none", () => {
    expect(holdsSandboxMode('model = "o3"\napproval_policy = "on-request"\n')).toBe(false);
  });

  test("a commented-out mode is not one", () => {
    expect(holdsSandboxMode('# sandbox_mode = "read-only"\n')).toBe(false);
  });

  test("a key that merely contains the words is not one", () => {
    expect(holdsSandboxMode('sandbox_mode_note = "off"\n')).toBe(false);
  });
});
