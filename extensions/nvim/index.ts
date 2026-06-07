/**
 * Neovim Context Extension for Pi
 *
 * Provides Neovim integration:
 * - Auto-connects to Neovim on session start
 * - Injects current editor state (splits) on each prompt when enabled
 * - Reloads files in Neovim when write/edit tools complete
 * - Sends LSP errors for modified files at turn end
 * - nvim_context tool for on-demand queries
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { registerCommands } from "./commands";
import { registerRenderers } from "./components";
import {
  configLoader,
  drainMigrationMessages,
  emitNvimConfigUpdated,
  NVIM_EXTENSIONS_REGISTER_EVENT,
  NVIM_EXTENSIONS_REQUEST_EVENT,
  type NvimExtensionsRegisterPayload,
  type NvimFeatureId,
} from "./config";
import type { NvimConnectionState } from "./connection";
import { setupNvimHooks } from "./hooks";
import { setupNvimTools } from "./tools";

export default async function nvimContextExtension(pi: ExtensionAPI) {
  await configLoader.load();

  const state: NvimConnectionState = {
    socket: null,
    lockfile: null,
    modifiedFilesThisTurn: new Set(),
  };

  const loadedFeatures = new Set<NvimFeatureId>();

  pi.events.on(NVIM_EXTENSIONS_REGISTER_EVENT, (data: unknown) => {
    const { feature } = data as NvimExtensionsRegisterPayload;
    loadedFeatures.add(feature);
  });

  pi.on("session_start", async (_event, ctx) => {
    loadedFeatures.clear();
    pi.events.emit(NVIM_EXTENSIONS_REQUEST_EVENT, undefined);
    emitNvimConfigUpdated(pi);

    const messages = drainMigrationMessages();
    if (messages.length === 0) {
      return;
    }
    const text = [
      "nvim: config warnings:",
      ...messages.map((msg) => `- ${msg}`),
    ].join("\n");
    ctx.ui.notify(text, "warning");
  });

  registerRenderers(pi);
  registerCommands(pi, { getLoadedFeatures: () => loadedFeatures });
  setupNvimTools(pi, state);
  setupNvimHooks(pi, state, () => configLoader.getConfig());
}
