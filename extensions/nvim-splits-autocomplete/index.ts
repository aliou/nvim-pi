import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createNvimSplitsAutocompleteProvider } from "./provider";

/**
 * `@vim:` autocomplete provider for open Neovim splits.
 *
 * Type `@vim:` in Pi's input editor to complete a file path from visible
 * Neovim splits discovered through the nvim-pi RPC lockfile.
 */
export default async function nvimSplitsAutocomplete(pi: ExtensionAPI) {
  pi.on("session_start", async (_event, ctx) => {
    ctx.ui.addAutocompleteProvider((current) =>
      createNvimSplitsAutocompleteProvider(current, pi, ctx.cwd),
    );
  });
}
