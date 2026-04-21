import { ConfigLoader } from "@aliou/pi-utils-settings";

export interface NvimConfig {
  showConnectionMessages?: boolean;
  follow?: boolean;
}

export interface ResolvedNvimConfig {
  showConnectionMessages: boolean;
  follow: boolean;
}

const DEFAULT_CONFIG: ResolvedNvimConfig = {
  showConnectionMessages: true,
  follow: false,
};

export const configLoader = new ConfigLoader<NvimConfig, ResolvedNvimConfig>(
  "neovim",
  DEFAULT_CONFIG,
  {
    scopes: ["global"],
  },
);
