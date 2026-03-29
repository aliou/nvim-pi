import { ConfigLoader } from "@aliou/pi-utils-settings";

export interface NvimConfig {
  showConnectionMessages?: boolean;
}

export interface ResolvedNvimConfig {
  showConnectionMessages: boolean;
}

const DEFAULT_CONFIG: ResolvedNvimConfig = {
  showConnectionMessages: true,
};

export const configLoader = new ConfigLoader<NvimConfig, ResolvedNvimConfig>(
  "neovim",
  DEFAULT_CONFIG,
  {
    scopes: ["global"],
  },
);
