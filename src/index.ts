/**
 * Neovim Context Extension for Pi
 *
 * Provides Neovim integration:
 * - Auto-connects to Neovim on session start
 * - Injects current editor context (splits) on each prompt
 * - Reloads files in Neovim when write/edit tools complete
 * - Sends LSP errors for modified files at turn end
 * - nvim_context tool for on-demand queries
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { registerCommands } from "./commands";
import { registerRenderers } from "./components";
import { configLoader } from "./config";
import { setupNvimHooks } from "./hooks";
import { setupNvimTools } from "./tools";
import type { NvimConnectionState } from "./utils";

export default async function nvimContextExtension(pi: ExtensionAPI) {
  await configLoader.load();

  const state: NvimConnectionState = {
    socket: null,
    lockfile: null,
    modifiedFilesThisTurn: new Set(),
  };

  registerRenderers(pi);
  registerCommands(pi);
  setupNvimTools(pi, state);
  setupNvimHooks(pi, state, () => configLoader.getConfig());
}
