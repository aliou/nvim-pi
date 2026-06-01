import { ConfigLoader } from "@aliou/pi-utils-settings";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export type NvimFeatureId = "splitsAutocomplete" | "undoTools";

export const NVIM_EXTENSIONS_REQUEST_EVENT =
  "neovim:extensions:request" as const;

export const NVIM_EXTENSIONS_REGISTER_EVENT =
  "neovim:extensions:register" as const;

export const NVIM_CONFIG_UPDATED_EVENT = "neovim:config:updated" as const;

export interface NvimExtensionsRegisterPayload {
  feature: NvimFeatureId;
}

export interface NvimConfigUpdatedPayload {
  config: ResolvedNvimConfig;
}

export interface NvimConfig {
  showConnectionMessages?: boolean;
  splitsAutocomplete?: boolean;
  undoTools?: boolean;
}

export interface ResolvedNvimConfig {
  showConnectionMessages: boolean;
  splitsAutocomplete: boolean;
  undoTools: boolean;
}

const DEFAULT_CONFIG: ResolvedNvimConfig = {
  showConnectionMessages: true,
  splitsAutocomplete: true,
  undoTools: false,
};

export const configLoader = new ConfigLoader<NvimConfig, ResolvedNvimConfig>(
  "neovim",
  DEFAULT_CONFIG,
  {
    scopes: ["global"],
  },
);

export function emitNvimConfigUpdated(pi: ExtensionAPI): void {
  pi.events.emit(NVIM_CONFIG_UPDATED_EVENT, {
    config: configLoader.getConfig(),
  });
}
