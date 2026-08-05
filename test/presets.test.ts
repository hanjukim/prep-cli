import { describe, expect, test } from "bun:test";

import {
  ALWAYS_ALLOW,
  ALWAYS_ASK,
  ALWAYS_BASH,
  ALWAYS_DENY,
  DEFAULT_MODE,
  all,
} from "../src/presets.ts";

describe("presets", () => {
  test("covers node and python, and nothing else", () => {
    expect(all().map((preset) => preset.type)).toEqual(["node", "python"]);
  });

  test("types do not repeat", () => {
    const types = all().map((preset) => preset.type);
    expect(new Set(types).size).toBe(types.length);
  });

  test("every preset carries a marker and a non-empty allowlist", () => {
    for (const preset of all()) {
      expect(preset.marker.length).toBeGreaterThan(0);
      expect(preset.bash.length).toBeGreaterThan(0);
    }
  });

  test("the markers are package.json and pyproject.toml", () => {
    const byType = new Map(all().map((preset) => [preset.type, preset]));
    expect(byType.get("node")!.marker).toBe("package.json");
    expect(byType.get("python")!.marker).toBe("pyproject.toml");
  });

  test("requirements.txt and setup.py are not markers", () => {
    const markers = all().map((preset) => preset.marker);
    expect(markers).not.toContain("requirements.txt");
    expect(markers).not.toContain("setup.py");
  });

  test("node covers the package managers a team may be on, not npm alone", () => {
    const node = all().find((preset) => preset.type === "node")!;
    for (const command of ["npm:*", "pnpm:*", "yarn:*", "bun:*"]) {
      expect(node.bash).toContain(command);
    }
  });

  test("python covers uv and the pip fallback", () => {
    const python = all().find((preset) => preset.type === "python")!;
    for (const command of ["uv:*", "pip:*", "python:*", "pytest:*"]) {
      expect(python.bash).toContain(command);
    }
  });

  test("every entry is a prefix rule, so the calls people actually make are covered", () => {
    // An exact rule matches the bare command alone, which would ask on
    // `npm install left-pad` — the friction the baseline exists to remove.
    for (const preset of all()) {
      for (const command of preset.bash) {
        expect(command.endsWith(":*")).toBe(true);
      }
    }
  });

  test("nothing reaches outside the project", () => {
    // Leaving the working tree is the boundary deny-by-default protects, and
    // the one prep does not widen for anyone.
    for (const preset of all()) {
      for (const command of preset.bash) {
        expect(command).not.toContain("sudo");
        expect(command).not.toContain("~");
        expect(command).not.toContain("/");
        expect(command).not.toBe("*");
      }
    }
  });

  test("the entries hold bare commands — the writer adds the rule wrapper", () => {
    for (const preset of all()) {
      for (const command of preset.bash) {
        expect(command).not.toContain("Bash(");
        expect(command.length).toBeGreaterThan(0);
      }
    }
  });

  test("no entry reaches beyond its own project, so nothing global is allowed", () => {
    for (const preset of all()) {
      for (const command of preset.bash) {
        expect(command).not.toContain("sudo");
        expect(command).not.toBe("*");
      }
    }
  });

  test("the type-independent rules cover editing, fetching, and secrets", () => {
    expect(ALWAYS_ALLOW).toEqual(["Edit(./**)", "Write(./**)"]);
    expect(ALWAYS_ASK).toEqual(["WebFetch"]);
    expect(DEFAULT_MODE).toBe("acceptEdits");
    expect(ALWAYS_DENY.length).toBeGreaterThan(0);
  });

  test("the deny list closes both the repository's secrets and the machine's", () => {
    for (const rule of ["Read(./.env)", "Read(./.env.*)", "Read(./**/.env)"]) {
      expect(ALWAYS_DENY).toContain(rule);
    }
    for (const rule of ["Read(~/.ssh/**)", "Read(~/.aws/**)", "Read(~/.netrc)"]) {
      expect(ALWAYS_DENY).toContain(rule);
    }
  });

  test("the deny list holds reads and commands, and nothing else", () => {
    // Commands joined the list when the allowlist grew wide enough to need
    // closing at the ends (ADR-0006). Nothing beyond those two kinds belongs.
    for (const rule of ALWAYS_DENY) {
      expect(rule.startsWith("Read(") || rule.startsWith("Bash(")).toBe(true);
    }
  });

  test("the denied commands are the ones a person cannot undo", () => {
    for (const rule of ["Bash(git push --force:*)", "Bash(git reset --hard:*)", "Bash(rm -rf:*)"]) {
      expect(ALWAYS_DENY).toContain(rule);
    }
  });

  test("the denied commands close the paths that hand out secrets", () => {
    // The same judgement as the read rules, applied to a command that prints
    // the values those rules keep on disk.
    for (const rule of ["Bash(env)", "Bash(printenv:*)"]) {
      expect(ALWAYS_DENY).toContain(rule);
    }
  });

  test("a command deny names its subcommand — it never closes the command whole", () => {
    // A deny wide enough to cover routine calls is what makes people edit the
    // baseline by hand, which costs more than it saves (ADR-0006).
    const denied = ALWAYS_DENY.filter((rule) => rule.startsWith("Bash("));
    for (const command of ALWAYS_BASH) {
      expect(denied).not.toContain(`Bash(${command})`);
    }
  });

  test("the type-independent commands hold whatever the project is", () => {
    for (const command of ["ls:*", "rg:*", "fd:*", "git:*", "gh:*"]) {
      expect(ALWAYS_BASH).toContain(command);
    }
  });

  test("the type-independent commands follow the same rules as a preset's", () => {
    for (const command of ALWAYS_BASH) {
      // Prefix rules, bare commands, and nothing that leaves the project — the
      // wrapper goes on where the file is written, same as a preset's list.
      expect(command.endsWith(":*")).toBe(true);
      expect(command).not.toContain("Bash(");
      expect(command).not.toContain("sudo");
      expect(command).not.toContain("~");
      expect(command).not.toContain("/");
    }
  });

  test("no type preset repeats what every project already allows", () => {
    for (const preset of all()) {
      for (const command of preset.bash) {
        expect(ALWAYS_BASH).not.toContain(command);
      }
    }
  });

  test("no type preset reopens what the deny list closes", () => {
    for (const preset of all()) {
      for (const command of preset.bash) {
        expect(command).not.toContain(".env");
      }
    }
  });

  test("all() returns a copy so callers cannot disturb the table", () => {
    const first = all();
    first.pop();
    expect(all().length).toBe(first.length + 1);
  });
});
