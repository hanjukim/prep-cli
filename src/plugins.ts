import { isAbsolute, join, resolve } from "node:path";

import type {
  InstallScope,
  InstalledPlugin,
  LanguageServer,
  PluginRecommendation,
  PluginRef,
  PluginSpec,
  PluginStatus,
  ProjectType,
  SetupFs,
  WhichFn,
} from "./types.ts";

/**
 * The language servers a project type wants, and where each one stands.
 *
 * The boundary this module holds is the whole point of the feature: installing a
 * plugin is a person's to do, and turning an installed one on for this project
 * is prep's. So nothing here runs a command or changes a file. It reads the
 * harness's install record through the injected file system — setup.ts still
 * owns every path to disk (docs/adr/0003) — and says which of three states each
 * recommendation is in.
 *
 * The table is static, the same as presets.ts (docs/adr/0002): a type prep has
 * no entry for is recommended nothing, rather than having a plausible-sounding
 * plugin name invented for it.
 */

/** A record prep could not read. Turned into a setup error where the run is driven from. */
export class PluginsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PluginsError";
  }
}

/** The one marketplace prep names. Both entries come from it, and prep adds no others. */
const MARKETPLACE = "claude-plugins-official";

/**
 * The plugins, and the executables they configure.
 *
 * Each entry carries a binary because that is what the plugin actually is: the
 * marketplace holds a `lspServers` block naming a command and the extensions it
 * answers for, and nothing else — no server, no installer. The command is an
 * ordinary tool a person installs, so prep names it the same way chef names
 * ripgrep.
 */
const PLUGINS: readonly PluginSpec[] = [
  {
    type: "node",
    name: "typescript-lsp",
    marketplace: MARKETPLACE,
    binary: "typescript-language-server",
    install: "npm install -g typescript-language-server typescript",
  },
  {
    type: "python",
    name: "pyright-lsp",
    marketplace: MARKETPLACE,
    binary: "pyright-langserver",
    // The server ships in the `pyright` package; the binary it installs is
    // named for the protocol, which is why the two do not match.
    install: "pip install pyright",
  },
];

/** How the harness names a plugin everywhere: in its record, and in the settings file. */
export function pluginId(plugin: PluginRef): string {
  return `${plugin.name}@${plugin.marketplace}`;
}

/** The command a person runs to install one. Shown and never run, the same as chef's. */
export function installCommand(plugin: PluginRef): string {
  return `claude plugin install ${pluginId(plugin)}`;
}

/** Where the harness keeps its install record, under the home directory. */
export const RECORD_RELATIVE_PATH = join(".claude", "plugins", "installed_plugins.json");

const SCOPES: readonly InstallScope[] = ["user", "project"];

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Reads the harness's install record.
 *
 * Only three fields matter — which plugin, how far its install reaches, and
 * which project a scoped one belongs to — so everything else in the entry is
 * left unread and cannot break this when it changes.
 *
 * A shape prep cannot read stops the run. Falling back to "nothing is
 * installed" would tell somebody to install what they already have, and would
 * withhold the enable entry that is the one thing prep is here to write.
 */
export function parseInstalledPlugins(text: string): InstalledPlugin[] {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new PluginsError(`it is not valid JSON: ${reason}`);
  }

  if (!isPlainObject(value)) throw new PluginsError("its top level is not a JSON object");

  const plugins = value.plugins;
  // A record that has never held a plugin. Not a failure — the ordinary state of
  // a machine nobody has installed one on.
  if (plugins === undefined) return [];
  if (!isPlainObject(plugins)) throw new PluginsError("its plugins is not a JSON object");

  const installs: InstalledPlugin[] = [];

  for (const [id, entries] of Object.entries(plugins)) {
    if (!Array.isArray(entries)) {
      throw new PluginsError(`its plugins.${id} is not a list of installs`);
    }

    for (const entry of entries) {
      if (!isPlainObject(entry)) throw new PluginsError(`its plugins.${id} holds a non-object`);

      // A scope prep does not know reaches somewhere prep cannot describe, so it
      // counts nowhere. That is the safe direction: the plugin reads as missing
      // and a person is shown an install command they may not need, rather than
      // prep claiming a reach it cannot vouch for.
      const scope = entry.scope;
      if (typeof scope !== "string" || !SCOPES.includes(scope as InstallScope)) continue;

      const projectPath = entry.projectPath;
      installs.push({
        id,
        scope: scope as InstallScope,
        projectPath: typeof projectPath === "string" ? projectPath : null,
      });
    }
  }

  return installs;
}

