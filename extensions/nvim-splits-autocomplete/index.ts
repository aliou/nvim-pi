import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  configLoader,
  NVIM_CONFIG_UPDATED_EVENT,
  NVIM_EXTENSIONS_REGISTER_EVENT,
  NVIM_EXTENSIONS_REQUEST_EVENT,
  type NvimConfigUpdatedPayload,
} from "../nvim/config";
import { createNvimSplitsAutocompleteProvider } from "./provider";

/**
 * `@vim:` autocomplete provider for open Neovim splits.
 *
 * Type `@vim:` in Pi's input editor to complete a file path from visible
 * Neovim splits discovered through the nvim-pi RPC lockfile.
 */
export default async function nvimSplitsAutocomplete(pi: ExtensionAPI) {
  await configLoader.load();

  let enabled = configLoader.getConfig().splitsAutocomplete;

  function registerFeature(): void {
    pi.events.emit(NVIM_EXTENSIONS_REGISTER_EVENT, {
      feature: "splitsAutocomplete",
    });
  }

  registerFeature();

  pi.events.on(NVIM_EXTENSIONS_REQUEST_EVENT, registerFeature);

  pi.events.on(NVIM_CONFIG_UPDATED_EVENT, (data: unknown) => {
    enabled = (data as NvimConfigUpdatedPayload).config.splitsAutocomplete;
  });

  pi.on("session_start", async (_event, ctx) => {
    if (!enabled) return;

    ctx.ui.addAutocompleteProvider((current) =>
      createNvimSplitsAutocompleteProvider(current, pi, ctx.cwd),
    );
  });
}
