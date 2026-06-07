import { buildSchemaUrl, ConfigLoader } from "@aliou/pi-utils-settings";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { migrations } from "./migrations";
import {
  DEFAULT_CONFIG,
  NVIM_CONFIG_UPDATED_EVENT,
  type NvimConfig,
  type ResolvedNvimConfig,
} from "./types";

// Re-export everything from sub-modules
export { drainMigrationMessages } from "./migrations";
export {
  type CompletionConfig,
  DEFAULT_CONFIG,
  NVIM_CONFIG_UPDATED_EVENT,
  NVIM_EXTENSIONS_REGISTER_EVENT,
  NVIM_EXTENSIONS_REQUEST_EVENT,
  type NvimConfig,
  type NvimConfigUpdatedPayload,
  type NvimCoreConfig,
  type NvimExtensionsRegisterPayload,
  type NvimFeatureId,
  type ResolvedNvimConfig,
  type UndoConfig,
} from "./types";

// ---------------------------------------------------------------------------
// ConfigLoader
// ---------------------------------------------------------------------------

const schemaUrl = buildSchemaUrl("aliou/nvim-pi", "main", {
  template:
    "https://raw.githubusercontent.com/{packageName}/{version}/{schemaPath}",
});

export const configLoader = new ConfigLoader<NvimConfig, ResolvedNvimConfig>(
  "neovim",
  DEFAULT_CONFIG,
  {
    scopes: ["global"],
    migrations,
    schemaUrl,
  },
);

export function emitNvimConfigUpdated(pi: ExtensionAPI): void {
  pi.events.emit(NVIM_CONFIG_UPDATED_EVENT, {
    config: configLoader.getConfig(),
  });
}