/**
 * Reads the record off the machine, through the same file system every other
 * read goes through.
 *
 * No file at all means no plugin has ever been installed here, which is a state
 * and not a failure — the same reading a missing settings file gets.
 */
export function readInstalledPlugins(home: string, fs: SetupFs): InstalledPlugin[] {
  const path = join(home, RECORD_RELATIVE_PATH);
  if (!fs.exists(path)) return [];

  let text: string;
  try {
    text = fs.read(path);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new PluginsError(`Could not read ${path}: ${reason}`);
  }

  try {
    return parseInstalledPlugins(text);
  } catch (error) {
    if (error instanceof PluginsError) throw new PluginsError(`Cannot read ${path}: ${error.message}`);
    throw error;
  }
}

/**
 * Whether one install reaches this project.
 *
 * A machine-wide one reaches every project. A scoped one is measured against the
 * path the record wrote down, and only an absolute path can be measured — a
 * relative one would be read against whatever directory prep happens to be run
 * from, which is not what the harness meant by it.
 */
function reaches(install: InstalledPlugin, root: string): boolean {
  if (install.scope === "user") return true;
  if (install.projectPath === null || !isAbsolute(install.projectPath)) return false;
  return resolve(install.projectPath) === resolve(root);
}

export type RecommendInput = {
  /** The project types found, which decide what is recommended at all. */
  detected: readonly ProjectType[];
  /** The project directory, against which a project-scoped install is measured. */
  root: string;
  /** The settings file's plugin block, as it stands. Absent when the file has none, or has no file. */
  enabled?: unknown;
  installed: readonly InstalledPlugin[];
  /** How the language server executable is looked up. The same seam chef probes through. */
  which: WhichFn;
};

/**
 * Works out where each recommendation stands, in table order.
 *
 * The order the three states are decided in is the point. What the settings file
 * already says comes first, because an entry there is a person's answer and
 * outranks anything the machine holds. Only where the file is silent does the
 * install record decide, and only where both are silent does prep fall back to
 * showing an install command.
 *
 * The server is read alongside, and separately: the two halves fail on their own
 * and a run has to be able to say which half is missing.
 */
export function recommend(input: RecommendInput): PluginRecommendation[] {
  const listed = isPlainObject(input.enabled) ? input.enabled : {};

  return PLUGINS.filter((plugin) => input.detected.includes(plugin.type)).map((plugin) => {
    const id = pluginId(plugin);
    let status: PluginStatus;

    if (id in listed) {
      status = "answered";
    } else if (input.installed.some((install) => install.id === id && reaches(install, input.root))) {
      status = "installed";
    } else {
      status = "missing";
    }

    const server: LanguageServer = {
      binary: plugin.binary,
      status: input.which(plugin.binary) === null ? "missing" : "installed",
    };

    return { name: plugin.name, marketplace: plugin.marketplace, status, server };
  });
}

/** How a person installs the executable one recommendation needs. */
export function serverInstallCommand(plugin: PluginRef): string {
  const spec = PLUGINS.find((entry) => pluginId(entry) === pluginId(plugin));
  return spec?.install ?? "";
}

/**
 * The entries a run writes.
 *
 * Both halves have to be there. An entry switching on a plugin whose server is
 * not installed configures a command that cannot run — the file reads as
 * equipped and nothing loads, which is the very outcome the rule against
 * enabling an uninstalled plugin exists to prevent.
 */
export function toEnable(recommendations: readonly PluginRecommendation[]): string[] {
  return recommendations
    .filter(
      (recommendation) =>
        recommendation.status === "installed" && recommendation.server.status === "installed",
    )
    .map(pluginId);
}
