import {
  buildSchemaUrl,
  ConfigLoader,
  type Migration,
} from "@aliou/pi-utils-settings";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export type NvimFeatureId = "completion" | "undo";

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

/** Settings for the main Neovim integration extension. */
export interface NvimCoreConfig {
  /** Show Neovim connection status messages in chat. */
  showConnectionMessages?: boolean;
}

/** Settings for the Vim-prefix autocomplete extension. */
export interface CompletionConfig {
  /** Enable autocomplete for open Neovim splits. */
  enabled?: boolean;
}

/** Settings for the persistent undo extension. */
export interface UndoConfig {
  /** Enable edit/write tool wrappers that update Neovim persistent undo files. */
  enabled?: boolean;
}

/** User-facing nvim-pi configuration. */
export interface NvimConfig {
  /** Main Neovim integration settings. */
  nvim?: NvimCoreConfig;
  /** Vim-prefix autocomplete extension settings. */
  completion?: CompletionConfig;
  /** Persistent undo extension settings. */
  undo?: UndoConfig;
}

export interface ResolvedNvimConfig {
  nvim: {
    showConnectionMessages: boolean;
  };
  completion: {
    enabled: boolean;
  };
  undo: {
    enabled: boolean;
  };
}

const DEFAULT_CONFIG: ResolvedNvimConfig = {
  nvim: {
    showConnectionMessages: true,
  },
  completion: {
    enabled: true,
  },
  undo: {
    enabled: false,
  },
};

const schemaUrl = buildSchemaUrl("aliou/nvim-pi", "main", {
  template:
    "https://raw.githubusercontent.com/{packageName}/{version}/{schemaPath}",
});

const migrations: Migration<NvimConfig>[] = [
  {
    name: "nest-nvim-settings",
    shouldRun: (config) =>
      "showConnectionMessages" in
      (config as NvimConfig & { showConnectionMessages?: boolean }),
    run: (config) => {
      const legacy = config as NvimConfig & {
        showConnectionMessages?: boolean;
      };
      const migrated: NvimConfig = {
        ...config,
        nvim: {
          ...config.nvim,
          showConnectionMessages: legacy.showConnectionMessages,
        },
      };
      delete (migrated as NvimConfig & { showConnectionMessages?: boolean })
        .showConnectionMessages;
      return migrated;
    },
  },
];

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
